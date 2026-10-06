import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { retireLegacyProjects } from './retire-legacy.js';
import type { DB } from './client.js';

it('moves real native files and team access into Harness drafts while archiving fixture history', async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
    await db.exec(
      await readFile(new URL('./migrations/004-harness-repositories.sql', import.meta.url), 'utf8'),
    );
    const owner = '11111111-1111-4111-8111-111111111111',
      member = '22222222-2222-4222-8222-222222222222',
      project = '33333333-3333-4333-8333-333333333333',
      fixture = '44444444-4444-4444-8444-444444444444';
    await db.query(
      'INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4),($5,$6,$7,$8)',
      [
        owner,
        'Owner',
        'owner@example.com',
        'unused',
        member,
        'Viewer',
        'viewer@example.com',
        'unused',
      ],
    );
    for (const [id, name] of [
      [project, 'Real toolkit'],
      [fixture, 'Custom Monaco 1790894442876'],
    ])
      await db.query(
        "INSERT INTO projects(id,owner_id,name,slug,description,visibility) VALUES($1,$2,$3,$4,$5,'team')",
        [id, owner, name, 'toolkit-' + id, 'Native user configurations.'],
      );
    const files = [
      {
        path: '.claude/skills/review/SKILL.md',
        content: '# Original source\nKeep this text exactly.',
      },
    ];
    await db.query("INSERT INTO assets(id,project_id,type,content) VALUES($1,$2,'skill',$3)", [
      '55555555-5555-4555-8555-555555555555',
      project,
      JSON.stringify({ nativePackage: { files } }),
    ]);
    await db.query('INSERT INTO project_members(project_id,user_id) VALUES($1,$2)', [
      project,
      member,
    ]);
    await retireLegacyProjects({
      query: async (sql: string, params: unknown[] = []) => {
        const result = await db.query(sql, params);
        return { rows: result.rows, rowCount: result.affectedRows };
      },
    } as unknown as DB);
    await db.exec(
      await readFile(new URL('./migrations/006-harness-only.sql', import.meta.url), 'utf8'),
    );
    expect(
      (await db.query('SELECT draft_files FROM harnesses WHERE id=$1', [project])).rows[0],
    ).toEqual({ draft_files: files });
    expect(
      (
        await db.query('SELECT role FROM harness_members WHERE harness_id=$1 AND user_id=$2', [
          project,
          member,
        ])
      ).rows[0],
    ).toEqual({ role: 'viewer' });
    expect((await db.query('SELECT id FROM harnesses WHERE id=$1', [fixture])).rows).toEqual([]);
    expect(
      (await db.query('SELECT id FROM legacy_archive.projects WHERE id=$1', [fixture])).rows,
    ).toHaveLength(1);
    expect((await db.query('SELECT id FROM harness_releases')).rows).toHaveLength(0);
  } finally {
    await db.close();
  }
});
