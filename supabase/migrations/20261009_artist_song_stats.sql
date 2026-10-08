-- ================================================
-- セトリ分析（定番曲ランキング）の集計結果を保存する
--   アーティストページの「セトリ分析」と定番曲記事は、ここに保存した結果を読むだけにする
--   （毎回全セトリを集計すると重く、2026-10 の一括取り込み後に大物アーティストのページが表示できなくなったため）
--   月1回 GitHub Actions（.github/workflows/song-stats.yml）から /api/cron/song-stats を呼んで更新する
--   data が null = セトリがなく集計結果なし
-- ================================================
CREATE TABLE IF NOT EXISTS artist_song_stats (
  artist_id    uuid PRIMARY KEY REFERENCES artists(id) ON DELETE CASCADE,
  data         jsonb,
  computed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_artist_song_stats_computed ON artist_song_stats (computed_at);

-- 誰でも読める。書き込みは service role（集計処理）のみ
ALTER TABLE artist_song_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "artist_song_stats_public_read" ON artist_song_stats;
CREATE POLICY "artist_song_stats_public_read" ON artist_song_stats FOR SELECT USING (true);
