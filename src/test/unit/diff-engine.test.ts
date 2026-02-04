import { expect } from 'chai';
import { DiffEngine } from '../../core/diff-engine.js';

describe('DiffEngine', () => {
  describe('computeDiff', () => {
    it('should return empty diff for identical content', () => {
      const engine = new DiffEngine();
      const content = '# Hello\nWorld';
      
      const diff = engine.computeDiff(content, content);
      
      expect(diff.hasChanges).to.be.false;
      expect(diff.hunks).to.be.empty;
    });

    it('should return unified diff for different content', () => {
      const engine = new DiffEngine();
      const original = 'Line 1\nLine 2\nLine 3';
      const modified = 'Line 1\nLine 2 modified\nLine 3';
      
      const diff = engine.computeDiff(original, modified);
      
      expect(diff.hasChanges).to.be.true;
      expect(diff.hunks.length).to.be.greaterThan(0);
    });

    it('should detect added lines', () => {
      const engine = new DiffEngine();
      const original = 'Line 1\nLine 2';
      const modified = 'Line 1\nLine 2\nLine 3';
      
      const diff = engine.computeDiff(original, modified);
      
      expect(diff.hasChanges).to.be.true;
      expect(diff.stats.additions).to.equal(1);
    });

    it('should detect removed lines', () => {
      const engine = new DiffEngine();
      const original = 'Line 1\nLine 2\nLine 3';
      const modified = 'Line 1\nLine 3';
      
      const diff = engine.computeDiff(original, modified);
      
      expect(diff.hasChanges).to.be.true;
      expect(diff.stats.deletions).to.equal(1);
    });
  });

  describe('computeStatus', () => {
    it('should return synced when hashes match', () => {
      const engine = new DiffEngine();
      const registryHash = 'sha256:abc123';
      const repoHash = 'sha256:abc123';
      
      const status = engine.computeStatus({
        registryHash,
        repoHash,
        repoFileExists: true,
        needsVars: false
      });
      
      expect(status).to.equal('synced');
    });

    it('should return modified when hashes differ', () => {
      const engine = new DiffEngine();
      
      const status = engine.computeStatus({
        registryHash: 'sha256:abc123',
        repoHash: 'sha256:def456',
        repoFileExists: true,
        needsVars: false
      });
      
      expect(status).to.equal('modified');
    });

    it('should return missing when repo file absent', () => {
      const engine = new DiffEngine();
      
      const status = engine.computeStatus({
        registryHash: 'sha256:abc123',
        repoHash: null,
        repoFileExists: false,
        needsVars: false
      });
      
      expect(status).to.equal('missing');
    });

    it('should return needs-vars when vars incomplete', () => {
      const engine = new DiffEngine();
      
      const status = engine.computeStatus({
        registryHash: 'sha256:abc123',
        repoHash: null,
        repoFileExists: false,
        needsVars: true
      });
      
      expect(status).to.equal('needs-vars');
    });

    it('should prioritize needs-vars over other statuses', () => {
      const engine = new DiffEngine();
      
      // Even if file exists and hashes match, needs-vars takes precedence
      const status = engine.computeStatus({
        registryHash: 'sha256:abc123',
        repoHash: 'sha256:abc123',
        repoFileExists: true,
        needsVars: true
      });
      
      expect(status).to.equal('needs-vars');
    });
  });
});
