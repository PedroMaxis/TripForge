'use client'

import { useEffect, useRef } from 'react'

/** The app itself, growing into its place as it is reached. */
export function AppWindow({ src, alt, credit }: { src: string; alt: string; credit: string }) {
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const draw = () => {
      raf = 0
      const el = frame.current
      if (!el?.parentElement) return
      const top = el.parentElement.getBoundingClientRect().top
      const p = Math.min(1, Math.max(0, 1 - (top - innerHeight * 0.15) / (innerHeight * 0.8)))
      const eased = p * p * (3 - 2 * p)
      el.style.transform = `perspective(1600px) rotateX(${((1 - eased) * 14).toFixed(2)}deg) scale(${(0.86 + eased * 0.14).toFixed(4)})`
    }
    const ask = () => {
      raf ||= requestAnimationFrame(draw)
    }
    draw()
    addEventListener('scroll', ask, { passive: true })
    addEventListener('resize', ask)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('scroll', ask)
      removeEventListener('resize', ask)
    }
  }, [])
  return (
    <figure>
      <div ref={frame} className="origin-top will-change-transform">
        <img
          src={src}
          width={1600}
          height={1000}
          alt={alt}
          loading="lazy"
          className="h-auto w-full rounded-2xl border border-line sm:rounded-3xl"
        />
      </div>
      <figcaption className="mt-3 text-xs text-muted">{credit}</figcaption>
    </figure>
  )
}
