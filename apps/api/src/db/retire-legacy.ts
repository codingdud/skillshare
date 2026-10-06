import { harnessFilesSchema } from '@skillshare/contracts';
import type { DB } from './client.js';

/** Preserve real native repositories before taking the old storage out of the active schema. */
export async function retireLegacyProjects(db: DB) {
  const projects = await db.query(
    'SELECT p.*,u.email FROM projects p JOIN users u ON u.id=p.owner_id ORDER BY p.created_at,p.id',
  );
  for (const project of projects.rows) {
    const fixture =
      /^(Native browser test|Module UI|Browser Toolkit|Workflow UI|Legacy workflow|Unified files|Custom Monaco) \d{13}$/.test(
        project.name,
      );
    if (fixture || project.email === 'catalog@example.invalid') continue;
    const assets = await db.query(
      'SELECT content FROM assets WHERE project_id=$1 ORDER BY updated_at,id',
      [project.id],
    );
    const files = new Map<string, { path: string; content: string }>();
    let conflict = false;
    for (const asset of assets.rows) {
      const native = asset.content?.nativePackage?.files;
      if (!Array.isArray(native)) continue;
      for (const file of native) {
        const previous = files.get(String(file.path).toLowerCase());
        if (previous && previous.content !== file.content) conflict = true;
        else files.set(String(file.path).toLowerCase(), { path: file.path, content: file.content });
      }
    }
    const parsed = harnessFilesSchema.safeParse([...files.values()]);
    if (conflict || !parsed.success) {
      // Source snapshots remain complete in legacy_archive; never choose one conflicting file.
      console.log('Retained conflicting native project in archive:', project.id);
      continue;
    }
    await db.query(
      'INSERT INTO harnesses(id,owner_id,name,slug,description,visibility,draft_files,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING',
      [
        project.id,
        project.owner_id,
        project.name,
        project.slug,
        project.description,
        project.visibility,
        JSON.stringify(parsed.data),
        project.created_at,
      ],
    );
    await db.query(
      "INSERT INTO harness_members(harness_id,user_id,role) SELECT $1,user_id,'viewer' FROM project_members WHERE project_id=$1 AND EXISTS(SELECT 1 FROM harnesses WHERE id=$1) ON CONFLICT DO NOTHING",
      [project.id],
    );
  }
}
