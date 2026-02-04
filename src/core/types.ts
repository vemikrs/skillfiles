/**
 * Common types for Skillfiles extension
 */

export type Scope = 'repo' | 'shared';

export type TargetStatus = 'synced' | 'modified' | 'missing' | 'needs-vars';

export interface AgentProfile {
  vendor: string;
  defaultDeployPath: string;
}

export interface Target {
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
  registryPath: string;
  defaultVars?: Record<string, string>;
  targets: Target[];
}

export interface Registry {
  agentProfiles: Record<string, AgentProfile>;
  skills: Skill[];
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
  status: TargetStatus;
  absoluteRepoPath?: string;
  absoluteDeployPath?: string;
  missingVars?: string[];
}

export interface SkillWithStatus extends Skill {
  targets: TargetWithStatus[];
}
