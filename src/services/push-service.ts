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
 * Parameters for push operation.
 */
export interface PushParams {
  skillName: string;
  skillPath: string;
  deployPath: string;
  vars: Record<string, string>;
  context: TemplateContext;
}

/**
 * Result of push operation.
 */
export interface PushResult {
  success: boolean;
  expandedContent: string;
  deployPath: string;
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
   * Push a skill to a deployment path.
   */
  async push(params: PushParams): Promise<PushResult> {
    const { skillName, skillPath, deployPath, vars, context } = params;

    // Read skill template
    const template = await fs.readFile(skillPath, 'utf-8');

    // Expand template
    const expandedContent = this.templateEngine.expand(template, vars, context);

    // Save history of existing file if present
    try {
      const existingContent = await fs.readFile(deployPath, 'utf-8');
      await this.historyManager.saveSnapshot(skillName, existingContent);
    } catch (error) {
      // File doesn't exist, no history to save
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Write to deploy path (unless dry run)
    if (!this.dryRun) {
      const dir = path.dirname(deployPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(deployPath, expandedContent, 'utf-8');
    }

    // Audit log
    await this.auditLog.append({
      operation: 'push',
      scope: context.scope ?? 'repo',
      skillName,
      target: deployPath,
      result: 'success'
    });

    return {
      success: true,
      expandedContent,
      deployPath
    };
  }
}
