export function slugify(str: string): string {
  return str
    .replace(/[「」『』【】〜～《》〈〉""'']/g, ' ')
    .replace(/[\s・　+&]+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function concertSlug(artistName: string, venueName: string, date: string): string {
  return `${slugify(artistName)}-${slugify(venueName)}-${date}`
}

export function tourSlug(artistName: string, tourName: string): string {
  return `${slugify(artistName)}-${slugify(tourName)}`
}
