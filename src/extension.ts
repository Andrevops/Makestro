import * as vscode from 'vscode';
import * as path from 'path';
import { MakefileParser, discoverMakefiles } from './parser/makefileParser';
import {
  TargetTreeProvider,
  PinnedTargetTreeProvider,
  TargetItem,
} from './providers/treeProvider';
import { MakestroTaskProvider } from './providers/taskProvider';
import { TargetRunner } from './runners/targetRunner';
import { MakefileWatcher } from './watchers/fileWatcher';
import { MakeTarget } from './types';

let activeMakefilePath: string | undefined;

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const config = vscode.workspace.getConfiguration('makestro');
  const parser = new MakefileParser(
    config.get('descriptionCommentPrefix', '##'),
    config.get('sectionCommentPrefix', '###')
  );

  const targetTree = new TargetTreeProvider();
  const pinnedTree = new PinnedTargetTreeProvider();
  const runner = new TargetRunner();
  const watcher = new MakefileWatcher();

  // Register tree views
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('makestro.targets', targetTree),
    vscode.window.registerTreeDataProvider('makestro.pinnedTargets', pinnedTree)
  );

  // Register task provider
  context.subscriptions.push(
    vscode.tasks.registerTaskProvider(
      MakestroTaskProvider.type,
      new MakestroTaskProvider(parser)
    )
  );

  // --- Core refresh logic ---

  async function refreshTargets(): Promise<void> {
    const makefilePath = await resolveMakefile();
    if (!makefilePath) {
      targetTree.refresh(undefined);
      return;
    }

    activeMakefilePath = makefilePath;
    const result = await parser.parse(makefilePath);

    const showPhonyOnly = vscode.workspace
      .getConfiguration('makestro')
      .get<boolean>('showPhonyOnly', false);
    targetTree.setShowPhonyOnly(showPhonyOnly);
    targetTree.refresh(result);

    // Refresh pinned targets
    const pinnedNames = vscode.workspace
      .getConfiguration('makestro')
      .get<string[]>('pinnedTargets', []);
    pinnedTree.refresh(result.targets, pinnedNames);
  }

  async function resolveMakefile(): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('makestro');
    const defaultMakefile = config.get<string>('defaultMakefile', '');

    if (defaultMakefile) {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot) {
        const resolved = path.isAbsolute(defaultMakefile)
          ? defaultMakefile
          : path.join(workspaceRoot, defaultMakefile);
        return resolved;
      }
    }

    // Auto-discover
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      return undefined;
    }

    const scanDepth = config.get<number>('scanDepth', 3);
    const excludePatterns = config.get<string[]>('excludePatterns', []);

    for (const folder of folders) {
      const makefiles = await discoverMakefiles(
        folder.uri.fsPath,
        scanDepth,
        excludePatterns
      );
      if (makefiles.length > 0) {
        // Prefer root Makefile
        const rootMakefile = makefiles.find(
          (m) => path.dirname(m) === folder.uri.fsPath
        );
        return rootMakefile || makefiles[0];
      }
    }

    return undefined;
  }

  // --- Commands ---

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'makestro.runTarget',
      async (item?: TargetItem | MakeTarget) => {
        const target = resolveTarget(item, targetTree);
        if (target) {
          await runner.run(target);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'makestro.runTargetWithArgs',
      async (item?: TargetItem) => {
        const target = resolveTarget(item, targetTree);
        if (!target) {
          return;
        }

        const args = await vscode.window.showInputBox({
          prompt: `Arguments for \`make ${target.name}\``,
          placeHolder: 'e.g., VERBOSE=1 DEBUG=true',
        });

        if (args !== undefined) {
          await runner.run(target, args);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('makestro.quickRun', async () => {
      const targets = targetTree.getAllTargets();
      if (targets.length === 0) {
        vscode.window.showInformationMessage(
          'Makestro: No targets found. Check that a Makefile exists in your workspace.'
        );
        return;
      }

      const items = targets.map((t) => ({
        label: t.name,
        description: t.isPhony ? '(.PHONY)' : '',
        detail: t.description || '',
        target: t,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a target to run...',
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (picked) {
        await runner.run(picked.target);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('makestro.runLastTarget', async () => {
      await runner.rerunLast();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('makestro.stopRunning', () => {
      runner.stop();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('makestro.refresh', async () => {
      await refreshTargets();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'makestro.pinTarget',
      async (item?: TargetItem) => {
        const target = resolveTarget(item, targetTree);
        if (!target) {
          return;
        }

        const config = vscode.workspace.getConfiguration('makestro');
        const pinned = config.get<string[]>('pinnedTargets', []);

        if (!pinned.includes(target.name)) {
          pinned.push(target.name);
          await config.update(
            'pinnedTargets',
            pinned,
            vscode.ConfigurationTarget.Workspace
          );
          await refreshTargets();
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'makestro.unpinTarget',
      async (item?: TargetItem) => {
        const target = resolveTarget(item, targetTree);
        if (!target) {
          return;
        }

        const config = vscode.workspace.getConfiguration('makestro');
        const pinned = config.get<string[]>('pinnedTargets', []);
        const updated = pinned.filter((n) => n !== target.name);

        await config.update(
          'pinnedTargets',
          updated,
          vscode.ConfigurationTarget.Workspace
        );
        await refreshTargets();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('makestro.openMakefile', async () => {
      if (activeMakefilePath) {
        const doc = await vscode.workspace.openTextDocument(activeMakefilePath);
        await vscode.window.showTextDocument(doc);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'makestro.goToTarget',
      async (item?: TargetItem) => {
        const target = resolveTarget(item, targetTree);
        if (!target) {
          return;
        }

        const doc = await vscode.workspace.openTextDocument(
          target.makefilePath
        );
        const editor = await vscode.window.showTextDocument(doc);
        const position = new vscode.Position(target.line - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter
        );
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('makestro.selectMakefile', async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders) {
        return;
      }

      const config = vscode.workspace.getConfiguration('makestro');
      const scanDepth = config.get<number>('scanDepth', 3);
      const excludePatterns = config.get<string[]>('excludePatterns', []);

      const allMakefiles: string[] = [];
      for (const folder of folders) {
        const found = await discoverMakefiles(
          folder.uri.fsPath,
          scanDepth,
          excludePatterns
        );
        allMakefiles.push(...found);
      }

      if (allMakefiles.length === 0) {
        vscode.window.showInformationMessage(
          'Makestro: No Makefiles found in workspace.'
        );
        return;
      }

      const workspaceRoot = folders[0].uri.fsPath;
      const items = allMakefiles.map((m) => ({
        label: path.relative(workspaceRoot, m) || path.basename(m),
        detail: m,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a Makefile...',
      });

      if (picked) {
        await config.update(
          'defaultMakefile',
          picked.detail,
          vscode.ConfigurationTarget.Workspace
        );
        await refreshTargets();
      }
    })
  );

  // --- File watcher ---

  if (config.get<boolean>('autoRefresh', true)) {
    watcher.onDidChange(async () => {
      await refreshTargets();
    });
    context.subscriptions.push(watcher);
  }

  // --- Configuration change listener ---

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('makestro')) {
        await refreshTargets();
      }
    })
  );

  // --- Cleanup ---

  context.subscriptions.push({ dispose: () => runner.dispose() });

  // Initial load
  await refreshTargets();
}

function resolveTarget(
  item: TargetItem | MakeTarget | undefined,
  tree: TargetTreeProvider
): MakeTarget | undefined {
  if (!item) {
    return undefined;
  }

  // Already a MakeTarget
  if ('makefilePath' in item && 'line' in item && typeof item.line === 'number') {
    return item as MakeTarget;
  }

  // TargetItem from tree view
  if (item instanceof TargetItem) {
    return item.target;
  }

  return undefined;
}

export function deactivate(): void {
  // Cleanup handled by subscriptions
}
