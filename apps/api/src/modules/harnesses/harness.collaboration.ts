import { randomUUID } from 'node:crypto';
import {
  assertShareable,
  harnessProposalSchema,
  harnessMemberSchema,
  harnessProposalDecisionSchema,
  harnessProposalMergeSchema,
  type SyncFile,
} from '@skillshare/contracts';
import type { z } from 'zod';
import { pool, transaction, type DB } from '../../db/client.js';
import { AppError } from '../../shared/errors.js';
import { authorize, capabilities } from './harness.policy.js';
import { harnessRepository as repo } from './harness.repository.js';
import { recordRevision, treeHash } from './harness.sync.js';

const fields = `p.id,p.title,p.description,p.author_id AS "authorId",u.name AS "authorName",p.base_revision AS "baseRevision",p.tree_hash AS "treeHash",p.source,p.status,p.merged_revision AS "mergedRevision",p.created_at AS "createdAt"`;
async function proposal(db: DB, id: string, proposalId: string) {
  const row = (
    await db.query('SELECT * FROM harness_proposals WHERE harness_id=$1 AND id=$2 FOR UPDATE', [
      id,
      proposalId,
    ])
  ).rows[0];
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Change proposal unavailable.');
  if (row.status !== 'open')
    throw new AppError(409, 'PROPOSAL_CLOSED', 'This proposal is no longer open.');
  return row;
}
function reviewed(row: { tree_hash: string }, hash: string) {
  if (row.tree_hash !== hash)
    throw new AppError(
      409,
      'CHECKSUM_CONFLICT',
      'Review the exact proposed snapshot before continuing.',
    );
}
export const collaborationService = {
  async members(id: string, actor: string) {
    await authorize(id, actor, 'canManage');
    return {
      items: (
        await pool.query(
          'SELECT u.id,u.name,u.email,m.role FROM harness_members m JOIN users u ON u.id=m.user_id WHERE m.harness_id=$1 ORDER BY u.name,u.id',
          [id],
        )
      ).rows,
    };
  },
  async setMember(id: string, actor: string, input: z.infer<typeof harnessMemberSchema>) {
    await transaction(async (db) => {
      await authorize(id, actor, 'canManage', db, true);
      const user = (await db.query('SELECT id FROM users WHERE email=$1', [input.email])).rows[0];
      if (!user)
        throw new AppError(404, 'NOT_FOUND', 'Ask this person to create an account first.');
      if (user.id === actor)
        throw new AppError(
          422,
          'OWNER_ROLE',
          'The owner role cannot be changed through membership.',
        );
      await db.query(
        'INSERT INTO harness_members(harness_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(harness_id,user_id) DO UPDATE SET role=EXCLUDED.role',
        [id, user.id, input.role],
      );
    });
  },
  async removeMember(id: string, actor: string, userId: string) {
    await transaction(async (db) => {
      await authorize(id, actor, 'canManage', db, true);
      await db.query('DELETE FROM harness_members WHERE harness_id=$1 AND user_id=$2', [
        id,
        userId,
      ]);
    });
  },
  async policy(id: string, actor: string, requireReview: boolean) {
    await transaction(async (db) => {
      await authorize(id, actor, 'canManage', db, true);
      await db.query('UPDATE harnesses SET require_review=$1 WHERE id=$2', [requireReview, id]);
    });
  },
  async list(id: string, actor: string) {
    const access = await capabilities(id, actor);
    return {
      items: (
        await pool.query(
          `SELECT ${fields} FROM harness_proposals p JOIN users u ON u.id=p.author_id WHERE p.harness_id=$1 AND ($2::boolean OR p.author_id=$3) ORDER BY p.created_at DESC,p.id LIMIT 100`,
          [id, access.canReadDraft, actor],
        )
      ).rows,
    };
  },
  async get(id: string, proposalId: string, actor: string) {
    const access = await capabilities(id, actor);
    const row = (
      await pool.query(
        `SELECT ${fields},p.files FROM harness_proposals p JOIN users u ON u.id=p.author_id WHERE p.harness_id=$1 AND p.id=$2 AND ($3::boolean OR p.author_id=$4)`,
        [id, proposalId, access.canReadDraft, actor],
      )
    ).rows[0];
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Change proposal unavailable.');
    const base = (
      await pool.query('SELECT files FROM harness_revisions WHERE harness_id=$1 AND revision=$2', [
        id,
        row.baseRevision,
      ])
    ).rows[0];
    const reviews = (
      await pool.query(
        'SELECT r.reviewer_id AS "reviewerId",u.name AS "reviewerName",r.comment,r.tree_hash AS "treeHash",r.created_at AS "createdAt",(r.reviewer_id=h.owner_id OR COALESCE(m.role=\'publisher\',false)) AS valid FROM harness_proposal_reviews r JOIN users u ON u.id=r.reviewer_id JOIN harnesses h ON h.id=$2 LEFT JOIN harness_members m ON m.harness_id=h.id AND m.user_id=r.reviewer_id WHERE r.proposal_id=$1 ORDER BY r.created_at,r.id',
        [proposalId, id],
      )
    ).rows;
    return { ...row, baseFiles: base.files, reviews, capabilities: access };
  },
  async create(id: string, actor: string, input: z.infer<typeof harnessProposalSchema>) {
    return transaction(async (db) => {
      const access = await authorize(id, actor, 'canPropose', db, true);
      const base = (
        await db.query('SELECT files FROM harness_revisions WHERE harness_id=$1 AND revision=$2', [
          id,
          input.revision,
        ])
      ).rows[0];
      const released =
        access.canReadDraft ||
        !!(
          await db.query('SELECT 1 FROM harness_releases WHERE harness_id=$1 AND revision=$2', [
            id,
            input.revision,
          ])
        ).rows.length;
      if (!base || !released)
        throw new AppError(404, 'NOT_FOUND', 'Choose an accessible release as the proposal base.');
      try {
        assertShareable(input.files);
      } catch (error) {
        throw new AppError(422, 'UNSAFE_SYNC', (error as Error).message);
      }
      const hash = treeHash(input.files);
      if (hash === treeHash(base.files))
        throw new AppError(
          422,
          'NO_CHANGES',
          'Change at least one file before submitting a proposal.',
        );
      const proposalId = randomUUID();
      await db.query(
        'INSERT INTO harness_proposals(id,harness_id,author_id,title,description,base_revision,files,tree_hash,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          proposalId,
          id,
          actor,
          input.title,
          input.description,
          input.revision,
          JSON.stringify(input.files),
          hash,
          input.source ? JSON.stringify(input.source) : null,
        ],
      );
      return { id: proposalId, treeHash: hash, status: 'open' };
    });
  },
  async approve(
    id: string,
    proposalId: string,
    actor: string,
    input: z.infer<typeof harnessProposalDecisionSchema>,
  ) {
    await transaction(async (db) => {
      await authorize(id, actor, 'canReview', db, true);
      const row = await proposal(db, id, proposalId);
      reviewed(row, input.treeHash);
      if (row.author_id === actor)
        throw new AppError(
          403,
          'SELF_REVIEW',
          'A different owner or publisher must approve your changes.',
        );
      await db.query(
        'INSERT INTO harness_proposal_reviews(id,proposal_id,reviewer_id,tree_hash,comment) VALUES($1,$2,$3,$4,$5) ON CONFLICT(proposal_id,reviewer_id) DO UPDATE SET tree_hash=EXCLUDED.tree_hash,comment=EXCLUDED.comment,created_at=now()',
        [randomUUID(), proposalId, actor, input.treeHash, input.comment],
      );
    });
  },
  async merge(
    id: string,
    proposalId: string,
    actor: string,
    input: z.infer<typeof harnessProposalMergeSchema>,
  ) {
    return transaction(async (db) => {
      await authorize(id, actor, 'canReview', db, true);
      const row = await proposal(db, id, proposalId);
      reviewed(row, input.treeHash);
      const head = (await repo.lockDraft(id, actor, db)).rows[0];
      if (!head || input.revision !== head.revision || row.base_revision !== head.revision)
        throw new AppError(
          409,
          'REVISION_CONFLICT',
          'The draft changed since this proposal was created. Submit a new proposal against the current draft after reviewing the differences.',
        );
      // A demoted/revoked reviewer no longer supplies a valid approval.
      const approval = await db.query(
        "SELECT 1 FROM harness_proposal_reviews r JOIN harnesses h ON h.id=$1 LEFT JOIN harness_members m ON m.harness_id=h.id AND m.user_id=r.reviewer_id WHERE r.proposal_id=$2 AND r.tree_hash=$3 AND r.reviewer_id<>$4 AND (r.reviewer_id=h.owner_id OR m.role='publisher')",
        [id, proposalId, row.tree_hash, row.author_id],
      );
      if (!approval.rows.length)
        throw new AppError(
          409,
          'APPROVAL_REQUIRED',
          'An active owner or publisher other than the author must approve this snapshot.',
        );
      const next = head.revision + 1;
      await repo.updateDraft(id, actor, head.revision, row.files as SyncFile[], db);
      await recordRevision(db, id, next, row.files, actor, 'proposal', 'Merge: ' + row.title);
      await db.query(
        "UPDATE harness_proposals SET status='merged',merged_revision=$1,updated_at=now() WHERE id=$2",
        [next, proposalId],
      );
      return { revision: next, status: 'merged' };
    });
  },
  async close(id: string, proposalId: string, actor: string) {
    await transaction(async (db) => {
      const access = await capabilities(id, actor, db, true);
      const row = await proposal(db, id, proposalId);
      if (row.author_id !== actor && !access.canReview)
        throw new AppError(404, 'NOT_FOUND', 'Change proposal unavailable.');
      await db.query("UPDATE harness_proposals SET status='closed',updated_at=now() WHERE id=$1", [
        proposalId,
      ]);
    });
  },
};
