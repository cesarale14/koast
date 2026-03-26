import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Pooled connection — for Vercel serverless functions
const connectionString = process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL!;

const client = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false, // required for pgbouncer/transaction pooling
});

export const db = drizzle(client, { schema });
