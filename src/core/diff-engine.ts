import type { TargetStatus } from './types.js';

/**
 * Represents a diff hunk (a contiguous changed region).
 */
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

/**
 * Statistics about the diff.
 */
export interface DiffStats {
  additions: number;
  deletions: number;
}

/**
 * Result of computing a diff between two contents.
 */
export interface DiffResult {
  hasChanges: boolean;
  hunks: DiffHunk[];
  stats: DiffStats;
}

/**
 * Input for computing target status.
 */
export interface StatusInput {
  registryHash: string;
  repoHash: string | null;
  repoFileExists: boolean;
  needsVars: boolean;
}

/**
 * Engine for computing diffs and determining sync status.
 */
export class DiffEngine {
  /**
   * Compute a unified diff between original and modified content.
   */
  computeDiff(original: string, modified: string): DiffResult {
    if (original === modified) {
      return {
        hasChanges: false,
        hunks: [],
        stats: { additions: 0, deletions: 0 }
      };
    }

    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    
    // Simple line-by-line diff
    const hunks: DiffHunk[] = [];
    const diffLines: string[] = [];
    let additions = 0;
    let deletions = 0;

    // Use a simple LCS-based approach for now
    const changes = this.computeLineChanges(originalLines, modifiedLines);
    
    for (const change of changes) {
      if (change.type === 'add') {
        diffLines.push(`+${change.line}`);
        additions++;
      } else if (change.type === 'remove') {
        diffLines.push(`-${change.line}`);
        deletions++;
      } else {
        diffLines.push(` ${change.line}`);
      }
    }

    if (diffLines.length > 0) {
      hunks.push({
        oldStart: 1,
        oldLines: originalLines.length,
        newStart: 1,
        newLines: modifiedLines.length,
        lines: diffLines
      });
    }

    return {
      hasChanges: true,
      hunks,
      stats: { additions, deletions }
    };
  }

  /**
   * Compute the sync status of a target.
   */
  computeStatus(input: StatusInput): TargetStatus {
    // needs-vars takes highest priority
    if (input.needsVars) {
      return 'needs-vars';
    }

    // File doesn't exist in repo
    if (!input.repoFileExists) {
      return 'missing';
    }

    // Compare hashes
    if (input.registryHash === input.repoHash) {
      return 'synced';
    }

    return 'modified';
  }

  /**
   * Compute line changes using simple set-based approach.
   * For a more accurate diff, consider using a proper LCS algorithm.
   */
  private computeLineChanges(
    original: string[],
    modified: string[]
  ): Array<{ type: 'add' | 'remove' | 'same'; line: string }> {
    const changes: Array<{ type: 'add' | 'remove' | 'same'; line: string }> = [];
    
    // Track which lines from modified have been matched
    const modifiedUsed = new Array(modified.length).fill(false);
    
    // First pass: find matching lines
    const matches: Array<{ origIdx: number; modIdx: number }> = [];
    let lastModIdx = -1;
    
    for (let i = 0; i < original.length; i++) {
      for (let j = lastModIdx + 1; j < modified.length; j++) {
        if (original[i] === modified[j] && !modifiedUsed[j]) {
          matches.push({ origIdx: i, modIdx: j });
          modifiedUsed[j] = true;
          lastModIdx = j;
          break;
        }
      }
    }
    
    // Build change list
    let origPtr = 0;
    let modPtr = 0;
    let matchIdx = 0;
    
    while (origPtr < original.length || modPtr < modified.length) {
      if (matchIdx < matches.length) {
        const match = matches[matchIdx];
        
        // Add deletions before match
        while (origPtr < match.origIdx) {
          changes.push({ type: 'remove', line: original[origPtr] });
          origPtr++;
        }
        
        // Add insertions before match
        while (modPtr < match.modIdx) {
          changes.push({ type: 'add', line: modified[modPtr] });
          modPtr++;
        }
        
        // Add the matching line
        changes.push({ type: 'same', line: original[origPtr] });
        origPtr++;
        modPtr++;
        matchIdx++;
      } else {
        // No more matches - remaining lines are deletions/additions
        while (origPtr < original.length) {
          changes.push({ type: 'remove', line: original[origPtr] });
          origPtr++;
        }
        while (modPtr < modified.length) {
          changes.push({ type: 'add', line: modified[modPtr] });
          modPtr++;
        }
      }
    }
    
    return changes;
  }
}
