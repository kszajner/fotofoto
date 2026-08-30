import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyCookie from '@fastify/cookie';

import { config } from './config.js';
import { closeDb } from './db/index.js';
import { migrate } from './db/migrate.js';
import healthRoutes from './routes/health.js';
import taskRoutes from './routes/tasks.js';
import guestRoutes from './routes/guest.js';
import submissionRoutes from './routes/submissions.js';
import adminRoutes from './routes/admin.js';
import feedRoutes from './routes/feed.js';
import mediaRoutes from './routes/media.js';
import { startThumbnailWorker } from './workers/thumbnails.js';

const app = Fastify({
  logger: { level: config.logLevel },
  bodyLimit: 1024 * 1024, // JSON/formularze; upload zdjęć idzie osobną ścieżką (multipart, streaming)
});

// Migrujemy przed nasłuchiwaniem: lepiej nie wstać wcale niż obsługiwać
// ruch na niezgodnym schemacie.
migrate({ log: (msg) => app.log.info(msg) });

if (config.adminUser === 'admin' && config.adminPass === 'admin') {
  app.log.warn('ADMIN_USER/ADMIN_PASS nieustawione — panel /admin używa domyślnych danych logowania');
}

await app.register(fastifyCookie);
await app.register(fastifyMultipart, { attachFieldsToBody: false });
await app.register(fastifyStatic, { root: config.publicDir, index: 'index.html' });
await app.register(healthRoutes);
await app.register(taskRoutes);
await app.register(guestRoutes);
await app.register(submissionRoutes);
await app.register(adminRoutes);
await app.register(feedRoutes);
await app.register(mediaRoutes);

const stopThumbnailWorker = startThumbnailWorker(app.log);

// systemd zatrzymuje usługę SIGTERM-em — domykamy połączenia i bazę,
// żeby WAL został poprawnie scalony.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    app.log.info(`${signal} — zamykam`);
    stopThumbnailWorker();
    await app.close();
    closeDb();
    process.exit(0);
  });
}

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`dane: ${config.dataDir}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
