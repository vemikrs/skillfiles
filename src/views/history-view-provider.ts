import * as vscode from 'vscode';
import type { HistoryManager, SnapshotEntry } from '../core/history-manager.js';
import type { Registry } from '../core/types.js';
import type { RegistryStore } from '../core/registry-store.js';

/**
 * Tree item for skill entries in history view.
 */
export class HistorySkillTreeItem extends vscode.TreeItem {
  constructor(
    public readonly skillName: string,
    public readonly snapshotCount: number,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(skillName, collapsibleState);
    this.contextValue = 'historySkill';
    this.iconPath = new vscode.ThemeIcon('file-code');
    this.description = `${snapshotCount} snapshots`;
  }
}

/**
 * Tree item for individual snapshot entries.
 */
export class SnapshotTreeItem extends vscode.TreeItem {
  constructor(
    public readonly skillName: string,
    public readonly snapshot: SnapshotEntry,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(new Date(snapshot.timestamp).toLocaleString(), collapsibleState);
    this.contextValue = 'snapshot';
    this.iconPath = new vscode.ThemeIcon('history');
    this.tooltip = `ID: ${snapshot.id}`;
    this.description = snapshot.id.substring(0, 8);
    
    // Command to preview snapshot
    this.command = {
      command: 'skillfiles.previewSnapshot',
      title: 'Preview Snapshot',
      arguments: [skillName, snapshot.id]
    };
  }
}

type HistoryTreeElement = HistorySkillTreeItem | SnapshotTreeItem;

/**
 * TreeDataProvider for the History view.
 */
export class HistoryViewProvider implements vscode.TreeDataProvider<HistoryTreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<HistoryTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private registry: Registry | null = null;
  private snapshotCache = new Map<string, SnapshotEntry[]>();

  constructor(
    private readonly registryStore: RegistryStore,
    private readonly historyManager: HistoryManager
  ) {}

  refresh(): void {
    this.registry = null;
    this.snapshotCache.clear();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: HistoryTreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: HistoryTreeElement): Promise<HistoryTreeElement[]> {
    if (!this.registry) {
      try {
        this.registry = await this.registryStore.loadRegistry();
      } catch {
        return [];
      }
    }

    if (!element) {
      // Root level: list skills with history
      const items: HistorySkillTreeItem[] = [];
      
      // registry.skills is an array of Skill objects
      for (const skill of this.registry.skills || []) {
        const snapshots = await this.getSnapshots(skill.name);
        if (snapshots.length > 0) {
          items.push(
            new HistorySkillTreeItem(
              skill.name,
              snapshots.length,
              vscode.TreeItemCollapsibleState.Collapsed
            )
          );
        }
      }
      
      return items;
    }

    if (element instanceof HistorySkillTreeItem) {
      const snapshots = await this.getSnapshots(element.skillName);
      return snapshots.map(
        snapshot =>
          new SnapshotTreeItem(
            element.skillName,
            snapshot,
            vscode.TreeItemCollapsibleState.None
          )
      );
    }

    return [];
  }

  private async getSnapshots(skillName: string): Promise<SnapshotEntry[]> {
    if (!this.snapshotCache.has(skillName)) {
      const snapshots = await this.historyManager.listSnapshots(skillName);
      this.snapshotCache.set(skillName, snapshots);
    }
    return this.snapshotCache.get(skillName) || [];
  }
}
