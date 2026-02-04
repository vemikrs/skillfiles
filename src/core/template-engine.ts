import type { Scope } from './types.js';

/**
 * Context for built-in template variables.
 */
export interface TemplateContext {
  agent?: string;
  vendor?: string;
  scope?: Scope;
}

/**
 * Built-in variable names that are always available.
 */
const BUILTIN_VARS = ['AGENT', 'VENDOR', 'SCOPE'];

/**
 * Template engine for expanding skill.md templates with variables.
 * Supports {{VAR_NAME}} syntax for variable substitution.
 */
export class TemplateEngine {
  private readonly varPattern = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;

  /**
   * Expand template with provided variables and context.
   * Unmatched variables are preserved as-is.
   */
  expand(
    template: string,
    vars: Record<string, string>,
    context?: TemplateContext
  ): string {
    // Build complete variable map with built-ins
    const allVars: Record<string, string> = {
      ...vars,
      ...(context?.agent ? { AGENT: context.agent } : {}),
      ...(context?.vendor ? { VENDOR: context.vendor } : {}),
      ...(context?.scope ? { SCOPE: context.scope } : {}),
    };

    return template.replace(this.varPattern, (match, varName) => {
      return allVars[varName] ?? match;
    });
  }

  /**
   * Detect variables in template that are not defined.
   * Excludes built-in variables.
   */
  detectMissingVars(
    template: string,
    vars: Record<string, string>
  ): string[] {
    const missing: string[] = [];
    const seen = new Set<string>();

    let match;
    const pattern = new RegExp(this.varPattern.source, 'g');
    
    while ((match = pattern.exec(template)) !== null) {
      const varName = match[1];
      
      if (seen.has(varName)) {
        continue;
      }
      seen.add(varName);

      // Skip built-in vars
      if (BUILTIN_VARS.includes(varName)) {
        continue;
      }

      // Check if defined
      if (!(varName in vars)) {
        missing.push(varName);
      }
    }

    return missing;
  }

  /**
   * Check if template requires variables that are not provided.
   */
  needsVars(
    template: string,
    vars: Record<string, string>
  ): boolean {
    return this.detectMissingVars(template, vars).length > 0;
  }
}
