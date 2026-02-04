import * as vscode from 'vscode';
import type { PushService } from '../services/push-service.js';
import type { CollectService } from '../services/collect-service.js';
import type { RollbackService } from '../services/rollback-service.js';
import type { HistoryManager } from '../core/history-manager.js';
import type { RegistryStore } from '../core/registry-store.js';
import type { SkillsViewProvider, SkillTreeItem } from '../views/skills-view-provider.js';
import type { RepoStatusViewProvider, TargetTreeItem } from '../views/repo-status-view-provider.js';
import type { HistoryViewProvider, SnapshotTreeItem } from '../views/history-view-provider.js';

/**
 * Dependencies for command handlers.
 */
export interface CommandDependencies {
  pushService: PushService;
  collectService: CollectService;
  rollbackService: RollbackService;
  historyManager: HistoryManager;
  registryStore: RegistryStore;
  skillsView: SkillsViewProvider;
  repoStatusView: RepoStatusViewProvider;
  historyView: HistoryViewProvider;
}

/**
 * Register all extension commands.
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  deps: CommandDependencies
): void {
  // Refresh commands
  context.subscriptions.push(
    vscode.commands.registerCommand('skillfiles.refreshSkills', () => {
      deps.skillsView.refresh();
    }),
    vscode.commands.registerCommand('skillfiles.refreshRepoStatus', () => {
      deps.repoStatusView.refresh();
    }),
    vscode.commands.registerCommand('skillfiles.refreshHistory', () => {
      deps.historyView.refresh();
    }),
    vscode.commands.registerCommand('skillfiles.refreshAll', () => {
      deps.skillsView.refresh();
      deps.repoStatusView.refresh();
      deps.historyView.refresh();
    })
  );

  // Push command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.pushSkill',
      async (item?: TargetTreeItem) => {
        if (!item) {
          vscode.window.showErrorMessage('Please select a target to push.');
          return;
        }

        try {
          const registry = await deps.registryStore.loadRegistry();
          const skill = registry.skills.find(s => s.name === item.target.skillName);
          
          if (!skill) {
            vscode.window.showErrorMessage(`Skill not found: ${item.target.skillName}`);
            return;
          }

          await deps.pushService.push({
            skillName: item.target.skillName,
            skillPath: skill.path || '',
            deployPath: item.target.deployPath ?? '',
            vars: item.target.vars || {},
            context: { agent: item.target.agent, scope: skill.scope }
          });

          vscode.window.showInformationMessage(`Pushed ${item.target.skillName} successfully.`);
          deps.repoStatusView.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(`Push failed: ${error}`);
        }
      }
    )
  );

  // Collect command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.collectSkill',
      async (item?: TargetTreeItem) => {
        if (!item) {
          vscode.window.showErrorMessage('Please select a target to collect.');
          return;
        }

        const skillName = await vscode.window.showInputBox({
          prompt: 'Enter skill name for the collected skill',
          value: item.target.skillName
        });

        if (!skillName) {
          return;
        }

        try {
          const registry = await deps.registryStore.loadRegistry();
          
          await deps.collectService.collect({
            skillName,
            sourcePath: item.target.deployPath ?? '',
            registryRoot: registry.registryRoot || ''
          });

          vscode.window.showInformationMessage(`Collected ${skillName} successfully.`);
          deps.skillsView.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(`Collect failed: ${error}`);
        }
      }
    )
  );

  // Rollback command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.rollbackSkill',
      async (item?: SnapshotTreeItem) => {
        if (!item) {
          vscode.window.showErrorMessage('Please select a snapshot to rollback to.');
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          `Rollback ${item.skillName} to ${item.snapshot.id}?`,
          { modal: true },
          'Rollback'
        );

        if (confirm !== 'Rollback') {
          return;
        }

        try {
          const registry = await deps.registryStore.loadRegistry();
          
          await deps.rollbackService.rollback({
            skillName: item.skillName,
            snapshotId: item.snapshot.id,
            registryRoot: registry.registryRoot || ''
          });

          vscode.window.showInformationMessage(`Rolled back ${item.skillName} successfully.`);
          deps.skillsView.refresh();
          deps.historyView.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(`Rollback failed: ${error}`);
        }
      }
    )
  );

  // Preview snapshot command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.previewSnapshot',
      async (skillName: string, snapshotId: string) => {
        try {
          const content = await deps.historyManager.restoreSnapshot(skillName, snapshotId);
          
          const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'markdown'
          });
          
          await vscode.window.showTextDocument(doc, { preview: true });
        } catch (error) {
          vscode.window.showErrorMessage(`Preview failed: ${error}`);
        }
      }
    )
  );

  // Open skill command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.openSkill',
      async (item?: SkillTreeItem) => {
        if (!item) {
          return;
        }

        try {
          const skillPath = item.skill.path;
          if (skillPath) {
            const doc = await vscode.workspace.openTextDocument(skillPath);
            await vscode.window.showTextDocument(doc);
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Could not open skill: ${error}`);
        }
      }
    )
  );

  // Create skill command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.createSkill',
      async () => {
        const skillName = await vscode.window.showInputBox({
          prompt: 'Enter new skill name',
          placeHolder: 'my-coding-assistant'
        });

        if (!skillName) {
          return;
        }

        try {
          const registry = await deps.registryStore.loadRegistry();
          
          // Validate name
          if (registry.skills.find(s => s.name === skillName)) {
            vscode.window.showErrorMessage(`Skill already exists: ${skillName}`);
            return;
          }

          // Create skill template
          const content = `# ${skillName}

Write your skill instructions here.

## Guidelines

- Be specific about the behavior you want
- Include examples when helpful
`;

          const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'markdown'
          });
          
          await vscode.window.showTextDocument(doc);
          
          vscode.window.showInformationMessage(
            `Creating ${skillName}. Save the file to register it.`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Create failed: ${error}`);
        }
      }
    )
  );
}
