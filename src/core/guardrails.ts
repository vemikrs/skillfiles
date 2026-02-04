import * as path from 'path';
import { minimatch } from 'minimatch';

/**
 * Configuration for guardrails.
 */
export interface GuardrailsConfig {
  allowedPaths: string[];
  excludePatterns: string[];
}

/**
 * Result of path validation.
 */
export interface ValidationResult {
  valid: boolean;
  reason?: 'outside-allowed-roots' | 'matches-exclude-pattern' | 'invalid-name';
}

/**
 * Provides security guardrails for file operations.
 */
export class Guardrails {
  constructor(
    private readonly config: GuardrailsConfig
  ) {}

  /**
   * Check if a path is within allowed roots.
   */
  isPathAllowed(targetPath: string): boolean {
    // If no roots configured, allow all paths
    if (this.config.allowedPaths.length === 0) {
      return true;
    }

    const normalized = path.normalize(targetPath);
    return this.config.allowedPaths.some(root => {
      const normalizedRoot = path.normalize(root);
      return normalized.startsWith(normalizedRoot + path.sep) || 
             normalized === normalizedRoot;
    });
  }

  /**
   * Check if a path matches any exclude pattern.
   */
  isPathExcluded(targetPath: string): boolean {
    if (this.config.excludePatterns.length === 0) {
      return false;
    }

    return this.config.excludePatterns.some(pattern => 
      minimatch(targetPath, pattern, { dot: true })
    );
  }

  /**
   * Validate a path for both allowed roots and exclude patterns.
   */
  validatePath(targetPath: string): ValidationResult {
    if (!this.isPathAllowed(targetPath)) {
      return { valid: false, reason: 'outside-allowed-roots' };
    }

    if (this.isPathExcluded(targetPath)) {
      return { valid: false, reason: 'matches-exclude-pattern' };
    }

    return { valid: true };
  }

  /**
   * Validate a skill name for safety.
   */
  validateSkillName(skillName: string): ValidationResult {
    if (!skillName || skillName.length === 0) {
      return { valid: false, reason: 'invalid-name' };
    }

    // Only allow alphanumeric, dash, underscore
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validPattern.test(skillName)) {
      return { valid: false, reason: 'invalid-name' };
    }

    // Check for path traversal attempts
    if (skillName.includes('..') || skillName.includes('/') || skillName.includes('\\')) {
      return { valid: false, reason: 'invalid-name' };
    }

    return { valid: true };
  }
}
