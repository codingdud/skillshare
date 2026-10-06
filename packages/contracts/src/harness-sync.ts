import { z } from 'zod';

export const cliScopes = ['harness:read', 'harness:write', 'harness:publish'] as const;
export const deviceStartSchema = z.strictObject({
  client_id: z.literal('skillshare-cli'),
  scope: z
    .string()
    .max(100)
    .default(cliScopes.join(' '))
    .refine(
      (value) =>
        value.split(' ').every((scope) => (cliScopes as readonly string[]).includes(scope)),
      'Unsupported CLI scope.',
    ),
  label: z.string().trim().min(1).max(80).default('SkillShare CLI'),
});
export const deviceDecisionSchema = z.strictObject({
  code: z.string().regex(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/),
  approve: z.boolean(),
  harnessIds: z
    .array(z.uuid())
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'Choose each Harness once.')
    .optional(),
});
export const runtimeIds = [
  'claude-code',
  'gemini-cli',
  'copilot-vscode',
  'copilot-cli',
  'copilot-cloud',
] as const;
export const bindingSchema = z.strictObject({
  schemaVersion: z.literal(1),
  server: z.url(),
  harnessId: z.uuid(),
  profiles: z
    .array(z.enum(runtimeIds))
    .min(1)
    .max(5)
    .refine((profiles) => new Set(profiles).size === profiles.length, 'Select each profile once.'),
});
export type Binding = z.infer<typeof bindingSchema>;
export type SyncFile = { path: string; content: string; executable?: boolean };

export function blockedSyncPath(path: string) {
  return (
    path
      .split('/')
      .some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          /[\\:\0<>"|?*]/.test(part) ||
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part) ||
          /^(\.git|node_modules|local|tmp|cache|logs|sessions|session-state)$/i.test(part) ||
          /^\.skillshare-write-[a-f0-9-]{36}\.tmp$/i.test(part) ||
          /(^\.env($|\.)|credentials|oauth[_-]|oauth.*tokens|\.pem$|\.key$|\.p12$|\.log$|settings\.local\.json$|CLAUDE\.local\.md$|google_accounts\.json$|trustedFolders\.json$|permissions-config\.json$)/i.test(
            part,
          ),
      ) || path.startsWith('.skillshare/')
  );
}
export function selectedSyncPath(path: string, profiles: readonly string[]) {
  if (blockedSyncPath(path)) return false;
  if (path === 'AGENTS.md' || path.startsWith('.agents/skills/')) return true;
  if (
    profiles.includes('claude-code') &&
    (path.startsWith('.claude/') || path === 'CLAUDE.md' || path === '.mcp.json')
  )
    return true;
  if (profiles.includes('gemini-cli') && (path.startsWith('.gemini/') || path === 'GEMINI.md'))
    return true;
  if (profiles.some((p) => p.startsWith('copilot'))) {
    if (
      /^\.github\/(agents|skills|instructions|prompts|hooks)\//.test(path) ||
      path === '.github/copilot-instructions.md'
    )
      return true;
    if (
      profiles.includes('copilot-cli') &&
      ['.github/copilot/settings.json', '.github/mcp.json', '.mcp.json'].includes(path)
    )
      return true;
    if (
      profiles.includes('copilot-vscode') &&
      ['.vscode/settings.json', '.vscode/mcp.json', '.mcp.json'].includes(path)
    )
      return true;
  }
  return false;
}
export function assertShareable(files: SyncFile[]) {
  for (const file of files) {
    if (blockedSyncPath(file.path)) throw new Error('Excluded or unsafe sync path: ' + file.path);
    if (/\0/.test(file.content)) throw new Error('Binary files are not supported: ' + file.path);
    // Conservative checks: never print the matched value or silently rewrite source.
    if (
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:gh[pousr]_|github_pat_|AIza|sk-ant-)[A-Za-z0-9_-]{15,}/.test(
        file.content,
      ) ||
      /["'](?:password|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization)["']\s*:\s*["'](?![$<]|Bearer \$)[^"'\r\n]{8,}["']/i.test(
        file.content,
      )
    )
      throw new Error(
        'Possible literal credential in ' +
          file.path +
          '. Use a native environment reference before syncing.',
      );
  }
}
export const equalSyncFile = (a?: SyncFile, b?: SyncFile, ignoreCRLF = false) =>
  (ignoreCRLF
    ? a?.content.replace(/\r\n/g, '\n') === b?.content.replace(/\r\n/g, '\n')
    : a?.content === b?.content) && !!a?.executable === !!b?.executable;
export type SyncChange = { path: string; before?: SyncFile; after?: SyncFile };
export function compareSync(
  base: SyncFile[],
  local: SyncFile[],
  remote: SyncFile[],
  direction: 'push' | 'pull',
  ignoreCRLF = false,
) {
  const equal = (a?: SyncFile, b?: SyncFile) => equalSyncFile(a, b, ignoreCRLF);
  const maps = [base, local, remote].map(
    (files) => new Map(files.map((file) => [file.path, file])),
  );
  const changes: SyncChange[] = [],
    conflicts: string[] = [];
  for (const path of [...new Set([...base, ...local, ...remote].map((f) => f.path))].sort()) {
    const b = maps[0]!.get(path),
      l = maps[1]!.get(path),
      r = maps[2]!.get(path);
    if (equal(l, r)) continue;
    if (!equal(l, b) && !equal(r, b)) {
      conflicts.push(path);
      continue;
    }
    if (direction === 'push' && !equal(l, b)) changes.push({ path, before: r, after: l });
    if (direction === 'pull' && !equal(r, b)) changes.push({ path, before: l, after: r });
  }
  return { changes, conflicts };
}
