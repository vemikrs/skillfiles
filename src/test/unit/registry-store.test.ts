import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { RegistryStore } from '../../core/registry-store.js';
import { RegistryNotFoundError, YamlParseError } from '../../core/errors.js';

describe('RegistryStore', () => {
  let tempDir: string;
  const testRoot = path.join(process.cwd(), '.test-tmp');
  
  beforeEach(() => {
    fs.mkdirSync(testRoot, { recursive: true });
    tempDir = fs.mkdtempSync(path.join(testRoot, 'registry-'));
  });
  
  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('loadRegistry', () => {
    it('should parse valid registry.yaml', async () => {
      const registryPath = path.join(tempDir, 'registry.yaml');
      const content = `
agentProfiles:
  copilot:
    vendor: github
    defaultDeployPath: .github/copilot-instructions.md
skills:
  - name: test-skill
    scope: repo
    registryPath: skills/test-skill
    targets: []
`;
      fs.writeFileSync(registryPath, content);
      
      const store = new RegistryStore(tempDir);
      const registry = await store.loadRegistry();
      
      expect(registry.agentProfiles.copilot).to.exist;
      expect(registry.agentProfiles.copilot.vendor).to.equal('github');
      expect(registry.skills).to.have.lengthOf(1);
      expect(registry.skills[0].name).to.equal('test-skill');
    });

    it('should throw RegistryNotFoundError when file is missing', async () => {
      const store = new RegistryStore(tempDir);
      
      try {
        await store.loadRegistry();
        expect.fail('Expected RegistryNotFoundError');
      } catch (error) {
        expect(error).to.be.instanceOf(RegistryNotFoundError);
      }
    });

    it('should throw YamlParseError when file is malformed', async () => {
      const registryPath = path.join(tempDir, 'registry.yaml');
      fs.writeFileSync(registryPath, 'agentProfiles:\n  copilot\n    vendor: github');
      
      const store = new RegistryStore(tempDir);
      
      try {
        await store.loadRegistry();
        expect.fail('Expected YamlParseError');
      } catch (error) {
        expect(error).to.be.instanceOf(YamlParseError);
      }
    });
  });

  describe('saveRegistry', () => {
    it('should write registry.yaml with proper formatting', async () => {
      const store = new RegistryStore(tempDir);
      const registry = {
        agentProfiles: {
          copilot: { vendor: 'github', defaultDeployPath: '.github/copilot-instructions.md' }
        },
        skills: []
      };
      
      await store.saveRegistry(registry);
      
      const content = fs.readFileSync(path.join(tempDir, 'registry.yaml'), 'utf-8');
      expect(content).to.include('agentProfiles:');
      expect(content).to.include('copilot:');
      expect(content).to.include('vendor: github');
    });

    it('should create parent directories if missing', async () => {
      const nestedDir = path.join(tempDir, 'nested', 'registry');
      const store = new RegistryStore(nestedDir);
      const registry = { agentProfiles: {}, skills: [] };
      
      await store.saveRegistry(registry);
      
      expect(fs.existsSync(path.join(nestedDir, 'registry.yaml'))).to.be.true;
    });
  });

  describe('loadMeta', () => {
    it('should parse valid meta.yaml', async () => {
      const skillDir = path.join(tempDir, 'skills', 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      const metaPath = path.join(skillDir, 'meta.yaml');
      fs.writeFileSync(metaPath, `
agent: copilot
version: "1.0"
lastUpdated: "2026-01-01T00:00:00Z"
hash: sha256:abc123
`);
      
      const store = new RegistryStore(tempDir);
      const meta = await store.loadMeta('test-skill');
      
      expect(meta.agent).to.equal('copilot');
      expect(meta.hash).to.equal('sha256:abc123');
    });

    it('should return default meta when file is missing', async () => {
      const store = new RegistryStore(tempDir);
      const meta = await store.loadMeta('nonexistent-skill');
      
      expect(meta.agent).to.equal('');
      expect(meta.hash).to.equal('');
      expect(meta.version).to.equal('');
    });
  });

  describe('saveMeta', () => {
    it('should update hash and lastUpdated', async () => {
      const skillDir = path.join(tempDir, 'skills', 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      
      const store = new RegistryStore(tempDir);
      const meta = {
        agent: 'copilot',
        version: '1.0',
        lastUpdated: '',
        hash: 'sha256:newhash'
      };
      
      await store.saveMeta('test-skill', meta);
      
      const content = fs.readFileSync(path.join(skillDir, 'meta.yaml'), 'utf-8');
      expect(content).to.include('hash: sha256:newhash');
      expect(content).to.include('lastUpdated:');
    });
  });
});
