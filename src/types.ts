export interface MakeTarget {
  /** Target name as it appears in the Makefile */
  name: string;
  /** Description extracted from comment above the target */
  description?: string;
  /** Dependencies / prerequisites */
  dependencies: string[];
  /** Whether this target is declared in .PHONY */
  isPhony: boolean;
  /** Section this target belongs to (from ### comments) */
  section?: string;
  /** Line number in the Makefile (1-based) */
  line: number;
  /** The Makefile this target was parsed from */
  makefilePath: string;
}

export interface MakeVariable {
  name: string;
  value: string;
  /** Whether this is an immediate (:=) or deferred (=) assignment */
  immediate: boolean;
  line: number;
}

export interface MakeSection {
  name: string;
  line: number;
  targets: MakeTarget[];
}

export interface ParseResult {
  targets: MakeTarget[];
  variables: MakeVariable[];
  sections: MakeSection[];
  phonyTargets: Set<string>;
  makefilePath: string;
}

/** Public API shape exposed by the Diffchestrator extension (optional dependency) */
export interface DiffchestratorApi {
  getCurrentRoot(): string | undefined;
  getSelectedRepo(): string | undefined;
  onDidChangeSelection: import('vscode').Event<void>;
}
