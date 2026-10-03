import type { VercelRequest, VercelResponse } from "@vercel/node"

const NUROEN_API_URL =
  "https://www.nuroen.ai/api/v1/agents/44a4b266-fba3-49af-8d67-9bceb0677495/invoke"

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const apiKey = process.env.NUROEN_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: "AI service is not configured." })
  }

  const { campaign_brief, campaign_input } = req.body ?? {}
  if (!campaign_brief) {
    return res.status(400).json({ error: "campaign_brief is required." })
  }

  try {
    const upstream = await fetch(NUROEN_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        campaign_brief,
        campaign_input: campaign_input ?? "",
      }),
    })

    const data = await upstream.json().catch(() => ({}))

    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .json({ error: (data as { error?: string }).error ?? "AI agent error." })
    }

    return res.status(200).json(data)
  } catch {
    return res.status(502).json({ error: "Could not reach the AI agent." })
  }
}
