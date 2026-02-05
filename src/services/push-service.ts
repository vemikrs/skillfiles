import * as fs from 'fs/promises';
import * as path from 'path';
import type { HistoryManager } from '../core/history-manager.js';
import type { AuditLogStore } from '../core/audit-log-store.js';
import type { TemplateEngine, TemplateContext } from '../core/template-engine.js';

/**
 * Options for PushService.
 */
export interface PushServiceOptions {
  dryRun?: boolean;
}

/**
 * Parameters for push operation (folder-based).
 */
export interface PushParams {
  skillName: string;
  /** Path to the source skill folder in registry */
  skillFolderPath: string;
  /** Path to deploy folder in repository */
  deployFolderPath: string;
  vars: Record<string, string>;
  context: TemplateContext;
}

/**
 * Result of push operation.
 */
export interface PushResult {
  success: boolean;
  deployFolderPath: string;
  filesCount: number;
}

/**
 * Service for pushing skills from registry to repositories.
 */
export class PushService {
  private readonly dryRun: boolean;

  constructor(
    private readonly historyManager: HistoryManager,
    private readonly auditLog: AuditLogStore,
    private readonly templateEngine: TemplateEngine,
    options: PushServiceOptions = {}
  ) {
    this.dryRun = options.dryRun ?? false;
  }

  /**
   * Push a skill folder to a deployment path.
   * Expands templates in ALL files.
   */
  async push(params: PushParams): Promise<PushResult> {
    const { skillName, skillFolderPath, deployFolderPath, vars, context } = params;

    // Backup existing deploy folder to history if present
    try {
      const existingStat = await fs.stat(deployFolderPath);
      if (existingStat.isDirectory()) {
        await this.historyManager.saveFolderSnapshot(skillName, deployFolderPath);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Remove existing deploy folder (handles deleted resources)
    if (!this.dryRun) {
      await fs.rm(deployFolderPath, { recursive: true, force: true });
    }

    // Copy and expand all files
    const filesCount = await this.copyWithTemplateExpansion(
      skillFolderPath, 
      deployFolderPath, 
      vars, 
      context
    );

    // Audit log
    await this.auditLog.append({
      operation: 'push',
      scope: context.scope ?? 'repo',
      skillName,
      target: deployFolderPath,
      result: 'success'
    });

    return {
      success: true,
      deployFolderPath,
      filesCount
    };
  }

  /**
   * Recursively copy directory with template expansion on all text files.
   */
  private async copyWithTemplateExpansion(
    src: string, 
    dest: string, 
    vars: Record<string, string>,
    context: TemplateContext
  ): Promise<number> {
    if (this.dryRun) {
      return 0;
    }

    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    let filesCount = 0;

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      // Skip history directory
      if (entry.name === 'history') {
        continue;
      }

      if (entry.isDirectory()) {
        filesCount += await this.copyWithTemplateExpansion(srcPath, destPath, vars, context);
      } else {
        // Check if file is text-based (should have template expansion)
        if (this.isTextFile(entry.name)) {
          const template = await fs.readFile(srcPath, 'utf-8');
          const expandedContent = this.templateEngine.expand(template, vars, context);
          await fs.writeFile(destPath, expandedContent, 'utf-8');
        } else {
          // Binary file - copy as-is
          await fs.copyFile(srcPath, destPath);
        }
        filesCount++;
      }
    }

    return filesCount;
  }

  /**
   * Check if a file is text-based and should have template expansion.
   */
  private isTextFile(filename: string): boolean {
    const textExtensions = [
      '.md', '.txt', '.yaml', '.yml', '.json', '.js', '.ts', '.jsx', '.tsx',
      '.py', '.rb', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
      '.html', '.css', '.scss', '.sass', '.less', '.xml', '.svg',
      '.go', '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h', '.hpp',
      '.toml', '.ini', '.cfg', '.conf', '.env', '.properties'
    ];
    
    const ext = path.extname(filename).toLowerCase();
    return textExtensions.includes(ext) || filename.startsWith('.');
  }
}
