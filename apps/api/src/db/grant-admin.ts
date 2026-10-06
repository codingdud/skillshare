import { z } from 'zod';
import { pool, transaction } from './client.js';
import { recordAudit } from '../modules/admin/audit.js';
try {
  const email = z.email().toLowerCase().parse(process.argv[2]);
  await transaction(async (db) => {
    await db.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
    const user = (
      await db.query('SELECT id,role,email_verified_at FROM users WHERE email=$1', [email])
    ).rows[0];
    if (!user?.email_verified_at)
      throw new Error(
        'Create the account and verify its email before granting administrator access.',
      );
    if (user.role !== 'admin') {
      await db.query("UPDATE users SET role='admin',role_revision=role_revision+1 WHERE id=$1", [
        user.id,
      ]);
      await recordAudit(
        'user.role_changed',
        null,
        user.id,
        'Administrator access granted by database operator',
        db,
      );
    }
  });
  console.log('Administrator access granted. Sign in again to update the account menu.');
} finally {
  await pool.end();
}
