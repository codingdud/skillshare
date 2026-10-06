export const harnesses = {
  'claude-code': {
    label: 'Claude Code',
    root: '.claude',
    docs: 'https://code.claude.com/docs/en/sub-agents',
    settings: '.claude/settings.json',
    mcp: '.mcp.json',
    hook: '.claude/settings.json',
    hookEvent: 'PreToolUse',
    hookTool: 'Read',
    shell: 'command',
    nestedDelegation: true,
    agentSuffix: '.md',
    schemaVersion: 1,
    configKinds: ['mcp', 'hook', 'settings'],
  },
  'gemini-cli': {
    label: 'Gemini CLI',
    root: '.gemini',
    docs: 'https://geminicli.com/docs/core/subagents/',
    settings: '.gemini/settings.json',
    mcp: '.gemini/settings.json',
    hook: '.gemini/settings.json',
    hookEvent: 'BeforeTool',
    hookTool: 'read_file',
    shell: 'command',
    nestedDelegation: false,
    agentSuffix: '.md',
    schemaVersion: 1,
    configKinds: ['mcp', 'hook', 'settings'],
  },
  'copilot-vscode': {
    label: 'Copilot · VS Code (Local)',
    root: '.github',
    docs: 'https://code.visualstudio.com/docs/agent-customization/custom-agents',
    settings: '.vscode/settings.json',
    mcp: '.mcp.json',
    hook: '.github/hooks',
    hookEvent: 'PreToolUse',
    hookTool: 'read',
    shell: 'command',
    nestedDelegation: true,
    agentSuffix: '.agent.md',
    schemaVersion: 1,
    configKinds: ['mcp', 'hook', 'settings'],
  },
  'copilot-cli': {
    label: 'Copilot CLI',
    root: '.github',
    docs: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/overview',
    settings: '.github/copilot/settings.json',
    mcp: '.mcp.json',
    hook: '.github/hooks',
    hookEvent: 'preToolUse',
    hookTool: 'view',
    shell: 'bash',
    nestedDelegation: true,
    agentSuffix: '.agent.md',
    schemaVersion: 1,
    configKinds: ['mcp', 'hook', 'settings'],
  },
  'copilot-cloud': {
    label: 'Copilot cloud agent',
    root: '.github',
    docs: 'https://docs.github.com/en/copilot/reference/custom-agents-configuration',
    settings: '',
    mcp: '',
    hook: '.github/hooks',
    hookEvent: 'preToolUse',
    hookTool: 'view',
    shell: 'bash',
    nestedDelegation: true,
    agentSuffix: '.agent.md',
    schemaVersion: 1,
    configKinds: ['hook'],
  },
} as const;
export type HarnessId = keyof typeof harnesses;
export type HarnessTarget = {
  id: HarnessId;
  sessionTarget?: 'local' | 'copilot';
  schemaVersion?: 1;
};
export const legacyHarnesses = {
  claude: 'claude-code',
  gemini: 'gemini-cli',
  copilot: 'copilot-vscode',
} as const;
export type LegacyPlatform = keyof typeof legacyHarnesses;
export type PlatformId = HarnessId | LegacyPlatform;
export function harnessId(id: PlatformId): HarnessId {
  return id in legacyHarnesses ? legacyHarnesses[id as LegacyPlatform] : (id as HarnessId);
}
export function harnessProfile(id: PlatformId) {
  return harnesses[harnessId(id)];
}
export const platforms = {
  ...harnesses,
  claude: harnesses['claude-code'],
  gemini: harnesses['gemini-cli'],
  copilot: harnesses['copilot-vscode'],
};
export const selectableHarnesses = Object.entries(harnesses).map(([id, profile]) => ({
  id: id as HarnessId,
  ...profile,
}));

export const harnessReferences = {
  'claude-code': {
    skill: 'https://code.claude.com/docs/en/skills',
    agent: 'https://code.claude.com/docs/en/sub-agents',
    mcp: 'https://code.claude.com/docs/en/mcp',
    hook: 'https://code.claude.com/docs/en/hooks',
    settings: 'https://code.claude.com/docs/en/settings',
  },
  'gemini-cli': {
    skill: 'https://geminicli.com/docs/cli/skills/',
    agent: 'https://geminicli.com/docs/core/subagents/',
    mcp: 'https://geminicli.com/docs/tools/mcp-server/',
    hook: 'https://geminicli.com/docs/hooks/reference/',
    settings: 'https://geminicli.com/docs/reference/configuration/',
  },
  'copilot-vscode': {
    skill: 'https://docs.github.com/en/copilot/concepts/agents/about-agent-skills',
    agent: 'https://code.visualstudio.com/docs/agent-customization/custom-agents',
    mcp: 'https://code.visualstudio.com/docs/agent-customization/mcp-servers',
    hook: 'https://code.visualstudio.com/docs/agent-customization/hooks',
    settings: 'https://code.visualstudio.com/docs/configure/settings',
  },
  'copilot-cli': {
    skill: 'https://docs.github.com/en/copilot/concepts/agents/about-agent-skills',
    agent: 'https://docs.github.com/en/copilot/reference/custom-agents-configuration',
    mcp: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers',
    hook: 'https://docs.github.com/en/copilot/reference/hooks-reference',
    settings: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/overview',
  },
  'copilot-cloud': {
    skill: 'https://docs.github.com/en/copilot/concepts/agents/about-agent-skills',
    agent: 'https://docs.github.com/en/copilot/reference/custom-agents-configuration',
    mcp: 'https://docs.github.com/en/copilot/reference/custom-agents-configuration',
    hook: 'https://docs.github.com/en/copilot/reference/hooks-reference',
    settings: 'https://docs.github.com/en/copilot/reference/custom-agents-configuration',
  },
} as const;
