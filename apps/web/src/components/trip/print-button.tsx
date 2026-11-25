'use client'

export function PrintButton({ children }: { children: React.ReactNode }) {
  return (
    <button type="button" className="btn btn-primary" onClick={() => print()}>
      {children}
    </button>
  )
}
