'use client'

import type { Expense } from '@tripforge/core'
import { isDate } from '@tripforge/core'
import { useLocale, useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { commonCurrencies, parseMoney, plainMoney } from '@/lib/money'

type Fields = Omit<Expense, 'id'>

export function ExpenseForm({
  value,
  people,
  name,
  onSave,
  onCancel,
  onRemove,
}: {
  value: Fields
  /** Who may take part, by id. */
  people: string[]
  name: (id: string) => string
  onSave: (fields: Fields) => void
  onCancel: () => void
  onRemove?: () => void
}) {
  const t = useTranslations('Money')
  const locale = useLocale()
  const id = useId()
  const [fields, setFields] = useState(value)
  const [amount, setAmount] = useState(
    value.amount ? plainMoney(value.amount, value.currency, locale) : '',
  )
  const [error, setError] = useState<'title' | 'amount' | 'split' | 'date' | null>(null)
  const set = (change: Partial<Fields>) => setFields((f) => ({ ...f, ...change }))
  const label = 'text-sm font-medium'

  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = fields.title.trim()
    const parsed = parseMoney(amount, fields.currency)
    if (!title) return setError('title')
    if (parsed === null) return setError('amount')
    if (fields.split.length === 0) return setError('split')
    if (!isDate(fields.date)) return setError('date')
    onSave({ ...fields, title, amount: parsed })
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-title`} className={label}>
          {t('what')}
        </label>
        <input
          id={`${id}-title`}
          value={fields.title}
          maxLength={200}
          // biome-ignore lint/a11y/noAutofocus: the form opens because someone asked to write in it
          autoFocus={!onRemove}
          onChange={(e) => set({ title: e.target.value })}
          aria-invalid={error === 'title'}
          className="field mt-1"
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
        <div>
          <label htmlFor={`${id}-amount`} className={label}>
            {t('amount')}
          </label>
          <input
            id={`${id}-amount`}
            inputMode="decimal"
            value={amount}
            maxLength={20}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={error === 'amount'}
            className="field mt-1 tabular-nums"
          />
        </div>
        <div>
          <label htmlFor={`${id}-currency`} className={label}>
            {t('currency')}
          </label>
          <select
            id={`${id}-currency`}
            value={fields.currency}
            onChange={(e) => set({ currency: e.target.value })}
            className="field mt-1"
          >
            {[...new Set([...commonCurrencies, fields.currency])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-date`} className={label}>
          {t('date')}
        </label>
        <input
          id={`${id}-date`}
          type="date"
          value={fields.date}
          onChange={(e) => set({ date: e.target.value })}
          aria-invalid={error === 'date'}
          className="field mt-1"
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-paid`} className={label}>
          {t('paidBy')}
        </label>
        <select
          id={`${id}-paid`}
          value={fields.paidBy}
          onChange={(e) => set({ paidBy: e.target.value })}
          className="field mt-1"
        >
          {people.map((p) => (
            <option key={p} value={p}>
              {name(p)}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="sm:col-span-2">
        <legend className={label}>{t('splitBetween')}</legend>
        <div className="mt-1 flex flex-wrap gap-x-5">
          {people.map((p) => (
            <label key={p} className="flex min-h-11 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={fields.split.includes(p)}
                onChange={(e) =>
                  set({
                    split: e.target.checked
                      ? [...fields.split, p]
                      : fields.split.filter((x) => x !== p),
                  })
                }
                className="size-5 accent-accent"
              />
              {name(p)}
            </label>
          ))}
        </div>
      </fieldset>
      <p role="alert" className="text-danger empty:hidden sm:col-span-2">
        {error && t(`errors.${error}`)}
      </p>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className="btn btn-primary">
          {t('save')}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {t('cancel')}
        </button>
        {onRemove && (
          <button type="button" className="btn" onClick={onRemove}>
            {t('remove')}
          </button>
        )}
      </div>
    </form>
  )
}
