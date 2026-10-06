-- ================================================
-- データの出どころの印（LiveFans 一括取り込みと既存データを区別する）
--   data_source:
--     'existing'        … 一括取り込み（2026-10）より前からあったデータ
--     'livefans_import' … LiveFans 一括取り込みで作ったデータ
--     'livevault'       … 今後、サイト上の通常の操作（投稿・管理画面・自動取得）で作られるデータ（既定値）
--   import_batch / imported_at: 一括取り込みの回（例 '2026-10-livefans-2024'）と日時
-- ================================================

-- ツアー
ALTER TABLE tours ADD COLUMN IF NOT EXISTS data_source text;
ALTER TABLE tours ADD COLUMN IF NOT EXISTS import_batch text;
ALTER TABLE tours ADD COLUMN IF NOT EXISTS imported_at timestamptz;
UPDATE tours SET data_source = 'existing' WHERE data_source IS NULL;
ALTER TABLE tours ALTER COLUMN data_source SET DEFAULT 'livevault';

-- 公演
ALTER TABLE concerts ADD COLUMN IF NOT EXISTS data_source text;
ALTER TABLE concerts ADD COLUMN IF NOT EXISTS import_batch text;
ALTER TABLE concerts ADD COLUMN IF NOT EXISTS imported_at timestamptz;
UPDATE concerts SET data_source = 'existing' WHERE data_source IS NULL;
ALTER TABLE concerts ALTER COLUMN data_source SET DEFAULT 'livevault';

-- セトリ投稿
ALTER TABLE setlist_submissions ADD COLUMN IF NOT EXISTS data_source text;
ALTER TABLE setlist_submissions ADD COLUMN IF NOT EXISTS import_batch text;
ALTER TABLE setlist_submissions ADD COLUMN IF NOT EXISTS imported_at timestamptz;
UPDATE setlist_submissions SET data_source = 'existing' WHERE data_source IS NULL;
ALTER TABLE setlist_submissions ALTER COLUMN data_source SET DEFAULT 'livevault';

CREATE INDEX IF NOT EXISTS idx_tours_data_source ON tours (data_source);
CREATE INDEX IF NOT EXISTS idx_concerts_data_source ON concerts (data_source);
CREATE INDEX IF NOT EXISTS idx_setlist_submissions_data_source ON setlist_submissions (data_source);

-- ================================================
-- 一括取り込みの変更記録（既存データの空欄を埋めた・名前を直した等も1項目ずつ残す。確認・取り消し用）
-- ================================================
CREATE TABLE IF NOT EXISTS import_changes (
  id          bigserial PRIMARY KEY,
  batch       text NOT NULL,
  table_name  text NOT NULL,
  row_id      uuid NOT NULL,
  action      text NOT NULL CHECK (action IN ('insert', 'update')),
  field       text,          -- update のときの項目名
  old_value   text,
  new_value   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_changes_batch ON import_changes (batch, table_name);
CREATE INDEX IF NOT EXISTS idx_import_changes_row ON import_changes (row_id);
-- 管理用（service role のみ）。一般には公開しない
ALTER TABLE import_changes ENABLE ROW LEVEL SECURITY;
