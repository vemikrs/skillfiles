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
    it('should copy skill folder from repo to registry', async () => {
      // Setup skill folder in repo with SKILL.md
      const repoSkillDir = path.join(repoDir, 'my-skill');
      fs.mkdirSync(repoSkillDir, { recursive: true });
      fs.writeFileSync(path.join(repoSkillDir, 'SKILL.md'), '# Repo Skill');
      fs.writeFileSync(path.join(repoSkillDir, 'helper.sh'), '#!/bin/bash\necho "helper"');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      
      const collectService = new CollectService(historyManager, auditLog);
      
      await collectService.collect({
        skillName: 'collected-skill',
        sourceFolderPath: repoSkillDir,
        registryRoot: registryDir
      });
      
      // Check SKILL.md was copied
      const registrySkillPath = path.join(registryDir, 'skills', 'collected-skill', 'SKILL.md');
      expect(fs.existsSync(registrySkillPath)).to.be.true;
      
      const content = fs.readFileSync(registrySkillPath, 'utf-8');
      expect(content).to.equal('# Repo Skill');
      
      // Check helper script was copied too
      const helperPath = path.join(registryDir, 'skills', 'collected-skill', 'helper.sh');
      expect(fs.existsSync(helperPath)).to.be.true;
    });

    it('should create skill directory if missing', async () => {
      const repoSkillDir = path.join(repoDir, 'new-skill');
      fs.mkdirSync(repoSkillDir, { recursive: true });
      fs.writeFileSync(path.join(repoSkillDir, 'SKILL.md'), '# New Skill');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      
      const collectService = new CollectService(historyManager, auditLog);
      
      await collectService.collect({
        skillName: 'new-skill',
        sourceFolderPath: repoSkillDir,
        registryRoot: registryDir
      });
      
      const skillDir = path.join(registryDir, 'skills', 'new-skill');
      expect(fs.existsSync(skillDir)).to.be.true;
    });

    it('should save history before overwriting existing skill', async () => {
      // Existing skill folder in registry
      const skillDir = path.join(registryDir, 'skills', 'existing-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'Old Content');
      
      // New skill folder in repo
      const repoSkillDir = path.join(repoDir, 'existing-skill');
      fs.mkdirSync(repoSkillDir, { recursive: true });
      fs.writeFileSync(path.join(repoSkillDir, 'SKILL.md'), 'New Content');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      
      const collectService = new CollectService(historyManager, auditLog);
      
      await collectService.collect({
        skillName: 'existing-skill',
        sourceFolderPath: repoSkillDir,
        registryRoot: registryDir
      });
      
      // Check history was saved (folder snapshot)
      const snapshots = await historyManager.listSnapshots('existing-skill');
      expect(snapshots.length).to.be.greaterThan(0);
      // Folder snapshot content is a file list
      expect(snapshots[0].type).to.equal('folder');
    });

    it('should append audit log', async () => {
      const repoSkillDir = path.join(repoDir, 'audit-test');
      fs.mkdirSync(repoSkillDir, { recursive: true });
      fs.writeFileSync(path.join(repoSkillDir, 'SKILL.md'), '# Test');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      
      const collectService = new CollectService(historyManager, auditLog);
      
      await collectService.collect({
        skillName: 'audit-test',
        sourceFolderPath: repoSkillDir,
        registryRoot: registryDir
      });
      
      const entries = await auditLog.readAll();
      expect(entries).to.have.lengthOf(1);
      expect(entries[0].operation).to.equal('collect');
      expect(entries[0].skillName).to.equal('audit-test');
    });

    it('should throw if SKILL.md is missing', async () => {
      const repoSkillDir = path.join(repoDir, 'no-skill-md');
      fs.mkdirSync(repoSkillDir, { recursive: true });
      fs.writeFileSync(path.join(repoSkillDir, 'readme.md'), '# No SKILL.md');
      
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      
      const collectService = new CollectService(historyManager, auditLog);
      
      try {
        await collectService.collect({
          skillName: 'no-skill-md',
          sourceFolderPath: repoSkillDir,
          registryRoot: registryDir
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).to.include('SKILL.md not found');
      }
    });
  });
});
