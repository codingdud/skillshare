import { randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { addHarnessTemplate, createNativePackage } from '@skillshare/contracts';
import { pool } from './client.js';
import { config } from '../config.js';
import { harnessService } from '../modules/harnesses/harness.service.js';

if (config.NODE_ENV === 'production')
  throw new Error('The development seed cannot run in production.');
try {
  await pool.query(
    'INSERT INTO users(id,name,email,password_hash,email_verified_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(email) DO NOTHING',
    [
      randomUUID(),
      'SkillShare Demo',
      'demo@skillshare.test',
      await argon2.hash('SkillShare-Demo-2026!', { type: argon2.argon2id }),
    ],
  );
  await pool.query(
    'INSERT INTO users(id,name,email,password_hash,email_verified_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(email) DO NOTHING',
    [
      randomUUID(),
      'SkillShare Examples',
      'catalog@example.invalid',
      await argon2.hash(randomBytes(48).toString('hex')),
    ],
  );
  const owner = (
    await pool.query('SELECT id FROM users WHERE email=$1', ['catalog@example.invalid'])
  ).rows[0];
  const exists = await pool.query('SELECT id FROM harnesses WHERE owner_id=$1 AND slug=$2', [
    owner.id,
    'native-review-toolkit',
  ]);
  if (!exists.rowCount) {
    let files = [
      {
        path: 'README.md',
        content:
          '# Native review toolkit\n\nCreator-provided examples for Claude Code, Gemini CLI, and Copilot. Inspect source before reuse. No runtime execution, evaluation, or verified compatibility is claimed. Configure connections locally; never publish secrets.\n',
      },
    ];
    for (const runtime of ['claude-code', 'gemini-cli', 'copilot-vscode'] as const) {
      for (const kind of ['skill', 'agent'] as const) {
        const pkg = createNativePackage(
          runtime,
          kind,
          'review-checklist',
          'Review code changes for correctness and explain actionable findings.',
          'Inspect the supplied diff. Identify correctness and security risks with file references and evidence. State uncertainty, ask for missing context, and do not claim tests were run. Request approval before write actions.',
        );
        files.push(...pkg.files);
      }
      files = addHarnessTemplate(files, runtime, 'mcp', 'project-tools-' + runtime).files;
    }
    const harness = await harnessService.create(
      {
        name: 'Native review toolkit',
        slug: 'native-review-toolkit',
        description:
          'Inspectable agent, skill, and MCP files for Claude Code, Gemini CLI, and Copilot. Creator-provided starter configurations.',
        visibility: 'public',
        files,
      },
      owner.id,
    );
    await harnessService.publish(harness.id, owner.id, {
      revision: 1,
      version: '1.0.0',
      notes: 'Native starter files. No live execution or evaluation recorded.',
    });
    console.log('Seeded the native review Harness.');
  }
  console.log('Local demo account ready: demo@skillshare.test / SkillShare-Demo-2026!');
  await pool.query(
    "INSERT INTO users(id,name,email,password_hash,email_verified_at,role) VALUES($1,$2,$3,$4,now(),'admin') ON CONFLICT(email) DO NOTHING",
    [
      randomUUID(),
      'SkillShare Admin',
      'admin@skillshare.test',
      await argon2.hash('SkillShare-Admin-2026!', { type: argon2.argon2id }),
    ],
  );
  const admin = (
    await pool.query('SELECT role FROM users WHERE email=$1', ['admin@skillshare.test'])
  ).rows[0];
  if (admin?.role !== 'admin')
    throw new Error(
      'The local admin address already belongs to a user. Use admin:grant explicitly; the seed will not promote an existing account.',
    );
  console.log('Local admin account ready: admin@skillshare.test / SkillShare-Admin-2026!');
} finally {
  await pool.end();
}
