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
    if (!guestId) return tasks.map((t) => ({ ...t, done: false, photo_id: null }));

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

    // Do pokazania zdjęcia we "klatce" wystarczy gotowa miniatura — pomijamy
    // zdjęcia jeszcze nieprzetworzone przez workera (rzadkie, chwilowe).
    // Najnowsze najpierw, więc pierwsze trafienie per zadanie wygrywa.
    const photoByTask = new Map();
    for (const row of db
      .prepare(
        `SELECT s.task_id AS task_id, p.id AS photo_id
           FROM submissions s
           JOIN photos p ON p.submission_id = s.id
          WHERE s.guest_id = ? AND p.thumb_ready = 1
          ORDER BY p.created_at DESC`,
      )
      .all(guestId)) {
      if (!photoByTask.has(row.task_id)) photoByTask.set(row.task_id, row.photo_id);
    }

    return tasks.map((t) => ({
      ...t,
      done: doneIds.has(t.id),
      photo_id: photoByTask.get(t.id) ?? null,
    }));
  });
}
