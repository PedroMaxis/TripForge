const digitsOf = (currency: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
    .maximumFractionDigits ?? 2

/** The ones people here are most likely to need; any other already in use is added. */
export const commonCurrencies = [
  'BRL',
  'USD',
  'EUR',
  'GBP',
  'ARS',
  'CLP',
  'UYU',
  'PYG',
  'BOB',
  'PEN',
  'COP',
  'MXN',
  'CAD',
  'CHF',
  'JPY',
  'CNY',
  'KRW',
  'THB',
  'ZAR',
  'TRY',
  'AUD',
  'NZD',
]

export function formatMoney(amount: number, currency: string, locale: string) {
  const digits = digitsOf(currency)
  return new Intl.NumberFormat(locale, { style: 'currency', currency })
    .format(amount / 10 ** digits)
    .replace(/\s/g, ' ')
}

/** An amount as it goes in a field. */
export const plainMoney = (amount: number, currency: string, locale: string) =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: digitsOf(currency),
    useGrouping: false,
  }).format(amount / 10 ** digitsOf(currency))

/** What someone typed, in the smallest unit; commas and points both work. Null if unreadable. */
export function parseMoney(text: string, currency: string): number | null {
  const digits = digitsOf(currency)
  const typed = text.replace(/[^\d.,-]/g, '')
  // The last separator starts the cents, unless what follows is a group of three.
  const match = typed.match(/^(\d{1,3}(?:([.,])\d{3})*|\d+)(?:([.,])(\d+))?$/)
  if (!match) return null
  const [, whole = '', grouping, separator, decimals = ''] = match
  if (decimals.length > digits || (separator && separator === grouping)) return null
  const groups = whole.split(/[.,]/)
  if (grouping && groups.length > 1 && new Set(whole.match(/[.,]/g)).size > 1) return null
  const amount = Number(groups.join('') + decimals.padEnd(digits, '0'))
  return amount > 0 && amount <= 100_000_000_000 ? amount : null
}
