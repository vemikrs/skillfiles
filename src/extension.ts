import * as vscode from 'vscode';

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

// Commands
import { registerCommands } from './commands/index.js';

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
    context.subscriptions.push(skillsTreeView, repoStatusTreeView, historyTreeView);
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
      historyView
    });

    // 9. Watch for configuration changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('skillfiles')) {
          // Refresh views when settings change
          skillsView.refresh();
          repoStatusView.refresh();
          historyView.refresh();
          // Update context for Welcome Views
          void updateViewContexts(registryStore, historyManager);
        }
      })
    );

    // 10. Initial refresh and context update
    skillsView.refresh();
    repoStatusView.refresh();
    historyView.refresh();
    
    // Update context for Welcome Views (fire-and-forget)
    void updateViewContexts(registryStore, historyManager);

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
