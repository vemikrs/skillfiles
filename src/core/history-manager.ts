import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Snapshot metadata stored with each history entry.
 */
export interface SnapshotMetadata {
  timestamp: string;
  skillName: string;
}

/**
 * Snapshot entry returned by listSnapshots.
 */
export interface SnapshotEntry {
  id: string;
  timestamp: string;
  content: string;
}

/**
 * Manages skill.md history snapshots for rollback capability.
 */
export class HistoryManager {
  constructor(
    private readonly registryRoot: string,
    private readonly retentionCount: number = 50
  ) {}

  /**
   * Save a snapshot of skill content.
   * Returns the path to the snapshot directory.
   */
  async saveSnapshot(skillName: string, content: string): Promise<string> {
    // Add random suffix for uniqueness (prevents same-millisecond conflicts)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const snapshotDir = this.getSnapshotDir(skillName, `${timestamp}-${randomSuffix}`);
    
    await fs.mkdir(snapshotDir, { recursive: true });
    
    // Save skill content
    await fs.writeFile(path.join(snapshotDir, 'skill.md'), content, 'utf-8');
    
    // Save metadata
    const metadata: SnapshotMetadata = {
      timestamp: new Date().toISOString(),
      skillName
    };
    await fs.writeFile(
      path.join(snapshotDir, 'metadata.yaml'),
      yaml.dump(metadata),
      'utf-8'
    );
    
    return snapshotDir;
  }

  /**
   * List all snapshots for a skill, sorted by timestamp descending.
   */
  async listSnapshots(skillName: string): Promise<SnapshotEntry[]> {
    const historyDir = this.getHistoryDir(skillName);
    
    try {
      const entries = await fs.readdir(historyDir);
      const snapshots: SnapshotEntry[] = [];
      
      for (const entry of entries) {
        const snapshotDir = path.join(historyDir, entry);
        const stat = await fs.stat(snapshotDir);
        
        if (stat.isDirectory()) {
          try {
            const content = await fs.readFile(
              path.join(snapshotDir, 'skill.md'),
              'utf-8'
            );
            const metadataContent = await fs.readFile(
              path.join(snapshotDir, 'metadata.yaml'),
              'utf-8'
            );
            const metadata = yaml.load(metadataContent) as SnapshotMetadata;
            
            snapshots.push({
              id: entry,
              timestamp: metadata.timestamp,
              content
            });
          } catch {
            // Skip invalid snapshot directories
          }
        }
      }
      
      // Sort by timestamp descending (newest first)
      return snapshots.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Restore skill content from a snapshot.
   */
  async restoreSnapshot(skillName: string, snapshotId: string): Promise<string> {
    const snapshotDir = path.join(this.getHistoryDir(skillName), snapshotId);
    const content = await fs.readFile(
      path.join(snapshotDir, 'skill.md'),
      'utf-8'
    );
    return content;
  }

  /**
   * Remove old snapshots, keeping only the most recent N.
   */
  async pruneOldSnapshots(skillName: string): Promise<void> {
    const snapshots = await this.listSnapshots(skillName);
    
    if (snapshots.length <= this.retentionCount) {
      return;
    }
    
    const toDelete = snapshots.slice(this.retentionCount);
    
    for (const snapshot of toDelete) {
      const snapshotDir = path.join(this.getHistoryDir(skillName), snapshot.id);
      await fs.rm(snapshotDir, { recursive: true, force: true });
    }
  }

  private getHistoryDir(skillName: string): string {
    return path.join(this.registryRoot, 'skills', skillName, 'history');
  }

  private getSnapshotDir(skillName: string, timestamp: string): string {
    return path.join(this.getHistoryDir(skillName), timestamp);
  }
}
