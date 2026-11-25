import { shiftDate } from './dates'
import type { Trip } from './trip'
import { clockIn } from './trip-day'

const hourMs = 3_600_000

/** The moment a wall clock shows this date and time. */
function momentOf(date: string, time: string, timezone: string) {
  const wanted = Date.parse(`${date}T${time}:00Z`)
  let guess = wanted
  // The second pass settles guesses that fell on the other side of a clock change.
  for (let i = 0; i < 2; i++) {
    const shown = clockIn(timezone, new Date(guess))
    guess += wanted - Date.parse(`${shown.date}T${shown.time}:00Z`)
  }
  return new Date(guess)
}

const stamp = (at: Date) => at.toISOString().replace(/[-:]|\.\d+/g, '')
const plainDate = (iso: string) => iso.replaceAll('-', '')
const escaped = (text: string) => text.replace(/[\\,;]/g, '\\$&').replace(/\r\n|\r|\n/g, '\\n')

/** Lines of a calendar hold 75 bytes; the rest goes on the next, after a space. */
function fold(line: string) {
  const lines: string[] = []
  let current = ''
  let bytes = 0
  for (const letter of line) {
    const size = new TextEncoder().encode(letter).length
    if (bytes + size > 75) {
      lines.push(current)
      current = ' '
      bytes = 1
    }
    current += letter
    bytes += size
  }
  return [...lines, current].join('\r\n')
}

/** The trip as an iCalendar file, for any calendar app. */
export function tripCalendar(trip: Trip, now: Date) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TripForge//EN',
    `X-WR-CALNAME:${escaped(trip.title)}`,
  ]
  for (const item of trip.items) {
    const day = trip.days.find((d) => d.id === item.dayId)
    if (!day) continue
    const place = [item.placeName !== item.title && item.placeName, item.address]
      .filter(Boolean)
      .join(', ')
    lines.push('BEGIN:VEVENT', `UID:${item.id}@tripforge`, `DTSTAMP:${stamp(now)}`)
    if (item.startTime) {
      const start = momentOf(day.date, item.startTime, trip.timezone)
      const { endTime } = item
      const endDate = endTime && endTime < item.startTime ? shiftDate(day.date, 1) : day.date
      const end = endTime
        ? momentOf(endDate, endTime, trip.timezone)
        : new Date(start.getTime() + hourMs)
      lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`)
    } else {
      lines.push(
        `DTSTART;VALUE=DATE:${plainDate(day.date)}`,
        `DTEND;VALUE=DATE:${plainDate(shiftDate(day.date, 1))}`,
      )
    }
    lines.push(`SUMMARY:${escaped(item.title)}`)
    if (place) lines.push(`LOCATION:${escaped(place)}`)
    if (item.lat !== null) lines.push(`GEO:${item.lat};${item.lng}`)
    if (item.notes) lines.push(`DESCRIPTION:${escaped(item.notes)}`)
    lines.push('END:VEVENT')
  }
  return [...lines, 'END:VCALENDAR', ''].map(fold).join('\r\n')
}
