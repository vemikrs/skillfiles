import type { Scope, Registry, Skill, Target } from './types.js';

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
   * Resolve variables for a target using the 6-layer hierarchy.
   * Priority (highest to lowest): Target > Skill > Category > Agent > Repo > Global
   */
  resolveVars(
    target: Target,
    skill: Skill,
    registry: Registry
  ): Record<string, string> {
    const resolved: Record<string, string> = {};

    // Layer 6 (lowest): Global vars
    if (registry.globalVars) {
      Object.assign(resolved, registry.globalVars);
    }

    // Layer 5: Repo vars
    if (registry.repoVars && target.repoPath) {
      const repoVars = registry.repoVars[target.repoPath];
      if (repoVars) {
        Object.assign(resolved, repoVars);
      }
    }

    // Layer 4: Agent vars
    if (registry.agentVars && target.agent) {
      const agentVars = registry.agentVars[target.agent];
      if (agentVars) {
        Object.assign(resolved, agentVars);
      }
    }

    // Layer 3: Category vars
    if (registry.categoryVars && skill.category) {
      const categoryVars = registry.categoryVars[skill.category];
      if (categoryVars) {
        Object.assign(resolved, categoryVars);
      }
    }

    // Layer 2: Skill default vars
    if (skill.defaultVars) {
      Object.assign(resolved, skill.defaultVars);
    }

    // Layer 1 (highest): Target vars
    if (target.vars) {
      Object.assign(resolved, target.vars);
    }

    return resolved;
  }

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

