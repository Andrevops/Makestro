import * as vscode from 'vscode';
import * as path from 'path';
import { MakeTarget } from '../types';

export class TargetRunner {
  private activeTerminal: vscode.Terminal | undefined;
  private terminalClosed = false;
  private lastTarget: { target: MakeTarget; args?: string } | undefined;

  async run(target: MakeTarget, args?: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('makestro');
    const makeCommand = config.get<string>('makeCommand', 'make');
    const useTerminal = config.get<boolean>('runInIntegratedTerminal', true);

    const makefileDir = path.dirname(target.makefilePath);
    const makefileName = path.basename(target.makefilePath);

    // Build the command
    let command = makeCommand;

    // Only add -f flag if not the default name "Makefile"
    if (makefileName !== 'Makefile') {
      command += ` -f ${makefileName}`;
    }

    command += ` ${target.name}`;

    if (args) {
      command += ` ${args}`;
    }

    this.lastTarget = { target, args };

    if (useTerminal) {
      await this.runInTerminal(command, makefileDir, target.name);
    } else {
      await this.runInOutputChannel(command, makefileDir, target.name);
    }
  }

  async rerunLast(): Promise<boolean> {
    if (!this.lastTarget) {
      vscode.window.showInformationMessage('Makestro: No previous target to re-run.');
      return false;
    }
    await this.run(this.lastTarget.target, this.lastTarget.args);
    return true;
  }

  stop(): void {
    if (this.activeTerminal) {
      this.activeTerminal.dispose();
      this.activeTerminal = undefined;
    }
  }

  private async runInTerminal(
    command: string,
    cwd: string,
    _targetName: string
  ): Promise<void> {
    // Reuse existing Makestro terminal or create a new one
    if (!this.activeTerminal || this.terminalClosed) {
      this.activeTerminal = vscode.window.createTerminal({
        name: 'Makestro',
        cwd,
        iconPath: new vscode.ThemeIcon('tools'),
      });
      this.terminalClosed = false;

      const disposable = vscode.window.onDidCloseTerminal((t) => {
        if (t === this.activeTerminal) {
          this.activeTerminal = undefined;
          this.terminalClosed = true;
          disposable.dispose();
        }
      });
    }

    this.activeTerminal.show();
    this.activeTerminal.sendText(command);
  }

  private async runInOutputChannel(
    command: string,
    cwd: string,
    targetName: string
  ): Promise<void> {
    const task = new vscode.Task(
      { type: 'makestro', target: targetName },
      vscode.TaskScope.Workspace,
      `make ${targetName}`,
      'Makestro',
      new vscode.ShellExecution(command, { cwd })
    );

    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Shared,
      clear: true,
    };

    await vscode.tasks.executeTask(task);
  }

  dispose(): void {
    this.stop();
  }
}
