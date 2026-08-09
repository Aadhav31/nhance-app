-- Migration 009: Add index on chat_call_signals.to_user
-- Without this index, Supabase Realtime filter `to_user=eq.{uuid}` silently fails.
-- We now use company_id filter + client-side to_user check, but the index
-- is still useful for direct queries and future use.

CREATE INDEX IF NOT EXISTS idx_chat_call_signals_to_user
  ON public.chat_call_signals (to_user);

CREATE INDEX IF NOT EXISTS idx_chat_call_signals_company_id
  ON public.chat_call_signals (company_id);

CREATE INDEX IF NOT EXISTS idx_chat_call_signals_channel_id
  ON public.chat_call_signals (channel_id);
