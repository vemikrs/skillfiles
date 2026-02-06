import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { Skill, Registry, SkillMetadata, Target, TargetStatus, TargetWithStatus } from '../core/types.js';
import type { RegistryStore } from '../core/registry-store.js';
import type { DiffEngine } from '../core/diff-engine.js';
import type { TemplateEngine } from '../core/template-engine.js';
import { parseSkillFolder } from '../core/skill-parser.js';
import { computeHash } from '../utils/hash.js';

/**
 * Known user home skill directories.
 */
const USER_HOME_SKILL_DIRS = [
  { agent: 'agent', path: '.agent/skills' },
  { agent: 'gemini', path: '.gemini/skills' },
  { agent: 'claude', path: '.claude/skills' },
  { agent: 'copilot', path: '.github/skills' },
  { agent: 'codex', path: '.codex/skills' }
];

/**
 * Tree item for skill entries.
 */
export class SkillTreeItem extends vscode.TreeItem {
  public metadata: SkillMetadata | null = null;

  constructor(
    public readonly skill: Skill,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    metadata?: SkillMetadata | null
  ) {
    super(skill.name, collapsibleState);
    this.metadata = metadata || null;
    
    // Use parsed description from frontmatter, fallback to skill.description
    const desc = metadata?.description || skill.description;
    this.tooltip = desc ? new vscode.MarkdownString(`**${skill.name}**\n\n${desc}`) : skill.name;
    this.description = skill.scope;
    this.contextValue = 'skill';
    
    // Set icon based on scope and metadata
    if (metadata?.disableModelInvocation) {
      this.iconPath = new vscode.ThemeIcon('lock');
    } else {
      this.iconPath = new vscode.ThemeIcon(
        skill.scope === 'shared' ? 'globe' : 'file-code'
      );
    }

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

/**
 * Tree item for Targets section under a skill.
 */
export class TargetsSectionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly skill: Skill,
    public readonly targets: TargetWithStatus[],
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super('Targets', collapsibleState);
    this.contextValue = 'targetsSection';
    this.iconPath = new vscode.ThemeIcon('target');
    
    // Show count and sync status summary
    const synced = targets.filter(t => t.status === 'synced').length;
    if (targets.length === 0) {
      this.description = 'No targets';
    } else if (synced === targets.length) {
      this.description = `${targets.length} target${targets.length !== 1 ? 's' : ''} ✓`;
    } else {
      this.description = `${synced}/${targets.length} synced`;
    }
  }
}

/**
 * Tree item for Contents section under a skill.
 */
export class ContentsSectionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly skill: Skill,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super('Contents', collapsibleState);
    this.contextValue = 'contentsSection';
    this.iconPath = new vscode.ThemeIcon('package');
    this.tooltip = 'Skill folder contents (SKILL.md, scripts, references, etc.)';
  }
}

/**
 * Tree item for individual deployment target under Targets section.
 */
export class SkillTargetTreeItem extends vscode.TreeItem {
  constructor(
    public readonly skill: Skill,
    public readonly target: TargetWithStatus,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    // Display: repoName / agent
    const repoName = target.repoPath.split('/').pop() || target.repoPath;
    super(`${repoName} / ${target.agent}`, collapsibleState);
    
    this.contextValue = `skillTarget-${target.status}`;
    this.tooltip = new vscode.MarkdownString(
      `**${target.skillName}**\n\nRepo: ${target.repoPath}\nAgent: ${target.agent}\nStatus: ${target.status}`
    );
    
    // Icon based on status
    const iconMap: Record<TargetStatus, string> = {
      'synced': 'check',
      'modified': 'diff',
      'missing': 'warning',
      'needs-vars': 'variable'
    };
    this.iconPath = new vscode.ThemeIcon(iconMap[target.status]);
    
    // Description shows status if not synced
    if (target.status === 'synced') {
      this.description = '';
    } else if (target.status === 'needs-vars' && target.missingVars?.length) {
      this.description = `Missing: ${target.missingVars.join(', ')}`;
    } else {
      this.description = target.status;
    }
  }
}

type SkillsTreeElement = SkillTreeItem | CategoryTreeItem | ResourceTreeItem | TargetsSectionTreeItem | ContentsSectionTreeItem | SkillTargetTreeItem;

/**
 * TreeDataProvider for the Skills view.
 */
export class SkillsViewProvider implements vscode.TreeDataProvider<SkillsTreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SkillsTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private registry: Registry | null = null;
  private targetStatusCache = new Map<string, TargetWithStatus>();

  constructor(
    private readonly registryStore: RegistryStore,
    private readonly diffEngine?: DiffEngine,
    private readonly templateEngine?: TemplateEngine,
    private readonly groupByCategory: boolean = true
  ) {}

  refresh(): void {
    this.registry = null;
    this.targetStatusCache.clear();
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
        // Flat list - skills are now expandable with metadata
        return Promise.all(
          skills.map(skill => this.createSkillTreeItem(skill))
        );
      }
    }

    if (element instanceof CategoryTreeItem) {
      // Category children: skills (now expandable) - load metadata for each
      return Promise.all(
        element.skills.map(skill => this.createSkillTreeItem(skill))
      );
    }

    if (element instanceof SkillTreeItem) {
      // Skill children: Targets section + Contents section
      const targets = await this.getSkillTargetsWithStatus(element.skill);
      return [
        new TargetsSectionTreeItem(
          element.skill,
          targets,
          vscode.TreeItemCollapsibleState.Collapsed
        ),
        new ContentsSectionTreeItem(
          element.skill,
          vscode.TreeItemCollapsibleState.Collapsed
        )
      ];
    }

    if (element instanceof TargetsSectionTreeItem) {
      // Targets section children: individual targets
      return element.targets.map(
        target => new SkillTargetTreeItem(
          element.skill,
          target,
          vscode.TreeItemCollapsibleState.None
        )
      );
    }

    if (element instanceof ContentsSectionTreeItem) {
      // Contents section children: folder contents
      return this.getSkillResources(element.skill);
    }

    if (element instanceof ResourceTreeItem && element.isDirectory) {
      // Resource folder children
      return this.getFolderContents(element.resourcePath);
    }

    return [];
  }

  /**
   * Create a SkillTreeItem with loaded metadata.
   */
  private async createSkillTreeItem(skill: Skill): Promise<SkillTreeItem> {
    let metadata: SkillMetadata | null = null;
    
    if (skill.folderPath) {
      try {
        metadata = await parseSkillFolder(skill.folderPath);
      } catch {
        // Ignore parse errors, use default
      }
    }
    
    return new SkillTreeItem(skill, vscode.TreeItemCollapsibleState.Collapsed, metadata);
  }

  /**
   * Get all targets for a skill with computed status.
   */
  private async getSkillTargetsWithStatus(skill: Skill): Promise<TargetWithStatus[]> {
    const targets: TargetWithStatus[] = [];
    
    // Get targets from skill.targets (repo targets)
    for (const target of skill.targets || []) {
      const status = await this.computeTargetStatus(skill, target);
      targets.push({
        ...target,
        status,
        skillName: skill.name
      });
    }
    
    // For shared skills, also check user home directories
    if (skill.scope === 'shared') {
      const homeTargets = await this.detectHomeDirectoryTargets(skill);
      targets.push(...homeTargets);
    }
    
    return targets;
  }

  /**
   * Detect deployed targets in user home directories for shared skills.
   */
  private async detectHomeDirectoryTargets(skill: Skill): Promise<TargetWithStatus[]> {
    const homeDir = os.homedir();
    const targets: TargetWithStatus[] = [];

    for (const { agent, path: skillDir } of USER_HOME_SKILL_DIRS) {
      const deployPath = path.join(homeDir, skillDir, skill.name, 'SKILL.md');
      
      try {
        await fs.access(deployPath);
        
        // File exists, compute status
        const status = await this.computeHomeTargetStatus(skill, deployPath);
        targets.push({
          skillName: skill.name,
          agent,
          repoPath: homeDir,
          scanPath: homeDir,
          deployPath,
          status
        });
      } catch {
        // File doesn't exist, skip
      }
    }

    return targets;
  }

  /**
   * Compute status for a home directory target.
   */
  private async computeHomeTargetStatus(skill: Skill, deployPath: string): Promise<TargetStatus> {
    // Read skill template from registry
    let templateContent = skill.template || '';
    if (skill.folderPath) {
      try {
        templateContent = await fs.readFile(path.join(skill.folderPath, 'SKILL.md'), 'utf-8');
      } catch {
        return 'missing';
      }
    }

    try {
      const deployedContent = await fs.readFile(deployPath, 'utf-8');
      const deployedHash = computeHash(deployedContent);
      const registryHash = computeHash(templateContent);
      
      if (this.diffEngine) {
        return this.diffEngine.computeStatus({
          registryHash,
          repoHash: deployedHash,
          repoFileExists: true,
          needsVars: false
        });
      }
      
      return registryHash === deployedHash ? 'synced' : 'modified';
    } catch {
      return 'missing';
    }
  }

  /**
   * Compute status for a single target.
   */
  private async computeTargetStatus(skill: Skill, target: Target): Promise<TargetStatus> {
    // If no deploy path, it's missing
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

    // If no engines provided, skip status computation
    if (!this.diffEngine || !this.templateEngine || !this.registry) {
      return 'synced'; // Assume synced if we can't compute
    }

    // Resolve vars using hierarchical system
    const resolvedVars = this.templateEngine.resolveVars(target, skill, this.registry);

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
