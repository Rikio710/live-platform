-- ================================================
-- よく使う検索のインデックス（2026-10-12 Supabase の Disk IO 枯渇対策）
--   Query Performance の上位（公演ページのセトリ取得・同じツアーの公演一覧・アーティストページ等）で使う列。
--   すでに同じ列から始まるインデックスがあれば作らない（重複させない）
-- ================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('setlist_songs',       'submission_id',     'idx_setlist_songs_submission_id',     '(submission_id)'),
    ('setlist_songs',       'concert_id',        'idx_setlist_songs_concert_id',        '(concert_id)'),
    ('setlist_submissions', 'concert_id',        'idx_setlist_submissions_concert_id',  '(concert_id)'),
    ('concerts',            'tour_id',           'idx_concerts_tour_id',                '(tour_id, date)'),
    ('concerts',            'artist_id',         'idx_concerts_artist_id_date',         '(artist_id, date)'),
    ('concerts',            'venue_name',        'idx_concerts_venue_name',             '(venue_name, date)'),
    ('concerts',            'festival_event_id', 'idx_concerts_festival_event_id',      '(festival_event_id)'),
    ('concerts',            'date',              'idx_concerts_date',                   '(date)'),
    ('tour_artists',        'artist_id',         'idx_tour_artists_artist_id',          '(artist_id)'),
    ('tour_artists',        'tour_id',           'idx_tour_artists_tour_id',            '(tour_id)'),
    ('concert_artists',     'concert_id',        'idx_concert_artists_concert_id',      '(concert_id)'),
    ('concert_artists',     'artist_id',         'idx_concert_artists_artist_id',       '(artist_id)'),
    ('festival_events',     'group_id',          'idx_festival_events_group_id',        '(group_id)')
  ) AS t(tbl, col, idx, def)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
      WHERE i.indrelid = ('public.' || r.tbl)::regclass AND a.attname = r.col
    ) THEN
      EXECUTE format('CREATE INDEX %I ON public.%I %s', r.idx, r.tbl, r.def);
    END IF;
  END LOOP;
END $$;

-- 結果の確認（今回作ったものは idx_ で始まる名前）
SELECT tablename, indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('setlist_songs','setlist_submissions','concerts','tour_artists','concert_artists','festival_events')
ORDER BY tablename, indexname;
