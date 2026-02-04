import * as vscode from 'vscode';
import type { Skill, Registry } from '../core/types.js';
import type { RegistryStore } from '../core/registry-store.js';

/**
 * Tree item for skill entries.
 */
export class SkillTreeItem extends vscode.TreeItem {
  constructor(
    public readonly skill: Skill,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(skill.name, collapsibleState);
    this.tooltip = skill.description || skill.name;
    this.description = skill.scope;
    this.contextValue = 'skill';
    
    // Set icon based on scope
    this.iconPath = new vscode.ThemeIcon(
      skill.scope === 'shared' ? 'globe' : 'file-code'
    );
  }
}

/**
 * Tree item for category groupings.
 */
export class CategoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly skills: Skill[],
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.contextValue = 'category';
    this.iconPath = new vscode.ThemeIcon('folder');
    this.description = `${skills.length} skills`;
  }
}

type SkillsTreeElement = SkillTreeItem | CategoryTreeItem;

/**
 * TreeDataProvider for the Skills view.
 */
export class SkillsViewProvider implements vscode.TreeDataProvider<SkillsTreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SkillsTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private registry: Registry | null = null;

  constructor(
    private readonly registryStore: RegistryStore,
    private readonly groupByCategory: boolean = true
  ) {}

  refresh(): void {
    this.registry = null;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SkillsTreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SkillsTreeElement): Promise<SkillsTreeElement[]> {
    if (!this.registry) {
      try {
        this.registry = await this.registryStore.loadRegistry();
      } catch {
        return [];
      }
    }

    if (!element) {
      // Root level
      const skills = Object.values(this.registry.skills);

      if (this.groupByCategory) {
        // Group by category
        const categories = new Map<string, Skill[]>();
        for (const skill of skills) {
          const category = skill.category || 'Uncategorized';
          const existing = categories.get(category) || [];
          existing.push(skill);
          categories.set(category, existing);
        }

        return Array.from(categories.entries()).map(
          ([category, categorySkills]) =>
            new CategoryTreeItem(
              category,
              categorySkills,
              vscode.TreeItemCollapsibleState.Expanded
            )
        );
      } else {
        // Flat list
        return skills.map(
          skill =>
            new SkillTreeItem(skill, vscode.TreeItemCollapsibleState.None)
        );
      }
    }

    if (element instanceof CategoryTreeItem) {
      return element.skills.map(
        skill => new SkillTreeItem(skill, vscode.TreeItemCollapsibleState.None)
      );
    }

    return [];
  }
}
