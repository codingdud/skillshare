import { z } from 'zod';
import { filePathSchema } from './native.js';
export const exportPlanSchema = z.strictObject({
  adapterVersion: z.literal(1).default(1),
  target: z.enum(['claude-code', 'gemini-cli', 'copilot-vscode', 'copilot-cli', 'copilot-cloud']),
  selectedReleaseIds: z
    .array(z.uuid())
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'Select each release once.'),
  resolutions: z
    .array(
      z.strictObject({ file: filePathSchema, pointer: z.string().max(500), releaseId: z.uuid() }),
    )
    .max(100)
    .refine(
      (choices) =>
        new Set(choices.map((c) => c.file.toLowerCase() + '#' + c.pointer)).size === choices.length,
      'Resolve each conflict once.',
    )
    .default([]),
});
export type ExportPlan = z.infer<typeof exportPlanSchema>;
