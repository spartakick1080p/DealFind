import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn(
    '[db] DATABASE_URL is not set. Database operations will fail at runtime. ' +
    'Copy .env.local.example to .env.local and fill in your Neon connection string.',
  );
}

const sql = neon(databaseUrl ?? 'postgresql://placeholder:placeholder@localhost/placeholder');
export const db = drizzle(sql, { schema });
