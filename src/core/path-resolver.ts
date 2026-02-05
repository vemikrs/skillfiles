import * as path from 'path';
import type { Registry, Scope, ScanRoot } from './types.js';
import { ScanPathNotFoundError, AgentProfileNotFoundError } from './errors.js';

/**
 * Resolves various paths used in the Skillfiles system.
 * Handles scanPath, repoPath, deployPath, and scope resolution.
 */
export class PathResolver {
  constructor(
    private readonly registry: Registry,
    private readonly scanRoots: ScanRoot[],
    private readonly registryRoot: string,
    private readonly sharedRoot: string = ''
  ) {}

  /**
   * Resolve a scanPath key to its absolute path.
   * @throws ScanPathNotFoundError if key not found
   */
  resolveScanPath(key: string): string {
    const scanRoot = this.scanRoots.find(sr => sr.key === key);
    if (!scanRoot) {
      throw new ScanPathNotFoundError(`ScanPath key not found: ${key}`);
    }
    return scanRoot.path;
  }

  /**
   * Resolve a repository path relative to its scanPath.
   */
  resolveRepoPath(scanPathKey: string, repoPath: string): string {
    const scanPath = this.resolveScanPath(scanPathKey);
    return path.join(scanPath, repoPath);
  }

  /**
   * Resolve the deployment path for a skill in a repository.
   * Uses agentProfile's skillFolderPath and skillFileName if deployPath is not specified.
   * @throws AgentProfileNotFoundError if agent not found
   */
  resolveDeployPath(repoRoot: string, agent: string, skillName: string, deployPath: string | undefined): string {
    if (deployPath) {
      return path.join(repoRoot, deployPath);
    }
    
    const agentProfile = this.registry.agentProfiles[agent];
    if (!agentProfile) {
      throw new AgentProfileNotFoundError(`Agent profile not found: ${agent}`);
    }
    
    // Construct path: repoRoot / skillFolderPath / skillName / skillFileName
    return path.join(
      repoRoot, 
      agentProfile.skillFolderPath, 
      skillName, 
      agentProfile.skillFileName
    );
  }

  /**
   * Resolve the skill folder path (without file name) for a skill in a repository.
   */
  resolveSkillFolderPath(repoRoot: string, agent: string, skillName: string): string {
    const agentProfile = this.registry.agentProfiles[agent];
    if (!agentProfile) {
      throw new AgentProfileNotFoundError(`Agent profile not found: ${agent}`);
    }
    
    return path.join(repoRoot, agentProfile.skillFolderPath, skillName);
  }

  /**
   * Resolve the root path for a given scope.
   */
  resolveScope(scope: Scope): string {
    return scope === 'shared' ? this.sharedRoot : this.registryRoot;
  }

  /**
   * Resolve the path to a skill.md within registry or shared root.
   */
  resolveSkillPath(skillName: string, scope: Scope): string {
    const root = this.resolveScope(scope);
    return path.join(root, 'skills', skillName, 'skill.md');
  }
}
