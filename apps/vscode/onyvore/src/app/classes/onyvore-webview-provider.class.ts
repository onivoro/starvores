import * as vscode from 'vscode';
import {
  BaseWebviewProvider,
  generateVscodeThemeBridgeInjection,
} from '@onivoro/server-vscode';

export class OnyvoreWebviewProvider extends BaseWebviewProvider {
  public static readonly viewType = 'onyvore.webview';

  constructor(extensionUri: vscode.Uri) {
    super(extensionUri, {
      webviewDistPath: 'webview',
      enableCacheBusting: true,
      allowUnsafeInlineStyles: true,
    });
  }

  protected override getInjectedScripts(nonce: string): string {
    return generateVscodeThemeBridgeInjection(nonce);
  }
}
