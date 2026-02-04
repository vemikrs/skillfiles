import * as fs from 'fs/promises';
import * as path from 'path';
import type { HistoryManager } from '../core/history-manager.js';
import type { AuditLogStore } from '../core/audit-log-store.js';

/**
 * Parameters for rollback operation.
 */
export interface RollbackParams {
  skillName: string;
  snapshotId: string;
  registryRoot: string;
}

/**
 * Result of rollback operation.
 */
export interface RollbackResult {
  success: boolean;
  restoredContent: string;
}

/**
 * Service for rolling back skills to previous versions.
 */
export class RollbackService {
  constructor(
    private readonly historyManager: HistoryManager,
    private readonly auditLog: AuditLogStore
  ) {}

  /**
   * Rollback a skill to a previous snapshot.
   */
  async rollback(params: RollbackParams): Promise<RollbackResult> {
    const { skillName, snapshotId, registryRoot } = params;

    const skillPath = path.join(registryRoot, 'skills', skillName, 'skill.md');

    // Save current content as new snapshot (for recovery if needed)
    try {
      const currentContent = await fs.readFile(skillPath, 'utf-8');
      await this.historyManager.saveSnapshot(skillName, currentContent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Restore content from snapshot
    const restoredContent = await this.historyManager.restoreSnapshot(skillName, snapshotId);

    // Write restored content
    await fs.writeFile(skillPath, restoredContent, 'utf-8');

    // Audit log
    await this.auditLog.append({
      operation: 'rollback',
      scope: 'repo',
      skillName,
      target: snapshotId,
      result: 'success'
    });

    return {
      success: true,
      restoredContent
    };
  }
}
