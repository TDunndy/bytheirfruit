-- PHASE 2 MIGRATION — Payments, Rate Limiting, Abuse Prevention
-- Run in Supabase SQL Editor
-- ================================================================

-- 1. PAYMENTS TABLE — Track Stripe payment events
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_session_id TEXT,
  customer_email TEXT,
  amount_cents INT,
  currency TEXT DEFAULT 'usd',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  event_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all payments" ON payments FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);
CREATE POLICY "Users can view own payments" ON payments FOR SELECT USING (user_id = auth.uid());
-- Webhook inserts use service_role key (bypasses RLS)

-- 2. ADD PAYMENT COLUMNS TO CLAIM_REQUESTS
ALTER TABLE claim_requests ADD COLUMN IF NOT EXISTS payment_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE claim_requests ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- 3. DAILY REVIEW RATE LIMIT — Enforced at database level
-- Function to check if a user has exceeded their daily review limit
CREATE OR REPLACE FUNCTION check_review_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  daily_count INT;
  user_status TEXT;
  user_suspended BOOLEAN;
BEGIN
  -- Check if user is suspended
  SELECT status, review_suspended INTO user_status, user_suspended
  FROM profiles WHERE id = NEW.user_id;

  IF user_status = 'banned' THEN
    RAISE EXCEPTION 'Your account has been banned.';
  END IF;

  IF user_status = 'suspended' OR user_suspended = TRUE THEN
    RAISE EXCEPTION 'Your reviewing ability has been temporarily paused.';
  END IF;

  -- Count reviews submitted today by this user
  SELECT COUNT(*) INTO daily_count
  FROM reviews
  WHERE user_id = NEW.user_id
    AND created_at >= CURRENT_DATE
    AND created_at < CURRENT_DATE + INTERVAL '1 day';

  IF daily_count >= 3 THEN
    RAISE EXCEPTION 'Daily review limit reached. You can submit up to 3 reviews per day.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_review_rate_limit ON reviews;
CREATE TRIGGER enforce_review_rate_limit
  BEFORE INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION check_review_rate_limit();

-- 4. DUPLICATE DETECTION — Prevent same user reviewing same church (already exists via UNIQUE constraint)
-- The UNIQUE(church_id, user_id) on reviews table already handles this.
-- Adding an index for faster lookups:
CREATE INDEX IF NOT EXISTS idx_reviews_user_date ON reviews (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_church_user ON reviews (church_id, user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments (user_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription ON payments (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_claim_requests_user_status ON claim_requests (user_id, status);

-- 5. REVIEW CONTENT VALIDATION — Prevent empty/spam reviews at DB level
CREATE OR REPLACE FUNCTION validate_review_content()
RETURNS TRIGGER AS $$
BEGIN
  -- Minimum text length
  IF LENGTH(TRIM(NEW.text)) < 20 THEN
    RAISE EXCEPTION 'Review must be at least 20 characters long.';
  END IF;

  -- At least 3 score fields must be filled
  IF (
    (CASE WHEN NEW.score_teaching IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW.score_welcome IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW.score_community IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW.score_worship IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW.score_prayer IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW.score_kids IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW.score_youth IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW.score_leadership IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW.score_service IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NEW.score_finances IS NOT NULL THEN 1 ELSE 0 END)
  ) < 3 THEN
    RAISE EXCEPTION 'Please rate at least 3 categories.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS validate_review ON reviews;
CREATE TRIGGER validate_review
  BEFORE INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION validate_review_content();
