import * as vscode from 'vscode';
import type { Target, TargetStatus, Registry, TargetWithStatus } from '../core/types.js';
import type { RegistryStore } from '../core/registry-store.js';
import type { DiffEngine } from '../core/diff-engine.js';
import type { TemplateEngine } from '../core/template-engine.js';
import { computeHash } from '../utils/hash.js';
import * as fs from 'fs/promises';

/**
 * Tree item for repository entries.
 */
export class RepoTreeItem extends vscode.TreeItem {
  constructor(
    public readonly repoPath: string,
    public readonly targets: TargetWithStatus[],
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(repoPath.split('/').pop() || repoPath, collapsibleState);
    this.tooltip = repoPath;
    this.contextValue = 'repo';
    this.iconPath = new vscode.ThemeIcon('repo');
    
    // Count statuses
    const statuses = targets.map(t => t.status);
    const modified = statuses.filter(s => s === 'modified').length;
    const missing = statuses.filter(s => s === 'missing').length;
    
    if (modified > 0 || missing > 0) {
      this.description = `${modified} modified, ${missing} missing`;
    } else {
      this.description = 'synced';
    }
  }
}

/**
 * Tree item for target entries within a repo.
 */
export class TargetTreeItem extends vscode.TreeItem {
  constructor(
    public readonly target: TargetWithStatus,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(target.skillName, collapsibleState);
    this.tooltip = `Agent: ${target.agent}`;
    this.contextValue = `target-${target.status}`;
    
    // Icon based on status
    const iconMap: Record<TargetStatus, string> = {
      'synced': 'check',
      'modified': 'diff',
      'missing': 'warning',
      'needs-vars': 'question'
    };
    this.iconPath = new vscode.ThemeIcon(iconMap[target.status]);
    this.description = target.status;
  }
}

type RepoStatusTreeElement = RepoTreeItem | TargetTreeItem;

/**
 * TreeDataProvider for the Repo Status view.
 */
export class RepoStatusViewProvider implements vscode.TreeDataProvider<RepoStatusTreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<RepoStatusTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private registry: Registry | null = null;

  constructor(
    private readonly registryStore: RegistryStore,
    private readonly diffEngine: DiffEngine,
    private readonly templateEngine: TemplateEngine
  ) {}

  refresh(): void {
    this.registry = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RepoStatusTreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: RepoStatusTreeElement): Promise<RepoStatusTreeElement[]> {
    if (!this.registry) {
      try {
        this.registry = await this.registryStore.loadRegistry();
      } catch {
        return [];
      }
    }

    if (!element) {
      // Root level: group by repo
      const repoMap = new Map<string, TargetWithStatus[]>();
      
      const targets = this.registry.targets || [];
      for (const target of targets) {
        const repoPath = target.repoPath;
        const existing = repoMap.get(repoPath) || [];
        
        // Compute status for this target
        const status = await this.computeTargetStatus(target);
        existing.push({ ...target, status });
        
        repoMap.set(repoPath, existing);
      }

      return Array.from(repoMap.entries()).map(
        ([repoPath, targets]) =>
          new RepoTreeItem(
            repoPath,
            targets,
            vscode.TreeItemCollapsibleState.Expanded
          )
      );
    }

    if (element instanceof RepoTreeItem) {
      return element.targets.map(
        target => new TargetTreeItem(target, vscode.TreeItemCollapsibleState.None)
      );
    }

    return [];
  }

  private async computeTargetStatus(target: Target): Promise<TargetStatus> {
    const skill = this.registry?.skills.find(s => s.name === target.skillName);
    if (!skill) {
      return 'missing';
    }

    // Check if template needs vars
    if (this.templateEngine.needsVars(skill.template || '', target.vars || {})) {
      return 'needs-vars';
    }

    // Check if deployed file exists
    if (!target.deployPath) {
      return 'missing';
    }

    try {
      const deployedContent = await fs.readFile(target.deployPath, 'utf-8');
      const deployedHash = computeHash(deployedContent);
      
      // Compare with registry hash
      const registryContent = this.templateEngine.expand(
        skill.template || '',
        target.vars || {},
        { agent: target.agent, scope: skill.scope }
      );
      const registryHash = computeHash(registryContent);
      
      return this.diffEngine.computeStatus({
        registryHash,
        repoHash: deployedHash,
        repoFileExists: true,
        needsVars: false
      });
    } catch {
      return 'missing';
    }
  }
}
