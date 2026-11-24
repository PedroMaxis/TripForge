const coordinate = (value: unknown) =>
  value === '' || value === undefined || value === null ? null : Number(value)

/** Form fields are always text; coordinates have to become numbers, or nothing. */
export function readTripForm(form: Record<string, unknown>) {
  return {
    title: String(form.title ?? ''),
    destination: String(form.destination ?? ''),
    destinationLat: coordinate(form.destinationLat),
    destinationLng: coordinate(form.destinationLng),
    startDate: String(form.startDate ?? ''),
    endDate: String(form.endDate ?? ''),
    timezone: String(form.timezone ?? ''),
  }
}
