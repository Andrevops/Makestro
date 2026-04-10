import * as vscode from 'vscode';
import { MakeTarget, ParseResult } from '../types';

type TreeElement = SectionItem | TargetItem;

export class TargetTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private parseResult: ParseResult | undefined;
  private showPhonyOnly = false;

  refresh(parseResult?: ParseResult): void {
    if (parseResult) {
      this.parseResult = parseResult;
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  setShowPhonyOnly(value: boolean): void {
    this.showPhonyOnly = value;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeElement): TreeElement[] {
    if (!this.parseResult) {
      return [];
    }

    // Root level
    if (!element) {
      return this.getRootChildren();
    }

    // Section children
    if (element instanceof SectionItem) {
      return this.getTargetItems(element.targets);
    }

    return [];
  }

  private getRootChildren(): TreeElement[] {
    const result = this.parseResult!;
    const filteredTargets = this.filterTargets(result.targets);

    // If there are sections, group by section
    if (result.sections.length > 0) {
      const items: TreeElement[] = [];

      // Targets without a section go first as "Ungrouped"
      const ungrouped = filteredTargets.filter((t) => !t.section);
      if (ungrouped.length > 0) {
        items.push(new SectionItem('General', ungrouped));
      }

      // Then each section
      for (const section of result.sections) {
        const sectionTargets = filteredTargets.filter(
          (t) => t.section === section.name
        );
        if (sectionTargets.length > 0) {
          items.push(new SectionItem(section.name, sectionTargets));
        }
      }

      return items;
    }

    // No sections — flat list of targets
    return this.getTargetItems(filteredTargets);
  }

  private filterTargets(targets: MakeTarget[]): MakeTarget[] {
    if (this.showPhonyOnly) {
      return targets.filter((t) => t.isPhony);
    }
    return targets;
  }

  private getTargetItems(targets: MakeTarget[]): TargetItem[] {
    return targets.map((t) => new TargetItem(t));
  }

  getTarget(name: string): MakeTarget | undefined {
    return this.parseResult?.targets.find((t) => t.name === name);
  }

  getAllTargets(): MakeTarget[] {
    return this.parseResult?.targets ?? [];
  }
}

export class PinnedTargetTreeProvider implements vscode.TreeDataProvider<TargetItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TargetItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private targets: MakeTarget[] = [];

  refresh(allTargets: MakeTarget[], pinnedNames: string[]): void {
    this.targets = pinnedNames
      .map((name) => allTargets.find((t) => t.name === name))
      .filter((t): t is MakeTarget => t !== undefined);
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TargetItem): vscode.TreeItem {
    return element;
  }

  getChildren(): TargetItem[] {
    return this.targets.map((t) => new TargetItem(t));
  }

  getByIndex(index: number): MakeTarget | undefined {
    return this.targets[index];
  }
}

class SectionItem extends vscode.TreeItem {
  targets: MakeTarget[];

  constructor(name: string, targets: MakeTarget[]) {
    super(name, vscode.TreeItemCollapsibleState.Expanded);
    this.targets = targets;
    this.iconPath = new vscode.ThemeIcon('symbol-folder');
    this.contextValue = 'section';
    this.description = `${targets.length} target${targets.length !== 1 ? 's' : ''}`;
  }
}

export class TargetItem extends vscode.TreeItem {
  target: MakeTarget;

  constructor(target: MakeTarget) {
    super(target.name, vscode.TreeItemCollapsibleState.None);
    this.target = target;
    this.contextValue = 'target';
    this.description = target.description || '';
    this.tooltip = this.buildTooltip(target);
    this.iconPath = target.isPhony
      ? new vscode.ThemeIcon('symbol-event')
      : new vscode.ThemeIcon('symbol-file');

    this.command = {
      command: 'makestro.runTarget',
      title: 'Run Target',
      arguments: [this],
    };
  }

  private buildTooltip(target: MakeTarget): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**\`make ${target.name}\`**\n\n`);
    if (target.description) {
      md.appendMarkdown(`${target.description}\n\n`);
    }
    if (target.dependencies.length > 0) {
      md.appendMarkdown(
        `**Depends on:** ${target.dependencies.map((d) => `\`${d}\``).join(', ')}\n\n`
      );
    }
    if (target.isPhony) {
      md.appendMarkdown(`*(.PHONY)*\n\n`);
    }
    md.appendMarkdown(
      `*${target.makefilePath}:${target.line}*`
    );
    return md;
  }
}
