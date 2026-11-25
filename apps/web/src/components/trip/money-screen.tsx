'use client'

import { balances, type Expense, settlements, sharesOf } from '@tripforge/core'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { ExpenseForm } from './expense-form'
import { GroupPage, type GroupPageProps } from './group-page'
import { useNow } from './use-now'
import type { TripScreenProps } from './use-trip-store'

export function MoneyScreen(props: TripScreenProps) {
  const t = useTranslations('Money')
  return (
    <GroupPage {...props} title={t('title')}>
      {(page) => <Money {...page} />}
    </GroupPage>
  )
}

const fieldsOf = ({ id: _, ...fields }: Expense) => fields

function Money({ trip, group, userId, dispatch }: GroupPageProps) {
  const t = useTranslations('Money')
  const locale = useLocale()
  const now = useNow(trip.timezone)
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const { expenses, people } = group
  const name = (id: string) => (id === userId ? t('you') : (people[id] ?? '?'))
  const money = (amount: number, currency: string) => formatMoney(amount, currency, locale)
  const today = now?.date ?? trip.startDate
  const currency =
    expenses.filter((e) => !e.payment).at(-1)?.currency ?? (locale === 'pt-BR' ? 'BRL' : 'USD')
  // Who only looks takes no part, unless they already did.
  const planners = trip.members.filter((m) => m.role !== 'viewer').map((m) => m.userId)

  const spent = expenses.filter((e) => !e.payment)
  const totals = new Map<string, number>()
  for (const e of spent) totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amount)
  const own = new Map<string, number>()
  for (const e of spent) {
    const share = sharesOf(e).get(userId) ?? 0
    own.set(e.currency, (own.get(e.currency) ?? 0) + share)
  }
  const owed = [...balances(expenses)].map(([c, all]) => [c, all.get(userId) ?? 0] as const)
  const transfers = settlements(expenses)
  const sums = (all: Iterable<readonly [string, number]>) =>
    [...all].map(([c, amount]) => money(amount, c)).join(' + ')
  const ordered = expenses
    .toReversed()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  const remove = (expense: Expense) =>
    dispatch(
      { type: 'expense.delete', expenseId: expense.id },
      {
        kind: 'deleted',
        title: expense.title,
        op: { type: 'expense.create', expenseId: expense.id, fields: fieldsOf(expense) },
      },
    )

  return (
    <div className="grid gap-x-12 gap-y-10 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div className="min-w-0 md:order-2">
        {spent.length > 0 && (
          <dl className="mb-6 grid gap-3 rounded-2xl bg-mist px-5 py-4">
            <div>
              <dt className="text-sm text-ink-2">{t('total')}</dt>
              <dd className="font-display text-2xl tabular-nums">{sums(totals)}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-2">{t('yourPart')}</dt>
              <dd className="tabular-nums">{sums(own)}</dd>
            </div>
            {owed
              .filter(([, amount]) => amount !== 0)
              .map(([c, amount]) => (
                <div key={c}>
                  <dt className="text-sm text-ink-2">
                    {amount > 0 ? t('owedToYou') : t('youOwe')}
                  </dt>
                  <dd className="tabular-nums">{money(Math.abs(amount), c)}</dd>
                </div>
              ))}
          </dl>
        )}
        <section aria-label={t('settle')}>
          <h2 className="mb-3 text-xl">{t('settle')}</h2>
          {transfers.length === 0 ? (
            <p className="text-ink-2">{spent.length > 0 ? t('settled') : t('nothingYet')}</p>
          ) : (
            <ul className="grid gap-2">
              {transfers.map((s) => (
                <li
                  key={`${s.currency}${s.from}${s.to}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-mist px-4 py-3"
                >
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {t(s.from === userId ? 'youPay' : 'pays', {
                      from: name(s.from),
                      to: s.to === userId ? t('toYou') : name(s.to),
                      amount: money(s.amount, s.currency),
                    })}
                  </span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      const expenseId = crypto.randomUUID()
                      const title = t('payment')
                      dispatch(
                        {
                          type: 'expense.create',
                          expenseId,
                          fields: {
                            title,
                            amount: s.amount,
                            currency: s.currency,
                            paidBy: s.from,
                            split: [s.to],
                            date: today,
                            payment: true,
                          },
                        },
                        {
                          kind: 'paid',
                          title: money(s.amount, s.currency),
                          op: { type: 'expense.delete', expenseId },
                        },
                      )
                    }}
                  >
                    {t('markPaid')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="min-w-0">
        {adding ? (
          <div className="mb-6 rounded-2xl bg-mist p-5">
            <ExpenseForm
              value={{
                title: '',
                amount: 0,
                currency,
                paidBy: userId,
                split: planners,
                date: today,
                payment: false,
              }}
              people={planners}
              name={name}
              onCancel={() => setAdding(false)}
              onSave={(fields) => {
                dispatch({ type: 'expense.create', expenseId: crypto.randomUUID(), fields })
                setAdding(false)
              }}
            />
          </div>
        ) : (
          <button type="button" className="btn btn-primary mb-6" onClick={() => setAdding(true)}>
            {t('add')}
          </button>
        )}
        {expenses.length === 0 && !adding && (
          <div className="rounded-2xl bg-mist px-6 py-10">
            <h2 className="text-xl">{t('emptyTitle')}</h2>
            <p className="mt-2 text-ink-2">{t('emptyBody')}</p>
          </div>
        )}
        <ul className="grid gap-0.5">
          {ordered.map((e) => {
            const open = openId === e.id
            return (
              <li key={e.id} className={`rounded-2xl ${open ? 'bg-mist' : 'hover:bg-mist'}`}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : e.id)}
                  className="flex w-full items-baseline justify-between gap-4 rounded-2xl px-4 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block font-display text-xl leading-tight [overflow-wrap:anywhere]">
                      {e.title}
                    </span>
                    <span className="block text-sm text-ink-2">
                      {e.payment
                        ? t('paymentLine', { from: name(e.paidBy), to: name(e.split[0] ?? '') })
                        : t('line', {
                            name: name(e.paidBy),
                            count: e.split.length,
                            who: e.split.map(name).join(', '),
                          })}
                    </span>
                    <span className="block text-sm text-muted">
                      {formatDate(e.date, locale, { day: 'numeric', month: 'long' })}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{money(e.amount, e.currency)}</span>
                </button>
                {open && (
                  <div className="px-4 pb-5">
                    {e.payment ? (
                      <button type="button" className="btn" onClick={() => remove(e)}>
                        {t('remove')}
                      </button>
                    ) : (
                      <ExpenseForm
                        value={fieldsOf(e)}
                        people={[...new Set([...planners, e.paidBy, ...e.split])]}
                        name={name}
                        onCancel={() => setOpenId(null)}
                        onRemove={() => {
                          setOpenId(null)
                          remove(e)
                        }}
                        onSave={(fields) => {
                          dispatch({ type: 'expense.update', expenseId: e.id, fields })
                          setOpenId(null)
                        }}
                      />
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
