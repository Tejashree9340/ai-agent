-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  product TEXT NOT NULL,
  goal TEXT NOT NULL,
  budget TEXT NOT NULL,
  audience TEXT NOT NULL,
  location TEXT NOT NULL,
  platforms TEXT NOT NULL,
  requirements TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Partners (Creator & Agency Profiles)
CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'creator',
  location TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  ig_handle TEXT DEFAULT '',
  budget_min NUMERIC DEFAULT 0,
  budget_max NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Matches
CREATE TABLE IF NOT EXISTS public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  fit_score INT NOT NULL DEFAULT 90,
  ai_insight TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Agreements
CREATE TABLE IF NOT EXISTS public.agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  deliverables TEXT NOT NULL,
  deadline DATE,
  fee_total NUMERIC NOT NULL DEFAULT 0,
  escrow_funded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Deliverables
CREATE TABLE IF NOT EXISTS public.deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES public.agreements(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'not_started',
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Messages (Partnership Room Chat)
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.agreements(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Payments
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES public.agreements(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Approvals (Governance & Oversight)
CREATE TABLE IF NOT EXISTS public.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES public.agreements(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'deliverable',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Applications (Creator applying to campaign)
CREATE TABLE IF NOT EXISTS public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row Level Security (RLS)
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Campaigns
CREATE POLICY "Business can manage own campaigns" ON public.campaigns
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "All authenticated users can view active campaigns" ON public.campaigns
  FOR SELECT USING (auth.role() = 'authenticated');

-- Partners
CREATE POLICY "Users can manage own partner profile" ON public.partners
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can view partner profiles" ON public.partners
  FOR SELECT USING (auth.role() = 'authenticated');

-- Matches
CREATE POLICY "Authenticated users can view matches" ON public.matches
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Campaign owners can insert/update matches" ON public.matches
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = matches.campaign_id AND campaigns.user_id = auth.uid()
    )
  );

-- Agreements
CREATE POLICY "Participants can view and manage agreements" ON public.agreements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.campaigns WHERE campaigns.id = agreements.campaign_id AND campaigns.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.partners WHERE partners.id = agreements.partner_id AND partners.user_id = auth.uid()
    )
  );

-- Deliverables
CREATE POLICY "Agreement participants can manage deliverables" ON public.deliverables
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.agreements
      JOIN public.campaigns ON campaigns.id = agreements.campaign_id
      LEFT JOIN public.partners ON partners.id = agreements.partner_id
      WHERE agreements.id = deliverables.agreement_id
      AND (campaigns.user_id = auth.uid() OR partners.user_id = auth.uid())
    )
  );

-- Messages
CREATE POLICY "Agreement participants can manage messages" ON public.messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.agreements
      JOIN public.campaigns ON campaigns.id = agreements.campaign_id
      LEFT JOIN public.partners ON partners.id = agreements.partner_id
      WHERE agreements.id = messages.room_id
      AND (campaigns.user_id = auth.uid() OR partners.user_id = auth.uid())
    )
  );

-- Payments
CREATE POLICY "Agreement participants can manage payments" ON public.payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.agreements
      JOIN public.campaigns ON campaigns.id = agreements.campaign_id
      LEFT JOIN public.partners ON partners.id = agreements.partner_id
      WHERE agreements.id = payments.agreement_id
      AND (campaigns.user_id = auth.uid() OR partners.user_id = auth.uid())
    )
  );

-- Approvals
CREATE POLICY "Agreement participants can manage approvals" ON public.approvals
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.agreements
      JOIN public.campaigns ON campaigns.id = agreements.campaign_id
      LEFT JOIN public.partners ON partners.id = agreements.partner_id
      WHERE agreements.id = approvals.agreement_id
      AND (campaigns.user_id = auth.uid() OR partners.user_id = auth.uid())
    )
  );

-- Applications
CREATE POLICY "Partners can manage own applications" ON public.applications
  FOR ALL USING (auth.uid() = partner_id);
CREATE POLICY "Campaign owners can view applications" ON public.applications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE campaigns.id = applications.campaign_id AND campaigns.user_id = auth.uid()
    )
  );

-- Indexes for foreign keys
CREATE INDEX IF NOT EXISTS idx_campaigns_user ON public.campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_campaign ON public.matches(campaign_id);
CREATE INDEX IF NOT EXISTS idx_agreements_campaign ON public.agreements(campaign_id);
CREATE INDEX IF NOT EXISTS idx_agreements_partner ON public.agreements(partner_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_agreement ON public.deliverables(agreement_id);
CREATE INDEX IF NOT EXISTS idx_messages_room ON public.messages(room_id);
CREATE INDEX IF NOT EXISTS idx_payments_agreement ON public.payments(agreement_id);
CREATE INDEX IF NOT EXISTS idx_approvals_agreement ON public.approvals(agreement_id);
CREATE INDEX IF NOT EXISTS idx_applications_campaign ON public.applications(campaign_id);
