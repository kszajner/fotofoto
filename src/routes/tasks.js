import { getDb } from '../db/index.js';

export default async function taskRoutes(app) {
  app.get('/api/tasks', async () => {
    return getDb()
      .prepare(
        `SELECT id, title, description, points
           FROM tasks
          WHERE active = 1
          ORDER BY sort_order, id`,
      )
      .all();
  });
}
