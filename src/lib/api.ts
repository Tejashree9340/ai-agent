import { projectId } from "../../utils/supabase/info"
import { supabase } from "./supabase"

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-87a9e5a4`

export type Campaign = {
  id: string
  user_id: string
  name: string
  product: string
  goal: string
  budget: string
  audience: string
  location: string
  platforms: string
  requirements: string
  status: "draft" | "active" | "completed"
  created_at: string
}

export type Partner = {
  id: string
  user_id: string
  name: string
  subtitle: string
  type: "creator" | "agency"
  location?: string
  bio?: string
  ig_handle?: string
  budget_min?: number
  budget_max?: number
  created_at: string
}

export type MatchItem = {
  id: string
  campaign_id: string
  partner_id?: string
  fit_score: number
  ai_insight: string
  status: "pending" | "selected" | "rejected"
  created_at: string
  partner?: Partner
}

export type Agreement = {
  id: string
  campaign_id: string
  partner_id: string
  status: "draft" | "sent" | "accepted" | "active" | "completed"
  deliverables: string
  deadline?: string
  fee_total: number
  escrow_funded: boolean
  created_at: string
  campaign?: Campaign
  partner?: Partner
}

export type RoomMessage = {
  id: string
  room_id: string
  sender_id: string
  sender_name: string
  body: string
  created_at: string
}

export type ApprovalItem = {
  id: string
  agreement_id: string
  type: string
  title: string
  description: string
  status: "pending" | "approved" | "rejected"
  created_at: string
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error("Not authenticated")
  return {
    Authorization: `Bearer ${data.session.access_token}`,
    "Content-Type": "application/json",
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers = await authHeaders()
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      (json as { error?: string }).error ?? "API request failed.",
    )
  }
  return json as T
}

// Campaign API
export async function getCampaigns(): Promise<Campaign[]> {
  const res = await request<{ campaigns: Campaign[] }>("GET", "/campaigns")
  return res.campaigns
}

export async function createCampaign(
  payload: Partial<Campaign>,
): Promise<Campaign> {
  const res = await request<{ campaign: Campaign }>(
    "POST",
    "/campaigns",
    payload,
  )
  return res.campaign
}

// Partner API
export async function getPartners(): Promise<Partner[]> {
  const res = await request<{ partners: Partner[] }>("GET", "/partners")
  return res.partners
}

export async function getMyPartner(): Promise<Partner | null> {
  const res = await request<{ partner: Partner | null }>("GET", "/partners/me")
  return res.partner
}

export async function savePartner(
  payload: Partial<Partner>,
): Promise<Partner> {
  const res = await request<{ partner: Partner }>("POST", "/partners", payload)
  return res.partner
}

// Matches API
export async function getMatches(campaignId: string): Promise<MatchItem[]> {
  const res = await request<{ matches: MatchItem[] }>(
    "GET",
    `/campaigns/${campaignId}/matches`,
  )
  return res.matches
}

export async function saveMatch(
  campaignId: string,
  payload: { partner_id?: string; fit_score?: number; ai_insight?: string },
): Promise<MatchItem> {
  const res = await request<{ match: MatchItem }>(
    "POST",
    `/campaigns/${campaignId}/matches`,
    payload,
  )
  return res.match
}

// Messages API
export async function getRoomMessages(roomId: string): Promise<RoomMessage[]> {
  const res = await request<{ messages: RoomMessage[] }>(
    "GET",
    `/rooms/${roomId}/messages`,
  )
  return res.messages
}

export async function sendRoomMessage(
  roomId: string,
  body: string,
): Promise<RoomMessage> {
  const res = await request<{ message: RoomMessage }>(
    "POST",
    `/rooms/${roomId}/messages`,
    { body },
  )
  return res.message
}

// Approvals API
export async function getApprovals(): Promise<ApprovalItem[]> {
  const res = await request<{ approvals: ApprovalItem[] }>("GET", "/approvals")
  return res.approvals
}

export async function updateApproval(
  id: string,
  status: "approved" | "rejected",
): Promise<ApprovalItem> {
  const res = await request<{ approval: ApprovalItem }>(
    "PUT",
    `/approvals/${id}`,
    { status },
  )
  return res.approval
}

// Applications API
export async function applyToCampaign(
  campaignId: string,
  note: string,
): Promise<unknown> {
  return request("POST", `/campaigns/${campaignId}/apply`, { note })
}
