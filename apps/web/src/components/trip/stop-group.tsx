'use client'

import type { Attachment, Operation, TripGroup, TripItem } from '@tripforge/core'
import { useLocale, useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { type UploadError, uploadAttachment } from '@/lib/attachments'
import { AutoField } from './auto-field'

export type GroupTools = {
  tripId: string
  group: TripGroup
  userId: string
  isOwner: boolean
  timezone: string
  dispatch: (op: Operation) => void
  /** A file arrived at the server: time to hear about it. */
  onUploaded: () => void
}

const summary =
  'flex min-h-11 cursor-pointer items-center rounded-full bg-paper px-4 text-sm font-bold hover:bg-soft'

const Chevron = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="ml-auto transition-transform group-open:rotate-180"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
)

/** What the group keeps about a stop: the booking, files and comments. */
export function StopGroup({ item, tools }: { item: TripItem; tools: GroupTools }) {
  const t = useTranslations('Group')
  const { group, dispatch } = tools
  const id = useId()
  const booking = group.bookings.find((b) => b.itemId === item.id)
  const files = group.attachments.filter((a) => a.itemId === item.id)
  const comments = group.comments.filter((c) => c.itemId === item.id)
  const isBooked = Boolean(booking?.code || booking?.details)

  const bookingField = (name: 'code' | 'details') => (
    <div>
      <label htmlFor={`${id}-${name}`} className="text-sm font-medium">
        {t(name)}
      </label>
      <AutoField
        id={`${id}-${name}`}
        value={booking?.[name] ?? ''}
        maxLength={name === 'code' ? 120 : 2000}
        multiline={name === 'details'}
        autoComplete="off"
        onSave={(value) =>
          dispatch({ type: 'item.booking', itemId: item.id, fields: { [name]: value } })
        }
        className="field mt-1"
      />
    </div>
  )

  return (
    <div className="grid gap-2 sm:col-span-2">
      <details className="group">
        <summary className={summary}>
          {isBooked ? t('booked') : t('booking')}
          <Chevron />
        </summary>
        <div className="grid gap-3 py-3">
          {bookingField('code')}
          {bookingField('details')}
        </div>
      </details>
      <details className="group">
        <summary className={summary}>
          {t('files', { count: files.length })}
          <Chevron />
        </summary>
        <Files item={item} files={files} tools={tools} />
      </details>
      <details className="group">
        <summary className={summary}>
          {t('comments', { count: comments.length })}
          <Chevron />
        </summary>
        <Comments item={item} comments={comments} tools={tools} />
      </details>
      <p className="px-1 text-xs text-muted">{t('private')}</p>
    </div>
  )
}

function Files({ item, files, tools }: { item: TripItem; files: Attachment[]; tools: GroupTools }) {
  const t = useTranslations('Group')
  const locale = useLocale()
  const id = useId()
  const [state, setState] = useState<'idle' | 'sending' | UploadError>('idle')
  const size = (bytes: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
      Math.max(0.1, bytes / 1024 / 1024),
    )

  async function send(file: File) {
    setState('sending')
    const error = await uploadAttachment(tools.tripId, item.id, file)
    setState(error ?? 'idle')
    if (!error) tools.onUploaded()
  }

  return (
    <div className="grid gap-2 py-3">
      <ul className="grid gap-1">
        {files.map((file) => (
          <li key={file.id} className="flex items-center gap-2">
            <a
              href={`/api/trips/${tools.tripId}/attachments/${file.id}`}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 py-2 text-accent underline underline-offset-4 [overflow-wrap:anywhere]"
            >
              {file.name}
            </a>
            <span className="text-sm text-muted tabular-nums">{size(file.size)} MB</span>
            <button
              type="button"
              aria-label={t('removeFile', { name: file.name })}
              onClick={() => tools.dispatch({ type: 'attachment.delete', attachmentId: file.id })}
              className="grid size-11 shrink-0 place-items-center rounded-lg text-xl text-muted hover:text-ink"
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
      </ul>
      <label htmlFor={id} className="text-sm font-medium">
        {t('addFile')}
      </label>
      <input
        id={id}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        disabled={state === 'sending'}
        onChange={(event) => {
          const [file] = event.target.files ?? []
          event.target.value = ''
          if (file) void send(file)
        }}
        className="max-w-full text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-full file:border file:border-line file:bg-paper file:px-4 file:font-bold"
      />
      <p role="status" className="text-sm text-ink-2 empty:hidden">
        {state === 'sending' && t('sending')}
        {state !== 'idle' && state !== 'sending' && (
          <span className="text-danger">{t(`uploadErrors.${state}`)}</span>
        )}
      </p>
    </div>
  )
}

function Comments({
  item,
  comments,
  tools,
}: {
  item: TripItem
  comments: TripGroup['comments']
  tools: GroupTools
}) {
  const t = useTranslations('Group')
  const locale = useLocale()
  const id = useId()
  const [body, setBody] = useState('')
  const { group, userId, isOwner, timezone, dispatch } = tools
  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: timezone,
  })
  return (
    <div className="grid gap-3 py-3">
      <ul className="grid gap-3">
        {comments.map((c) => (
          <li key={c.id} className="rounded-2xl bg-paper px-4 py-3">
            <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
              <strong className="font-bold">
                {c.userId === userId ? t('you') : (group.people[c.userId] ?? '?')}
              </strong>
              <time dateTime={c.at} className="text-muted">
                {when.format(new Date(c.at))}
              </time>
              {(isOwner || c.userId === userId) && (
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'comment.delete', commentId: c.id })}
                  className="ml-auto min-h-8 text-muted underline underline-offset-4 hover:text-ink"
                >
                  {t('removeComment')}
                </button>
              )}
            </p>
            <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{c.body}</p>
          </li>
        ))}
      </ul>
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!body.trim()) return
          const commentId = crypto.randomUUID()
          dispatch({ type: 'comment.create', commentId, itemId: item.id, body: body.trim() })
          setBody('')
        }}
      >
        <label htmlFor={id} className="text-sm font-medium">
          {t('newComment')}
        </label>
        <textarea
          id={id}
          value={body}
          rows={2}
          maxLength={2000}
          onChange={(event) => setBody(event.target.value)}
          className="field"
        />
        <button type="submit" className="btn justify-self-start">
          {t('sendComment')}
        </button>
      </form>
    </div>
  )
}
