'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { Link } from '@/i18n/navigation'
import { authClient } from '@/lib/auth-client'
import { Field } from './account-form'

const formClass = 'flex max-w-sm flex-col gap-4'

export function ForgotForm() {
  const t = useTranslations('Password')
  const locale = useLocale()
  const [state, setState] = useState<'idle' | 'pending' | 'sent' | 'tooMany' | 'failed'>('idle')

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email')).trim()
    setState('pending')
    const result = await authClient
      .requestPasswordReset({ email, redirectTo: `/${locale}/reset` })
      .catch(() => null)
    setState(
      result && !result.error ? 'sent' : result?.error?.status === 429 ? 'tooMany' : 'failed',
    )
  }

  if (state === 'sent') {
    return (
      <p role="status" className="max-w-prose rounded-2xl bg-mist p-5">
        {t('sent')}
      </p>
    )
  }
  return (
    <form method="post" onSubmit={submit} className={formClass}>
      <Field label={t('email')} name="email" type="email" autoComplete="email" maxLength={254} />
      <p role="alert" className="text-danger empty:hidden">
        {(state === 'tooMany' || state === 'failed') && t(state)}
      </p>
      <button type="submit" disabled={state === 'pending'} className="btn btn-primary">
        {t('send')}
      </button>
    </form>
  )
}

export function ResetForm({ token }: { token: string }) {
  const t = useTranslations('Password')
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'invalid' | 'failed'>('idle')

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const newPassword = String(new FormData(event.currentTarget).get('password'))
    setState('pending')
    const result = await authClient.resetPassword({ newPassword, token }).catch(() => null)
    if (result && !result.error) setState('done')
    else setState(result?.error?.status === 400 ? 'invalid' : 'failed')
  }

  if (state === 'done') {
    return (
      <div className="grid max-w-sm gap-4">
        <p role="status" className="rounded-2xl bg-mist p-5">
          {t('done')}
        </p>
        <Link href="/" className="btn btn-primary">
          {t('signIn')}
        </Link>
      </div>
    )
  }
  return (
    <form method="post" onSubmit={submit} className={formClass}>
      <Field
        label={t('newPassword')}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        hint={t('hint')}
      />
      <p role="alert" className="text-danger empty:hidden">
        {(state === 'invalid' || state === 'failed') && t(state)}
      </p>
      <button type="submit" disabled={state === 'pending'} className="btn btn-primary">
        {t('save')}
      </button>
    </form>
  )
}
