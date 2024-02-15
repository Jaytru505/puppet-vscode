import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  RevealOutputChannelOn,
  ServerOptions,
} from 'vscode-languageclient/node';

import { IAggregateConfiguration } from './configuration';
import { puppetFileLangID, puppetLangID } from './extension';
import { IPuppetStatusBar } from './feature/PuppetStatusBarFeature';
import { ConnectionStatus } from './interfaces';
import { OutputChannelLogger } from './logging/outputchannel';
import { PuppetCommandStrings, PuppetVersionDetails, PuppetVersionRequest } from './messages';
import { ConnectionType, ProtocolType } from './settings';
import { reporter } from './telemetry';

export abstract class ConnectionHandler {
  private timeSpent: number;

  private _status: ConnectionStatus;
  public get status(): ConnectionStatus {
    return this._status;
  }

  private _languageClient: LanguageClient;
  public get languageClient(): LanguageClient {
    return this._languageClient;
  }

  abstract get connectionType(): ConnectionType;

  public get protocolType(): ProtocolType {
    return this.config.workspace.editorService.protocol;
  }

  protected constructor(
    protected context: vscode.ExtensionContext,
    protected statusBar: IPuppetStatusBar,
    protected logger: OutputChannelLogger,
    protected config: IAggregateConfiguration,
  ) {
    this.timeSpent = Date.now();
    this.setConnectionStatus('Initializing', ConnectionStatus.Initializing);

    const documents = [
      { scheme: 'file', language: puppetLangID },
      { scheme: 'file', language: puppetFileLangID },
    ];

    this.logger.debug('Configuring language client options');
    const clientOptions: LanguageClientOptions = {
      documentSelector: documents,
      outputChannel: this.logger.logChannel,
      revealOutputChannelOn: RevealOutputChannelOn.Info,
    };

    this.logger.debug('Creating server options');
    const serverOptions = this.createServerOptions();

    this.logger.debug('Creating language client');
    this._languageClient = new LanguageClient('PuppetVSCode', serverOptions, clientOptions);
    this._languageClient
      .start()
      .then(
        () => {
          this.languageClient.onTelemetry((event) => {
            const eventName = event.Name ? event.Name : 'PUPPET_LANGUAGESERVER_EVENT';
            reporter.sendTelemetryEvent(eventName, event.Measurements, event.Properties);
          });
          this.setConnectionStatus('Loading Puppet', ConnectionStatus.Starting);
          this.queryLanguageServerStatusWithProgress();
        },
        (reason) => {
          this.setConnectionStatus('Starting error', ConnectionStatus.Starting);
          this.languageClient.error(reason);
          reporter.sendTelemetryException(reason);
        },
      )
      .catch((reason) => {
        this.setConnectionStatus('Failure', ConnectionStatus.Failed);
        reporter.sendTelemetryException(reason);
      });
    this.setConnectionStatus('Initialization Complete', ConnectionStatus.InitializationComplete);

    this.context.subscriptions.push(
      vscode.commands.registerCommand(PuppetCommandStrings.PuppetShowConnectionLogsCommandId, () => {
        this.logger.show();
      }),
    );
  }

  abstract createServerOptions(): ServerOptions;
  abstract cleanup(): void;

  start(): void {
    this.setConnectionStatus('Starting languageserver', ConnectionStatus.Starting, '');
    this.languageClient.start().then(() => {
      this.context.subscriptions.push({
        dispose: () => this.languageClient.stop(),
      });
    });
  }

  stop(): void {
    this.setConnectionStatus('Stopping languageserver', ConnectionStatus.Stopping, '');
    if (this.languageClient !== undefined) {
      this.timeSpent = Date.now() - this.timeSpent;
      this._languageClient.sendRequest(PuppetVersionRequest.type).then((versionDetails) => {
        reporter.sendTelemetryEvent('data', {
          timeSpent: this.timeSpent.toString(),
          puppetVersion: versionDetails.puppetVersion,
          facterVersion: versionDetails.facterVersion,
          languageServerVersion: versionDetails.languageServerVersion,
        });
      });
      this.languageClient.stop();
    }

    this.logger.debug('Running cleanup');
    this.cleanup();
    this.setConnectionStatus('Stopped languageserver', ConnectionStatus.Stopped, '');
  }

  public setConnectionStatus(message: string, status: ConnectionStatus, toolTip?: string) {
    this._status = status;
    this.statusBar.setConnectionStatus(message, status, toolTip);
  }

  private queryLanguageServerStatusWithProgress() {
    return new Promise((resolve, reject) => {
      let count = 0;
      let lastVersionResponse: PuppetVersionDetails;
      const handle = setInterval(() => {
        count++;

        // After 30 seonds timeout the progress
        if (count >= 30 || this._languageClient === undefined) {
          clearInterval(handle);
          this.setConnectionStatus(lastVersionResponse.puppetVersion, ConnectionStatus.RunningLoaded, '');
          resolve(undefined);
          return;
        }

        this._languageClient.sendRequest(PuppetVersionRequest.type).then((versionDetails) => {
          lastVersionResponse = versionDetails;
          if (
            versionDetails.factsLoaded &&
            versionDetails.functionsLoaded &&
            versionDetails.typesLoaded &&
            versionDetails.classesLoaded
          ) {
            clearInterval(handle);
            this.setConnectionStatus(lastVersionResponse.puppetVersion, ConnectionStatus.RunningLoaded, '');
            resolve(undefined);
          } else {
            let toolTip = '';

            toolTip += versionDetails.classesLoaded ? '✔ Classes: Loaded\n' : '⏳ Classes: Loading...\n';
            toolTip += versionDetails.factsLoaded ? '✔ Facts: Loaded\n' : '⏳ Facts: Loading...\n';
            toolTip += versionDetails.functionsLoaded ? '✔ Functions: Loaded\n' : '⏳ Functions: Loading...\n';
            toolTip += versionDetails.typesLoaded ? '✔ Types: Loaded' : '⏳ Types: Loading...';

            this.setConnectionStatus(lastVersionResponse.puppetVersion, ConnectionStatus.RunningLoading, toolTip);
          }
        });
      }, 1000);
    });
  }
}
