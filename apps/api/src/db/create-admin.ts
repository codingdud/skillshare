import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { z } from 'zod';
import { pool, transaction, type DB } from './client.js';

const input = z
  .object({
    ADMIN_EMAIL: z.email().toLowerCase(),
    ADMIN_PASSWORD: z.string().min(8, 'Use at least 8 characters').max(128),
    ADMIN_NAME: z.string().min(1).max(80).default('SkillShare Admin'),
  })
  .parse(process.env);

// Deletes rows that reference the target through non-cascading foreign keys, deepest first.
async function purge(db: DB, table: string, where: string, depth = 0): Promise<void> {
  if (depth > 8) throw new Error(`Foreign key chain too deep at ${table}.`);
  const children = await db.query(
    `SELECT c.conrelid::regclass::text AS child, a.attname AS child_col, r.attname AS parent_col
     FROM pg_constraint c
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     JOIN pg_attribute r ON r.attrelid = c.confrelid AND r.attnum = c.confkey[1]
     WHERE c.contype = 'f' AND c.confrelid = $1::regclass AND c.conrelid <> c.confrelid
       AND c.confdeltype IN ('a', 'r') AND array_length(c.conkey, 1) = 1`,
    [table],
  );
  for (const { child, child_col, parent_col } of children.rows)
    await purge(
      db,
      child,
      `${child_col} IN (SELECT ${parent_col} FROM ${table} WHERE ${where})`,
      depth + 1,
    );
  await db.query(`DELETE FROM ${table} WHERE ${where}`, [input.ADMIN_EMAIL]);
}

try {
  const passwordHash = await argon2.hash(input.ADMIN_PASSWORD, { type: argon2.argon2id });
  await transaction(async (db) => {
    const existing = await db.query('SELECT id FROM users WHERE email=$1', [input.ADMIN_EMAIL]);
    if (existing.rowCount) {
      await purge(db, 'users', 'email = $1');
      console.log(`Deleted existing account ${input.ADMIN_EMAIL} and its data.`);
    }
    await db.query(
      "INSERT INTO users(id,name,email,password_hash,email_verified_at,role) VALUES($1,$2,$3,$4,now(),'admin')",
      [randomUUID(), input.ADMIN_NAME, input.ADMIN_EMAIL, passwordHash],
    );
  });
  console.log(`Administrator created: ${input.ADMIN_EMAIL}`);
} finally {
  await pool.end();
}
