import {
  commands,
  Event,
  EventEmitter,
  ProviderResult,
  ThemeIcon,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
} from 'vscode';
import { RequestType0 } from 'vscode-languageclient/node';
import { ConnectionHandler } from '../handler';
import { PuppetVersionDetails } from '../messages';
import { reporter } from '../telemetry';

class PuppetFact extends TreeItem {
  constructor(
    public readonly label: string,
    private value: string,
    public readonly collapsibleState: TreeItemCollapsibleState,
    public readonly children?: Array<[string, PuppetFact]>,
  ) {
    super(label, collapsibleState);
    this.tooltip = `${this.label}-${this.value}`;
    this.description = this.value;
    if (children) {
      this.iconPath = ThemeIcon.Folder;
    } else {
      this.iconPath = ThemeIcon.File;
    }
  }
}

interface PuppetFactResponse {
  facts: string;
  error: string;
}

export class PuppetFactsProvider implements TreeDataProvider<PuppetFact> {
  private elements: Array<[string, PuppetFact]> = [];
  private _onDidChangeTreeData: EventEmitter<PuppetFact | undefined> = new EventEmitter<PuppetFact | undefined>();
  readonly onDidChangeTreeData: Event<PuppetFact | undefined>;

  constructor(protected handler: ConnectionHandler) {
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    commands.registerCommand('puppet.refreshFacts', () => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: PuppetFact): TreeItem | Thenable<PuppetFact> {
    return element;
  }

  getChildren(element?: PuppetFact): Promise<PuppetFact[]> {
    if (element) {
      return Promise.resolve(element.children.map((e) => e[1]));
    } else {
      return this.getFactsFromLanguageServer();
    }
  }

  private async getFactsFromLanguageServer(): Promise<PuppetFact[]> {
    /*
      this is problematic because we both store this and return the value
      but this allows us to cache the info for quick expands of the node.
      if we didn't cache, we would have to call out for each expand and getting
      facts is slow.
    */
    await this.handler.languageClient.start();

    const details = await this.handler.languageClient.sendRequest(
      new RequestType0<PuppetVersionDetails, void>('puppet/getVersion'),
    );
    if (!details.factsLoaded) {
      // language server is ready, but hasn't loaded facts yet
      return new Promise<PuppetFact[]>((resolve) => {
        let count = 0;
        const handle = setInterval(async () => {
          count++;
          if (count >= 60) {
            clearInterval(handle);

            const results = await this.handler.languageClient.sendRequest(
              new RequestType0<PuppetFactResponse, void>('puppet/getFacts'),
            );
            this.elements = this.toList(results.facts);

            if (reporter) {
              reporter.sendTelemetryEvent('puppetFacts');
            }

            resolve(this.elements.map((e) => e[1]));
          }

          const details = await this.handler.languageClient.sendRequest(
            new RequestType0<PuppetVersionDetails, void>('puppet/getVersion'),
          );
          if (details.factsLoaded) {
            clearInterval(handle);

            const results = await this.handler.languageClient.sendRequest(
              new RequestType0<PuppetFactResponse, void>('puppet/getFacts'),
            );
            this.elements = this.toList(results.facts);

            if (reporter) {
              reporter.sendTelemetryEvent('puppetFacts');
            }

            resolve(this.elements.map((e) => e[1]));
          } else {
            // not ready yet
          }
        }, 1000);
      });
    }

    const results = await this.handler.languageClient.sendRequest(
      new RequestType0<PuppetFactResponse, void>('puppet/getFacts'),
    );
    this.elements = this.toList(results.facts);

    if (reporter) {
      reporter.sendTelemetryEvent('puppetFacts');
    }

    return this.elements.map((e) => e[1]);
  }

  getParent?(element: PuppetFact): ProviderResult<PuppetFact> {
    throw new Error('Method not implemented.');
  }

  toList(data: any): Array<[string, PuppetFact]> {
    const things: Array<[string, PuppetFact]> = [];

    for (const key of Object.keys(data)) {
      const value = data[key];
      if (Object.prototype.toString.call(value) === '[object Object]') {
        const children = this.toList(value);
        const item = new PuppetFact(key, value, TreeItemCollapsibleState.Collapsed, children);
        things.push([key, item]);
      } else {
        things.push([key, new PuppetFact(key, value.toString(), TreeItemCollapsibleState.None)]);
      }
    }

    return things;
  }
}
