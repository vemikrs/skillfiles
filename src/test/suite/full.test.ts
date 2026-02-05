/**
 * Full E2E Tests - Comprehensive testing of all extension features
 */
import * as vscode from 'vscode';

export async function runFullTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
  console.log('\n=== FULL TESTS ===\n');
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  // Test 1-4: Refresh commands should execute
  const refreshCommands = [
    'skillfiles.refreshSkills',
    'skillfiles.refreshRepoStatus', 
    'skillfiles.refreshHistory',
    'skillfiles.refreshAll'
  ];
  
  for (const cmd of refreshCommands) {
    try {
      await vscode.commands.executeCommand(cmd);
      console.log(`✅ ${cmd} executes`);
      passed++;
    } catch (err) {
      console.log(`❌ ${cmd} fails:`, err);
      failed++;
      errors.push(`${cmd}: ${err}`);
    }
  }

  // Test 5: Configuration should be accessible
  try {
    const config = vscode.workspace.getConfiguration('skillfiles');
    if (config) {
      console.log('✅ Configuration accessible');
      passed++;
    } else {
      throw new Error('Config not accessible');
    }
  } catch (err) {
    console.log('❌ Configuration accessible:', err);
    failed++;
    errors.push(`Configuration: ${err}`);
  }

  // Test 6: Package metadata should be correct
  try {
    const ext = vscode.extensions.getExtension('mi.skillfiles');
    if (ext) {
      const pkg = ext.packageJSON;
      if (pkg.name === 'skillfiles' && pkg.publisher === 'mi' && pkg.version) {
        console.log('✅ Package metadata correct');
        passed++;
      } else {
        throw new Error(`Invalid metadata: name=${pkg.name}, publisher=${pkg.publisher}`);
      }
    }
  } catch (err) {
    console.log('❌ Package metadata:', err);
    failed++;
    errors.push(`Package metadata: ${err}`);
  }

  // Test 7: Contributes section should exist
  try {
    const ext = vscode.extensions.getExtension('mi.skillfiles');
    if (ext) {
      const pkg = ext.packageJSON;
      if (pkg.contributes?.commands && pkg.contributes?.views && pkg.contributes?.viewsContainers) {
        console.log('✅ Contributes section complete');
        passed++;
      } else {
        throw new Error('Missing contributes sections');
      }
    }
  } catch (err) {
    console.log('❌ Contributes section:', err);
    failed++;
    errors.push(`Contributes: ${err}`);
  }

  // Test 8: View IDs should match between package.json and registration
  try {
    const ext = vscode.extensions.getExtension('mi.skillfiles');
    if (ext) {
      const pkg = ext.packageJSON;
      const expectedViewIds = ['skillfiles.skillsView', 'skillfiles.repoStatusView', 'skillfiles.historyView'];
      const viewsInPackage = pkg.contributes?.views?.skillfiles?.map((v: { id: string }) => v.id) || [];
      
      let allMatch = true;
      for (const viewId of expectedViewIds) {
        if (!viewsInPackage.includes(viewId)) {
          allMatch = false;
          errors.push(`View ID mismatch: ${viewId} not in package.json`);
        }
      }
      
      if (allMatch) {
        console.log('✅ View IDs match package.json');
        passed++;
      } else {
        throw new Error('View IDs mismatch');
      }
    }
  } catch (err) {
    console.log('❌ View IDs:', err);
    failed++;
    errors.push(`View IDs: ${err}`);
  }

  return { passed, failed, errors };
}
