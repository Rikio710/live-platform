import { ImageResponse } from 'next/og'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHORT_ID_RE = /^[0-9a-f]{8}$/i

function shortIdRange(shortId: string) {
  const lo = `${shortId}-0000-0000-0000-000000000000`
  const hi = `${(parseInt(shortId, 16) + 1).toString(16).padStart(8, '0')}-0000-0000-0000-000000000000`
  return { lo, hi }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const admin = createAdminClient()

  const q = admin
    .from('concerts')
    .select('venue_name, date, image_url, artists(name), tours(name, image_url)')
  const query = UUID_RE.test(slug)
    ? q.eq('id', slug)
    : SHORT_ID_RE.test(slug)
      ? (() => { const { lo, hi } = shortIdRange(slug); return q.gte('id', lo).lt('id', hi) })()
      : q.eq('slug', slug)

  const { data } = await query.single()

  const artistName = (data?.artists as { name: string } | null)?.name ?? ''
  const tourName = (data?.tours as { name: string; image_url: string | null } | null)?.name ?? null
  const venueName = data?.venue_name ?? ''
  const dateStr = data?.date
    ? new Date(data.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
    : ''
  const bgImage = data?.image_url ?? (data?.tours as { image_url: string | null } | null)?.image_url ?? null

  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0a0a0f 0%, #1a0a2e 60%, #0f0a1a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* 背景装飾 */}
        <div style={{ position: 'absolute', top: '-80px', left: '-80px', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.35) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-100px', left: '30%', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.2) 0%, transparent 70%)' }} />

        {/* 右側：画像 */}
        {bgImage && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              width: '420px',
              height: '630px',
              display: 'flex',
            }}
          >
            <img
              src={bgImage}
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35 }}
            />
            {/* フェードオーバーレイ */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to right, #0a0a0f 0%, transparent 60%)',
              }}
            />
          </div>
        )}

        {/* 左側：テキスト */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '60px 64px',
            flex: 1,
            zIndex: 1,
            maxWidth: bgImage ? '740px' : '100%',
          }}
        >
          {/* アーティスト名 */}
          {artistName && (
            <div
              style={{
                fontSize: '28px',
                fontWeight: 700,
                color: '#a78bfa',
                marginBottom: '16px',
                letterSpacing: '0.02em',
              }}
            >
              {artistName}
            </div>
          )}

          {/* ツアー名 or 公演名 */}
          <div
            style={{
              fontSize: tourName ? '52px' : '44px',
              fontWeight: 900,
              color: '#ffffff',
              lineHeight: 1.15,
              marginBottom: '32px',
              letterSpacing: '-0.02em',
            }}
          >
            {tourName ?? venueName}
          </div>

          {/* 日付・会場 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {dateStr && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '4px', height: '20px', background: '#7c3aed', borderRadius: '2px' }} />
                <span style={{ fontSize: '24px', color: '#c4b5fd', fontWeight: 600 }}>{dateStr}</span>
              </div>
            )}
            {venueName && tourName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '4px', height: '20px', background: '#db2777', borderRadius: '2px' }} />
                <span style={{ fontSize: '24px', color: '#f9a8d4', fontWeight: 600 }}>{venueName}</span>
              </div>
            )}
          </div>

          {/* セトリバッジ */}
          <div style={{ display: 'flex', marginTop: '36px' }}>
            <div
              style={{
                background: 'rgba(124,58,237,0.25)',
                border: '1px solid rgba(124,58,237,0.5)',
                borderRadius: '999px',
                padding: '8px 24px',
                fontSize: '20px',
                color: '#ddd6fe',
                fontWeight: 600,
              }}
            >
              セットリスト・参戦記録
            </div>
          </div>
        </div>

        {/* ロゴ */}
        <div
          style={{
            position: 'absolute',
            bottom: '36px',
            right: '40px',
            fontSize: '22px',
            fontWeight: 900,
            color: 'rgba(255,255,255,0.4)',
            zIndex: 2,
          }}
        >
          LiveVault
        </div>
      </div>
    ),
    { ...size },
  )
}
