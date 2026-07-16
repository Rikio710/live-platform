'use client'

import { useEffect, useRef } from 'react'
import { dataLayerPush } from '@/lib/gtag'

export default function SearchResultsTracker({ query, total }: { query: string; total: number }) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    dataLayerPush({ event: 'site_search', search_term: query, search_results_count: total })
  }, [])
  return null
}
