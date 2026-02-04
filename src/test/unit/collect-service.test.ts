import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { CollectService } from '../../services/collect-service.js';
import { HistoryManager } from '../../core/history-manager.js';
import { AuditLogStore } from '../../core/audit-log-store.js';

describe('CollectService', () => {
  let tempDir: string;
  let registryDir: string;
  let repoDir: string;
  const testRoot = path.join(process.cwd(), '.test-tmp');
  
  beforeEach(() => {
    fs.mkdirSync(testRoot, { recursive: true });
    tempDir = fs.mkdtempSync(path.join(testRoot, 'collect-'));
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

  describe('collect', () => {
    it('should copy skill from repo to registry', async () => {
      // Setup skill in repo
      const repoSkillDir = path.join(repoDir, '.github');
      fs.mkdirSync(repoSkillDir, { recursive: true });
      fs.writeFileSync(path.join(repoSkillDir, 'copilot-instructions.md'), '# Repo Skill');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      
      const collectService = new CollectService(historyManager, auditLog);
      
      await collectService.collect({
        skillName: 'collected-skill',
        sourcePath: path.join(repoSkillDir, 'copilot-instructions.md'),
        registryRoot: registryDir
      });
      
      const registrySkillPath = path.join(registryDir, 'skills', 'collected-skill', 'skill.md');
      expect(fs.existsSync(registrySkillPath)).to.be.true;
      
      const content = fs.readFileSync(registrySkillPath, 'utf-8');
      expect(content).to.equal('# Repo Skill');
    });

    it('should create skill directory if missing', async () => {
      const repoSkillPath = path.join(repoDir, 'skill.md');
      fs.writeFileSync(repoSkillPath, '# New Skill');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      
      const collectService = new CollectService(historyManager, auditLog);
      
      await collectService.collect({
        skillName: 'new-skill',
        sourcePath: repoSkillPath,
        registryRoot: registryDir
      });
      
      const skillDir = path.join(registryDir, 'skills', 'new-skill');
      expect(fs.existsSync(skillDir)).to.be.true;
    });

    it('should save history before overwriting existing skill', async () => {
      // Existing skill in registry
      const skillDir = path.join(registryDir, 'skills', 'existing-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'skill.md'), 'Old Content');
      
      // New skill in repo
      const repoSkillPath = path.join(repoDir, 'skill.md');
      fs.writeFileSync(repoSkillPath, 'New Content');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      
      const collectService = new CollectService(historyManager, auditLog);
      
      await collectService.collect({
        skillName: 'existing-skill',
        sourcePath: repoSkillPath,
        registryRoot: registryDir
      });
      
      // Check history was saved
      const snapshots = await historyManager.listSnapshots('existing-skill');
      expect(snapshots.length).to.be.greaterThan(0);
      expect(snapshots[0].content).to.equal('Old Content');
    });

    it('should append audit log', async () => {
      const repoSkillPath = path.join(repoDir, 'skill.md');
      fs.writeFileSync(repoSkillPath, '# Test');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      
      const collectService = new CollectService(historyManager, auditLog);
      
      await collectService.collect({
        skillName: 'audit-test',
        sourcePath: repoSkillPath,
        registryRoot: registryDir
      });
      
      const entries = await auditLog.readAll();
      expect(entries).to.have.lengthOf(1);
      expect(entries[0].operation).to.equal('collect');
      expect(entries[0].skillName).to.equal('audit-test');
    });
  });
});
