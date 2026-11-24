import { LocaleSwitcher } from './locale-switcher'

export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-4">
      <span className="text-lg font-semibold">TripForge</span>
      <div className="flex flex-wrap items-center gap-x-6">
        <LocaleSwitcher />
        {children}
      </div>
    </header>
  )
}
