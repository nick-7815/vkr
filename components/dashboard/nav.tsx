'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = { href: string; label: string }

function roman(n: number): string {
  const map: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  for (const [v, s] of map) {
    while (n >= v) {
      out += s
      n -= v
    }
  }
  return out
}

export default function JournalNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Оглавление"
      className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible px-4 py-3 lg:py-4"
    >
      {items.map((item, i) => {
        const active =
          item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`group shrink-0 flex items-center gap-3 px-3 py-2.5 text-sm transition-all duration-200 border ${
              active
                ? 'bg-[#8C2F1B] border-[#6E2415] text-[#F3EDDF] shadow-[inset_0_0_0_1px_rgba(243,237,223,0.25)]'
                : 'border-transparent text-foreground/75 hover:bg-secondary hover:text-foreground hover:border-[#B08D46]/40'
            }`}
          >
            <span
              className={`font-display text-[12px] w-5 text-center ${
                active ? 'text-[#C9A45C]' : 'text-muted-foreground group-hover:text-[#8C2F1B]'
              }`}
            >
              {roman(i + 1)}
            </span>
            <span className="font-display text-[13px] whitespace-nowrap">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}