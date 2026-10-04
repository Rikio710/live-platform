-- ================================================
-- 記事（/articles）
--   type = 'data'      : LiveVault のセトリデータから自動集計する記事（定番曲ランキング等）
--   type = 'editorial' : 他サイト・公式情報を参考に手で書く記事
-- ================================================

CREATE TABLE IF NOT EXISTS articles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  category        text NOT NULL DEFAULT 'standard-songs',
  type            text NOT NULL DEFAULT 'data' CHECK (type IN ('data', 'editorial')),
  title           text NOT NULL,
  description     text,                              -- meta description / 一覧カードの説明
  lead            text,                              -- 導入文（プレーンテキスト、改行可）
  body            text,                              -- 自由本文（プレーンテキスト、改行可）
  artist_id       uuid REFERENCES artists(id) ON DELETE SET NULL,
  tour_id         uuid REFERENCES tours(id) ON DELETE SET NULL,
  song_notes      jsonb NOT NULL DEFAULT '{}'::jsonb, -- { "曲名": "解説" }
  faq             jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{ "q": "...", "a": "..." }]（自動FAQに追加）
  sources         jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{ "title": "...", "url": "..." }]
  cover_image_url text,                              -- 未設定ならアーティスト画像
  is_featured     boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_articles_status_published ON articles (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles (category, status);
CREATE INDEX IF NOT EXISTS idx_articles_artist ON articles (artist_id);

-- 公開済みの記事だけ誰でも読める。書き込みは service role（管理画面のサーバー処理）のみ
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "articles_public_read" ON articles;
CREATE POLICY "articles_public_read" ON articles
  FOR SELECT USING (status = 'published');
