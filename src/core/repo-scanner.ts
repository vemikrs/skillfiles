import * as fs from 'fs/promises';
import * as path from 'path';
import type { ScanRoot } from './types.js';

/**
 * Discovered repository information.
 */
export interface DiscoveredRepo {
  name: string;
  path: string;
  scanPathKey: string;
}

/**
 * Detected skill file in a repository.
 */
export interface DetectedSkillFile {
  agent: string;
  path: string;
}

/**
 * Scanner options.
 */
export interface ScannerOptions {
  scanLimit?: number;
  maxDepth?: number;
}

/**
 * Known agent skill file paths.
 */
const KNOWN_SKILL_PATHS: Array<{ agent: string; paths: string[] }> = [
  { agent: 'copilot', paths: ['.github/copilot-instructions.md'] },
  { agent: 'claude', paths: ['.claude/skill.md', 'CLAUDE.md'] },
  { agent: 'cursor', paths: ['.cursor/rules.md', '.cursorrules'] },
  { agent: 'windsurf', paths: ['.windsurfrules'] },
];

/**
 * Scans filesystem for repositories and skill files.
 */
export class RepoScanner {
  private readonly scanLimit: number;
  private readonly maxDepth: number;

  constructor(
    private readonly roots: ScanRoot[],
    options: ScannerOptions = {}
  ) {
    this.scanLimit = options.scanLimit ?? 1000;
    this.maxDepth = options.maxDepth ?? 1;
  }

  /**
   * Scan all configured roots for repositories.
   */
  async scan(): Promise<DiscoveredRepo[]> {
    const repos: DiscoveredRepo[] = [];

    for (const root of this.roots) {
      const discovered = await this.scanDirectory(root.path, root.key, 0);
      repos.push(...discovered);
      
      if (repos.length >= this.scanLimit) {
        return repos.slice(0, this.scanLimit);
      }
    }

    return repos;
  }

  /**
   * Scan a directory for repositories.
   */
  private async scanDirectory(
    dir: string,
    scanPathKey: string,
    depth: number
  ): Promise<DiscoveredRepo[]> {
    const repos: DiscoveredRepo[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden directories (except .git check)
        if (entry.name.startsWith('.')) {
          continue;
        }

        if (!entry.isDirectory()) {
          continue;
        }

        const entryPath = path.join(dir, entry.name);

        // Check if this is a git repository
        const gitPath = path.join(entryPath, '.git');
        try {
          const gitStat = await fs.stat(gitPath);
          if (gitStat.isDirectory()) {
            repos.push({
              name: entry.name,
              path: entryPath,
              scanPathKey
            });
            continue; // Don't recurse into repos
          }
        } catch {
          // Not a git repo, continue scanning if within depth
        }

        // Recurse into subdirectory if within depth limit
        if (depth < this.maxDepth) {
          const subRepos = await this.scanDirectory(entryPath, scanPathKey, depth + 1);
          repos.push(...subRepos);
        }
      }
    } catch {
      // Directory not readable, skip
    }

    return repos;
  }

  /**
   * Detect skill files in a repository.
   */
  async detectSkillFiles(repoPath: string): Promise<DetectedSkillFile[]> {
    const found: DetectedSkillFile[] = [];

    for (const agentConfig of KNOWN_SKILL_PATHS) {
      for (const skillPath of agentConfig.paths) {
        const fullPath = path.join(repoPath, skillPath);
        try {
          const stat = await fs.stat(fullPath);
          if (stat.isFile()) {
            found.push({
              agent: agentConfig.agent,
              path: fullPath
            });
            break; // Found one for this agent, move to next
          }
        } catch {
          // File doesn't exist
        }
      }
    }

    return found;
  }

  /**
   * Check if a path is inside any configured scan root.
   */
  isInsideWorkspace(targetPath: string): boolean {
    const normalizedTarget = path.normalize(targetPath);
    
    for (const root of this.roots) {
      const normalizedRoot = path.normalize(root.path);
      if (normalizedTarget.startsWith(normalizedRoot + path.sep) || 
          normalizedTarget === normalizedRoot) {
        return true;
      }
    }
    
    return false;
  }
}
