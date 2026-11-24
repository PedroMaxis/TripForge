import { notFound } from 'next/navigation'

// Sends unknown paths to the translated not-found page.
export default function CatchAll() {
  notFound()
}
