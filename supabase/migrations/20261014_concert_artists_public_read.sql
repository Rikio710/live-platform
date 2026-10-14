-- 公演の出演者（concert_artists）を誰でも読めるようにする
-- 公開ページは匿名（anon）で読むため、読み取りポリシーがないと複数出演・対バン出演が表示されない（2026-10-14 判明）
DROP POLICY IF EXISTS "concert_artists_public_read" ON concert_artists;
CREATE POLICY "concert_artists_public_read" ON concert_artists FOR SELECT USING (true);
