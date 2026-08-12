import { createAuth, closeAuthDatabase } from "../src/auth";
import { database } from "../src/db";

const email = process.env["ADMIN_EMAIL"];
const password = process.env["ADMIN_PASSWORD"];

if (!email || !password) {
  throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
}

const seedAuth = createAuth(false);

try {
  const existing = await database<{ id: string }[]>`
    SELECT id FROM "user" WHERE email = ${email.toLowerCase()}
  `;

  if (existing.length === 0) {
    await seedAuth.api.signUpEmail({
      body: {
        email: email.toLowerCase(),
        password,
        name: "Dream Rock Collective Admin",
      },
    });

    console.log(`Seeded admin account ${email.toLowerCase()}`);
  } else {
    console.log(`Admin account ${email.toLowerCase()} already exists`);
  }
} finally {
  await closeAuthDatabase();
  await database.end();
}
