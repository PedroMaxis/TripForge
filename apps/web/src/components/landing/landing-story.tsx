'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { Link } from '@/i18n/navigation'
import type { Frame, ReliefScene, SceneData } from './relief-scene'

const stopCount = 5
const people = ['Pedro', 'Ana']
// When each text is on the stage, in scroll progress: in, full, full, out.
const windows = [
  [-1, -1, 0.14, 0.2],
  [0.2, 0.26, 0.36, 0.42],
  [0.44, 0.5, 0.64, 0.7],
  [0.72, 0.78, 2, 2],
] as const

const clamp = (v: number) => Math.min(1, Math.max(0, v))
const presence = ([a, b, c, d]: (typeof windows)[number], p: number) =>
  Math.min(b > a ? clamp((p - a) / (b - a)) : 1, d > c ? clamp((d - p) / (d - c)) : 1)

type State = 'waiting' | 'ready' | 'off'

/** The first part of the landing page: the real relief of Belo Horizonte, told by scrolling. */
export function LandingStory() {
  const t = useTranslations('Landing')
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const panels = useRef<(HTMLElement | null)[]>([])
  const pins = useRef<(HTMLElement | null)[]>([])
  const cursors = useRef<(HTMLElement | null)[]>([])
  const [state, setState] = useState<State>('waiting')
  const [running, setRunning] = useState(false)

  useEffect(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const gl = document.createElement('canvas').getContext('webgl2')
    if (still || !gl || !('DecompressionStream' in window)) {
      setState('off')
      return
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext()

    let gone = false
    let scene: ReliefScene | undefined
    let raf = 0
    let visible = true
    let progress = 0
    let reveal = 0
    let last = 0
    let size = { w: 0, h: 0 }
    let range = 1

    const move = (el: HTMLElement | null | undefined, x: number, y: number, opacity: number) => {
      if (!el) return
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      el.style.opacity = opacity.toFixed(2)
    }
    function onFrame({ stops, people: spots }: Frame) {
      stops.forEach((s, i) => {
        move(pins.current[i], s.x, s.y, s.reached ? 1 : 0)
        pins.current[i]?.toggleAttribute('data-reached', s.reached)
      })
      const together = clamp((progress - 0.74) / 0.06)
      spots.forEach((s, i) => {
        move(cursors.current[i], s.x, s.y, together)
      })
    }

    const goal = () => {
      const top = section.current?.getBoundingClientRect().top ?? 0
      return clamp(-top / range)
    }

    function tick(now: number) {
      raf = 0
      if (!scene || !visible) return
      const dt = Math.min(0.05, (now - (last || now)) / 1000)
      last = now
      const target = goal()
      progress += (target - progress) * (1 - Math.exp(-dt * 7))
      if (Math.abs(target - progress) < 0.0003) progress = target
      reveal = Math.min(1, reveal + dt / 2.2)
      const settling = scene.draw(progress, 1 - (1 - reveal) ** 3)
      panels.current.forEach((panel, i) => {
        const window = windows[i]
        if (!panel || !window) return
        const shown = presence(window, progress)
        panel.style.opacity = shown.toFixed(3)
        panel.style.transform = `translateY(${((1 - shown) * (progress > window[2] ? -28 : 28)).toFixed(1)}px)`
        panel.inert = shown < 0.5
      })
      // Nothing moves, nothing is drawn.
      if (settling || progress !== target || reveal < 1) ask()
      else last = 0
    }
    function ask() {
      if (!raf && visible && scene) raf = requestAnimationFrame(tick)
    }

    function measure() {
      if (!stage.current || !section.current) return
      const { clientWidth: w, clientHeight: h } = stage.current
      // On a phone the address bar comes and goes; that is not a new size.
      range = Math.max(1, section.current.offsetHeight - h)
      if (w === size.w && Math.abs(h - size.h) < 120 && 'ontouchstart' in window) return ask()
      const first = size.w === 0
      size = { w, h }
      scene?.resize(w, h)
      // Opened halfway down: start there instead of flying there.
      if (first) progress = goal()
      ask()
    }

    const sizes = new ResizeObserver(() => measure())
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      scene?.point((event.clientX / innerWidth) * 2 - 1, (event.clientY / innerHeight) * 2 - 1)
      ask()
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false
      setRunning(visible)
      if (visible) ask()
    })

    async function start() {
      const [{ createReliefScene, unpackHeights }, data, packed] = await Promise.all([
        import('./relief-scene'),
        fetch('/landing/scene.json').then((r) => r.json() as Promise<SceneData>),
        fetch('/landing/relief.bin'),
      ])
      if (!packed.ok || !packed.body) throw new Error('No relief')
      const heights = await unpackHeights(packed.body)
      if (gone || !canvas.current || !section.current) return
      scene = createReliefScene(canvas.current, data, heights, onFrame)
      setState('ready')
      observer.observe(section.current)
      // The stage grows once it is known to be live, so its size is watched rather than read once.
      sizes.observe(section.current)
      addEventListener('scroll', ask, { passive: true })
      addEventListener('pointermove', onPointer, { passive: true })
      canvas.current.addEventListener('webglcontextlost', () => setState('off'))
      ask()
    }
    start().catch(() => {
      if (!gone) setState('off')
    })

    return () => {
      gone = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      sizes.disconnect()
      removeEventListener('scroll', ask)
      removeEventListener('pointermove', onPointer)
      scene?.dispose()
    }
  }, [])

  const live = state === 'ready'
  const texts = [
    ['p2', 'p2b'],
    ['p3', 'p3b'],
    ['p4', 'p4b'],
  ] as const

  return (
    <section
      ref={section}
      data-testid="scene"
      data-scene={state}
      data-running={running}
      className={live ? 'relative h-[520svh]' : 'relative'}
    >
      <div
        ref={stage}
        className={live ? 'sticky top-0 h-svh overflow-clip' : 'relative overflow-clip'}
      >
        <div aria-hidden="true" className="absolute inset-0">
          <canvas ref={canvas} className={`size-full ${live ? '' : 'hidden'}`} />
        </div>
        {!live && (
          <img
            src="/landing/relief.svg"
            alt=""
            className="absolute inset-x-0 top-0 h-svh w-full object-cover object-right opacity-70"
          />
        )}

        {live && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {Array.from({ length: stopCount }, (_, i) => (
              <span
                key={`pin-${i + 1}`}
                ref={(el) => {
                  pins.current[i] = el
                }}
                className="group absolute top-0 left-0 opacity-0"
              >
                <span className="landing-pin">{i + 1}</span>
              </span>
            ))}
            {people.map((name, i) => (
              <span
                key={name}
                ref={(el) => {
                  cursors.current[i] = el
                }}
                className="absolute top-0 left-0 opacity-0"
              >
                <svg
                  width="20"
                  height="24"
                  viewBox="0 0 22 28"
                  className="drop-shadow-sm"
                  aria-hidden="true"
                >
                  <path
                    d="M2 2v20l5.4-4.8 3.6 8 3.6-1.6-3.5-7.8 7.3-.6z"
                    fill={i ? '#e2a04a' : '#266644'}
                    stroke="#fff"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
                <span
                  className={`ml-4 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${i ? 'bg-warm' : 'bg-soft'}`}
                >
                  {name}
                </span>
              </span>
            ))}
          </div>
        )}

        <div className="relative mx-auto h-full max-w-7xl px-4">
          <div
            ref={(el) => {
              panels.current[0] = el
            }}
            className={panelClass(live, 'pt-24 pb-16 lg:pt-32')}
          >
            <h1 className="text-5xl text-balance sm:text-6xl lg:text-7xl">{t('title')}</h1>
            <p className="mt-5 max-w-[34ch] text-lg text-ink-2">{t('body')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-up" className="btn btn-primary">
                {t('create')}
              </Link>
              <Link href="/sign-in" className="btn">
                {t('signIn')}
              </Link>
            </div>
          </div>
          {texts.map(([title, body], i) => (
            <div
              key={title}
              ref={(el) => {
                panels.current[i + 1] = el
              }}
              className={panelClass(live, 'py-10')}
            >
              <h2 className="text-4xl text-balance sm:text-5xl lg:text-6xl">{t(title)}</h2>
              <p className="mt-5 max-w-[34ch] text-lg text-ink-2">{t(body)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// On the stage the texts take turns in one place; without it they simply follow one another.
const panelClass = (live: boolean, still: string) =>
  live
    ? 'absolute inset-x-4 top-[12svh] max-w-xl will-change-transform lg:top-1/2 lg:-mt-40 lg:max-w-lg'
    : `max-w-xl ${still}`
