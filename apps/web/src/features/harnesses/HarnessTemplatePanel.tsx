import { lazy, Suspense, useId, useMemo, useState } from 'react';
import {
  addHarnessTemplate,
  configurationPath,
  nativeSlug,
  harnessFilesSchema,
  inspectHarnessTree,
  harnessReferences,
  selectableHarnesses,
  type HarnessId,
  type HarnessTemplateKind,
  type HarnessTreeFile,
} from '@skillshare/contracts';
import { ErrorBox, Field, Loading } from '../../components/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { selectClass } from './harness-ui';

const SourceDiff = lazy(() =>
  import('../editor/SourceEditor').then((module) => ({ default: module.SourceDiffEditor })),
);
const SourceEditor = lazy(() => import('../editor/SourceEditor'));

export function HarnessTemplatePanel({
  files,
  onApply,
  onClose,
  initialKind = 'mcp',
  initialRuntime = 'claude-code',
  onOpenExisting,
}: {
  files: HarnessTreeFile[];
  onApply: (files: HarnessTreeFile[], path: string) => void;
  onClose: () => void;
  initialKind?: HarnessTemplateKind;
  initialRuntime?: HarnessId;
  onOpenExisting?: (path: string) => void;
}) {
  const id = useId();
  const [runtime, setRuntime] = useState<HarnessId>(initialRuntime);
  const [kind, setKind] = useState<HarnessTemplateKind>(initialKind);
  const [name, setName] = useState(
    initialKind === 'skill' ? 'new-skill' : initialKind === 'agent' ? 'new-agent' : 'project-tools',
  );
  const [phase, setPhase] = useState<'pre' | 'post'>('pre');
  const [previewPath, setPreviewPath] = useState('');
  const [mode, setMode] = useState<'edit' | 'changes'>('edit');
  const [edited, setEdited] = useState<{ identity: string; values: Record<string, string> }>({
    identity: '',
    values: {},
  });
  const identity = JSON.stringify([runtime, kind, name, phase, files]);
  const profile = selectableHarnesses.find((item) => item.id === runtime)!;
  const supported =
    ['agent', 'skill'].includes(kind) || (profile.configKinds as readonly string[]).includes(kind);
  const preview = useMemo(() => {
    if (!supported || !name.trim())
      return { error: 'Choose a supported template and give it a name.' };
    try {
      const result = addHarnessTemplate(files, runtime, kind, name, phase);
      harnessFilesSchema.parse(result.files);
      const changed = result.files.filter(
        (file) => files.find((old) => old.path === file.path)?.content !== file.content,
      );
      if (!changed.length)
        return { error: 'This configuration is already present. Open its file to edit it.' };
      return { result, changed };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unable to create this template.' };
    }
  }, [files, runtime, kind, name, phase, supported]);
  const overrides = edited.identity === identity ? edited.values : {};
  const proposed = preview.result?.files.map((file) => ({
    ...file,
    content: overrides[file.path] ?? file.content,
  }));
  const changed = proposed?.filter(
    (file) => files.find((old) => old.path === file.path)?.content !== file.content,
  );
  const active = changed?.find((file) => file.path === previewPath) ?? changed?.[0];
  const issues = proposed ? inspectHarnessTree(proposed).issues : [];
  const existingPath = ['mcp', 'hook', 'settings'].includes(kind)
    ? configurationPath(runtime, kind as 'mcp' | 'hook' | 'settings', nativeSlug(name))
    : '';
  const existing = files.find((file) => file.path === existingPath);
  const previewHeight = '320px';
  return (
    <section
      aria-label="Add native files"
      className="grid max-h-[65vh] shrink-0 gap-6 overflow-auto rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 lg:grid-cols-[280px_minmax(0,1fr)]"
    >
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-foreground">Add native files</h2>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          Create native files, edit their content, then add them to your workspace.
        </p>
        <Field label="Runtime profile">
          <select
            className={selectClass}
            value={runtime}
            onChange={(event) => setRuntime(event.target.value as HarnessId)}
          >
            {selectableHarnesses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="File template">
          <select
            className={selectClass}
            value={kind}
            onChange={(event) => setKind(event.target.value as HarnessTemplateKind)}
          >
            <option value="agent">Agent</option>
            <option value="skill">Skill</option>
            <option
              value="mcp"
              disabled={!(profile.configKinds as readonly string[]).includes('mcp')}
            >
              MCP server
            </option>
            <option value="hook">Hook</option>
            <option
              value="settings"
              disabled={!(profile.configKinds as readonly string[]).includes('settings')}
            >
              Settings
            </option>
          </select>
        </Field>
        <Field label={kind === 'mcp' ? 'Server name' : 'Template name'}>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        {kind === 'hook' && (
          <Field label="When to run">
            <select
              className={selectClass}
              value={phase}
              onChange={(event) => setPhase(event.target.value as 'pre' | 'post')}
            >
              <option value="pre">Before a tool runs</option>
              <option value="post">After a tool runs</option>
            </select>
          </Field>
        )}
        <a
          className="text-sm font-medium text-brand underline-offset-4 hover:underline"
          href={harnessReferences[runtime][kind]}
          target="_blank"
          rel="noreferrer"
        >
          Native format documentation ↗
        </a>
        {kind === 'mcp' && (
          <p className="mt-3 text-xs text-muted-foreground">
            The example points to localhost:3001. Configure your server and credentials in your
            runtime.
          </p>
        )}
        {kind === 'hook' && (
          <p className="mt-3 text-xs text-muted-foreground">
            The included Node.js script is a pass-through example. Edit the matcher and command for
            your task.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            disabled={!preview.result}
            onClick={() => {
              if (preview.result && proposed) onApply(proposed, preview.result.entrypoint);
            }}
          >
            Apply reviewed files
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
      <div className="grid min-w-0 content-start gap-3" data-testid="harness-template-preview">
        {preview.error && <ErrorBox message={preview.error} />}
        {preview.error && existing && onOpenExisting && (
          <Button variant="outline" className="w-fit" onClick={() => onOpenExisting(existing.path)}>
            Open existing file
          </Button>
        )}
        <Tabs value={mode} onValueChange={(value) => setMode(value as 'edit' | 'changes')}>
          <TabsList aria-label="Template view">
            <TabsTrigger value="edit" className="px-3">
              Edit files
            </TabsTrigger>
            <TabsTrigger value="changes" className="px-3">
              Review changes
            </TabsTrigger>
          </TabsList>
          {changed && (
            <Field label="Review changed files">
              <select
                className={selectClass}
                value={active?.path ?? ''}
                onChange={(event) => setPreviewPath(event.target.value)}
              >
                {changed.map((file) => (
                  <option key={file.path} value={file.path}>
                    {files.some((old) => old.path === file.path) ? 'Modified: ' : 'Added: '}
                    {file.path}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {active && (
            <Suspense fallback={<Loading />}>
              <TabsContent value="changes" className="overflow-hidden rounded-lg">
                <SourceDiff
                  height={previewHeight}
                  filePath={active.path}
                  before={files.find((file) => file.path === active.path)?.content ?? ''}
                  after={active.content}
                />
              </TabsContent>
              <TabsContent value="edit" className="overflow-hidden rounded-lg">
                <SourceEditor
                  height={previewHeight}
                  modelPath={'template:' + id + ':' + active.path}
                  filePath={active.path}
                  value={active.content}
                  readOnly={false}
                  issues={issues.filter((issue) => issue.path === active.path)}
                  onChange={(value) =>
                    setEdited((previous) => ({
                      identity,
                      values: {
                        ...(previous.identity === identity ? previous.values : {}),
                        [active.path]: value,
                      },
                    }))
                  }
                />
              </TabsContent>
            </Suspense>
          )}
        </Tabs>
      </div>
    </section>
  );
}
