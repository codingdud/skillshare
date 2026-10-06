import { parseDocument } from 'yaml';
import { harnessId, harnessProfile, type PlatformId } from './harnesses.js';
import { nativeSlug, type NativePackage, type NativeIssue } from './native.js';

export type ConfigurationKind = 'mcp' | 'hook' | 'settings';
export type ConfigObject = Record<string, unknown>;
export const objectValue = (value: unknown): value is ConfigObject =>
  !!value && typeof value === 'object' && !Array.isArray(value);

// Replace comments with whitespace, preserving offsets for source diagnostics and patches.
// JSON.parse remains the grammar authority; YAML's JSON-compatible AST checks duplicate keys.
export function configurationSource(source: string) {
  const chars = source.split('');
  let quoted = false,
    escaped = false;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === '/' && chars[i + 1] === '/') {
      while (i < chars.length && chars[i] !== '\n') chars[i++] = ' ';
      i--;
    } else if (ch === '/' && chars[i + 1] === '*') {
      chars[i++] = ' ';
      chars[i++] = ' ';
      while (i < chars.length && !(chars[i] === '*' && chars[i + 1] === '/')) {
        if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
        i++;
      }
      if (i >= chars.length) throw new Error('Unclosed configuration comment.');
      chars[i] = ' ';
      chars[++i] = ' ';
    }
  }
  quoted = false;
  escaped = false;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    if (ch === ',') {
      let j = i + 1;
      while (/\s/.test(chars[j] ?? '') && j < chars.length) j++;
      if (chars[j] === '}' || chars[j] === ']') chars[i] = ' ';
    }
  }
  return chars.join('');
}
export function readConfiguration(source: string): ConfigObject {
  const clean = configurationSource(source);
  const value: unknown = JSON.parse(clean);
  if (!objectValue(value)) throw new Error('Configuration must be a JSON object.');
  const doc = parseDocument(clean, { uniqueKeys: true, stringKeys: true });
  if (doc.errors.length) throw new Error(doc.errors[0]!.message);
  const walk = (v: unknown) => {
    if (objectValue(v))
      for (const [key, child] of Object.entries(v)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key))
          throw new Error('Unsafe configuration property: ' + key);
        walk(child);
      }
    else if (Array.isArray(v)) v.forEach(walk);
  };
  walk(value);
  return value;
}
export function patchConfiguration(source: string, path: (string | number)[], value: unknown) {
  readConfiguration(source);
  const clean = configurationSource(source);
  const doc = parseDocument(clean);
  const node = doc.getIn(path, true) as { range?: [number, number, number] } | undefined;
  if (node?.range)
    return (
      source.slice(0, node.range[0]) + JSON.stringify(value, null, 2) + source.slice(node.range[1])
    );
  // Insert missing fields at the nearest existing object, preserving all existing source.
  for (let depth = path.length - 1; depth >= 0; depth--) {
    const parent = doc.getIn(path.slice(0, depth), true) as
      { range?: [number, number, number] } | undefined;
    if (!parent?.range) continue;
    let current: unknown = readConfiguration(source);
    for (const part of path.slice(0, depth))
      current =
        objectValue(current) || Array.isArray(current)
          ? (current as Record<string, unknown>)[part]
          : undefined;
    if (!objectValue(current)) throw new Error('The parent configuration value must be an object.');
    let nested = value;
    for (let i = path.length - 1; i > depth; i--) nested = { [path[i]!]: nested };
    const closing = clean.lastIndexOf('}', parent.range[1] - 1);
    let previous = closing - 1;
    while (/\s/.test(clean[previous] ?? '') && previous > parent.range[0]) previous--;
    const trailing = /,/.test(
      source
        .slice(previous + 1, closing)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, ''),
    );
    const comma = Object.keys(current).length && !trailing ? ',' : '';
    return (
      source.slice(0, closing) +
      comma +
      '\n' +
      JSON.stringify(path[depth]) +
      ': ' +
      JSON.stringify(nested, null, 2) +
      '\n' +
      source.slice(closing)
    );
  }
  throw new Error('Cannot patch this configuration. Edit the source file directly.');
}
export function configurationPath(platform: PlatformId, kind: ConfigurationKind, slug: string) {
  const p = harnessProfile(platform);
  if (kind === 'mcp') return p.mcp;
  if (kind === 'settings') return p.settings;
  return p.hook.endsWith('.json') ? p.hook : p.hook + '/' + slug + '.json';
}
export function createConfigurationPackage(
  platform: PlatformId,
  kind: ConfigurationKind,
  name: string,
): NativePackage {
  const p = harnessProfile(platform),
    id = harnessId(platform),
    slug = nativeSlug(name);
  if (!(p.configKinds as readonly string[]).includes(kind))
    throw new Error(p.label + ' does not support a shareable ' + kind + ' module in this profile.');
  const entrypoint = configurationPath(platform, kind, slug);
  let config: ConfigObject;
  const scripts = p.root + '/hooks/' + slug + '/check.mjs';
  if (kind === 'mcp')
    config = {
      mcpServers: {
        [slug]:
          id === 'gemini-cli'
            ? { httpUrl: 'http://localhost:3001/mcp' }
            : { type: 'http', url: 'http://localhost:3001/mcp' },
      },
    };
  else if (kind === 'settings')
    config =
      id === 'claude-code'
        ? { model: 'sonnet' }
        : id === 'gemini-cli'
          ? { general: { vimMode: false } }
          : id === 'copilot-cli'
            ? { disableAllHooks: false }
            : { 'chat.useHooks': false };
  else {
    const command = 'node ' + scripts;
    config = id.startsWith('copilot-')
      ? {
          ...(id === 'copilot-vscode' ? {} : { version: 1 }),
          hooks: {
            [p.hookEvent]: [
              {
                type: 'command',
                [p.shell]: command,
                ...(id === 'copilot-vscode' ? { timeout: 10 } : { timeoutSec: 10 }),
              },
            ],
          },
        }
      : {
          hooks: {
            [p.hookEvent]: [
              {
                matcher: p.hookTool,
                hooks: [{ type: 'command', command, timeout: id === 'gemini-cli' ? 10000 : 10 }],
              },
            ],
          },
        };
  }
  return {
    platform,
    schemaVersion: 1,
    ...(id === 'copilot-vscode' ? { sessionTarget: 'local' as const } : {}),
    entrypoint,
    files: [
      { path: entrypoint, content: JSON.stringify(config, null, 2) + '\n' },
      ...(kind === 'hook'
        ? [
            {
              path: scripts,
              content:
                '// Pass-through example. Replace with your reviewed validation logic.\nprocess.stdin.resume();\n',
            },
          ]
        : []),
    ],
  };
}
const events = {
  'claude-code': [
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'UserPromptSubmit',
    'Stop',
    'SessionStart',
    'SessionEnd',
    'SubagentStart',
    'SubagentStop',
    'PermissionRequest',
    'PreCompact',
    'Notification',
    'Setup',
  ],
  'gemini-cli': [
    'BeforeTool',
    'AfterTool',
    'BeforeAgent',
    'AfterAgent',
    'BeforeModel',
    'AfterModel',
    'BeforeToolSelection',
    'SessionStart',
    'SessionEnd',
    'PreCompress',
    'Notification',
  ],
  'copilot-vscode': [
    'PreToolUse',
    'PostToolUse',
    'UserPromptSubmit',
    'Stop',
    'SessionStart',
    'SubagentStart',
    'SubagentStop',
    'PreCompact',
  ],
  'copilot-cli': [
    'preToolUse',
    'postToolUse',
    'userPromptSubmitted',
    'sessionStart',
    'sessionEnd',
    'errorOccurred',
    'agentStop',
    'subagentStop',
    'subagentStart',
    'postToolUseFailure',
    'permissionRequest',
    'preCompact',
    'notification',
    'PreToolUse',
    'PostToolUse',
    'UserPromptSubmit',
    'SessionStart',
    'SessionEnd',
    'Stop',
    'SubagentStop',
  ],
  'copilot-cloud': [
    'preToolUse',
    'postToolUse',
    'userPromptSubmitted',
    'sessionStart',
    'sessionEnd',
    'PreToolUse',
    'PostToolUse',
    'UserPromptSubmit',
    'SessionStart',
    'SessionEnd',
  ],
} satisfies Record<string, readonly string[]>;
export function inspectConfigurationPackage(
  pkg: NativePackage,
  kind: ConfigurationKind,
): NativeIssue[] {
  const issues: NativeIssue[] = [],
    profile = harnessProfile(pkg.platform),
    id = harnessId(pkg.platform);
  const add = (message: string, path = pkg.entrypoint, severity: 'error' | 'warning' = 'error') =>
    issues.push({ message, path, severity });
  if (!(profile.configKinds as readonly string[]).includes(kind))
    add('This profile does not support a shareable ' + kind + ' module.');
  const expected = configurationPath(
    pkg.platform,
    kind,
    nativeSlug(
      pkg.entrypoint
        .split('/')
        .at(-1)
        ?.replace(/\.json$/, '') ?? 'module',
    ),
  );
  if (
    kind !== 'hook' &&
    pkg.entrypoint !== expected &&
    !(kind === 'mcp' && id === 'copilot-vscode' && pkg.entrypoint === '.vscode/mcp.json') &&
    !(kind === 'mcp' && id === 'copilot-cli' && pkg.entrypoint === '.github/mcp.json')
  )
    add('Use the native configuration destination: ' + expected);
  if (
    kind === 'hook' &&
    (profile.hook.endsWith('.json')
      ? pkg.entrypoint !== profile.hook
      : !pkg.entrypoint.startsWith(profile.hook + '/') || !pkg.entrypoint.endsWith('.json'))
  )
    add('Use the selected harness hook configuration destination.');
  for (const directory of pkg.folders ?? [])
    if (
      directory !== profile.root + '/hooks' &&
      directory !== profile.root + '/resources' &&
      !directory.startsWith(profile.root + '/hooks/') &&
      !directory.startsWith(profile.root + '/resources/')
    )
      add(
        'Supporting folders must stay inside the harness hooks or resources directory.',
        directory,
      );
  for (const file of pkg.files)
    if (
      file.path !== pkg.entrypoint &&
      !file.path.startsWith(profile.root + '/hooks/') &&
      !file.path.startsWith(profile.root + '/resources/')
    )
      add(
        'Supporting scripts/resources must stay inside the harness hooks or resources directory.',
        file.path,
      );
  let config: ConfigObject;
  try {
    config = readConfiguration(pkg.files.find((f) => f.path === pkg.entrypoint)?.content ?? '');
  } catch (error) {
    add(error instanceof Error ? error.message : 'Invalid configuration.');
    return issues;
  }
  const serverKey = pkg.entrypoint === '.vscode/mcp.json' ? 'servers' : 'mcpServers';
  if (kind === 'mcp') {
    if (!objectValue(config[serverKey]) || !Object.keys(config[serverKey]).length)
      add('Add at least one server under ' + serverKey + '.');
    else
      for (const [name, server] of Object.entries(config[serverKey])) {
        if (!name || !objectValue(server)) {
          add('Each MCP server needs a name and configuration object.');
          continue;
        }
        const remote = id === 'gemini-cli' ? (server.httpUrl ?? server.url) : server.url;
        if (
          server.command !== undefined &&
          (typeof server.command !== 'string' || !server.command.trim())
        )
          add('MCP command must be a nonempty string.');
        if (remote !== undefined) {
          try {
            const url = new URL(String(remote));
            if (
              !(
                id === 'claude-code' && server.type === 'ws' ? ['ws:', 'wss:'] : ['http:', 'https:']
              ).includes(url.protocol)
            )
              throw new Error();
          } catch {
            add('MCP remote URL must match its HTTP/SSE or supported WebSocket transport.');
          }
        }
        if (server.command === undefined && remote === undefined)
          add('Server ' + name + ' needs a command or remote URL.');
        if (server.command !== undefined && remote !== undefined)
          add('Choose a local command or remote URL, not both.');
        if (server.type !== undefined && id !== 'gemini-cli') {
          const local = ['local', 'stdio'].includes(String(server.type)),
            remoteType = (id === 'claude-code' ? ['http', 'sse', 'ws'] : ['http', 'sse']).includes(
              String(server.type),
            );
          if (!local && !remoteType) add('Unsupported MCP transport type for server ' + name + '.');
          if (local && server.command === undefined) add('Local/stdio transport needs a command.');
          if (remoteType && remote === undefined) add('Remote MCP transport needs a URL.');
          if (pkg.entrypoint === '.vscode/mcp.json' && server.type === 'local')
            add('VS Code servers use stdio rather than the Copilot local transport name.');
        }
        if (id === 'gemini-cli' && server.url !== undefined && server.httpUrl !== undefined)
          add('Choose url for SSE or httpUrl for HTTP, not both.');
        if (
          server.headers !== undefined &&
          (!objectValue(server.headers) ||
            Object.values(server.headers).some((v) => typeof v !== 'string'))
        )
          add('MCP headers must contain string values.');
        if (
          server.args !== undefined &&
          (!Array.isArray(server.args) || server.args.some((a) => typeof a !== 'string'))
        )
          add('MCP args must be a list of strings.');
        if (
          server.env !== undefined &&
          (!objectValue(server.env) || Object.values(server.env).some((v) => typeof v !== 'string'))
        )
          add('MCP environment values must be strings.');
      }
    if (Object.keys(config).some((k) => k !== serverKey))
      add(
        'An MCP module owns only the ' +
          serverKey +
          ' section. Use a Settings or Hooks module for other sections.',
      );
  }
  if (kind === 'hook') {
    if (id === 'copilot-vscode' && pkg.sessionTarget !== 'local')
      add('Select the Local VS Code session target for this hook format.');
    if (['copilot-cli', 'copilot-cloud'].includes(id) && config.version !== 1)
      add('Copilot hook files require version 1.');
    if (!objectValue(config.hooks) || !Object.keys(config.hooks).length)
      add('Define at least one hook event.');
    else
      for (const [event, groups] of Object.entries(config.hooks)) {
        if (!(events[id] as readonly string[]).includes(event))
          add(
            'Event ' +
              event +
              ' is not supported by this adapter; check the selected runtime version.',
          );
        if (!Array.isArray(groups) || !groups.length) {
          add('Hook events must contain a nonempty array.');
          continue;
        }
        for (const group of groups) {
          if (!objectValue(group)) {
            add('Hook definitions must be objects.');
            continue;
          }
          if (group.matcher !== undefined && typeof group.matcher !== 'string')
            add('Hook matcher must be a string.');
          if (typeof group.matcher === 'string')
            try {
              new RegExp(group.matcher);
            } catch {
              add('Invalid hook matcher regular expression.');
            }
          const commands = id.startsWith('copilot-') ? [group] : group.hooks;
          if (!Array.isArray(commands) || !commands.length) {
            add('Hook groups need a nonempty hooks array.');
            continue;
          }
          for (const hook of commands) {
            if (!objectValue(hook) || hook.type !== 'command') {
              add('This adapter supports command hooks.');
              continue;
            }
            const commands = [
              hook.command,
              hook.bash,
              hook.powershell,
              hook.exec,
              hook.windows,
              hook.linux,
              hook.osx,
            ].filter((v) => v !== undefined);
            if (!commands.length || commands.some((v) => typeof v !== 'string' || !v.trim()))
              add('Provide a nonempty hook command.');
            if (hook.exec && (hook.command || hook.bash || hook.powershell))
              add('Do not combine exec with shell command fields.');
            if (
              hook.args !== undefined &&
              (!Array.isArray(hook.args) || hook.args.some((v) => typeof v !== 'string'))
            )
              add('Hook args must be strings.');
            if (id === 'copilot-cloud' && !hook.bash && !hook.command)
              add('Cloud hooks need a bash or cross-platform command.');
            if (
              !id.startsWith('copilot-') &&
              (!hook.command || hook.bash || hook.powershell || hook.exec)
            )
              add('This harness requires its native command field.');
            const timeout = hook.timeoutSec ?? hook.timeout;
            if (
              timeout !== undefined &&
              (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0)
            )
              add('Hook timeout must be a positive number.');
            for (const command of commands)
              if (typeof command === 'string')
                for (const match of command.matchAll(
                  /(?:^|\s)(\.(?:claude|gemini|github)\/[^\s"']+\.(?:mjs|js|sh|ps1|py))(?=\s|$)/g,
                ))
                  if (!pkg.files.some((f) => f.path === match[1]))
                    add('Hook script is not bundled: ' + match[1]);
          }
        }
      }
    if (Object.keys(config).some((k) => !['hooks', 'version'].includes(k)))
      add('A Hooks module owns hooks and its format version only.');
  }
  if (kind === 'settings') {
    if (!Object.keys(config).length) add('Add at least one setting.');
    if ('mcpServers' in config || 'servers' in config || 'hooks' in config)
      add(
        'Use MCP or Hooks modules for these sections so their validation and attribution are preserved.',
      );
  }
  add(
    'Configuration syntax is checked. Connections and commands have not been executed.',
    pkg.entrypoint,
    'warning',
  );
  return issues;
}
