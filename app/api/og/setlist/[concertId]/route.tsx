import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const WIDTH = 1080
const HEADER_H = 300   // artist image + names + date/venue
const SONG_ROW_H = 56  // larger rows
const ENCORE_SEP_H = 60
const FOOTER_H = 80
const EXTRA_PAD = 48

async function loadFont(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900',
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }
    ).then(r => r.text())
    const urlMatch = css.match(/src: url\(([^)]+)\)/)
    if (!urlMatch) return null
    return await fetch(urlMatch[1]).then(r => r.arrayBuffer())
  } catch {
    return null
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ concertId: string }> }
) {
  const { concertId } = await params
  const admin = createAdminClient()

  const [[{ data: concert }, { data: topSub }], fontData] = await Promise.all([
    Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any).from('concerts')
        .select('date, venue_name, artists(name, image_url), tours(name)')
        .eq('id', concertId)
        .single(),
      admin.from('setlist_submissions')
        .select('id, votes_count, setlist_songs(song_name, song_type, order_num, is_encore)')
        .eq('concert_id', concertId)
        .order('votes_count', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]),
    loadFont(),
  ])

  if (!concert) return new Response('Not found', { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = concert as any
  const artist = c.artists
  const tour = c.tours

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const songOnly = ((topSub as any)?.setlist_songs ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => a.order_num - b.order_num)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((s: any) => s.song_type === 'song')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mainSongs = songOnly.filter((s: any) => !s.is_encore)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const encoreSongs = songOnly.filter((s: any) => s.is_encore)
  const hasEncore = encoreSongs.length > 0

  // Dynamic height: fit all songs, minimum 1080px
  const neededH =
    HEADER_H +
    mainSongs.length * SONG_ROW_H +
    (hasEncore ? ENCORE_SEP_H + encoreSongs.length * SONG_ROW_H : 0) +
    FOOTER_H + EXTRA_PAD
  const HEIGHT = Math.max(1080, neededH)

  const dateStr = new Date(c.date).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  // Fetch artist image as base64
  let imgSrc: string | undefined
  if (artist?.image_url) {
    try {
      const r = await fetch(artist.image_url)
      if (r.ok) {
        const buf = await r.arrayBuffer()
        const bytes = new Uint8Array(buf)
        let bin = ''
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
        imgSrc = `data:${r.headers.get('content-type') ?? 'image/jpeg'};base64,${btoa(bin)}`
      }
    } catch {}
  }

  const fonts = fontData
    ? [{ name: 'NotoSansJP', data: fontData, weight: 400 as const, style: 'normal' as const }]
    : []

  return new ImageResponse(
    (
      <div
        style={{
          width: `${WIDTH}px`,
          height: `${HEIGHT}px`,
          backgroundColor: '#121212',
          display: 'flex',
          flexDirection: 'column',
          color: 'white',
          fontFamily: fontData ? 'NotoSansJP' : 'sans-serif',
        }}
      >
        {/* Artist image + name */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '36px',
          padding: '64px 64px 0',
        }}>
          {imgSrc ? (
            <img
              src={imgSrc}
              width={160}
              height={160}
              style={{ objectFit: 'cover', borderRadius: '20px', flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: '160px',
              height: '160px',
              backgroundColor: '#282828',
              borderRadius: '20px',
              flexShrink: 0,
              display: 'flex',
            }} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minWidth: 0 }}>
            {artist?.name && (
              <div style={{ fontSize: '56px', fontWeight: 900, color: 'white', lineHeight: 1.05 }}>
                {artist.name}
              </div>
            )}
            {tour?.name && (
              <div style={{ fontSize: '24px', color: '#b3b3b3', fontWeight: 700, lineHeight: 1.3 }}>
                {tour.name}
              </div>
            )}
          </div>
        </div>

        {/* Date + venue */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '28px 64px 26px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          gap: '16px',
          flexShrink: 0,
        }}>
          <span style={{ color: '#8888aa', fontSize: '22px' }}>{dateStr}</span>
          <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '22px' }}>|</span>
          <span style={{ color: 'white', fontSize: '24px', fontWeight: 700 }}>{c.venue_name}</span>
        </div>

        {/* Songs */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 64px 0',
        }}>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {mainSongs.map((s: any, i: number) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              padding: '12px 0',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <span style={{ color: '#555577', fontSize: '18px', width: '40px', textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                {i + 1}
              </span>
              <span style={{ color: 'white', fontSize: '26px' }}>{s.song_name}</span>
            </div>
          ))}

          {hasEncore && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '18px 0 14px' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
              <span style={{ color: '#b3b3b3', fontSize: '14px', letterSpacing: '0.15em' }}>ENCORE</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
            </div>
          )}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {encoreSongs.map((s: any, i: number) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              padding: '12px 0',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <span style={{ color: '#555577', fontSize: '18px', width: '40px', textAlign: 'right', flexShrink: 0 }}>
                E{i + 1}
              </span>
              <span style={{ color: 'white', fontSize: '26px' }}>{s.song_name}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '22px 64px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
          marginTop: '28px',
        }}>
          <span style={{ color: '#555577', fontSize: '18px', letterSpacing: '0.06em' }}>livevault.jp</span>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts,
    }
  )
}
