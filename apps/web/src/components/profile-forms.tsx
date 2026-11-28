'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { useRouter } from '@/i18n/navigation'
import { authClient } from '@/lib/auth-client'
import { forgetTrips } from '@/lib/offline-trips'
import { Field } from './account-form'

const formClass = 'flex max-w-sm flex-col gap-4'
type State = 'idle' | 'pending' | 'saved' | 'wrong' | 'length' | 'tooMany' | 'failed'

function Outcome({ state }: { state: State }) {
  const t = useTranslations('Profile')
  if (state === 'idle' || state === 'pending') return null
  if (state === 'saved') return <p role="status">{t('saved')}</p>
  return (
    <p role="alert" className="text-danger">
      {t(`errors.${state}`)}
    </p>
  )
}

export function NameForm({ name }: { name: string }) {
  const t = useTranslations('Profile')
  const router = useRouter()
  const [state, setState] = useState<State>('idle')
  return (
    <form
      className={formClass}
      onSubmit={async (event) => {
        event.preventDefault()
        const next = String(new FormData(event.currentTarget).get('name')).trim()
        setState('pending')
        const result = await authClient.updateUser({ name: next }).catch(() => null)
        setState(result && !result.error ? 'saved' : 'failed')
        router.refresh()
      }}
    >
      <Field
        label={t('nameLabel')}
        name="name"
        defaultValue={name}
        autoComplete="name"
        maxLength={80}
        pattern=".*\S.*"
      />
      <Outcome state={state} />
      <button type="submit" disabled={state === 'pending'} className="btn self-start">
        {t('save')}
      </button>
    </form>
  )
}

export function PasswordForm() {
  const t = useTranslations('Profile')
  const [state, setState] = useState<State>('idle')
  return (
    <form
      method="post"
      className={formClass}
      onSubmit={async (event) => {
        event.preventDefault()
        const element = event.currentTarget
        const form = new FormData(element)
        setState('pending')
        const result = await authClient
          .changePassword({
            currentPassword: String(form.get('current')),
            newPassword: String(form.get('new')),
            revokeOtherSessions: true,
          })
          .catch(() => null)
        if (result && !result.error) {
          element.reset()
          return setState('saved')
        }
        const { code, status } = result?.error ?? {}
        if (status === 429) setState('tooMany')
        else if (code === 'INVALID_PASSWORD') setState('wrong')
        else if (code === 'PASSWORD_TOO_SHORT' || code === 'PASSWORD_TOO_LONG') setState('length')
        else setState('failed')
      }}
    >
      <Field
        label={t('currentPassword')}
        name="current"
        type="password"
        autoComplete="current-password"
        maxLength={128}
      />
      <Field
        label={t('newPassword')}
        name="new"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        hint={t('passwordHint')}
      />
      <Outcome state={state} />
      <button type="submit" disabled={state === 'pending'} className="btn self-start">
        {t('changePassword')}
      </button>
    </form>
  )
}

export function DeleteAccount() {
  const t = useTranslations('Profile')
  const locale = useLocale()
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [state, setState] = useState<State>('idle')

  if (!asking) {
    return (
      <button type="button" className="btn" onClick={() => setAsking(true)}>
        {t('delete')}
      </button>
    )
  }
  return (
    <form
      method="post"
      className={formClass}
      onSubmit={async (event) => {
        event.preventDefault()
        const password = String(new FormData(event.currentTarget).get('password'))
        setState('pending')
        const res = await fetch('/api/account/delete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password, locale }),
        }).catch(() => null)
        if (res?.ok) {
          await forgetTrips()
          router.replace('/')
          router.refresh()
          return
        }
        setState(res?.status === 403 ? 'wrong' : res?.status === 429 ? 'tooMany' : 'failed')
      }}
    >
      <Field
        label={t('confirmPassword')}
        name="password"
        type="password"
        autoComplete="current-password"
        maxLength={128}
      />
      <Outcome state={state} />
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={state === 'pending'}
          className="btn border-danger text-danger"
        >
          {t('deleteForever')}
        </button>
        <button type="button" className="btn" onClick={() => setAsking(false)}>
          {t('cancel')}
        </button>
      </div>
    </form>
  )
}
