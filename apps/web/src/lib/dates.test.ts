import { expect, test } from 'vitest'
import { formatDate, formatRange } from './dates'

// Node and browsers use different thin spaces, which would make React redraw the page.
test.each(['en', 'pt-BR'])('only ordinary spaces in %s', (locale) => {
  const all = [
    formatRange('2027-03-04', '2027-03-08', locale),
    formatRange('2027-03-30', '2027-04-02', locale),
    formatDate('2027-03-04', locale, { dateStyle: 'full' }),
  ].join('')
  expect(all).not.toMatch(/[^\S ]/)
})
