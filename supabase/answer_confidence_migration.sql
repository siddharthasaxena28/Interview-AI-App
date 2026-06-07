-- Persists the per-answer delivery signal (filler-word density classification)
-- already computed client-side by analyzeAnswerConfidence() and sent to
-- evaluate-answer as `answer_confidence`. Previously this was used only to
-- color the AI's spoken tone mid-interview and then discarded — the final
-- feedback report's communication metrics had to re-guess confidence/filler
-- levels from truncated transcript snippets instead of using measured data.
ALTER TABLE public.answers
  ADD COLUMN IF NOT EXISTS confidence text CHECK (confidence IN ('confident', 'hesitant'));
