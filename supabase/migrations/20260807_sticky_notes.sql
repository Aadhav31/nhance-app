-- ══════════════════════════════════════════════════════════════════════════
-- sticky_notes — per-user quick notes accessible from anywhere in the app
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sticky_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT,
  content     TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT 'yellow',  -- yellow | blue | green | pink | purple
  pinned      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sticky_notes_user
  ON sticky_notes(user_id, pinned DESC, updated_at DESC);

ALTER TABLE sticky_notes ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own notes
DROP POLICY IF EXISTS "own_notes" ON sticky_notes;
CREATE POLICY "own_notes"
ON sticky_notes FOR ALL
USING  (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
