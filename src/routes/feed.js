import { getDb } from '../db/index.js';

const PAGE_SIZE = 24;

function encodeCursor(row) {
  return Buffer.from(`${row.created_at}:${row.photo_id}`).toString('base64url');
}

function decodeCursor(cursor) {
  try {
    const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split(':');
    if (!createdAt || !id) return null;
    return { createdAt: Number(createdAt), id };
  } catch {
    return null;
  }
}

export default async function feedRoutes(app) {
  app.get('/api/feed', async (req, reply) => {
    const rawCursor = req.query?.cursor;
    const cursor = rawCursor ? decodeCursor(rawCursor) : null;
    if (rawCursor && !cursor) return reply.code(400).send({ error: 'zły cursor' });

    // Keyset (created_at, id) zamiast OFFSET — stabilne strony mimo nowych
    // zdjęć dochodzących w trakcie przewijania feedu.
    const rows = getDb()
      .prepare(
        `SELECT p.id AS photo_id, p.width, p.height, p.created_at,
                t.title AS task_title, g.name AS guest_name
           FROM photos p
           JOIN submissions s ON s.id = p.submission_id
           JOIN tasks t ON t.id = s.task_id
           JOIN guests g ON g.id = s.guest_id
          WHERE p.thumb_ready = 1 AND s.status = 'ok'
            AND (@createdAt IS NULL
                 OR p.created_at < @createdAt
                 OR (p.created_at = @createdAt AND p.id < @id))
          ORDER BY p.created_at DESC, p.id DESC
          LIMIT @limit`,
      )
      .all({
        createdAt: cursor?.createdAt ?? null,
        id: cursor?.id ?? null,
        limit: PAGE_SIZE,
      });

    const nextCursor = rows.length === PAGE_SIZE ? encodeCursor(rows[rows.length - 1]) : null;
    return { items: rows, next_cursor: nextCursor };
  });
}
