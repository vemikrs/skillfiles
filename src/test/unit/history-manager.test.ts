import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { HistoryManager } from '../../core/history-manager.js';

describe('HistoryManager', () => {
  let tempDir: string;
  const testRoot = path.join(process.cwd(), '.test-tmp');
  
  beforeEach(() => {
    fs.mkdirSync(testRoot, { recursive: true });
    tempDir = fs.mkdtempSync(path.join(testRoot, 'history-'));
  });
  
  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('saveSnapshot', () => {
    it('should create timestamped directory', async () => {
      const historyManager = new HistoryManager(tempDir);
      const skillContent = '# Test Skill\nThis is a test.';
      
      const snapshotPath = await historyManager.saveSnapshot('test-skill', skillContent);
      
      expect(fs.existsSync(snapshotPath)).to.be.true;
      expect(snapshotPath).to.include('test-skill');
      expect(snapshotPath).to.include('history');
    });

    it('should copy skill.md to history', async () => {
      const historyManager = new HistoryManager(tempDir);
      const skillContent = '# Test Skill\nThis is a test.';
      
      const snapshotPath = await historyManager.saveSnapshot('test-skill', skillContent);
      const savedContent = fs.readFileSync(path.join(snapshotPath, 'skill.md'), 'utf-8');
      
      expect(savedContent).to.equal(skillContent);
    });

    it('should include metadata.yaml with timestamp', async () => {
      const historyManager = new HistoryManager(tempDir);
      const skillContent = '# Test Skill';
      
      const snapshotPath = await historyManager.saveSnapshot('test-skill', skillContent);
      const metadataPath = path.join(snapshotPath, 'metadata.yaml');
      
      expect(fs.existsSync(metadataPath)).to.be.true;
      const metadata = fs.readFileSync(metadataPath, 'utf-8');
      expect(metadata).to.include('timestamp:');
    });
  });

  describe('listSnapshots', () => {
    it('should return snapshots sorted by timestamp desc', async () => {
      const historyManager = new HistoryManager(tempDir);
      
      // Create snapshots with small delay
      await historyManager.saveSnapshot('test-skill', 'v1');
      await new Promise(r => setTimeout(r, 10));
      await historyManager.saveSnapshot('test-skill', 'v2');
      await new Promise(r => setTimeout(r, 10));
      await historyManager.saveSnapshot('test-skill', 'v3');
      
      const snapshots = await historyManager.listSnapshots('test-skill');
      
      expect(snapshots).to.have.lengthOf(3);
      // Most recent first
      expect(snapshots[0].content).to.equal('v3');
      expect(snapshots[2].content).to.equal('v1');
    });

    it('should return empty array when no snapshots exist', async () => {
      const historyManager = new HistoryManager(tempDir);
      const snapshots = await historyManager.listSnapshots('nonexistent-skill');
      expect(snapshots).to.be.an('array').that.is.empty;
    });
  });

  describe('restoreSnapshot', () => {
    it('should restore skill.md from history', async () => {
      const historyManager = new HistoryManager(tempDir);
      const originalContent = '# Original Content';
      
      const snapshotPath = await historyManager.saveSnapshot('test-skill', originalContent);
      const snapshotId = path.basename(snapshotPath);
      
      const restored = await historyManager.restoreSnapshot('test-skill', snapshotId);
      
      expect(restored).to.equal(originalContent);
    });
  });

  describe('pruneOldSnapshots', () => {
    it('should keep only N most recent snapshots', async () => {
      const historyManager = new HistoryManager(tempDir, 2);
      
      await historyManager.saveSnapshot('test-skill', 'v1');
      await new Promise(r => setTimeout(r, 10));
      await historyManager.saveSnapshot('test-skill', 'v2');
      await new Promise(r => setTimeout(r, 10));
      await historyManager.saveSnapshot('test-skill', 'v3');
      
      await historyManager.pruneOldSnapshots('test-skill');
      
      const remaining = await historyManager.listSnapshots('test-skill');
      expect(remaining).to.have.lengthOf(2);
      expect(remaining[0].content).to.equal('v3');
      expect(remaining[1].content).to.equal('v2');
    });
  });
});
