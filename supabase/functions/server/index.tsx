import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";
const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-87a9e5a4/health", (c) => {
  return c.json({ status: "ok" });
});

const analyticsKey = (userId: string) => `instagram-analytics:${userId}`;

const authenticatedUser = async (authorization?: string) => {
  const accessToken = authorization?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return null;
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await client.auth.getUser(accessToken);
  return error ? null : data.user;
};

app.get("/make-server-87a9e5a4/instagram-analytics", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const analytics = await kv.get(analyticsKey(user.id));
  return c.json({ analytics: analytics ?? null });
});

app.post("/make-server-87a9e5a4/instagram-analytics", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const metrics = body?.metrics ?? {};
  const allowedMetrics = [
    "followers",
    "reach",
    "impressions",
    "accountsEngaged",
    "totalInteractions",
    "profileViews",
    "websiteClicks",
  ];
  const normalizedMetrics: Record<string, number> = {};

  for (const metric of allowedMetrics) {
    if (metrics[metric] === undefined || metrics[metric] === "") continue;
    const value = Number(metrics[metric]);
    if (!Number.isFinite(value) || value < 0) {
      return c.json({ error: `Invalid value for ${metric}` }, 400);
    }
    normalizedMetrics[metric] = value;
  }

  if (
    !body?.username ||
    !body?.periodStart ||
    !body?.periodEnd ||
    Object.keys(normalizedMetrics).length === 0
  ) {
    return c.json(
      {
        error:
          "Username, periodStart, periodEnd and at least one metric are required",
      },
      400,
    );
  }

  const periodStart = new Date(body.periodStart);
  const periodEnd = new Date(body.periodEnd);
  if (
    Number.isNaN(periodStart.getTime()) ||
    Number.isNaN(periodEnd.getTime()) ||
    periodStart > periodEnd
  ) {
    return c.json({ error: "Invalid reporting period" }, 400);
  }

  const analytics = {
    username: String(body.username).replace(/^@/, "").slice(0, 100),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    sourceFile: String(body.sourceFile ?? "Instagram Insights export").slice(
      0,
      200,
    ),
    importedAt: new Date().toISOString(),
    metrics: normalizedMetrics,
  };

  await kv.set(analyticsKey(user.id), analytics);
  return c.json({ analytics });
});

app.delete("/make-server-87a9e5a4/instagram-analytics", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  await kv.del(analyticsKey(user.id));
  return c.json({ deleted: true });
});

Deno.serve(app.fetch);
