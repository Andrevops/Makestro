import * as vscode from 'vscode';
import * as path from 'path';
import { MakefileParser, discoverMakefiles } from '../parser/makefileParser';

export class MakestroTaskProvider implements vscode.TaskProvider {
  static readonly type = 'makestro';

  private parser: MakefileParser;

  constructor(parser: MakefileParser) {
    this.parser = parser;
  }

  async provideTasks(): Promise<vscode.Task[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return [];
    }

    const config = vscode.workspace.getConfiguration('makestro');
    const makeCommand = config.get<string>('makeCommand', 'make');
    const scanDepth = config.get<number>('scanDepth', 3);
    const excludePatterns = config.get<string[]>('excludePatterns', []);
    const tasks: vscode.Task[] = [];

    for (const folder of workspaceFolders) {
      const makefiles = await discoverMakefiles(
        folder.uri.fsPath,
        scanDepth,
        excludePatterns
      );

      for (const makefilePath of makefiles) {
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
            folder,
            target.description || `make ${target.name}`,
            'Makestro',
            new vscode.ShellExecution(command, { cwd: makefileDir })
          );

          task.group = vscode.TaskGroup.Build;
          tasks.push(task);
        }
      }
    }

    return tasks;
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
