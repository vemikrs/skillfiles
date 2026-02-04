import { expect } from 'chai';
import { Guardrails, GuardrailsConfig } from '../../core/guardrails.js';

describe('Guardrails', () => {
  describe('isPathAllowed', () => {
    it('should allow paths within configured roots', () => {
      const config: GuardrailsConfig = {
        allowedPaths: ['/home/user/repos', '/projects'],
        excludePatterns: []
      };
      const guardrails = new Guardrails(config);
      
      expect(guardrails.isPathAllowed('/home/user/repos/my-project')).to.be.true;
      expect(guardrails.isPathAllowed('/projects/web-app')).to.be.true;
    });

    it('should reject paths outside configured roots', () => {
      const config: GuardrailsConfig = {
        allowedPaths: ['/home/user/repos'],
        excludePatterns: []
      };
      const guardrails = new Guardrails(config);
      
      expect(guardrails.isPathAllowed('/etc/passwd')).to.be.false;
      expect(guardrails.isPathAllowed('/root/.ssh')).to.be.false;
    });

    it('should allow all paths when no roots configured', () => {
      const config: GuardrailsConfig = {
        allowedPaths: [],
        excludePatterns: []
      };
      const guardrails = new Guardrails(config);
      
      expect(guardrails.isPathAllowed('/any/path')).to.be.true;
    });
  });

  describe('isPathExcluded', () => {
    it('should exclude paths matching glob patterns', () => {
      const config: GuardrailsConfig = {
        allowedPaths: [],
        excludePatterns: ['**/node_modules/**', '**/.git/**']
      };
      const guardrails = new Guardrails(config);
      
      expect(guardrails.isPathExcluded('/project/node_modules/package')).to.be.true;
      expect(guardrails.isPathExcluded('/project/.git/config')).to.be.true;
      expect(guardrails.isPathExcluded('/project/src/index.ts')).to.be.false;
    });

    it('should not exclude when no patterns configured', () => {
      const config: GuardrailsConfig = {
        allowedPaths: [],
        excludePatterns: []
      };
      const guardrails = new Guardrails(config);
      
      expect(guardrails.isPathExcluded('/any/path')).to.be.false;
    });
  });

  describe('validatePath', () => {
    it('should return valid for allowed non-excluded paths', () => {
      const config: GuardrailsConfig = {
        allowedPaths: ['/home/user/repos'],
        excludePatterns: ['**/node_modules/**']
      };
      const guardrails = new Guardrails(config);
      
      const result = guardrails.validatePath('/home/user/repos/project/src');
      expect(result.valid).to.be.true;
    });

    it('should return invalid with reason for disallowed paths', () => {
      const config: GuardrailsConfig = {
        allowedPaths: ['/home/user/repos'],
        excludePatterns: []
      };
      const guardrails = new Guardrails(config);
      
      const result = guardrails.validatePath('/etc/passwd');
      expect(result.valid).to.be.false;
      expect(result.reason).to.equal('outside-allowed-roots');
    });

    it('should return invalid with reason for excluded paths', () => {
      const config: GuardrailsConfig = {
        allowedPaths: ['/home/user/repos'],
        excludePatterns: ['**/node_modules/**']
      };
      const guardrails = new Guardrails(config);
      
      const result = guardrails.validatePath('/home/user/repos/node_modules/pkg');
      expect(result.valid).to.be.false;
      expect(result.reason).to.equal('matches-exclude-pattern');
    });
  });

  describe('validateSkillName', () => {
    it('should allow valid skill names', () => {
      const guardrails = new Guardrails({ allowedPaths: [], excludePatterns: [] });
      
      expect(guardrails.validateSkillName('my-skill').valid).to.be.true;
      expect(guardrails.validateSkillName('coding_assistant').valid).to.be.true;
      expect(guardrails.validateSkillName('test123').valid).to.be.true;
    });

    it('should reject invalid skill names', () => {
      const guardrails = new Guardrails({ allowedPaths: [], excludePatterns: [] });
      
      expect(guardrails.validateSkillName('').valid).to.be.false;
      expect(guardrails.validateSkillName('skill with spaces').valid).to.be.false;
      expect(guardrails.validateSkillName('../escape').valid).to.be.false;
      expect(guardrails.validateSkillName('skill/path').valid).to.be.false;
    });
  });
});
