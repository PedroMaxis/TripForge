import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Header } from '@/components/header'
import { ResetForm } from '@/components/password-forms'

export const metadata: Metadata = { robots: { index: false }, referrer: 'no-referrer' }

type Props = { searchParams: Promise<{ token?: string | string[] }> }

export default async function ResetPage({ searchParams }: Props) {
  const { token } = await searchParams
  if (typeof token !== 'string') notFound()
  const t = await getTranslations('Password')
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="mb-8 text-4xl">{t('resetTitle')}</h1>
        <ResetForm token={token} />
      </main>
    </>
  )
}
