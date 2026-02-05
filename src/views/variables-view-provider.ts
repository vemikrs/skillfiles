import * as vscode from 'vscode';
import type { Target, Registry, Skill } from '../core/types.js';
import type { RegistryStore } from '../core/registry-store.js';
import type { TemplateEngine } from '../core/template-engine.js';
import * as fs from 'fs/promises';

// Variable source types
type VarSource = 'global' | 'repo' | 'agent' | 'category' | 'skill' | 'target';

/**
 * Tree item for a variable level section.
 */
export class VarLevelTreeItem extends vscode.TreeItem {
  constructor(
    public readonly level: VarSource,
    public readonly levelKey: string | undefined,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    const labels: Record<VarSource, string> = {
      global: 'Global',
      repo: 'Repository',
      agent: 'Agent',
      category: 'Category',
      skill: 'Skill',
      target: 'Target'
    };
    super(levelKey ? `${labels[level]}: ${levelKey}` : labels[level], collapsibleState);
    
    const icons: Record<VarSource, string> = {
      global: 'globe',
      repo: 'repo',
      agent: 'robot',
      category: 'folder',
      skill: 'file-code',
      target: 'target'
    };
    this.iconPath = new vscode.ThemeIcon(icons[level]);
    this.contextValue = `varLevel-${level}`;
  }
}

/**
 * Tree item for a variable at any level.
 */
export class VariableTreeItem extends vscode.TreeItem {
  constructor(
    public readonly varName: string,
    public readonly varValue: string | undefined,
    public readonly level: VarSource,
    public readonly levelKey: string | undefined,
    public readonly isMissing: boolean
  ) {
    super(varName, vscode.TreeItemCollapsibleState.None);
    
    if (isMissing) {
      this.description = '(not set)';
      this.iconPath = new vscode.ThemeIcon('circle-outline');
    } else {
      this.description = `"${varValue}"`;
      this.iconPath = new vscode.ThemeIcon('symbol-string');
    }
    
    this.contextValue = `variable-${level}`;
    this.tooltip = `Click to edit. Level: ${level}${levelKey ? ` (${levelKey})` : ''}`;
    
    this.command = {
      command: 'skillfiles.editHierarchicalVariable',
      title: 'Edit Variable',
      arguments: [this]
    };
  }
}

// Legacy exports for backward compatibility
export class TargetVarsTreeItem extends VarLevelTreeItem {
  constructor(
    public readonly target: Target,
    public readonly skill: Skill,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super('target', `${target.skillName}@${target.repoPath.split('/').pop()}`, collapsibleState);
    this.tooltip = `${target.repoPath} (${target.agent})`;
  }
}

export class DefaultVariableTreeItem extends VariableTreeItem {
  constructor(
    varName: string,
    varValue: string | undefined,
    public readonly skill: Skill,
    isMissing: boolean
  ) {
    super(varName, varValue, 'skill', skill.name, isMissing);
  }
}

type VariablesTreeElement = VarLevelTreeItem | VariableTreeItem;

/**
 * TreeDataProvider for the Variables view.
 * Shows 6-layer variable hierarchy.
 */
export class VariablesViewProvider implements vscode.TreeDataProvider<VariablesTreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<VariablesTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private registry: Registry | null = null;
  private allVarNames = new Set<string>();

  constructor(
    private readonly registryStore: RegistryStore,
    private readonly templateEngine: TemplateEngine
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: VariablesTreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: VariablesTreeElement): Promise<VariablesTreeElement[]> {
    this.registry = await this.registryStore.loadRegistry();
    await this.collectAllVarNames();

    if (!element) {
      // Root: show all 6 levels
      return this.getRootLevels();
    }

    if (element instanceof VarLevelTreeItem) {
      return this.getLevelChildren(element);
    }

    return [];
  }

  private getRootLevels(): VarLevelTreeItem[] {
    const items: VarLevelTreeItem[] = [];
    
    // Global
    items.push(new VarLevelTreeItem('global', undefined, vscode.TreeItemCollapsibleState.Collapsed));
    
    // Repos (if any repoVars exist or targets exist)
    const repoKeys = new Set<string>();
    if (this.registry?.repoVars) {
      Object.keys(this.registry.repoVars).forEach(k => repoKeys.add(k));
    }
    this.registry?.targets?.forEach(t => repoKeys.add(t.repoPath));
    
    for (const repoPath of repoKeys) {
      items.push(new VarLevelTreeItem('repo', repoPath.split('/').pop() || repoPath, 
        vscode.TreeItemCollapsibleState.Collapsed));
    }
    
    // Agents
    const agentKeys = new Set<string>();
    if (this.registry?.agentVars) {
      Object.keys(this.registry.agentVars).forEach(k => agentKeys.add(k));
    }
    if (this.registry?.agentProfiles) {
      Object.keys(this.registry.agentProfiles).forEach(k => agentKeys.add(k));
    }
    
    for (const agent of agentKeys) {
      items.push(new VarLevelTreeItem('agent', agent, vscode.TreeItemCollapsibleState.Collapsed));
    }
    
    // Categories
    const categoryKeys = new Set<string>();
    if (this.registry?.categoryVars) {
      Object.keys(this.registry.categoryVars).forEach(k => categoryKeys.add(k));
    }
    this.registry?.skills.forEach(s => {
      if (s.category) categoryKeys.add(s.category);
    });
    
    for (const category of categoryKeys) {
      items.push(new VarLevelTreeItem('category', category, vscode.TreeItemCollapsibleState.Collapsed));
    }
    
    // Skills with variables
    for (const skill of this.registry?.skills || []) {
      if (skill.defaultVars && Object.keys(skill.defaultVars).length > 0) {
        items.push(new VarLevelTreeItem('skill', skill.name, vscode.TreeItemCollapsibleState.Collapsed));
      }
    }
    
    // Targets with variables
    for (const target of this.registry?.targets || []) {
      if (target.vars && Object.keys(target.vars).length > 0) {
        items.push(new VarLevelTreeItem('target', `${target.skillName}@${target.agent}`,
          vscode.TreeItemCollapsibleState.Collapsed));
      }
    }
    
    return items;
  }

  private getLevelChildren(level: VarLevelTreeItem): VariableTreeItem[] {
    const items: VariableTreeItem[] = [];
    
    switch (level.level) {
      case 'global': {
        const vars = this.registry?.globalVars || {};
        // Show all known var names, marking unset ones
        for (const varName of this.allVarNames) {
          items.push(new VariableTreeItem(varName, vars[varName], 'global', undefined, !(varName in vars)));
        }
        break;
      }
      
      case 'repo': {
        const repoPath = this.findFullRepoPath(level.levelKey || '');
        const vars = repoPath && this.registry?.repoVars?.[repoPath] || {};
        for (const varName of this.allVarNames) {
          items.push(new VariableTreeItem(varName, vars[varName], 'repo', repoPath || level.levelKey, !(varName in vars)));
        }
        break;
      }
      
      case 'agent': {
        const vars = this.registry?.agentVars?.[level.levelKey || ''] || {};
        for (const varName of this.allVarNames) {
          items.push(new VariableTreeItem(varName, vars[varName], 'agent', level.levelKey, !(varName in vars)));
        }
        break;
      }
      
      case 'category': {
        const vars = this.registry?.categoryVars?.[level.levelKey || ''] || {};
        for (const varName of this.allVarNames) {
          items.push(new VariableTreeItem(varName, vars[varName], 'category', level.levelKey, !(varName in vars)));
        }
        break;
      }
      
      case 'skill': {
        const skill = this.registry?.skills.find(s => s.name === level.levelKey);
        const vars = skill?.defaultVars || {};
        for (const [varName, varValue] of Object.entries(vars)) {
          items.push(new VariableTreeItem(varName, varValue, 'skill', level.levelKey, false));
        }
        break;
      }
      
      case 'target': {
        const [skillName, agent] = (level.levelKey || '').split('@');
        const target = this.registry?.targets?.find(t => t.skillName === skillName && t.agent === agent);
        const vars = target?.vars || {};
        for (const [varName, varValue] of Object.entries(vars)) {
          items.push(new VariableTreeItem(varName, varValue, 'target', level.levelKey, false));
        }
        break;
      }
    }
    
    return items;
  }

  private findFullRepoPath(shortName: string): string | undefined {
    // Find full repo path from short name
    for (const target of this.registry?.targets || []) {
      if (target.repoPath.endsWith(shortName) || target.repoPath.split('/').pop() === shortName) {
        return target.repoPath;
      }
    }
    if (this.registry?.repoVars) {
      for (const repoPath of Object.keys(this.registry.repoVars)) {
        if (repoPath.endsWith(shortName) || repoPath.split('/').pop() === shortName) {
          return repoPath;
        }
      }
    }
    return undefined;
  }

  private async collectAllVarNames(): Promise<void> {
    this.allVarNames.clear();
    const BUILTIN_VARS = ['AGENT', 'VENDOR', 'SCOPE'];
    const varPattern = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;

    for (const skill of this.registry?.skills || []) {
      if (!skill.path) continue;
      try {
        const template = await fs.readFile(skill.path, 'utf-8');
        let match;
        while ((match = varPattern.exec(template)) !== null) {
          if (!BUILTIN_VARS.includes(match[1])) {
            this.allVarNames.add(match[1]);
          }
        }
      } catch {
        // Skip
      }
    }
  }
}
