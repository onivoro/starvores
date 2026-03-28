import { Injectable, Inject } from '@nestjs/common';
import {
  WebviewHandler,
  VscodeWorkspaceService,
  VSCODE_API,
  VscodeApi,
} from '@onivoro/server-vscode';
import { ActiveNotebookService } from './active-notebook.service';
import { NotebookDiscoveryService } from './notebook-discovery.service';
import * as path from 'path';

@Injectable()
export class OnyvoreWebviewHandlerService {
  constructor(
    @Inject(VSCODE_API) private readonly vscode: VscodeApi,
    private readonly workspace: VscodeWorkspaceService,
    private readonly activeNotebook: ActiveNotebookService,
    private readonly notebookDiscovery: NotebookDiscoveryService,
  ) {}

  @WebviewHandler('openFile')
  async openFile(params: {
    notebookId: string;
    relativePath: string;
  }): Promise<{ success: boolean }> {
    const notebook = this.notebookDiscovery.getNotebook(params.notebookId);
    if (!notebook) return { success: false };

    const fullPath = path.join(notebook.rootPath, params.relativePath);
    const uri = this.vscode.Uri.file(fullPath);
    const doc = await this.vscode.workspace.openTextDocument(uri);
    await this.vscode.window.showTextDocument(doc);
    return { success: true };
  }

  @WebviewHandler('pickDirectory')
  async pickDirectory(): Promise<{ path: string | null }> {
    const uris = await this.vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Select Directory',
    });

    if (!uris || uris.length === 0) return { path: null };
    return { path: uris[0].fsPath };
  }

  @WebviewHandler('getActiveNotebook')
  getActiveNotebook(): {
    notebookId: string | null;
    activeNotePath: string | null;
  } {
    return {
      notebookId: this.activeNotebook.getActiveNotebookId(),
      activeNotePath: this.activeNotebook.getActiveNotePath(),
    };
  }

  @WebviewHandler('getConfiguration')
  getConfiguration(params: {
    section: string;
    key: string;
  }): { value: unknown } {
    const config = this.workspace.getConfiguration(params.section);
    return { value: config.get(params.key) };
  }

  @WebviewHandler('getWorkspaceFolders')
  getWorkspaceFolders(): { folders: string[] } {
    const folders = this.workspace.workspaceFolders;
    return { folders: folders?.map((f: any) => f.uri.fsPath) ?? [] };
  }
}
