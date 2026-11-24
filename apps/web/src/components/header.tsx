import { LocaleSwitcher } from './locale-switcher'
import { Logo } from './logo'

export function Header({ children, wide }: { children?: React.ReactNode; wide?: boolean }) {
  return (
    <header
      className={`mx-auto flex w-full flex-wrap items-center justify-between gap-x-6 px-4 py-3 ${
        wide ? 'max-w-7xl' : 'max-w-5xl'
      }`}
    >
      <Logo />
      <div className="flex flex-wrap items-center gap-x-6">
        <LocaleSwitcher />
        {children}
      </div>
    </header>
  )
}
