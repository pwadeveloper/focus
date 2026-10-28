import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let client: NeonQueryFunction<false, false> | null = null;

/** Neon's HTTP driver: one round trip per query or transaction, no pool to manage. */
export function db(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set. Run `vercel env pull .env.local`.');
    }
    client = neon(url);
  }
  return client;
}

/** Postgres bigint columns arrive as strings. */
export const toNumber = (value: unknown): number => Number(value ?? 0);
