import { getDb } from '../db/index.js';
import { COOKIE_NAME } from './guest.js';

export default async function taskRoutes(app) {
  app.get('/api/tasks', async (req) => {
    const db = getDb();
    const tasks = db
      .prepare(
        `SELECT id, title, description, points
           FROM tasks
          WHERE active = 1
          ORDER BY sort_order, id`,
      )
      .all();

    const guestId = req.cookies?.[COOKIE_NAME];
    if (!guestId) return tasks.map((t) => ({ ...t, done: false }));

    // "Zrobione" = ma choć jedno zdjęcie wysłane do tego zadania — nie samo
    // zgłoszenie, bo submission bez photo to porzucony upload.
    const doneIds = new Set(
      db
        .prepare(
          `SELECT DISTINCT s.task_id AS task_id
             FROM submissions s
             JOIN photos p ON p.submission_id = s.id
            WHERE s.guest_id = ?`,
        )
        .all(guestId)
        .map((r) => r.task_id),
    );

    return tasks.map((t) => ({ ...t, done: doneIds.has(t.id) }));
  });
}
