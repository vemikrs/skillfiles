/**
 * Shared constants and utilities for Skillfiles extension
 */

import * as vscode from 'vscode';

export interface AgentProfile {
  vendor: string;
  instructionPaths: string[];
  skillFolderPath: string;
  skillFileName: string;
}

export interface HomeSkillDir {
  agent: string;
  path: string;
}

/**
 * Get home skill directories from agentProfiles configuration.
 * This is the single source of truth for skill folder paths.
 */
export function getHomeSkillDirs(): HomeSkillDir[] {
  const config = vscode.workspace.getConfiguration('skillfiles');
  const agentProfiles = config.get<Record<string, AgentProfile>>('agentProfiles') || {};
  
  return Object.entries(agentProfiles).map(([agentName, profile]) => ({
    agent: agentName,
    path: profile.skillFolderPath
  }));
}
