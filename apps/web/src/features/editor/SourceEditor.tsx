import { useEffect, useRef } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/editor/contrib/find/browser/findController';
import 'monaco-editor/editor/contrib/folding/browser/folding';
import 'monaco-editor/editor/contrib/suggest/browser/suggestController';
import 'monaco-editor/languages/definitions/markdown/register';
import 'monaco-editor/languages/definitions/yaml/register';
import 'monaco-editor/languages/definitions/python/register';
import 'monaco-editor/languages/definitions/shell/register';
import 'monaco-editor/languages/definitions/javascript/register';
import 'monaco-editor/languages/definitions/typescript/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import type { NativeIssue } from '@skillshare/contracts';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
monaco.languages.register({ id: 'skillshare-markdown' });
monaco.languages.setMonarchTokensProvider('skillshare-markdown', {
  tokenizer: {
    root: [
      [/^---\s*$/, { token: 'delimiter', next: '@frontmatter', nextEmbedded: 'yaml' }],
      [/./, { token: '', next: '@markdown', nextEmbedded: 'markdown' }],
    ],
    frontmatter: [[/^---\s*$/, { token: 'delimiter', next: '@body', nextEmbedded: '@pop' }]],
    body: [[/./, { token: '', next: '@markdown', nextEmbedded: 'markdown' }]],
    // Markdown continues to EOF. Monarch requires an exit rule for every embedded
    // language, even when the exit is intentionally unreachable.
    markdown: [[/\b\B/, { token: '', next: '@pop', nextEmbedded: '@pop' }]],
  },
});
monaco.languages.register({ id: 'skillshare-json' });
monaco.languages.setMonarchTokensProvider('skillshare-json', {
  tokenizer: {
    root: [
      [/\/\/.*$/, 'comment'],
      [/\/\*/, 'comment', '@comment'],
      [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'key'],
      [/"(?:[^"\\]|\\.)*"/, 'string'],
      [/\b(?:true|false|null)\b/, 'keyword'],
      [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
      [/[{}\[\],:]/, 'delimiter'],
    ],
    comment: [
      [/\*\//, 'comment', '@pop'],
      [/./, 'comment'],
    ],
  },
});
monaco.languages.registerCompletionItemProvider('skillshare-json', {
  triggerCharacters: ['"'],
  provideCompletionItems(model, position) {
    const line = model.getLineContent(position.lineNumber);
    const before = line.slice(0, position.column - 1);
    const match = before.match(/(?:^|[,{])\s*("?[\w-]*)$/);
    if (!match) return { suggestions: [] };
    const token = match[1] ?? '';
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: position.column - token.length,
      endColumn: position.column + (line[position.column - 1] === '"' ? 1 : 0),
    };
    const path = model.uri.toString();
    const gemini = path.includes('.gemini/');
    const properties = [
      'mcpServers',
      ...(path.includes('.vscode/') ? ['servers', 'inputs'] : []),
      'command',
      'args',
      'env',
      'headers',
      ...(gemini ? ['httpUrl', 'url'] : ['type', 'url']),
      'hooks',
      'matcher',
      'timeout',
      'model',
      'permissions',
      ...(path.includes('.github/') ? ['version', 'bash', 'powershell', 'timeoutSec', 'cwd'] : []),
    ];
    return {
      suggestions: properties.map((label) => ({
        label,
        kind: monaco.languages.CompletionItemKind.Property,
        insertText: JSON.stringify(label) + ': ',
        range,
        detail: 'Native configuration property; check the selected runtime documentation.',
      })),
    };
  },
});
const fields = [
  'name',
  'description',
  'tools',
  'allowed-tools',
  'disallowedTools',
  'model',
  'permissionMode',
  'skills',
  'agents',
  'handoffs',
  'mcpServers',
  'hooks',
  'maxTurns',
  'max_turns',
  'timeout_mins',
  'temperature',
  'kind',
  'memory',
  'isolation',
  'user-invocable',
  'disable-model-invocation',
];
monaco.languages.registerCompletionItemProvider('skillshare-markdown', {
  provideCompletionItems(model, position) {
    const word = model.getWordUntilPosition(position);
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };
    const before = model.getValueInRange({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    });
    if (!before.startsWith('---') || before.split(/^---\s*$/m).length > 2)
      return { suggestions: [] };
    return {
      suggestions: fields.map((label) => ({
        label,
        kind: monaco.languages.CompletionItemKind.Property,
        insertText: `${label}: `,
        range,
        detail: 'Check the target platform reference for supported fields.',
      })),
    };
  },
});
export function SourceDiffEditor({
  before,
  after,
  filePath = 'source.md',
}: {
  before: string;
  after: string;
  filePath?: string;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const models = useRef<monaco.editor.IDiffEditorModel | null>(null);
  const language = /\.jsonc?$/.test(filePath)
    ? 'skillshare-json'
    : /\.(mjs|cjs|js)$/.test(filePath)
      ? 'javascript'
      : 'skillshare-markdown';
  useEffect(() => {
    if (!container.current) return;
    const editor = monaco.editor.createDiffEditor(container.current, {
      theme: 'vs-dark',
      readOnly: true,
      originalEditable: false,
      renderSideBySide: false,
      minimap: { enabled: false },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      hideUnchangedRegions: { enabled: true },
    });
    const original = monaco.editor.createModel(before, language);
    const modified = monaco.editor.createModel(after, language);
    const pair = { original, modified };
    const viewModel = editor.createViewModel(pair);
    models.current = pair;
    editor.setModel(viewModel);
    return () => {
      // Own and cancel the view model before disposing its text resources.
      editor.setModel(null);
      viewModel.dispose();
      editor.dispose();
      original.dispose();
      modified.dispose();
      models.current = null;
    };
  }, []);
  useEffect(() => {
    const pair = models.current;
    if (!pair) return;
    if (pair.original.getValue() !== before) pair.original.setValue(before);
    if (pair.modified.getValue() !== after) pair.modified.setValue(after);
    monaco.editor.setModelLanguage(pair.original, language);
    monaco.editor.setModelLanguage(pair.modified, language);
  }, [before, after, language]);
  return (
    <div
      ref={container}
      aria-label={'Compare ' + filePath}
      style={{ width: '100%', height: 'var(--native-editor-height, clamp(480px, 68vh, 980px))' }}
    />
  );
}
export default function SourceEditor({
  modelPath,
  filePath,
  value,
  readOnly,
  onChange,
  issues,
  onSave,
}: {
  modelPath: string;
  filePath: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  issues: NativeIssue[];
  onSave?: () => void;
}) {
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const saveCallback = useRef(onSave);
  saveCallback.current = onSave;
  const ext = filePath.split('.').at(-1);
  const language =
    ext === 'md'
      ? 'skillshare-markdown'
      : ext === 'yml' || ext === 'yaml'
        ? 'yaml'
        : ext === 'py'
          ? 'python'
          : ext === 'sh'
            ? 'shell'
            : ext === 'js' || ext === 'mjs' || ext === 'cjs'
              ? 'javascript'
              : ext === 'ts'
                ? 'typescript'
                : ext === 'json' || ext === 'jsonc'
                  ? 'skillshare-json'
                  : 'plaintext';
  function mark() {
    const model = editor.current?.getModel();
    if (model)
      monaco.editor.setModelMarkers(
        model,
        'skillshare',
        issues.map((i) => ({
          severity:
            i.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: i.message,
          startLineNumber: i.line ?? 1,
          endLineNumber: i.line ?? 1,
          startColumn: 1,
          endColumn: 4,
        })),
      );
  }
  useEffect(mark, [issues, modelPath]);
  return (
    <Editor
      height="var(--native-editor-height, clamp(480px, 68vh, 980px))"
      path={modelPath}
      language={language}
      value={value}
      theme="vs-dark"
      onMount={(instance) => {
        editor.current = instance;
        instance.addAction({
          id: 'skillshare.save-file',
          label: 'Save file',
          keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
          run: () => {
            saveCallback.current?.();
          },
        });
        mark();
      }}
      onChange={(next) => onChange(next ?? '')}
      options={{
        readOnly,
        domReadOnly: readOnly,
        ariaLabel: filePath,
        minimap: { enabled: false },
        fontSize: 13,
        lineHeight: 20,
        lineNumbersMinChars: 3,
        lineDecorationsWidth: 10,
        fontFamily: 'Consolas, "Cascadia Code", monospace',
        wordWrap: 'on',
        automaticLayout: true,
        scrollBeyondLastLine: false,
        scrollbar: {
          vertical: 'visible',
          horizontal: 'auto',
          verticalScrollbarSize: 12,
          horizontalScrollbarSize: 12,
          handleMouseWheel: true,
          alwaysConsumeMouseWheel: true,
        },
        tabSize: 2,
        padding: { top: 8, bottom: 8 },
        renderWhitespace: 'selection',
        accessibilitySupport: 'on',
      }}
    />
  );
}
