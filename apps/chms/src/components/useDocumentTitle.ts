'use client'

import { useEffect } from 'react'

const APP = 'By Their Fruit for Churches'

/**
 * Names the tab after what the page shows ("Daniel Reyes · By Their Fruit for Churches")
 * once it has loaded, and puts the previous title back when the page goes away.
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = `${title} · ${APP}`
    return () => { document.title = previous }
  }, [title])
}
