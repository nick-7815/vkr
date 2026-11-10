import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import JournalNav from '@/components/dashboard/nav'
import LogoutButton from '@/components/logout-button'

const ROLE_LABELS: Record<string, string> = {
  student: 'Студентъ',
  supervisor: 'Наставникъ',
  reviewer: 'Рецензентъ',
  secretary: 'Секретарь',
  head: 'Заведующий кафедрой',
  deputy: 'Зам. заведующего',
}

export default async function JournalShell({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, is_active')
    .eq('id', user.id)
    .single()

  if (!profile) {
    await supabase.auth.signOut()
    redirect('/login')
  }
    if (profile.is_active === false) {
    await supabase.auth.signOut()
    redirect('/suspended')
  }

  const role = profile.role || 'student'
  const fullName = profile.full_name || user.email || ''

  const menuItems = [
    { href: '/dashboard', label: 'Дашбордъ' },
    ...(role === 'deputy'
      ? [
          { href: '/admin/users', label: 'Пользователи' },
          { href: '/supervisor/topics', label: 'Темы ВКР' },
          { href: '/deputy/cycles', label: 'Даты' },
        ]
      : []),
    ...(role === 'supervisor'
      ? [
          { href: '/supervisor/topics', label: 'Мои темы' },
          { href: '/supervisor/bibliography', label: 'Литература' },
        ]
      : []),

    ...(role === 'secretary'
      ? [
          { href: '/secretary/orders', label: 'Приказы' },
          { href: '/secretary/cycles', label: 'Циклы' },
        ]
      : []),
    ...(role === 'student'
      ? [
          { href: '/student/topics', label: 'Выборъ темы' },
          { href: '/student/bibliography', label: 'Литература' },
          { href: '/student/my-work', label: 'Моя работа' },
        ]
      : []),
  ]

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background text-foreground">
      {/* Латунный кант поверх всего приложения */}
      <div
        className="h-[2px] bg-gradient-to-r from-[#8A6B2F] via-[#C9A45C] to-[#8A6B2F] origin-left animate-ink-rule shrink-0"
        aria-hidden
      />

      {/* ══ Оглавление журнала ══ */}
            <aside className="w-full lg:w-64 shrink-0 bg-card border-b lg:border-b-0 lg:border-r border-border flex flex-col lg:sticky lg:top-0 lg:h-screen">
        <div className="px-5 py-4 lg:py-5 border-b border-border flex items-center gap-3.5 animate-fade-up">
          <div className="w-10 h-10 rounded-full border-2 border-[#8C2F1B] bg-card flex items-center justify-center shadow-[inset_0_0_0_2px_#FDFBF5,inset_0_0_0_3px_rgba(176,141,70,0.4)] shrink-0">
            <span className="font-display text-[13px] font-bold text-[#8C2F1B]">ВКР</span>
          </div>
          <div className="min-w-0">
            <p className="font-display text-lg font-bold tracking-tight leading-none [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
              Журналъ ВКР
            </p>
            <p className="text-sm text-muted-foreground italic truncate mt-0.5">{fullName}</p>
            <span className="inline-block mt-1.5 px-2.5 py-0.5 bg-[#8C2F1B]/10 border border-[#8C2F1B]/25 text-[#8C2F1B] font-display text-[9px] uppercase tracking-[0.18em]">
              {ROLE_LABELS[role] ?? role}
            </span>
          </div>

          <div className="ml-auto lg:hidden">
            <LogoutButton compact />
          </div>
        </div>

        <p className="hidden lg:block px-5 pt-4 pb-1 font-display text-[9px] uppercase tracking-[0.36em] text-muted-foreground animate-fade-up [animation-delay:150ms]">
          Оглавление
        </p>

        <div className="flex-1 overflow-y-auto">
          <JournalNav items={menuItems} />
        </div>

        <div className="hidden lg:block p-4 border-t border-border mt-auto animate-fade-up [animation-delay:300ms]">
          <LogoutButton />
        </div>
      </aside>

      {/* ══ Разворот ведомости ══ */}
      <main className="flex-1 relative p-5 sm:p-8 lg:p-12">
        {/* бумажная текстура */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
          aria-hidden
        />
        <div className="relative max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  )
}