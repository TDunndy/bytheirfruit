-- BY THEIR FRUIT â€” Database Schema
-- Run this in Supabase SQL Editor (SQL Editor tab in dashboard)
-- ================================================================

-- Profiles (extends Supabase Auth)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  provider TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin', 'church_admin')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  review_suspended BOOLEAN DEFAULT FALSE,
  suspension_reason TEXT
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, provider)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Churches
CREATE TABLE churches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'FL',
  zip TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  denomination TEXT DEFAULT 'Non-Denominational',
  size TEXT,
  service_style TEXT,
  service_times TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('seed', 'google', 'manual')),
  added_by UUID REFERENCES profiles(id),
  claimed_by UUID REFERENCES profiles(id),
  claimed_at TIMESTAMPTZ,
  score_teaching DECIMAL,
  score_welcome DECIMAL,
  score_community DECIMAL,
  score_worship DECIMAL,
  score_prayer DECIMAL,
  score_kids DECIMAL,
  score_youth DECIMAL,
  score_leadership DECIMAL,
  score_service DECIMAL,
  score_finances DECIMAL,
  score_overall DECIMAL,
  total_reviews INT DEFAULT 0,
  scores_updated_at TIMESTAMPTZ,
  -- Owner dashboard fields
  service_days JSONB,
  avg_attendance INT,
  staff_count INT,
  volunteer_count INT,
  campus_count INT,
  programs TEXT[],
  facebook_url TEXT,
  instagram_url TEXT,
  youtube_url TEXT,
  livestream_url TEXT,
  pastor_name TEXT,
  year_founded INT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE churches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Churches are viewable by everyone" ON churches FOR SELECT USING (true);
CREATE POLICY "Authenticated users can add churches" ON churches FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can update churches" ON churches FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
  OR claimed_by = auth.uid()
);

-- Reviews (1 per user per church)
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID REFERENCES churches(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reviewer_role TEXT NOT NULL,
  text TEXT NOT NULL,
  score_teaching INT CHECK (score_teaching BETWEEN 1 AND 5),
  score_welcome INT CHECK (score_welcome BETWEEN 1 AND 5),
  score_community INT CHECK (score_community BETWEEN 1 AND 5),
  score_worship INT CHECK (score_worship BETWEEN 1 AND 5),
  score_prayer INT CHECK (score_prayer BETWEEN 1 AND 5),
  score_kids INT CHECK (score_kids BETWEEN 1 AND 5),
  score_youth INT CHECK (score_youth BETWEEN 1 AND 5),
  score_leadership INT CHECK (score_leadership BETWEEN 1 AND 5),
  score_service INT CHECK (score_service BETWEEN 1 AND 5),
  score_finances INT CHECK (score_finances BETWEEN 1 AND 5),
  comment_teaching TEXT,
  comment_welcome TEXT,
  comment_community TEXT,
  comment_worship TEXT,
  comment_prayer TEXT,
  comment_kids TEXT,
  comment_youth TEXT,
  comment_leadership TEXT,
  comment_service TEXT,
  comment_finances TEXT,
  status TEXT DEFAULT 'published' CHECK (status IN ('pending', 'published', 'flagged', 'removed')),
  flag_count INT DEFAULT 0,
  ai_moderation JSONB,
  ai_summary TEXT,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(church_id, user_id)
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published reviews are viewable" ON reviews FOR SELECT USING (status = 'published' OR user_id = auth.uid());
CREATE POLICY "Users can insert own review" ON reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own review after 7 days" ON reviews FOR UPDATE USING (
  auth.uid() = user_id AND created_at < NOW() - INTERVAL '7 days'
);

-- Review flags
CREATE TABLE review_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID REFERENCES reviews(id) ON DELETE CASCADE NOT NULL,
  flagged_by UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('inappropriate', 'spam', 'personal_attack', 'fake', 'other')),
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(review_id, flagged_by)
);

ALTER TABLE review_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can flag reviews" ON review_flags FOR INSERT WITH CHECK (auth.uid() = flagged_by);

-- Church claim requests
CREATE TABLE claim_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID REFERENCES churches(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT NOT NULL,
  role_at_church TEXT NOT NULL,
  work_email TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(church_id, user_id)
);

ALTER TABLE claim_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own claims" ON claim_requests FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can submit claims" ON claim_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all claims" ON claim_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);
CREATE POLICY "Admins can update claims" ON claim_requests FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'moderator'))
);

-- User favorites (saved churches)
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  church_id UUID REFERENCES churches(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, church_id)
);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own favorites" ON favorites FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can add favorites" ON favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove favorites" ON favorites FOR DELETE USING (auth.uid() = user_id);

-- Church responses
CREATE TABLE church_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID REFERENCES reviews(id) ON DELETE CASCADE NOT NULL,
  church_id UUID REFERENCES churches(id) ON DELETE CASCADE NOT NULL,
  responder_id UUID REFERENCES profiles(id) NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE church_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Responses are viewable" ON church_responses FOR SELECT USING (true);
CREATE POLICY "Church admins can respond" ON church_responses FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM churches WHERE id = church_id AND claimed_by = auth.uid())
);

-- Saturday score recalculation
CREATE OR REPLACE FUNCTION recalculate_church_scores()
RETURNS void AS $$
BEGIN
  UPDATE churches c SET
    score_teaching = sub.avg_teaching,
    score_welcome = sub.avg_welcome,
    score_community = sub.avg_community,
    score_worship = sub.avg_worship,
    score_prayer = sub.avg_prayer,
    score_kids = sub.avg_kids,
    score_youth = sub.avg_youth,
    score_leadership = sub.avg_leadership,
    score_service = sub.avg_service,
    score_finances = sub.avg_finances,
    score_overall = (
      COALESCE(sub.avg_teaching, 0) + COALESCE(sub.avg_welcome, 0) + COALESCE(sub.avg_community, 0) +
      COALESCE(sub.avg_worship, 0) + COALESCE(sub.avg_prayer, 0) + COALESCE(sub.avg_kids, 0) +
      COALESCE(sub.avg_youth, 0) + COALESCE(sub.avg_leadership, 0) + COALESCE(sub.avg_service, 0) +
      COALESCE(sub.avg_finances, 0)
    ) / NULLIF(
      (CASE WHEN sub.avg_teaching IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_welcome IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_community IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_worship IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_prayer IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_kids IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_youth IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_leadership IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_service IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_finances IS NOT NULL THEN 1 ELSE 0 END)
    , 0),
    total_reviews = sub.cnt,
    scores_updated_at = NOW()
  FROM (
    SELECT
      church_id,
      COUNT(*) as cnt,
      AVG(score_teaching) as avg_teaching,
      AVG(score_welcome) as avg_welcome,
      AVG(score_community) as avg_community,
      AVG(score_worship) as avg_worship,
      AVG(score_prayer) as avg_prayer,
      AVG(score_kids) as avg_kids,
      AVG(score_youth) as avg_youth,
      AVG(score_leadership) as avg_leadership,
      AVG(score_service) as avg_service,
      AVG(score_finances) as avg_finances
    FROM reviews
    WHERE status = 'published'
    GROUP BY church_id
  ) sub
  WHERE c.id = sub.church_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-increment flag count
CREATE OR REPLACE FUNCTION increment_flag_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE reviews SET flag_count = flag_count + 1 WHERE id = NEW.review_id;
  UPDATE reviews SET status = 'flagged' WHERE id = NEW.review_id AND flag_count >= 3;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_review_flagged
  AFTER INSERT ON review_flags
  FOR EACH ROW EXECUTE FUNCTION increment_flag_count();

-- Auto-recalculate church scores when reviews change
CREATE OR REPLACE FUNCTION recalculate_single_church_scores()
RETURNS TRIGGER AS $$
DECLARE
  target_church_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_church_id := OLD.church_id;
  ELSE
    target_church_id := NEW.church_id;
  END IF;

  UPDATE churches c SET
    score_teaching = sub.avg_teaching,
    score_welcome = sub.avg_welcome,
    score_community = sub.avg_community,
    score_worship = sub.avg_worship,
    score_prayer = sub.avg_prayer,
    score_kids = sub.avg_kids,
    score_youth = sub.avg_youth,
    score_leadership = sub.avg_leadership,
    score_service = sub.avg_service,
    score_finances = sub.avg_finances,
    score_overall = (
      COALESCE(sub.avg_teaching, 0) + COALESCE(sub.avg_welcome, 0) + COALESCE(sub.avg_community, 0) +
      COALESCE(sub.avg_worship, 0) + COALESCE(sub.avg_prayer, 0) + COALESCE(sub.avg_kids, 0) +
      COALESCE(sub.avg_youth, 0) + COALESCE(sub.avg_leadership, 0) + COALESCE(sub.avg_service, 0) +
      COALESCE(sub.avg_finances, 0)
    ) / NULLIF(
      (CASE WHEN sub.avg_teaching IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_welcome IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_community IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_worship IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_prayer IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_kids IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_youth IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_leadership IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_service IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN sub.avg_finances IS NOT NULL THEN 1 ELSE 0 END)
    , 0),
    total_reviews = sub.cnt,
    scores_updated_at = NOW()
  FROM (
    SELECT
      church_id,
      COUNT(*) as cnt,
      AVG(score_teaching) as avg_teaching,
      AVG(score_welcome) as avg_welcome,
      AVG(score_community) as avg_community,
      AVG(score_worship) as avg_worship,
      AVG(score_prayer) as avg_prayer,
      AVG(score_kids) as avg_kids,
      AVG(score_youth) as avg_youth,
      AVG(score_leadership) as avg_leadership,
      AVG(score_service) as avg_service,
      AVG(score_finances) as avg_finances
    FROM reviews
    WHERE status = 'published' AND church_id = target_church_id
    GROUP BY church_id
  ) sub
  WHERE c.id = sub.church_id;

  IF NOT FOUND THEN
    UPDATE churches SET
      score_teaching = NULL, score_welcome = NULL, score_community = NULL,
      score_worship = NULL, score_prayer = NULL, score_kids = NULL,
      score_youth = NULL, score_leadership = NULL, score_service = NULL,
      score_finances = NULL, score_overall = NULL,
      total_reviews = 0, scores_updated_at = NOW()
    WHERE id = target_church_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_review_score_update ON reviews;
CREATE TRIGGER on_review_score_update
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION recalculate_single_church_scores();
