-- ============================================================
-- TTS audio cache bucket
--
-- The /api/tts route caches ElevenLabs output here, keyed by
-- sha256(version | voiceId | text). Repeated interviewer phrases
-- (intros, transitions, "take your time" prompts) are synthesized
-- once and then served from storage — cutting ElevenLabs spend and
-- softening ElevenLabs outages for known phrases.
--
-- Private bucket, NO storage.objects policies: only the service-role
-- client (which bypasses RLS) reads/writes it. Clients never touch
-- the bucket directly — audio is streamed through /api/tts.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('tts-cache', 'tts-cache', false)
ON CONFLICT (id) DO NOTHING;
