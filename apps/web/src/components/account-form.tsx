'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { Link, useRouter } from '@/i18n/navigation'
import { authClient } from '@/lib/auth-client'

type Mode = 'signIn' | 'signUp'
type Failure = { status: number; code?: string }

function errorKey({ status, code }: Failure) {
  if (status === 429) return 'tooManyAttempts'
  if (code === 'INVALID_EMAIL_OR_PASSWORD') return 'wrongCredentials'
  if (code?.startsWith('USER_ALREADY_EXISTS')) return 'emailTaken'
  if (code === 'INVALID_EMAIL') return 'invalidEmail'
  if (code === 'PASSWORD_TOO_SHORT' || code === 'PASSWORD_TOO_LONG') return 'passwordLength'
  return 'unexpected'
}

export function AccountForm({ mode }: { mode: Mode }) {
  const t = useTranslations('Account')
  const locale = useLocale()
  const router = useRouter()
  const [error, setError] = useState<ReturnType<typeof errorKey>>()
  const [pending, setPending] = useState(false)
  const isSignUp = mode === 'signUp'

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')).trim()
    const password = String(form.get('password'))
    const name = String(form.get('name') ?? '').trim()
    setError(undefined)
    setPending(true)
    try {
      const result = isSignUp
        ? await authClient.signUp.email({ name, email, password, locale })
        : await authClient.signIn.email({ email, password })
      if (result.error) {
        setError(errorKey(result.error))
        setPending(false)
        return
      }
      // Stays pending until the trips page replaces the form.
      router.replace('/trips')
      router.refresh()
    } catch {
      setError('unexpected')
      setPending(false)
    }
  }

  return (
    // "post" keeps the password out of the URL if the form is sent before JavaScript loads.
    <form method="post" onSubmit={submit} className="flex max-w-sm flex-col gap-4">
      {isSignUp && (
        <Field label={t('name')} name="name" autoComplete="name" maxLength={80} pattern=".*\S.*" />
      )}
      <Field label={t('email')} name="email" type="email" autoComplete="email" maxLength={254} />
      <Field
        label={t('password')}
        name="password"
        type="password"
        autoComplete={isSignUp ? 'new-password' : 'current-password'}
        minLength={isSignUp ? 8 : undefined}
        maxLength={128}
        hint={isSignUp ? t('passwordHint') : undefined}
      />
      <p role="alert" className="text-danger empty:hidden">
        {error && t(`errors.${error}`)}
      </p>
      <button
        type="submit"
        disabled={pending}
        className="cursor-pointer rounded-lg bg-accent px-4 py-3 font-medium text-accent-fg hover:opacity-90 disabled:cursor-default disabled:opacity-60"
      >
        {isSignUp ? t('createAccount') : t('signIn')}
      </button>
      <Link href={isSignUp ? '/' : '/sign-up'} className="py-2 text-accent underline">
        {isSignUp ? t('goToSignIn') : t('goToSignUp')}
      </Link>
    </form>
  )
}

function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & React.ComponentProps<'input'>) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <input
        {...input}
        id={id}
        required
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-1 block w-full rounded-lg border border-line bg-bg px-3 py-3 text-base"
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  )
}
