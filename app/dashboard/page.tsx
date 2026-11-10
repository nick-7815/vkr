import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

const MONTHS_NOM = [
  'ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТЪ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ',
  'ИЮЛЬ', 'АВГУСТЪ', 'СЕНТЯБРЬ', 'ОКТЯБРЬ', 'НОЯБРЬ', 'ДЕКАБРЬ',
]

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

/* Латунные уголки ведомости */
function Corners() {
  const base = 'absolute w-4 h-4 border-[#B08D46] pointer-events-none'
  return (
    <>
      <span className={`${base} top-1 left-1 border-t border-l`} />
      <span className={`${base} top-1 right-1 border-t border-r`} />
      <span className={`${base} bottom-1 left-1 border-b border-l`} />
      <span className={`${base} bottom-1 right-1 border-b border-r`} />
    </>
  )
}

/* Отрывной календарь: красная шапка, отверстия подвеса, крупное число */
function CalendarPlate({ date }: { date: Date }) {
  return (
    <div className="w-[86px] shrink-0 animate-fade-up [animation-delay:150ms]">
      <div className="relative bg-[#8C2F1B] text-[#F3EDDF] text-center pt-2.5 pb-1.5 font-display text-[10px] tracking-[0.24em] uppercase border border-[#6E2415] shadow-[inset_0_1px_0_rgba(243,237,223,0.3)]">
        {/* отверстия подвеса */}
        <span className="absolute top-1 left-2.5 w-1.5 h-1.5 rounded-full bg-background border border-[#6E2415]" aria-hidden />
        <span className="absolute top-1 right-2.5 w-1.5 h-1.5 rounded-full bg-background border border-[#6E2415]" aria-hidden />
        {MONTHS_NOM[date.getMonth()]}
      </div>
      <div className="bg-card border border-t-0 border-[#B08D46]/50 text-center pt-1.5 pb-2 shadow-[0_8px_18px_-10px_rgba(43,33,24,0.4)]">
        <div className="font-display text-[2rem] font-bold leading-none [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
          {date.getDate()}
        </div>
        <div className="font-display text-[9px] tracking-[0.28em] text-muted-foreground mt-1">
          {date.getFullYear()}
        </div>
        {/* зубчики отрыва */}
        <div
          className="h-1.5 mt-1.5 bg-[radial-gradient(circle_at_4px_0,transparent_3px,#F3EDDF_3px)] bg-[size:8px_6px] bg-repeat-x"
          aria-hidden
        />
      </div>
    </div>
  )
}

/* Штемпель: двойная рамка, поворот, «впечатан» в бумагу */
function RubberStamp({
  text,
  tone = 'wax',
  rotate = -7,
  delay = 700,
}: {
  text: string
  tone?: 'wax' | 'muted'
  rotate?: number
  delay?: number
}) {
  const color = tone === 'wax' ? 'text-[#8C2F1B]/75 border-[#8C2F1B]/60' : 'text-muted-foreground/60 border-muted-foreground/40'
  return (
    <span
      className={`inline-block border-2 font-display text-[10px] tracking-[0.26em] uppercase px-3 py-1.5 select-none animate-stamp ${color}`}
      style={{
        transform: `rotate(${rotate}deg)`,
        animationDelay: `${delay}ms`,
        boxShadow: 'inset 0 0 0 1.5px currentColor, inset 0 0 0 3.5px transparent',
        mixBlendMode: 'multiply',
        opacity: 0.9,
      }}
      aria-hidden
    >
      {text}
    </span>
  )
}

/* Строка реестра с точечным лидером */
function LedgerRow({
  label, value, delay,
}: { label: string; value: string | number | null; delay: number }) {
  return (
    <div
      className="flex items-end gap-2 py-3.5 border-b border-border/60 last:border-0 animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="text-sm text-foreground/85">{label}</span>
      <span
        className="flex-1 border-b-2 border-dotted border-[#B08D46]/45 mb-1.5 min-w-8"
        aria-hidden
      />
      <span className="font-display text-2xl font-semibold text-right min-w-[3ch]">
        {value ?? '—'}
      </span>
    </div>
  )
}

const STAGES = ['Тема', 'Приказ', 'Просмотры', 'Нормоконтроль', 'Защита']

const STAGE_LABELS: Record<string, string> = {
  applications: 'Каталогъ и подача',
  bibliography: 'Библиография',
  screening1: 'Просмотръ №1',
  screening2: 'Просмотръ №2',
  code_review: 'Ревью кода',
  upload_pdf: 'Сдача PDF',
  normcontrol: 'Нормоконтроль',
  predefense: 'Предзащита',
  defense: 'Защита',
}

const fmt = (d: string) =>
  new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

type WindowRow = { stage: string; starts_on: string; ends_on: string }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'student'

  const now = new Date()
  const dateLine = `Дано въ ${now.getDate()}-й день ${MONTHS_GEN[now.getMonth()]} ${now.getFullYear()} года`

  // ── Данные: подсчёты (если таблицы нет — покажем «—») ──
  const [usersRes, cyclesRes, topicsRes, appsRes, ordersActiveRes] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('cycles').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('topics').select('*', { count: 'exact', head: true }),
    supabase.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
    supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['draft', 'sent', 'rework']),
  ])

  const usersCount = usersRes.count
  const cyclesCount = cyclesRes.count
  const topicsCount = topicsRes.count
  const appsCount = appsRes.count
  const ordersActiveCount = ordersActiveRes.count

  // ── Персональные данные по ролям ──
  let myTopicsCount: number | null = null
  let myStudentsCount: number | null = null

  if (role === 'supervisor') {
    const [t, s] = await Promise.all([
      supabase.from('topics').select('*', { count: 'exact', head: true }).eq('supervisor_id', user.id),
      supabase
        .from('applications')
        .select('*, topics!inner(id)', { count: 'exact', head: true })
        .eq('topics.supervisor_id', user.id),
    ])
    myTopicsCount = t.count
    myStudentsCount = s.count
  }

  type StudentApp = {
    final_title: string
    status: string
    topic: { title: string; supervisor: { full_name: string } | null } | null
  } | null

  let studentApp: StudentApp = null
  if (role === 'student') {
    const { data } = await supabase
      .from('applications')
      .select('final_title, status, topic:topics(title, supervisor:profiles(full_name))')
      .eq('student_id', user.id)
      .maybeSingle()
    studentApp = (data as StudentApp) ?? null
  }

  const STATUS_LABELS: Record<string, string> = {
    submitted: 'Подано',
    in_order: 'В приказе',
    published: 'Утверждено приказом',
  }

  // ── Сроки: активный цикл и окна регламента ──
  let activeCycle: { id: string; name: string } | null = null
  let windows: WindowRow[] | null = null

  const cycleRes = await supabase
    .from('cycles')
    .select('id, name')
    .eq('status', 'active')
    .maybeSingle()
  activeCycle = cycleRes.data

  if (activeCycle) {
    const res = await supabase
      .from('regulation_windows')
      .select('stage, starts_on, ends_on')
      .eq('cycle_id', activeCycle.id)
      .order('starts_on')
      .limit(9)
    windows = res.data
  }

  // ── Строки реестра по ролям ──
  const isDeputy = role === 'deputy' || role === 'head'
  const isSecretary = role === 'secretary'
  const isSupervisor = role === 'supervisor'

  // Штемпель статуса студента
  const studentStamp =
    role === 'student' && studentApp
      ? studentApp.status === 'published'
        ? { text: 'Утверждено', tone: 'wax' as const }
        : { text: 'Въ деле', tone: 'muted' as const }
      : null

  return (
    <div className="space-y-8">
      {/* ── Шапка разворота: заголовок · календарь · листъ ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 animate-fade-up">
        <div className="pt-1">
          <p className="font-display text-[10px] tracking-[0.36em] text-muted-foreground">
            ЖУРНАЛЪ · РАЗВОРОТЪ ТЕКУЩИЙ
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
            Состояние журнала
          </h1>
          <p className="font-quote italic text-muted-foreground mt-2">{dateLine}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <CalendarPlate date={now} />
          <p className="font-display text-[9px] tracking-[0.3em] text-muted-foreground/80">
            ЛИСТЪ {roman(1)}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6 items-start">
        {/* ── Ведомость-реестр ── */}
        <div className="relative">
          {/* водяной знак — римская цифра раздела */}
          <span
            className="absolute -top-8 -right-2 font-display text-[9rem] leading-none text-[#B08D46]/[0.06] select-none pointer-events-none"
            aria-hidden
          >
            I
          </span>


          <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)]">
            <Corners />
            <div className="border border-border px-6 py-5">
              <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground pb-2 border-b border-border mb-2">
                {isDeputy && 'Реестръ общий'}
                {isSecretary && 'Реестръ канцеляріи'}
                {isSupervisor && 'Реестръ наставника'}
                {role === 'student' && 'Листъ студента'}
              </p>

              {isDeputy && (
                <>
                  <LedgerRow label="Записей въ реестре пользователейъ" value={usersCount} delay={150} />
                  <LedgerRow label="Активныхъ цикловъ" value={cyclesCount} delay={230} />
                  <LedgerRow label="Темъ въ каталоге" value={topicsCount} delay={310} />
                  <LedgerRow label="Подания ожидаютъ приказа" value={appsCount} delay={390} />
                </>
              )}

              {isSecretary && (
                <>
                  <LedgerRow label="Подания ожидаютъ приказа" value={appsCount} delay={150} />
                  <LedgerRow label="Приказовъ въ работѣ" value={ordersActiveCount} delay={230} />
                  <LedgerRow label="Активныхъ цикловъ" value={cyclesCount} delay={310} />
                </>
              )}

              {isSupervisor && (
                <>
                  <LedgerRow label="Темъ внесено мною" value={myTopicsCount} delay={150} />
                  <LedgerRow label="Студентовъ подо мною" value={myStudentsCount} delay={230} />
                  <LedgerRow label="Активныхъ цикловъ" value={cyclesCount} delay={310} />
                </>
              )}

              {role === 'student' && (
                <>
                  <div className="flex items-end gap-2 py-3.5 border-b border-border/60 animate-fade-up" style={{ animationDelay: '150ms' }}>
                    <span className="text-sm text-foreground/85 shrink-0">Тема</span>
                    <span className="flex-1 border-b-2 border-dotted border-[#B08D46]/45 mb-1.5" aria-hidden />
                    <span
                      title={studentApp?.final_title ?? studentApp?.topic?.title ?? ''}
                       className="font-quote text-[15px] font-bold leading-snug text-right max-w-[62%] line-clamp-2"
                    >
                      {studentApp?.final_title ?? studentApp?.topic?.title ?? 'не выбрана'}
                    </span>
                  </div>
                  <div className="flex items-end gap-2 py-3.5 border-b border-border/60 animate-fade-up" style={{ animationDelay: '230ms' }}>
                    <span className="text-sm text-foreground/85 shrink-0">Руководитель</span>
                    <span className="flex-1 border-b-2 border-dotted border-[#B08D46]/45 mb-1.5" aria-hidden />
                     <span className="font-quote text-[15px] font-bold text-right">
                        {studentApp?.topic?.supervisor?.full_name ?? 'не выбран'}
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-2 py-3.5 animate-fade-up" style={{ animationDelay: '310ms' }}>
                    <div className="flex items-end gap-2 w-full">
                      <span className="text-sm text-foreground/85 shrink-0">Статусъ</span>
                      <span className="flex-1 border-b-2 border-dotted border-[#B08D46]/45 mb-1.5" aria-hidden />
                      <span className="font-display text-sm uppercase tracking-[0.14em] text-[#8C2F1B]">
                        {studentApp ? STATUS_LABELS[studentApp.status] ?? studentApp.status : 'Подания нетъ'}
                      </span>
                    </div>
                    {studentStamp && <RubberStamp text={studentStamp.text} tone={studentStamp.tone} rotate={-6} delay={600} />}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Ближайшие сроки ── */}
        <div>
          <p className="font-display text-[10px] tracking-[0.36em] text-muted-foreground mb-3 animate-fade-up [animation-delay:200ms]">
            БЛИЖАЙШИЕ СРОКИ
          </p>

          {activeCycle && (
            <p className="text-sm text-muted-foreground mb-3 animate-fade-up [animation-delay:240ms]">
              Циклъ <span className="font-quote italic text-foreground">{activeCycle.name}</span>
            </p>
          )}

          <div className="border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)]">
            <div className="border border-border px-5 py-2">
              {windows && windows.length > 0 ? (
                windows.map((w, i) => (
                  <div
                    key={w.stage}
                    className="flex items-end gap-2 py-3 border-b border-border/60 last:border-0 animate-fade-up"
                    style={{ animationDelay: `${280 + i * 80}ms` }}
                  >
                    <span className="text-sm text-foreground/85">
                      {STAGE_LABELS[w.stage] ?? w.stage}
                    </span>
                    <span className="flex-1 border-b-2 border-dotted border-[#B08D46]/45 mb-1.5" aria-hidden />
                    <span className="font-display text-sm text-right whitespace-nowrap">
                      {fmt(w.starts_on)} — {fmt(w.ends_on)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="font-quote italic text-sm text-muted-foreground py-4 text-center">
                  {activeCycle
                    ? 'Сроки еще не назначены'
                    : 'Циклъ не открытъ — сроки появятся после открытия'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Маршрутъ: линейка этапов со штемпелем ── */}
      <div className="border border-border bg-card px-6 py-5 animate-fade-up [animation-delay:400ms]">
        <div className="flex items-center justify-between mb-4">
          <p className="font-display text-[10px] tracking-[0.3em] text-muted-foreground">
            МАРШРУТЪ РАБОТЫ
          </p>
          {/* штемпель состояния цикла */}
          {(cyclesCount ?? 0) > 0 ? (
            <RubberStamp text="Въ производстве" tone="wax" rotate={-5} delay={550} />
          ) : (
            <RubberStamp text="Не открытъ" tone="muted" rotate={-5} delay={550} />
          )}
        </div>

        <div className="relative">
          {/* линия маршрута — прорисовывается */}
          <span
            className="absolute top-[17px] left-6 right-6 h-px bg-gradient-to-r from-[#C9A45C] via-[#8C2F1B] to-[#5A1B12] origin-left animate-ink-rule [animation-delay:500ms]"
            aria-hidden
          />
          <ol className="relative flex justify-between">
            {STAGES.map((s, i) => {
              const last = i === STAGES.length - 1
              return (
                <li key={s} className="flex flex-col items-center gap-2 w-16 animate-fade-up" style={{ animationDelay: `${600 + i * 100}ms` }}>
                  <span
                    className={`flex h-9 w-9 items-center justify-center font-display text-[12px] border transition-colors ${
                      last
                        ? 'border-[#8C2F1B] bg-[#8C2F1B] text-[#F3EDDF]'
                        : 'border-[#B08D46]/60 bg-card text-foreground'
                    }`}
                  >
                    {roman(i + 1)}
                  </span>
                  <span className="text-[11px] text-muted-foreground text-center leading-tight">{s}</span>
                </li>
              )
            })}
          </ol>
        </div>
      </div>

      {/* ── Подпись канцелярии ── */}
      <p className="text-right font-quote italic text-xs text-muted-foreground/80 animate-fade-in [animation-delay:900ms]">
        Сведения верны — канцелярия кафедры
      </p>
    </div>
  )
}