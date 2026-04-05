-- ================================================
-- LiveVault データベーススキーマ
-- Supabase SQL Editorで実行してください
-- ================================================

-- アーティスト
CREATE TABLE artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  image_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ツアー
CREATE TABLE tours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 公演
CREATE TABLE concerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID REFERENCES tours(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  venue_name TEXT NOT NULL,
  venue_address TEXT,
  date DATE NOT NULL,
  start_time TIME,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ユーザープロフィール
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  avatar_url TEXT,
  show_spoilers BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 参戦登録
CREATE TABLE attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concert_id UUID NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, concert_id)
);

-- 掲示板投稿
CREATE TABLE board_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id UUID NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_spoiler BOOLEAN DEFAULT FALSE,
  likes_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 掲示板いいね
CREATE TABLE post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- 通報
CREATE TABLE post_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT DEFAULT 'user_report',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- 物販情報
CREATE TABLE merch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id UUID NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold_out')),
  wait_minutes INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- セットリスト
CREATE TABLE setlist_songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id UUID NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_name TEXT NOT NULL,
  order_num INT DEFAULT 99,
  is_encore BOOLEAN DEFAULT FALSE,
  votes_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- セトリいいね
CREATE TABLE setlist_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id UUID NOT NULL REFERENCES setlist_songs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(song_id, user_id)
);

-- ================================================
-- RLS (Row Level Security) 設定
-- ================================================

ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE tours ENABLE ROW LEVEL SECURITY;
ALTER TABLE concerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE merch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE setlist_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE setlist_votes ENABLE ROW LEVEL SECURITY;

-- 閲覧は全員OK
CREATE POLICY "artists_read" ON artists FOR SELECT USING (true);
CREATE POLICY "tours_read" ON tours FOR SELECT USING (true);
CREATE POLICY "concerts_read" ON concerts FOR SELECT USING (true);
CREATE POLICY "board_posts_read" ON board_posts FOR SELECT USING (true);
CREATE POLICY "merch_items_read" ON merch_items FOR SELECT USING (true);
CREATE POLICY "setlist_songs_read" ON setlist_songs FOR SELECT USING (true);
CREATE POLICY "setlist_votes_read" ON setlist_votes FOR SELECT USING (true);
CREATE POLICY "post_likes_read" ON post_likes FOR SELECT USING (true);

-- 投稿・参戦登録はログインユーザーのみ
CREATE POLICY "attendances_read" ON attendances FOR SELECT USING (true);
CREATE POLICY "attendances_insert" ON attendances FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "attendances_delete" ON attendances FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "board_posts_insert" ON board_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "post_likes_insert" ON post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "post_likes_delete" ON post_likes FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "post_reports_insert" ON post_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "merch_items_insert" ON merch_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "setlist_songs_insert" ON setlist_songs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "setlist_votes_insert" ON setlist_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "setlist_votes_delete" ON setlist_votes FOR DELETE USING (auth.uid() = user_id);

-- プロフィールは本人のみ編集
CREATE POLICY "profiles_read" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- ================================================
-- いいね数更新のRPC関数
-- ================================================

CREATE OR REPLACE FUNCTION increment_likes(post_id UUID)
RETURNS void AS $$
  UPDATE board_posts SET likes_count = likes_count + 1 WHERE id = post_id;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_likes(post_id UUID)
RETURNS void AS $$
  UPDATE board_posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = post_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- ================================================
-- 新規ユーザー登録時にprofileを自動作成
-- ================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ================================================
-- ダミーデータ（開発用）
-- ================================================

INSERT INTO artists (id, name, description) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'Aimer', 'フランス生まれ日本育ち。ハスキーな歌声が魅力のアーティスト。'),
  ('a2222222-2222-2222-2222-222222222222', '米津玄師', '鬼才・アーティスト。圧倒的な表現力で知られる。'),
  ('a3333333-3333-3333-3333-333333333333', 'YOASOBI', 'ボーカルikura、コンポーザーAyaseによるユニット。');

INSERT INTO tours (id, artist_id, name, start_date, end_date) VALUES
  ('t1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Aimer Live Tour 2026 "Flare"', '2026-07-01', '2026-08-30'),
  ('t2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', '米津玄師 2026 TOUR / 海嘯', '2026-09-01', '2026-10-31'),
  ('t3333333-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333', 'YOASOBI ARENA TOUR 2026', '2026-06-01', '2026-07-31');

INSERT INTO concerts (id, tour_id, artist_id, venue_name, venue_address, date, start_time) VALUES
  ('c1111111-1111-1111-1111-111111111111', 't1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', '東京ガーデンシアター', '東京都江東区', '2026-07-15', '18:30:00'),
  ('c2222222-2222-2222-2222-222222222222', 't1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', '大阪城ホール', '大阪府大阪市中央区', '2026-07-22', '18:00:00'),
  ('c3333333-3333-3333-3333-333333333333', 't2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'さいたまスーパーアリーナ', '埼玉県さいたま市中央区', '2026-09-20', '18:00:00'),
  ('c4444444-4444-4444-4444-444444444444', 't3333333-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333', '横浜アリーナ', '神奈川県横浜市', '2026-06-28', '17:30:00');
