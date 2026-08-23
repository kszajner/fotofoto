import { config } from '../config.js';
import { getDb } from '../db/index.js';

// Healthcheck MUSI dotknąć bazy. Endpoint, który zwraca {ok:true} bez
// odpytania SQLite, zamelduje "zdrowy" także wtedy, gdy dysk z danymi
// się nie zamontował — a to jest dokładnie ta awaria, którą chcemy złapać
// przy deployu i przy autostarcie po zaniku prądu.
export default async function healthRoutes(app) {
  app.get('/healthz', async (_req, reply) => {
    try {
      const { n } = getDb().prepare('SELECT count(*) AS n FROM tasks').get();
      return { ok: true, version: config.version, tasks: n, uptime: Math.round(process.uptime()) };
    } catch (err) {
      app.log.error({ err }, 'healthcheck: baza niedostępna');
      return reply.code(503).send({ ok: false, error: 'baza niedostępna' });
    }
  });
}
