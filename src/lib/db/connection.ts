import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Direct connection — for VPS workers, migrations
const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString, {
  max: 1, // serverless-friendly: 1 connection per invocation
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
