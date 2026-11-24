import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'

export default function NotFound() {
  const t = useTranslations('NotFound')
  return (
    <main className="mx-auto max-w-5xl px-4 py-24">
      <h1 className="text-3xl">{t('title')}</h1>
      <Link href="/" className="mt-4 inline-block text-accent underline">
        {t('back')}
      </Link>
    </main>
  )
}
