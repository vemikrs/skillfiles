import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
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

    // Click to open skill file
    this.command = {
      command: 'skillfiles.openSkill',
      title: 'Open Skill',
      arguments: [this]
    };
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

/**
 * Tree item for skill resource files/folders.
 */
export class ResourceTreeItem extends vscode.TreeItem {
  constructor(
    public readonly resourcePath: string,
    public readonly isDirectory: boolean,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(path.basename(resourcePath), collapsibleState);
    this.contextValue = isDirectory ? 'resourceFolder' : 'resourceFile';
    this.tooltip = resourcePath;
    
    // Set icon based on type
    if (isDirectory) {
      this.iconPath = new vscode.ThemeIcon('folder');
    } else {
      // Determine icon based on file extension
      const ext = path.extname(resourcePath).toLowerCase();
      const iconMap: Record<string, string> = {
        '.md': 'markdown',
        '.txt': 'file-text',
        '.sh': 'terminal',
        '.js': 'file-code',
        '.ts': 'file-code',
        '.py': 'file-code',
        '.json': 'json',
        '.yaml': 'file-code',
        '.yml': 'file-code',
        '.png': 'file-media',
        '.jpg': 'file-media',
        '.svg': 'file-media',
      };
      this.iconPath = new vscode.ThemeIcon(iconMap[ext] || 'file');
    }

    // Click to open file (only for files)
    if (!isDirectory) {
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [vscode.Uri.file(resourcePath)]
      };
    }
  }
}

type SkillsTreeElement = SkillTreeItem | CategoryTreeItem | ResourceTreeItem;

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
        // Flat list - skills are now expandable
        return skills.map(
          skill =>
            new SkillTreeItem(skill, vscode.TreeItemCollapsibleState.Collapsed)
        );
      }
    }

    if (element instanceof CategoryTreeItem) {
      // Category children: skills (now expandable)
      return element.skills.map(
        skill => new SkillTreeItem(skill, vscode.TreeItemCollapsibleState.Collapsed)
      );
    }

    if (element instanceof SkillTreeItem) {
      // Skill children: folder contents
      return this.getSkillResources(element.skill);
    }

    if (element instanceof ResourceTreeItem && element.isDirectory) {
      // Resource folder children
      return this.getFolderContents(element.resourcePath);
    }

    return [];
  }

  /**
   * Get resources inside a skill folder (excluding SKILL.md itself).
   */
  private async getSkillResources(skill: Skill): Promise<ResourceTreeItem[]> {
    if (!skill.folderPath) {
      return [];
    }

    try {
      const entries = await fs.readdir(skill.folderPath, { withFileTypes: true });
      const resources: ResourceTreeItem[] = [];

      for (const entry of entries) {
        // Skip SKILL.md (already shown as main file), history folder, and hidden files
        if (entry.name === 'SKILL.md' || entry.name === 'history' || entry.name.startsWith('.')) {
          continue;
        }

        const fullPath = path.join(skill.folderPath, entry.name);
        resources.push(new ResourceTreeItem(
          fullPath,
          entry.isDirectory(),
          entry.isDirectory() 
            ? vscode.TreeItemCollapsibleState.Collapsed 
            : vscode.TreeItemCollapsibleState.None
        ));
      }

      // Sort: directories first, then files, alphabetically
      resources.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.label!.toString().localeCompare(b.label!.toString());
      });

      return resources;
    } catch {
      return [];
    }
  }

  /**
   * Get folder contents recursively.
   */
  private async getFolderContents(folderPath: string): Promise<ResourceTreeItem[]> {
    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      const resources: ResourceTreeItem[] = [];

      for (const entry of entries) {
        // Skip hidden files
        if (entry.name.startsWith('.')) {
          continue;
        }

        const fullPath = path.join(folderPath, entry.name);
        resources.push(new ResourceTreeItem(
          fullPath,
          entry.isDirectory(),
          entry.isDirectory()
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None
        ));
      }

      // Sort: directories first, then files
      resources.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.label!.toString().localeCompare(b.label!.toString());
      });

      return resources;
    } catch {
      return [];
    }
  }
}
