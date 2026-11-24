import { LocaleSwitcher } from './locale-switcher'
import { Logo } from './logo'

export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-6 px-4 py-3">
      <Logo />
      <div className="flex flex-wrap items-center gap-x-6">
        <LocaleSwitcher />
        {children}
      </div>
    </header>
  )
}
