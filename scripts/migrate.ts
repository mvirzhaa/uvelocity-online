import 'dotenv/config';
import { createPool } from '../server/db/pool.js';
import { migrate } from '../server/db/migrate.js';

const pool = createPool();
try {
  const applied = await migrate(pool);
  console.info(applied.length ? `Applied migrations: ${applied.join(', ')}` : 'Database schema is current.');
} catch (error) { console.error(error instanceof Error ? error.message : 'Migration failed.'); process.exitCode = 1; }
finally { await pool.end(); }
