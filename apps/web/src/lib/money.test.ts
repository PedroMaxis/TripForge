import { expect, test } from 'vitest'
import { formatMoney, parseMoney } from './money'

test.each([
  ['12,50', 'BRL', 1250],
  ['12.5', 'BRL', 1250],
  ['1.234,56', 'BRL', 123456],
  ['1,234.56', 'USD', 123456],
  ['1.234', 'BRL', 123400],
  ['R$ 80', 'BRL', 8000],
  ['1500', 'JPY', 1500],
  ['1.500', 'JPY', 1500],
  ['0,01', 'BRL', 1],
])('%s %s is %d', (text, currency, amount) => {
  expect(parseMoney(text, currency)).toBe(amount)
})
test.each(['', 'abc', '0', '-5', '1,2,3', '12,345,6', '9999999999999'])(
  '%s is not an amount',
  (text) => {
    expect(parseMoney(text, 'BRL')).toBeNull()
  },
)
test('is shown the way people there write it', () => {
  expect(formatMoney(123456, 'BRL', 'pt-BR')).toBe('R$ 1.234,56')
  expect(formatMoney(1500, 'JPY', 'en')).toBe('¥1,500')
})
