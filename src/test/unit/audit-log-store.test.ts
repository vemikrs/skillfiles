import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { AuditLogStore } from '../../core/audit-log-store.js';
import type { AuditLogEntry } from '../../core/types.js';

describe('AuditLogStore', () => {
  let tempDir: string;
  const testRoot = path.join(process.cwd(), '.test-tmp');
  
  beforeEach(() => {
    fs.mkdirSync(testRoot, { recursive: true });
    tempDir = fs.mkdtempSync(path.join(testRoot, 'audit-'));
  });
  
  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('append', () => {
    it('should append entry with timestamp', async () => {
      const store = new AuditLogStore(tempDir);
      const entry: Omit<AuditLogEntry, 'timestamp'> = {
        operation: 'push',
        scope: 'repo',
        skillName: 'test-skill',
        target: 'myproject',
        result: 'success'
      };
      
      await store.append(entry);
      
      const entries = await store.readAll();
      expect(entries).to.have.lengthOf(1);
      expect(entries[0].operation).to.equal('push');
      expect(entries[0].timestamp).to.exist;
    });

    it('should create log file if missing', async () => {
      const store = new AuditLogStore(tempDir);
      const entry: Omit<AuditLogEntry, 'timestamp'> = {
        operation: 'collect',
        scope: 'repo',
        skillName: 'test-skill',
        result: 'success'
      };
      
      await store.append(entry);
      
      expect(fs.existsSync(path.join(tempDir, 'audit.log'))).to.be.true;
    });

    it('should append multiple entries', async () => {
      const store = new AuditLogStore(tempDir);
      
      await store.append({ operation: 'push', scope: 'repo', skillName: 's1', result: 'success' });
      await store.append({ operation: 'collect', scope: 'shared', skillName: 's2', result: 'failure' });
      await store.append({ operation: 'rollback', scope: 'repo', skillName: 's3', result: 'success' });
      
      const entries = await store.readAll();
      expect(entries).to.have.lengthOf(3);
    });
  });

  describe('purgeOldLogs', () => {
    it('should delete logs older than retention days', async () => {
      const store = new AuditLogStore(tempDir, 0); // 0 days = delete all
      
      await store.append({ operation: 'push', scope: 'repo', skillName: 'test', result: 'success' });
      
      // Wait a tiny bit to ensure timestamp is in the past
      await new Promise(r => setTimeout(r, 10));
      
      await store.purgeOldLogs();
      
      const entries = await store.readAll();
      expect(entries).to.have.lengthOf(0);
    });

    it('should keep recent logs', async () => {
      const store = new AuditLogStore(tempDir, 1); // 1 day retention
      
      await store.append({ operation: 'push', scope: 'repo', skillName: 'test', result: 'success' });
      
      await store.purgeOldLogs();
      
      const entries = await store.readAll();
      expect(entries).to.have.lengthOf(1);
    });
  });
});
