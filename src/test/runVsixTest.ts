/**
 * VSIX Installation Verification Test
 * 
 * This test verifies that the packaged VSIX:
 * 1. Builds successfully with all dependencies bundled
 * 2. Installs into VS Code without errors
 * 3. Extension is recognized in the installed extensions list
 * 
 * Note: Full activation testing is skipped due to VS Code Electron
 * requiring a display. The bundling is verified by checking the
 * VSIX contents directly.
 */
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VSIX_PATH = '/tmp/skillfiles-test.vsix';
const TEST_VSCODE_PATH = '/tmp/vscode-vsix-test';
const USER_DATA_DIR = '/tmp/vscode-user-data';
const EXTENSIONS_DIR = '/tmp/vscode-extensions';

async function cleanUp() {
  for (const item of [USER_DATA_DIR, EXTENSIONS_DIR]) {
    try {
      await fs.rm(item, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function buildVsix(): Promise<string> {
  console.log('\n📦 Building VSIX package...');
  const projectRoot = path.resolve(__dirname, '../../');
  
  console.log('   Running esbuild...');
  execSync('pnpm run esbuild-base -- --production', {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  
  execSync(`pnpm exec vsce package --no-dependencies -o ${VSIX_PATH}`, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, npm_config_ignore_scripts: 'true' }
  });
  console.log(`✅ VSIX built: ${VSIX_PATH}`);
  return VSIX_PATH;
}

async function verifyVsixContents(vsixPath: string): Promise<boolean> {
  console.log('\n� Verifying VSIX contents...');
  
  // List VSIX contents
  const contents = execSync(`unzip -l "${vsixPath}"`, { encoding: 'utf-8' });
  
  // Check for esbuild bundle
  if (!contents.includes('extension.js')) {
    console.log('❌ extension.js not found in VSIX');
    return false;
  }
  console.log('   ✅ extension.js found in VSIX');
  
  // Check that no unbundled source files are included
  const hasUnbundledFiles = contents.includes('/core/') && 
                            contents.includes('.js') && 
                            !contents.includes('extension.js.map');
  
  if (hasUnbundledFiles) {
    console.log('❌ Unbundled source files found in VSIX (core/, views/, etc.)');
    return false;
  }
  console.log('   ✅ No unbundled source files in VSIX');
  
  // Check bundle size
  const sizeMatch = contents.match(/(\d+)\s+[\d-]+\s+[\d:]+\s+extension\/out\/extension\.js/);
  if (sizeMatch) {
    const size = parseInt(sizeMatch[1], 10);
    console.log(`   ✅ Bundle size: ${(size / 1024).toFixed(1)} KB`);
    
    if (size < 50000) {
      console.log('❌ Bundle size too small - may be missing dependencies');
      return false;
    }
  }
  
  return true;
}

function getVSCodeCLI(vscodePath: string): string {
  if (vscodePath.includes('.app')) {
    return path.join(vscodePath, '..', '..', 'Resources', 'app', 'bin', 'code');
  }
  return vscodePath;
}

async function installVsix(cliPath: string, vsixPath: string): Promise<void> {
  console.log('\n📥 Installing VSIX into clean VS Code...');
  
  execSync(`"${cliPath}" --user-data-dir="${USER_DATA_DIR}" --extensions-dir="${EXTENSIONS_DIR}" --install-extension "${vsixPath}"`, {
    stdio: 'inherit',
    shell: '/bin/bash'
  });
  console.log('✅ VSIX installed successfully');
}

async function verifyInstallation(cliPath: string): Promise<boolean> {
  console.log('\n🔍 Checking extension list...');
  
  const result = execSync(`"${cliPath}" --user-data-dir="${USER_DATA_DIR}" --extensions-dir="${EXTENSIONS_DIR}" --list-extensions`, {
    shell: '/bin/bash',
    encoding: 'utf-8'
  });
  
  if (result.includes('mi.skillfiles')) {
    console.log('✅ Extension mi.skillfiles is in the extensions list');
    return true;
  } else {
    console.log('❌ Extension mi.skillfiles NOT found in extensions list');
    return false;
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║     VSIX Installation Verification Test               ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  try {
    // Step 1: Clean up
    await cleanUp();
    
    // Step 2: Build VSIX
    const vsixPath = await buildVsix();
    
    // Step 3: Verify VSIX contents
    const vsixValid = await verifyVsixContents(vsixPath);
    if (!vsixValid) {
      throw new Error('VSIX contents verification failed');
    }
    
    // Step 4: Download VS Code
    console.log('\n⬇️  Downloading VS Code...');
    const vscodeExecutablePath = await downloadAndUnzipVSCode({
      cachePath: TEST_VSCODE_PATH,
      version: '1.107.0'
    });
    console.log(`✅ VS Code ready: ${vscodeExecutablePath}`);
    
    const cliPath = getVSCodeCLI(vscodeExecutablePath);
    
    // Step 5: Install VSIX
    await installVsix(cliPath, vsixPath);
    
    // Step 6: Verify installation
    const installed = await verifyInstallation(cliPath);
    if (!installed) {
      throw new Error('Extension not in installed extensions list');
    }
    
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║         ✅ VSIX Verification Test PASSED              ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');
    console.log('   ✅ VSIX builds successfully (esbuild bundle)');
    console.log('   ✅ No unbundled source files in package');
    console.log('   ✅ Extension installs without errors');
    console.log('   ✅ Extension recognized by VS Code\n');
    console.log('   Note: Full activation test skipped (requires display).');
    console.log('   Bundle integrity verified through VSIX contents check.\n');
    
  } catch (err) {
    console.error('\n❌ VSIX Verification Test FAILED:', err);
    process.exit(1);
  }
}

main();
