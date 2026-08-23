import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';

import { config } from './config.js';
import { closeDb } from './db/index.js';
import { migrate } from './db/migrate.js';
import healthRoutes from './routes/health.js';
import taskRoutes from './routes/tasks.js';

const app = Fastify({
  logger: { level: config.logLevel },
  bodyLimit: 1024 * 1024, // upload zdjęć pójdzie osobną ścieżką (multipart) w v0.3
});

// Migrujemy przed nasłuchiwaniem: lepiej nie wstać wcale niż obsługiwać
// ruch na niezgodnym schemacie.
migrate({ log: (msg) => app.log.info(msg) });

await app.register(fastifyStatic, { root: config.publicDir, index: 'index.html' });
await app.register(healthRoutes);
await app.register(taskRoutes);

// systemd zatrzymuje usługę SIGTERM-em — domykamy połączenia i bazę,
// żeby WAL został poprawnie scalony.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    app.log.info(`${signal} — zamykam`);
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
