import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { SkillMetadata } from './types.js';

/**
 * YAML frontmatter regex pattern
 * Matches content between --- markers at the start of file
 */
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Parse SKILL.md file and extract metadata from YAML frontmatter.
 * Follows agentskills.io standard format.
 */
export async function parseSkillFile(skillMdPath: string): Promise<{
  metadata: SkillMetadata | null;
  body: string;
  raw: string;
}> {
  const raw = await fs.readFile(skillMdPath, 'utf-8');
  
  const match = raw.match(FRONTMATTER_REGEX);
  
  if (!match) {
    return {
      metadata: null,
      body: raw,
      raw
    };
  }

  try {
    const frontmatterContent = match[1];
    const parsed = yaml.load(frontmatterContent) as Record<string, unknown>;
    
    // Map YAML fields to SkillMetadata
    const metadata: SkillMetadata = {
      name: String(parsed.name || path.basename(path.dirname(skillMdPath))),
      description: parseDescription(parsed.description),
      license: parsed.license ? String(parsed.license) : undefined,
      version: parsed.version ? String(parsed.version) : undefined,
      disableModelInvocation: Boolean(parsed['disable-model-invocation']),
      compatibility: parseCompatibility(parsed.compatibility),
      metadata: parsed.metadata as Record<string, unknown> | undefined
    };

    // Get body after frontmatter
    const body = raw.slice(match[0].length).trim();

    return {
      metadata,
      body,
      raw
    };
  } catch {
    // If YAML parsing fails, return null metadata
    return {
      metadata: null,
      body: raw,
      raw
    };
  }
}

/**
 * Parse description field (can be string or multiline YAML)
 */
function parseDescription(desc: unknown): string | undefined {
  if (typeof desc === 'string') {
    return desc.trim();
  }
  if (Array.isArray(desc)) {
    return desc.join('\n').trim();
  }
  return undefined;
}

/**
 * Parse compatibility configuration
 */
function parseCompatibility(compat: unknown): SkillMetadata['compatibility'] {
  if (!compat || typeof compat !== 'object') {
    return undefined;
  }
  
  const c = compat as Record<string, unknown>;
  return {
    agents: Array.isArray(c.agents) ? c.agents.map(String) : undefined,
    minVersions: c.minVersions as Record<string, string> | undefined,
    envVars: Array.isArray(c.envVars) ? c.envVars.map(String) : undefined
  };
}

/**
 * Parse metadata from a skill folder (reads SKILL.md inside)
 */
export async function parseSkillFolder(folderPath: string): Promise<SkillMetadata | null> {
  const skillMdPath = path.join(folderPath, 'SKILL.md');
  
  try {
    await fs.access(skillMdPath);
    const { metadata } = await parseSkillFile(skillMdPath);
    return metadata;
  } catch {
    return null;
  }
}

/**
 * Get description from skill folder (shorthand for common use case)
 */
export async function getSkillDescription(folderPath: string): Promise<string | undefined> {
  const metadata = await parseSkillFolder(folderPath);
  return metadata?.description;
}
