'use client'

import { createClient } from '@/lib/supabase/client'
import NoticeToast from '@/components/notice-toast'
import { useState, useEffect, useMemo } from 'react'
import { Loader2, Search, CheckCircle2, AlertCircle, ScrollText } from 'lucide-react'
import { submitOwnApplication, withdrawOwnApplication } from './actions'

type Topic = {
  id: string
  title: string
  supervisor: { full_name: string } | null
}

type MyApp = {
  id: string
  status: string
  final_title: string
  rework_note: string | null
  topic_id: string
  topic: { title: string; supervisor: { full_name: string } | null } | null
}

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Подано',
  in_order: 'В приказе',
  approved: 'Утверждено',
  published: 'Утверждено приказом',
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

function localToday() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export default function StudentTopicsPage() {
  const [loading, setLoading] = useState(true)
  const [cycle, setCycle] = useState<{ id: string; name: string } | null>(null)
  const [windowInfo, setWindowInfo] = useState<{ starts_on: string; ends_on: string } | null>(null)
  const [windowOpen, setWindowOpen] = useState(false)
  const [topics, setTopics] = useState<Topic[]>([])
  const [myApp, setMyApp] = useState<MyApp | null>(null)
  const [search, setSearch] = useState('')
  const [busyTopic, setBusyTopic] = useState<string | null>(null)
  const [withdrawing, setWithdrawing] = useState(false)
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
      const { data: w } = await supabase
        .from('regulation_windows')
        .select('starts_on, ends_on')
        .eq('cycle_id', c.id)
        .eq('stage', 'applications')
        .limit(1)
        .maybeSingle()
      setWindowInfo(w)
      setWindowOpen(!!w && w.starts_on <= localToday() && w.ends_on >= localToday())
    }

    const { data: t } = await supabase
      .from('topics')
      .select('id, title, supervisor:profiles(full_name)')
      .eq('status', 'catalog')
      .order('title', { ascending: true })
        setTopics((t as unknown as Topic[]) || [])

    if (c) {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: app } = await supabase
        .from('applications')
        .select('id, status, final_title, rework_note, topic_id, topic:topics(title, supervisor:profiles(full_name))')
        .eq('cycle_id', c.id)
        .eq('student_id', user?.id ?? '00000000-0000-0000-0000-000000000000')
        .limit(1)
        .maybeSingle()
      setMyApp((app as unknown as MyApp) || null)
    }

    setLoading(false)
  }

  const submitForSelf = async (topicId: string) => {
    setBusyTopic(topicId)
    setNotice(null)
    const result = await submitOwnApplication(topicId)
    setBusyTopic(null)
    if (!result.success) {
      setNotice({ type: 'err', text: result.error || 'Ошибка подачи' })
      return
    }
    setNotice({ type: 'ok', text: 'Подача внесена — тема закреплена за вами до приказа' })
    loadAll()
  }

  const withdraw = async () => {
    if (!myApp) return
    setWithdrawing(true)
    setNotice(null)
    const result = await withdrawOwnApplication(myApp.id)
    setWithdrawing(false)
    if (!result.success) {
      setNotice({ type: 'err', text: result.error || 'Ошибка отзыва' })
      return
    }
    setNotice({ type: 'ok', text: 'Подача отозвана — можно выбрать другую тему' })
    loadAll()
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return topics
    return topics.filter((t) =>
      t.title?.toLowerCase().includes(q) ||
      t.supervisor?.full_name?.toLowerCase().includes(q)
    )
  }, [topics, search])

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 animate-fade-in"
        style={{ minHeight: 'calc(100vh - 6rem)' }}
      >
        <Loader2 className="w-6 h-6 animate-spin text-[#8C2F1B]" />
        <p className="font-quote italic text-muted-foreground">Открываем каталогъ...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Шапка ── */}
      <div className="animate-fade-up">
        <p className="font-display text-[10px] tracking-[0.36em] text-muted-foreground">
          РАЗДЕЛЪ I · КАТАЛОГЪ И ПОДАЧА
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
          Выборъ темы
        </h1>
        <p className="font-quote italic text-muted-foreground mt-2">
          свободные темы наставниковъ — подача только въ открытое окно
        </p>
      </div>

      {/* ── Статус окна ── */}
      {cycle && (
        <div
          className={`flex items-start gap-2.5 border px-4 py-3 animate-fade-up [animation-delay:100ms] ${
            windowOpen
              ? 'border-[#B08D46]/60 bg-[#B08D46]/10'
              : 'border-l-2 border-l-[#8C2F1B] border-red-200 bg-red-50'
          }`}
        >
          {windowOpen ? (
            <CheckCircle2 className="w-4 h-4 text-[#8A6B2F] mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-[#8C2F1B] mt-0.5 shrink-0" />
          )}
          <div>
            <p className={`text-sm ${windowOpen ? 'text-[#6E5A2A]' : 'text-red-800'}`}>
              {windowOpen && windowInfo
                ? `Окно «Каталогъ и подача» открыто: ${fmtDate(windowInfo.starts_on)} — ${fmtDate(windowInfo.ends_on)}`
                : 'Окно «Каталогъ и подача» закрыто — подача и отзыв недоступны'}
            </p>
            <p className="text-xs text-muted-foreground font-quote italic mt-0.5">
              циклъ {cycle.name} · даты задаётъ канцелярія
            </p>
          </div>
        </div>
      )}

      {!cycle && (
        <div className="border border-border bg-card px-4 py-3 animate-fade-up [animation-delay:100ms]">
          <p className="text-sm text-muted-foreground font-quote italic">
            Активного цикла нетъ — работа с темами не началась
          </p>
        </div>
      )}

      {/* ── Уведомление-тост (общая компонента) ── */}
      <NoticeToast notice={notice} onClose={() => setNotice(null)} />

      {/* ── Ваша подача ── */}
      {myApp && (
        <div className="relative border border-[#8C2F1B]/40 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up">
          <Corners />
          <div className="border border-border px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-display text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  Ваша подача
                </p>
                <p className="font-quote font-bold text-lg leading-snug mt-2">
                  «{myApp.final_title}»
                </p>
                <p className="text-sm text-muted-foreground font-quote italic mt-1">
                  Наставникъ: {myApp.topic?.supervisor?.full_name || '—'}
                </p>
                {myApp.rework_note && (
                  <div className="mt-3 inline-block border border-[#8C2F1B]/50 bg-[#8C2F1B]/5 px-3 py-1.5 -rotate-1">
                    <p className="font-display text-[9px] uppercase tracking-[0.18em] text-[#8C2F1B]">
                      Замечаніе ректората
                    </p>
                    <p className="font-quote italic text-xs text-red-900 mt-0.5 whitespace-pre-wrap">
                      {myApp.rework_note}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-3 shrink-0">
                <span className="font-display text-[9px] uppercase tracking-[0.18em] px-2.5 py-1 border border-[#B08D46]/60 bg-[#B08D46]/10 text-[#8A6B2F]">
                  {STATUS_LABELS[myApp.status] ?? myApp.status}
                </span>
                {myApp.status === 'submitted' && windowOpen && (
                  <button
                    onClick={withdraw}
                    disabled={withdrawing}
                    title="Отозвать подачу"
                    className="border border-[#8C2F1B]/60 text-[#8C2F1B] bg-[#8C2F1B]/5 px-4 py-2.5 font-display text-[10px] uppercase tracking-[0.18em] hover:bg-[#8C2F1B] hover:text-[#F3EDDF] transition-colors disabled:opacity-50"
                  >
                    {withdrawing ? 'Отзывается...' : 'Отозвать подачу'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Каталог тем ── */}
      <div className="relative">
        <span
          className="absolute -top-8 -right-2 font-display text-[9rem] leading-none text-[#B08D46]/[0.06] select-none pointer-events-none"
          aria-hidden
        >
          I
        </span>

        <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up [animation-delay:150ms]">
          <Corners />
          <div className="border border-border px-6 py-5">
            <div className="flex flex-wrap items-center gap-4 pb-3 border-b border-border mb-2">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Каталогъ свободныхъ темъ
              </p>
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поискъ: тема или наставникъ..."
                  className="w-full h-9 bg-[#FAF5E8] border border-input pl-9 pr-3 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 placeholder:text-muted-foreground/50"
                />
              </div>
              <p className="font-display text-[10px] uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap">
                {search.trim() ? `найдено ${filtered.length} изъ ${topics.length}` : `всего ${topics.length}`}
              </p>
            </div>

            <div className="space-y-0">
              {filtered.map((t, i) => (
                <div
                  key={t.id}
                  className="border-b border-border/60 last:border-0 px-1 py-4 flex items-start gap-4 animate-fade-up"
                  style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-quote font-bold text-[15px] leading-snug">«{t.title}»</p>
                    <p className="text-sm text-muted-foreground font-quote italic mt-1.5">
                      Наставникъ: {t.supervisor?.full_name || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {myApp?.topic_id === t.id && (
                      <span className="font-display text-[9px] uppercase tracking-[0.18em] px-2.5 py-1 border border-[#8C2F1B]/60 bg-[#8C2F1B]/5 text-[#8C2F1B]">
                        Ваша тема
                      </span>
                    )}
                    <button
                      onClick={() => submitForSelf(t.id)}
                      disabled={!windowOpen || !!myApp || busyTopic === t.id}
                      title={
                        !windowOpen
                          ? 'Окно закрыто'
                          : myApp
                            ? 'У вас уже есть подача'
                            : 'Подать эту тему за себя'
                      }
                      className="shrink-0 border border-[#6E2415] bg-[#8C2F1B] text-[#F3EDDF] font-display text-[10px] uppercase tracking-[0.18em] px-4 py-2.5 transition-all duration-200 hover:bg-[#7A2715] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#8C2F1B]"
                    >
                      {busyTopic === t.id ? 'Вносится...' : 'Подать за себя'}
                    </button>
                  </div>
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="py-8 text-center">
                  <ScrollText className="w-5 h-5 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="font-quote italic text-muted-foreground text-sm">
                    {topics.length === 0
                      ? 'Каталогъ пустъ — свободныхъ темъ пока нетъ'
                      : 'по запросу ничего не найдено'}
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