'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { dayLegs, type Leg, stopsWithPlace, type Trip } from '@tripforge/core'
import type { GeoJSONSource, Map as MapLibre, Marker, StyleSpecification } from 'maplibre-gl'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { type MapColors, paintStyle, readMapColors } from '@/lib/map-style'
import { itemsOf } from '@/lib/trip-store'

export type MapSources = { styleUrl: string; terrainUrl: string }

type Props = MapSources & {
  trip: Trip
  dayId: string | null
  openId: string | null
  legs: Record<string, Leg>
  onPick: (itemId: string, dayId: string | null) => void
  className: string
}

type Loaded = { map: MapLibre; lib: typeof import('maplibre-gl'); colors: MapColors }

const routeSource = 'routes'
const terrainCredit = 'Relief: Mapzen, NASA SRTM'
const routeCredit = 'Routes: OSRM, FOSSGIS'

const duration = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700)

async function load(container: HTMLElement, { styleUrl, terrainUrl }: MapSources): Promise<Loaded> {
  const [lib, { default: contour }, res] = await Promise.all([
    import('maplibre-gl'),
    import('maplibre-contour'),
    fetch(styleUrl),
  ])
  if (!res.ok) throw new Error(`Map style answered ${res.status}`)
  const colors = readMapColors()
  const style = paintStyle((await res.json()) as StyleSpecification, colors)

  const dem = new contour.DemSource({ url: terrainUrl, encoding: 'terrarium', maxzoom: 13 })
  dem.setupMaplibre(lib)

  const map = new lib.Map({
    container,
    style,
    center: [0, 0],
    zoom: 1,
    attributionControl: { compact: innerWidth < 768 },
  })
  try {
    await new Promise<void>((resolve, reject) => {
      map.once('load', () => resolve())
      // Before it loads, an error is fatal; after, a missing tile is not worth a message.
      map.once('error', ({ error }) => reject(error))
    })
  } catch (error) {
    map.remove()
    throw error
  }

  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
  map.addSource('contours', {
    type: 'vector',
    tiles: [
      dem.contourProtocolUrl({
        thresholds: { 11: [40, 200], 13: [20, 100], 15: [10, 50] },
        contourLayer: 'contours',
        elevationKey: 'ele',
        levelKey: 'level',
      }),
    ],
    minzoom: 11,
    maxzoom: 15,
    attribution: terrainCredit,
  })
  map.addLayer(
    {
      id: 'contours',
      type: 'line',
      source: 'contours',
      'source-layer': 'contours',
      paint: {
        'line-color': colors.contour,
        'line-width': ['match', ['get', 'level'], 1, 1.2, 0.6],
        'line-opacity': 0.6,
      },
    },
    firstLabel,
  )
  map.addSource(routeSource, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    attribution: routeCredit,
  })
  map.addLayer({
    id: routeSource,
    type: 'line',
    source: routeSource,
    layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'current'] },
    paint: {
      'line-color': ['case', ['==', ['get', 'current'], 1], colors.route, colors.other],
      'line-width': ['case', ['==', ['get', 'current'], 1], 4, 2],
      'line-opacity': ['case', ['==', ['get', 'current'], 1], 1, 0.7],
    },
  })
  return { map, lib, colors }
}

export function TripMap(props: Props) {
  const { trip, dayId, openId, legs, onPick, styleUrl, terrainUrl, className } = props
  const t = useTranslations('Map')
  const container = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [all, setAll] = useState(false)
  const pick = useRef(onPick)
  useEffect(() => {
    pick.current = onPick
  })

  // attempt is here to ask for another try
  useEffect(() => {
    if (!container.current) return
    let gone = false
    let map: MapLibre | undefined
    setFailed(false)
    load(container.current, { styleUrl, terrainUrl })
      .then((result) => {
        map = result.map
        if (gone) map.remove()
        else setLoaded(result)
      })
      .catch(() => {
        if (!gone) setFailed(true)
      })
    return () => {
      gone = true
      map?.remove()
      setLoaded(null)
    }
  }, [styleUrl, terrainUrl, attempt])

  const days = trip.days.map((day) => ({
    id: day.id as string | null,
    items: itemsOf(trip, day.id),
  }))
  const ideas = { id: null as string | null, items: itemsOf(trip, null) }
  const shown = dayId === null && !all ? [...days, ideas] : days
  const current = stopsWithPlace(itemsOf(trip, dayId))
  const routed = dayId ? dayLegs(itemsOf(trip, dayId)).filter((l) => legs[l.key]).length : 0

  // Rebuilt only when something on the map changes, not on every keystroke elsewhere.
  const drawing = JSON.stringify({
    all,
    dayId,
    openId,
    days: shown.map((d) => ({
      id: d.id,
      stops: stopsWithPlace(d.items).map((s) => [s.id, s.title, s.number, s.lng, s.lat]),
      legs: d.id ? dayLegs(d.items).map((l) => [l.key, legs[l.key]?.meters ?? 0]) : [],
    })),
  })
  // drawing stands for everything it draws
  useEffect(() => {
    if (!loaded) return
    const { map, lib } = loaded
    const features = shown.flatMap((day) =>
      day.id === null
        ? []
        : dayLegs(day.items).map((leg) => ({
            type: 'Feature' as const,
            properties: { current: day.id === dayId ? 1 : 0 },
            geometry: {
              type: 'LineString' as const,
              coordinates: legs[leg.key]?.line ?? [
                [leg.from.lng, leg.from.lat],
                [leg.to.lng, leg.to.lat],
              ],
            },
          })),
    )
    map.getSource<GeoJSONSource>(routeSource)?.setData({ type: 'FeatureCollection', features })

    const markers: Marker[] = []
    for (const day of shown) {
      const isCurrent = day.id === dayId
      for (const stop of stopsWithPlace(day.items)) {
        const full = isCurrent && !all
        const button = document.createElement('button')
        button.type = 'button'
        button.title = stop.title
        if (full) {
          button.className = 'pin'
          button.textContent = day.id ? String(stop.number) : '+'
          button.setAttribute('aria-label', day.id ? `${stop.number}. ${stop.title}` : stop.title)
          if (stop.id === openId) button.setAttribute('aria-current', 'true')
        } else {
          button.className = `pin pin-dot ${isCurrent ? 'is-current' : ''}`
          button.setAttribute('aria-label', stop.title)
        }
        button.addEventListener('click', () => {
          setAll(false)
          pick.current(stop.id, day.id)
        })
        markers.push(new lib.Marker({ element: button }).setLngLat([stop.lng, stop.lat]).addTo(map))
      }
    }
    return () => {
      for (const marker of markers) marker.remove()
    }
  }, [loaded, drawing])

  // The view follows the day and the open stop, not every small change.
  const inView = all ? shown.flatMap((d) => stopsWithPlace(d.items)) : current
  const viewKey = JSON.stringify([all, dayId, inView.map((s) => [s.id, s.lng, s.lat])])
  const open = all ? undefined : current.find((s) => s.id === openId)
  // viewKey stands for what is in view
  useEffect(() => {
    if (!loaded) return
    const { map, lib } = loaded
    if (open) {
      map.easeTo({
        center: [open.lng, open.lat],
        zoom: Math.max(map.getZoom(), 14.5),
        duration: duration(),
      })
      return
    }
    const points =
      inView.length > 0
        ? inView
        : trip.destinationLat !== null && trip.destinationLng !== null
          ? [{ lat: trip.destinationLat, lng: trip.destinationLng }]
          : days.flatMap((d) => stopsWithPlace(d.items))
    if (points.length === 0) return
    const bounds = new lib.LngLatBounds()
    for (const p of points) bounds.extend([p.lng, p.lat])
    map.fitBounds(bounds, {
      padding:
        map.getContainer().clientWidth < 600 ? { top: 72, bottom: 48, left: 40, right: 40 } : 90,
      maxZoom: inView.length > 0 ? 14.5 : 11.5,
      duration: duration(),
    })
  }, [loaded, viewKey, open?.id])

  return (
    <section
      aria-label={t('label')}
      data-routed={routed}
      className={`relative overflow-hidden ${className}`}
    >
      <div ref={container} className="absolute! inset-0 bg-[var(--map-land)]" />
      {!loaded && (
        <div
          role="status"
          className="absolute inset-0 grid place-content-center justify-items-center gap-3 p-6 text-center text-ink-2"
        >
          {failed ? (
            <>
              <p>{t('failed')}</p>
              <button type="button" className="btn" onClick={() => setAttempt(attempt + 1)}>
                {t('retry')}
              </button>
            </>
          ) : (
            <p>{t('loading')}</p>
          )}
        </div>
      )}
      {loaded && trip.days.length > 1 && (
        <button
          type="button"
          aria-pressed={all}
          onClick={() => setAll(!all)}
          className="btn absolute! top-3 left-3 border-paper"
        >
          {all ? t('back') : t('all')}
        </button>
      )}
    </section>
  )
}
