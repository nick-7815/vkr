import Link from 'next/link'
import { Ban, ArrowRight } from 'lucide-react'

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

/* Сургучная печать: неровный край, блик, оттиск */
function WaxSeal() {
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
        <radialGradient id="wax-light-s" cx="36%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#9C4436" stopOpacity="0.75" />
          <stop offset="55%" stopColor="#7B2D26" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g fill="#5A1B12">
        <circle cx="60" cy="60" r="48" />
        {scallops.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y + 1.5} r={c.s} />
        ))}
      </g>
      <g fill="#8C2F1B">
        <circle cx="60" cy="60" r="47.5" />
        {scallops.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={c.s} />
        ))}
      </g>
      <circle cx="60" cy="60" r="47.5" fill="url(#wax-light-s)" />
      <circle cx="60" cy="60" r="39" fill="none" stroke="#541812" strokeWidth="1.6" opacity="0.85" />
      <circle cx="60" cy="60" r="37.6" fill="none" stroke="#A84A38" strokeWidth="0.7" opacity="0.7" />
      <circle cx="60" cy="60" r="31" fill="none" stroke="#541812" strokeWidth="1" opacity="0.8" />
      {/* перечёркнутая монограмма — доступ закрыт */}
      <text x="60" y="68" textAnchor="middle" fill="#F3EDDF" fontSize="19" fontFamily="Georgia, serif" fontWeight="bold">
        ВКР
      </text>
      <line x1="34" y1="86" x2="86" y2="34" stroke="#541812" strokeWidth="2.5" opacity="0.85" strokeLinecap="round" />
    </svg>
  )
}

export default function SuspendedPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground relative overflow-hidden">
      {/* бумажная текстура + виньетка + рамка листа */}
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

      {/* оксфордская линейка */}
      <div className="shrink-0 relative z-10" aria-hidden>
        <div className="h-[4px] bg-[#8C2F1B] origin-left animate-ink-rule" />
        <div className="h-px bg-[#B08D46]/60 mt-[3px]" />
      </div>

      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-md">
          {/* бренд */}
          <div className="flex items-center justify-center gap-3.5 mb-10 animate-fade-up">
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

          {/* ведомость с печатью */}
          <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.35)] animate-fade-up [animation-delay:150ms]">
            <Corners />

            {/* печать «доступ закрыт» */}
            <div className="absolute -top-10 -right-8 w-24 h-24 pointer-events-none z-10 animate-stamp [animation-delay:600ms]">
              <WaxSeal />
            </div>

            <div className="border border-border px-7 py-8">
              <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Уведомление
              </p>
              <h1 className="font-display text-2xl font-bold tracking-tight text-center mt-2 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
                Доступъ приостановленъ
              </h1>

              {/* виньетка */}
              <div className="flex items-center gap-2 mt-5 mb-2" aria-hidden>
                <span className="h-px flex-1 bg-border" />
                <span className="text-[#B08D46] text-xs">✦</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <p className="font-quote italic text-sm text-muted-foreground text-center leading-relaxed mt-4">
                Ваша учетная запись отключена канцелярией кафедры.
                По вопросам восстановления доступа обратитесь
                к заместителю заведующего.
              </p>

              <Link
                href="/login"
                className="group relative w-full h-12 mt-8 bg-primary text-primary-foreground text-[13px] font-semibold uppercase tracking-[0.22em] flex items-center justify-center gap-2.5 overflow-hidden transition-all duration-200 hover:bg-[#33291D] hover:shadow-[0_8px_22px_-8px_rgba(28,24,18,0.6)] active:scale-[0.99]"
              >
                <span
                  className="absolute inset-y-0 left-0 w-1/3 -translate-x-[160%] group-hover:translate-x-[380%] transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-[#C9A45C]/35 to-transparent pointer-events-none"
                  aria-hidden
                />
                Вернуться ко входу
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>

          <p className="mt-8 text-center font-display text-[9px] tracking-[0.34em] text-muted-foreground/70 animate-fade-in [animation-delay:800ms]">
            · КАФЕДРА ·
          </p>
        </div>
      </div>

      {/* нижняя линейка */}
      <div className="shrink-0 relative z-10" aria-hidden>
        <div className="h-px bg-[#B08D46]/60 mb-[3px]" />
        <div className="h-[4px] bg-[#8C2F1B]" />
      </div>
    </div>
  )
}