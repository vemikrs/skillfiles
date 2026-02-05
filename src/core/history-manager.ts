import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Snapshot metadata stored with each history entry.
 */
export interface SnapshotMetadata {
  timestamp: string;
  skillName: string;
  type: 'file' | 'folder';
}

/**
 * Snapshot entry returned by listSnapshots.
 */
export interface SnapshotEntry {
  id: string;
  timestamp: string;
  content: string;  // For file snapshots, SKILL.md content. For folder snapshots, manifest.
  type: 'file' | 'folder';
}

/**
 * Manages skill history snapshots for rollback capability.
 * Supports both single-file (legacy) and folder-level snapshots.
 */
export class HistoryManager {
  constructor(
    private readonly registryRoot: string,
    private readonly retentionCount: number = 50
  ) {}

  /**
   * Save a snapshot of skill content (single file - legacy).
   * Returns the path to the snapshot directory.
   */
  async saveSnapshot(skillName: string, content: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const snapshotDir = this.getSnapshotDir(skillName, `${timestamp}-${randomSuffix}`);
    
    await fs.mkdir(snapshotDir, { recursive: true });
    
    // Save skill content
    await fs.writeFile(path.join(snapshotDir, 'skill.md'), content, 'utf-8');
    
    // Save metadata
    const metadata: SnapshotMetadata = {
      timestamp: new Date().toISOString(),
      skillName,
      type: 'file'
    };
    await fs.writeFile(
      path.join(snapshotDir, 'metadata.yaml'),
      yaml.dump(metadata),
      'utf-8'
    );
    
    return snapshotDir;
  }

  /**
   * Save a snapshot of an entire skill folder.
   * Recursively copies all files and directories.
   */
  async saveFolderSnapshot(skillName: string, folderPath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const snapshotDir = this.getSnapshotDir(skillName, `${timestamp}-${randomSuffix}`);
    const contentDir = path.join(snapshotDir, 'content');
    
    await fs.mkdir(contentDir, { recursive: true });
    
    // Recursively copy folder contents
    await this.copyDirectory(folderPath, contentDir);
    
    // Save metadata
    const metadata: SnapshotMetadata = {
      timestamp: new Date().toISOString(),
      skillName,
      type: 'folder'
    };
    await fs.writeFile(
      path.join(snapshotDir, 'metadata.yaml'),
      yaml.dump(metadata),
      'utf-8'
    );
    
    return snapshotDir;
  }

  /**
   * Restore a folder snapshot to the target path.
   */
  async restoreFolderSnapshot(skillName: string, snapshotId: string, targetPath: string): Promise<void> {
    const snapshotDir = path.join(this.getHistoryDir(skillName), snapshotId);
    const contentDir = path.join(snapshotDir, 'content');
    
    // Check if this is a folder snapshot
    try {
      await fs.stat(contentDir);
    } catch {
      throw new Error(`Snapshot ${snapshotId} is not a folder snapshot`);
    }
    
    // Clear target and restore
    await fs.rm(targetPath, { recursive: true, force: true });
    await fs.mkdir(targetPath, { recursive: true });
    await this.copyDirectory(contentDir, targetPath);
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
            const metadataContent = await fs.readFile(
              path.join(snapshotDir, 'metadata.yaml'),
              'utf-8'
            );
            const metadata = yaml.load(metadataContent) as SnapshotMetadata;
            
            // Get content based on type
            let content: string;
            if (metadata.type === 'folder') {
              // For folder snapshots, list files as manifest
              const files = await this.listFilesRecursive(path.join(snapshotDir, 'content'));
              content = files.join('\n');
            } else {
              // For file snapshots, read skill.md
              content = await fs.readFile(
                path.join(snapshotDir, 'skill.md'),
                'utf-8'
              );
            }
            
            snapshots.push({
              id: entry,
              timestamp: metadata.timestamp,
              content,
              type: metadata.type || 'file'
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
   * Restore skill content from a snapshot (single file).
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

  /**
   * Recursively copy a directory.
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      // Skip history directory to avoid recursion
      if (entry.name === 'history') {
        continue;
      }
      
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Recursively list all files in a directory.
   */
  private async listFilesRecursive(dir: string, prefix: string = ''): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        
        if (entry.isDirectory()) {
          const subFiles = await this.listFilesRecursive(
            path.join(dir, entry.name),
            relativePath
          );
          files.push(...subFiles);
        } else {
          files.push(relativePath);
        }
      }
    } catch {
      // Directory doesn't exist or not readable
    }
    
    return files;
  }

  private getHistoryDir(skillName: string): string {
    return path.join(this.registryRoot, 'skills', skillName, 'history');
  }

  private getSnapshotDir(skillName: string, timestamp: string): string {
    return path.join(this.getHistoryDir(skillName), timestamp);
  }
}
