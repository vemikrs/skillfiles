import { expect } from 'chai';
import * as sinon from 'sinon';
import { SettingsManager, type SkillfilesSettings } from '../../core/settings-manager.js';

// Type for mock configuration
interface MockConfig {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown, global?: boolean): Promise<void>;
}

describe('SettingsManager', () => {
  let mockWorkspaceConfig: {
    get: sinon.SinonStub;
    update: sinon.SinonStub;
  };

  beforeEach(() => {
    mockWorkspaceConfig = {
      get: sinon.stub(),
      update: sinon.stub().resolves()
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  const createManager = () => new SettingsManager(() => mockWorkspaceConfig as unknown as MockConfig);

  describe('getSettings', () => {
    it('should return default settings when none configured', () => {
      mockWorkspaceConfig.get.returns(undefined);
      
      const manager = createManager();
      const settings = manager.getSettings();
      
      expect(settings.scanPaths).to.deep.equal([]);
      expect(settings.registryPath).to.equal('');
      expect(settings.autoSync).to.equal(false);
      expect(settings.historyRetentionDays).to.equal(30);
    });

    it('should merge user settings with defaults', () => {
      mockWorkspaceConfig.get.callsFake((key: string) => {
        if (key === 'scanPaths') {return [{ key: 'home', path: '~/repos' }];}
        if (key === 'registryPath') {return '~/.skillfiles';}
        return undefined;
      });
      
      const manager = createManager();
      const settings = manager.getSettings();
      
      expect(settings.scanPaths).to.have.lengthOf(1);
      expect(settings.registryPath).to.equal('~/.skillfiles');
      expect(settings.autoSync).to.equal(false);  // default
    });
  });

  describe('updateSetting', () => {
    it('should update a single setting', async () => {
      const manager = createManager();
      
      await manager.updateSetting('autoSync', true);
      
      expect(mockWorkspaceConfig.update.calledWith('autoSync', true, true)).to.be.true;
    });
  });

  describe('getScanRoots', () => {
    it('should expand home directory in paths', () => {
      mockWorkspaceConfig.get.callsFake((key: string) => {
        if (key === 'scanPaths') {return [{ key: 'home', path: '~/repos' }];}
        return undefined;
      });
      
      const manager = createManager();
      const roots = manager.getScanRoots();
      
      expect(roots).to.have.lengthOf(1);
      expect(roots[0].path).to.not.include('~');
    });
  });

  describe('getRegistryPath', () => {
    it('should expand home directory in registry path', () => {
      mockWorkspaceConfig.get.callsFake((key: string) => {
        if (key === 'registryPath') {return '~/.skillfiles';}
        return undefined;
      });
      
      const manager = createManager();
      const regPath = manager.getRegistryPath();
      
      expect(regPath).to.not.include('~');
    });

    it('should return default path when not configured', () => {
      mockWorkspaceConfig.get.returns(undefined);
      
      const manager = createManager();
      const regPath = manager.getRegistryPath();
      
      expect(regPath).to.not.be.empty;
    });
  });
});
