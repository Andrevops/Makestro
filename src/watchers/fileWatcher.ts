import * as vscode from 'vscode';

export class MakefileWatcher implements vscode.Disposable {
  private watcher: vscode.FileSystemWatcher;
  private debounceTimer: NodeJS.Timeout | undefined;
  private readonly debounceMs = 500;

  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor() {
    this.watcher = vscode.workspace.createFileSystemWatcher(
      '**/{Makefile,makefile,GNUmakefile,*.mk}'
    );

    this.watcher.onDidChange((uri) => this.handleChange(uri));
    this.watcher.onDidCreate((uri) => this.handleChange(uri));
    this.watcher.onDidDelete((uri) => this.handleChange(uri));
  }

  private handleChange(uri: vscode.Uri): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this._onDidChange.fire(uri);
    }, this.debounceMs);
  }

  dispose(): void {
    this.watcher.dispose();
    this._onDidChange.dispose();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }
}
