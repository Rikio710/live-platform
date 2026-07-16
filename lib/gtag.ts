declare global {
  interface Window {
    gtag: (command: string, eventName: string, params?: Record<string, unknown>) => void
    dataLayer: Record<string, unknown>[]
  }
}

export function gtagEvent(eventName: string, params?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', eventName, params)
  }
}

export function dataLayerPush(eventData: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(eventData)
}
