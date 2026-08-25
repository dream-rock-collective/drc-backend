import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { auth } from "./auth";
import { sessionMiddleware, type SessionVariables } from "./middleware/session";
import { healthRoute } from "./routes/health";
import { registrationsRoute } from "./routes/registrations";
import { paymentsRoute } from "./routes/payments";
import { allocationsRoute } from "./routes/allocations";

const app = new Hono<{ Variables: SessionVariables }>();
const configuredRegistrationSiteOrigin = process.env["REGISTRATION_SITE_ORIGIN"]?.trim();
const publicCors = cors({
  origin: configuredRegistrationSiteOrigin || "http://localhost:5173",
});

app.use(
  "/register",
  publicCors,
);
app.use(
  "/health",
  publicCors,
);
app.use(
  "/create-checkout-session",
  publicCors,
);
app.use(
  "/submit-allocation",
  publicCors,
);
app.use(
  "/registrations",
  sessionMiddleware,
);
app.use(
  "/modify-registration",
  sessionMiddleware,
);
app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));
app.route("/", healthRoute);
app.route("/", registrationsRoute);
app.route("/", paymentsRoute);
app.route("/", allocationsRoute);

app.use(
  "/*",
  serveStatic({ root: "./dist" }),
);
app.get(
  "*",
  serveStatic({ path: "./dist/index.html" }),
);


const port = Number(process.env["PORT"] ?? "6942");

export default {
  port,
  fetch: app.fetch,
};

console.log(`Server running on port ${port}`);
