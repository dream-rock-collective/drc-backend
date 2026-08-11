import { Hono } from "hono";
import { cors } from "hono/cors";
import { adminRoute } from "./routes/admin";
import { healthRoute } from "./routes/health";
import { registrationsRoute } from "./routes/registrations";

const app = new Hono();
app.use(
  "/*",
  cors({
    origin:
      process.env.REGISTRATION_SITE_ORIGIN ?? "http://localhost:5173",
  }),
);
app.route("/", healthRoute);
app.route("/", registrationsRoute);
// Authentication should be added around this route before exposing it publicly.
app.route("/", adminRoute);

const port = 6942;

export default {
  port,
  fetch: app.fetch,
};

console.log(`Server running on port ${port}`);
