import * as vscode from 'vscode';
import * as os from 'os';
import type { Target, TargetStatus, Registry, TargetWithStatus, Skill } from '../core/types.js';
import type { RegistryStore } from '../core/registry-store.js';
import type { DiffEngine } from '../core/diff-engine.js';
import type { TemplateEngine } from '../core/template-engine.js';
import { computeHash } from '../utils/hash.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Known user home skill directories.
 */
const USER_HOME_SKILL_DIRS = [
  { agent: 'gemini', path: '.gemini/skills' },
  { agent: 'claude', path: '.claude/skills' },
  { agent: 'copilot', path: '.github/skills' },
  { agent: 'codex', path: '.codex/skills' }
];

/**
 * Tree item for User Home section.
 */
export class UserHomeTreeItem extends vscode.TreeItem {
  constructor(
    public readonly agents: string[],
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super('User Home', collapsibleState);
    this.tooltip = 'Skills deployed to home directory';
    this.contextValue = 'userHome';
    this.iconPath = new vscode.ThemeIcon('home');
    this.description = `${agents.length} agent${agents.length !== 1 ? 's' : ''}`;
  }
}

/**
 * Tree item for repository entries.
 */
export class RepoTreeItem extends vscode.TreeItem {
  constructor(
    public readonly repoPath: string,
    public readonly agents: string[],
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(repoPath.split('/').pop() || repoPath, collapsibleState);
    this.tooltip = repoPath;
    this.contextValue = 'repo';
    this.iconPath = new vscode.ThemeIcon('repo');
    this.description = `${agents.length} agent${agents.length !== 1 ? 's' : ''}`;
  }
}

/**
 * Tree item for agent entries within a repo or user home.
 */
export class AgentTreeItem extends vscode.TreeItem {
  constructor(
    public readonly agent: string,
    public readonly repoPath: string,
    public readonly targets: TargetWithStatus[],
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(agent, collapsibleState);
    this.contextValue = 'agent';
    this.iconPath = new vscode.ThemeIcon('robot');
    
    // Count statuses
    const synced = targets.filter(t => t.status === 'synced').length;
    const total = targets.length;
    
    if (synced === total) {
      this.description = `${total} skills ✓`;
    } else {
      this.description = `${synced}/${total} synced`;
    }
    
    this.tooltip = `${agent}\n${targets.length} skill(s)`;
  }
}

/**
 * Tree item for target entries within an agent.
 */
export class TargetTreeItem extends vscode.TreeItem {
  constructor(
    public readonly target: TargetWithStatus,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(target.skillName, collapsibleState);
    this.tooltip = `Path: ${target.deployPath || 'Not set'}`;
    this.contextValue = `target-${target.status}`;
    
    // Icon based on status
    const iconMap: Record<TargetStatus, string> = {
      'synced': 'check',
      'modified': 'diff',
      'missing': 'warning',
      'needs-vars': 'variable'
    };
    this.iconPath = new vscode.ThemeIcon(iconMap[target.status]);
    
    // Description: status only (agent is in parent)
    if (target.status === 'synced') {
      this.description = '';
    } else if (target.status === 'needs-vars' && target.missingVars?.length) {
      this.description = `Missing: ${target.missingVars.join(', ')}`;
    } else {
      this.description = target.status;
    }

    // Click to open target file
    this.command = {
      command: 'skillfiles.openTarget',
      title: 'Open Target',
      arguments: [this]
    };
  }
}

type DeployStatusTreeElement = UserHomeTreeItem | RepoTreeItem | AgentTreeItem | TargetTreeItem;

/**
 * TreeDataProvider for the Deploy Status view.
 * Structure: [User Home | Repo] → Agent → Skill
 */
export class RepoStatusViewProvider implements vscode.TreeDataProvider<DeployStatusTreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DeployStatusTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private registry: Registry | null = null;
  private targetStatusCache = new Map<string, TargetWithStatus>();
  private homeSkillStatusCache = new Map<string, TargetWithStatus>();

  constructor(
    private readonly registryStore: RegistryStore,
    private readonly diffEngine: DiffEngine,
    private readonly templateEngine: TemplateEngine
  ) {}

  refresh(): void {
    this.registry = null;
    this.targetStatusCache.clear();
    this.homeSkillStatusCache.clear();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: DeployStatusTreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: DeployStatusTreeElement): Promise<DeployStatusTreeElement[]> {
    if (!this.registry) {
      try {
        this.registry = await this.registryStore.loadRegistry();
        await this.computeAllTargetStatuses();
        await this.computeHomeSkillStatuses();
      } catch {
        return [];
      }
    }

    if (!element) {
      // Root level: User Home + Repos
      const items: DeployStatusTreeElement[] = [];
      
      // Add User Home if there are any home skills
      const homeAgents = this.getHomeAgents();
      if (homeAgents.length > 0) {
        items.push(new UserHomeTreeItem(homeAgents, vscode.TreeItemCollapsibleState.Expanded));
      }
      
      // Add repos
      items.push(...this.getRepoItems());
      
      return items;
    }

    if (element instanceof UserHomeTreeItem) {
      // User Home level: group by agent
      return this.getHomeAgentItems();
    }

    if (element instanceof RepoTreeItem) {
      // Repo level: group by agent
      return this.getAgentItems(element.repoPath);
    }

    if (element instanceof AgentTreeItem) {
      // Agent level: show skills
      return element.targets.map(
        target => new TargetTreeItem(target, vscode.TreeItemCollapsibleState.None)
      );
    }

    return [];
  }

  private getHomeAgents(): string[] {
    const agents = new Set<string>();
    for (const [, target] of this.homeSkillStatusCache) {
      agents.add(target.agent);
    }
    return Array.from(agents);
  }

  private getHomeAgentItems(): AgentTreeItem[] {
    const agentTargetMap = new Map<string, TargetWithStatus[]>();
    
    for (const [, target] of this.homeSkillStatusCache) {
      const targets = agentTargetMap.get(target.agent) || [];
      targets.push(target);
      agentTargetMap.set(target.agent, targets);
    }

    return Array.from(agentTargetMap.entries()).map(
      ([agent, targets]) =>
        new AgentTreeItem(
          agent,
          os.homedir(),
          targets,
          vscode.TreeItemCollapsibleState.Expanded
        )
    );
  }

  private getRepoItems(): RepoTreeItem[] {
    const repoAgentMap = new Map<string, Set<string>>();
    
    for (const [, target] of this.targetStatusCache) {
      const agents = repoAgentMap.get(target.repoPath) || new Set();
      agents.add(target.agent);
      repoAgentMap.set(target.repoPath, agents);
    }

    return Array.from(repoAgentMap.entries()).map(
      ([repoPath, agents]) =>
        new RepoTreeItem(
          repoPath,
          Array.from(agents),
          vscode.TreeItemCollapsibleState.Expanded
        )
    );
  }

  private getAgentItems(repoPath: string): AgentTreeItem[] {
    const agentTargetMap = new Map<string, TargetWithStatus[]>();
    
    for (const [, target] of this.targetStatusCache) {
      if (target.repoPath !== repoPath) continue;
      
      const targets = agentTargetMap.get(target.agent) || [];
      targets.push(target);
      agentTargetMap.set(target.agent, targets);
    }

    return Array.from(agentTargetMap.entries()).map(
      ([agent, targets]) =>
        new AgentTreeItem(
          agent,
          repoPath,
          targets,
          vscode.TreeItemCollapsibleState.Expanded
        )
    );
  }

  private async computeAllTargetStatuses(): Promise<void> {
    this.targetStatusCache.clear();
    
    for (const target of this.registry?.targets || []) {
      const status = await this.computeTargetStatus(target);
      const key = `${target.repoPath}:${target.agent}:${target.skillName}`;
      this.targetStatusCache.set(key, { ...target, status });
    }
  }

  private async computeHomeSkillStatuses(): Promise<void> {
    this.homeSkillStatusCache.clear();
    const homeDir = os.homedir();

    // For each skill, check if it's deployed to user home directories
    for (const skill of this.registry?.skills || []) {
      for (const { agent, path: skillDir } of USER_HOME_SKILL_DIRS) {
        const deployPath = path.join(homeDir, skillDir, skill.name, 'SKILL.md');
        
        const status = await this.computeHomeSkillStatus(skill, deployPath, agent);
        if (status) {
          const key = `home:${agent}:${skill.name}`;
          this.homeSkillStatusCache.set(key, status);
        }
      }
    }
  }

  private async computeHomeSkillStatus(
    skill: Skill,
    deployPath: string,
    agent: string
  ): Promise<TargetWithStatus | null> {
    // Check if deployed file exists
    try {
      await fs.access(deployPath);
    } catch {
      return null; // File doesn't exist, not deployed
    }

    // Read skill template from registry
    let templateContent = skill.template || '';
    if (skill.folderPath) {
      try {
        templateContent = await fs.readFile(path.join(skill.folderPath, 'SKILL.md'), 'utf-8');
      } catch {
        return {
          skillName: skill.name,
          agent,
          repoPath: os.homedir(),
          scanPath: os.homedir(),
          deployPath,
          status: 'missing'
        };
      }
    }

    try {
      const deployedContent = await fs.readFile(deployPath, 'utf-8');
      const deployedHash = computeHash(deployedContent);
      const registryHash = computeHash(templateContent);
      
      const status = this.diffEngine.computeStatus({
        registryHash,
        repoHash: deployedHash,
        repoFileExists: true,
        needsVars: false
      });

      return {
        skillName: skill.name,
        agent,
        repoPath: os.homedir(),
        scanPath: os.homedir(),
        deployPath,
        status
      };
    } catch {
      return {
        skillName: skill.name,
        agent,
        repoPath: os.homedir(),
        scanPath: os.homedir(),
        deployPath,
        status: 'missing'
      };
    }
  }

  private async computeTargetStatus(target: Target): Promise<TargetStatus> {
    const skill = this.registry?.skills.find(s => s.name === target.skillName);
    if (!skill) {
      return 'missing';
    }

    // Check if deployed file exists
    if (!target.deployPath) {
      return 'missing';
    }

    // Read skill template from file
    let templateContent = skill.template || '';
    if (skill.folderPath) {
      try {
        templateContent = await fs.readFile(path.join(skill.folderPath, 'SKILL.md'), 'utf-8');
      } catch {
        return 'missing';
      }
    }

    // Resolve vars using hierarchical system
    const resolvedVars = this.templateEngine.resolveVars(target, skill, this.registry!);

    // Check if template needs vars
    if (this.templateEngine.needsVars(templateContent, resolvedVars)) {
      return 'needs-vars';
    }

    try {
      const deployedContent = await fs.readFile(target.deployPath, 'utf-8');
      const deployedHash = computeHash(deployedContent);
      
      // Compare with registry hash (expanded template)
      const registryContent = this.templateEngine.expand(
        templateContent,
        resolvedVars,
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
