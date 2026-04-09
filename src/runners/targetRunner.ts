import * as vscode from 'vscode';
import * as path from 'path';
import { MakeTarget } from '../types';

export class TargetRunner {
  private terminals = new Map<string, vscode.Terminal>();
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
      await this.runInTerminal(command, makefileDir);
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
    for (const terminal of this.terminals.values()) {
      terminal.dispose();
    }
    this.terminals.clear();
  }

  private async runInTerminal(
    command: string,
    cwd: string
  ): Promise<void> {
    // One terminal per repo directory, named after the folder
    let terminal = this.terminals.get(cwd);

    if (!terminal) {
      const repoName = path.basename(cwd);
      terminal = vscode.window.createTerminal({
        name: repoName,
        cwd,
        iconPath: new vscode.ThemeIcon('tools'),
      });

      this.terminals.set(cwd, terminal);

      const disposable = vscode.window.onDidCloseTerminal((t) => {
        if (t === terminal) {
          this.terminals.delete(cwd);
          disposable.dispose();
        }
      });
    }

    terminal.show();
    terminal.sendText(command);
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
