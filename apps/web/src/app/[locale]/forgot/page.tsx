import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Header } from '@/components/header'
import { ForgotForm } from '@/components/password-forms'
import { canSendMail } from '@/lib/mail'

export const dynamic = 'force-dynamic'

export default async function ForgotPage() {
  if (!canSendMail()) notFound()
  const t = await getTranslations('Password')
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-4xl">{t('forgotTitle')}</h1>
        <p className="mt-3 mb-8 text-ink-2">{t('forgotBody')}</p>
        <ForgotForm />
      </main>
    </>
  )
}
