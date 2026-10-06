import { z } from 'zod';
import { parseDocument, stringify } from 'yaml';

import { platforms, harnessId, harnessProfile, type PlatformId } from './harnesses.js';
import { createConfigurationPackage, inspectConfigurationPackage } from './native-config.js';
export { platforms } from './harnesses.js';
export const platformSchema = z.enum([
  'claude',
  'copilot',
  'gemini',
  'claude-code',
  'gemini-cli',
  'copilot-vscode',
  'copilot-cli',
  'copilot-cloud',
]);
export type NativePlatform = PlatformId;
export const filePathSchema = z
  .string()
  .min(1)
  .max(220)
  .refine((path) => {
    return (
      /^[a-zA-Z0-9._/-]+$/.test(path) &&
      path
        .split('/')
        .every(
          (part) =>
            part !== '' &&
            part !== '.' &&
            part !== '..' &&
            !/[. ]$/.test(part) &&
            !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(part) &&
            !/^(\.git|\.env(?:\..*)?|node_modules)$/i.test(part),
        )
    );
  }, 'Use a safe relative path with forward slashes; credentials and traversal paths are not allowed.');
export const nativeFileSchema = z.strictObject({
  path: filePathSchema,
  content: z
    .string()
    .max(100000)
    .refine((value) => utf8Size(value) <= 100000, 'Keep each UTF-8 file below 100 KB.'),
});
function utf8Size(text: string) {
  let size = 0;
  for (const char of text) {
    const point = char.codePointAt(0)!;
    size += point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4;
  }
  return size;
}
export const nativePackageSchema = z
  .strictObject({
    platform: platformSchema,
    schemaVersion: z.literal(1).optional(),
    sessionTarget: z.enum(['local', 'copilot']).optional(),
    runtimeRange: z.string().trim().min(1).max(100).optional(),
    entrypoint: filePathSchema,
    files: z.array(nativeFileSchema).min(1).max(64),
    folders: z.array(filePathSchema).max(128).optional(),
  })
  .superRefine((pkg, ctx) => {
    const paths = pkg.files.map((f) => f.path.toLowerCase());
    const folders = (pkg.folders ?? []).map((folder) => folder.toLowerCase());
    if (new Set(folders).size !== folders.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Folder paths must be unique (including letter case).',
        path: ['folders'],
      });
    if (
      folders.some((folder) =>
        paths.some((file) => folder === file || folder.startsWith(file + '/')),
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'A file cannot also be a directory.',
        path: ['folders'],
      });
    if (new Set(paths).size !== paths.length)
      ctx.addIssue({
        code: 'custom',
        message: 'File paths must be unique (including letter case).',
        path: ['files'],
      });
    if (!pkg.files.some((f) => f.path === pkg.entrypoint))
      ctx.addIssue({ code: 'custom', message: 'The entry file must exist.', path: ['entrypoint'] });
    if (paths.some((p) => paths.some((other) => other.startsWith(p + '/'))))
      ctx.addIssue({
        code: 'custom',
        message: 'A file cannot also be a directory.',
        path: ['files'],
      });
    if (pkg.files.reduce((n, f) => n + utf8Size(f.content), 0) > 500000)
      ctx.addIssue({ code: 'custom', message: 'Keep the package below 500 KB.', path: ['files'] });
  });
export type NativePackage = z.infer<typeof nativePackageSchema>;
export type NativeFile = z.infer<typeof nativeFileSchema>;
export type NativeIssue = {
  severity: 'error' | 'warning';
  message: string;
  path: string;
  line?: number;
};
export function splitFrontmatter(source: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  return match
    ? { header: match[1]!, body: source.slice(match[0].length) }
    : { header: null, body: source };
}
export function readFrontmatter(source: string): Record<string, unknown> {
  const { header } = splitFrontmatter(source);
  if (header === null)
    throw new Error('Start the entry file with YAML frontmatter between --- lines.');
  const doc = parseDocument(header, { uniqueKeys: true, stringKeys: true });
  if (doc.errors.length) throw new Error(doc.errors[0]!.message);
  const value: unknown = doc.toJS({ maxAliasCount: 0 });
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Frontmatter must be a YAML mapping.');
  return value as Record<string, unknown>;
}
export function patchFrontmatter(pkg: NativePackage, key: string, value: unknown): NativePackage {
  const entry = pkg.files.find((f) => f.path === pkg.entrypoint);
  if (!entry) throw new Error('Entry file missing.');
  const parts = splitFrontmatter(entry.content);
  if (parts.header === null) throw new Error('Add valid YAML frontmatter first.');
  readFrontmatter(entry.content);
  const doc = parseDocument(parts.header);
  doc.set(key, value);
  return {
    ...pkg,
    files: pkg.files.map((f) =>
      f.path === pkg.entrypoint
        ? { ...f, content: '---\n' + doc.toString() + '---\n' + parts.body }
        : f,
    ),
  };
}
export function nativeInstructions(pkg: NativePackage) {
  if (/\.jsonc?$/.test(pkg.entrypoint)) return '';
  return splitFrontmatter(pkg.files.find((f) => f.path === pkg.entrypoint)?.content ?? '').body;
}
export function nativeSlug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64)
      .replace(/-$/, '') || 'my-asset'
  );
}
export function createNativePackage(
  platform: NativePlatform,
  type: 'skill' | 'agent' | 'mcp' | 'hook' | 'settings',
  name: string,
  description: string,
  instructions: string,
): NativePackage {
  if (type === 'mcp' || type === 'hook' || type === 'settings')
    return createConfigurationPackage(platform, type, name);
  const profileId = harnessId(platform);
  const isCopilot = profileId.startsWith('copilot-');
  const slug = nativeSlug(name),
    root = platforms[platform].root;
  const entrypoint =
    type === 'skill'
      ? `${root}/skills/${slug}/SKILL.md`
      : `${root}/agents/${slug}${isCopilot ? '.agent' : ''}.md`;
  const reference =
    type === 'skill' ? 'references/checklist.md' : `../resources/${slug}/references/checklist.md`;
  const folder = entrypoint.slice(0, entrypoint.lastIndexOf('/') + 1);
  const header: Record<string, unknown> = {
    name: slug,
    description: description || 'Describe when to use this capability and its expected result.',
  };
  if (type === 'skill') {
    if (profileId === 'claude-code')
      Object.assign(header, {
        'allowed-tools': 'Read Grep Glob',
        'disable-model-invocation': false,
      });
  } else if (profileId === 'claude-code')
    Object.assign(header, {
      tools: ['Read', 'Grep', 'Glob'],
      disallowedTools: ['Write', 'Edit'],
      model: 'inherit',
      permissionMode: 'default',
      maxTurns: 20,
      skills: [],
    });
  else if (isCopilot)
    Object.assign(header, {
      tools: ['search', 'read'],
      ...(profileId === 'copilot-vscode'
        ? { agents: [], target: 'vscode' }
        : { target: 'github-copilot' }),
      'user-invocable': true,
      'disable-model-invocation': false,
    });
  else
    Object.assign(header, {
      kind: 'local',
      tools: ['read_file', 'grep_search'],
      model: 'inherit',
      temperature: 0.2,
      max_turns: 20,
      timeout_mins: 10,
    });
  return {
    platform,
    schemaVersion: 1,
    ...(profileId === 'copilot-vscode' ? { sessionTarget: 'local' as const } : {}),
    entrypoint,
    files: [
      {
        path: entrypoint,
        content: `---\n${stringify(header)}---\n\n${instructions || '# Instructions\n\nDescribe the task, inputs, procedure, boundaries, and expected output.'}\n\n## References\n\nRead [the checklist](${reference}) when reviewing the result.\n`,
      },
      {
        path:
          type === 'skill'
            ? folder + reference
            : `${root}/resources/${slug}/references/checklist.md`,
        content:
          '# Review checklist\n\n- Confirm the requested outcome.\n- Identify missing inputs and state assumptions.\n- Review the result before using it.\n',
      },
    ],
  };
}

export function inspectNativePackage(pkg: NativePackage, type: string): NativeIssue[] {
  const issues: NativeIssue[] = [];
  const issue = (
    message: string,
    severity: NativeIssue['severity'] = 'error',
    path = pkg.entrypoint,
  ) => issues.push({ message, severity, path });
  const parsed = nativePackageSchema.safeParse(pkg);
  if (!parsed.success)
    return parsed.error.issues.map((i) => ({
      severity: 'error',
      message: i.message,
      path: pkg.entrypoint,
    }));
  if (type === 'workflow') {
    issue('Workflows use the SkillShare manifest; native packages are for skills and agents.');
    return issues;
  }
  if (type === 'mcp' || type === 'hook' || type === 'settings')
    return inspectConfigurationPackage(pkg, type);
  const profileId = harnessId(pkg.platform);
  const isCopilot = profileId.startsWith('copilot-');
  const root = platforms[pkg.platform].root;
  const expected =
    type === 'skill'
      ? new RegExp(`^\\${root}/skills/[a-z0-9-]+/SKILL\\.md$`)
      : new RegExp(`^\\${root}/agents/[a-zA-Z0-9_/-]+${isCopilot ? '\\.agent' : ''}\\.md$`);
  if (!expected.test(pkg.entrypoint))
    issue(
      `Use ${root}/${type === 'skill' ? 'skills/<name>/SKILL.md' : `agents/<name>${isCopilot ? '.agent' : ''}.md`} as the entry file.`,
    );
  const folder = pkg.entrypoint.slice(0, pkg.entrypoint.lastIndexOf('/') + 1);
  for (const file of pkg.files)
    if (
      !file.path.startsWith(type === 'skill' ? folder : `${root}/agents/`) &&
      !(type === 'agent' && file.path.startsWith(`${root}/resources/`))
    )
      issue('Supporting files must stay inside this asset folder.', 'error', file.path);
  for (const directory of pkg.folders ?? []) {
    const scope = type === 'skill' ? folder.slice(0, -1) : `${root}/agents`;
    if (
      directory !== scope &&
      !directory.startsWith(scope + '/') &&
      !(
        type === 'agent' &&
        (directory === `${root}/resources` || directory.startsWith(`${root}/resources/`))
      )
    )
      issue('Folders must stay inside this asset folder.', 'error', directory);
  }
  const source = pkg.files.find((f) => f.path === pkg.entrypoint)!.content;
  let metadata: Record<string, unknown>;
  try {
    metadata = readFrontmatter(source);
  } catch (e) {
    issue(e instanceof Error ? e.message : 'Invalid YAML.');
    return issues;
  }
  if (
    typeof metadata.description !== 'string' ||
    !metadata.description.trim() ||
    metadata.description.length > 1024
  )
    issue('Provide a description of 1–1024 characters.');
  if (type === 'skill' || !isCopilot) {
    if (
      typeof metadata.name !== 'string' ||
      !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(metadata.name) ||
      metadata.name.length > 64
    )
      issue('Provide a lowercase name with digits and hyphens (maximum 64 characters).');
    if (type === 'skill' && metadata.name !== pkg.entrypoint.split('/').at(-2))
      issue('The skill name must match its containing directory.');
  }
  if (!splitFrontmatter(source).body.trim()) issue('Add instructions after the frontmatter.');
  if (metadata.model !== undefined && !isCopilot && typeof metadata.model !== 'string')
    issue('model must be a string.');
  if (
    metadata.hooks !== undefined &&
    (!metadata.hooks || typeof metadata.hooks !== 'object' || Array.isArray(metadata.hooks))
  )
    issue('hooks must be a YAML mapping.');
  const strings = (key: string, allowString = false) => {
    const v = metadata[key];
    if (
      v !== undefined &&
      !(allowString && typeof v === 'string') &&
      !(Array.isArray(v) && v.every((x) => typeof x === 'string'))
    )
      issue(`${key} must be ${allowString ? 'a string or ' : ''}a list of strings.`);
  };
  const bools = (keys: string[]) =>
    keys.forEach((key) => {
      if (metadata[key] !== undefined && typeof metadata[key] !== 'boolean')
        issue(`${key} must be true or false.`);
    });
  if (type === 'skill') {
    strings('allowed-tools', true);
    bools(['disable-model-invocation', 'user-invocable']);
    if ('tools' in metadata)
      issue('Skill tool hints use allowed-tools; tools is an agent field.', 'warning');
  } else {
    strings('tools', profileId === 'claude-code' || isCopilot);
    if (!('tools' in metadata))
      issue(
        'Tools are inherited when omitted. Declare an explicit list if access should be restricted.',
        'warning',
      );
    if (profileId === 'claude-code') {
      strings('disallowedTools', true);
      strings('skills');
      if (
        metadata.maxTurns !== undefined &&
        (typeof metadata.maxTurns !== 'number' ||
          !Number.isInteger(metadata.maxTurns) ||
          metadata.maxTurns <= 0)
      )
        issue('maxTurns must be a positive integer.');
      if (
        metadata.permissionMode !== undefined &&
        ![
          'default',
          'manual',
          'acceptEdits',
          'dontAsk',
          'bypassPermissions',
          'plan',
          'auto',
        ].includes(String(metadata.permissionMode))
      )
        issue('Unknown Claude permissionMode.');
      if (metadata.permissionMode === 'bypassPermissions')
        issue('This agent requests bypassPermissions; review before installing.', 'warning');
    }
    if (isCopilot) {
      if (profileId !== 'copilot-vscode' && ('handoffs' in metadata || 'argument-hint' in metadata))
        issue(
          'This Copilot profile does not support VS Code handoffs or argument-hint.',
          'warning',
        );
      if (profileId === 'copilot-vscode' && 'mcp-servers' in metadata)
        issue('VS Code ignores agent-scoped mcp-servers; use a workspace MCP module.', 'warning');
      if (profileId === 'copilot-cloud' && 'agents' in metadata)
        issue('The VS Code agents allowlist is not supported by this cloud profile.', 'warning');
      if (profileId !== 'copilot-vscode' && 'hooks' in metadata)
        issue(
          'Use a standalone Hooks module; this profile does not support agent-scoped Local hooks.',
          'warning',
        );
      strings('agents', true);
      strings('model', true);
      bools(['user-invocable', 'disable-model-invocation']);
      if (
        Array.isArray(metadata.agents) &&
        metadata.agents.length &&
        Array.isArray(metadata.tools) &&
        !metadata.tools.some((t) => t === 'agent' || t === 'agent/runSubagent' || t === '*')
      )
        issue('Add the agent tool to tools when declaring subagents.');
      if (
        metadata.handoffs !== undefined &&
        (!Array.isArray(metadata.handoffs) ||
          metadata.handoffs.some(
            (h) =>
              !h ||
              typeof h !== 'object' ||
              !['label', 'agent', 'prompt'].every((key) => typeof h[key] === 'string'),
          ))
      )
        issue('Each handoff needs label, agent, and prompt strings.');
    }
    if (profileId === 'gemini-cli') {
      if (metadata.kind !== undefined && metadata.kind !== 'local')
        issue(
          'This editor exports local Gemini agents. Remote A2A agents need a separate connection configuration.',
        );
      for (const key of ['max_turns', 'timeout_mins'])
        if (
          metadata[key] !== undefined &&
          (typeof metadata[key] !== 'number' || Number(metadata[key]) <= 0)
        )
          issue(`${key} must be a positive number.`);
      if (
        metadata.temperature !== undefined &&
        (typeof metadata.temperature !== 'number' ||
          Number(metadata.temperature) < 0 ||
          Number(metadata.temperature) > 2)
      )
        issue('temperature must be between 0 and 2.');
      if ('agents' in metadata)
        issue(
          'Gemini has no equivalent to Copilot agents allowlists; preserve delegation instructions in the Markdown body.',
          'warning',
        );
    }
  }
  // Resolve local Markdown references without accessing the host filesystem or network.
  for (const file of pkg.files.filter((f) => f.path.endsWith('.md'))) {
    for (const match of file.content.matchAll(/\]\(([^\s)]+)\)/g)) {
      const link = match[1]!;
      if (/^(?:[a-z]+:|#|\/)/i.test(link)) continue;
      const target = link.split('#')[0]!.split('?')[0]!;
      if (!target) continue;
      const parts = file.path.split('/').slice(0, -1);
      for (const part of target.split('/')) {
        if (part === '..') parts.pop();
        else if (part && part !== '.') parts.push(part);
      }
      if (!pkg.files.some((f) => f.path === parts.join('/')))
        issue(`Reference is not bundled: ${link}`, 'warning', file.path);
    }
  }
  return issues;
}
