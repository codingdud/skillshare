import { z } from 'zod';

export const harnessFileSchema = z.strictObject({
  path: z
    .string()
    .min(1)
    .max(500)
    .refine(
      (path) => new TextDecoder().decode(new TextEncoder().encode(path)) === path,
      'File paths must contain valid Unicode.',
    )
    .refine(
      (path) =>
        path
          .split('/')
          .every(
            (part) =>
              part &&
              new TextEncoder().encode(part).length <= 255 &&
              part !== '.' &&
              part !== '..' &&
              !/[\\:\0<>"|?*\x01-\x1f]/.test(part) &&
              !/[. ]$/.test(part) &&
              !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part) &&
              !/^\.git$/i.test(part),
          ),
      'Use a portable relative file path.',
    ),
  content: z
    .string()
    .max(250_000)
    .refine(
      (value) => new TextEncoder().encode(value).length <= 250_000,
      'File exceeds 250 KB of UTF-8 text.',
    ),
  executable: z.boolean().optional(),
});
export const harnessFilesSchema = z
  .array(harnessFileSchema)
  .max(1000)
  .superRefine((files, ctx) => {
    const paths = files.map((f) => f.path.normalize('NFC').toLowerCase());
    const names = new Set(paths);
    if (names.size !== paths.length)
      ctx.addIssue({ code: 'custom', message: 'File paths must be unique.', path: [] });
    if (
      paths.some((path) =>
        path
          .split('/')
          .slice(0, -1)
          .some((_, i, parts) => names.has(parts.slice(0, i + 1).join('/'))),
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'A file cannot also be an ancestor folder of another file.',
        path: [],
      });
    if (files.reduce((size, f) => size + new TextEncoder().encode(f.content).length, 0) > 5_000_000)
      ctx.addIssue({
        code: 'custom',
        message: 'Keep a Harness text snapshot below 5 MB.',
        path: [],
      });
  });
// JSON escaping can expand valid text sixfold; include paths and envelope overhead.
export const harnessJSONLimit = 36_000_000;
