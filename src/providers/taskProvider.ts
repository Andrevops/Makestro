import * as vscode from 'vscode';
import * as path from 'path';
import { MakefileParser, discoverMakefiles } from '../parser/makefileParser';

export class MakestroTaskProvider implements vscode.TaskProvider {
  static readonly type = 'makestro';

  private parser: MakefileParser;
  private getDiffchestratorRepo: () => string | undefined;

  constructor(parser: MakefileParser, getDiffchestratorRepo?: () => string | undefined) {
    this.parser = parser;
    this.getDiffchestratorRepo = getDiffchestratorRepo ?? (() => undefined);
  }

  async provideTasks(): Promise<vscode.Task[]> {
    const config = vscode.workspace.getConfiguration('makestro');
    const makeCommand = config.get<string>('makeCommand', 'make');
    const scanDepth = config.get<number>('scanDepth', 3);
    const excludePatterns = config.get<string[]>('excludePatterns', []);
    const tasks: vscode.Task[] = [];
    const seen = new Set<string>();

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        const makefiles = await discoverMakefiles(
          folder.uri.fsPath,
          scanDepth,
          excludePatterns
        );

        for (const makefilePath of makefiles) {
          seen.add(makefilePath);
          this.addTasksFromMakefile(makefilePath, makeCommand, folder, tasks);
        }
      }
    }

    // Also include Diffchestrator repo if available
    const diffRepoPath = this.getDiffchestratorRepo();
    if (diffRepoPath) {
      const makefiles = await discoverMakefiles(diffRepoPath, scanDepth, excludePatterns);
      for (const makefilePath of makefiles) {
        if (!seen.has(makefilePath)) {
          this.addTasksFromMakefile(makefilePath, makeCommand, undefined, tasks);
        }
      }
    }

    return tasks;
  }

  private async addTasksFromMakefile(
    makefilePath: string,
    makeCommand: string,
    folder: vscode.WorkspaceFolder | undefined,
    tasks: vscode.Task[]
  ): Promise<void> {
    const result = await this.parser.parse(makefilePath);
    const makefileDir = path.dirname(makefilePath);
    const makefileName = path.basename(makefilePath);

    for (const target of result.targets) {
      let command = makeCommand;
      if (makefileName !== 'Makefile') {
        command += ` -f ${makefileName}`;
      }
      command += ` ${target.name}`;

      const task = new vscode.Task(
        { type: MakestroTaskProvider.type, target: target.name },
        folder ?? vscode.TaskScope.Workspace,
        target.description || `make ${target.name}`,
        'Makestro',
        new vscode.ShellExecution(command, { cwd: makefileDir })
      );

      task.group = vscode.TaskGroup.Build;
      tasks.push(task);
    }
  }

  resolveTask(task: vscode.Task): vscode.Task | undefined {
    const targetName = task.definition.target;
    if (!targetName) {
      return undefined;
    }

    const config = vscode.workspace.getConfiguration('makestro');
    const makeCommand = config.get<string>('makeCommand', 'make');
    const command = `${makeCommand} ${targetName}`;

    return new vscode.Task(
      task.definition,
      task.scope ?? vscode.TaskScope.Workspace,
      task.name,
      'Makestro',
      new vscode.ShellExecution(command)
    );
  }
}
