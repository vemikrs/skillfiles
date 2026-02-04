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
 * Extension activation point.
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Skillfiles extension is now active');

  // 1. Initialize settings manager
  const settingsManager = new SettingsManager(
    () => vscode.workspace.getConfiguration('skillfiles') as unknown as { get<T>(key: string): T | undefined; update(key: string, value: unknown, global?: boolean): Promise<void> }
  );

  // 2. Get configured paths
  const registryPath = settingsManager.getRegistryPath();
  const scanRoots = settingsManager.getScanRoots();
  const settings = settingsManager.getSettings();

  // 3. Initialize guardrails
  const guardrails = new Guardrails({
    allowedPaths: scanRoots.map(r => r.path),
    excludePatterns: ['**/node_modules/**', '**/.git/**']
  });

  // 4. Initialize core components
  const registryStore = new RegistryStore(registryPath);
  const historyManager = new HistoryManager(registryPath, settings.maxSnapshots);
  const auditLog = new AuditLogStore(registryPath);
  const templateEngine = new TemplateEngine();
  const diffEngine = new DiffEngine();
  const repoScanner = new RepoScanner(scanRoots);

  // 5. Initialize services
  const pushService = new PushService(historyManager, auditLog, templateEngine);
  const collectService = new CollectService(historyManager, auditLog);
  const rollbackService = new RollbackService(historyManager, auditLog);

  // 6. Initialize view providers
  const skillsView = new SkillsViewProvider(registryStore);
  const repoStatusView = new RepoStatusViewProvider(
    registryStore,
    diffEngine,
    templateEngine
  );
  const historyView = new HistoryViewProvider(registryStore, historyManager);

  // 7. Register tree views
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('skillfiles.skillsView', skillsView),
    vscode.window.registerTreeDataProvider('skillfiles.repoStatusView', repoStatusView),
    vscode.window.registerTreeDataProvider('skillfiles.historyView', historyView)
  );

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
      }
    })
  );

  // 10. Initial refresh
  skillsView.refresh();
  repoStatusView.refresh();
  historyView.refresh();

  console.log('Skillfiles extension initialization complete');
}

/**
 * Extension deactivation.
 */
export function deactivate() {
  console.log('Skillfiles extension is now deactivated');
}
