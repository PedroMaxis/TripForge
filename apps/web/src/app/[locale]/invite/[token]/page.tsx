import { findInvite } from '@tripforge/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { AccountForm } from '@/components/account-form'
import { Header } from '@/components/header'
import { Link, redirect } from '@/i18n/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { canSendMail } from '@/lib/mail'
import { acceptInviteAction } from '@/lib/sharing'

export const metadata: Metadata = { robots: { index: false }, referrer: 'no-referrer' }

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await findInvite(db(), token)
  if (invite.status === 'unknown') notFound()
  const locale = await getLocale()
  // Looking needs no account, so there is nothing to accept.
  if (invite.status === 'ok' && invite.role === 'viewer')
    redirect({ href: `/see/${token}`, locale })
  const session = await getSession()
  const t = await getTranslations('Invite')
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-10">
        {invite.status === 'ok' ? (
          <>
            <h1 className="text-5xl">{invite.title}</h1>
            <p className="mt-4 mb-8 text-lg text-ink-2">
              {t(`as.${invite.role}`, { name: invite.inviter })}
            </p>
            {session ? (
              <form action={acceptInviteAction.bind(null, token, locale)}>
                <button type="submit" className="btn btn-primary">
                  {t('join')}
                </button>
              </form>
            ) : (
              <>
                <p className="mb-6">{t('signInFirst')}</p>
                <AccountForm mode="signIn" next={`/invite/${token}`} canRecover={canSendMail()} />
              </>
            )}
          </>
        ) : (
          <>
            <h1 className="text-4xl">{t(`gone.${invite.status}`)}</h1>
            <p className="mt-4 mb-8 text-ink-2">{t('gone.ask')}</p>
            <Link href="/trips" className="btn">
              {t('back')}
            </Link>
          </>
        )}
      </main>
    </>
  )
}
