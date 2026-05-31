-- ==========================================
-- Organizations / B2B Cohort Migration
-- Run this in the Supabase SQL Editor.
-- Powers the /org cohort analytics dashboard for companies & colleges.
-- ==========================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'company' CHECK (type IN ('company', 'college')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Postgres CREATE POLICY does not support IF NOT EXISTS, so guard with a DO block.
DO $$
BEGIN
  -- A member can see their own membership rows
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='organization_members' AND policyname='org_members_select_own') THEN
    CREATE POLICY "org_members_select_own" ON public.organization_members
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
  -- A member can see organizations they belong to
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='organizations' AND policyname='organizations_select_member') THEN
    CREATE POLICY "organizations_select_member" ON public.organizations
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.organization_members m
          WHERE m.org_id = organizations.id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- The service role bypasses RLS; the /org dashboard authorises the admin with the
-- user-context client first, then aggregates members' data with the service client.

-- ------------------------------------------------------------------
-- Manual setup example (replace the UUIDs/emails):
--
-- INSERT INTO public.organizations (name, type) VALUES ('Acme College', 'college')
--   RETURNING id;  -- note the returned org id
--
-- -- Make a user the admin:
-- INSERT INTO public.organization_members (org_id, user_id, role)
-- VALUES ('<org-id>', (SELECT id FROM public.users WHERE email = 'admin@acme.edu'), 'admin');
--
-- -- Add members:
-- INSERT INTO public.organization_members (org_id, user_id, role)
-- SELECT '<org-id>', id, 'member' FROM public.users WHERE email IN ('s1@acme.edu', 's2@acme.edu');
-- ------------------------------------------------------------------
