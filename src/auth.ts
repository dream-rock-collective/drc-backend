import { betterAuth } from "better-auth";
import { Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import { database } from "./db";

const baseURL =
  process.env["BETTER_AUTH_URL"] ??
  `http://localhost:${process.env["PORT"] ?? "6942"}`;
const useSecureCookies = process.env["NODE_ENV"] === "production";

const kysely = new Kysely({
  dialect: new PostgresJSDialect({ postgres: database }),
});

export const createAuth = (disableSignUp: boolean) =>
  betterAuth({
    database: {
      db: kysely,
      type: "postgres",
      transaction: true,
    },
    baseURL,
    basePath: "/auth",
    secret: process.env["BETTER_AUTH_SECRET"],
    trustedOrigins: [baseURL],
    useSecureCookies,
    emailAndPassword: {
      enabled: true,
      disableSignUp,
    },
  });

export const auth = createAuth(true);

export const closeAuthDatabase = async (): Promise<void> => {
  await kysely.destroy();
};
