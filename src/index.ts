import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth";
import { sessionMiddleware, type SessionVariables } from "./middleware/session";
import { adminRoute } from "./routes/admin";
import { healthRoute } from "./routes/health";
import { registrationsRoute } from "./routes/registrations";

const app = new Hono<{ Variables: SessionVariables }>();
app.use(
  "/*",
  cors({
    origin:
      process.env["REGISTRATION_SITE_ORIGIN"] ?? "http://localhost:5173",
  }),
);
app.use("*", sessionMiddleware);
app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));
app.route("/", healthRoute);
app.route("/", registrationsRoute);
app.route("/", adminRoute);

const port = 6942;

export default {
  port,
  fetch: app.fetch,
};

console.log(`Server running on port ${port}`);
