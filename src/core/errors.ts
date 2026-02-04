/**
 * Custom error types for Skillfiles extension
 */

export class SkillfilesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillfilesError';
  }
}

export class RegistryNotFoundError extends SkillfilesError {
  constructor(path: string) {
    super(`Registry not found at: ${path}`);
    this.name = 'RegistryNotFoundError';
  }
}

export class YamlParseError extends SkillfilesError {
  constructor(path: string, cause?: Error) {
    super(`Failed to parse YAML: ${path}${cause ? ` - ${cause.message}` : ''}`);
    this.name = 'YamlParseError';
  }
}

export class ScanPathNotFoundError extends SkillfilesError {
  constructor(key: string) {
    super(`Scan path key not found: ${key}`);
    this.name = 'ScanPathNotFoundError';
  }
}

export class MissingVarsError extends SkillfilesError {
  public readonly missingVars: string[];
  
  constructor(missingVars: string[]) {
    super(`Missing template variables: ${missingVars.join(', ')}`);
    this.name = 'MissingVarsError';
    this.missingVars = missingVars;
  }
}

export class OperationBlockedError extends SkillfilesError {
  constructor(reason: string) {
    super(`Operation blocked: ${reason}`);
    this.name = 'OperationBlockedError';
  }
}
