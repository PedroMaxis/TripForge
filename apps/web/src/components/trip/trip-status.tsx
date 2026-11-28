import type { Operation } from '@tripforge/core'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import type { Notice, SyncState, Undo } from '@/lib/trip-store'

/** Whether everything is saved, and why not. */
export function SyncStatus({ sync, quiet }: { sync: SyncState; quiet?: boolean }) {
  const t = useTranslations('Trip')
  return (
    <span
      data-testid="sync"
      data-state={sync}
      role="status"
      className={
        sync === 'offline' || sync === 'signedOut'
          ? 'min-w-0 rounded-full bg-warm px-3 py-1 text-sm'
          : 'text-sm text-muted max-sm:sr-only'
      }
    >
      {quiet ? null : t(sync)}
      {sync === 'signedOut' && (
        <>
          {' '}
          <Link href="/sign-in" className="font-bold underline underline-offset-4">
            {t('signIn')}
          </Link>
        </>
      )}
    </span>
  )
}

/** What just happened, and the way back. */
export function Toast({
  undo,
  notice,
  canEdit,
  dispatch,
}: {
  undo: Undo | null
  notice: Notice | null
  canEdit: boolean
  dispatch: (op: Operation) => void
}) {
  const t = useTranslations('Trip')
  const undoOp: Operation | null = undo
    ? undo.op
    : notice?.kind === 'deletedByOther' && canEdit
      ? { type: 'item.restore', itemId: notice.itemId }
      : null

  function noticeText(current: Notice) {
    switch (current.kind) {
      case 'rejected':
        return t('rejected')
      case 'deletedByOther':
        return current.userName
          ? t('deletedBy', { title: current.title, name: current.userName })
          : t('deleted', { title: current.title })
      case 'overwritten':
        return t('overwritten', { title: current.title, name: current.userName })
    }
  }

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-36"
    >
      {(undo || notice) && (
        <div className="pointer-events-auto flex min-h-12 max-w-full items-center gap-3 rounded-3xl bg-ink py-1 pr-1 pl-5 text-sm text-paper">
          <span className="min-w-0 py-2 pr-3 [overflow-wrap:anywhere]">
            {undo ? t(undo.kind, { title: undo.title }) : notice && noticeText(notice)}
          </span>
          {undoOp && (
            <button
              type="button"
              onClick={() => dispatch(undoOp)}
              className="min-h-10 shrink-0 rounded-full bg-paper px-4 font-bold text-ink hover:bg-soft focus-visible:outline-paper"
            >
              {t('undo')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function Revoked() {
  const t = useTranslations('Trip')
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-4xl">{t('revoked')}</h1>
      <p className="mt-4 mb-8 text-ink-2">{t('revokedBody')}</p>
      <Link href="/trips" className="btn">
        {t('myTrips')}
      </Link>
    </main>
  )
}
