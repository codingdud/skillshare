import { describe, expect, it } from 'vitest';
import {
  addHarnessTemplate,
  inspectHarnessTree,
  readConfiguration,
  type HarnessId,
} from '@skillshare/contracts';

describe('native Harness configurations', () => {
  it('merges Gemini MCP and pre/post hooks without replacing unrelated settings or comments', () => {
    const original = [
      {
        path: '.gemini/settings.json',
        content: '{\n// Keep my settings\n"general": {"vimMode": true},\n"futureField": 42,\n}\n',
      },
    ];
    const mcp = addHarnessTemplate(original, 'gemini-cli', 'mcp', 'delivery-tools').files;
    const pre = addHarnessTemplate(mcp, 'gemini-cli', 'hook', 'review', 'pre').files;
    const all = addHarnessTemplate(pre, 'gemini-cli', 'hook', 'review', 'post').files;
    const source = all.find((file) => file.path === '.gemini/settings.json')!.content;
    const config = readConfiguration(source);
    expect(source).toContain('// Keep my settings');
    expect(config.general).toEqual({ vimMode: true });
    expect(config.futureField).toBe(42);
    expect(config.mcpServers).toHaveProperty('delivery-tools');
    expect(config.hooks).toHaveProperty('BeforeTool');
    expect(config.hooks).toHaveProperty('AfterTool');
    expect(all.filter((file) => file.path.endsWith('check.mjs'))).toHaveLength(1);
    expect(inspectHarnessTree(all).issues).toEqual([]);
    expect(original[0]!.content).not.toContain('hooks');
  });

  it('preserves existing Claude hook groups when adding another command', () => {
    const first = addHarnessTemplate([], 'claude-code', 'hook', 'first').files;
    const both = addHarnessTemplate(first, 'claude-code', 'hook', 'second').files;
    const config = readConfiguration(
      both.find((file) => file.path === '.claude/settings.json')!.content,
    );
    expect((config.hooks as Record<string, unknown>).PreToolUse).toHaveLength(2);
    expect(inspectHarnessTree(both).issues).toEqual([]);
  });

  for (const runtime of [
    'claude-code',
    'gemini-cli',
    'copilot-vscode',
    'copilot-cli',
    'copilot-cloud',
  ] as HarnessId[]) {
    it('retains native post-tool events for ' + runtime, () => {
      const result = addHarnessTemplate([], runtime, 'hook', 'audit', 'post');
      const inspection = inspectHarnessTree(result.files);
      expect(inspection.issues).toEqual([]);
      const expected =
        runtime === 'gemini-cli'
          ? 'AfterTool'
          : ['copilot-cli', 'copilot-cloud'].includes(runtime)
            ? 'postToolUse'
            : 'PostToolUse';
      expect(inspection.components.find((component) => component.kind === 'hook')?.name).toBe(
        expected,
      );
    });
  }

  it('rejects duplicate servers and preserves malformed config instead of overwriting it', () => {
    const files = addHarnessTemplate([], 'claude-code', 'mcp', 'tools').files;
    expect(() => addHarnessTemplate(files, 'claude-code', 'mcp', 'tools')).toThrow(
      'already exists',
    );
    const invalid = [{ path: '.gemini/settings.json', content: '{"general":' }];
    expect(() => addHarnessTemplate(invalid, 'gemini-cli', 'mcp', 'tools')).toThrow();
    expect(invalid[0]!.content).toBe('{"general":');
    expect(inspectHarnessTree(invalid).issues[0]?.severity).toBe('error');
  });

  it('inspects shared settings, VS Code MCP, and hook scripts without requiring separate assets', () => {
    const files = [
      {
        path: '.gemini/settings.json',
        content:
          '{"mcpServers":{"local":{"command":"node","args":["server.mjs"]}},"hooks":{"BeforeTool":[{"matcher":"*","hooks":[{"type":"command","command":"node .gemini/hooks/check.mjs"}]}]},"general":{"vimMode":true}}',
      },
      { path: '.gemini/hooks/check.mjs', content: 'process.stdin.resume();' },
      {
        path: '.vscode/mcp.json',
        content:
          '{"inputs":[],"servers":{"remote":{"type":"http","url":"https://example.com/mcp"}}}',
      },
      { path: 'README.md', content: 'Any native repository documentation' },
    ];
    const result = inspectHarnessTree(files);
    expect(result.issues).toEqual([]);
    expect(result.components.filter((component) => component.kind === 'mcp')).toHaveLength(2);
    expect(result.components.some((component) => component.kind === 'hook')).toBe(true);
  });

  it('reports malformed transports and missing bundled hook scripts', () => {
    const result = inspectHarnessTree([
      {
        path: '.mcp.json',
        content: '{"mcpServers":{"bad":{"url":"file:///etc/passwd","args":[1]}}}',
      },
      {
        path: '.github/hooks/audit.json',
        content:
          '{"version":1,"hooks":{"preToolUse":[{"type":"command","bash":"node .github/hooks/missing.mjs","timeoutSec":0}]}}',
      },
    ]);
    expect(result.issues.some((issue) => issue.message.includes('invalid remote URL'))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('args must be strings'))).toBe(
      true,
    );
    expect(result.issues.some((issue) => issue.message.includes('timeout must be positive'))).toBe(
      true,
    );
    expect(
      result.issues.some(
        (issue) => issue.message.includes('missing') && issue.severity === 'warning',
      ),
    ).toBe(true);
  });
});
