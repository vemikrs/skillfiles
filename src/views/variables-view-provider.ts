import * as vscode from 'vscode';
import type { Target, Registry, Skill } from '../core/types.js';
import type { RegistryStore } from '../core/registry-store.js';
import type { TemplateEngine } from '../core/template-engine.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// Tree item types
type ItemType = 'section' | 'group' | 'variable';
type VarSource = 'global' | 'repo' | 'agent' | 'category' | 'skill' | 'target';

/**
 * Section header (e.g., "Global Variables", "Repositories")
 */
export class SectionTreeItem extends vscode.TreeItem {
  readonly type = 'section' as const;
  
  constructor(
    public readonly section: VarSource,
    public readonly isEmpty: boolean = false
  ) {
    const labels: Record<VarSource, string> = {
      global: 'Global Variables',
      repo: 'Repositories',
      agent: 'Agents',
      category: 'Categories',
      skill: 'Skills',
      target: 'Targets'
    };
    
    super(
      labels[section], 
      isEmpty 
        ? vscode.TreeItemCollapsibleState.None 
        : vscode.TreeItemCollapsibleState.Expanded
    );
    
    const icons: Record<VarSource, string> = {
      global: 'globe',
      repo: 'folder-library',
      agent: 'hubot',
      category: 'symbol-folder',
      skill: 'file-code',
      target: 'target'
    };
    
    this.iconPath = new vscode.ThemeIcon(icons[section]);
    this.contextValue = `section-${section}`;
    
    if (isEmpty) {
      this.description = '(empty)';
    }
  }
}

/**
 * Group item (e.g., specific repo, agent, skill)
 */
export class GroupTreeItem extends vscode.TreeItem {
  readonly type = 'group' as const;
  
  constructor(
    public readonly section: VarSource,
    public readonly groupKey: string,
    public readonly displayName: string,
    public readonly fullPath?: string
  ) {
    super(displayName, vscode.TreeItemCollapsibleState.Collapsed);
    
    const icons: Record<VarSource, string> = {
      global: 'globe',
      repo: 'repo',
      agent: 'robot',
      category: 'folder',
      skill: 'file',
      target: 'git-merge'
    };
    
    this.iconPath = new vscode.ThemeIcon(icons[section]);
    this.contextValue = `group-${section}`;
    
    if (fullPath && fullPath !== displayName) {
      this.tooltip = fullPath;
    }
  }
}

/**
 * Variable item (leaf)
 */
export class VariableTreeItem extends vscode.TreeItem {
  readonly type = 'variable' as const;
  
  constructor(
    public readonly varName: string,
    public readonly varValue: string | undefined,
    public readonly section: VarSource,
    public readonly groupKey: string | undefined,
    public readonly isMissing: boolean
  ) {
    super(varName, vscode.TreeItemCollapsibleState.None);
    
    if (isMissing) {
      this.description = '(not set)';
      this.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('disabledForeground'));
    } else {
      this.description = `= "${varValue}"`;
      this.iconPath = new vscode.ThemeIcon('symbol-variable', new vscode.ThemeColor('symbolIcon.variableForeground'));
    }
    
    this.contextValue = `variable-${section}`;
    this.tooltip = `${varName} at ${section}${groupKey ? ` (${groupKey})` : ''}\nClick to edit`;
    
    this.command = {
      command: 'skillfiles.editHierarchicalVariable',
      title: 'Edit Variable',
      arguments: [this]
    };
  }
}

// Legacy compatibility exports
export class VarLevelTreeItem extends GroupTreeItem {
  constructor(
    public readonly level: VarSource,
    public readonly levelKey: string | undefined,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(level, levelKey || '', levelKey || '', levelKey);
    this.collapsibleState = collapsibleState;
  }
}

export class TargetVarsTreeItem extends GroupTreeItem {
  constructor(
    public readonly target: Target,
    public readonly skill: Skill,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super('target', `${target.skillName}@${target.agent}`, `${target.skillName}@${target.agent}`, target.repoPath);
    this.collapsibleState = collapsibleState;
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

type VariablesTreeElement = SectionTreeItem | GroupTreeItem | VariableTreeItem;

/**
 * TreeDataProvider for the Variables view.
 * Beautiful hierarchical tree structure.
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

    // Root level: show sections
    if (!element) {
      return this.getSections();
    }

    // Section level: show groups or variables
    if (element instanceof SectionTreeItem) {
      return this.getSectionChildren(element.section);
    }

    // Group level: show variables
    if (element instanceof GroupTreeItem) {
      return this.getGroupVariables(element.section, element.groupKey, element.fullPath);
    }

    return [];
  }

  private getSections(): SectionTreeItem[] {
    const sections: SectionTreeItem[] = [];
    
    // Global (always show)
    sections.push(new SectionTreeItem('global', this.allVarNames.size === 0));
    
    // Repositories
    const hasRepos = this.getRepoKeys().length > 0;
    if (hasRepos) {
      sections.push(new SectionTreeItem('repo'));
    }
    
    // Agents
    const hasAgents = this.getAgentKeys().length > 0;
    if (hasAgents) {
      sections.push(new SectionTreeItem('agent'));
    }
    
    // Categories
    const hasCategories = this.getCategoryKeys().length > 0;
    if (hasCategories) {
      sections.push(new SectionTreeItem('category'));
    }
    
    // Skills with variables
    const skillsWithVars = (this.registry?.skills || []).filter(
      s => s.defaultVars && Object.keys(s.defaultVars).length > 0
    );
    if (skillsWithVars.length > 0) {
      sections.push(new SectionTreeItem('skill'));
    }
    
    // Targets with variables
    const targetsWithVars = (this.registry?.targets || []).filter(
      t => t.vars && Object.keys(t.vars).length > 0
    );
    if (targetsWithVars.length > 0) {
      sections.push(new SectionTreeItem('target'));
    }
    
    return sections;
  }

  private getSectionChildren(section: VarSource): VariablesTreeElement[] {
    switch (section) {
      case 'global':
        // Global shows variables directly
        return this.getGlobalVariables();
      
      case 'repo':
        return this.getRepoKeys().map(({ key, fullPath }) => 
          new GroupTreeItem('repo', key, key, fullPath)
        );
      
      case 'agent':
        return this.getAgentKeys().map(agent => 
          new GroupTreeItem('agent', agent, agent)
        );
      
      case 'category':
        return this.getCategoryKeys().map(category => 
          new GroupTreeItem('category', category, category)
        );
      
      case 'skill':
        return (this.registry?.skills || [])
          .filter(s => s.defaultVars && Object.keys(s.defaultVars).length > 0)
          .map(s => new GroupTreeItem('skill', s.name, s.name));
      
      case 'target':
        return (this.registry?.targets || [])
          .filter(t => t.vars && Object.keys(t.vars).length > 0)
          .map(t => new GroupTreeItem(
            'target', 
            `${t.skillName}@${t.agent}`, 
            `${t.skillName}@${t.agent}`,
            t.repoPath
          ));
    }
    
    return [];
  }

  private getGlobalVariables(): VariableTreeItem[] {
    const vars = this.registry?.globalVars || {};
    const items: VariableTreeItem[] = [];
    
    // Show set variables first
    for (const [varName, varValue] of Object.entries(vars)) {
      items.push(new VariableTreeItem(varName, varValue, 'global', undefined, false));
    }
    
    // Show unset variables
    for (const varName of this.allVarNames) {
      if (!(varName in vars)) {
        items.push(new VariableTreeItem(varName, undefined, 'global', undefined, true));
      }
    }
    
    return items;
  }

  private getGroupVariables(section: VarSource, groupKey: string, fullPath?: string): VariableTreeItem[] {
    let vars: Record<string, string> = {};
    
    switch (section) {
      case 'repo':
        vars = this.registry?.repoVars?.[fullPath || groupKey] || {};
        break;
      case 'agent':
        vars = this.registry?.agentVars?.[groupKey] || {};
        break;
      case 'category':
        vars = this.registry?.categoryVars?.[groupKey] || {};
        break;
      case 'skill': {
        const skill = this.registry?.skills.find(s => s.name === groupKey);
        vars = skill?.defaultVars || {};
        break;
      }
      case 'target': {
        const [skillName, agent] = groupKey.split('@');
        const target = this.registry?.targets?.find(t => t.skillName === skillName && t.agent === agent);
        vars = target?.vars || {};
        break;
      }
    }
    
    const items: VariableTreeItem[] = [];
    
    // Show set variables
    for (const [varName, varValue] of Object.entries(vars)) {
      items.push(new VariableTreeItem(varName, varValue, section, groupKey, false));
    }
    
    // For repo/agent/category levels, also show unset variables
    if (['repo', 'agent', 'category'].includes(section)) {
      for (const varName of this.allVarNames) {
        if (!(varName in vars)) {
          items.push(new VariableTreeItem(varName, undefined, section, groupKey, true));
        }
      }
    }
    
    return items;
  }

  private getRepoKeys(): { key: string; fullPath: string }[] {
    const repos = new Map<string, string>();
    
    if (this.registry?.repoVars) {
      for (const repoPath of Object.keys(this.registry.repoVars)) {
        const key = repoPath.split('/').pop() || repoPath;
        repos.set(key, repoPath);
      }
    }
    
    for (const target of this.registry?.targets || []) {
      const key = target.repoPath.split('/').pop() || target.repoPath;
      if (!repos.has(key)) {
        repos.set(key, target.repoPath);
      }
    }
    
    return Array.from(repos.entries()).map(([key, fullPath]) => ({ key, fullPath }));
  }

  private getAgentKeys(): string[] {
    const agents = new Set<string>();
    
    if (this.registry?.agentVars) {
      Object.keys(this.registry.agentVars).forEach(k => agents.add(k));
    }
    if (this.registry?.agentProfiles) {
      Object.keys(this.registry.agentProfiles).forEach(k => agents.add(k));
    }
    
    return Array.from(agents);
  }

  private getCategoryKeys(): string[] {
    const categories = new Set<string>();
    
    if (this.registry?.categoryVars) {
      Object.keys(this.registry.categoryVars).forEach(k => categories.add(k));
    }
    for (const skill of this.registry?.skills || []) {
      if (skill.category) {
        categories.add(skill.category);
      }
    }
    
    return Array.from(categories);
  }

  private async collectAllVarNames(): Promise<void> {
    this.allVarNames.clear();
    const BUILTIN_VARS = ['AGENT', 'VENDOR', 'SCOPE'];
    const varPattern = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;

    for (const skill of this.registry?.skills || []) {
      if (!skill.folderPath) continue;
      try {
        const template = await fs.readFile(path.join(skill.folderPath, 'SKILL.md'), 'utf-8');
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
