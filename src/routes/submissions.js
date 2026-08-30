import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import fastifyRateLimit from '@fastify/rate-limit';

import { getDb } from '../db/index.js';
import { paths } from '../config.js';
import { COOKIE_NAME } from './guest.js';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_SUBMISSIONS_PER_GUEST_PER_DAY = 100;
// Twardy sufit na miejsce na dysku — przy ~700KB/zdjęcie (średnia z realnych
// testów) to maks. ~700MB. Bez tego 100/gość/dobę × wielu gości nie ma góry.
const MAX_TOTAL_PHOTOS = 1000;

const MAGIC = [
  [0xff, 0xd8, 0xff], // jpeg
  [0x89, 0x50, 0x4e, 0x47], // png
];

function looksLikeImage(buf) {
  return MAGIC.some((sig) => sig.every((b, i) => buf[i] === b));
}

// Walidacja po magic bytes pierwszego chunka, nie po rozszerzeniu/nazwie
// pliku od klienta (§6 ARCHITECTURE.md) — ta nazwa nigdy nie trafia na dysk.
function magicByteGate() {
  let checked = false;
  return new Transform({
    transform(chunk, _enc, cb) {
      if (!checked) {
        checked = true;
        if (!looksLikeImage(chunk)) return cb(new Error('BAD_MAGIC'));
      }
      cb(null, chunk);
    },
  });
}

function currentGuest(req, db) {
  const id = req.cookies?.[COOKIE_NAME];
  if (!id) return null;
  return db.prepare('SELECT id FROM guests WHERE id = ?').get(id);
}

export default async function submissionRoutes(app) {
  // Per-IP, nie per-gość — jeden telefon może mieć wielu gości za NAT-em
  // (dom weselny, jedno Wi-Fi), ale też jeden zepsuty klient nie zaleje
  // serwera. Reszta endpointów dostanie ochronę od Cloudflare w v1.0.
  await app.register(fastifyRateLimit, {
    max: 30,
    timeWindow: '1 minute',
    // errorResponseBuilder trafia do `throw` w pluginie — zwykły obiekt bez
    // statusCode ląduje jako 500, nie 429. Musi być Error z ustawionym polem.
    errorResponseBuilder: (_req, context) => {
      const err = new Error('zbyt wiele żądań — poczekaj chwilę i spróbuj ponownie');
      err.statusCode = context.statusCode;
      return err;
    },
  });

  // Plugin rate-limit rzuca Error, który fastify domyślnie serializuje jako
  // {statusCode,error:"Too Many Requests",message}. Reszta API w tym
  // projekcie zawsze zwraca {error}, więc ujednolicamy tylko dla tego pliku.
  app.setErrorHandler((err, req, reply) => {
    reply.code(err.statusCode ?? 500).send({ error: err.message });
  });

  app.post('/api/submissions', async (req, reply) => {
    const db = getDb();
    const guest = currentGuest(req, db);
    if (!guest) return reply.code(401).send({ error: 'brak gościa — najpierw POST /api/guest' });

    const taskId = Number(req.body?.task_id);
    if (!Number.isInteger(taskId)) {
      return reply.code(400).send({ error: 'task_id jest wymagany' });
    }

    const task = db.prepare('SELECT id FROM tasks WHERE id = ? AND active = 1').get(taskId);
    if (!task) return reply.code(404).send({ error: 'nieznane lub nieaktywne zadanie' });

    const since = Date.now() - 24 * 60 * 60 * 1000;
    const { n } = db
      .prepare('SELECT count(*) AS n FROM submissions WHERE guest_id = ? AND created_at > ?')
      .get(guest.id, since);
    if (n >= MAX_SUBMISSIONS_PER_GUEST_PER_DAY) {
      return reply.code(429).send({ error: 'limit zgłoszeń na dziś wyczerpany' });
    }

    const id = randomUUID();
    db.prepare(
      'INSERT INTO submissions (id, guest_id, task_id, created_at) VALUES (?, ?, ?, ?)',
    ).run(id, guest.id, taskId, Date.now());

    return reply.code(201).send({ submission_id: id });
  });

  app.post('/api/submissions/:id/photos', async (req, reply) => {
    const db = getDb();
    const guest = currentGuest(req, db);
    if (!guest) return reply.code(401).send({ error: 'brak gościa' });

    const submission = db
      .prepare('SELECT id FROM submissions WHERE id = ? AND guest_id = ?')
      .get(req.params.id, guest.id);
    if (!submission) return reply.code(404).send({ error: 'nieznane zgłoszenie' });

    const { n: totalPhotos } = db.prepare('SELECT count(*) AS n FROM photos').get();
    if (totalPhotos >= MAX_TOTAL_PHOTOS) {
      return reply.code(507).send({ error: 'osiągnięto limit miejsca — daj znać organizatorom' });
    }

    let data;
    try {
      data = await req.file({ limits: { fileSize: MAX_FILE_BYTES } });
    } catch {
      return reply.code(400).send({ error: 'oczekiwano multipart/form-data z polem pliku' });
    }
    if (!data) return reply.code(400).send({ error: 'brak pliku' });

    const photoId = randomUUID();
    const tmpPath = path.join(paths.originals, `${photoId}.tmp`);
    const finalPath = path.join(paths.originals, `${photoId}.jpg`);

    try {
      await pipeline(data.file, magicByteGate(), fs.createWriteStream(tmpPath));
    } catch (err) {
      await fs.promises.rm(tmpPath, { force: true });
      if (err.message === 'BAD_MAGIC') {
        return reply.code(415).send({ error: 'nieobsługiwany format — tylko JPEG/PNG' });
      }
      throw err;
    }

    if (data.file.truncated) {
      await fs.promises.rm(tmpPath, { force: true });
      return reply
        .code(413)
        .send({ error: `plik za duży — limit ${MAX_FILE_BYTES / 1024 / 1024}MB` });
    }

    const { size: bytes } = await fs.promises.stat(tmpPath);
    await fs.promises.rename(tmpPath, finalPath);

    // width/height dopisuje worker miniatur (i tak dotyka pliku przez sharp) —
    // ścieżka uploadu zostaje czystym streamingiem, bez dekodowania obrazu.
    db.prepare(
      `INSERT INTO photos (id, submission_id, thumb_ready, bytes, original_name, created_at)
       VALUES (?, ?, 0, ?, ?, ?)`,
    ).run(photoId, submission.id, bytes, data.filename ?? null, Date.now());

    return reply.code(201).send({ id: photoId });
  });
}
