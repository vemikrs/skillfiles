/**
 * Smoke E2E Tests - Quick validation that the extension loads and basic functionality works
 */
import * as vscode from 'vscode';

export async function runSmokeTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
  console.log('\n=== SMOKE TESTS ===\n');
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  // Test 1: Extension should be present
  try {
    const ext = vscode.extensions.getExtension('ve.skillfiles');
    if (ext) {
      console.log('✅ Extension should be present');
      passed++;
    } else {
      throw new Error('Extension not found');
    }
  } catch (err) {
    console.log('❌ Extension should be present:', err);
    failed++;
    errors.push(`Extension present: ${err}`);
  }

  // Test 2: Extension should activate
  try {
    const ext = vscode.extensions.getExtension('ve.skillfiles');
    if (ext) {
      if (!ext.isActive) {
        await ext.activate();
      }
      if (ext.isActive) {
        console.log('✅ Extension should activate');
        passed++;
      } else {
        throw new Error('Extension did not activate');
      }
    }
  } catch (err) {
    console.log('❌ Extension should activate:', err);
    failed++;
    errors.push(`Extension activate: ${err}`);
  }

  // Test 3: Commands should be registered
  try {
    const commands = await vscode.commands.getCommands(true);
    const expectedCommands = [
      'skillfiles.openSkill',
      'skillfiles.createSkill',
      'skillfiles.pushSkill',
      'skillfiles.collectSkill',
      'skillfiles.rollbackSkill'
    ];
    
    let allFound = true;
    for (const cmd of expectedCommands) {
      if (!commands.includes(cmd)) {
        allFound = false;
        errors.push(`Missing command: ${cmd}`);
      }
    }
    
    if (allFound) {
      console.log('✅ Commands should be registered');
      passed++;
    } else {
      throw new Error('Some commands missing');
    }
  } catch (err) {
    console.log('❌ Commands should be registered:', err);
    failed++;
    errors.push(`Commands registered: ${err}`);
  }

  // Test 4: Views should be defined in package.json
  try {
    const ext = vscode.extensions.getExtension('ve.skillfiles');
    if (ext) {
      const packageJson = ext.packageJSON;
      if (packageJson.contributes?.views?.skillfiles) {
        console.log('✅ Views should be defined');
        passed++;
      } else {
        throw new Error('Views not defined in package.json');
      }
    }
  } catch (err) {
    console.log('❌ Views should be defined:', err);
    failed++;
    errors.push(`Views defined: ${err}`);
  }

  return { passed, failed, errors };
}
