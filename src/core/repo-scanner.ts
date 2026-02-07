import * as fs from 'fs/promises';
import * as path from 'path';
import type { ScanRoot, AgentProfile } from './types.js';

/**
 * Discovered repository information.
 */
export interface DiscoveredRepo {
  name: string;
  path: string;
  scanPathKey: string;
}

/**
 * Detected instruction file in a repository (not managed by Skillfiles).
 */
export interface DetectedInstructionFile {
  agent: string;
  path: string;
  type: 'instruction';
}

/**
 * Detected skill folder in a repository (managed by Skillfiles).
 */
export interface DetectedSkillFolder {
  agent: string;
  skillName: string;
  path: string;  // Full path to SKILL.md
  folderPath: string;  // Path to skill folder
  type: 'skill';
}

/**
 * Scanner options.
 */
export interface ScannerOptions {
  scanLimit?: number;
  maxDepth?: number;
  agentProfiles?: Record<string, AgentProfile>;
}

/**
 * Default agent profiles (fallback if not configured).
 */
const DEFAULT_AGENT_PROFILES: Record<string, AgentProfile> = {
  copilot: {
    vendor: 'github',
    instructionPaths: ['.github/copilot-instructions.md', 'AGENTS.md'],
    skillFolderPath: '.github/skills',
    skillFileName: 'SKILL.md'
  },
  claude: {
    vendor: 'anthropic',
    instructionPaths: ['CLAUDE.md'],
    skillFolderPath: '.claude/skills',
    skillFileName: 'SKILL.md'
  },
  cursor: {
    vendor: 'anysphere',
    instructionPaths: ['.cursorrules', '.cursor/rules'],
    skillFolderPath: '.cursor/skills',
    skillFileName: 'SKILL.md'
  },
  windsurf: {
    vendor: 'codeium',
    instructionPaths: ['.windsurfrules', '.windsurf/rules'],
    skillFolderPath: '.windsurf/skills',
    skillFileName: 'SKILL.md'
  },
  gemini: {
    vendor: 'google',
    instructionPaths: ['GEMINI.md', '.gemini/styleguide.md'],
    skillFolderPath: '.gemini/skills',
    skillFileName: 'SKILL.md'
  },
  antigravity: {
    vendor: 'google',
    instructionPaths: ['GEMINI.md', '.gemini/styleguide.md'],
    skillFolderPath: '.gemini/antigravity/skills',
    skillFileName: 'SKILL.md'
  },
  aider: {
    vendor: 'aider',
    instructionPaths: ['CONVENTIONS.md', 'AGENTS.md'],
    skillFolderPath: '.aider/skills',
    skillFileName: 'SKILL.md'
  }
};

/**
 * Scans filesystem for repositories, instruction files, and skill folders.
 */
export class RepoScanner {
  private readonly scanLimit: number;
  private readonly maxDepth: number;
  private readonly agentProfiles: Record<string, AgentProfile>;

  constructor(
    private readonly roots: ScanRoot[],
    options: ScannerOptions = {}
  ) {
    this.scanLimit = options.scanLimit ?? 1000;
    this.maxDepth = options.maxDepth ?? 1;
    this.agentProfiles = options.agentProfiles ?? DEFAULT_AGENT_PROFILES;
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
   * Detect instruction files in a repository (for reference only, not managed).
   */
  async detectInstructionFiles(repoPath: string): Promise<DetectedInstructionFile[]> {
    const found: DetectedInstructionFile[] = [];

    for (const [agent, profile] of Object.entries(this.agentProfiles)) {
      for (const instructionPath of profile.instructionPaths) {
        const fullPath = path.join(repoPath, instructionPath);
        try {
          const stat = await fs.stat(fullPath);
          if (stat.isFile() || stat.isDirectory()) {
            found.push({
              agent,
              path: fullPath,
              type: 'instruction'
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
   * Detect skill folders in a repository (managed by Skillfiles).
   */
  async detectSkillFolders(repoPath: string): Promise<DetectedSkillFolder[]> {
    const found: DetectedSkillFolder[] = [];

    for (const [agent, profile] of Object.entries(this.agentProfiles)) {
      const skillsBasePath = path.join(repoPath, profile.skillFolderPath);
      
      try {
        const stat = await fs.stat(skillsBasePath);
        if (!stat.isDirectory()) {
          continue;
        }

        // Scan skill folders within the skills base path
        const entries = await fs.readdir(skillsBasePath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith('.')) {
            continue;
          }

          const skillName = entry.name;
          const skillFilePath = path.join(skillsBasePath, skillName, profile.skillFileName);
          
          try {
            const skillFileStat = await fs.stat(skillFilePath);
            if (skillFileStat.isFile()) {
              found.push({
                agent,
                skillName,
                path: skillFilePath,
                folderPath: path.join(skillsBasePath, skillName),
                type: 'skill'
              });
            }
          } catch {
            // SKILL.md doesn't exist in this folder
          }
        }
      } catch {
        // Skills folder doesn't exist for this agent
      }
    }

    return found;
  }

  /**
   * @deprecated Use detectSkillFolders instead. This method now proxies to detectInstructionFiles.
   */
  async detectSkillFiles(repoPath: string): Promise<DetectedInstructionFile[]> {
    return this.detectInstructionFiles(repoPath);
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

  /**
   * Get the agent profiles being used.
   */
  getAgentProfiles(): Record<string, AgentProfile> {
    return this.agentProfiles;
  }
}
