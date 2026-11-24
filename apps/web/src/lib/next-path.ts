/** Where to go after signing in. Only an invite is ever accepted, so no link can send people away. */
export function safeNext(next: string | string[] | undefined) {
  return typeof next === 'string' && /^\/invite\/[\w-]{20,64}$/.test(next) ? next : undefined
}
