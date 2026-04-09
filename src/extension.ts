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
import { MakeTarget, DiffchestratorApi } from './types';

const DIFFCHESTRATOR_ID = 'andrevops-com.diffchestrator';

let activeMakefilePath: string | undefined;
let diffchestratorApi: DiffchestratorApi | undefined;

async function getDiffchestratorApi(): Promise<DiffchestratorApi | undefined> {
  const ext = vscode.extensions.getExtension<DiffchestratorApi>(DIFFCHESTRATOR_ID);
  if (!ext) {
    return undefined;
  }
  if (!ext.isActive) {
    try {
      return await ext.activate();
    } catch {
      return undefined;
    }
  }
  return ext.exports;
}

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

  // Register tree views (sidebar + explorer)
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('makestro.targets', targetTree),
    vscode.window.registerTreeDataProvider('makestro.pinnedTargets', pinnedTree),
    vscode.window.registerTreeDataProvider('makestro.explorerTargets', targetTree),
    vscode.window.registerTreeDataProvider('makestro.explorerPinnedTargets', pinnedTree)
  );

  // Register task provider
  context.subscriptions.push(
    vscode.tasks.registerTaskProvider(
      MakestroTaskProvider.type,
      new MakestroTaskProvider(parser, () => diffchestratorApi?.getSelectedRepo())
    )
  );

  // --- Core refresh logic ---

  async function refreshTargets(): Promise<void> {
    const diffRepoPath = diffchestratorApi?.getSelectedRepo();
    const makefilePath = await resolveMakefile(diffRepoPath);

    vscode.commands.executeCommand('setContext', 'makestro.hasMakefile', !!makefilePath);

    if (!makefilePath) {
      targetTree.refresh(undefined);
      vscode.commands.executeCommand('setContext', 'makestro.hasPinnedTargets', false);
      return;
    }

    // Watch external path if Makefile comes from outside workspace
    const isExternal = diffRepoPath && makefilePath.startsWith(diffRepoPath);
    if (isExternal) {
      watcher.watchExternalPath(path.dirname(makefilePath));
    } else {
      watcher.clearExternalWatch();
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

    vscode.commands.executeCommand('setContext', 'makestro.hasPinnedTargets', pinnedNames.length > 0);
  }

  async function resolveMakefile(diffchestratorRepoPath?: string): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('makestro');
    const defaultMakefile = config.get<string>('defaultMakefile', '');

    // Priority 1: explicit user config
    if (defaultMakefile) {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceRoot) {
        const resolved = path.isAbsolute(defaultMakefile)
          ? defaultMakefile
          : path.join(workspaceRoot, defaultMakefile);
        return resolved;
      }
    }

    const scanDepth = config.get<number>('scanDepth', 3);
    const excludePatterns = config.get<string[]>('excludePatterns', []);

    // Priority 2: Diffchestrator selected repo
    if (diffchestratorRepoPath) {
      const makefiles = await discoverMakefiles(diffchestratorRepoPath, scanDepth, excludePatterns);
      if (makefiles.length > 0) {
        const rootMakefile = makefiles.find(
          (m) => path.dirname(m) === diffchestratorRepoPath
        );
        return rootMakefile || makefiles[0];
      }
    }

    // Priority 3: workspace folder auto-discovery
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      return undefined;
    }

    for (const folder of folders) {
      const makefiles = await discoverMakefiles(
        folder.uri.fsPath,
        scanDepth,
        excludePatterns
      );
      if (makefiles.length > 0) {
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
          const scope = vscode.workspace.workspaceFolders
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;
          await config.update('pinnedTargets', pinned, scope);
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

        const scope = vscode.workspace.workspaceFolders
          ? vscode.ConfigurationTarget.Workspace
          : vscode.ConfigurationTarget.Global;
        await config.update('pinnedTargets', updated, scope);
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
      const config = vscode.workspace.getConfiguration('makestro');
      const scanDepth = config.get<number>('scanDepth', 3);
      const excludePatterns = config.get<string[]>('excludePatterns', []);

      const allMakefiles: string[] = [];
      const folders = vscode.workspace.workspaceFolders;

      if (folders) {
        for (const folder of folders) {
          const found = await discoverMakefiles(
            folder.uri.fsPath,
            scanDepth,
            excludePatterns
          );
          allMakefiles.push(...found);
        }
      }

      // Also search Diffchestrator repo
      const diffRepoPath = diffchestratorApi?.getSelectedRepo();
      if (diffRepoPath) {
        const found = await discoverMakefiles(diffRepoPath, scanDepth, excludePatterns);
        for (const m of found) {
          if (!allMakefiles.includes(m)) {
            allMakefiles.push(m);
          }
        }
      }

      if (allMakefiles.length === 0) {
        vscode.window.showInformationMessage(
          'Makestro: No Makefiles found.'
        );
        return;
      }

      const baseDir = folders?.[0]?.uri.fsPath ?? '';
      const items = allMakefiles.map((m) => ({
        label: baseDir ? (path.relative(baseDir, m) || path.basename(m)) : path.basename(m),
        detail: m,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a Makefile...',
      });

      if (picked) {
        const scope = vscode.workspace.workspaceFolders
          ? vscode.ConfigurationTarget.Workspace
          : vscode.ConfigurationTarget.Global;
        await config.update('defaultMakefile', picked.detail, scope);
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

  // --- Diffchestrator integration (optional) ---

  diffchestratorApi = await getDiffchestratorApi();
  if (diffchestratorApi) {
    context.subscriptions.push(
      diffchestratorApi.onDidChangeSelection(async () => {
        await refreshTargets();
      })
    );
  }

  // Handle Diffchestrator activating after Makestro
  context.subscriptions.push(
    vscode.extensions.onDidChange(async () => {
      if (!diffchestratorApi) {
        diffchestratorApi = await getDiffchestratorApi();
        if (diffchestratorApi) {
          context.subscriptions.push(
            diffchestratorApi.onDidChangeSelection(async () => {
              await refreshTargets();
            })
          );
          await refreshTargets();
        }
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
