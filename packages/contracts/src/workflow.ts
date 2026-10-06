import { z } from 'zod';
import { exportPlanSchema } from './export-plan.js';
import { harnessId, type HarnessId } from './harnesses.js';
import { readConfiguration } from './native-config.js';
import type { Content, AssetType } from './index.js';
import type { NativePackage } from './native.js';
const key = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/)
  .max(50);
export const workflowRoles = ['skill', 'agent', 'mcp', 'settings', 'hook'] as const;
export const workflowComponentSchema = z.strictObject({
  id: key,
  role: z.enum(workflowRoles),
  releaseId: z.uuid(),
});
export const workflowStepSchema = z.strictObject({
  id: key,
  name: z.string().min(2).max(120),
  componentId: key,
  inputFrom: z.array(z.string().max(50)).max(20),
  output: z.string().max(500),
  approval: z.boolean(),
  failure: z.enum(['pause', 'stop', 'retry']),
  retries: z.number().int().min(0).max(5),
  timeoutSeconds: z.number().int().min(1).max(3600),
});
export const workflowDefinitionSchema = z.strictObject({
  schemaVersion: z.literal(2),
  target: z.strictObject({
    harness: exportPlanSchema.shape.target,
    sessionTarget: z.enum(['local', 'copilot']).optional(),
    runtimeRange: z.string().max(100).optional(),
  }),
  components: z.array(workflowComponentSchema).max(50),
  stages: z.array(workflowStepSchema).max(30),
  resolutions: exportPlanSchema.shape.resolutions,
});
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowComponent = z.infer<typeof workflowComponentSchema>;
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export function createWorkflow(harness: HarnessId = 'claude-code'): WorkflowDefinition {
  return {
    schemaVersion: 2,
    target: {
      harness,
      ...(harness === 'copilot-vscode' ? { sessionTarget: 'local' as const } : {}),
    },
    components: [],
    stages: [],
    resolutions: [],
  };
}
export function workflowIssues(w: WorkflowDefinition): string[] {
  const issues: string[] = [],
    ids = new Set<string>(),
    releases = new Set<string>();
  if (!w.components.length) issues.push('Add at least one workflow component.');
  if (w.target.harness === 'copilot-vscode' && w.target.sessionTarget !== 'local')
    issues.push('The supported VS Code workflow profile targets Local sessions.');
  if (w.target.harness !== 'copilot-vscode' && w.target.sessionTarget)
    issues.push('Session target is only supported for the VS Code profile.');
  for (const c of w.components) {
    if (ids.has(c.id)) issues.push('Component IDs must be unique.');
    if (releases.has(c.releaseId))
      issues.push('Pin each release once; reuse its component in stages.');
    ids.add(c.id);
    releases.add(c.releaseId);
  }
  const seen = new Set<string>();
  for (const s of w.stages) {
    if (seen.has(s.id)) issues.push('Stage IDs must be unique.');
    const c = w.components.find((c) => c.id === s.componentId);
    if (!c || !['skill', 'agent'].includes(c.role))
      issues.push('Stage ' + s.name + ' must select a skill or agent component.');
    if (!s.output.trim()) issues.push('Describe the output for stage ' + s.name + '.');
    for (const input of s.inputFrom)
      if (input !== 'input' && !seen.has(input))
        issues.push('Stage ' + s.name + ' refers to a missing or later stage: ' + input + '.');
    seen.add(s.id);
  }
  return issues;
}
export function releaseReferences(
  c: Content,
  type?: AssetType,
): { releaseId: string; role: AssetType | 'stage' }[] {
  if (type === 'workflow' && c.workflow)
    return c.workflow.components.map((x) => ({ releaseId: x.releaseId, role: x.role }));
  return [
    ...c.dependencies.map((releaseId) => ({ releaseId, role: 'skill' as const })),
    ...(c.subagents ?? []).map((releaseId) => ({ releaseId, role: 'agent' as const })),
    ...(c.modules ?? []).map((x) => ({ releaseId: x.releaseId, role: x.role })),
    ...c.stages.map((x) => ({ releaseId: x.releaseId, role: 'stage' as const })),
  ];
}
export function pinnedReleaseIds(c: Content, type?: AssetType) {
  return [...new Set(releaseReferences(c, type).map((r) => r.releaseId))];
}
export function convertLegacyWorkflow(
  c: Content,
  harness: HarnessId,
  roles: Map<string, AssetType>,
): WorkflowDefinition {
  const w = createWorkflow(harness);
  for (const [i, id] of pinnedReleaseIds(c).entries()) {
    const role = roles.get(id);
    if (!role || !workflowRoles.includes(role as (typeof workflowRoles)[number]))
      throw new Error('A legacy release is unavailable or has an unsupported type.');
    w.components.push({
      id: 'component_' + i,
      releaseId: id,
      role: role as WorkflowComponent['role'],
    });
  }
  w.stages = c.stages.map((s) => ({
    id: s.id,
    name: s.name,
    componentId: w.components.find((x) => x.releaseId === s.releaseId)!.id,
    inputFrom: s.inputFrom,
    output: s.output,
    approval: s.approval,
    failure: s.failure,
    retries: s.retries,
    timeoutSeconds: s.timeoutSeconds,
  }));
  return w;
}
export type HookEventSummary = {
  event: string;
  phase: 'pre' | 'post' | 'other';
  boundary: string;
  path: string;
  scope: string;
  source: string;
};
export function inspectHookEvents(pkg: NativePackage): HookEventSummary[] {
  const result: HookEventSummary[] = [];
  for (const file of pkg.files) {
    if (!/\.jsonc?$/.test(file.path)) continue;
    try {
      const cfg = readConfiguration(file.content),
        hooks = cfg.hooks;
      if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) continue;
      for (const [event, handlers] of Object.entries(hooks)) {
        const phase = /^(Pre|Before|pre|before)/.test(event)
          ? 'pre'
          : /^(Post|After|post|after)/.test(event) || /^(Stop|SubagentStop)$/.test(event)
            ? 'post'
            : 'other';
        const boundary = /Tool|tool/.test(event)
          ? 'Tool call'
          : /Agent|agent|^Stop$/.test(event)
            ? 'Agent turn / completion'
            : /Session|session/.test(event)
              ? 'Session'
              : 'Native lifecycle';
        result.push({
          event,
          phase,
          boundary,
          path: file.path,
          scope: 'Workspace',
          source: JSON.stringify(handlers, null, 2),
        });
      }
    } catch {
      /* invalid source remains editable */
    }
  }
  return result;
}
export function workflowTarget(c: Content) {
  return (
    c.workflow?.target.harness ??
    (c.nativePackage ? harnessId(c.nativePackage.platform) : undefined)
  );
}
