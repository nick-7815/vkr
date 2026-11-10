'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useMemo } from 'react'
import { Loader2, CheckCircle2, AlertCircle, BookMarked, Pencil, Trash2, X } from 'lucide-react'
import { addBibItem, updateBibItem, deleteBibItem } from './actions'

type BibItem = {
  id: string
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

type MyApp = {
  id: string
  status: string
  final_title: string
  topic: { title: string; supervisor: { full_name: string } | null } | null
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
  rework: { label: 'Замѣчаніе', tone: 'warn' },
}

const EMPTY_FORM = { kind: 'book', authors: '', title: '', source: '', year: '', url: '' }

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

export default function StudentBibliographyPage() {
  const [loading, setLoading] = useState(true)
  const [cycle, setCycle] = useState<{ id: string; name: string } | null>(null)
  const [windowInfo, setWindowInfo] = useState<{ starts_on: string; ends_on: string } | null>(null)
  const [windowOpen, setWindowOpen] = useState(false)
  const [myApp, setMyApp] = useState<MyApp | null>(null)
  const [items, setItems] = useState<BibItem[]>([])

  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
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
        .eq('stage', 'bibliography')
        .limit(1)
        .maybeSingle()
      setWindowInfo(w)
      setWindowOpen(!!w && w.starts_on <= localToday() && w.ends_on >= localToday())
    }

    if (c) {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: app } = await supabase
        .from('applications')
        .select('id, status, final_title, topic:topics(title, supervisor:profiles(full_name))')
        .eq('cycle_id', c.id)
        .eq('student_id', user?.id ?? '00000000-0000-0000-0000-000000000000')
        .limit(1)
        .maybeSingle()
      const a = (app as unknown as MyApp) || null
      setMyApp(a)

      if (a && a.status !== 'submitted' && a.status !== 'in_order') {
        const { data: rows } = await supabase
          .from('bibliography_items')
          .select('id, position, kind, authors, title, source, year, url, status, comment')
          .eq('student_id', user?.id ?? '00000000-0000-0000-0000-000000000000')
          .eq('cycle_id', c.id)
          .order('position', { ascending: true })
          .order('created_at', { ascending: true })
        setItems((rows as unknown as BibItem[]) || [])
      } else {
        setItems([])
      }
    }

    setLoading(false)
  }

  const resetForm = () => {
    setForm({ ...EMPTY_FORM })
    setEditingId(null)
  }

  const startEdit = (it: BibItem) => {
    setEditingId(it.id)
    setForm({
      kind: it.kind,
      authors: it.authors || '',
      title: it.title,
      source: it.source || '',
      year: it.year ? String(it.year) : '',
      url: it.url || '',
    })
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const saveItem = async () => {
    setBusy(true)
    setNotice(null)
    const result = editingId
      ? await updateBibItem({ itemId: editingId, ...form })
      : await addBibItem(form)
    setBusy(false)
    if (!result.success) {
      setNotice({ type: 'err', text: result.error || 'Ошибка сохранения' })
      return
    }
    setNotice(
      editingId
        ? { type: 'ok', text: 'Источникъ обновлён — снова на проверкѣ у наставника' }
        : { type: 'ok', text: 'Источникъ внесёнъ въ списокъ' }
    )
    resetForm()
    loadAll()
  }

  const removeItem = async (id: string) => {
    setBusy(true)
    setNotice(null)
    const result = await deleteBibItem(id)
    setBusy(false)
    if (!result.success) {
      setNotice({ type: 'err', text: result.error || 'Ошибка удаления' })
      return
    }
    setNotice({ type: 'ok', text: 'Источникъ удалёнъ изъ списка' })
    if (editingId === id) resetForm()
    loadAll()
  }

  /* свод по списку */
  const summary = useMemo(() => {
    if (items.length === 0) return { key: 'empty', label: 'Списокъ не начатъ', tone: 'wait' as const }
    if (items.some((i) => i.status === 'rework'))
      return { key: 'rework', label: 'Естъ замѣчаніе наставника', tone: 'warn' as const }
    if (items.every((i) => i.status === 'approved'))
      return { key: 'done', label: 'Списокъ принятъ', tone: 'ok' as const }
    return { key: 'wait', label: 'Списокъ на проверкѣ', tone: 'wait' as const }
  }, [items])

  const listAllowed = myApp && myApp.status !== 'submitted' && myApp.status !== 'in_order'

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 animate-fade-in"
        style={{ minHeight: 'calc(100vh - 6rem)' }}
      >
        <Loader2 className="w-6 h-6 animate-spin text-[#8C2F1B]" />
        <p className="font-quote italic text-muted-foreground">Открываем списокъ литературы...</p>
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
          Литература
        </h1>
        <p className="font-quote italic text-muted-foreground mt-2">
          списокъ ведётъ студентъ — визируетъ наставникъ
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
                ? `Окно «Литература» открыто: ${fmtDate(windowInfo.starts_on)} — ${fmtDate(windowInfo.ends_on)}`
                : 'Окно «Литература» закрыто — ведение списка недоступно'}
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

      {/* ── Нет утверждённой темы ── */}
      {cycle && !myApp && (
        <div className="border border-border bg-card px-4 py-3 animate-fade-up">
          <p className="text-sm text-muted-foreground font-quote italic">
            Подачи нетъ — выберите тему въ разделе «Выборъ темы»
          </p>
        </div>
      )}

      {cycle && myApp && !listAllowed && (
        <div className="border border-border bg-card px-4 py-3 animate-fade-up">
          <p className="text-sm text-muted-foreground font-quote italic">
            Списокъ литературы откроется послѣ утвержденія темы приказомъ
          </p>
        </div>
      )}

      {listAllowed && (
        <>
          {/* ── Тема и свод ── */}
          <div className="relative border border-[#8C2F1B]/40 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up">
            <Corners />
            <div className="border border-border px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-display text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                    Ваша работа
                  </p>
                  <p className="font-quote font-bold text-lg leading-snug mt-2">
                    «{myApp.final_title}»
                  </p>
                  <p className="text-sm text-muted-foreground font-quote italic mt-1">
                    Наставникъ: {myApp.topic?.supervisor?.full_name || '—'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <StatusStamp tone={summary.tone} label={summary.label} />
                  <p className="font-display text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    источниковъ: {items.length} · принято: {items.filter((i) => i.status === 'approved').length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Форма ── */}
          <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up [animation-delay:100ms]">
            <Corners />
            <div className="border border-border px-6 py-5">
              <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
                <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  {editingId ? 'Правка источника' : 'Новый источникъ'}
                </p>
                {editingId && (
                  <button
                    onClick={resetForm}
                    className="inline-flex items-center gap-1.5 text-xs font-quote italic text-muted-foreground hover:text-[#8C2F1B] transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> отмѣнить правку
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-quote italic text-muted-foreground mb-1.5">
                    Вид источника
                  </label>
                  <select
                    value={form.kind}
                    onChange={(e) => setForm({ ...form, kind: e.target.value })}
                    disabled={busy}
                    className="w-full h-9 bg-[#FAF5E8] border border-input px-3 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10"
                  >
                    {Object.entries(KIND_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-quote italic text-muted-foreground mb-1.5">
                    Годъ изданія (не обязателно)
                  </label>
                  <input
                    type="text"
                    value={form.year}
                    onChange={(e) => setForm({ ...form, year: e.target.value })}
                    placeholder="2025"
                    disabled={busy}
                    className="w-full h-9 bg-[#FAF5E8] border border-input px-3 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 placeholder:text-muted-foreground/50"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-quote italic text-muted-foreground mb-1.5">
                    Авторы (не обязателно)
                  </label>
                  <input
                    type="text"
                    value={form.authors}
                    onChange={(e) => setForm({ ...form, authors: e.target.value })}
                    placeholder="Ивановъ И. И., Петровъ П. П."
                    disabled={busy}
                    className="w-full h-9 bg-[#FAF5E8] border border-input px-3 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 placeholder:text-muted-foreground/50"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-quote italic text-muted-foreground mb-1.5">
                    Названіе
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Основы проектированія информационныхъ системъ"
                    disabled={busy}
                    className="w-full h-9 bg-[#FAF5E8] border border-input px-3 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 placeholder:text-muted-foreground/50"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-quote italic text-muted-foreground mb-1.5">
                    Изданіе / журналъ / сайтъ (не обязателно)
                  </label>
                  <input
                    type="text"
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                    placeholder="Издательство МГТУ, г. Москва"
                    disabled={busy}
                    className="w-full h-9 bg-[#FAF5E8] border border-input px-3 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 placeholder:text-muted-foreground/50"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-quote italic text-muted-foreground mb-1.5">
                    Ссылка (для интернетъ-ресурсовъ)
                  </label>
                  <input
                    type="text"
                    value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    placeholder="https://example.com/article"
                    disabled={busy}
                    className="w-full h-9 bg-[#FAF5E8] border border-input px-3 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 placeholder:text-muted-foreground/50"
                  />
                </div>
              </div>

              <div className="flex justify-end mt-5">
                <button
                  onClick={saveItem}
                  disabled={busy || !windowOpen}
                  title={!windowOpen ? 'Окно закрыто' : undefined}
                  className="border border-[#6E2415] bg-[#8C2F1B] text-[#F3EDDF] font-display text-[10px] uppercase tracking-[0.18em] px-5 py-2.5 transition-all duration-200 hover:bg-[#7A2715] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#8C2F1B]"
                >
                  {busy ? 'Записывается...' : editingId ? 'Сохранить правку' : 'Добавить въ списокъ'}
                </button>
              </div>
            </div>
          </div>

          {/* ── Список источников ── */}
          <div className="relative">
            <span
              className="absolute -top-8 -right-2 font-display text-[9rem] leading-none text-[#B08D46]/[0.06] select-none pointer-events-none"
              aria-hidden
            >
              II
            </span>

            <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up [animation-delay:150ms]">
              <Corners />
              <div className="border border-border px-6 py-5">
                <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground pb-3 border-b border-border mb-2">
                  Вашъ списокъ литературы
                </p>

                <div className="space-y-0">
                  {items.map((it, i) => {
                    const st = ITEM_STATUS[it.status] ?? { label: it.status, tone: 'wait' as const }
                    return (
                      <div
                        key={it.id}
                        className="border-b border-border/60 last:border-0 px-1 py-4 flex items-start gap-4 animate-fade-up"
                        style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                      >
                        <span className="font-display text-sm text-[#B08D46] w-6 shrink-0 text-right pt-0.5">
                          {i + 1}.
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-quote text-[15px] leading-snug">
                            {it.authors && <span className="font-bold">{it.authors} </span>}
                            {it.title}
                            {it.source && <span className="text-muted-foreground"> — {it.source}</span>}
                            {it.year && <span className="text-muted-foreground">, {it.year}</span>}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
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
                            <div className="mt-3 inline-block border border-[#8C2F1B]/50 bg-[#8C2F1B]/5 px-3 py-1.5 -rotate-1">
                              <p className="font-display text-[9px] uppercase tracking-[0.18em] text-[#8C2F1B]">
                                Замѣчаніе наставника
                              </p>
                              <p className="font-quote italic text-xs text-red-900 mt-0.5 whitespace-pre-wrap">
                                {it.comment}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <StatusStamp tone={st.tone} label={st.label} />
                          {it.status !== 'approved' && windowOpen && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => startEdit(it)}
                                title="Править источникъ"
                                className="p-2 border border-[#B08D46]/60 text-[#8A6B2F] hover:bg-[#B08D46]/10 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => removeItem(it.id)}
                                disabled={busy}
                                title="Удалить источникъ"
                                className="p-2 border border-[#8C2F1B]/60 text-[#8C2F1B] hover:bg-[#8C2F1B]/10 transition-colors disabled:opacity-40"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {items.length === 0 && (
                    <div className="py-8 text-center">
                      <BookMarked className="w-5 h-5 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="font-quote italic text-muted-foreground text-sm">
                        Списокъ пустъ — начните съ учебниковъ по вашей темѣ
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Подпись ── */}
      <p className="text-right font-quote italic text-xs text-muted-foreground/80 animate-fade-in [animation-delay:600ms]">
        Сведения верны — канцелярия кафедры
      </p>
    </div>
  )
}
