'use server'

import {
  acceptInvite,
  changeMember,
  createInvite,
  type InviteRole,
  revokeInvite,
} from '@tripforge/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { hasLocale } from 'next-intl'
import { z } from 'zod'
import { routing } from '@/i18n/routing'
import { getSession } from './auth'
import { db } from './db'
import { env } from './env'

const role = z.enum(['editor', 'viewer'])
const id = z.uuid()

async function userId() {
  const session = await getSession()
  if (!session) throw new Error('Not signed in')
  return session.user.id
}

const prefix = (locale: string) =>
  `/${hasLocale(routing.locales, locale) ? locale : routing.defaultLocale}`

const refresh = () => revalidatePath('/[locale]/trips/[tripId]/people', 'page')

export async function createInviteAction(tripId: string, wanted: InviteRole, locale: string) {
  const { token } = await createInvite(db(), await userId(), id.parse(tripId), role.parse(wanted))
  refresh()
  const page = wanted === 'viewer' ? 'see' : 'invite'
  return new URL(`${prefix(locale)}/${page}/${token}`, env().APP_URL).href
}

export async function revokeInviteAction(tripId: string, inviteId: string) {
  await revokeInvite(db(), await userId(), id.parse(tripId), id.parse(inviteId))
  refresh()
}

export async function changeRoleAction(tripId: string, memberId: string, wanted: InviteRole) {
  await changeMember(
    db(),
    await userId(),
    id.parse(tripId),
    z.string().parse(memberId),
    role.parse(wanted),
  )
  refresh()
}

export async function removeMemberAction(tripId: string, memberId: string) {
  await changeMember(db(), await userId(), id.parse(tripId), z.string().parse(memberId), null)
  refresh()
}

export async function leaveTripAction(tripId: string, locale: string) {
  const self = await userId()
  await changeMember(db(), self, id.parse(tripId), self, null)
  redirect(`${prefix(locale)}/trips`)
}

export async function acceptInviteAction(token: string, locale: string) {
  let tripId: string
  try {
    tripId = await acceptInvite(db(), await userId(), z.string().max(64).parse(token))
  } catch {
    // Gone in the meantime: the page says why.
    redirect(`${prefix(locale)}/invite/${encodeURIComponent(token)}`)
  }
  redirect(`${prefix(locale)}/trips/${tripId}`)
}
