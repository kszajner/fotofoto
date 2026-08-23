// CLI do migracji — wołane przez deploy.ps1 na Pi przed restartem usługi.
// Serwer i tak migruje przy starcie, ale przy deployu chcemy wiedzieć
// o błędzie migracji ZANIM zrestartujemy działającą aplikację.

import { migrate } from '../src/db/migrate.js';
import { closeDb } from '../src/db/index.js';

try {
  const n = migrate();
  console.log(n === 0 ? 'brak nowych migracji' : `nałożono migracji: ${n}`);
} catch (err) {
  console.error('migracja nie powiodła się:', err.message);
  process.exitCode = 1;
} finally {
  closeDb();
}
