import * as assert from 'assert';
import { before, teardown } from 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { PuppetStatusBarFeature } from '../../feature/PuppetStatusBarFeature';
import { ConnectionHandler } from '../../handler';
import { StdioConnectionHandler } from '../../handlers/stdio';
import { TcpConnectionHandler } from '../../handlers/tcp';
import { ConnectionStatus } from '../../interfaces';
import { ProtocolType } from '../../settings';
import * as index from './index';

let statusBar: PuppetStatusBarFeature;
let stdioConnectionHandler: StdioConnectionHandler;
let tcpConnectionHandler: TcpConnectionHandler;
let setConnectionStatusSpy: sinon.SinonSpy;
let registerCommandStub: sinon.SinonStub;
let disposableStub: sinon.SinonStubbedInstance<vscode.Disposable>;
let sandbox: sinon.SinonSandbox;

suite('Stdio Handler Tests', () => {

  before(() => {
    sandbox = sinon.createSandbox();
    statusBar = sandbox.createStubInstance(PuppetStatusBarFeature)
    setConnectionStatusSpy = sandbox.spy(ConnectionHandler.prototype, 'setConnectionStatus');
    disposableStub = sandbox.createStubInstance(vscode.Disposable);
    registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand').returns(disposableStub);
  });

  teardown(() => {
    sandbox.restore();
  });

  test('StdioConnectionHandler is created', () => {
    stdioConnectionHandler = new StdioConnectionHandler(index.extContext, statusBar, index.logger, index.configSettings, index.puppetLangID, index.puppetFileLangID);
    assert.notStrictEqual(stdioConnectionHandler, undefined);
    assert.strictEqual(stdioConnectionHandler.connectionType, 1) // ConnectionType local = 1 i.e. local
    assert(setConnectionStatusSpy.calledWith('Initializing', ConnectionStatus.Initializing));
  });

  test('Stdio connection is established', () => {
    assert(stdioConnectionHandler.protocolType, 'stdio');
    assert(setConnectionStatusSpy.calledWith('Initialization Complete', ConnectionStatus.InitializationComplete));
    assert(stdioConnectionHandler.status, 'Initialization Complete');
  });

  test('Generates Server Options', () => {
    const serverOptions = stdioConnectionHandler.createServerOptions();
    assert.notStrictEqual(serverOptions, undefined);
  });
});


suite('TCP Handler Tests', () => {

  before(() => {
    sandbox = sinon.createSandbox();
    index.configSettings.workspace.editorService.protocol = ProtocolType.TCP;
    statusBar = sandbox.createStubInstance(PuppetStatusBarFeature);
    disposableStub = sandbox.createStubInstance(vscode.Disposable);
    registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand').returns(disposableStub);
  });

  teardown(() => {
    sandbox.restore();
  });

  test('TcpConnectionHandler is created', () => {
    tcpConnectionHandler = new TcpConnectionHandler(index.extContext, statusBar, index.logger, index.configSettings, index.puppetLangID, index.puppetFileLangID);
    assert.notStrictEqual(tcpConnectionHandler, undefined);
    assert.strictEqual(tcpConnectionHandler.connectionType, 1) // ConnectionType local = 1 i.e. Local
    assert(setConnectionStatusSpy.calledWith('Initializing', ConnectionStatus.Initializing));
  });

  test('TCP connection is established', () => {
    assert(tcpConnectionHandler.protocolType, 'tcp');
    assert(setConnectionStatusSpy.calledWith('Initialization Complete', ConnectionStatus.InitializationComplete));
    assert(tcpConnectionHandler.status, 'Initialization Complete');
  });

  test('Generates TCP Server Options', () => {
    const serverOptions = tcpConnectionHandler.createServerOptions();
    assert.notStrictEqual(serverOptions, undefined);
  });
});
