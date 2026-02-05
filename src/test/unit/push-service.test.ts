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
    it('should expand template and copy folder to deployFolderPath', async () => {
      // Setup skill folder in registry with SKILL.md
      const skillDir = path.join(registryDir, 'skills', 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'Hello {{NAME}}!');
      fs.writeFileSync(path.join(skillDir, 'helper.sh'), 'echo {{NAME}}');
      
      const deployFolderPath = path.join(repoDir, '.github', 'skills', 'test-skill');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      const templateEngine = new TemplateEngine();
      
      const pushService = new PushService(historyManager, auditLog, templateEngine);
      
      const result = await pushService.push({
        skillName: 'test-skill',
        skillFolderPath: skillDir,
        deployFolderPath,
        vars: { NAME: 'World' },
        context: { agent: 'copilot', vendor: 'github', scope: 'repo' }
      });
      
      // Check SKILL.md was copied with template expansion
      const content = fs.readFileSync(path.join(deployFolderPath, 'SKILL.md'), 'utf-8');
      expect(content).to.equal('Hello World!');
      
      // Check helper script was also expanded
      const helperContent = fs.readFileSync(path.join(deployFolderPath, 'helper.sh'), 'utf-8');
      expect(helperContent).to.equal('echo World');
      
      expect(result.success).to.be.true;
      expect(result.filesCount).to.equal(2);
    });

    it('should create directories if missing', async () => {
      const skillDir = path.join(registryDir, 'skills', 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test');
      
      const deployFolderPath = path.join(repoDir, 'deep', 'nested', 'path', 'test-skill');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      const templateEngine = new TemplateEngine();
      
      const pushService = new PushService(historyManager, auditLog, templateEngine);
      
      await pushService.push({
        skillName: 'test-skill',
        skillFolderPath: skillDir,
        deployFolderPath,
        vars: {},
        context: { agent: 'copilot', vendor: 'github', scope: 'repo' }
      });
      
      expect(fs.existsSync(path.join(deployFolderPath, 'SKILL.md'))).to.be.true;
    });

    it('should save history before overwriting', async () => {
      const skillDir = path.join(registryDir, 'skills', 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'New Content');
      
      // Existing folder in repo
      const deployFolderPath = path.join(repoDir, '.github', 'skills', 'test-skill');
      fs.mkdirSync(deployFolderPath, { recursive: true });
      fs.writeFileSync(path.join(deployFolderPath, 'SKILL.md'), 'Old Content');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      const templateEngine = new TemplateEngine();
      
      const pushService = new PushService(historyManager, auditLog, templateEngine);
      
      await pushService.push({
        skillName: 'test-skill',
        skillFolderPath: skillDir,
        deployFolderPath,
        vars: {},
        context: { agent: 'copilot', vendor: 'github', scope: 'repo' }
      });
      
      // Check history was saved (folder snapshot)
      const snapshots = await historyManager.listSnapshots('test-skill');
      expect(snapshots.length).to.be.greaterThan(0);
      expect(snapshots[0].type).to.equal('folder');
    });

    it('should append audit log', async () => {
      const skillDir = path.join(registryDir, 'skills', 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test');
      
      const deployFolderPath = path.join(repoDir, '.github', 'skills', 'test-skill');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      const templateEngine = new TemplateEngine();
      
      const pushService = new PushService(historyManager, auditLog, templateEngine);
      
      await pushService.push({
        skillName: 'test-skill',
        skillFolderPath: skillDir,
        deployFolderPath,
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
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test');
      
      const deployFolderPath = path.join(repoDir, '.github', 'skills', 'test-skill');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      const templateEngine = new TemplateEngine();
      
      const pushService = new PushService(historyManager, auditLog, templateEngine, { dryRun: true });
      
      await pushService.push({
        skillName: 'test-skill',
        skillFolderPath: skillDir,
        deployFolderPath,
        vars: {},
        context: { agent: 'copilot', vendor: 'github', scope: 'repo' }
      });
      
      expect(fs.existsSync(deployFolderPath)).to.be.false;
    });

    it('should remove deleted files from target when pushing', async () => {
      const skillDir = path.join(registryDir, 'skills', 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test');
      // Note: No helper.sh in source
      
      // Existing folder in repo has extra file
      const deployFolderPath = path.join(repoDir, '.github', 'skills', 'test-skill');
      fs.mkdirSync(deployFolderPath, { recursive: true });
      fs.writeFileSync(path.join(deployFolderPath, 'SKILL.md'), 'Old');
      fs.writeFileSync(path.join(deployFolderPath, 'helper.sh'), 'This should be removed');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      const templateEngine = new TemplateEngine();
      
      const pushService = new PushService(historyManager, auditLog, templateEngine);
      
      await pushService.push({
        skillName: 'test-skill',
        skillFolderPath: skillDir,
        deployFolderPath,
        vars: {},
        context: { agent: 'copilot', scope: 'repo' }
      });
      
      // Check SKILL.md exists
      expect(fs.existsSync(path.join(deployFolderPath, 'SKILL.md'))).to.be.true;
      // Check helper.sh was removed (since it's not in source)
      expect(fs.existsSync(path.join(deployFolderPath, 'helper.sh'))).to.be.false;
    });
  });
});
