import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { RepoScanner } from '../../core/repo-scanner.js';
import type { ScanRoot } from '../../core/types.js';

describe('RepoScanner', () => {
  let tempDir: string;
  const testRoot = path.join(process.cwd(), '.test-tmp');
  
  beforeEach(() => {
    fs.mkdirSync(testRoot, { recursive: true });
    tempDir = fs.mkdtempSync(path.join(testRoot, 'scanner-'));
  });
  
  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('scanRoots', () => {
    it('should discover repos under scan paths', async () => {
      // Create mock repos
      fs.mkdirSync(path.join(tempDir, 'repo1', '.git'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'repo2', '.git'), { recursive: true });
      
      const scanRoots: ScanRoot[] = [{ key: 'test', path: tempDir }];
      const scanner = new RepoScanner(scanRoots);
      
      const repos = await scanner.scan();
      
      expect(repos).to.have.lengthOf(2);
      expect(repos.map(r => r.name)).to.include.members(['repo1', 'repo2']);
    });

    it('should respect scanLimit', async () => {
      // Create 5 repos
      for (let i = 1; i <= 5; i++) {
        fs.mkdirSync(path.join(tempDir, `repo${i}`, '.git'), { recursive: true });
      }
      
      const scanRoots: ScanRoot[] = [{ key: 'test', path: tempDir }];
      const scanner = new RepoScanner(scanRoots, { scanLimit: 3 });
      
      const repos = await scanner.scan();
      
      expect(repos).to.have.lengthOf(3);
    });

    it('should skip hidden directories', async () => {
      fs.mkdirSync(path.join(tempDir, '.hidden-repo', '.git'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'visible-repo', '.git'), { recursive: true });
      
      const scanRoots: ScanRoot[] = [{ key: 'test', path: tempDir }];
      const scanner = new RepoScanner(scanRoots);
      
      const repos = await scanner.scan();
      
      expect(repos).to.have.lengthOf(1);
      expect(repos[0].name).to.equal('visible-repo');
    });

    it('should handle nested repos', async () => {
      fs.mkdirSync(path.join(tempDir, 'org', 'repo1', '.git'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'org', 'repo2', '.git'), { recursive: true });
      
      const scanRoots: ScanRoot[] = [{ key: 'test', path: tempDir }];
      const scanner = new RepoScanner(scanRoots, { maxDepth: 2 });
      
      const repos = await scanner.scan();
      
      expect(repos).to.have.lengthOf(2);
    });
  });

  describe('detectSkillFiles', () => {
    it('should find skill.md in known deploy paths', async () => {
      const repoPath = path.join(tempDir, 'myrepo');
      fs.mkdirSync(path.join(repoPath, '.github'), { recursive: true });
      fs.writeFileSync(path.join(repoPath, '.github', 'copilot-instructions.md'), '# Skill');
      
      const scanRoots: ScanRoot[] = [{ key: 'test', path: tempDir }];
      const scanner = new RepoScanner(scanRoots);
      
      const skills = await scanner.detectSkillFiles(repoPath);
      
      expect(skills).to.have.lengthOf(1);
      expect(skills[0].agent).to.equal('copilot');
    });

    it('should return empty array when no skills found', async () => {
      const repoPath = path.join(tempDir, 'empty-repo');
      fs.mkdirSync(repoPath, { recursive: true });
      
      const scanRoots: ScanRoot[] = [{ key: 'test', path: tempDir }];
      const scanner = new RepoScanner(scanRoots);
      
      const skills = await scanner.detectSkillFiles(repoPath);
      
      expect(skills).to.be.an('array').that.is.empty;
    });

    it('should detect multiple agent skill files', async () => {
      const repoPath = path.join(tempDir, 'multi-agent');
      fs.mkdirSync(path.join(repoPath, '.github'), { recursive: true });
      fs.mkdirSync(path.join(repoPath, '.claude'), { recursive: true });
      fs.writeFileSync(path.join(repoPath, '.github', 'copilot-instructions.md'), '# Copilot');
      fs.writeFileSync(path.join(repoPath, '.claude', 'skill.md'), '# Claude');
      
      const scanRoots: ScanRoot[] = [{ key: 'test', path: tempDir }];
      const scanner = new RepoScanner(scanRoots);
      
      const skills = await scanner.detectSkillFiles(repoPath);
      
      expect(skills).to.have.lengthOf(2);
    });
  });

  describe('isInsideWorkspace', () => {
    it('should return true for workspace paths', () => {
      const scanRoots: ScanRoot[] = [{ key: 'work', path: '/Users/mi/work' }];
      const scanner = new RepoScanner(scanRoots);
      
      const result = scanner.isInsideWorkspace('/Users/mi/work/myproject');
      
      expect(result).to.be.true;
    });

    it('should return false for external paths', () => {
      const scanRoots: ScanRoot[] = [{ key: 'work', path: '/Users/mi/work' }];
      const scanner = new RepoScanner(scanRoots);
      
      const result = scanner.isInsideWorkspace('/Users/other/project');
      
      expect(result).to.be.false;
    });
  });
});
