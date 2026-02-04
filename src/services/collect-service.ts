import * as fs from 'fs/promises';
import * as path from 'path';
import type { HistoryManager } from '../core/history-manager.js';
import type { AuditLogStore } from '../core/audit-log-store.js';

/**
 * Parameters for collect operation.
 */
export interface CollectParams {
  skillName: string;
  sourcePath: string;
  registryRoot: string;
}

/**
 * Result of collect operation.
 */
export interface CollectResult {
  success: boolean;
  skillPath: string;
}

/**
 * Service for collecting skills from repositories into registry.
 */
export class CollectService {
  constructor(
    private readonly historyManager: HistoryManager,
    private readonly auditLog: AuditLogStore
  ) {}

  /**
   * Collect a skill from a repository into the registry.
   */
  async collect(params: CollectParams): Promise<CollectResult> {
    const { skillName, sourcePath, registryRoot } = params;

    // Read source content
    const content = await fs.readFile(sourcePath, 'utf-8');

    // Target path in registry
    const skillDir = path.join(registryRoot, 'skills', skillName);
    const skillPath = path.join(skillDir, 'skill.md');

    // Save history of existing skill if present
    try {
      const existingContent = await fs.readFile(skillPath, 'utf-8');
      await this.historyManager.saveSnapshot(skillName, existingContent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Create skill directory and write content
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(skillPath, content, 'utf-8');

    // Audit log
    await this.auditLog.append({
      operation: 'collect',
      scope: 'repo',
      skillName,
      target: sourcePath,
      result: 'success'
    });

    return {
      success: true,
      skillPath
    };
  }
}
