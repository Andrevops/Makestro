import * as path from 'path';
import * as fs from 'fs';
import { MakeTarget, MakeVariable, MakeSection, ParseResult } from '../types';

const SPECIAL_TARGETS = new Set([
  '.DEFAULT',
  '.SUFFIXES',
  '.PRECIOUS',
  '.INTERMEDIATE',
  '.SECONDARY',
  '.SECONDEXPANSION',
  '.DELETE_ON_ERROR',
  '.IGNORE',
  '.LOW_RESOLUTION_TIME',
  '.SILENT',
  '.EXPORT_ALL_VARIABLES',
  '.NOTPARALLEL',
  '.ONESHELL',
  '.POSIX',
  '.PHONY',
]);

export class MakefileParser {
  private descriptionPrefix: string;
  private sectionPrefix: string;

  constructor(descriptionPrefix = '##', sectionPrefix = '###') {
    this.descriptionPrefix = descriptionPrefix;
    this.sectionPrefix = sectionPrefix;
  }

  async parse(makefilePath: string): Promise<ParseResult> {
    const content = await fs.promises.readFile(makefilePath, 'utf-8');
    return this.parseContent(content, makefilePath);
  }

  parseContent(content: string, makefilePath: string): ParseResult {
    const lines = content.split('\n');
    const targets: MakeTarget[] = [];
    const variables: MakeVariable[] = [];
    const sections: MakeSection[] = [];
    const phonyTargets = new Set<string>();
    const seenTargets = new Set<string>();

    let currentSection: MakeSection | undefined;
    let pendingDescription: string | undefined;
    let pendingDescriptionLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      // Skip empty lines (but clear pending description if there's a gap)
      if (trimmed === '') {
        if (pendingDescriptionLines.length > 0) {
          pendingDescriptionLines = [];
          pendingDescription = undefined;
        }
        continue;
      }

      // Section comment: ### Section Name
      if (trimmed.startsWith(this.sectionPrefix + ' ')) {
        const sectionName = trimmed.slice(this.sectionPrefix.length).trim();
        currentSection = { name: sectionName, line: lineNum, targets: [] };
        sections.push(currentSection);
        pendingDescriptionLines = [];
        pendingDescription = undefined;
        continue;
      }

      // Description comment: ## Description text
      // Must check this AFTER section prefix (### is longer than ##)
      if (
        trimmed.startsWith(this.descriptionPrefix + ' ') &&
        !trimmed.startsWith(this.sectionPrefix)
      ) {
        const desc = trimmed.slice(this.descriptionPrefix.length).trim();
        pendingDescriptionLines.push(desc);
        pendingDescription = pendingDescriptionLines.join(' ');
        continue;
      }

      // Regular comment — not a description or section
      if (trimmed.startsWith('#')) {
        continue;
      }

      // .PHONY declaration
      if (trimmed.startsWith('.PHONY')) {
        const match = trimmed.match(/^\.PHONY\s*:\s*(.+)/);
        if (match) {
          const names = match[1].split(/\s+/).filter(Boolean);
          for (const name of names) {
            phonyTargets.add(name);
          }
        }
        pendingDescriptionLines = [];
        pendingDescription = undefined;
        continue;
      }

      // Variable assignment: VAR = value, VAR := value, VAR ?= value, VAR += value
      const varMatch = trimmed.match(
        /^([A-Za-z_][A-Za-z0-9_]*)\s*(:=|\?=|\+=|=)\s*(.*)/
      );
      if (varMatch && !trimmed.includes('\t')) {
        variables.push({
          name: varMatch[1],
          value: varMatch[3],
          immediate: varMatch[2] === ':=',
          line: lineNum,
        });
        pendingDescriptionLines = [];
        pendingDescription = undefined;
        continue;
      }

      // Target rule: target: [dependencies]
      // Must start at column 0 (no leading whitespace) and contain a colon
      const targetMatch = line.match(
        /^([a-zA-Z0-9_][a-zA-Z0-9_./%-]*)\s*:((?!=).*)/
      );
      if (targetMatch) {
        const targetName = targetMatch[1];
        const depsStr = targetMatch[2].trim();

        // Skip special targets
        if (SPECIAL_TARGETS.has(targetName)) {
          pendingDescriptionLines = [];
          pendingDescription = undefined;
          continue;
        }

        // Skip pattern rules (contain %)
        if (targetName.includes('%')) {
          pendingDescriptionLines = [];
          pendingDescription = undefined;
          continue;
        }

        // Skip target-specific variable assignments (e.g. target: VAR?=value)
        if (/^[A-Za-z_][A-Za-z0-9_]*\s*(\?=|:=|\+=|=)/.test(depsStr)) {
          continue;
        }

        // Deduplicate: skip if we already have this target
        if (seenTargets.has(targetName)) {
          pendingDescriptionLines = [];
          pendingDescription = undefined;
          continue;
        }

        const dependencies = depsStr
          ? depsStr
              .split(/\s+/)
              .filter((d) => d && !d.startsWith('#') && !d.startsWith('|'))
          : [];

        const target: MakeTarget = {
          name: targetName,
          description: pendingDescription,
          dependencies,
          isPhony: phonyTargets.has(targetName),
          section: currentSection?.name,
          line: lineNum,
          makefilePath,
        };

        targets.push(target);
        seenTargets.add(targetName);
        currentSection?.targets.push(target);

        pendingDescriptionLines = [];
        pendingDescription = undefined;
        continue;
      }

      // Recipe line (starts with tab) or anything else — skip
      pendingDescriptionLines = [];
      pendingDescription = undefined;
    }

    // Second pass: mark phony targets that were declared after their target definition
    for (const target of targets) {
      if (phonyTargets.has(target.name)) {
        target.isPhony = true;
      }
    }

    return { targets, variables, sections, phonyTargets, makefilePath };
  }
}

/**
 * Discover Makefiles in a workspace directory.
 */
export async function discoverMakefiles(
  rootPath: string,
  maxDepth: number,
  excludePatterns: string[]
): Promise<string[]> {
  const makefileNames = ['Makefile', 'makefile', 'GNUmakefile'];
  const results: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isFile() && makefileNames.includes(entry.name)) {
        results.push(fullPath);
      }

      if (entry.isDirectory()) {
        // Check exclude patterns (simple glob matching)
        const shouldExclude = excludePatterns.some((pattern) => {
          const cleanPattern = pattern.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\//g, '');
          return entry.name === cleanPattern;
        });

        if (!shouldExclude) {
          await walk(fullPath, depth + 1);
        }
      }
    }
  }

  await walk(rootPath, 0);
  return results;
}
