/**
 * Common types for Skillfiles extension
 */

export type Scope = 'repo' | 'shared';

export type TargetStatus = 'synced' | 'modified' | 'missing' | 'needs-vars';

export interface AgentProfile {
  vendor: string;
  /** Instruction file paths - not managed by Skillfiles, for reference only */
  instructionPaths: string[];
  /** Folder path where skills are deployed (e.g., '.github/skills') */
  skillFolderPath: string;
  /** Skill file name pattern (e.g., 'SKILL.md') */
  skillFileName: string;
}

/**
 * Compatibility configuration for skills (agentskills.io standard)
 */
export interface CompatibilityConfig {
  /** List of compatible agents */
  agents?: string[];
  /** Minimum agent version requirements */
  minVersions?: Record<string, string>;
  /** Required environment variables */
  envVars?: string[];
}

/**
 * Skill metadata parsed from YAML frontmatter (agentskills.io standard)
 */
export interface SkillMetadata {
  /** Short identifier for the skill */
  name: string;
  /** Description of what the skill does and when to use it */
  description?: string;
  /** License for the skill */
  license?: string;
  /** Compatibility requirements */
  compatibility?: CompatibilityConfig;
  /** Arbitrary key-value metadata */
  metadata?: Record<string, unknown>;
  /** If true, skill won't be automatically applied */
  disableModelInvocation?: boolean;
  /** Skill version */
  version?: string;
}

export interface Target {
  skillName: string;
  repoPath: string;
  scanPath: string;
  agent: string;
  agents?: string[];
  deployPath?: string;
  vars?: Record<string, string>;
}

export interface Skill {
  name: string;
  description?: string;
  scope: Scope;
  category?: string;
  /** Path to the skill folder (contains SKILL.md and optional resources) */
  folderPath: string;
  template?: string;
  registryPath: string;
  defaultVars?: Record<string, string>;
  targets: Target[];
}

export interface Registry {
  registryRoot?: string;
  agentProfiles: Record<string, AgentProfile>;
  skills: Skill[];
  targets?: Target[];
  
  // Scanned repositories (from scan roots)
  scannedRepos?: string[];
  
  // Hierarchical variables (priority: Target > Skill > Category > Agent > Repo > Global)
  globalVars?: Record<string, string>;
  repoVars?: Record<string, Record<string, string>>;    // key: repoPath
  agentVars?: Record<string, Record<string, string>>;   // key: agent name
  categoryVars?: Record<string, Record<string, string>>; // key: category name
}

export interface Meta {
  agent: string;
  version: string;
  lastUpdated: string;
  hash: string;
}

export interface HistoryEntry {
  timestamp: string;
  skillName: string;
  scope: Scope;
}

export interface AuditLogEntry {
  timestamp: string;
  operation: 'push' | 'collect' | 'rollback' | 'import';
  scope: Scope;
  skillName: string;
  target?: string;
  result: 'success' | 'failure' | 'skipped';
  message?: string;
}

export interface ScanRoot {
  key: string;
  path: string;
}

export interface TargetWithStatus extends Target {
  skillName: string;
  status: TargetStatus;
  absoluteRepoPath?: string;
  absoluteDeployPath?: string;
  missingVars?: string[];
}

export interface SkillWithStatus extends Skill {
  targets: TargetWithStatus[];
}
