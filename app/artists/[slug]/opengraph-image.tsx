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

  const q = admin.from('artists').select('name, description, image_url')
  const query = UUID_RE.test(slug)
    ? q.eq('id', slug)
    : SHORT_ID_RE.test(slug)
      ? (() => { const { lo, hi } = shortIdRange(slug); return q.gte('id', lo).lt('id', hi) })()
      : q.eq('slug', slug)

  const { data } = await query.single()

  const artistName = data?.name ?? 'LiveVault'
  const description = data?.description ?? null
  const artistImage = data?.image_url ?? null

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
        <div style={{ position: 'absolute', top: '-60px', left: '-60px', width: '450px', height: '450px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.3) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-80px', right: '350px', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.2) 0%, transparent 70%)' }} />

        {/* 右側：アーティスト画像 */}
        {artistImage && (
          <div
            style={{
              position: 'absolute',
              right: '80px',
              top: '50%',
              width: '280px',
              height: '280px',
              borderRadius: '50%',
              overflow: 'hidden',
              display: 'flex',
              border: '4px solid rgba(124,58,237,0.5)',
              transform: 'translateY(-50%)',
            }}
          >
            <img src={artistImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
            maxWidth: artistImage ? '720px' : '100%',
          }}
        >
          {/* ラベル */}
          <div
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: '#a78bfa',
              marginBottom: '20px',
              letterSpacing: '0.05em',
            }}
          >
            アーティスト
          </div>

          {/* アーティスト名 */}
          <div
            style={{
              fontSize: artistName.length > 12 ? '56px' : '72px',
              fontWeight: 900,
              color: '#ffffff',
              lineHeight: 1.1,
              marginBottom: '24px',
              letterSpacing: '-0.02em',
            }}
          >
            {artistName}
          </div>

          {/* 説明文 */}
          {description && (
            <div
              style={{
                fontSize: '22px',
                color: '#8888aa',
                lineHeight: 1.5,
                display: '-webkit-box',
                overflow: 'hidden',
                marginBottom: '32px',
              }}
            >
              {description.slice(0, 60)}{description.length > 60 ? '...' : ''}
            </div>
          )}

          {/* バッジ */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {['セトリ記録', 'ライブ情報', '参戦管理'].map(label => (
              <div
                key={label}
                style={{
                  background: 'rgba(124,58,237,0.2)',
                  border: '1px solid rgba(124,58,237,0.4)',
                  borderRadius: '999px',
                  padding: '8px 20px',
                  fontSize: '18px',
                  color: '#ddd6fe',
                  fontWeight: 600,
                }}
              >
                {label}
              </div>
            ))}
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
