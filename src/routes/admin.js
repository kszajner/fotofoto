import path from 'node:path';
import { ZipArchive } from 'archiver';
import fastifyBasicAuth from '@fastify/basic-auth';
import fastifyStatic from '@fastify/static';

import { getDb } from '../db/index.js';
import { config, paths } from '../config.js';

// Zip zawiera oryginały (nie miniatury) w folderach per zadanie — to jest
// eksport "dla pary młodej", nie kolejny mechanizm serwowania do przeglądarki.
function sanitizeSegment(str) {
  return String(str).replace(/[\\/:*?"<>|]/g, '_').trim() || '_';
}

function validate(username, password, req, reply, done) {
  if (username === config.adminUser && password === config.adminPass) return done();
  done(new Error('błędne dane logowania'));
}

// Zadania to dane (CLAUDE.md) — walidacja tylko na tyle, żeby nie wpuścić
// śmieci do bazy, nie po to, żeby ograniczać treść.
// Zwraca tylko pola faktycznie obecne w body — brak pola i pole=false/0 to
// dwie różne rzeczy, dlatego rozróżniamy przez `!== undefined`, nie przez
// wartość. Defaults dla brakujących pól ustawia wywołujący (POST vs PATCH
// mają różne potrzeby: PATCH scala z istniejącym wierszem).
function sanitizeTaskInput(body) {
  const out = {};

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) throw new Error('title jest wymagany');
    out.title = title;
  }
  if (body.description !== undefined) {
    out.description = String(body.description).trim();
  }
  if (body.points !== undefined) {
    const points = Number(body.points);
    if (!Number.isInteger(points) || points < 0) {
      throw new Error('points musi być nieujemną liczbą całkowitą');
    }
    out.points = points;
  }
  if (body.active !== undefined) {
    out.active = body.active ? 1 : 0;
  }
  if (body.sort_order !== undefined) {
    const sortOrder = Number(body.sort_order);
    if (!Number.isInteger(sortOrder)) throw new Error('sort_order musi być liczbą całkowitą');
    out.sort_order = sortOrder;
  }
  return out;
}

export default async function adminRoutes(app) {
  await app.register(async function scoped(scoped) {
    await scoped.register(fastifyBasicAuth, { validate, authenticate: { realm: 'fotofoto admin' } });
    scoped.addHook('onRequest', scoped.basicAuth);

    // Osobny katalog statyczny (nie public/) — inaczej strona admina
    // wyciekłaby bez basic auth przez globalny fastifyStatic w server.js.
    await scoped.register(fastifyStatic, {
      root: path.join(config.rootDir, 'admin'),
      prefix: '/admin/',
      decorateReply: false,
      redirect: true,
    });

    // `redirect: true` u fastify-static łapie tylko podkatalogi, nie sam
    // prefiks — bez tego "/admin" (bez slasha) leci jako 404 JSON, co
    // telefony/przeglądarki potrafią zaoferować do pobrania jako plik.
    scoped.get('/admin', async (req, reply) => {
      return reply.redirect('/admin/');
    });

    scoped.get('/api/admin/tasks', async () => {
      return getDb().prepare('SELECT * FROM tasks ORDER BY sort_order, id').all();
    });

    scoped.post('/api/admin/tasks', async (req, reply) => {
      let data;
      try {
        data = sanitizeTaskInput(req.body ?? {});
      } catch (err) {
        return reply.code(400).send({ error: err.message });
      }
      if (data.title === undefined) return reply.code(400).send({ error: 'title jest wymagany' });
      if (data.description === undefined) data.description = '';
      if (data.points === undefined) data.points = 1;
      if (data.active === undefined) data.active = 1;
      if (data.sort_order === undefined) data.sort_order = 0;

      const info = getDb()
        .prepare(
          `INSERT INTO tasks (title, description, points, active, sort_order)
           VALUES (@title, @description, @points, @active, @sort_order)`,
        )
        .run(data);
      return reply
        .code(201)
        .send(getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid));
    });

    scoped.patch('/api/admin/tasks/:id', async (req, reply) => {
      const id = Number(req.params.id);
      const existing = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      if (!existing) return reply.code(404).send({ error: 'nieznane zadanie' });

      let data;
      try {
        data = sanitizeTaskInput(req.body ?? {});
      } catch (err) {
        return reply.code(400).send({ error: err.message });
      }

      const merged = { ...existing, ...data, id };
      getDb()
        .prepare(
          `UPDATE tasks SET title=@title, description=@description, points=@points,
                            active=@active, sort_order=@sort_order
           WHERE id=@id`,
        )
        .run(merged);
      return getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    });

    scoped.get('/api/admin/photos', async () => {
      return getDb()
        .prepare(
          `SELECT p.id AS photo_id, p.thumb_ready, p.width, p.height, p.created_at,
                  s.status, t.title AS task_title, g.name AS guest_name
             FROM photos p
             JOIN submissions s ON s.id = p.submission_id
             JOIN tasks t ON t.id = s.task_id
             JOIN guests g ON g.id = s.guest_id
            ORDER BY p.created_at DESC`,
        )
        .all();
    });

    scoped.post('/api/admin/photos/:id/hide', async (req, reply) => {
      const db = getDb();
      const photo = db.prepare('SELECT id, submission_id FROM photos WHERE id = ?').get(req.params.id);
      if (!photo) return reply.code(404).send({ error: 'nieznane zdjęcie' });

      const hidden = req.body?.hidden === undefined ? true : Boolean(req.body.hidden);
      db.prepare('UPDATE submissions SET status = ? WHERE id = ?').run(
        hidden ? 'hidden' : 'ok',
        photo.submission_id,
      );
      return { photo_id: photo.id, hidden };
    });

    scoped.get('/api/admin/export.zip', async (req, reply) => {
      const rows = getDb()
        .prepare(
          `SELECT p.id AS photo_id, t.title AS task_title, g.name AS guest_name
             FROM photos p
             JOIN submissions s ON s.id = p.submission_id
             JOIN tasks t ON t.id = s.task_id
             JOIN guests g ON g.id = s.guest_id
            ORDER BY p.created_at`,
        )
        .all();

      reply.header('content-type', 'application/zip');
      reply.header('content-disposition', `attachment; filename="fotofoto-export.zip"`);

      const archive = new ZipArchive({ zlib: { level: 6 } });
      archive.on('error', (err) => req.log.error({ err }, 'export zip: błąd archiwizacji'));
      reply.send(archive);

      for (const row of rows) {
        const folder = sanitizeSegment(row.task_title);
        const name = `${sanitizeSegment(row.guest_name)}_${row.photo_id.slice(0, 8)}.jpg`;
        archive.file(path.join(paths.originals, `${row.photo_id}.jpg`), { name: `${folder}/${name}` });
      }
      // Musimy czekać na finalize (nie fire-and-forget) — inaczej handler
      // wraca, zanim archiver zdąży cokolwiek wypchnąć, i fastify zamyka
      // odpowiedź jako pustą. reply.send(archive) już podpięło konsumenta,
      // więc to nie blokuje na buforze (bez tego groziłby deadlock przy
      // dużym eksporcie, gdyby nikt jeszcze nie czytał strumienia).
      await archive.finalize();
    });
  });
}
