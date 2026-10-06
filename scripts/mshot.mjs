// スマホ幅（iPhone 相当 390px）でページのスクリーンショットを撮り、横はみ出しをチェックする
// usage: node scripts/mshot.mjs <url> <out.png> [width]
//   out.png は縦 1300px ごとに out_0.png, out_1.png ... に分割して保存
//   ※ headless Chrome の --window-size は最小幅の制限があるため、DevTools のエミュレーションで幅を指定している
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const [url, out, w = '390'] = process.argv.slice(2)
const width = Number(w)
const port = 9300 + Math.floor(Math.random() * 500)
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`,
  `--user-data-dir=/tmp/mshot-profile-${port}`, 'about:blank',
], { stdio: 'ignore' })

const sleep = ms => new Promise(r => setTimeout(r, ms))
let target
for (let i = 0; i < 50 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page') } catch {}
  await sleep(200)
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
})
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })

await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 2, mobile: width < 640 })
await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' })
await send('Page.enable')
await send('Page.navigate', { url })
await sleep(9000)

// 横はみ出しチェック
const r = await send('Runtime.evaluate', {
  expression: `JSON.stringify({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    over: [...document.querySelectorAll('body *')].filter(el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.right > document.documentElement.clientWidth + 1 && getComputedStyle(el).position !== 'fixed' })
      .slice(0, 8).map(el => el.tagName + '.' + (el.className?.toString?.() ?? '').slice(0, 60) + ' right=' + Math.round(el.getBoundingClientRect().right)) })`,
  returnByValue: true,
})
console.log(r.result.result.value)

const hRes = await send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true })
const total = hRes.result.result.value
const slice = 1300
for (let y = 0, n = 0; y < total; y += slice, n++) {
  const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y, width, height: Math.min(slice, total - y), scale: 1 },
  })
  writeFileSync(out.replace(/\.png$/, `_${n}.png`), Buffer.from(shot.result.data, 'base64'))
}
console.log('height', total, 'slices', Math.ceil(total / slice))
ws.close()
chrome.kill()
