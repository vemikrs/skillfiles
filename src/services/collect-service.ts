import * as fs from 'fs/promises';
import * as path from 'path';
import type { HistoryManager } from '../core/history-manager.js';
import type { AuditLogStore } from '../core/audit-log-store.js';

/**
 * Parameters for collect operation.
 */
export interface CollectParams {
  skillName: string;
  /** Path to the source skill folder (must contain SKILL.md) */
  sourceFolderPath: string;
  registryRoot: string;
}

/**
 * Result of collect operation.
 */
export interface CollectResult {
  success: boolean;
  /** Path to the skill folder in registry */
  skillFolderPath: string;
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
   * Collect a skill folder from a repository into the registry.
   * Copies the entire folder structure including scripts, references, etc.
   */
  async collect(params: CollectParams): Promise<CollectResult> {
    const { skillName, sourceFolderPath, registryRoot } = params;

    // Validate SKILL.md exists in source folder
    const skillMdPath = path.join(sourceFolderPath, 'SKILL.md');
    try {
      await fs.stat(skillMdPath);
    } catch {
      throw new Error(`SKILL.md not found in ${sourceFolderPath}`);
    }

    // Target folder in registry
    const skillFolderPath = path.join(registryRoot, 'skills', skillName);
    const historyPath = path.join(skillFolderPath, 'history');
    let historyTempPath: string | null = null;

    // Backup existing skill folder to history if present
    try {
      const existingStat = await fs.stat(skillFolderPath);
      if (existingStat.isDirectory()) {
        await this.historyManager.saveFolderSnapshot(skillName, skillFolderPath);
        
        // Preserve history folder by moving it temporarily
        try {
          await fs.stat(historyPath);
          historyTempPath = path.join(registryRoot, 'skills', `.${skillName}-history-temp`);
          await fs.rename(historyPath, historyTempPath);
        } catch {
          // No history folder to preserve
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Remove existing skill folder (history has been moved out)
    await fs.rm(skillFolderPath, { recursive: true, force: true });

    // Copy entire source folder to registry
    await this.copyDirectory(sourceFolderPath, skillFolderPath);

    // Restore history folder if it was preserved
    if (historyTempPath) {
      try {
        await fs.rename(historyTempPath, historyPath);
      } catch {
        // Failed to restore, cleanup temp
        await fs.rm(historyTempPath, { recursive: true, force: true }).catch(() => {});
      }
    }

    // Audit log
    await this.auditLog.append({
      operation: 'collect',
      scope: 'repo',
      skillName,
      target: sourceFolderPath,
      result: 'success'
    });

    return {
      success: true,
      skillFolderPath
    };
  }

  /**
   * Recursively copy a directory.
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      // Skip history directory to avoid copying snapshots
      if (entry.name === 'history') {
        continue;
      }
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}
