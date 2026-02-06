import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { Registry, Meta } from './types.js';
import { RegistryNotFoundError, YamlParseError } from './errors.js';

/**
 * Manages reading and writing of registry.yaml and meta.yaml files.
 */
export class RegistryStore {
  private readonly registryPath: string;

  constructor(registryRoot: string) {
    this.registryPath = path.join(registryRoot, 'registry.yaml');
  }

  /**
   * Load and parse the registry.yaml file.
   * @throws RegistryNotFoundError if file doesn't exist
   * @throws YamlParseError if file is malformed
   */
  async loadRegistry(): Promise<Registry> {
    try {
      const content = await fs.readFile(this.registryPath, 'utf-8');
      const parsed = yaml.load(content) as Registry;
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new RegistryNotFoundError(this.registryPath);
      }
      if (error instanceof yaml.YAMLException) {
        throw new YamlParseError(this.registryPath, error as Error);
      }
      throw error;
    }
  }

  /**
   * Load registry or create empty one if not found.
   * Creates parent directories and default registry.yaml if needed.
   */
  async loadOrCreateRegistry(): Promise<Registry> {
    try {
      return await this.loadRegistry();
    } catch (error) {
      if (error instanceof RegistryNotFoundError) {
        // Create default empty registry with comprehensive agent profiles
        const defaultRegistry: Registry = {
          registryRoot: path.dirname(this.registryPath),
          agentProfiles: {
            'agent': {
              vendor: 'agentskills.io',
              instructionPaths: ['AGENTS.md'],
              skillFolderPath: '.agent/skills',
              skillFileName: 'SKILL.md'
            },
            'gemini': {
              vendor: 'google',
              instructionPaths: ['GEMINI.md', '.gemini/styleguide.md'],
              skillFolderPath: '.gemini/skills',
              skillFileName: 'SKILL.md'
            },
            'copilot': {
              vendor: 'github',
              instructionPaths: ['.github/copilot-instructions.md', 'AGENTS.md'],
              skillFolderPath: '.github/skills',
              skillFileName: 'SKILL.md'
            },
            'claude': {
              vendor: 'anthropic',
              instructionPaths: ['CLAUDE.md'],
              skillFolderPath: '.claude/skills',
              skillFileName: 'SKILL.md'
            },
            'codex': {
              vendor: 'openai',
              instructionPaths: ['AGENTS.md'],
              skillFolderPath: '.agents/skills',
              skillFileName: 'SKILL.md'
            }
          },
          skills: [],
          targets: []
        };
        await this.saveRegistry(defaultRegistry);
        return defaultRegistry;
      }
      throw error;
    }
  }

  /**
   * Save registry to registry.yaml file.
   * Creates parent directories if needed.
   */
  async saveRegistry(registry: Registry): Promise<void> {
    const dir = path.dirname(this.registryPath);
    await fs.mkdir(dir, { recursive: true });
    const content = yaml.dump(registry, { lineWidth: -1 });
    await fs.writeFile(this.registryPath, content, 'utf-8');
  }

  /**
   * Load meta.yaml for a skill.
   * Returns default meta if file doesn't exist.
   */
  async loadMeta(skillName: string): Promise<Meta> {
    const metaPath = this.getMetaPath(skillName);
    try {
      const content = await fs.readFile(metaPath, 'utf-8');
      return yaml.load(content) as Meta;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { agent: '', version: '', lastUpdated: '', hash: '' };
      }
      throw error;
    }
  }

  /**
   * Save meta.yaml for a skill.
   * Updates lastUpdated timestamp.
   */
  async saveMeta(skillName: string, meta: Meta): Promise<void> {
    const metaPath = this.getMetaPath(skillName);
    const dir = path.dirname(metaPath);
    await fs.mkdir(dir, { recursive: true });
    
    const updatedMeta = {
      ...meta,
      lastUpdated: new Date().toISOString()
    };
    
    const content = yaml.dump(updatedMeta, { lineWidth: -1 });
    await fs.writeFile(metaPath, content, 'utf-8');
  }

  private getMetaPath(skillName: string): string {
    return path.join(path.dirname(this.registryPath), 'skills', skillName, 'meta.yaml');
  }
}
