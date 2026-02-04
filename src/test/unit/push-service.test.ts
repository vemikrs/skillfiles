import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { PushService } from '../../services/push-service.js';
import { HistoryManager } from '../../core/history-manager.js';
import { AuditLogStore } from '../../core/audit-log-store.js';
import { TemplateEngine } from '../../core/template-engine.js';

describe('PushService', () => {
  let tempDir: string;
  let registryDir: string;
  let repoDir: string;
  const testRoot = path.join(process.cwd(), '.test-tmp');
  
  beforeEach(() => {
    fs.mkdirSync(testRoot, { recursive: true });
    tempDir = fs.mkdtempSync(path.join(testRoot, 'push-'));
    registryDir = path.join(tempDir, 'registry');
    repoDir = path.join(tempDir, 'repo');
    fs.mkdirSync(registryDir, { recursive: true });
    fs.mkdirSync(repoDir, { recursive: true });
  });
  
  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('push', () => {
    it('should expand template and write to deployPath', async () => {
      // Setup skill in registry
      const skillDir = path.join(registryDir, 'skills', 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'skill.md'), 'Hello {{NAME}}!');
      
      const deployPath = path.join(repoDir, '.github', 'instructions.md');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      const templateEngine = new TemplateEngine();
      
      const pushService = new PushService(historyManager, auditLog, templateEngine);
      
      await pushService.push({
        skillName: 'test-skill',
        skillPath: path.join(skillDir, 'skill.md'),
        deployPath,
        vars: { NAME: 'World' },
        context: { agent: 'copilot', vendor: 'github', scope: 'repo' }
      });
      
      const content = fs.readFileSync(deployPath, 'utf-8');
      expect(content).to.equal('Hello World!');
    });

    it('should create directories if missing', async () => {
      const skillDir = path.join(registryDir, 'skills', 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'skill.md'), '# Test');
      
      const deployPath = path.join(repoDir, 'deep', 'nested', 'path', 'skill.md');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      const templateEngine = new TemplateEngine();
      
      const pushService = new PushService(historyManager, auditLog, templateEngine);
      
      await pushService.push({
        skillName: 'test-skill',
        skillPath: path.join(skillDir, 'skill.md'),
        deployPath,
        vars: {},
        context: { agent: 'copilot', vendor: 'github', scope: 'repo' }
      });
      
      expect(fs.existsSync(deployPath)).to.be.true;
    });

    it('should save history before overwriting', async () => {
      const skillDir = path.join(registryDir, 'skills', 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'skill.md'), 'New Content');
      
      // Existing file in repo
      const deployDir = path.join(repoDir, '.github');
      fs.mkdirSync(deployDir, { recursive: true });
      const deployPath = path.join(deployDir, 'instructions.md');
      fs.writeFileSync(deployPath, 'Old Content');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      const templateEngine = new TemplateEngine();
      
      const pushService = new PushService(historyManager, auditLog, templateEngine);
      
      await pushService.push({
        skillName: 'test-skill',
        skillPath: path.join(skillDir, 'skill.md'),
        deployPath,
        vars: {},
        context: { agent: 'copilot', vendor: 'github', scope: 'repo' }
      });
      
      // Check history was saved
      const snapshots = await historyManager.listSnapshots('test-skill');
      expect(snapshots.length).to.be.greaterThan(0);
    });

    it('should append audit log', async () => {
      const skillDir = path.join(registryDir, 'skills', 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'skill.md'), '# Test');
      
      const deployPath = path.join(repoDir, '.github', 'instructions.md');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      const templateEngine = new TemplateEngine();
      
      const pushService = new PushService(historyManager, auditLog, templateEngine);
      
      await pushService.push({
        skillName: 'test-skill',
        skillPath: path.join(skillDir, 'skill.md'),
        deployPath,
        vars: {},
        context: { agent: 'copilot', vendor: 'github', scope: 'repo' }
      });
      
      const entries = await auditLog.readAll();
      expect(entries).to.have.lengthOf(1);
      expect(entries[0].operation).to.equal('push');
      expect(entries[0].skillName).to.equal('test-skill');
    });

    it('should skip write when dryRun enabled', async () => {
      const skillDir = path.join(registryDir, 'skills', 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'skill.md'), '# Test');
      
      const deployPath = path.join(repoDir, '.github', 'instructions.md');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      const templateEngine = new TemplateEngine();
      
      const pushService = new PushService(historyManager, auditLog, templateEngine, { dryRun: true });
      
      await pushService.push({
        skillName: 'test-skill',
        skillPath: path.join(skillDir, 'skill.md'),
        deployPath,
        vars: {},
        context: { agent: 'copilot', vendor: 'github', scope: 'repo' }
      });
      
      expect(fs.existsSync(deployPath)).to.be.false;
    });
  });
});
