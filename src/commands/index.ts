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

  // Copy skill path command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.copySkillPath',
      async (item?: SkillTreeItem) => {
        if (!item?.skill.path) {
          return;
        }
        await vscode.env.clipboard.writeText(item.skill.path);
        vscode.window.showInformationMessage('Skill path copied to clipboard');
      }
    )
  );

  // Delete skill command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.deleteSkill',
      async (item?: SkillTreeItem) => {
        if (!item) {
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          `Delete skill "${item.skill.name}"? This cannot be undone.`,
          { modal: true },
          'Delete'
        );

        if (confirm !== 'Delete') {
          return;
        }

        try {
          const registry = await deps.registryStore.loadRegistry();
          const skillIndex = registry.skills.findIndex(s => s.name === item.skill.name);
          
          if (skillIndex === -1) {
            vscode.window.showErrorMessage('Skill not found');
            return;
          }

          // Remove skill from registry
          registry.skills.splice(skillIndex, 1);
          
          // Remove related targets
          if (registry.targets) {
            registry.targets = registry.targets.filter(t => t.skillName !== item.skill.name);
          }

          await deps.registryStore.saveRegistry(registry);
          
          // Delete skill files if they exist
          if (item.skill.path) {
            const fs = await import('fs/promises');
            const path = await import('path');
            const skillDir = path.dirname(item.skill.path);
            try {
              await fs.rm(skillDir, { recursive: true });
            } catch {
              // Files may not exist
            }
          }

          deps.skillsView.refresh();
          deps.repoStatusView.refresh();
          vscode.window.showInformationMessage(`Deleted skill "${item.skill.name}"`);
        } catch (error) {
          vscode.window.showErrorMessage(`Delete failed: ${error}`);
        }
      }
    )
  );

  // Copy target path command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.copyTargetPath',
      async (item?: TargetTreeItem) => {
        if (!item?.target.deployPath) {
          return;
        }
        await vscode.env.clipboard.writeText(item.target.deployPath);
        vscode.window.showInformationMessage('Target path copied to clipboard');
      }
    )
  );
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
          placeHolder: 'my-coding-assistant',
          validateInput: (value) => {
            if (!value) {return 'Skill name is required';}
            if (!/^[a-z0-9-]+$/.test(value)) {
              return 'Use lowercase letters, numbers, and hyphens only';
            }
            return null;
          }
        });

        if (!skillName) {
          return;
        }

        try {
          const registry = await deps.registryStore.loadOrCreateRegistry();
          
          // Validate name
          if (registry.skills.find(s => s.name === skillName)) {
            vscode.window.showErrorMessage(`Skill already exists: ${skillName}`);
            return;
          }

          // Get registry root path
          const config = vscode.workspace.getConfiguration('skillfiles');
          const registryPath = config.get<string>('registryPath') || '~/.skillfiles';
          const registryRoot = registryPath.replace(/^~/, process.env.HOME || '');
          
          // Create skill directory and file
          const fs = await import('fs/promises');
          const path = await import('path');
          const skillDir = path.join(registryRoot, 'skills', skillName);
          const skillFilePath = path.join(skillDir, 'skill.md');
          
          // Create skill template
          const content = `# ${skillName}

Write your skill instructions here.

## Guidelines

- Be specific about the behavior you want
- Include examples when helpful

## Template Variables

You can use variables like \`{{REPO_NAME}}\` that will be replaced per-target.
`;

          // Create directory and write file
          await fs.mkdir(skillDir, { recursive: true });
          await fs.writeFile(skillFilePath, content, 'utf-8');
          
          // Register in registry
          const newSkill = {
            name: skillName,
            scope: 'repo' as const,
            registryPath: `skills/${skillName}/skill.md`,
            path: skillFilePath,
            targets: []
          };
          registry.skills.push(newSkill);
          await deps.registryStore.saveRegistry(registry);
          
          // Open the file in editor
          const doc = await vscode.workspace.openTextDocument(skillFilePath);
          await vscode.window.showTextDocument(doc);
          
          // Refresh views
          deps.skillsView.refresh();
          
          vscode.window.showInformationMessage(
            `Created skill "${skillName}" and registered in registry.`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Create failed: ${error}`);
        }
      }
    )
  );

  // Show diff command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.showDiff',
      async (item?: TargetTreeItem) => {
        if (!item) {
          vscode.window.showWarningMessage('Select a target to show diff');
          return;
        }

        try {
          const registry = await deps.registryStore.loadRegistry();
          const skill = registry.skills.find(s => s.name === item.target.skillName);
          
          if (!skill?.path) {
            vscode.window.showErrorMessage('Skill not found');
            return;
          }

          const leftUri = vscode.Uri.file(skill.path);
          const rightUri = vscode.Uri.file(item.target.deployPath ?? '');
          
          await vscode.commands.executeCommand(
            'vscode.diff',
            leftUri,
            rightUri,
            `${item.target.skillName}: Registry ↔ Deployed`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Show diff failed: ${error}`);
        }
      }
    )
  );

  // Bulk push command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.bulkPush',
      async () => {
        const confirm = await vscode.window.showWarningMessage(
          'Push all skills to their targets?',
          'Yes',
          'Cancel'
        );

        if (confirm !== 'Yes') {
          return;
        }

        try {
          const registry = await deps.registryStore.loadRegistry();
          let pushCount = 0;
          let errorCount = 0;

          for (const target of registry.targets || []) {
            try {
              const skill = registry.skills.find(s => s.name === target.skillName);
              if (!skill?.path || !target.deployPath) {continue;}

              await deps.pushService.push({
                skillName: target.skillName,
                skillPath: skill.path,
                deployPath: target.deployPath,
                vars: target.vars || {},
                context: { scope: 'repo' }
              });
              pushCount++;
            } catch {
              errorCount++;
            }
          }

          deps.repoStatusView.refresh();
          vscode.window.showInformationMessage(
            `Bulk push complete: ${pushCount} succeeded, ${errorCount} failed`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Bulk push failed: ${error}`);
        }
      }
    )
  );

  // Bulk collect command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.bulkCollect',
      async () => {
        const confirm = await vscode.window.showWarningMessage(
          'Collect all skills from their targets?',
          'Yes',
          'Cancel'
        );

        if (confirm !== 'Yes') {
          return;
        }

        try {
          const registry = await deps.registryStore.loadRegistry();
          let collectCount = 0;
          let errorCount = 0;

          for (const target of registry.targets || []) {
            try {
              const skill = registry.skills.find(s => s.name === target.skillName);
              if (!skill?.path || !target.deployPath) {continue;}

              await deps.collectService.collect({
                skillName: target.skillName,
                sourcePath: target.deployPath,
                registryRoot: skill.path.replace(/\/skills\/.*$/, '')
              });
              collectCount++;
            } catch {
              errorCount++;
            }
          }

          deps.skillsView.refresh();
          deps.historyView.refresh();
          vscode.window.showInformationMessage(
            `Bulk collect complete: ${collectCount} succeeded, ${errorCount} failed`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Bulk collect failed: ${error}`);
        }
      }
    )
  );

  // Open audit log command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.openAuditLog',
      async () => {
        try {
          const config = vscode.workspace.getConfiguration('skillfiles');
          const registryPath = config.get<string>('registryPath') || '~/.skillfiles';
          const expandedPath = registryPath.replace(/^~/, process.env.HOME || '');
          const auditLogPath = vscode.Uri.file(`${expandedPath}/audit.log`);
          
          const doc = await vscode.workspace.openTextDocument(auditLogPath);
          await vscode.window.showTextDocument(doc, { preview: true });
        } catch (error) {
          vscode.window.showErrorMessage(`Open audit log failed: ${error}`);
        }
      }
    )
  );

  // Setup scan roots command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.setupScanRoots',
      async () => {
        const folders = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: true,
          openLabel: 'Select Scan Root',
          title: 'Select directories containing your repositories'
        });

        if (!folders || folders.length === 0) {
          return;
        }

        try {
          const config = vscode.workspace.getConfiguration('skillfiles');
          const existingRoots = config.get<Array<{key: string; path: string}>>('scanRoots') || [];
          
          const newRoots = folders.map(folder => {
            const folderPath = folder.fsPath;
            const folderName = folderPath.split('/').pop() || 'root';
            return {
              key: folderName,
              path: folderPath
            };
          });

          // Merge with existing, avoiding duplicates
          const mergedRoots = [...existingRoots];
          for (const newRoot of newRoots) {
            if (!mergedRoots.some(r => r.path === newRoot.path)) {
              mergedRoots.push(newRoot);
            }
          }

          await config.update('scanRoots', mergedRoots, vscode.ConfigurationTarget.Global);
          
          vscode.window.showInformationMessage(
            `Added ${newRoots.length} scan root(s). Total: ${mergedRoots.length}`
          );
          
          // Offer to discover skills
          const discover = await vscode.window.showInformationMessage(
            'Would you like to scan for existing skills now?',
            'Yes', 'No'
          );
          if (discover === 'Yes') {
            await vscode.commands.executeCommand('skillfiles.discoverSkills');
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Setup failed: ${error}`);
        }
      }
    )
  );

  // Discover skills command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.discoverSkills',
      async () => {
        const config = vscode.workspace.getConfiguration('skillfiles');
        const scanRoots = config.get<Array<{key: string; path: string}>>('scanRoots') || [];

        if (scanRoots.length === 0) {
          const setup = await vscode.window.showWarningMessage(
            'No scan roots configured. Set up scan roots first?',
            'Setup Scan Roots', 'Cancel'
          );
          if (setup === 'Setup Scan Roots') {
            await vscode.commands.executeCommand('skillfiles.setupScanRoots');
          }
          return;
        }

        try {
          // Import RepoScanner dynamically
          const { RepoScanner } = await import('../core/repo-scanner.js');
          const scanner = new RepoScanner(scanRoots);

          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Scanning repositories...',
            cancellable: false
          }, async (progress) => {
            // Scan for repos
            progress.report({ message: 'Finding repositories...' });
            const repos = await scanner.scan();
            
            if (repos.length === 0) {
              vscode.window.showInformationMessage('No repositories found in scan roots.');
              return;
            }

            // Detect skill files in each repo
            progress.report({ message: `Checking ${repos.length} repositories for skills...` });
            
            interface DiscoveredSkill {
              repoName: string;
              repoPath: string;
              agent: string;
              skillPath: string;
            }
            
            const discoveredSkills: DiscoveredSkill[] = [];
            
            for (const repo of repos) {
              const skillFiles = await scanner.detectSkillFiles(repo.path);
              for (const skillFile of skillFiles) {
                discoveredSkills.push({
                  repoName: repo.name,
                  repoPath: repo.path,
                  agent: skillFile.agent,
                  skillPath: skillFile.path
                });
              }
            }

            if (discoveredSkills.length === 0) {
              vscode.window.showInformationMessage(
                `Scanned ${repos.length} repositories. No skill files found.`
              );
              return;
            }

            // Show quick pick to select skills to import
            const items = discoveredSkills.map(skill => ({
              label: `${skill.repoName}`,
              description: `${skill.agent}`,
              detail: skill.skillPath,
              skill
            }));

            const selected = await vscode.window.showQuickPick(items, {
              canPickMany: true,
              placeHolder: 'Select skills to import into registry',
              title: `Found ${discoveredSkills.length} skill(s)`
            });

            if (!selected || selected.length === 0) {
              return;
            }

            // Import selected skills
            const fs = await import('fs/promises');
            const path = await import('path');
            const registry = await deps.registryStore.loadOrCreateRegistry();
            const registryPath = config.get<string>('registryPath') || '~/.skillfiles';
            const registryRoot = registryPath.replace(/^~/, process.env.HOME || '');
            
            let importCount = 0;
            for (const item of selected) {
              const { skill } = item;
              const skillName = `${skill.repoName}-${skill.agent}`;
              
              // Check if already exists
              if (registry.skills.find(s => s.name === skillName)) {
                continue;
              }

              // Copy skill file to registry
              const skillDir = path.join(registryRoot, 'skills', skillName);
              const skillFilePath = path.join(skillDir, 'skill.md');
              
              await fs.mkdir(skillDir, { recursive: true });
              await fs.copyFile(skill.skillPath, skillFilePath);
              
              // Add to registry
              registry.skills.push({
                name: skillName,
                scope: 'repo',
                registryPath: `skills/${skillName}/skill.md`,
                path: skillFilePath,
                targets: [{
                  skillName,
                  repoPath: skill.repoPath,
                  scanPath: skill.repoPath,
                  agent: skill.agent,
                  deployPath: skill.skillPath
                }]
              });
              
              importCount++;
            }

            await deps.registryStore.saveRegistry(registry);
            deps.skillsView.refresh();
            deps.repoStatusView.refresh();
            
            vscode.window.showInformationMessage(
              `Imported ${importCount} skill(s) from ${selected.length} selected.`
            );
          });
        } catch (error) {
          vscode.window.showErrorMessage(`Discovery failed: ${error}`);
        }
      }
    )
  );
}
