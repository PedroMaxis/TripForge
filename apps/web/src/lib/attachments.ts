const maxBytes = 5 * 1024 * 1024
const errors = ['bad_type', 'too_large', 'full', 'failed'] as const
export type UploadError = (typeof errors)[number]

/** Sends a file to a stop. Says what went wrong, or null. */
export async function uploadAttachment(
  tripId: string,
  itemId: string,
  file: File,
): Promise<UploadError | null> {
  if (file.size > maxBytes) return 'too_large'
  const query = new URLSearchParams({ item: itemId, op: crypto.randomUUID(), name: file.name })
  try {
    const res = await fetch(`/api/trips/${tripId}/attachments?${query}`, {
      method: 'POST',
      // Not a type a form can send, so no other site can make a browser do this.
      headers: { 'content-type': 'application/octet-stream' },
      body: file,
    })
    if (res.ok) return null
    const { error } = (await res.json()) as { error: UploadError }
    return errors.includes(error) ? error : 'failed'
  } catch {
    return 'failed'
  }
}
