import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

// Core modules
import { RegistryStore } from './core/registry-store.js';
import { HistoryManager } from './core/history-manager.js';
import { AuditLogStore } from './core/audit-log-store.js';
import { TemplateEngine } from './core/template-engine.js';
import { DiffEngine } from './core/diff-engine.js';
import { RepoScanner } from './core/repo-scanner.js';
import { SettingsManager } from './core/settings-manager.js';
import { Guardrails } from './core/guardrails.js';

// Services
import { PushService } from './services/push-service.js';
import { CollectService } from './services/collect-service.js';
import { RollbackService } from './services/rollback-service.js';

// Views
import { SkillsViewProvider } from './views/skills-view-provider.js';
import { RepoStatusViewProvider } from './views/repo-status-view-provider.js';
import { HistoryViewProvider } from './views/history-view-provider.js';
import { VariablesViewProvider } from './views/variables-view-provider.js';

// Commands
import { registerCommands } from './commands/index.js';

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

interface DetectedSkill {
  name: string;
  agent: string;
  sourcePath: string;
}

/**
 * Detect skills in user home directories that are not registered.
 * Returns list of unregistered skills for user to review.
 */
async function detectUnregisteredHomeSkills(registryStore: RegistryStore): Promise<DetectedSkill[]> {
  const homeDir = os.homedir();
  const registry = await registryStore.loadOrCreateRegistry();
  const unregistered: DetectedSkill[] = [];

  for (const { agent, path: skillDir } of USER_HOME_SKILL_DIRS) {
    const fullPath = path.join(homeDir, skillDir);
    
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const skillPath = path.join(fullPath, entry.name, 'SKILL.md');
        try {
          await fs.access(skillPath);
          
          // Check if skill already exists in registry
          const existingSkill = registry.skills.find(s => s.name === entry.name);
          
          if (!existingSkill) {
            unregistered.push({
              name: entry.name,
              agent,
              sourcePath: skillPath
            });
          }
        } catch {
          // SKILL.md doesn't exist, skip
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return unregistered;
}

/**
 * Prompt user to collect detected skills from home directories.
 */
async function promptCollectHomeSkills(
  unregistered: DetectedSkill[],
  collectService: { collect: (opts: { skillName: string; sourceFolderPath: string; registryRoot: string }) => Promise<unknown> },
  registryRoot: string,
  onComplete: () => void
): Promise<void> {
  if (unregistered.length === 0) return;

  const skillList = unregistered.map(s => `${s.name} (${s.agent})`).join(', ');
  const action = await vscode.window.showInformationMessage(
    `Found ${unregistered.length} skill(s) in home directories: ${skillList}`,
    'Collect All',
    'Ignore'
  );

  if (action === 'Collect All') {
    let collected = 0;
    for (const skill of unregistered) {
      try {
        await collectService.collect({
          skillName: skill.name,
          sourceFolderPath: skill.sourcePath,
          registryRoot
        });
        collected++;
      } catch (error) {
        console.warn(`[Skillfiles] Failed to collect ${skill.name}:`, error);
      }
    }
    vscode.window.showInformationMessage(`Collected ${collected} skill(s) to registry.`);
    onComplete();
  }
}

/**
 * Update VS Code context variables for Welcome View visibility.
 */
async function updateViewContexts(
  registryStore: RegistryStore,
  historyManager: HistoryManager
): Promise<void> {
  try {
    const registry = await registryStore.loadRegistry();
    const skills = Object.keys(registry.skills || {});
    const targets = registry.targets || [];
    
    // Check if any skill has history
    let hasHistory = false;
    for (const skillName of skills) {
      const snapshots = await historyManager.listSnapshots(skillName);
      if (snapshots.length > 0) {
        hasHistory = true;
        break;
      }
    }
    
    // Set context variables
    await vscode.commands.executeCommand('setContext', 'skillfiles.noSkills', skills.length === 0);
    await vscode.commands.executeCommand('setContext', 'skillfiles.noRepos', targets.length === 0);
    await vscode.commands.executeCommand('setContext', 'skillfiles.noHistory', !hasHistory);
  } catch {
    // Registry not found - show welcome view
    await vscode.commands.executeCommand('setContext', 'skillfiles.noSkills', true);
    await vscode.commands.executeCommand('setContext', 'skillfiles.noRepos', true);
    await vscode.commands.executeCommand('setContext', 'skillfiles.noHistory', true);
  }
}

/**
 * Extension activation point.
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Skillfiles extension is now active');

  try {
    // 1. Initialize settings manager
    const settingsManager = new SettingsManager(
      () => vscode.workspace.getConfiguration('skillfiles') as unknown as { get<T>(key: string): T | undefined; update(key: string, value: unknown, global?: boolean): Promise<void> }
    );

    // 2. Get configured paths
    const registryPath = settingsManager.getRegistryPath();
    console.log('[Skillfiles] Registry path:', registryPath);
    const scanRoots = settingsManager.getScanRoots();
    const settings = settingsManager.getSettings();

    // 3. Initialize guardrails
    const _guardrails = new Guardrails({
      allowedPaths: scanRoots.map(r => r.path),
      excludePatterns: ['**/node_modules/**', '**/.git/**']
    });

    // 4. Initialize core components
    const registryStore = new RegistryStore(registryPath);
    const historyManager = new HistoryManager(registryPath, settings.maxSnapshots);
    const auditLog = new AuditLogStore(registryPath);
    const templateEngine = new TemplateEngine();
    const diffEngine = new DiffEngine();
    const _repoScanner = new RepoScanner(scanRoots);

    // 5. Initialize services
    const pushService = new PushService(historyManager, auditLog, templateEngine);
    const collectService = new CollectService(historyManager, auditLog);
    const rollbackService = new RollbackService(historyManager, auditLog);

    // 6. Initialize view providers
    console.log('[Skillfiles] Initializing view providers...');
    const skillsView = new SkillsViewProvider(registryStore);
    const repoStatusView = new RepoStatusViewProvider(
      registryStore,
      diffEngine,
      templateEngine
    );
    const historyView = new HistoryViewProvider(registryStore, historyManager);
    const variablesView = new VariablesViewProvider(registryStore, templateEngine);

    // 7. Register tree views using createTreeView for more reliable control
    console.log('[Skillfiles] Creating tree views...');
    const skillsTreeView = vscode.window.createTreeView('skillfiles.skillsView', {
      treeDataProvider: skillsView,
      showCollapseAll: true
    });
    const repoStatusTreeView = vscode.window.createTreeView('skillfiles.repoStatusView', {
      treeDataProvider: repoStatusView,
      showCollapseAll: true
    });
    const historyTreeView = vscode.window.createTreeView('skillfiles.historyView', {
      treeDataProvider: historyView,
      showCollapseAll: true
    });
    const variablesTreeView = vscode.window.createTreeView('skillfiles.variablesView', {
      treeDataProvider: variablesView,
      showCollapseAll: true
    });
    context.subscriptions.push(skillsTreeView, repoStatusTreeView, historyTreeView, variablesTreeView);
    console.log('[Skillfiles] Tree views created successfully');

    // 8. Register commands
    registerCommands(context, {
      pushService,
      collectService,
      rollbackService,
      historyManager,
      registryStore,
      skillsView,
      repoStatusView,
      historyView,
      variablesView
    });

    // 9. Watch for configuration changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('skillfiles')) {
          // Refresh views when settings change
          skillsView.refresh();
          repoStatusView.refresh();
          historyView.refresh();
          variablesView.refresh();
          // Update context for Welcome Views
          void updateViewContexts(registryStore, historyManager);
        }
      })
    );

    // 10. Initial refresh and context update
    skillsView.refresh();
    repoStatusView.refresh();
    historyView.refresh();
    variablesView.refresh();
    
    // Update context for Welcome Views (fire-and-forget)
    void updateViewContexts(registryStore, historyManager);

    // 11. Detect and offer to collect skills from home directories
    void detectUnregisteredHomeSkills(registryStore).then(unregistered => {
      if (unregistered.length > 0) {
        void promptCollectHomeSkills(unregistered, collectService, registryPath, () => {
          skillsView.refresh();
          repoStatusView.refresh();
          variablesView.refresh();
        });
      }
    }).catch(err => {
      console.warn('[Skillfiles] Failed to detect home skills:', err);
    });

    console.log('[Skillfiles] Extension initialization complete');
  } catch (error) {
    console.error('[Skillfiles] Extension activation failed:', error);
    vscode.window.showErrorMessage(`Skillfiles extension failed to activate: ${error}`);
  }
}

/**
 * Extension deactivation.
 */
export function deactivate() {
  console.log('Skillfiles extension is now deactivated');
}
