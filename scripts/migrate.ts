import { config } from 'dotenv';
import { runMigrations } from '../src/db/migrate.js';

config();

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

runMigrations(url).catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
