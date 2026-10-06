import { z } from 'zod';

export const assetKinds = ['skill', 'agent', 'workflow', 'mcp', 'hook', 'settings'] as const;
export type AssetKind = (typeof assetKinds)[number];
export interface AssetModule {
  label: string;
  plural: string;
  description: string;
  sections: readonly string[];
  native: boolean;
  composition: boolean;
  prompt: boolean;
}
export const assetModules = {
  skill: {
    label: 'Skill',
    plural: 'Skills',
    description: 'A focused capability with instructions and supporting resources.',
    sections: ['Basics', 'Instructions', 'Examples', 'Publish'],
    native: true,
    composition: false,
    prompt: true,
  },
  agent: {
    label: 'Agent',
    plural: 'Agents',
    description: 'An assistant with its own goal, tools, skills, and delegation rules.',
    sections: ['Basics', 'Instructions', 'Composition', 'Examples', 'Publish'],
    native: true,
    composition: true,
    prompt: true,
  },
  workflow: {
    label: 'Workflow',
    plural: 'Workflows',
    description: 'A versioned combination of skills, agents, MCP, settings, and native hooks.',
    sections: ['Basics', 'Components', 'Hooks', 'Stages', 'Review', 'Publish'],
    native: false,
    composition: true,
    prompt: true,
  },
  mcp: {
    label: 'MCP server',
    plural: 'MCP servers',
    description: 'A reusable server connection and its tool exposure requirements.',
    sections: ['Basics', 'Instructions', 'Publish'],
    native: true,
    composition: false,
    prompt: false,
  },
  hook: {
    label: 'Hooks',
    plural: 'Hooks',
    description: 'Harness lifecycle events, matchers, commands, and supporting scripts.',
    sections: ['Basics', 'Instructions', 'Publish'],
    native: true,
    composition: false,
    prompt: false,
  },
  settings: {
    label: 'Harness settings',
    plural: 'Settings',
    description: 'Shared configuration for a specific coding assistant and scope.',
    sections: ['Basics', 'Instructions', 'Publish'],
    native: true,
    composition: false,
    prompt: false,
  },
} as const satisfies Record<AssetKind, AssetModule>;
export const moduleDescriptorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('skill'), schemaVersion: z.literal(1) }),
  z.strictObject({ kind: z.literal('agent'), schemaVersion: z.literal(1) }),
  z.strictObject({ kind: z.literal('workflow'), schemaVersion: z.literal(1) }),
  z.strictObject({ kind: z.literal('mcp'), schemaVersion: z.literal(1) }),
  z.strictObject({ kind: z.literal('hook'), schemaVersion: z.literal(1) }),
  z.strictObject({ kind: z.literal('settings'), schemaVersion: z.literal(1) }),
]);
export const moduleReferenceSchema = z.strictObject({
  role: z.enum(['mcp', 'hook', 'settings']),
  releaseId: z.uuid(),
});
export function isConfigurationKind(kind: string): kind is 'mcp' | 'hook' | 'settings' {
  return ['mcp', 'hook', 'settings'].includes(kind);
}
