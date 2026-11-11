'use client'

import { createClient } from '@/lib/supabase/client'
import NoticeToast from '@/components/notice-toast'
import { useState, useEffect } from 'react'
import { saveWindows } from './actions'
import {
  Loader2, CalendarDays, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp, Save,
} from 'lucide-react'

/* ── Типы ── */
type Cycle = { id: string; name: string; status: string; created_at: string }
type WindowRow = { stage: string; starts_on: string; ends_on: string }
type Draft = Record<string, { starts_on: string; ends_on: string }>

const STAGES = [
  { key: 'applications', label: 'Каталогъ и подача' },
  { key: 'bibliography', label: 'Библиография' },
  { key: 'screening1', label: 'Просмотръ №1' },
  { key: 'screening2', label: 'Просмотръ №2' },
  { key: 'code_review', label: 'Ревью кода' },
  { key: 'upload_pdf', label: 'Сдача PDF' },
  { key: 'normcontrol', label: 'Нормоконтроль' },
  { key: 'predefense', label: 'Предзащита' },
  { key: 'defense', label: 'Защита' },
]

const STATUS_LABELS: Record<string, string> = {
  planning: 'Планируется',
  active: 'ВЪ силе',
  closed: 'Закрытъ',
}

/* ── Декор ── */
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

/* ── Плавный аккордеон ──
   Панель остается в DOM во время сворачивания (500 мс),
   затем убирается — отступы не «дырявят» страницу */
function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [render, setRender] = useState(open)
  const [expanded, setExpanded] = useState(open)

  useEffect(() => {
    if (open) {
      setRender(true)
      // двойной кадр: сначала рендер в свернутом виде, потом раскрытие
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setExpanded(true))
      })
      return () => cancelAnimationFrame(raf)
    } else {
      setExpanded(false)
      const t = setTimeout(() => setRender(false), 500)
      return () => clearTimeout(t)
    }
  }, [open])

  if (!render) return null

  return (
    <div
      aria-hidden={!open}
      className={`grid transition-all duration-500 ease-out ${
        expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="overflow-hidden min-h-0">{children}</div>
    </div>
  )
}

/* ── Выбор даты в общем стиле ── */
function JournalDate(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      type="date"
      className={`peer w-full h-11 bg-[#FAF5E8] border border-input px-3 text-sm text-foreground outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 disabled:opacity-50 [color-scheme:light] ${props.className ?? ''}`}
    />
  )
}

function WaxButton({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`group relative block overflow-hidden border border-[#6E2415] bg-[#8C2F1B] text-[#F3EDDF] text-[12px] font-semibold uppercase tracking-[0.22em] shadow-[inset_0_0_0_1px_rgba(243,237,223,0.25)] transition-all duration-200 hover:bg-[#7A2715] hover:shadow-[0_8px_22px_-8px_rgba(140,47,27,0.6),inset_0_0_0_1px_rgba(243,237,223,0.25)] active:scale-[0.99] ${className}`}>
      <span
        className="absolute inset-y-0 left-0 w-1/3 -translate-x-[160%] group-hover:translate-x-[380%] transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-[#C9A45C]/35 to-transparent pointer-events-none"
        aria-hidden
      />
      <span className="relative z-10 flex items-center justify-center gap-2.5 h-full">{children}</span>
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status
  const active = status === 'active'
  const closed = status === 'closed'
  return (
    <span
      className={`inline-block font-display text-[9px] uppercase tracking-[0.18em] px-2.5 py-1 border ${
        active
          ? 'bg-[#8C2F1B] border-[#6E2415] text-[#F3EDDF] shadow-[inset_0_0_0_1px_rgba(243,237,223,0.2)]'
          : closed
            ? 'border-border bg-secondary text-muted-foreground'
            : 'border-[#B08D46]/60 bg-[#B08D46]/10 text-[#8A6B2F]'
      }`}
    >
      {label}
    </span>
  )
}

export default function DeputyDatesPage() {
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // раскрытый цикл + черновик окон + busy
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    loadCycles()
  }, [])

  const loadCycles = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('cycles')
      .select('id, name, status, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setNotice({ type: 'err', text: 'Ошибка загрузки циклов: ' + error.message })
    } else {
      setCycles((data as Cycle[]) || [])
    }
    setLoading(false)
  }

  // при раскрытии цикла — подтянуть его окна в черновик
  const toggleExpand = async (cycle: Cycle) => {
    if (expandedId === cycle.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(cycle.id)

    // черновик нужен сразу, чтобы окна раскрывались без прыжка
    setDrafts((prev) => {
      if (prev[cycle.id]) return prev
      const draft: Draft = {}
      for (const s of STAGES) draft[s.key] = { starts_on: '', ends_on: '' }
      return { ...prev, [cycle.id]: draft }
    })

    const supabase = createClient()
    const { data } = await supabase
      .from('regulation_windows')
      .select('stage, starts_on, ends_on')
      .eq('cycle_id', cycle.id)

    const draft: Draft = {}
    for (const s of STAGES) {
      const found = (data as WindowRow[] | null)?.find((w) => w.stage === s.key)
      draft[s.key] = found
        ? { starts_on: found.starts_on, ends_on: found.ends_on }
        : { starts_on: '', ends_on: '' }
    }
    setDrafts((prev) => ({ ...prev, [cycle.id]: draft }))
  }

  const setDraftDate = (cycleId: string, stage: string, field: 'starts_on' | 'ends_on', value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [cycleId]: {
        ...prev[cycleId],
        [stage]: { ...prev[cycleId]?.[stage], [field]: value },
      },
    }))
  }

  const handleSaveWindows = async (cycleId: string) => {
    const draft = drafts[cycleId]
    if (!draft) return

    // клиентская валидация дат — зеркально серверу
    for (const s of STAGES) {
      const w = draft[s.key]
      const hasStart = !!w?.starts_on
      const hasEnd = !!w?.ends_on
      if (hasStart !== hasEnd) {
        setNotice({ type: 'err', text: `«${s.label}»: укажите обе даты или очистите обе` })
        return
      }
      if (hasStart && hasEnd && w.ends_on < w.starts_on) {
        setNotice({ type: 'err', text: `«${s.label}»: дата окончания раньше даты начала` })
        return
      }
    }

    const windows = STAGES.map((s) => ({
      stage: s.key,
      starts_on: draft[s.key]?.starts_on || '',
      ends_on: draft[s.key]?.ends_on || '',
    }))

    setSavingId(cycleId)
    setNotice(null)
    const result = await saveWindows(cycleId, windows)
    setSavingId(null)

    if (!result.success) {
      setNotice({ type: 'err', text: result.error || 'Ошибка сохранения' })
      return
    }
    setNotice({ type: 'ok', text: 'Даты обновлены — сроки этапов пересчитаны для всей кафедры' })
    loadCycles()
  }

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 animate-fade-in"
        style={{ minHeight: 'calc(100vh - 6rem)' }}
      >
        <Loader2 className="w-6 h-6 animate-spin text-[#8C2F1B]" />
        <p className="font-quote italic text-muted-foreground">Канцелярия готовитъ календарь...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Шапка ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 animate-fade-up">
        <div className="pt-1">
          <p className="font-display text-[10px] tracking-[0.36em] text-muted-foreground">
            РАЗДЕЛЪ III · ДАТЫ ЦИКЛОВЪ
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
            Даты
          </h1>
          <p className="font-quote italic text-muted-foreground mt-2">
            правка окон регламента по ходу цикла — создание цикловъ у секретаря
          </p>
        </div>
      </div>

      {/* ── Уведомление-тост (общая компонента) ── */}
      <NoticeToast notice={notice} onClose={() => setNotice(null)} />

      {/* ── Реестр циклов ── */}
      <div className="relative">
        <span
          className="absolute -top-8 -right-2 font-display text-[9rem] leading-none text-[#B08D46]/[0.06] select-none pointer-events-none"
          aria-hidden
        >
          III
        </span>

        {cycles.length === 0 ? (
          <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up">
            <Corners />
            <div className="border border-border px-6 py-12 text-center">
              <CalendarDays className="w-8 h-8 mx-auto text-[#B08D46]/60 mb-4" />
              <p className="font-display text-lg font-bold">Цикловъ нет</p>
              <p className="font-quote italic text-sm text-muted-foreground mt-2">
                Циклы открывает секретарь — после этого здесь появятся даты
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {cycles.map((cycle, i) => {
              const isExpanded = expandedId === cycle.id
              const draft = drafts[cycle.id]
              const busy = savingId === cycle.id
              return (
                <div
                  key={cycle.id}
                  className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up transition-shadow duration-300 hover:shadow-[0_1px_2px_rgba(43,33,24,0.06),0_22px_52px_-22px_rgba(43,33,24,0.4)]"
                  style={{ animationDelay: `${Math.min(i, 10) * 60}ms` }}
                >
                  <Corners />
                  <div className="border border-border">
                    {/* шапка цикла */}
                    <div className="px-6 py-4 flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => toggleExpand(cycle)}
                        className="p-1.5 border border-[#B08D46]/50 text-muted-foreground hover:text-[#8C2F1B] hover:border-[#8C2F1B] transition-colors"
                        title={isExpanded ? 'Свернуть окна' : 'Окна регламента'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className="font-display text-lg font-bold tracking-tight [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
                          {cycle.name}
                        </p>
                      </div>

                      <StatusBadge status={cycle.status} />
                    </div>

                    {/* окна регламента (плавное раскрытие) */}
                    <Collapse open={isExpanded}>
                      <div className="border-t border-border px-6 py-5 bg-secondary/30">
                        <p className="font-display text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-4">
                          Окна регламента · даты этапов
                        </p>

                        {!draft ? (
                          <div className="flex items-center gap-2.5 py-4 justify-center">
                            <Loader2 className="w-4 h-4 animate-spin text-[#8C2F1B]" />
                            <p className="font-quote italic text-sm text-muted-foreground">Канцелярия готовитъ окна...</p>
                          </div>
                        ) : (
                          <>
                            <div className="space-y-3">
                              {STAGES.map((s, j) => (
                                <div
                                  key={s.key}
                                  className="grid grid-cols-[1fr_auto_auto] gap-3 items-end animate-fade-up"
                                  style={{ animationDelay: `${j * 50}ms` }}
                                >
                                  <div>
                                    <p className="text-sm font-medium mb-1">{s.label}</p>
                                  </div>
                                  <div className="w-40">
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">с</p>
                                    <JournalDate
                                      value={draft[s.key]?.starts_on || ''}
                                      onChange={(e) => setDraftDate(cycle.id, s.key, 'starts_on', e.target.value)}
                                      disabled={busy}
                                    />
                                  </div>
                                  <div className="w-40">
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-1">по</p>
                                    <JournalDate
                                      value={draft[s.key]?.ends_on || ''}
                                      onChange={(e) => setDraftDate(cycle.id, s.key, 'ends_on', e.target.value)}
                                      disabled={busy}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="mt-5 max-w-xs">
                              <button
                                onClick={() => handleSaveWindows(cycle.id)}
                                disabled={savingId === cycle.id}
                                className="w-full disabled:opacity-60"
                              >
                                <WaxButton className="h-11 w-full">
                                  {savingId === cycle.id ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      Сохраняется...
                                    </>
                                  ) : (
                                    <>
                                      <Save className="w-4 h-4" />
                                      Сохранить даты
                                    </>
                                  )}
                                </WaxButton>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </Collapse>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Подпись ── */}
      <p className="text-right font-quote italic text-xs text-muted-foreground/80 animate-fade-in [animation-delay:600ms]">
        Изменение дат пересчитывает сроки — уведомления разойдутъ по кафедре
      </p>
    </div>
  )
}
