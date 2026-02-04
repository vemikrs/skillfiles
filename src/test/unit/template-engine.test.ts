import { expect } from 'chai';
import { TemplateEngine } from '../../core/template-engine.js';

describe('TemplateEngine', () => {
  describe('expand', () => {
    it('should substitute {{VAR_NAME}} with value', () => {
      const engine = new TemplateEngine();
      const template = 'Hello {{NAME}}, welcome to {{PROJECT}}!';
      const vars = { NAME: 'Alice', PROJECT: 'Skillfiles' };
      
      const result = engine.expand(template, vars);
      
      expect(result).to.equal('Hello Alice, welcome to Skillfiles!');
    });

    it('should handle multiple occurrences of same variable', () => {
      const engine = new TemplateEngine();
      const template = '{{NAME}} says hello. {{NAME}} is happy.';
      const vars = { NAME: 'Bob' };
      
      const result = engine.expand(template, vars);
      
      expect(result).to.equal('Bob says hello. Bob is happy.');
    });

    it('should preserve unmatched variables', () => {
      const engine = new TemplateEngine();
      const template = 'Hello {{NAME}}, your ID is {{ID}}.';
      const vars = { NAME: 'Charlie' };
      
      const result = engine.expand(template, vars);
      
      expect(result).to.equal('Hello Charlie, your ID is {{ID}}.');
    });

    it('should provide built-in vars: AGENT, VENDOR, SCOPE', () => {
      const engine = new TemplateEngine();
      const template = 'Agent: {{AGENT}}, Vendor: {{VENDOR}}, Scope: {{SCOPE}}';
      const vars = {};
      const context = { agent: 'copilot', vendor: 'github', scope: 'repo' as const };
      
      const result = engine.expand(template, vars, context);
      
      expect(result).to.equal('Agent: copilot, Vendor: github, Scope: repo');
    });

    it('should handle empty template', () => {
      const engine = new TemplateEngine();
      const result = engine.expand('', {});
      expect(result).to.equal('');
    });

    it('should handle template with no variables', () => {
      const engine = new TemplateEngine();
      const template = 'No variables here.';
      const result = engine.expand(template, {});
      expect(result).to.equal('No variables here.');
    });
  });

  describe('detectMissingVars', () => {
    it('should return list of undefined variables', () => {
      const engine = new TemplateEngine();
      const template = 'Hello {{NAME}}, your ID is {{ID}}.';
      const vars = { NAME: 'Alice' };
      
      const missing = engine.detectMissingVars(template, vars);
      
      expect(missing).to.deep.equal(['ID']);
    });

    it('should return empty array when all vars defined', () => {
      const engine = new TemplateEngine();
      const template = 'Hello {{NAME}}!';
      const vars = { NAME: 'Alice' };
      
      const missing = engine.detectMissingVars(template, vars);
      
      expect(missing).to.be.an('array').that.is.empty;
    });

    it('should not include built-in vars as missing', () => {
      const engine = new TemplateEngine();
      const template = 'Agent: {{AGENT}}, Custom: {{CUSTOM}}';
      const vars = {};
      
      const missing = engine.detectMissingVars(template, vars);
      
      expect(missing).to.deep.equal(['CUSTOM']);
    });

    it('should handle multiple undefined variables', () => {
      const engine = new TemplateEngine();
      const template = '{{A}} {{B}} {{C}}';
      const vars = { B: 'defined' };
      
      const missing = engine.detectMissingVars(template, vars);
      
      expect(missing).to.include.members(['A', 'C']);
      expect(missing).to.not.include('B');
    });
  });

  describe('needsVars', () => {
    it('should return true when vars are missing', () => {
      const engine = new TemplateEngine();
      const template = 'Hello {{NAME}}!';
      const vars = {};
      
      const needs = engine.needsVars(template, vars);
      
      expect(needs).to.be.true;
    });

    it('should return false when all vars are defined', () => {
      const engine = new TemplateEngine();
      const template = 'Hello {{NAME}}!';
      const vars = { NAME: 'Alice' };
      
      const needs = engine.needsVars(template, vars);
      
      expect(needs).to.be.false;
    });

    it('should return false for template with only built-in vars', () => {
      const engine = new TemplateEngine();
      const template = 'Agent: {{AGENT}}';
      const vars = {};
      
      const needs = engine.needsVars(template, vars);
      
      expect(needs).to.be.false;
    });
  });
});
