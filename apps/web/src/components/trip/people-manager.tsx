'use client'

import type { Role, TripMember } from '@tripforge/core'
import { useLocale, useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { formatDate } from '@/lib/dates'
import {
  changeRoleAction,
  createInviteAction,
  leaveTripAction,
  removeMemberAction,
  revokeInviteAction,
} from '@/lib/sharing'

type GuestRole = 'editor' | 'viewer'
const guestRoles: GuestRole[] = ['editor', 'viewer']

export function PeopleManager({
  tripId,
  isOwner,
  selfId,
  members,
  invites,
}: {
  tripId: string
  isOwner: boolean
  selfId: string
  members: TripMember[]
  invites: { id: string; role: Role; expiresOn: string }[]
}) {
  const t = useTranslations('People')
  const locale = useLocale()
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [role, setRole] = useState<GuestRole>('editor')
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function run(action: () => Promise<unknown>) {
    setFailed(false)
    start(async () => {
      try {
        await action()
      } catch {
        setFailed(true)
      }
    })
  }

  return (
    <div className="grid gap-12 md:grid-cols-2">
      <section>
        <h2 className="mb-3 text-2xl">{t('members')}</h2>
        <ul className="grid gap-1">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex flex-wrap items-center gap-3 rounded-2xl px-3 py-2 hover:bg-mist"
            >
              <span
                aria-hidden="true"
                className="grid size-9 place-items-center rounded-full bg-soft font-medium"
              >
                {m.name.trim().slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                {m.name}
                {m.userId === selfId && <span className="text-muted"> ({t('you')})</span>}
              </span>
              {isOwner && m.role !== 'owner' ? (
                <>
                  <select
                    aria-label={t('roleOf', { name: m.name })}
                    value={m.role}
                    disabled={pending}
                    onChange={(event) =>
                      run(() => changeRoleAction(tripId, m.userId, event.target.value as GuestRole))
                    }
                    className="field w-auto"
                  >
                    {guestRoles.map((r) => (
                      <option key={r} value={r}>
                        {t(`roles.${r}`)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn"
                    aria-label={t('removeName', { name: m.name })}
                    onClick={() => setRemoving(m.userId)}
                  >
                    {t('remove')}
                  </button>
                </>
              ) : (
                <span className="text-sm text-ink-2">{t(`roles.${m.role}`)}</span>
              )}
              {removing === m.userId && (
                <div className="basis-full rounded-2xl bg-warm p-4">
                  <p>{t('removeConfirm', { name: m.name })}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className="btn"
                      disabled={pending}
                      onClick={() => {
                        setRemoving(null)
                        setLink(null)
                        run(() => removeMemberAction(tripId, m.userId))
                      }}
                    >
                      {t('removeYes')}
                    </button>
                    <button type="button" className="btn" onClick={() => setRemoving(null)}>
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        {!isOwner && (
          <div className="mt-6">
            {leaving ? (
              <div className="rounded-2xl bg-warm p-4">
                <p>{t('leaveConfirm')}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="btn"
                    disabled={pending}
                    onClick={() => start(() => leaveTripAction(tripId, locale))}
                  >
                    {t('leaveYes')}
                  </button>
                  <button type="button" className="btn" onClick={() => setLeaving(false)}>
                    {t('cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn" onClick={() => setLeaving(true)}>
                {t('leave')}
              </button>
            )}
          </div>
        )}
      </section>

      {isOwner && (
        <section>
          <h2 className="mb-3 text-2xl">{t('invite')}</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="invite-role" className="text-sm font-medium">
                {t('inviteRole')}
              </label>
              <select
                id="invite-role"
                value={role}
                onChange={(event) => setRole(event.target.value as GuestRole)}
                className="field mt-1"
              >
                {guestRoles.map((r) => (
                  <option key={r} value={r}>
                    {t(`links.${r}`)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  setLink(await createInviteAction(tripId, role, locale))
                  setCopied(false)
                })
              }
            >
              {t('create')}
            </button>
          </div>
          {link && (
            <div className="mt-4 rounded-2xl bg-mist p-4">
              <label htmlFor="invite-link" className="text-sm font-medium">
                {t('link')}
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="invite-link"
                  readOnly
                  value={link}
                  onFocus={(event) => event.target.select()}
                  className="field min-w-0"
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}
                >
                  {copied ? t('copied') : t('copy')}
                </button>
              </div>
              <p className="mt-2 text-sm text-ink-2">
                {t(link.includes('/see/') ? 'linkView' : 'linkEdit')}
              </p>
            </div>
          )}
          {invites.length > 0 && (
            <ul className="mt-6 grid gap-1">
              {invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl px-3 py-2 hover:bg-mist"
                >
                  <span className="min-w-0 flex-1">
                    {t(`links.${invite.role === 'viewer' ? 'viewer' : 'editor'}`)}
                    <span className="block text-sm text-muted">
                      {t('expires', {
                        date: formatDate(invite.expiresOn, locale, { dateStyle: 'long' }),
                      })}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn"
                    disabled={pending}
                    onClick={() => {
                      setLink(null)
                      run(() => revokeInviteAction(tripId, invite.id))
                    }}
                  >
                    {t('revoke')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <p role="alert" className="text-danger empty:hidden">
        {failed && t('failed')}
      </p>
    </div>
  )
}
