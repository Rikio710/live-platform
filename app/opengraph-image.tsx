import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'LiveVault | ライブ参戦・セトリ記録サービス'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0a0a0f 0%, #1a0a2e 50%, #0f0a1a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* 背景の装飾 */}
        <div
          style={{
            position: 'absolute',
            top: '-100px',
            left: '-100px',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(124,58,237,0.3) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-100px',
            right: '-100px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(236,72,153,0.2) 0%, transparent 70%)',
          }}
        />

        {/* ロゴ・タイトル */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: '72px',
              fontWeight: 900,
              background: 'linear-gradient(90deg, #a78bfa, #f472b6)',
              backgroundClip: 'text',
              color: 'transparent',
              letterSpacing: '-2px',
            }}
          >
            LiveVault
          </div>

          <div
            style={{
              fontSize: '28px',
              color: '#c4b5fd',
              fontWeight: 600,
              letterSpacing: '1px',
            }}
          >
            ライブ参戦・セトリ記録サービス
          </div>

          <div
            style={{
              display: 'flex',
              gap: '16px',
              marginTop: '16px',
            }}
          >
            {['セトリ記録', '参戦管理', 'リアルタイム掲示板'].map((label) => (
              <div
                key={label}
                style={{
                  background: 'rgba(124,58,237,0.2)',
                  border: '1px solid rgba(124,58,237,0.4)',
                  borderRadius: '999px',
                  padding: '8px 20px',
                  fontSize: '20px',
                  color: '#ddd6fe',
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* URL */}
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            fontSize: '20px',
            color: 'rgba(255,255,255,0.3)',
          }}
        >
          livevault.jp
        </div>
      </div>
    ),
    { ...size },
  )
}
