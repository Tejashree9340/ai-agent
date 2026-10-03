import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// Enable logger
app.use("*", logger(console.log));

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

// Helper for authenticating users
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

// Helper for scoped user client (respects RLS)
const userSupabase = (authorization?: string) => {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: authorization ?? "" },
      },
    },
  );
};

// ==================== INSTAGRAM ANALYTICS ====================
const analyticsKey = (userId: string) => `instagram-analytics:${userId}`;

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

// ==================== CAMPAIGNS ====================
app.get("/make-server-87a9e5a4/campaigns", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const db = userSupabase(c.req.header("Authorization"));
  const { data, error } = await db
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ campaigns: data ?? [] });
});

app.post("/make-server-87a9e5a4/campaigns", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json();

  const db = userSupabase(c.req.header("Authorization"));
  const { data, error } = await db
    .from("campaigns")
    .insert({
      user_id: user.id,
      name: body.name ?? "New Campaign",
      product: body.product ?? "",
      goal: body.goal ?? "",
      budget: body.budget ?? "",
      audience: body.audience ?? "",
      location: body.location ?? "",
      platforms: body.platforms ?? "",
      requirements: body.requirements ?? "",
      status: "draft",
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ campaign: data });
});

app.put("/make-server-87a9e5a4/campaigns/:id", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const body = await c.req.json();

  const db = userSupabase(c.req.header("Authorization"));
  const { data, error } = await db
    .from("campaigns")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ campaign: data });
});

// ==================== PARTNERS ====================
app.get("/make-server-87a9e5a4/partners", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const db = userSupabase(c.req.header("Authorization"));
  const { data, error } = await db.from("partners").select("*");

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ partners: data ?? [] });
});

app.get("/make-server-87a9e5a4/partners/me", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const db = userSupabase(c.req.header("Authorization"));
  const { data, error } = await db
    .from("partners")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ partner: data });
});

app.post("/make-server-87a9e5a4/partners", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json();

  const db = userSupabase(c.req.header("Authorization"));
  const { data, error } = await db
    .from("partners")
    .upsert({
      user_id: user.id,
      name: body.name ?? "Partner Profile",
      subtitle: body.subtitle ?? "",
      type: body.type ?? "creator",
      location: body.location ?? "",
      bio: body.bio ?? "",
      ig_handle: body.ig_handle ?? "",
      budget_min: body.budget_min ?? 0,
      budget_max: body.budget_max ?? 0,
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ partner: data });
});

// ==================== MATCHES ====================
app.get("/make-server-87a9e5a4/campaigns/:id/matches", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const campaignId = c.req.param("id");
  const db = userSupabase(c.req.header("Authorization"));
  const { data, error } = await db
    .from("matches")
    .select("*, partner:partners(*)")
    .eq("campaign_id", campaignId);

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ matches: data ?? [] });
});

app.post("/make-server-87a9e5a4/campaigns/:id/matches", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const campaignId = c.req.param("id");
  const body = await c.req.json();

  const db = userSupabase(c.req.header("Authorization"));
  const { data, error } = await db
    .from("matches")
    .insert({
      campaign_id: campaignId,
      partner_id: body.partner_id ?? null,
      fit_score: body.fit_score ?? 90,
      ai_insight: body.ai_insight ?? "",
      status: "pending",
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ match: data });
});

// ==================== AGREEMENTS & DELIVERABLES ====================
app.get("/make-server-87a9e5a4/agreements/:id", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const db = userSupabase(c.req.header("Authorization"));
  const { data, error } = await db
    .from("agreements")
    .select("*, campaign:campaigns(*), partner:partners(*)")
    .eq("id", id)
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ agreement: data });
});

app.post("/make-server-87a9e5a4/campaigns/:id/agreement", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const campaignId = c.req.param("id");
  const body = await c.req.json();

  const db = userSupabase(c.req.header("Authorization"));
  const { data, error } = await db
    .from("agreements")
    .insert({
      campaign_id: campaignId,
      partner_id: body.partner_id,
      deliverables: body.deliverables ?? "2 Instagram Reels · 3 Stories",
      fee_total: body.fee_total ?? 70000,
      status: "draft",
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ agreement: data });
});

app.put("/make-server-87a9e5a4/agreements/:id/status", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const body = await c.req.json();

  const db = userSupabase(c.req.header("Authorization"));
  const { data, error } = await db
    .from("agreements")
    .update({ status: body.status })
    .eq("id", id)
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ agreement: data });
});

// ==================== MESSAGES (ROOM CHAT) ====================
app.get("/make-server-87a9e5a4/rooms/:id/messages", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const roomId = c.req.param("id");
  const db = userSupabase(c.req.header("Authorization"));
  const { data, error } = await db
    .from("messages")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ messages: data ?? [] });
});

app.post("/make-server-87a9e5a4/rooms/:id/messages", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const roomId = c.req.param("id");
  const body = await c.req.json();

  const senderName =
    user.user_metadata?.full_name ??
    user.email?.split("@")[0] ??
    "User";

  const db = userSupabase(c.req.header("Authorization"));
  const { data, error } = await db
    .from("messages")
    .insert({
      room_id: roomId,
      sender_id: user.id,
      sender_name: senderName,
      body: body.body ?? "",
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ message: data });
});

// ==================== APPROVALS ====================
app.get("/make-server-87a9e5a4/approvals", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const db = userSupabase(c.req.header("Authorization"));
  const { data, error } = await db
    .from("approvals")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ approvals: data ?? [] });
});

app.put("/make-server-87a9e5a4/approvals/:id", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const body = await c.req.json();

  const db = userSupabase(c.req.header("Authorization"));
  const { data, error } = await db
    .from("approvals")
    .update({ status: body.status })
    .eq("id", id)
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ approval: data });
});

// ==================== APPLICATIONS ====================
app.post("/make-server-87a9e5a4/campaigns/:id/apply", async (c) => {
  const user = await authenticatedUser(c.req.header("Authorization"));
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const campaignId = c.req.param("id");
  const body = await c.req.json();

  const db = userSupabase(c.req.header("Authorization"));
  const { data, error } = await db
    .from("applications")
    .insert({
      campaign_id: campaignId,
      partner_id: user.id,
      note: body.note ?? "",
      status: "pending",
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ application: data });
});

Deno.serve(app.fetch);
