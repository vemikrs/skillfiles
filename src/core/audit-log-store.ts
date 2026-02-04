import * as fs from 'fs/promises';
import * as path from 'path';
import type { AuditLogEntry } from './types.js';

/**
 * Manages audit log entries for tracking operations.
 */
export class AuditLogStore {
  private readonly logPath: string;

  constructor(
    registryRoot: string,
    private readonly retentionDays: number = 90
  ) {
    this.logPath = path.join(registryRoot, 'audit.log');
  }

  /**
   * Append an entry to the audit log.
   * Automatically adds timestamp.
   */
  async append(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
    const dir = path.dirname(this.logPath);
    await fs.mkdir(dir, { recursive: true });
    
    const fullEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    };
    
    const line = JSON.stringify(fullEntry) + '\n';
    await fs.appendFile(this.logPath, line, 'utf-8');
  }

  /**
   * Read all audit log entries.
   */
  async readAll(): Promise<AuditLogEntry[]> {
    try {
      const content = await fs.readFile(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      return lines.map(line => JSON.parse(line) as AuditLogEntry);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Delete log entries older than retention period.
   */
  async purgeOldLogs(): Promise<void> {
    const entries = await this.readAll();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
    
    const recentEntries = entries.filter(entry => 
      new Date(entry.timestamp) > cutoffDate
    );
    
    if (recentEntries.length === entries.length) {
      return; // Nothing to purge
    }
    
    if (recentEntries.length === 0) {
      // Delete the file entirely
      try {
        await fs.unlink(this.logPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    } else {
      // Rewrite with only recent entries
      const content = recentEntries.map(e => JSON.stringify(e)).join('\n') + '\n';
      await fs.writeFile(this.logPath, content, 'utf-8');
    }
  }
}
