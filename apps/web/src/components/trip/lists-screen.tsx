'use client'

import { type Task, taskLists } from '@tripforge/core'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { AutoField } from './auto-field'
import { GroupPage, type GroupPageProps } from './group-page'
import type { TripScreenProps } from './use-trip-store'

export function ListsScreen(props: TripScreenProps) {
  const t = useTranslations('Lists')
  return (
    <GroupPage {...props} title={t('title')}>
      {(page) => (
        <div className="grid gap-10 md:grid-cols-2">
          {taskLists.map((list) => (
            <List key={list} list={list} {...page} />
          ))}
        </div>
      )}
    </GroupPage>
  )
}

function List({ list, group, trip, dispatch }: GroupPageProps & { list: Task['list'] }) {
  const t = useTranslations('Lists')
  const [title, setTitle] = useState('')
  const tasks = group.tasks.filter((task) => task.list === list)
  const done = tasks.filter((task) => task.done).length
  return (
    <section aria-label={t(`lists.${list}`)}>
      <h2 className="text-2xl">{t(`lists.${list}`)}</h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        {tasks.length > 0 ? t('progress', { done, count: tasks.length }) : t(`empty.${list}`)}
      </p>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!title.trim()) return
          const taskId = crypto.randomUUID()
          dispatch({ type: 'task.create', taskId, list, title: title.trim() })
          setTitle('')
        }}
      >
        <input
          aria-label={t(`add.${list}`)}
          placeholder={t(`add.${list}`)}
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          className="field min-w-0"
        />
        <button type="submit" className="btn btn-primary">
          {t('addButton')}
        </button>
      </form>
      <ul className="grid gap-0.5">
        {tasks.map((task) => (
          <li
            key={task.id}
            className="flex flex-wrap items-center gap-x-2 rounded-2xl px-2 py-1 hover:bg-mist"
          >
            <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
              <input
                type="checkbox"
                checked={task.done}
                aria-label={t('done', { title: task.title })}
                onChange={(event) =>
                  dispatch({
                    type: 'task.update',
                    taskId: task.id,
                    fields: { done: event.target.checked },
                  })
                }
                className="size-5 accent-accent"
              />
            </label>
            <AutoField
              aria-label={t('rename')}
              value={task.title}
              maxLength={200}
              required
              onSave={(value) =>
                dispatch({ type: 'task.update', taskId: task.id, fields: { title: value } })
              }
              className={`min-h-11 min-w-0 flex-1 rounded-lg px-2 ${task.done ? 'text-muted line-through' : ''}`}
            />
            <button
              type="button"
              aria-label={t('remove', { title: task.title })}
              onClick={() => dispatch({ type: 'task.delete', taskId: task.id })}
              className="grid size-11 shrink-0 place-items-center rounded-lg text-xl text-muted hover:text-ink"
            >
              <span aria-hidden="true">×</span>
            </button>
            <select
              aria-label={t('assignee', { title: task.title })}
              value={task.assigneeId ?? ''}
              onChange={(event) =>
                dispatch({
                  type: 'task.update',
                  taskId: task.id,
                  fields: { assigneeId: event.target.value || null },
                })
              }
              className="ml-[3.25rem] min-h-9 max-w-full rounded-lg bg-transparent px-1 text-sm text-ink-2"
            >
              <option value="">{t('anyone')}</option>
              {trip.members
                .filter((m) => m.role !== 'viewer' || m.userId === task.assigneeId)
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              {task.assigneeId && !trip.members.some((m) => m.userId === task.assigneeId) && (
                <option value={task.assigneeId}>{group.people[task.assigneeId]}</option>
              )}
            </select>
          </li>
        ))}
      </ul>
    </section>
  )
}
