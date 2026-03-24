import * as path from 'path';
import * as os from 'os';
import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index.js');
    const cachePath = path.join(os.homedir(), '.vscode-test');
    
    console.log('Starting VS Code with extension...');
    console.log('Extension path:', extensionDevelopmentPath);
    console.log('Cache path:', cachePath);
    
    // Download VS Code to a cacheable location
    const vscodeExecutablePath = await downloadAndUnzipVSCode({
      cachePath,
      version: '1.107.0'
    });
    
    console.log('VS Code downloaded to:', vscodeExecutablePath);
    
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ['--disable-extensions']
    });
    
    console.log('Tests completed successfully');
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
