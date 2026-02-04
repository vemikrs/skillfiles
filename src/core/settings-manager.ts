import * as os from 'os';
import * as path from 'path';
import type { ScanRoot } from './types.js';

/**
 * Skillfiles extension settings.
 */
export interface SkillfilesSettings {
  scanPaths: Array<{ key: string; path: string }>;
  registryPath: string;
  autoSync: boolean;
  syncOnSave: boolean;
  historyRetentionDays: number;
  auditLogRetentionDays: number;
  maxSnapshots: number;
  confirmBeforePush: boolean;
  confirmBeforeCollect: boolean;
}

/**
 * Default settings values.
 */
const DEFAULT_SETTINGS: SkillfilesSettings = {
  scanPaths: [],
  registryPath: '',
  autoSync: false,
  syncOnSave: false,
  historyRetentionDays: 30,
  auditLogRetentionDays: 90,
  maxSnapshots: 10,
  confirmBeforePush: true,
  confirmBeforeCollect: true
};

/**
 * Configuration getter type (matches VS Code WorkspaceConfiguration).
 */
interface ConfigurationLike {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown, global?: boolean): Promise<void>;
}

/**
 * Manages extension settings.
 */
export class SettingsManager {
  constructor(
    private readonly getConfig: () => ConfigurationLike
  ) {}

  /**
   * Get all settings with defaults applied.
   */
  getSettings(): SkillfilesSettings {
    const config = this.getConfig();
    
    return {
      scanPaths: config.get<SkillfilesSettings['scanPaths']>('scanPaths') ?? DEFAULT_SETTINGS.scanPaths,
      registryPath: config.get<string>('registryPath') ?? DEFAULT_SETTINGS.registryPath,
      autoSync: config.get<boolean>('autoSync') ?? DEFAULT_SETTINGS.autoSync,
      syncOnSave: config.get<boolean>('syncOnSave') ?? DEFAULT_SETTINGS.syncOnSave,
      historyRetentionDays: config.get<number>('historyRetentionDays') ?? DEFAULT_SETTINGS.historyRetentionDays,
      auditLogRetentionDays: config.get<number>('auditLogRetentionDays') ?? DEFAULT_SETTINGS.auditLogRetentionDays,
      maxSnapshots: config.get<number>('maxSnapshots') ?? DEFAULT_SETTINGS.maxSnapshots,
      confirmBeforePush: config.get<boolean>('confirmBeforePush') ?? DEFAULT_SETTINGS.confirmBeforePush,
      confirmBeforeCollect: config.get<boolean>('confirmBeforeCollect') ?? DEFAULT_SETTINGS.confirmBeforeCollect
    };
  }

  /**
   * Update a single setting.
   */
  async updateSetting<K extends keyof SkillfilesSettings>(
    key: K,
    value: SkillfilesSettings[K]
  ): Promise<void> {
    const config = this.getConfig();
    await config.update(key, value, true);
  }

  /**
   * Get scan roots with expanded paths.
   */
  getScanRoots(): ScanRoot[] {
    const settings = this.getSettings();
    return settings.scanPaths.map(sp => ({
      key: sp.key,
      path: this.expandPath(sp.path)
    }));
  }

  /**
   * Get registry path with expansion.
   */
  getRegistryPath(): string {
    const settings = this.getSettings();
    const regPath = settings.registryPath || path.join(os.homedir(), '.skillfiles');
    return this.expandPath(regPath);
  }

  /**
   * Expand ~ to home directory.
   */
  private expandPath(p: string): string {
    if (p.startsWith('~')) {
      return path.join(os.homedir(), p.slice(1));
    }
    return p;
  }
}
