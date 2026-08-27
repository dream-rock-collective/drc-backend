const baseURL = process.env["SMOKE_BASE_URL"] ?? "http://localhost:6942";
const email = process.env["ADMIN_EMAIL"];
const password = process.env["ADMIN_PASSWORD"];

if (!email || !password) {
  throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
}

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const jsonHeaders = { "Content-Type": "application/json" };

const health = await fetch(`${baseURL}/health`);
assert(health.status === 200, `health returned ${health.status}`);

const missingAddress = await fetch(`${baseURL}/register`, {
  method: "POST",
  headers: jsonHeaders,
  body: JSON.stringify({ name: "Smoke Test", email: "smoke@example.com" }),
});
assert(missingAddress.status === 400, "missing address should return 400");

const unauthenticated = await fetch(`${baseURL}/registrations`);
assert(unauthenticated.status === 401, "unauthenticated registrations should return 401");

const emailAddress = `smoke-${Date.now()}@example.com`;
const created = await fetch(`${baseURL}/register`, {
  method: "POST",
  headers: jsonHeaders,
  body: JSON.stringify({ name: "Smoke Test", email: emailAddress.toUpperCase(), address: "Smoke Street" }),
});
assert(created.status === 201, `register returned ${created.status}`);
const createdBody = (await created.json()) as { registration: { id: number } };
const id = createdBody.registration.id;

const login = await fetch(`${baseURL}/auth/sign-in/email`, {
  method: "POST",
  headers: { ...jsonHeaders, Origin: baseURL },
  body: JSON.stringify({ email, password }),
});
assert(login.status === 200, `login returned ${login.status}`);
const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
assert(Boolean(cookie), "login did not return a session cookie");
const authHeaders = { Cookie: cookie! };

const registrations = await fetch(`${baseURL}/registrations`, { headers: authHeaders });
assert(registrations.status === 200, `authenticated registrations returned ${registrations.status}`);
const registrationsBody = (await registrations.json()) as {
  registrations: Array<{ id: number; notes: string | null }>;
};
assert(
  registrationsBody.registrations.some((registration) => registration.id === id && registration.notes === null),
  "new registration notes should default to null",
);

const edit = await fetch(`${baseURL}/modify-registration`, {
  method: "POST",
  headers: { ...jsonHeaders, ...authHeaders },
  body: JSON.stringify({
    type: "edit",
    id: String(id),
    data: { name: "Edited Smoke Test", notes: "  First line\nSecond line  " },
  }),
});
assert(edit.status === 200, `edit returned ${edit.status}`);
const editBody = (await edit.json()) as { notes: string | null };
assert(editBody.notes === "First line\nSecond line", "notes were not saved");

const registrationsAfterEdit = await fetch(`${baseURL}/registrations`, { headers: authHeaders });
assert(registrationsAfterEdit.status === 200, `registrations after note edit returned ${registrationsAfterEdit.status}`);
const registrationsAfterEditBody = (await registrationsAfterEdit.json()) as {
  registrations: Array<{ id: number; notes: string | null }>;
};
assert(
  registrationsAfterEditBody.registrations.some(
    (registration) => registration.id === id && registration.notes === "First line\nSecond line",
  ),
  "saved notes were not returned by the registrations endpoint",
);

const oversizedNotes = await fetch(`${baseURL}/modify-registration`, {
  method: "POST",
  headers: { ...jsonHeaders, ...authHeaders },
  body: JSON.stringify({ type: "edit", id: String(id), data: { notes: "x".repeat(5001) } }),
});
assert(oversizedNotes.status === 400, "oversized notes should return 400");

const clearNotes = await fetch(`${baseURL}/modify-registration`, {
  method: "POST",
  headers: { ...jsonHeaders, ...authHeaders },
  body: JSON.stringify({ type: "edit", id: String(id), data: { notes: "   " } }),
});
assert(clearNotes.status === 200, `clearing notes returned ${clearNotes.status}`);
const clearNotesBody = (await clearNotes.json()) as { notes: string | null };
assert(clearNotesBody.notes === null, "cleared notes should be null");

const deletion = await fetch(`${baseURL}/modify-registration`, {
  method: "POST",
  headers: { ...jsonHeaders, ...authHeaders },
  body: JSON.stringify({ type: "delete", id: String(id) }),
});
assert(deletion.status === 200, `delete returned ${deletion.status}`);
const deletionBody = (await deletion.json()) as { deleted: boolean };
assert(deletionBody.deleted, "delete response was not marked deleted");

const afterDeletion = await fetch(`${baseURL}/registrations`, { headers: authHeaders });
const afterDeletionBody = (await afterDeletion.json()) as { registrations: Array<{ id: number; deleted: boolean }> };
assert(afterDeletionBody.registrations.some((registration) => registration.id === id && registration.deleted), "deleted registration was not retained");

const logout = await fetch(`${baseURL}/auth/sign-out`, {
  method: "POST",
  headers: { ...authHeaders, Origin: baseURL },
});
assert(logout.status === 200, `logout returned ${logout.status}`);

console.log("API smoke test passed");
