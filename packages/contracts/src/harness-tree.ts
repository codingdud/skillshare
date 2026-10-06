import { type HarnessId } from './harnesses.js';
import { createNativePackage, type NativeIssue } from './native.js';
import {
  objectValue,
  patchConfiguration,
  readConfiguration,
  type ConfigObject,
} from './native-config.js';

export type HarnessTreeFile = { path: string; content: string };
export type HarnessTemplateKind = 'agent' | 'skill' | 'mcp' | 'hook' | 'settings';
export type HarnessComponent = {
  path: string;
  kind: HarnessTemplateKind;
  name: string;
  runtime: string;
  detail: string;
};

/** Native source stays authoritative. Only the requested configuration keys are patched. */
export function addHarnessTemplate(
  files: HarnessTreeFile[],
  runtime: HarnessId,
  kind: HarnessTemplateKind,
  name: string,
  phase: 'pre' | 'post' = 'pre',
) {
  const pkg = createNativePackage(runtime, kind, name, '', '');
  if (kind === 'hook') {
    const entry = pkg.files.find((file) => file.path === pkg.entrypoint)!;
    const config = readConfiguration(entry.content);
    const hooks = config.hooks as ConfigObject;
    const original = Object.keys(hooks)[0]!;
    const event =
      runtime === 'gemini-cli'
        ? phase === 'pre'
          ? 'BeforeTool'
          : 'AfterTool'
        : runtime === 'copilot-cli' || runtime === 'copilot-cloud'
          ? phase === 'pre'
            ? 'preToolUse'
            : 'postToolUse'
          : phase === 'pre'
            ? 'PreToolUse'
            : 'PostToolUse';
    config.hooks = { [event]: hooks[original] };
    if (runtime === 'copilot-cli')
      for (const hook of (config.hooks as ConfigObject)[event] as ConfigObject[])
        hook.powershell = hook.bash;
    entry.content = JSON.stringify(config, null, 2) + '\n';
  }
  const next = files.map((file) => ({ ...file }));
  for (const incoming of pkg.files) {
    const existing = next.find((file) => file.path.toLowerCase() === incoming.path.toLowerCase());
    if (!existing) {
      next.push({ ...incoming });
      continue;
    }
    if (
      kind === 'hook' &&
      incoming.path !== pkg.entrypoint &&
      existing.content === incoming.content
    )
      continue;
    if (!['mcp', 'hook', 'settings'].includes(kind) || incoming.path !== pkg.entrypoint)
      throw new Error('This path already exists: ' + incoming.path + '. Choose another name.');
    const current = readConfiguration(existing.content);
    const addition = readConfiguration(incoming.content);
    let source = existing.content;
    for (const [key, value] of Object.entries(addition)) {
      if (key === 'hooks' || key === 'mcpServers') {
        if (current[key] !== undefined && !objectValue(current[key]))
          throw new Error(key + ' must be an object before adding a template.');
        for (const [child, definition] of Object.entries(value as ConfigObject)) {
          const previous = (current[key] as ConfigObject | undefined)?.[child];
          if (key === 'hooks' && previous !== undefined && !Array.isArray(previous))
            throw new Error('Hook event ' + child + ' must be an array.');
          if (key === 'mcpServers' && previous !== undefined)
            throw new Error('MCP server ' + child + ' already exists. Choose another name.');
          source = patchConfiguration(
            source,
            [key, child],
            key === 'hooks' && Array.isArray(previous)
              ? [...previous, ...(definition as unknown[])]
              : definition,
          );
        }
      } else if (current[key] === undefined) source = patchConfiguration(source, [key], value);
      else if (JSON.stringify(current[key]) !== JSON.stringify(value))
        throw new Error(
          'Setting ' + key + ' already exists. Edit it directly to preserve your value.',
        );
    }
    existing.content = source;
  }
  return { files: next, entrypoint: pkg.entrypoint };
}

/** Inspect configurations in a complete repository, including shared settings files. */
export function inspectHarnessTree(files: HarnessTreeFile[]) {
  const components: HarnessComponent[] = [];
  const issues: NativeIssue[] = [];
  const add = (path: string, message: string, severity: NativeIssue['severity'] = 'error') =>
    issues.push({ path, message, severity });
  for (const file of files) {
    const { path, content } = file;
    const nativeRoot = path.match(/(?:^|\/)\.(claude|gemini|github|agents)\//)?.[1];
    const runtime =
      nativeRoot === 'claude'
        ? 'Claude Code'
        : nativeRoot === 'gemini'
          ? 'Gemini CLI'
          : nativeRoot === 'github'
            ? 'Copilot'
            : nativeRoot === 'agents'
              ? 'Agent Skills'
              : 'Portable MCP';
    const markdownKind = /\/skills\/[^/]+\/SKILL\.md$/i.test(path)
      ? 'skill'
      : /\/agents\/[^/]+\.md$/i.test(path)
        ? 'agent'
        : null;
    if (markdownKind) {
      components.push({
        path,
        kind: markdownKind,
        runtime,
        name: path.split('/').at(markdownKind === 'skill' ? -2 : -1)!,
        detail: 'Native Markdown instructions',
      });
    }
    const isMcp =
      /(?:^|\/)\.mcp\.json$/.test(path) || /(?:^|\/)\.(vscode|github)\/mcp\.json$/.test(path);
    const isSettings =
      /(?:^|\/)\.(claude|gemini|vscode)\/settings(?:\.local)?\.json$/.test(path) ||
      path === '.github/copilot/settings.json';
    const isHook = /(?:^|\/)\.github\/hooks\/[^/]+\.json$/.test(path);
    if (!isMcp && !isSettings && !isHook) continue;
    let config: ConfigObject;
    try {
      config = readConfiguration(content);
    } catch (e) {
      add(path, e instanceof Error ? e.message : 'Invalid configuration JSON.');
      continue;
    }
    const serverKey = /(?:^|\/)\.vscode\/mcp\.json$/.test(path) ? 'servers' : 'mcpServers';
    if (isMcp || serverKey in config) {
      const servers = config[serverKey];
      if (!objectValue(servers))
        add(path, 'Define MCP servers under ' + serverKey + ' as an object.');
      else
        for (const [name, value] of Object.entries(servers)) {
          if (!objectValue(value)) {
            add(path, 'MCP server ' + name + ' must be an object.');
            continue;
          }
          const remote = value.httpUrl ?? value.url;
          components.push({
            path,
            kind: 'mcp',
            name,
            runtime: /(?:^|\/)\.vscode\//.test(path) ? 'Copilot · VS Code' : runtime,
            detail:
              typeof value.command === 'string'
                ? 'Local command: ' + value.command
                : typeof remote === 'string'
                  ? 'Remote: ' + remote
                  : 'Missing transport',
          });
          if (value.command === undefined && remote === undefined)
            add(path, 'MCP server ' + name + ' needs a command or URL.');
          if (
            value.command !== undefined &&
            (typeof value.command !== 'string' || !value.command.trim())
          )
            add(path, 'MCP server ' + name + ' needs a nonempty command.');
          if (value.command !== undefined && remote !== undefined)
            add(path, 'MCP server ' + name + ' cannot use a command and URL together.');
          if (value.httpUrl !== undefined && value.url !== undefined)
            add(path, 'MCP server ' + name + ' must choose HTTP or SSE.');
          if (remote !== undefined) {
            try {
              if (typeof remote !== 'string') throw new Error();
              const url = new URL(remote);
              if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) throw new Error();
            } catch {
              add(path, 'MCP server ' + name + ' has an invalid remote URL.');
            }
          }
          if (
            value.args !== undefined &&
            (!Array.isArray(value.args) || value.args.some((arg) => typeof arg !== 'string'))
          )
            add(path, 'MCP server ' + name + ' args must be strings.');
          for (const key of ['env', 'headers'])
            if (
              value[key] !== undefined &&
              (!objectValue(value[key]) ||
                Object.values(value[key]).some((v) => typeof v !== 'string'))
            )
              add(path, 'MCP server ' + name + ' ' + key + ' values must be strings.');
        }
    }
    if (isHook || 'hooks' in config) {
      if (!objectValue(config.hooks))
        add(path, 'Hooks must be an object keyed by native event name.');
      else {
        const cli =
          path === '.github/copilot/settings.json' ||
          (isHook &&
            ('version' in config ||
              Object.keys(config.hooks).some((event) => /^[a-z]/.test(event))));
        if (cli && isHook && config.version !== 1)
          add(path, 'Copilot CLI/cloud hook files require version 1.');
        for (const [event, groups] of Object.entries(config.hooks)) {
          components.push({
            path,
            kind: 'hook',
            name: event,
            runtime: isHook ? (cli ? 'Copilot CLI / cloud' : 'Copilot · VS Code') : runtime,
            detail: Array.isArray(groups)
              ? groups.length + ' hook groups · native event'
              : 'Invalid hook groups',
          });
          if (!Array.isArray(groups)) {
            add(path, 'Hook event ' + event + ' must contain an array.');
            continue;
          }
          for (const group of groups) {
            if (!objectValue(group)) {
              add(path, 'Hook groups must be objects.');
              continue;
            }
            if (group.matcher !== undefined && typeof group.matcher !== 'string')
              add(path, 'Hook matchers must be strings.');
            const hooks = isHook ? [group] : group.hooks;
            if (!Array.isArray(hooks)) {
              add(path, 'Hook groups need a nested hooks array.');
              continue;
            }
            for (const hook of hooks) {
              if (!objectValue(hook)) {
                add(path, 'Each hook must be an object.');
                continue;
              }
              if (hook.type !== undefined && hook.type !== 'command') {
                add(path, 'This hook type is preserved; validate it in your runtime.', 'warning');
                continue;
              }
              const commands = (
                isHook
                  ? [
                      hook.command,
                      hook.bash,
                      hook.powershell,
                      hook.exec,
                      hook.windows,
                      hook.linux,
                      hook.osx,
                    ]
                  : [hook.command]
              ).filter((command) => command !== undefined);
              if (
                !commands.length ||
                commands.some((command) => typeof command !== 'string' || !command.trim())
              )
                add(path, 'Hook ' + event + ' needs a nonempty native command.');
              const timeout = hook.timeoutSec ?? hook.timeout;
              if (
                timeout !== undefined &&
                (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0)
              )
                add(
                  path,
                  'Hook timeout must be positive (Gemini milliseconds; Claude/Copilot seconds).',
                );
              for (const command of commands)
                if (typeof command === 'string')
                  for (const match of command.matchAll(
                    /(?:^|\s)(\.(?:claude|gemini|github)\/[^\s"']+\.(?:mjs|js|sh|ps1|py))(?=\s|$)/g,
                  )) {
                    const prefix = path.slice(0, path.lastIndexOf('/.') + 1);
                    if (!files.some((f) => f.path === prefix + match[1]))
                      add(path, 'Referenced hook script is missing: ' + match[1], 'warning');
                  }
            }
          }
        }
      }
    }
    if (isSettings)
      components.push({
        path,
        kind: 'settings',
        name: 'Runtime settings',
        runtime: /(?:^|\/)\.vscode\//.test(path) ? 'Copilot · VS Code' : runtime,
        detail:
          Object.keys(config)
            .filter((key) => !['hooks', 'mcpServers'].includes(key))
            .join(', ') || 'Shared native configuration',
      });
  }
  return { components, issues };
}
