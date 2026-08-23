import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index.js';

const COOKIE_NAME = 'guest_id';
// Rozciągnięte na cały czas trwania i po weselu — gość może wrócić do
// galerii następnego dnia.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export default async function guestRoutes(app) {
  app.post('/api/guest', async (req, reply) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return reply.code(400).send({ error: 'imię jest wymagane' });
    if (name.length > 80) return reply.code(400).send({ error: 'imię za długie' });

    const id = randomUUID();
    getDb()
      .prepare('INSERT INTO guests (id, name, created_at) VALUES (?, ?, ?)')
      .run(id, name, Date.now());

    reply.setCookie(COOKIE_NAME, id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
    });
    return { id, name };
  });

  app.get('/api/guest/me', async (req, reply) => {
    const id = req.cookies?.[COOKIE_NAME];
    if (!id) return reply.code(404).send({ error: 'brak gościa' });

    const guest = getDb().prepare('SELECT id, name FROM guests WHERE id = ?').get(id);
    if (!guest) return reply.code(404).send({ error: 'brak gościa' });
    return guest;
  });
}

export { COOKIE_NAME };
