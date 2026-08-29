import type { MiddlewareHandler } from "hono";
import { auth } from "../auth";
import { logger } from "../logger";

export type SessionVariables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export const sessionMiddleware: MiddlewareHandler<{
  Variables: SessionVariables;
}> = async (c, next) => {
  logger.info("[session] session lookup started", {
    method: c.req.method,
    url: c.req.url,
    hasCookie: Boolean(c.req.header("cookie")),
  });
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);

  logger.info("[session] session lookup finished", {
    url: c.req.url,
    authenticated: Boolean(session?.user),
    userId: session?.user.id ?? null,
  });

  await next();
};
