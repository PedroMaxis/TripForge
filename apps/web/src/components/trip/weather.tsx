import type { DayWeather, WeatherKind } from '@tripforge/core'
import { useTranslations } from 'next-intl'

const cloud = 'M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 18z'
const raised = 'M7 14h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.4 1.6A3.3 3.3 0 0 0 7 14z'
const icons: Record<WeatherKind, string> = {
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5',
  partly: `${cloud}M6 9a4 4 0 0 1 6-4.5M7 2v1.5M2.5 7.5 4 8`,
  cloudy: cloud,
  fog: 'M4 9h16M6 13h12M4 17h16',
  rain: `${raised}M8 17l-1 3M12 17l-1 3M16 17l-1 3`,
  storm: `${raised}M13 15l-2 3h3l-2 3`,
  snow: `${raised}M8 18v.01M12 18v.01M16 18v.01M10 21v.01M14 21v.01`,
}

/** The weather of a day, with credit to who forecast it. */
export function Weather({ weather }: { weather: DayWeather | undefined }) {
  const t = useTranslations('Weather')
  if (!weather) return null
  return (
    <p
      data-testid="weather"
      className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-2"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={icons[weather.kind]} />
      </svg>
      <span className="tabular-nums">
        {t(`kinds.${weather.kind}`)}, {t('range', { min: weather.min, max: weather.max })}
      </span>
      <a
        href="https://www.met.no/"
        target="_blank"
        rel="noreferrer"
        className="text-xs text-muted hover:text-ink"
      >
        MET Norway
      </a>
    </p>
  )
}
