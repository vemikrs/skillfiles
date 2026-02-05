import * as vscode from 'vscode';
import type { Target, Registry, Skill } from '../core/types.js';
import type { RegistryStore } from '../core/registry-store.js';
import type { TemplateEngine } from '../core/template-engine.js';
import * as fs from 'fs/promises';

/**
 * Tree item for a skill with its variables.
 */
export class SkillVarsTreeItem extends vscode.TreeItem {
  constructor(
    public readonly skill: Skill,
    public readonly hasVariables: boolean,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(skill.name, collapsibleState);
    this.tooltip = skill.description || skill.name;
    this.contextValue = 'skillVars';
    this.iconPath = new vscode.ThemeIcon('file-code');
    this.description = hasVariables ? '' : 'no variables';
  }
}

/**
 * Tree item for a target's variable overrides section.
 */
export class TargetVarsTreeItem extends vscode.TreeItem {
  constructor(
    public readonly target: Target,
    public readonly skill: Skill,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(`→ ${target.repoPath.split('/').pop()}`, collapsibleState);
    this.tooltip = `${target.repoPath} (${target.agent})`;
    this.contextValue = 'targetVars';
    this.iconPath = new vscode.ThemeIcon('repo');
    this.description = target.agent;
  }
}

/**
 * Tree item for skill default variable.
 */
export class DefaultVariableTreeItem extends vscode.TreeItem {
  constructor(
    public readonly varName: string,
    public readonly varValue: string | undefined,
    public readonly skill: Skill,
    public readonly isMissing: boolean
  ) {
    super(varName, vscode.TreeItemCollapsibleState.None);
    
    if (isMissing) {
      this.description = '(default not set)';
      this.iconPath = new vscode.ThemeIcon('circle-outline');
    } else {
      this.description = `"${varValue}"`;
      this.iconPath = new vscode.ThemeIcon('symbol-constant');
    }
    
    this.contextValue = 'defaultVariable';
    this.tooltip = `Default value for ${varName}. Click to edit.`;
    
    this.command = {
      command: 'skillfiles.editDefaultVariable',
      title: 'Edit Default Variable',
      arguments: [this]
    };
  }
}

/**
 * Tree item for target variable override.
 */
export class VariableTreeItem extends vscode.TreeItem {
  constructor(
    public readonly varName: string,
    public readonly varValue: string | undefined,
    public readonly defaultValue: string | undefined,
    public readonly target: Target,
    public readonly isMissing: boolean
  ) {
    super(varName, vscode.TreeItemCollapsibleState.None);
    
    if (varValue !== undefined) {
      // Has override
      this.description = `"${varValue}" (override)`;
      this.iconPath = new vscode.ThemeIcon('symbol-string');
    } else if (defaultValue !== undefined) {
      // Using default
      this.description = `"${defaultValue}" (default)`;
      this.iconPath = new vscode.ThemeIcon('symbol-constant', new vscode.ThemeColor('descriptionForeground'));
    } else {
      // Missing
      this.description = '(not set)';
      this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('errorForeground'));
    }
    
    this.contextValue = 'variable';
    this.tooltip = `Click to set override for ${varName}`;
    
    this.command = {
      command: 'skillfiles.editVariable',
      title: 'Edit Variable',
      arguments: [this]
    };
  }
}

type VariablesTreeElement = SkillVarsTreeItem | TargetVarsTreeItem | DefaultVariableTreeItem | VariableTreeItem;

/**
 * TreeDataProvider for the Variables view.
 */
export class VariablesViewProvider implements vscode.TreeDataProvider<VariablesTreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<VariablesTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private registry: Registry | null = null;
  private skillVarsCache = new Map<string, string[]>();

  constructor(
    private readonly registryStore: RegistryStore,
    private readonly templateEngine: TemplateEngine
  ) {}

  refresh(): void {
    this.skillVarsCache.clear();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: VariablesTreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: VariablesTreeElement): Promise<VariablesTreeElement[]> {
    this.registry = await this.registryStore.loadRegistry();

    if (!element) {
      // Root: return skills that have variables
      const items: SkillVarsTreeItem[] = [];

      for (const skill of this.registry.skills) {
        if (!skill.path) continue;

        try {
          const templateContent = await fs.readFile(skill.path, 'utf-8');
          const vars = this.detectAllVars(templateContent);
          this.skillVarsCache.set(skill.name, vars);
          
          if (vars.length > 0) {
            items.push(new SkillVarsTreeItem(
              skill,
              true,
              vscode.TreeItemCollapsibleState.Collapsed
            ));
          }
        } catch {
          // Skip if can't read skill file
        }
      }

      return items;
    }

    if (element instanceof SkillVarsTreeItem) {
      // Return default variables + targets for this skill
      const vars = this.skillVarsCache.get(element.skill.name) || [];
      const defaultVars = element.skill.defaultVars || {};
      const targets = this.registry?.targets?.filter(t => t.skillName === element.skill.name) || [];
      
      const items: VariablesTreeElement[] = [];
      
      // Default variables section
      for (const varName of vars) {
        items.push(new DefaultVariableTreeItem(
          varName,
          defaultVars[varName],
          element.skill,
          !(varName in defaultVars)
        ));
      }
      
      // Target overrides sections
      for (const target of targets) {
        items.push(new TargetVarsTreeItem(
          target,
          element.skill,
          vscode.TreeItemCollapsibleState.Collapsed
        ));
      }
      
      return items;
    }

    if (element instanceof TargetVarsTreeItem) {
      // Return variable overrides for this target
      const vars = this.skillVarsCache.get(element.skill.name) || [];
      const defaultVars = element.skill.defaultVars || {};
      const targetVars = element.target.vars || {};
      
      return vars.map(varName => new VariableTreeItem(
        varName,
        targetVars[varName],
        defaultVars[varName],
        element.target,
        !(varName in targetVars) && !(varName in defaultVars)
      ));
    }

    return [];
  }

  /**
   * Detect all template variables in content (excluding built-ins).
   */
  private detectAllVars(template: string): string[] {
    const BUILTIN_VARS = ['AGENT', 'VENDOR', 'SCOPE'];
    const varPattern = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;
    const vars: string[] = [];
    const seen = new Set<string>();

    let match;
    while ((match = varPattern.exec(template)) !== null) {
      const varName = match[1];
      if (!seen.has(varName) && !BUILTIN_VARS.includes(varName)) {
        seen.add(varName);
        vars.push(varName);
      }
    }

    return vars;
  }
}
