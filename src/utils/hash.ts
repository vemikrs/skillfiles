import * as crypto from 'crypto';

/**
 * Calculate SHA256 hash of content with normalized line endings
 */
export function computeHash(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n');
  const hash = crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
  return `sha256:${hash}`;
}
