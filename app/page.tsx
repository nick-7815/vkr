'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2, ArrowRight, AlertCircle } from 'lucide-react'

const STAGES = [
  { n: 'I', title: 'Тема', text: 'Выборъ темы и руководителя въ каталоге кафедры' },
  { n: 'II', title: 'Приказ', text: 'Пара «студентъ — тема» уходитъ в приказъ автоматически' },
  { n: 'III', title: 'Просмотры', text: 'Зимнее и весеннее окна — с напоминаниями системы' },
  { n: 'IV', title: 'Нормоконтроль', text: 'Оформление и источники по ГОСТ проверяетъ машина' },
  { n: 'V', title: 'Защита', text: 'Допускъ, подписи и защита перед комиссией' },
]

/* Сургучная печать: неровный край из «капель», глубокий оттиск, блик */
function Seal() {
  const scallops = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2
    const r = 46 + Math.sin(i * 2.7) * 2.6
    return {
      x: 60 + r * Math.cos(a),
      y: 60 + r * Math.sin(a),
      s: 8.5 + Math.sin(i * 1.3) * 1.6,
    }
  })
  return (
    <svg viewBox="0 0 120 120" className="w-full h-full drop-shadow-[0_8px_16px_rgba(43,33,24,0.45)]" aria-hidden>
      <defs>
        {/* блик на воске */}
        <radialGradient id="wax-light" cx="36%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#9C4436" stopOpacity="0.75" />
          <stop offset="55%" stopColor="#7B2D26" stopOpacity="0" />
        </radialGradient>
        <path id="seal-text-circle" d="M60,60 m-40,0 a40,40 0 1,1 80,0 a40,40 0 1,1 -80,0" fill="none" />
      </defs>

      {/* тёмный низ — объём */}
      <g fill="#5A1B12">
        <circle cx="60" cy="60" r="48" />
        {scallops.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y + 1.5} r={c.s} />
        ))}
      </g>
      {/* основное тело печати */}
      <g fill="#8C2F1B">
        <circle cx="60" cy="60" r="47.5" />
        {scallops.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={c.s} />
        ))}
      </g>
      <circle cx="60" cy="60" r="47.5" fill="url(#wax-light)" />

      {/* оттиск: гравированные кольца */}
      <circle cx="60" cy="60" r="39" fill="none" stroke="#541812" strokeWidth="1.6" opacity="0.85" />
      <circle cx="60" cy="60" r="37.6" fill="none" stroke="#A84A38" strokeWidth="0.7" opacity="0.7" />
      <circle cx="60" cy="60" r="31" fill="none" stroke="#541812" strokeWidth="1" opacity="0.8" />

      <text fill="#F3EDDF" fontSize="8.2" letterSpacing="2.1" fontFamily="Georgia, serif">
        <textPath href="#seal-text-circle">
          ВЫПУСКНАЯ РАБОТА • КАФЕДРА • ЖУРНАЛЪ •
        </textPath>
      </text>
      {/* ВКР с тиснением: тёмная подложка-сдвиг + светлая буква */}
      <text x="60" y="68" textAnchor="middle" fill="#541812" fontSize="19" fontFamily="Georgia, serif" fontWeight="bold" opacity="0.6">
        ВКР
      </text>
      <text x="60" y="67" textAnchor="middle" fill="#F3EDDF" fontSize="19" fontFamily="Georgia, serif" fontWeight="bold">
        ВКР
      </text>
    </svg>
  )
}

/* Оксфордская линейка: толстая черта «пропитывается» + тонкая под ней */
function OxfordRule({ flip = false }: { flip?: boolean }) {
  return (
    <div className={`shrink-0 relative z-10 ${flip ? '' : ''}`} aria-hidden>
      {flip && <div className="h-px bg-[#B08D46]/60 mb-[3px]" />}
      <div className="h-[4px] bg-[#8C2F1B] origin-left animate-ink-rule" />
      {!flip && <div className="h-px bg-[#B08D46]/60 mt-[3px]" />}
    </div>
  )
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

export default function HomePage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setError('Неверный адрес или пароль')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground relative overflow-hidden">
      {/* Бумажная текстура + виньетка + двойная рамка листа */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at center, transparent 52%, rgba(43,33,24,0.07) 100%)' }}
        />
      </div>
      <div className="fixed inset-3 border border-[#B08D46]/30 pointer-events-none z-0" aria-hidden />
      <div className="fixed inset-[15px] border border-[#B08D46]/15 pointer-events-none z-0" aria-hidden />

      <OxfordRule />

      <div className="flex-1 grid lg:grid-cols-[1.15fr_1fr] relative z-10">
        {/* ══ Левая колонна: канцелярия ══ */}
        <div className="relative flex flex-col justify-between p-8 lg:p-14 xl:p-16 border-b lg:border-b-0 lg:border-r border-border overflow-hidden">
          {/* водяной знак-флерон */}
          <span
            className="absolute -right-6 top-1/4 font-display text-[11rem] leading-none text-[#B08D46]/[0.07] rotate-12 select-none pointer-events-none"
            aria-hidden
          >
            ❦
          </span>

          {/* Логотип */}
          <div className="flex items-center gap-3.5 animate-fade-up">
            <div className="w-11 h-11 rounded-full border-2 border-[#8C2F1B] bg-card flex items-center justify-center shadow-[inset_0_0_0_2px_#FDFBF5,inset_0_0_0_3px_rgba(176,141,70,0.4)]">
              <span className="font-display text-[15px] font-bold text-[#8C2F1B]">ВКР</span>
            </div>
            <div>
              <p className="font-display text-xl font-bold tracking-tight leading-none [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
                Журналъ ВКР
              </p>
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mt-1">
                Университетская канцелярия
              </p>
            </div>
          </div>

          {/* Середина */}
          <div className="relative py-10 lg:py-0 max-w-lg">
            <div className="inline-flex items-center gap-2.5 border border-border bg-card px-4 py-1.5 animate-fade-up [animation-delay:100ms]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8C2F1B] animate-pulse-dot" />
              <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Система поддержки выпускных работъ
              </span>
            </div>

            <h1 className="mt-6 font-display text-4xl xl:text-5xl leading-[1.1] tracking-tight animate-fade-up [animation-delay:200ms] [text-shadow:0_1px_0_rgba(255,255,255,0.5)]">
              Каждой работе —<br />
              <span className="italic text-[#8C2F1B]">своя страница</span> в журнале
            </h1>

            <div className="flex items-center gap-3 mt-6 animate-fade-in [animation-delay:400ms]" aria-hidden>
              <span className="h-px w-16 bg-[#B08D46]/70" />
              <span className="text-[#B08D46] text-sm">❦</span>
              <span className="h-px w-16 bg-[#B08D46]/70" />
            </div>

            {/* Ведомость этапов */}
            <div className="hidden md:block mt-10">
              <div className="relative">
                <span className="absolute left-[15px] top-3 bottom-3 w-px bg-border" aria-hidden />
                <span
                  className="absolute left-[15px] top-3 bottom-3 w-px bg-gradient-to-b from-[#8C2F1B] via-[#8C2F1B] to-[#B08D46] origin-top animate-draw [animation-delay:500ms]"
                  aria-hidden
                />

                <ol className="space-y-6">
                  {STAGES.map((s, i) => {
                    const last = i === STAGES.length - 1
                    return (
                      <li key={s.n} className="relative flex items-start gap-4 group cursor-default">
                        <span
                          className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center border font-display text-[13px] font-bold animate-pop shadow-sm transition-colors duration-300 ${
                            last
                              ? 'border-[#8C2F1B] bg-[#8C2F1B] text-[#F3EDDF] animate-pulse-dot'
                              : 'border-[#B08D46]/50 bg-card text-[#8C2F1B] group-hover:bg-[#8C2F1B] group-hover:text-[#F3EDDF] group-hover:border-[#8C2F1B]'
                          }`}
                          style={{ animationDelay: `${650 + i * 140}ms` }}
                        >
                          {s.n}
                        </span>
                        <div className="animate-fade-up pt-0.5" style={{ animationDelay: `${720 + i * 140}ms` }}>
                          <p className="font-display text-[15px] font-bold transition-transform duration-300 group-hover:translate-x-1">
                            {s.title}
                          </p>
                          <p className="text-sm text-muted-foreground mt-0.5">{s.text}</p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground/80 animate-fade-in [animation-delay:900ms]">
            Кафедра · выпускные квалификационные работы
          </p>
        </div>

        {/* ══ Правая колонна: форма-документ ══ */}
        <div className="flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-md">
            {/* Лого для мобильных */}
            <div className="md:hidden flex items-center justify-center gap-2.5 mb-10 animate-fade-up">
              <span className="font-display text-xl font-bold">Журналъ ВКР</span>
            </div>

            {/* Двойная рамка, как на аттестате */}
            <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.35)] animate-fade-up [animation-delay:300ms]">
              <Corners />

              {/* Печать с гравировальным кольцом */}
              <div className="absolute -top-10 -right-8 w-24 h-24 pointer-events-none z-10">
                <svg viewBox="0 0 120 120" className="absolute -inset-4 w-[calc(100%+2rem)] h-[calc(100%+2rem)] animate-spin-slow opacity-40" aria-hidden>
                  <circle cx="60" cy="60" r="55" fill="none" stroke="#B08D46" strokeWidth="0.9" strokeDasharray="1 6" />
                </svg>
                <div className="w-full h-full animate-stamp [animation-delay:900ms]">
                  <Seal />
                </div>
              </div>

              <div className="border border-border px-7 py-8">
                <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  Ведомость № 1
                </p>
                <h2 className="font-display text-2xl font-bold tracking-tight text-center mt-2 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
                  Входъ въ систему
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground text-center">
                  Введите данные, выданные канцелярией
                </p>

                <div className="flex items-center gap-2 mt-5 mb-2" aria-hidden>
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[#B08D46] text-xs">✦</span>
                  <span className="h-px flex-1 bg-border" />
                </div>

                <form onSubmit={handleLogin} className="mt-4 space-y-5">
                  {/* Почта */}
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Электронная почта
                    </label>
                    <div className="relative">
                      <input
                        id="email"
                        type="email"
                        placeholder="ivanov@university.ru"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={loading}
                        className="peer w-full h-11 bg-[#FAF5E8] border border-input px-3.5 pb-1 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 disabled:opacity-50 placeholder:text-muted-foreground/50"
                      />
                      {/* латунная черта, прорастает при фокусе */}
                      <span
                        className="absolute bottom-0 left-0 h-[2px] w-full origin-left scale-x-0 bg-gradient-to-r from-[#C9A45C] to-[#8A6B2F] transition-transform duration-500 ease-out peer-focus:scale-x-100"
                        aria-hidden
                      />
                    </div>
                  </div>

                  {/* Пароль */}
                  <div className="space-y-1.5">
                    <label htmlFor="password" className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Пароль
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={loading}
                        className="peer w-full h-11 bg-[#FAF5E8] border border-input px-3.5 pr-11 pb-1 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 disabled:opacity-50 placeholder:text-muted-foreground/50"
                      />
                      <span
                        className="absolute bottom-0 left-0 h-[2px] w-full origin-left scale-x-0 bg-gradient-to-r from-[#C9A45C] to-[#8A6B2F] transition-transform duration-500 ease-out peer-focus:scale-x-100"
                        aria-hidden
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                        aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2.5 border-l-2 border-[#8C2F1B] bg-red-50 px-4 py-3 animate-fade-up">
                      <AlertCircle className="w-4 h-4 text-red-700 mt-0.5 shrink-0" />
                      <p className="text-sm text-red-800">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="group relative w-full h-12 bg-[#8C2F1B] text-[#F3EDDF] text-[13px] font-semibold uppercase tracking-[0.22em] border border-[#6E2415] shadow-[inset_0_0_0_1px_rgba(243,237,223,0.25)] overflow-hidden transition-all duration-200 hover:bg-[#7A2715] hover:shadow-[0_8px_22px_-8px_rgba(140,47,27,0.6),inset_0_0_0_1px_rgba(243,237,223,0.25)] active:scale-[0.99] disabled:opacity-60"
                  >
                    {/* латунный пробег при наведении */}
                    <span
                      className="absolute inset-y-0 left-0 w-1/3 -translate-x-[160%] group-hover:translate-x-[380%] transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-[#C9A45C]/35 to-transparent pointer-events-none"
                      aria-hidden
                    />
                    <span className="relative z-10 flex items-center justify-center gap-2.5">
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Исполняется...
                        </>
                      ) : (
                        <>
                          Войти
                          <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                        </>
                      )}
                    </span>
                  </button>
                </form>

                <div className="mt-6 pt-5 border-t border-border">
                  <p className="text-center text-xs text-muted-foreground leading-relaxed">
                    Нет учётной записи? Обратитесь к заместителю
                    заведующего — записи вноситъ канцелярия кафедры
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <OxfordRule flip />
    </div>
  )
}