import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { RollbackService } from '../../services/rollback-service.js';
import { HistoryManager } from '../../core/history-manager.js';
import { AuditLogStore } from '../../core/audit-log-store.js';

describe('RollbackService', () => {
  let tempDir: string;
  let registryDir: string;
  const testRoot = path.join(process.cwd(), '.test-tmp');
  
  beforeEach(() => {
    fs.mkdirSync(testRoot, { recursive: true });
    tempDir = fs.mkdtempSync(path.join(testRoot, 'rollback-'));
    registryDir = path.join(tempDir, 'registry');
    fs.mkdirSync(registryDir, { recursive: true });
  });
  
  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('rollback', () => {
    it('should restore skill from history snapshot', async () => {
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      
      // Create current skill
      const skillDir = path.join(registryDir, 'skills', 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'skill.md'), 'Current Content');
      
      // Save history snapshot
      await historyManager.saveSnapshot('test-skill', 'Old Content');
      const snapshots = await historyManager.listSnapshots('test-skill');
      const snapshotId = snapshots[0].id;
      
      const rollbackService = new RollbackService(historyManager, auditLog);
      
      await rollbackService.rollback({
        skillName: 'test-skill',
        snapshotId,
        registryRoot: registryDir
      });
      
      const content = fs.readFileSync(path.join(skillDir, 'skill.md'), 'utf-8');
      expect(content).to.equal('Old Content');
    });

    it('should append audit log', async () => {
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      
      const skillDir = path.join(registryDir, 'skills', 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'skill.md'), 'Current');
      
      await historyManager.saveSnapshot('test-skill', 'Old');
      const snapshots = await historyManager.listSnapshots('test-skill');
      
      const rollbackService = new RollbackService(historyManager, auditLog);
      
      await rollbackService.rollback({
        skillName: 'test-skill',
        snapshotId: snapshots[0].id,
        registryRoot: registryDir
      });
      
      const entries = await auditLog.readAll();
      expect(entries).to.have.lengthOf(1);
      expect(entries[0].operation).to.equal('rollback');
    });

    it('should save current content as new snapshot before rollback', async () => {
      const historyManager = new HistoryManager(registryDir);
      const auditLog = new AuditLogStore(registryDir);
      
      const skillDir = path.join(registryDir, 'skills', 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'skill.md'), 'Current Content');
      
      await historyManager.saveSnapshot('test-skill', 'Old Content');
      
      // Wait a bit to ensure different timestamps
      await new Promise(r => setTimeout(r, 10));
      
      const snapshots = await historyManager.listSnapshots('test-skill');
      
      const rollbackService = new RollbackService(historyManager, auditLog);
      
      await rollbackService.rollback({
        skillName: 'test-skill',
        snapshotId: snapshots[0].id,
        registryRoot: registryDir
      });
      
      // Should have 2 snapshots now: the new "current" + the old one
      const allSnapshots = await historyManager.listSnapshots('test-skill');
      expect(allSnapshots.length).to.be.at.least(2);
      // One of the snapshots should have the current content
      const hasCurrentContent = allSnapshots.some(s => s.content === 'Current Content');
      expect(hasCurrentContent).to.be.true;
    });
  });
});
