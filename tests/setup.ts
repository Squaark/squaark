import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

// Point every test file at its own throwaway SQLite file, migrated fresh.
// Must run before anything imports src/db/connection.ts or src/config.ts,
// since both read process.env at module-load time.
process.env.DATABASE_PATH = path.join(os.tmpdir(), `squaark-test-${randomUUID()}.db`);
process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';
process.env.NODE_ENV = 'test';

const { runMigrations } = await import('../src/db/migrate');
runMigrations();
