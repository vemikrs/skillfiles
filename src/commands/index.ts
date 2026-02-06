import * as vscode from 'vscode';
import type { PushService } from '../services/push-service.js';
import type { CollectService } from '../services/collect-service.js';
import type { RollbackService } from '../services/rollback-service.js';
import type { HistoryManager } from '../core/history-manager.js';
import type { RegistryStore } from '../core/registry-store.js';
import type { SkillsViewProvider, SkillTreeItem, ResourceTreeItem } from '../views/skills-view-provider.js';
import type { RepoStatusViewProvider, TargetTreeItem, RepoTreeItem } from '../views/repo-status-view-provider.js';
import type { HistoryViewProvider, SnapshotTreeItem } from '../views/history-view-provider.js';
import type { VariablesViewProvider, VariableTreeItem, DefaultVariableTreeItem } from '../views/variables-view-provider.js';

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
  variablesView: VariablesViewProvider;
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

  // Push command - supports both SkillTreeItem and TargetTreeItem
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.pushSkill',
      async (item?: TargetTreeItem | SkillTreeItem) => {
        if (!item) {
          vscode.window.showErrorMessage('Please select a skill or target to push.');
          return;
        }

        try {
          const registry = await deps.registryStore.loadRegistry();

          // Check if this is a SkillTreeItem (has 'skill' property)
          if ('skill' in item) {
            // SkillTreeItem: push to all targets for this skill
            const skillItem = item as SkillTreeItem;
            
            // Find the skill in registry to get fresh targets
            const registrySkill = registry.skills.find(s => s.name === skillItem.skill.name);
            
            // Merge targets from both registry.targets and skill.targets
            const registryTargets = registry.targets?.filter(t => t.skillName === skillItem.skill.name) || [];
            const skillTargets = registrySkill?.targets || [];
            
            // For shared skills, also detect deployed targets in user home directories
            const detectedTargets: typeof registryTargets = [];
            if (skillItem.skill.scope === 'shared') {
              const fs = await import('fs/promises');
              const path = await import('path');
              const os = await import('os');
              const { getHomeSkillDirs } = await import('../core/constants.js');
              
              const homeDir = os.homedir();
              for (const { agent, path: skillDir } of getHomeSkillDirs()) {
                const deployPath = path.join(homeDir, skillDir, skillItem.skill.name, 'SKILL.md');
                try {
                  await fs.access(deployPath);
                  // File exists, add as detected target
                  detectedTargets.push({
                    skillName: skillItem.skill.name,
                    agent,
                    repoPath: homeDir,
                    scanPath: homeDir,
                    deployPath
                  });
                } catch {
                  // File doesn't exist, skip
                }
              }
            }
            
            // Deduplicate by repoPath + agent combination
            const targetMap = new Map<string, typeof registryTargets[number]>();
            for (const t of [...registryTargets, ...skillTargets, ...detectedTargets]) {
              targetMap.set(`${t.repoPath}:${t.agent}`, t);
            }
            const targets = Array.from(targetMap.values());
            
            if (targets.length === 0) {
              vscode.window.showWarningMessage(`No targets registered for skill: ${skillItem.skill.name}`);
              return;
            }

            let pushCount = 0;
            let errorCount = 0;

            for (const target of targets) {
              try {
                if (!skillItem.skill.folderPath || !target.deployPath) {continue;}

                // Verify skill folder exists before pushing
                const fsCheck = await import('fs/promises');
                try {
                  await fsCheck.access(skillItem.skill.folderPath);
                } catch {
                  vscode.window.showErrorMessage(
                    `Skill folder not found: ${skillItem.skill.folderPath}. ` +
                    `The skill may need to be re-imported.`
                  );
                  return;
                }

                const path = await import('path');
                await deps.pushService.push({
                  skillName: skillItem.skill.name,
                  skillFolderPath: skillItem.skill.folderPath,
                  deployFolderPath: path.dirname(target.deployPath),
                  vars: target.vars || {},
                  context: { agent: target.agent, scope: skillItem.skill.scope }
                });
                pushCount++;
              } catch {
                errorCount++;
              }
            }

            vscode.window.showInformationMessage(
              `Pushed ${skillItem.skill.name} to ${pushCount} target(s). ${errorCount} failed.`
            );
            deps.repoStatusView.refresh();
          } else {
            // TargetTreeItem: push to single target
            const targetItem = item as TargetTreeItem;
            const skill = registry.skills.find(s => s.name === targetItem.target.skillName);
            
            if (!skill) {
              vscode.window.showErrorMessage(`Skill not found: ${targetItem.target.skillName}`);
              return;
            }

            const path = await import('path');
            await deps.pushService.push({
              skillName: targetItem.target.skillName,
              skillFolderPath: skill.folderPath || '',
              deployFolderPath: path.dirname(targetItem.target.deployPath ?? ''),
              vars: targetItem.target.vars || {},
              context: { agent: targetItem.target.agent, scope: skill.scope }
            });

            vscode.window.showInformationMessage(`Pushed ${targetItem.target.skillName} successfully.`);
            deps.repoStatusView.refresh();
          }
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
            sourceFolderPath: item.target.deployPath ?? '',
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
          const path = await import('path');
          const fs = await import('fs/promises');
          const os = await import('os');
          
          // Build snapshot directory path
          const config = vscode.workspace.getConfiguration('skillfiles');
          const registryPath = config.get<string>('registryPath') 
            || path.join(os.homedir(), '.skillfiles');
          const snapshotDir = path.join(registryPath, 'skills', skillName, 'history', snapshotId);
          
          // Check for folder snapshot (has content/ directory)
          const contentDir = path.join(snapshotDir, 'content');
          let content: string;
          
          try {
            await fs.stat(contentDir);
            // Folder snapshot - look for SKILL.md in content/
            const skillMdPath = path.join(contentDir, 'SKILL.md');
            try {
              content = await fs.readFile(skillMdPath, 'utf-8');
            } catch {
              // Fallback to skill.md (lowercase)
              content = await fs.readFile(path.join(contentDir, 'skill.md'), 'utf-8');
            }
          } catch {
            // File snapshot - use skill.md directly
            content = await fs.readFile(path.join(snapshotDir, 'skill.md'), 'utf-8');
          }
          
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
        if (!item?.skill.folderPath) {
          return;
        }
        await vscode.env.clipboard.writeText(item.skill.folderPath);
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
          if (item.skill.folderPath) {
            const fs = await import('fs/promises');
            const path = await import('path');
            const skillDir = path.dirname(item.skill.folderPath);
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
          const skillPath = item.skill.folderPath;
          if (skillPath) {
            // folderPath is the skill folder, open SKILL.md inside it
            const path = await import('path');
            const skillMdPath = path.join(skillPath, 'SKILL.md');
            const doc = await vscode.workspace.openTextDocument(skillMdPath);
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
        // First, select scope
        const scopeChoice = await vscode.window.showQuickPick(
          [
            { label: 'Shared', description: 'Reusable across repositories (~/.agent/skills/)', value: 'shared' as const },
            { label: 'Repository', description: 'Repository-specific skill', value: 'repo' as const }
          ],
          {
            placeHolder: 'Select skill scope',
            title: 'Create New Skill'
          }
        );

        if (!scopeChoice) {
          return;
        }

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

          const fs = await import('fs/promises');
          const path = await import('path');
          const os = await import('os');
          
          let skillDir: string;
          
          if (scopeChoice.value === 'shared') {
            // Shared skills go to ~/.agent/skills/
            skillDir = path.join(os.homedir(), '.agent', 'skills', skillName);
          } else {
            // Repo skills go to registry root
            const config = vscode.workspace.getConfiguration('skillfiles');
            const registryPath = config.get<string>('registryPath') || '~/.skillfiles';
            const registryRoot = registryPath.replace(/^~/, process.env.HOME || '');
            skillDir = path.join(registryRoot, 'skills', skillName);
          }
          
          const skillFilePath = path.join(skillDir, 'SKILL.md');
          
          // Create skill template following agentskills.io standard
          const content = `---
name: ${skillName}
description: |
  A brief description of what this skill does and when to use it.
  This helps AI agents determine if this skill is relevant for a task.
---

# ${skillName}

Detailed instructions for the AI agent on how to perform this skill.

## When to Use

- Describe specific scenarios when this skill should be applied
- Include trigger phrases or patterns

## Guidelines

- Be specific about the behavior you want
- Include examples when helpful

## Examples

\`\`\`
Example usage or code snippet
\`\`\`

## Template Variables

You can use variables like \`{{REPO_NAME}}\` that will be replaced per-target.
`;

          // Create directory and write file
          await fs.mkdir(skillDir, { recursive: true });
          await fs.writeFile(skillFilePath, content, 'utf-8');
          
          // Register in registry
          const newSkill = {
            name: skillName,
            scope: scopeChoice.value,
            registryPath: `skills/${skillName}/SKILL.md`,
            folderPath: skillDir,
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
            `Created ${scopeChoice.value} skill "${skillName}"`
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
          
          if (!skill?.folderPath) {
            vscode.window.showErrorMessage('Skill not found');
            return;
          }

          const leftUri = vscode.Uri.file(skill.folderPath);
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
              if (!skill?.folderPath || !target.deployPath) {continue;}

              const path = await import('path');
              await deps.pushService.push({
                skillName: target.skillName,
                skillFolderPath: skill.folderPath,
                deployFolderPath: path.dirname(target.deployPath),
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
              if (!skill?.folderPath || !target.deployPath) {continue;}

              await deps.collectService.collect({
                skillName: target.skillName,
                sourceFolderPath: target.deployPath,
                registryRoot: skill.folderPath.replace(/\/skills\/.*$/, '')
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
              skillName: string;
              skillFolderPath: string;
            }
            
            const discoveredSkills: DiscoveredSkill[] = [];
            const path = await import('path');
            
            for (const repo of repos) {
              const skillFolders = await scanner.detectSkillFolders(repo.path);
              for (const skillFolder of skillFolders) {
                // Extract skill name from folder path (parent directory of SKILL.md)
                const skillDir = path.dirname(skillFolder.path);
                const skillName = path.basename(skillDir);
                
                discoveredSkills.push({
                  repoName: repo.name,
                  repoPath: repo.path,
                  agent: skillFolder.agent,
                  skillName,
                  skillFolderPath: skillFolder.folderPath
                });
              }
            }

            // Save all scanned repos to registry (for Variables view)
            const scanRegistry = await deps.registryStore.loadRegistry();
            scanRegistry.scannedRepos = repos.map(r => r.path);
            await deps.registryStore.saveRegistry(scanRegistry);
            deps.variablesView.refresh();

            if (discoveredSkills.length === 0) {
              vscode.window.showInformationMessage(
                `Scanned ${repos.length} repositories. No skill files found.`
              );
              return;
            }

            // Show quick pick to select skills to import
            const items = discoveredSkills.map(skill => ({
              label: skill.skillName,
              description: `${skill.agent} · ${skill.repoName}`,
              detail: skill.skillFolderPath,
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

              // Copy entire skill folder to registry
              const skillDir = path.join(registryRoot, 'skills', skillName);
              
              // Inline recursive copy
              const copyDir = async (src: string, dest: string): Promise<void> => {
                await fs.mkdir(dest, { recursive: true });
                const entries = await fs.readdir(src, { withFileTypes: true });
                for (const entry of entries) {
                  const srcPath = path.join(src, entry.name);
                  const destPath = path.join(dest, entry.name);
                  if (entry.isDirectory()) {
                    await copyDir(srcPath, destPath);
                  } else {
                    await fs.copyFile(srcPath, destPath);
                  }
                }
              };
              await copyDir(skill.skillFolderPath, skillDir);
              
              // Add to registry
              registry.skills.push({
                name: skillName,
                scope: 'repo',
                registryPath: `skills/${skillName}`,
                folderPath: skillDir,
                targets: [{
                  skillName,
                  repoPath: skill.repoPath,
                  scanPath: skill.repoPath,
                  agent: skill.agent,
                  deployPath: skill.skillFolderPath
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

  // Scan shared skills from user home directories (e.g., ~/.agent, ~/.gemini)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.scanSharedSkills',
      async () => {
        try {
          const path = await import('path');
          const fs = await import('fs/promises');
          const os = await import('os');
          
          const config = vscode.workspace.getConfiguration('skillfiles');
          const agentProfiles = config.get<Record<string, {vendor: string; skillFolderPath: string; skillFileName: string}>>('agentProfiles') || {};
          let registryPath = config.get<string>('registryPath') || path.join(os.homedir(), '.skillfiles');
          // Expand ~ to home directory
          if (registryPath.startsWith('~')) {
            registryPath = path.join(os.homedir(), registryPath.slice(1));
          }

          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Scanning shared skill directories...',
            cancellable: false
          }, async (progress) => {
            interface FoundSkill {
              agent: string;
              name: string;
              folderPath: string;
            }
            
            const foundSkills: FoundSkill[] = [];

            // Scan each agent's home directory
            for (const [agentName, profile] of Object.entries(agentProfiles)) {
              const folderBase = profile.skillFolderPath.split('/')[0] || `.${agentName}`;
              const agentSkillsDir = path.join(os.homedir(), folderBase, 'skills');
              
              progress.report({ message: `Checking ~/${folderBase}/skills/...` });
              
              try {
                const entries = await fs.readdir(agentSkillsDir, { withFileTypes: true });
                
                for (const entry of entries) {
                  if (entry.isDirectory()) {
                    // Check for SKILL.md file
                    const skillMdPath = path.join(agentSkillsDir, entry.name, 'SKILL.md');
                    try {
                      await fs.stat(skillMdPath);
                      foundSkills.push({
                        agent: agentName,
                        name: entry.name,
                        folderPath: path.join(agentSkillsDir, entry.name)
                      });
                    } catch {
                      // No SKILL.md, skip
                    }
                  }
                }
              } catch {
                // Directory doesn't exist, skip
              }
            }

            if (foundSkills.length === 0) {
              vscode.window.showInformationMessage(
                'No shared skills found in user home directories.'
              );
              return;
            }

            // Show quick pick to select skills to import
            const items = foundSkills.map(s => ({
              label: s.name,
              description: `~/.${s.agent.replace('.', '')}/skills/`,
              detail: s.agent,
              picked: true,
              skill: s
            }));

            const selected = await vscode.window.showQuickPick(items, {
              canPickMany: true,
              placeHolder: `Found ${foundSkills.length} skill(s). Select which to import.`,
              title: 'Import Shared Skills'
            });

            if (!selected || selected.length === 0) {
              return;
            }

            // Import selected skills
            const registry = await deps.registryStore.loadRegistry();
            let importCount = 0;

            for (const item of selected) {
              const skill = item.skill;
              
              // Check if already registered
              if (registry.skills.some(s => s.name === skill.name && s.scope === 'shared')) {
                continue;
              }

              // Copy to registry
              const skillDir = path.join(registryPath, 'skills', skill.name);
              await fs.mkdir(skillDir, { recursive: true });

              // Recursive copy function
              const copyDir = async (src: string, dest: string) => {
                await fs.mkdir(dest, { recursive: true });
                const entries = await fs.readdir(src, { withFileTypes: true });
                for (const entry of entries) {
                  const srcPath = path.join(src, entry.name);
                  const destPath = path.join(dest, entry.name);
                  if (entry.isDirectory()) {
                    await copyDir(srcPath, destPath);
                  } else {
                    await fs.copyFile(srcPath, destPath);
                  }
                }
              };
              await copyDir(skill.folderPath, skillDir);

              // Auto-detect existing deployed targets in user home directories
              const { getHomeSkillDirs } = await import('../core/constants.js');
              const homeDir = os.homedir();
              const detectedTargets: Array<{
                skillName: string;
                repoPath: string;
                scanPath: string;
                agent: string;
                deployPath: string;
              }> = [];
              
              for (const { agent, path: skillDirPath } of getHomeSkillDirs()) {
                const deployPath = path.join(homeDir, skillDirPath, skill.name, 'SKILL.md');
                try {
                  await fs.access(deployPath);
                  // File exists, add as detected target
                  detectedTargets.push({
                    skillName: skill.name,
                    agent,
                    repoPath: homeDir,
                    scanPath: homeDir,
                    deployPath
                  });
                } catch {
                  // File doesn't exist, skip
                }
              }

              // Add to registry as shared skill with detected targets
              registry.skills.push({
                name: skill.name,
                scope: 'shared',
                registryPath: `skills/${skill.name}`,
                folderPath: skillDir,
                targets: detectedTargets
              });

              importCount++;
            }

            await deps.registryStore.saveRegistry(registry);
            deps.skillsView.refresh();
            deps.repoStatusView.refresh();

            vscode.window.showInformationMessage(
              `Imported ${importCount} shared skill(s).`
            );
          });
        } catch (error) {
          vscode.window.showErrorMessage(`Import shared skills failed: ${error}`);
        }
      }
    )
  );

  // Open target file command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.openTarget',
      async (item?: TargetTreeItem) => {
        if (!item?.target.deployPath) {
          vscode.window.showWarningMessage('No deploy path set for this target.');
          return;
        }

        try {
          const doc = await vscode.workspace.openTextDocument(item.target.deployPath);
          await vscode.window.showTextDocument(doc);
        } catch (error) {
          vscode.window.showErrorMessage(`Could not open target file: ${error}`);
        }
      }
    )
  );

  // Push all skills in repo command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.pushAllInRepo',
      async (item?: RepoTreeItem) => {
        if (!item) {
          vscode.window.showErrorMessage('Please select a repository.');
          return;
        }

        try {
          const registry = await deps.registryStore.loadRegistry();
          const targets = registry.targets?.filter(t => t.repoPath === item.repoPath) || [];
          
          if (targets.length === 0) {
            vscode.window.showInformationMessage('No targets in this repository.');
            return;
          }

          const confirm = await vscode.window.showWarningMessage(
            `Push all ${targets.length} skills in ${item.repoPath}?`,
            'Yes',
            'Cancel'
          );

          if (confirm !== 'Yes') {
            return;
          }

          let pushCount = 0;
          let errorCount = 0;

          for (const target of targets) {
            try {
              const skill = registry.skills.find(s => s.name === target.skillName);
              if (!skill?.folderPath || !target.deployPath) {continue;}

              const path = await import('path');
              await deps.pushService.push({
                skillName: target.skillName,
                skillFolderPath: skill.folderPath,
                deployFolderPath: path.dirname(target.deployPath),
                vars: target.vars || {},
                context: { agent: target.agent, scope: skill.scope }
              });
              pushCount++;
            } catch {
              errorCount++;
            }
          }

          deps.repoStatusView.refresh();
          vscode.window.showInformationMessage(
            `Pushed ${pushCount} skills in ${item.repoPath}. ${errorCount} failed.`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Push all failed: ${error}`);
        }
      }
    )
  );

  // Collect all skills in repo command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.collectAllInRepo',
      async (item?: RepoTreeItem) => {
        if (!item) {
          vscode.window.showErrorMessage('Please select a repository.');
          return;
        }

        try {
          const registry = await deps.registryStore.loadRegistry();
          const targets = registry.targets?.filter(t => t.repoPath === item.repoPath) || [];
          
          if (targets.length === 0) {
            vscode.window.showInformationMessage('No targets in this repository.');
            return;
          }

          const confirm = await vscode.window.showWarningMessage(
            `Collect all ${targets.length} skills from ${item.repoPath}?`,
            'Yes',
            'Cancel'
          );

          if (confirm !== 'Yes') {
            return;
          }

          let collectCount = 0;
          let errorCount = 0;

          for (const target of targets) {
            try {
              const skill = registry.skills.find(s => s.name === target.skillName);
              if (!skill?.folderPath || !target.deployPath) {continue;}

              await deps.collectService.collect({
                skillName: target.skillName,
                sourceFolderPath: target.deployPath,
                registryRoot: skill.folderPath.replace(/\/skills\/.*$/, '')
              });
              collectCount++;
            } catch {
              errorCount++;
            }
          }

          deps.skillsView.refresh();
          deps.historyView.refresh();
          vscode.window.showInformationMessage(
            `Collected ${collectCount} skills from ${item.repoPath}. ${errorCount} failed.`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Collect all failed: ${error}`);
        }
      }
    )
  );

  // Clear history command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.clearHistory',
      async () => {
        const confirm = await vscode.window.showWarningMessage(
          'Clear all history snapshots? This cannot be undone.',
          { modal: true },
          'Clear All'
        );

        if (confirm !== 'Clear All') {
          return;
        }

        try {
          const config = vscode.workspace.getConfiguration('skillfiles');
          const registryPath = config.get<string>('registryPath') || '~/.skillfiles';
          const expandedPath = registryPath.replace(/^~/, process.env.HOME || '');
          
          const fs = await import('fs/promises');
          const historyPath = `${expandedPath}/history`;
          
          try {
            await fs.rm(historyPath, { recursive: true });
            await fs.mkdir(historyPath, { recursive: true });
          } catch {
            // History directory may not exist
          }
          
          deps.historyView.refresh();
          vscode.window.showInformationMessage('History cleared.');
        } catch (error) {
          vscode.window.showErrorMessage(`Clear history failed: ${error}`);
        }
      }
    )
  );

  // Show snapshot diff command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.showSnapshotDiff',
      async (item?: SnapshotTreeItem) => {
        if (!item) {
          vscode.window.showWarningMessage('Select a snapshot to show diff.');
          return;
        }

        try {
          const registry = await deps.registryStore.loadRegistry();
          const skill = registry.skills.find(s => s.name === item.skillName);
          
          if (!skill?.folderPath) {
            vscode.window.showErrorMessage('Skill not found.');
            return;
          }

          // Get snapshot content
          const snapshotContent = await deps.historyManager.restoreSnapshot(
            item.skillName,
            item.snapshot.id
          );
          
          // Create temp document for snapshot
          const snapshotDoc = await vscode.workspace.openTextDocument({
            content: snapshotContent,
            language: 'markdown'
          });
          
          const currentUri = vscode.Uri.file(skill.folderPath);
          
          await vscode.commands.executeCommand(
            'vscode.diff',
            snapshotDoc.uri,
            currentUri,
            `${item.skillName}: Snapshot (${item.snapshot.id.substring(0, 8)}) ↔ Current`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Show diff failed: ${error}`);
        }
      }
    )
  );

  // Add target to skill command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.addTarget',
      async (item?: SkillTreeItem) => {
        if (!item) {
          vscode.window.showErrorMessage('Please select a skill to add a target.');
          return;
        }

        try {
          const config = vscode.workspace.getConfiguration('skillfiles');
          const agentProfiles = config.get<Record<string, {vendor: string; skillFolderPath: string; skillFileName: string}>>('agentProfiles') || {};
          const path = await import('path');
          const os = await import('os');

          // Different flow for Shared vs Repo skills
          if (item.skill.scope === 'shared') {
            // Shared skills: deploy to user's home agent directories
            // Generate options from agent profiles
            const sharedLocations = Object.entries(agentProfiles).map(([agentName, profile]) => {
              // Extract folder name from skillFolderPath (e.g., ".agent/skills" -> ".agent")
              const folderBase = profile.skillFolderPath.split('/')[0] || `.${agentName}`;
              const deployFolder = path.join(os.homedir(), folderBase, 'skills');
              return {
                label: agentName,
                description: `~/${folderBase}/skills/`,
                detail: `${profile.vendor}`,
                path: deployFolder,
                agent: agentName,
                profile,
                picked: agentName === 'agent'
              };
            });

            // Sort: agent first, then gemini, then alphabetically
            sharedLocations.sort((a, b) => {
              if (a.agent === 'agent') return -1;
              if (b.agent === 'agent') return 1;
              if (a.agent === 'gemini') return -1;
              if (b.agent === 'gemini') return 1;
              return a.label.localeCompare(b.label);
            });

            const selectedLocation = await vscode.window.showQuickPick(sharedLocations, {
              placeHolder: 'Select agent home directory for deployment',
              title: `Deploy shared skill: ${item.skill.name}`
            });

            if (!selectedLocation) {
              return;
            }

            const deployPath = path.join(
              selectedLocation.path,
              item.skill.name,
              selectedLocation.profile.skillFileName
            );

            // Create target for shared skill
            const newTarget = {
              skillName: item.skill.name,
              repoPath: selectedLocation.path,  // Use shared path as "repo path"
              scanPath: selectedLocation.path,
              agent: selectedLocation.agent,
              deployPath
            };

            const registry = await deps.registryStore.loadRegistry();
            
            // Find the skill in registry to add target to skill.targets
            const skillIdx = registry.skills.findIndex(s => s.name === item.skill.name);
            if (skillIdx === -1) {
              vscode.window.showErrorMessage('Skill not found in registry.');
              return;
            }

            // Check if target already exists in skill.targets
            const existingTarget = registry.skills[skillIdx].targets?.find(
              t => t.repoPath === newTarget.repoPath && 
                   t.agent === newTarget.agent
            );

            if (existingTarget) {
              vscode.window.showWarningMessage(`Target already exists: ${item.skill.name} → ${selectedLocation.label}`);
              return;
            }

            // Add to skill.targets
            if (!registry.skills[skillIdx].targets) {
              registry.skills[skillIdx].targets = [];
            }
            registry.skills[skillIdx].targets.push(newTarget);
            
            // Also add to registry.targets for backwards compatibility
            if (!registry.targets) registry.targets = [];
            registry.targets.push(newTarget);
            
            await deps.registryStore.saveRegistry(registry);

            deps.skillsView.refresh();
            deps.repoStatusView.refresh();

            // Offer to push immediately
            const pushNow = await vscode.window.showInformationMessage(
              `Target added: ${item.skill.name} → ${selectedLocation.label}. Push now?`,
              'Push', 'Later'
            );

            if (pushNow === 'Push' && item.skill.folderPath) {
              // Verify skill folder exists before pushing
              const fs = await import('fs/promises');
              try {
                await fs.access(item.skill.folderPath);
              } catch {
                vscode.window.showErrorMessage(
                  `Skill folder not found: ${item.skill.folderPath}. ` +
                  `The skill may need to be re-imported.`
                );
                return;
              }
              
              await deps.pushService.push({
                skillName: item.skill.name,
                skillFolderPath: item.skill.folderPath,
                deployFolderPath: path.dirname(deployPath),
                vars: {},
                context: { agent: selectedLocation.agent, scope: item.skill.scope }
              });
              vscode.window.showInformationMessage(`Pushed ${item.skill.name} to ${selectedLocation.label}.`);
              deps.repoStatusView.refresh();
            }
            return;
          }

          // Repo skills: deploy to repositories
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

          // Import RepoScanner to find repositories
          const { RepoScanner } = await import('../core/repo-scanner.js');
          const scanner = new RepoScanner(scanRoots);

          // Scan for repositories
          const repos = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Scanning for repositories...',
            cancellable: false
          }, async () => {
            return await scanner.scan();
          });

          if (repos.length === 0) {
            vscode.window.showWarningMessage('No repositories found in scan roots.');
            return;
          }

          // Let user select a repository
          const repoItems = repos.map(repo => ({
            label: repo.name,
            description: repo.path,
            repo
          }));

          const selectedRepo = await vscode.window.showQuickPick(repoItems, {
            placeHolder: 'Select target repository',
            title: `Add target for skill: ${item.skill.name}`
          });

          if (!selectedRepo) {
            return;
          }

          // Let user select an agent
          // Known agent aliases/descriptions
          const agentDescriptions: Record<string, string> = {
            gemini: 'Google (Antigravity)',
            copilot: 'GitHub',
            claude: 'Anthropic'
          };

          const agentItems = Object.entries(agentProfiles).map(([name, profile]) => ({
            label: name,
            description: agentDescriptions[name] || profile.vendor,
            detail: `Deploy to: ${profile.skillFolderPath}/${item.skill.name}/${profile.skillFileName}`,
            agent: name,
            profile,
            // Mark agent as default (uses .agent/skills - agentskills.io standard)
            picked: name === 'agent'
          }));

          // Sort to put agent first (default), then gemini
          agentItems.sort((a, b) => {
            if (a.agent === 'agent') return -1;
            if (b.agent === 'agent') return 1;
            if (a.agent === 'gemini') return -1;
            if (b.agent === 'gemini') return 1;
            return a.label.localeCompare(b.label);
          });

          const selectedAgent = await vscode.window.showQuickPick(agentItems, {
            placeHolder: 'Select AI agent (default: agent/.agent/skills)',
            title: 'Which agent should use this skill?'
          });

          if (!selectedAgent) {
            return;
          }

          // Compute deploy path (path already imported above)
          const deployPath = path.join(
            selectedRepo.repo.path,
            selectedAgent.profile.skillFolderPath,
            item.skill.name,
            selectedAgent.profile.skillFileName
          );

          // Create target
          const newTarget = {
            skillName: item.skill.name,
            repoPath: selectedRepo.repo.path,
            scanPath: selectedRepo.repo.path,
            agent: selectedAgent.agent,
            deployPath
          };

          // Add to registry
          const registry = await deps.registryStore.loadRegistry();
          
          // Find the skill in registry to add target to skill.targets
          const skillIdx = registry.skills.findIndex(s => s.name === item.skill.name);
          if (skillIdx === -1) {
            vscode.window.showErrorMessage('Skill not found in registry.');
            return;
          }
          
          // Check if target already exists in skill.targets
          const existingTarget = registry.skills[skillIdx].targets?.find(
            t => t.repoPath === newTarget.repoPath && 
                 t.agent === newTarget.agent
          );

          if (existingTarget) {
            vscode.window.showWarningMessage(
              `Target already exists: ${item.skill.name} → ${selectedRepo.repo.name} (${selectedAgent.agent})`
            );
            return;
          }

          // Add target to skill.targets
          if (!registry.skills[skillIdx].targets) {
            registry.skills[skillIdx].targets = [];
          }
          registry.skills[skillIdx].targets.push(newTarget);
          
          // Also add to registry.targets for backwards compatibility
          if (!registry.targets) {
            registry.targets = [];
          }
          registry.targets.push(newTarget);
          
          await deps.registryStore.saveRegistry(registry);

          // Refresh views
          deps.skillsView.refresh();
          deps.repoStatusView.refresh();

          // Offer to push immediately
          const pushNow = await vscode.window.showInformationMessage(
            `Target added: ${item.skill.name} → ${selectedRepo.repo.name} (${selectedAgent.agent}). Push now?`,
            'Push', 'Later'
          );

          if (pushNow === 'Push') {
            if (!item.skill.folderPath) {
              vscode.window.showErrorMessage('Skill path not set.');
              return;
            }

            await deps.pushService.push({
              skillName: item.skill.name,
              skillFolderPath: item.skill.folderPath,
              deployFolderPath: path.dirname(deployPath),
              vars: {},
              context: { agent: selectedAgent.agent, scope: item.skill.scope }
            });

            vscode.window.showInformationMessage(`Pushed ${item.skill.name} to ${selectedRepo.repo.name}.`);
            deps.repoStatusView.refresh();
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Add target failed: ${error}`);
        }
      }
    )
  );

  // Manage targets command (add/remove targets from skill context)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.manageTargets',
      async (item?: SkillTreeItem) => {
        if (!item) {
          vscode.window.showErrorMessage('Please select a skill to manage targets.');
          return;
        }

        try {
          const registry = await deps.registryStore.loadRegistry();
          const targets = registry.targets?.filter(t => t.skillName === item.skill.name) || [];

          // Build action options
          interface ActionItem extends vscode.QuickPickItem {
            action: 'add' | 'remove';
            target?: typeof targets[0];
          }

          const items: ActionItem[] = [];

          // Add "Add Target" option
          items.push({
            label: '$(add) Add Target',
            description: 'Add a new target repository',
            action: 'add'
          });

          // Add existing targets as "Remove" options
          for (const t of targets) {
            items.push({
              label: `$(trash) ${t.agent} · ${t.repoPath.split('/').pop()}`,
              description: t.deployPath,
              detail: `Remove from: ${t.repoPath}`,
              action: 'remove',
              target: t
            });
          }

          const selected = await vscode.window.showQuickPick(items, {
            placeHolder: targets.length === 0 
              ? 'No targets registered. Add one?' 
              : 'Select action',
            title: `Manage Targets for ${item.skill.name}`
          });

          if (!selected) {
            return;
          }

          if (selected.action === 'add') {
            // Redirect to addTarget command
            await vscode.commands.executeCommand('skillfiles.addTarget', item);
          } else if (selected.action === 'remove' && selected.target) {
            const confirm = await vscode.window.showWarningMessage(
              `Remove target: ${selected.target.agent} → ${selected.target.repoPath.split('/').pop()}?`,
              { modal: true },
              'Remove', 'Cancel'
            );

            if (confirm !== 'Remove') {
              return;
            }

            // Remove the target
            const idx = registry.targets?.findIndex(
              t => t.skillName === selected.target!.skillName &&
                   t.repoPath === selected.target!.repoPath &&
                   t.agent === selected.target!.agent
            );
            if (idx !== undefined && idx !== -1) {
              registry.targets?.splice(idx, 1);
              await deps.registryStore.saveRegistry(registry);
              deps.skillsView.refresh();
              deps.repoStatusView.refresh();
              vscode.window.showInformationMessage(`Removed target from ${item.skill.name}.`);
            }
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Manage targets failed: ${error}`);
        }
      }
    )
  );

  // Remove target command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.removeTarget',
      async (item?: TargetTreeItem) => {
        if (!item) {
          vscode.window.showErrorMessage('Please select a target to remove.');
          return;
        }

        const options = ['Remove Target Only', 'Remove Target and File', 'Cancel'];
        const choice = await vscode.window.showWarningMessage(
          `Remove target: ${item.target.skillName} from ${item.target.repoPath}?`,
          { modal: true },
          ...options
        );

        if (!choice || choice === 'Cancel') {
          return;
        }

        try {
          const registry = await deps.registryStore.loadRegistry();
          
          // Find and remove the target
          const targetIndex = registry.targets?.findIndex(
            t => t.skillName === item.target.skillName &&
                 t.repoPath === item.target.repoPath &&
                 t.agent === item.target.agent
          );

          if (targetIndex === undefined || targetIndex === -1) {
            vscode.window.showErrorMessage('Target not found in registry.');
            return;
          }

          registry.targets?.splice(targetIndex, 1);
          await deps.registryStore.saveRegistry(registry);

          // Optionally delete the deployed file
          if (choice === 'Remove Target and File' && item.target.deployPath) {
            try {
              const fs = await import('fs/promises');
              await fs.unlink(item.target.deployPath);
            } catch {
              // File may not exist
            }
          }

          deps.repoStatusView.refresh();
          vscode.window.showInformationMessage(
            `Removed target: ${item.target.skillName} (${item.target.agent})`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Remove target failed: ${error}`);
        }
      }
    )
  );

  // Refresh variables command
  context.subscriptions.push(
    vscode.commands.registerCommand('skillfiles.refreshVariables', () => {
      deps.variablesView.refresh();
    })
  );

  // Edit variable command (hierarchical - supports all 6 levels)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.editVariable',
      async (item?: VariableTreeItem) => {
        // Redirect to hierarchical handler
        await vscode.commands.executeCommand('skillfiles.editHierarchicalVariable', item);
      }
    )
  );

  // Edit hierarchical variable command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.editHierarchicalVariable',
      async (item?: VariableTreeItem) => {
        if (!item) {
          vscode.window.showErrorMessage('Please select a variable to edit.');
          return;
        }

        const newValue = await vscode.window.showInputBox({
          prompt: `Enter value for ${item.varName} (${item.section}${item.groupKey ? `: ${item.groupKey}` : ''})`,
          value: item.varValue || '',
          placeHolder: `Value for ${item.varName}`
        });

        if (newValue === undefined) {
          return; // Cancelled
        }

        try {
          const registry = await deps.registryStore.loadRegistry();
          
          switch (item.section) {
            case 'global': {
              if (!registry.globalVars) registry.globalVars = {};
              if (newValue === '') {
                delete registry.globalVars[item.varName];
              } else {
                registry.globalVars[item.varName] = newValue;
              }
              break;
            }
            
            case 'repo': {
              if (!registry.repoVars) registry.repoVars = {};
              const repoPath = item.groupKey || '';
              if (!registry.repoVars[repoPath]) registry.repoVars[repoPath] = {};
              if (newValue === '') {
                delete registry.repoVars[repoPath][item.varName];
              } else {
                registry.repoVars[repoPath][item.varName] = newValue;
              }
              break;
            }
            
            case 'agent': {
              if (!registry.agentVars) registry.agentVars = {};
              const agent = item.groupKey || '';
              if (!registry.agentVars[agent]) registry.agentVars[agent] = {};
              if (newValue === '') {
                delete registry.agentVars[agent][item.varName];
              } else {
                registry.agentVars[agent][item.varName] = newValue;
              }
              break;
            }
            
            case 'category': {
              if (!registry.categoryVars) registry.categoryVars = {};
              const category = item.groupKey || '';
              if (!registry.categoryVars[category]) registry.categoryVars[category] = {};
              if (newValue === '') {
                delete registry.categoryVars[category][item.varName];
              } else {
                registry.categoryVars[category][item.varName] = newValue;
              }
              break;
            }
            
            case 'skill': {
              const skillIndex = registry.skills.findIndex(s => s.name === item.groupKey);
              if (skillIndex === -1) {
                vscode.window.showErrorMessage('Skill not found.');
                return;
              }
              if (!registry.skills[skillIndex].defaultVars) {
                registry.skills[skillIndex].defaultVars = {};
              }
              if (newValue === '') {
                delete registry.skills[skillIndex].defaultVars![item.varName];
              } else {
                registry.skills[skillIndex].defaultVars![item.varName] = newValue;
              }
              break;
            }
            
            case 'target': {
              const [skillName, agent] = (item.groupKey || '').split('@');
              const targetIndex = registry.targets?.findIndex(
                t => t.skillName === skillName && t.agent === agent
              );
              if (targetIndex === undefined || targetIndex === -1 || !registry.targets) {
                vscode.window.showErrorMessage('Target not found.');
                return;
              }
              if (!registry.targets[targetIndex].vars) {
                registry.targets[targetIndex].vars = {};
              }
              if (newValue === '') {
                delete registry.targets[targetIndex].vars![item.varName];
              } else {
                registry.targets[targetIndex].vars![item.varName] = newValue;
              }
              break;
            }
          }

          await deps.registryStore.saveRegistry(registry);

          // Refresh views
          deps.variablesView.refresh();
          deps.repoStatusView.refresh();

          vscode.window.showInformationMessage(
            `Updated ${item.varName} = "${newValue}" at ${item.section} level`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Edit variable failed: ${error}`);
        }
      }
    )
  );

  // Edit default variable command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.editDefaultVariable',
      async (item?: DefaultVariableTreeItem) => {
        if (!item) {
          vscode.window.showErrorMessage('Please select a default variable to edit.');
          return;
        }

        const newValue = await vscode.window.showInputBox({
          prompt: `Enter default value for ${item.varName}`,
          value: item.varValue || '',
          placeHolder: `Default value for ${item.varName}`
        });

        if (newValue === undefined) {
          return; // Cancelled
        }

        try {
          const registry = await deps.registryStore.loadRegistry();
          
          // Find the skill
          const skillIndex = registry.skills.findIndex(s => s.name === item.skill.name);

          if (skillIndex === -1) {
            vscode.window.showErrorMessage('Skill not found in registry.');
            return;
          }

          // Update or add the default variable
          if (!registry.skills[skillIndex].defaultVars) {
            registry.skills[skillIndex].defaultVars = {};
          }
          
          if (newValue === '') {
            // Remove the variable if empty
            delete registry.skills[skillIndex].defaultVars![item.varName];
          } else {
            registry.skills[skillIndex].defaultVars![item.varName] = newValue;
          }

          await deps.registryStore.saveRegistry(registry);

          // Refresh views
          deps.variablesView.refresh();
          deps.repoStatusView.refresh();
          deps.skillsView.refresh();

          vscode.window.showInformationMessage(
            `Updated default ${item.varName} = "${newValue}" for skill ${item.skill.name}`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Edit default variable failed: ${error}`);
        }
      }
    )
  );

  // Set category command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.setCategory',
      async (item?: SkillTreeItem) => {
        if (!item) {
          vscode.window.showErrorMessage('Please select a skill.');
          return;
        }

        // Get existing categories for quick pick
        const registry = await deps.registryStore.loadRegistry();
        const existingCategories = new Set<string>();
        for (const skill of registry.skills) {
          if (skill.category) {
            existingCategories.add(skill.category);
          }
        }

        const categoryOptions: vscode.QuickPickItem[] = [
          { label: '$(add) New Category...', description: 'Create a new category' },
          { label: '$(close) Remove Category', description: 'Set to Uncategorized' },
          ...Array.from(existingCategories).map(cat => ({
            label: cat,
            description: 'Existing category'
          }))
        ];

        const selected = await vscode.window.showQuickPick(categoryOptions, {
          placeHolder: `Select category for ${item.label}`
        });

        if (!selected) {
          return;
        }

        let newCategory: string | undefined;

        if (selected.label === '$(add) New Category...') {
          newCategory = await vscode.window.showInputBox({
            prompt: 'Enter new category name',
            placeHolder: 'e.g., coding-style, documentation'
          });
          if (!newCategory) {
            return;
          }
        } else if (selected.label === '$(close) Remove Category') {
          newCategory = undefined;
        } else {
          newCategory = selected.label;
        }

        try {
          const skillIndex = registry.skills.findIndex(s => s.name === item.label);
          if (skillIndex === -1) {
            vscode.window.showErrorMessage('Skill not found.');
            return;
          }

          if (newCategory) {
            registry.skills[skillIndex].category = newCategory;
          } else {
            delete registry.skills[skillIndex].category;
          }

          await deps.registryStore.saveRegistry(registry);
          deps.skillsView.refresh();
          deps.variablesView.refresh();

          vscode.window.showInformationMessage(
            newCategory 
              ? `Set category to "${newCategory}" for ${item.label}`
              : `Removed category from ${item.label}`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Set category failed: ${error}`);
        }
      }
    )
  );

  // Delete resource command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.deleteResource',
      async (item?: ResourceTreeItem) => {
        if (!item) {
          return;
        }

        const name = item.label?.toString() || '';
        const type = item.isDirectory ? 'folder' : 'file';
        
        const confirm = await vscode.window.showWarningMessage(
          `Delete ${type} "${name}"? This cannot be undone.`,
          { modal: true },
          'Delete'
        );

        if (confirm !== 'Delete') {
          return;
        }

        try {
          const fs = await import('fs/promises');
          await fs.rm(item.resourcePath, { recursive: true });
          deps.skillsView.refresh();
          vscode.window.showInformationMessage(`Deleted ${type} "${name}"`);
        } catch (error) {
          vscode.window.showErrorMessage(`Delete failed: ${error}`);
        }
      }
    )
  );

  // Rename resource command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.renameResource',
      async (item?: ResourceTreeItem) => {
        if (!item) {
          return;
        }

        const oldName = item.label?.toString() || '';
        const newName = await vscode.window.showInputBox({
          prompt: 'Enter new name',
          value: oldName,
          validateInput: (value) => {
            if (!value || value.trim() === '') {
              return 'Name cannot be empty';
            }
            if (value.includes('/') || value.includes('\\')) {
              return 'Name cannot contain path separators';
            }
            return null;
          }
        });

        if (!newName || newName === oldName) {
          return;
        }

        try {
          const fs = await import('fs/promises');
          const path = await import('path');
          const dir = path.dirname(item.resourcePath);
          const newPath = path.join(dir, newName);
          
          await fs.rename(item.resourcePath, newPath);
          deps.skillsView.refresh();
          vscode.window.showInformationMessage(`Renamed to "${newName}"`);
        } catch (error) {
          vscode.window.showErrorMessage(`Rename failed: ${error}`);
        }
      }
    )
  );

  // Reveal in Finder command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.revealInFinder',
      async (item?: ResourceTreeItem | SkillTreeItem) => {
        let pathToReveal: string | undefined;

        if (item instanceof Object && 'resourcePath' in item) {
          pathToReveal = (item as ResourceTreeItem).resourcePath;
        } else if (item instanceof Object && 'skill' in item) {
          pathToReveal = (item as SkillTreeItem).skill.folderPath;
        }

        if (!pathToReveal) {
          return;
        }

        try {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(pathToReveal));
        } catch (error) {
          vscode.window.showErrorMessage(`Reveal in Finder failed: ${error}`);
        }
      }
    )
  );

  // Add file to skill/folder command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.addResourceFile',
      async (item?: SkillTreeItem | ResourceTreeItem) => {
        let targetFolder: string | undefined;

        if (item instanceof Object && 'skill' in item) {
          targetFolder = (item as SkillTreeItem).skill.folderPath;
        } else if (item instanceof Object && 'resourcePath' in item && (item as ResourceTreeItem).isDirectory) {
          targetFolder = (item as ResourceTreeItem).resourcePath;
        }

        if (!targetFolder) {
          vscode.window.showErrorMessage('Please select a skill or folder');
          return;
        }

        const fileName = await vscode.window.showInputBox({
          prompt: 'Enter file name',
          placeHolder: 'example.md',
          validateInput: (value) => {
            if (!value || value.trim() === '') {
              return 'File name cannot be empty';
            }
            if (value.includes('/') || value.includes('\\')) {
              return 'File name cannot contain path separators';
            }
            return null;
          }
        });

        if (!fileName) {
          return;
        }

        try {
          const fs = await import('fs/promises');
          const path = await import('path');
          const filePath = path.join(targetFolder, fileName);
          
          // Check if file exists
          try {
            await fs.access(filePath);
            vscode.window.showErrorMessage(`File "${fileName}" already exists`);
            return;
          } catch {
            // File doesn't exist, proceed
          }

          await fs.writeFile(filePath, '', 'utf-8');
          deps.skillsView.refresh();
          
          // Open the new file
          const doc = await vscode.workspace.openTextDocument(filePath);
          await vscode.window.showTextDocument(doc);
        } catch (error) {
          vscode.window.showErrorMessage(`Create file failed: ${error}`);
        }
      }
    )
  );

  // Add folder to skill/folder command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.addResourceFolder',
      async (item?: SkillTreeItem | ResourceTreeItem) => {
        let targetFolder: string | undefined;

        if (item instanceof Object && 'skill' in item) {
          targetFolder = (item as SkillTreeItem).skill.folderPath;
        } else if (item instanceof Object && 'resourcePath' in item && (item as ResourceTreeItem).isDirectory) {
          targetFolder = (item as ResourceTreeItem).resourcePath;
        }

        if (!targetFolder) {
          vscode.window.showErrorMessage('Please select a skill or folder');
          return;
        }

        const folderName = await vscode.window.showInputBox({
          prompt: 'Enter folder name',
          placeHolder: 'scripts',
          validateInput: (value) => {
            if (!value || value.trim() === '') {
              return 'Folder name cannot be empty';
            }
            if (value.includes('/') || value.includes('\\')) {
              return 'Folder name cannot contain path separators';
            }
            return null;
          }
        });

        if (!folderName) {
          return;
        }

        try {
          const fs = await import('fs/promises');
          const path = await import('path');
          const folderPath = path.join(targetFolder, folderName);
          
          await fs.mkdir(folderPath, { recursive: true });
          deps.skillsView.refresh();
          vscode.window.showInformationMessage(`Created folder "${folderName}"`);
        } catch (error) {
          vscode.window.showErrorMessage(`Create folder failed: ${error}`);
        }
      }
    )
  );

  // Validate skill command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.validateSkill',
      async (item?: SkillTreeItem) => {
        if (!item?.skill.folderPath) {
          vscode.window.showErrorMessage('Please select a skill to validate');
          return;
        }

        try {
          const { validateSkill, formatValidationResult } = await import('../core/skill-validator.js');
          const result = await validateSkill(item.skill.folderPath);
          const output = formatValidationResult(result, item.skill.name);
          
          // Show in output channel
          const channel = vscode.window.createOutputChannel('Skillfiles Validation');
          channel.clear();
          channel.appendLine(output);
          channel.show();

          if (result.valid && result.warnings.length === 0) {
            vscode.window.showInformationMessage(`✅ ${item.skill.name}: Valid`);
          } else if (result.valid) {
            vscode.window.showWarningMessage(`⚠️ ${item.skill.name}: Valid with warnings`);
          } else {
            vscode.window.showErrorMessage(`❌ ${item.skill.name}: Invalid`);
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Validation failed: ${error}`);
        }
      }
    )
  );

  // Validate all skills command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillfiles.validateAllSkills',
      async () => {
        try {
          const registry = await deps.registryStore.loadRegistry();
          const { validateSkill, formatValidationResult } = await import('../core/skill-validator.js');
          
          const channel = vscode.window.createOutputChannel('Skillfiles Validation');
          channel.clear();
          channel.appendLine('=== Validating All Skills ===\n');
          channel.show();

          let validCount = 0;
          let invalidCount = 0;
          let warningCount = 0;

          for (const skill of registry.skills) {
            if (!skill.folderPath) {
              channel.appendLine(`⚠️ ${skill.name}: No folder path`);
              warningCount++;
              continue;
            }

            const result = await validateSkill(skill.folderPath);
            channel.appendLine(formatValidationResult(result, skill.name));
            channel.appendLine('');

            if (result.valid && result.warnings.length === 0) {
              validCount++;
            } else if (result.valid) {
              warningCount++;
            } else {
              invalidCount++;
            }
          }

          channel.appendLine('=== Summary ===');
          channel.appendLine(`✅ Valid: ${validCount}`);
          channel.appendLine(`⚠️ Warnings: ${warningCount}`);
          channel.appendLine(`❌ Invalid: ${invalidCount}`);

          vscode.window.showInformationMessage(
            `Validation complete: ${validCount} valid, ${warningCount} warnings, ${invalidCount} invalid`
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Validation failed: ${error}`);
        }
      }
    )
  );
}
