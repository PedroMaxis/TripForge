import { hasLocale } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { createTransport } from 'nodemailer'
import { routing } from '@/i18n/routing'
import { env } from './env'

export const canSendMail = () => env().SMTP_URL !== undefined

export async function sendPasswordReset({
  email,
  locale: wanted,
  token,
}: {
  email: string
  locale: string
  token: string
}) {
  const { SMTP_URL, MAIL_FROM, APP_URL } = env()
  if (!SMTP_URL) return
  const locale = hasLocale(routing.locales, wanted) ? wanted : routing.defaultLocale
  const t = await getTranslations({ locale, namespace: 'PasswordMail' })
  const link = new URL(`/${locale}/reset`, APP_URL)
  link.searchParams.set('token', token)
  await createTransport(SMTP_URL).sendMail({
    from: MAIL_FROM,
    to: email,
    subject: t('subject'),
    text: t('body', { link: link.href }),
  })
}
