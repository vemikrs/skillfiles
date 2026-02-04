import * as os from 'os';
import * as path from 'path';

/**
 * Expand ~ to home directory
 */
export function expandHome(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  if (filePath === '~') {
    return os.homedir();
  }
  return filePath;
}

/**
 * Normalize path separators for cross-platform compatibility
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}
