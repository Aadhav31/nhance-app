-- ═══════════════════════════════════════════════════════════════════════════
--  NHANCE IN-HOUSE CHAT
--  Tables: chat_channels, chat_members, chat_messages, chat_last_read
--  Storage bucket: chat-attachments  (see step at bottom)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Channels ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text,                        -- '#general', '#site-b' (null for DMs)
  description text,
  type        text        NOT NULL DEFAULT 'group',  -- 'group' | 'direct'
  created_by  uuid,
  is_archived boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_channels_company
  ON public.chat_channels(company_id, type);

-- ── 2. Channel members ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_members (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid        REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL,
  user_name  text,
  user_role  text,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_members_channel
  ON public.chat_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_user
  ON public.chat_members(user_id);

-- ── 3. Messages ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  uuid        REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  company_id  uuid        REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_id   uuid,
  sender_name text,
  sender_role text,
  content     text,                        -- plain text body (nullable if attachments-only)
  attachments jsonb       NOT NULL DEFAULT '[]',  -- [{name,type,size,url,path}]
  is_deleted  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created
  ON public.chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_company
  ON public.chat_messages(company_id);

-- ── 4. Last-read tracking (unread counts) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_last_read (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   uuid        REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_last_read ENABLE ROW LEVEL SECURITY;

-- chat_channels: company members can read/insert; only creator can update
CREATE POLICY "Company members can view channels"
  ON public.chat_channels FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "Company members can create channels"
  ON public.chat_channels FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "Creator can update channels"
  ON public.chat_channels FOR UPDATE
  USING (created_by = auth.uid());

-- chat_members: company members can read/insert their own rows
CREATE POLICY "Company members can view chat_members"
  ON public.chat_members FOR SELECT
  USING (channel_id IN (
    SELECT id FROM public.chat_channels WHERE company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Company members can join channels"
  ON public.chat_members FOR INSERT
  WITH CHECK (channel_id IN (
    SELECT id FROM public.chat_channels WHERE company_id IN (
      SELECT company_id FROM public.user_profiles WHERE id = auth.uid()
    )
  ));

-- chat_messages: company members can read/insert; sender can soft-delete
CREATE POLICY "Company members can read messages"
  ON public.chat_messages FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "Company members can send messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "Sender can soft-delete own messages"
  ON public.chat_messages FOR UPDATE
  USING (sender_id = auth.uid());

-- chat_last_read: users manage their own rows
CREATE POLICY "Users can read own last_read"
  ON public.chat_last_read FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can upsert own last_read"
  ON public.chat_last_read FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own last_read"
  ON public.chat_last_read FOR UPDATE
  USING (user_id = auth.uid());

-- ── Enable Realtime for chat_messages ─────────────────────────────────────────
-- Run this in Supabase dashboard → Database → Replication → Supabase Realtime
-- OR via SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- ── Storage bucket ────────────────────────────────────────────────────────────
-- Create in Supabase dashboard → Storage → New bucket
--   Name:   chat-attachments
--   Public: true  (URLs contain UUIDs — obscurity + internal-only access)
--   File size limit: 104857600  (100 MB)
--
-- OR via SQL (requires storage schema access):
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-attachments', 'chat-attachments', true, 104857600)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload chat files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "Public can read chat files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-attachments');

CREATE POLICY "Uploader can delete own chat files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-attachments' AND owner = auth.uid());

-- ── 5. WebRTC call signaling ──────────────────────────────────────────────────
-- Used for audio/video call setup (offer/answer/ICE exchange between peers)
-- Rows are short-lived — they exist only during call setup (~30s TTL)
CREATE TABLE IF NOT EXISTS public.chat_call_signals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  uuid        REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  company_id  uuid        REFERENCES public.companies(id) ON DELETE CASCADE,
  from_user   uuid        NOT NULL,
  to_user     uuid,                   -- null = broadcast to all channel members
  signal_type text        NOT NULL,   -- 'offer' | 'answer' | 'ice-candidate' | 'call-start' | 'call-end' | 'busy'
  payload     jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_call_signals_channel
  ON public.chat_call_signals(channel_id, created_at DESC);

ALTER TABLE public.chat_call_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can read call signals"
  ON public.chat_call_signals FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "Company members can insert call signals"
  ON public.chat_call_signals FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM public.user_profiles WHERE id = auth.uid()));

-- Enable realtime for call signals too
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_call_signals;

-- ── Default channels (run after table creation) ────────────────────────────────
-- These are seeded per-company by the app on first chat open.
-- No SQL needed here — handled in ChatPage.jsx seedDefaultChannels().
