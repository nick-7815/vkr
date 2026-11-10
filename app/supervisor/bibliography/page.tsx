'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useMemo } from 'react'
import { Loader2, CheckCircle2, AlertCircle, BookMarked, RotateCcw } from 'lucide-react'
import { reviewBibItem } from './actions'

type MyAppRow = {
  id: string
  final_title: string
  status: string
  student: { full_name: string } | null
  topic: { supervisor_id: string } | null
}

type BibItem = {
  id: string
  application_id: string
  position: number
  kind: string
  authors: string
  title: string
  source: string | null
  year: number | null
  url: string | null
  status: string
  comment: string | null
}

const KIND_LABELS: Record<string, string> = {
  book: 'Книга',
  article: 'Статья',
  url: 'Интернетъ-ресурсъ',
  standard: 'Стандартъ',
  other: 'Прочее',
}

const ITEM_STATUS: Record<string, { label: string; tone: 'ok' | 'wait' | 'warn' }> = {
  pending: { label: 'На проверкѣ', tone: 'wait' },
  approved: { label: 'Принято', tone: 'ok' },
  rework: { label: 'Замѣчаніе отправлено', tone: 'warn' },
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

function StatusStamp({ tone, label }: { tone: 'ok' | 'wait' | 'warn'; label: string }) {
  if (tone === 'ok') {
    return (
      <span className="font-display text-[9px] uppercase tracking-[0.18em] px-2.5 py-1 border border-[#B08D46]/60 bg-[#B08D46]/10 text-[#8A6B2F]">
        {label}
      </span>
    )
  }
  if (tone === 'warn') {
    return (
      <span className="font-display text-[9px] uppercase tracking-[0.18em] px-2.5 py-1 border border-[#8C2F1B]/60 bg-[#8C2F1B]/5 text-[#8C2F1B]">
        {label}
      </span>
    )
  }
  return (
    <span className="font-display text-[9px] uppercase tracking-[0.18em] px-2.5 py-1 border border-border bg-muted/40 text-muted-foreground">
      {label}
    </span>
  )
}

export default function SupervisorBibliographyPage() {
  const [loading, setLoading] = useState(true)
  const [cycle, setCycle] = useState<{ id: string; name: string } | null>(null)
  const [apps, setApps] = useState<MyAppRow[]>([])
  const [items, setItems] = useState<BibItem[]>([])

  const [reworkFor, setReworkFor] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    const supabase = createClient()

    const { data: c } = await supabase
      .from('cycles')
      .select('id, name')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setCycle(c)

    if (c) {
      const { data: { user } } = await supabase.auth.getUser()
      const uid = user?.id ?? '00000000-0000-0000-0000-000000000000'
      const { data: rows } = await supabase
        .from('applications')
        .select(
          'id, final_title, status, student:profiles!applications_student_id_fkey(full_name), topic:topics(supervisor_id)'
        )
        .eq('cycle_id', c.id)
        .order('created_at', { ascending: true })

      const myApps = ((rows as unknown as MyAppRow[]) || []).filter(
        (a) =>
          (a.status === 'approved' || a.status === 'published') &&
          a.topic?.supervisor_id === uid
      )
      setApps(myApps)

      if (myApps.length > 0) {
        const { data: bib } = await supabase
          .from('bibliography_items')
          .select('id, application_id, position, kind, authors, title, source, year, url, status, comment')
          .in('application_id', myApps.map((a) => a.id))
          .order('position', { ascending: true })
          .order('created_at', { ascending: true })
        setItems((bib as unknown as BibItem[]) || [])
      } else {
        setItems([])
      }
    }

    setLoading(false)
  }

  const review = async (itemId: string, decision: 'approved' | 'rework', note?: string) => {
    setBusyId(itemId)
    setNotice(null)
    const result = await reviewBibItem({
      itemId,
      decision,
      comment: decision === 'rework' ? note : undefined,
    })
    setBusyId(null)
    if (!result.success) {
      setNotice({ type: 'err', text: result.error || 'Ошибка визы' })
      return
    }
    setNotice(
      decision === 'approved'
        ? { type: 'ok', text: 'Источникъ принятъ' }
        : { type: 'ok', text: 'Замѣчаніе отправлено студенту' }
    )
    setReworkFor(null)
    setComment('')
    loadAll()
  }

  const itemsOf = useMemo(() => {
    const byApp: Record<string, BibItem[]> = {}
    for (const it of items) {
      ;(byApp[it.application_id] ??= []).push(it)
    }
    return byApp
  }, [items])

  /* свод по всем дипломникам */
  const totalSummary = useMemo(() => {
    const mine = items
    if (mine.length === 0) return 'списки ещё не начаты'
    const pending = mine.filter((i) => i.status === 'pending').length
    const rework = mine.filter((i) => i.status === 'rework').length
    const approved = mine.filter((i) => i.status === 'approved').length
    const parts: string[] = []
    if (pending) parts.push(`${pending} на проверкѣ`)
    if (rework) parts.push(`${rework} с замѣчаніемъ`)
    parts.push(`${approved} принято`)
    return parts.join(' · ')
  }, [items])

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 animate-fade-in"
        style={{ minHeight: 'calc(100vh - 6rem)' }}
      >
        <Loader2 className="w-6 h-6 animate-spin text-[#8C2F1B]" />
        <p className="font-quote italic text-muted-foreground">Открываем списки дипломниковъ...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Шапка ── */}
      <div className="animate-fade-up">
        <p className="font-display text-[10px] tracking-[0.36em] text-muted-foreground">
          РАЗДЕЛЪ II · СПИСОКЪ ЛИТЕРАТУРЫ
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
          Литература дипломниковъ
        </h1>
        <p className="font-quote italic text-muted-foreground mt-2">
          виза списковъ вашихъ студентовъ — принято / замѣчаніе
        </p>
      </div>

      {/* ── Свод ── */}
      {cycle && (
        <div className="border border-[#B08D46]/60 bg-[#B08D46]/10 px-4 py-3 animate-fade-up [animation-delay:100ms]">
          <p className="text-sm text-[#6E5A2A]">
            Циклъ «{cycle.name}» · {totalSummary}
          </p>
        </div>
      )}

      {!cycle && (
        <div className="border border-border bg-card px-4 py-3 animate-fade-up [animation-delay:100ms]">
          <p className="text-sm text-muted-foreground font-quote italic">
            Активного цикла нетъ
          </p>
        </div>
      )}

      {/* ── Уведомление ── */}
      {notice && (
        <div
          className={`flex items-start gap-2.5 border px-4 py-3 animate-fade-up ${
            notice.type === 'ok'
              ? 'border-[#B08D46]/60 bg-[#B08D46]/10'
              : 'border-l-2 border-l-[#8C2F1B] border-red-200 bg-red-50'
          }`}
        >
          {notice.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-[#8A6B2F] mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-[#8C2F1B] mt-0.5 shrink-0" />
          )}
          <p className={`text-sm ${notice.type === 'ok' ? 'text-[#6E5A2A]' : 'text-red-800'}`}>
            {notice.text}
          </p>
        </div>
      )}

      {/* ── Дипломники ── */}
      <div className="relative">
        <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up [animation-delay:150ms]">
          <Corners />
          <div className="border border-border px-6 py-5">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground pb-3 border-b border-border mb-2">
              Дипломники и их списки
            </p>

            <div className="space-y-6">
              {apps.map((a) => {
                const list = itemsOf[a.id] || []
                const approved = list.filter((i) => i.status === 'approved').length
                const listLabel =
                  list.length === 0
                    ? 'списокъ не начатъ'
                    : `${list.length} источн. · принято ${approved}`
                return (
                  <div key={a.id} className="border border-border/80 px-4 py-4 bg-[#FAF5E8]/40">
                    <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-border/60">
                      <div className="min-w-0">
                        <p className="font-quote font-bold text-[15px]">{a.student?.full_name || '—'}</p>
                        <p className="text-xs text-muted-foreground font-quote italic mt-0.5 truncate">
                          «{a.final_title}»
                        </p>
                      </div>
                      <StatusStamp
                        tone={list.length === 0 ? 'wait' : approved === list.length ? 'ok' : 'warn'}
                        label={listLabel}
                      />
                    </div>

                    <div className="divide-y divide-border/60">
                      {list.map((it) => {
                        const st = ITEM_STATUS[it.status] ?? { label: it.status, tone: 'wait' as const }
                        return (
                          <div key={it.id} className="py-3.5 flex items-start gap-3">
                            <span className="font-display text-sm text-[#B08D46] w-6 shrink-0 text-right pt-0.5">
                              {it.position}.
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-quote text-sm leading-snug">
                                {it.authors && <span className="font-bold">{it.authors} </span>}
                                {it.title}
                                {it.source && <span className="text-muted-foreground"> — {it.source}</span>}
                                {it.year && <span className="text-muted-foreground">, {it.year}</span>}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                                <span className="text-xs text-muted-foreground font-quote italic">
                                  {KIND_LABELS[it.kind] ?? it.kind}
                                </span>
                                {it.url && (
                                  <a
                                    href={it.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-[#8A6B2F] underline underline-offset-2 hover:text-[#8C2F1B] break-all"
                                  >
                                    ссылка
                                  </a>
                                )}
                              </div>
                              {it.status === 'rework' && it.comment && (
                                <p className="font-quote italic text-xs text-red-900 mt-1.5">
                                  замѣчаніе: {it.comment}
                                </p>
                              )}

                              {/* форма замечания */}
                              {reworkFor === it.id && (
                                <div className="mt-2.5 space-y-2">
                                  <textarea
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    rows={2}
                                    placeholder="Что исправить: ГОСТ, полнота, актуальность..."
                                    className="w-full bg-[#FAF5E8] border border-input px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 placeholder:text-muted-foreground/50"
                                  />
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => review(it.id, 'rework', comment)}
                                      disabled={busyId === it.id || !comment.trim()}
                                      className="border border-[#6E2415] bg-[#8C2F1B] text-[#F3EDDF] font-display text-[10px] uppercase tracking-[0.18em] px-3 py-2 transition-colors hover:bg-[#7A2715] disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      {busyId === it.id ? 'Отправляется...' : 'Отправить замѣчаніе'}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setReworkFor(null)
                                        setComment('')
                                      }}
                                      className="inline-flex items-center gap-1 text-xs font-quote italic text-muted-foreground hover:text-[#8C2F1B] transition-colors"
                                    >
                                      <RotateCcw className="w-3 h-3" /> отмѣнить
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <StatusStamp tone={st.tone} label={st.label} />
                              {it.status === 'pending' && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => review(it.id, 'approved')}
                                    disabled={busyId === it.id}
                                    title="Принять источникъ"
                                    className="border border-[#B08D46]/60 bg-[#B08D46]/10 text-[#8A6B2F] font-display text-[10px] uppercase tracking-[0.18em] px-3 py-2 transition-colors hover:bg-[#B08D46]/20 disabled:opacity-40"
                                  >
                                    Принять
                                  </button>
                                  <button
                                    onClick={() => {
                                      setReworkFor(it.id)
                                      setComment('')
                                    }}
                                    disabled={busyId === it.id}
                                    title="Вернуть с замечаніемъ"
                                    className="border border-[#8C2F1B]/60 bg-[#8C2F1B]/5 text-[#8C2F1B] font-display text-[10px] uppercase tracking-[0.18em] px-3 py-2 transition-colors hover:bg-[#8C2F1B]/10 disabled:opacity-40"
                                  >
                                    Замѣчаніе
                                  </button>
                                </div>
                              )}
                              {it.status === 'rework' && (
                                <button
                                  onClick={() => review(it.id, 'approved')}
                                  disabled={busyId === it.id}
                                  title="Принять источникъ"
                                  className="border border-[#B08D46]/60 bg-[#B08D46]/10 text-[#8A6B2F] font-display text-[10px] uppercase tracking-[0.18em] px-3 py-2 transition-colors hover:bg-[#B08D46]/20 disabled:opacity-40"
                                >
                                  Принять
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}

                      {list.length === 0 && (
                        <p className="py-4 font-quote italic text-muted-foreground text-sm">
                          Студентъ ещё не вносилъ источники
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}

              {apps.length === 0 && (
                <div className="py-8 text-center">
                  <BookMarked className="w-5 h-5 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="font-quote italic text-muted-foreground text-sm">
                    Дипломниковъ нетъ — списки появятся послѣ утвержденія темъ приказомъ
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Подпись ── */}
      <p className="text-right font-quote italic text-xs text-muted-foreground/80 animate-fade-in [animation-delay:600ms]">
        Сведения верны — канцелярия кафедры
      </p>
    </div>
  )
}
