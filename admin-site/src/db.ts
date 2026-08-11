import postgres from "postgres";

// The connection string comes from Docker in production and can be overridden
// locally when running the API directly.
export const database = postgres(
  process.env.DATABASE_URL ??
    "postgres://admin:admin@localhost:5432/collective_admin",
);
