import { Hono } from "hono";
import type { Context } from "hono";
import { database } from "../../db";

export const adminRoute = new Hono();

adminRoute.use("/admin", async (c, next) => {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.error(
      "Admin route is unavailable: ADMIN_USERNAME and ADMIN_PASSWORD are required",
    );
    return c.text("Admin authentication is not configured", 503);
  }

  const authorization = c.req.header("Authorization");
  const unauthorized = () => {
    c.header("WWW-Authenticate", 'Basic realm="Dream Rock Collective Admin"');
    return c.text("Authentication required", 401);
  };

  if (!authorization?.startsWith("Basic ")) {
    return unauthorized();
  }

  let credentials: string;
  try {
    credentials = atob(authorization.slice("Basic ".length));
  } catch {
    return unauthorized();
  }

  const separator = credentials.indexOf(":");
  if (
    separator === -1 ||
    credentials.slice(0, separator) !== username ||
    credentials.slice(separator + 1) !== password
  ) {
    return unauthorized();
  }

  return next();
});

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderPage = (content: string): string => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Admin | Dream Rock Collective</title>
    <style>
      :root { color-scheme: light; font-family: system-ui, sans-serif; }
      body { margin: 0; background: #f5f5f5; color: #222; }
      main { max-width: 1000px; margin: 0 auto; padding: 2rem 1rem; }
      h1 { margin-top: 0; }
      .card { overflow-x: auto; background: #fff; border: 1px solid #ddd; border-radius: 8px; }
      table { width: 100%; border-collapse: collapse; text-align: left; }
      th, td { padding: .8rem 1rem; border-bottom: 1px solid #eee; white-space: nowrap; }
      th { background: #fafafa; font-size: .85rem; }
      tr:last-child td { border-bottom: 0; }
      .muted { color: #666; }
      .error { padding: 1rem; color: #8a1c1c; background: #fff0f0; border: 1px solid #e0a0a0; border-radius: 8px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Registrations</h1>
      ${content}
    </main>
  </body>
</html>`;

const adminPage = async (c: Context) => {
  try {
    const registrations = await database`
      SELECT id, name, email, created_at
      FROM registrations
      ORDER BY created_at DESC
    `;

    const rows = registrations
      .map(
        (registration) => `<tr>
          <td>${escapeHtml(String(registration.id))}</td>
          <td>${escapeHtml(String(registration.name))}</td>
          <td>${escapeHtml(String(registration.email))}</td>
          <td>${escapeHtml(new Date(registration.created_at).toLocaleString())}</td>
        </tr>`,
      )
      .join("");

    const table = registrations.length
      ? `<div class="card">
          <table>
            <thead>
              <tr><th>ID</th><th>Name</th><th>Email</th><th>Created</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`
      : `<p class="muted">No registrations yet.</p>`;

    return c.html(renderPage(table));
  } catch (error) {
    console.error("Could not load admin data", error);
    return c.html(
      renderPage('<p class="error">Could not load registrations.</p>'),
      500,
    );
  }
};

adminRoute.get("/admin", adminPage);
adminRoute.get("/admin/", adminPage);
