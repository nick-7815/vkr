'use client'

/* ── Моя работа студента: шагъ 5а (архивъ съ кодомъ) ──
   По схеме: «Загрузить архив с кодом» → руководитель смотрит, вписывает
   замечания → студент грузит новую версию → «Подтвердить результат проверки».
   Без ИИ: LLM-ревью отложено отдельным блоком; замечания видны после
   того, как руководитель их впишет. */

import { createClient } from '@/lib/supabase/client'
import NoticeToast from '@/components/notice-toast'
import { useState, useEffect, useRef } from 'react'
import { Loader2, Upload, FileArchive, ChevronDown, ChevronUp, BookUser, Stamp, X, Trash2 } from 'lucide-react'
import { deleteArchive, submitArchive } from './actions'

type Win = { starts_on: string; ends_on: string }
type MyApp = {
  final_title: string | null
  topic: { title: string; supervisor: { full_name: string } | null } | null
}
type Sub = {
  id: string
  version: number
  file_name: string | null
  size_bytes: number | null
  note: string | null
  supervisor_comment: string | null
  confirmed: boolean
  confirmed_at: string | null
  created_at: string
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

/* ── Плавное раскрытие (как въ «Литературе» и у наставника) ── */
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

function localToday(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

const fmtStamp = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const fmtSize = (b: number | null) =>
  b == null ? '—' : b < 1048576 ? `${Math.round(b / 1024)} КБ` : `${(b / 1048576).toFixed(1)} МБ`

export default function StudentMyWorkPage() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [cycle, setCycle] = useState<{ id: string; name: string } | null>(null)
  const [win, setWin] = useState<Win | null>(null)
  const [app, setApp] = useState<MyApp | null>(null)
  const [subs, setSubs] = useState<Sub[]>([])

  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [delTarget, setDelTarget] = useState<Sub | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /* «не тотъ файлъ» — отмена выбора: сбрасываемъ и стейтъ, и input */
  const clearFile = () => {
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const say = (ok: boolean, text: string) => {
    setToast({ type: ok ? 'ok' : 'err', text })
  }

  const loadAll = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data: c } = await supabase
      .from('cycles')
      .select('id, name')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setCycle(c)
    if (!c) {
      setLoading(false)
      return
    }

    const [w, a, s] = await Promise.all([
      supabase.from('regulation_windows').select('starts_on, ends_on').eq('cycle_id', c.id).eq('stage', 'code_review').limit(1).maybeSingle(),
      supabase
        .from('applications')
        .select('final_title, topic:topics(title, supervisor:profiles(full_name))')
        .eq('cycle_id', c.id)
        .eq('student_id', user.id)
        .in('status', ['approved', 'published'])
        .limit(1)
        .maybeSingle(),
      supabase
        .from('code_submissions')
        .select('id, version, file_name, size_bytes, note, supervisor_comment, confirmed, confirmed_at, created_at')
        .eq('cycle_id', c.id)
        .eq('student_id', user.id)
        .order('version', { ascending: false }),
    ])

    setWin((w.data as Win | null) ?? null)
    setApp((a.data as unknown as MyApp | null) ?? null)
    setSubs((s.data as Sub[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  const today = localToday()
  const late = !!win && win.ends_on < today
  const nextVersion = (subs[0]?.version ?? 0) + 1

  /* ── Загрузка архива: Storage из браузера → серверное действие ── */
  const upload = async () => {
    if (!cycle || !file) return
    if (file.size > 52428800) {
      say(false, 'Архивъ больше 50 МБ — Storage не приметъ')
      return
    }
    setBusy('upload')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const path = `${user?.id}/${cycle.id}/v${nextVersion}_${Date.now()}.zip`
    const { error } = await supabase.storage.from('code-archives').upload(path, file, { upsert: false })
    if (error) {
      say(false, 'Storage: ' + error.message)
      setBusy('')
      return
    }
    const res = await submitArchive(cycle.id, path, file.name, file.size, note)
    say(res.ok, res.message ?? (res.ok ? 'Готово' : 'Ошибка'))
    if (res.ok) {
      clearFile()
      setNote('')
    }
    await loadAll()
    setBusy('')
  }

  /* ── Удалить версию: модалка подтверждения (как въ «Литературе») ── */
  const confirmDelete = async () => {
    if (!delTarget) return
    const target = delTarget
    setBusy(`del-${target.id}`)
    const res = await deleteArchive(target.id)
    say(res.ok, res.message ?? (res.ok ? 'Готово' : 'Ошибка'))
    if (res.ok) {
      setDelTarget(null)
      setOpenId((cur) => (cur === target.id ? null : cur))
    }
    await loadAll()
    setBusy('')
  }

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 animate-fade-in"
        style={{ minHeight: 'calc(100vh - 6rem)' }}
      >
        <Loader2 className="w-6 h-6 animate-spin text-[#8C2F1B]" />
        <p className="font-quote italic text-muted-foreground">Открываю мою работу...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Шапка ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 animate-fade-up">
        <div className="pt-1">
          <p className="font-display text-[10px] tracking-[0.36em] text-muted-foreground">
            РАЗДЕЛЪ V · МОЯ РАБОТА
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
            Моя работа
          </h1>
          <p className="font-quote italic text-muted-foreground mt-2">
            архивъ съ кодомъ: версии, замечанія руководителя, подтвержденіе
          </p>
        </div>
      </div>

      <NoticeToast notice={toast} onClose={() => setToast(null)} />

      {!cycle ? (
        <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up">
          <Corners />
          <div className="border border-border px-7 py-10 text-center">
            <p className="font-quote italic text-muted-foreground">Активного цикла нетъ — загрузка появится после открытія цикла.</p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Карточка темы и окна ── */}
          <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up">
            <Corners />
            <div className="border border-border px-7 py-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-display text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  Тема ВКР · циклъ «{cycle.name}»
                </p>
                <p className="font-display text-xl font-bold tracking-tight mt-1 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
                  {app?.final_title || app?.topic?.title || '—'}
                </p>
                <p className="font-quote italic text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                  <BookUser className="w-3.5 h-3.5" />
                  руководитель: {app?.topic?.supervisor?.full_name ?? '—'}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Окно «Ревью кода»</p>
                <p className="font-quote italic text-sm mt-1">
                  {win ? (
                    <>
                      {fmtDate(win.starts_on)} — {fmtDate(win.ends_on)}
                      {late && <span className="ml-2 text-[#8C2F1B] font-bold uppercase tracking-[0.12em] text-[10px] font-display">окно закрылось</span>}
                    </>
                  ) : (
                    <span className="italic text-muted-foreground">даты не заданы</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* ── Загрузка новой версии ── */}
          <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up">
            <Corners />
            <div className="border border-border px-7 py-6">
              <p className="font-display text-[10px] uppercase tracking-[0.3em] text-muted-foreground pb-3 border-b border-border">
                Загрузка архива · версия №{nextVersion}
              </p>
              {app ? (
                <div className="mt-4 space-y-3">
                  <p className="font-quote italic text-sm text-muted-foreground">
                    только .zip до 50 МБ · руководитель посмотритъ и впишетъ замечанія
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 h-8 px-3 cursor-pointer select-none font-display text-[10px] uppercase tracking-[0.18em] border border-[#B08D46]/60 bg-card text-foreground transition-all duration-200 hover:border-[#8C2F1B] hover:text-[#8C2F1B]">
                      <FileArchive className="w-3.5 h-3.5" />
                      выбрать файлъ
                      <input
                        type="file"
                        accept=".zip"
                        ref={fileRef}
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        title="Архивъ съ кодомъ (.zip)"
                        className="sr-only"
                      />
                    </label>
                    {file ? (
                      <>
                        <span className="font-quote italic text-sm text-foreground min-w-0 truncate">
                          {file.name} · {fmtSize(file.size)}
                        </span>
                        <button
                          onClick={clearFile}
                          disabled={busy !== ''}
                          title="Отменить выбор файла"
                          className="inline-flex items-center justify-center w-7 h-7 shrink-0 border border-[#B08D46]/60 bg-card text-muted-foreground transition-all duration-200 hover:border-[#8C2F1B] hover:text-[#8C2F1B] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className="font-quote italic text-sm text-muted-foreground">файлъ не выбранъ</span>
                    )}
                  </div>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={subs.length === 0 ? 'Комментарій къ работе (необязательно)' : 'Что исправилъ по замечаніямъ…'}
                    rows={2}
                    className="w-full text-sm border border-[#B08D46]/60 bg-card px-3 py-2 resize-none"
                  />
                  <button
                    onClick={upload}
                    disabled={busy !== '' || !file}
                    className="inline-flex items-center gap-1.5 h-10 px-6 font-display text-[10px] uppercase tracking-[0.18em] border border-[#6E2415] bg-[#8C2F1B] text-[#F3EDDF] transition-all duration-200 hover:bg-[#7A2715] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {busy === 'upload' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    загрузить архивъ
                  </button>
                </div>
              ) : (
                <p className="font-quote italic text-sm text-muted-foreground py-6 text-center">
                  Архивъ загрузить нельзя: подача въ этомъ цикле не утверждена.
                </p>
              )}
            </div>
          </div>

          {/* ── Версии и замечанія ── */}
          <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up">
            <Corners />
            <div className="border border-border px-7 py-6">
              <p className="font-display text-[10px] uppercase tracking-[0.3em] text-muted-foreground pb-3 border-b border-border">
                Версии архивовъ {subs.length > 0 && `· ${subs.length}`}
              </p>
              {subs.length === 0 ? (
                <p className="font-quote italic text-sm text-muted-foreground py-8 text-center">
                  Архивовъ ещё нетъ — загрузите первую версию выше.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {subs.map((s) => {
                    const open = openId === s.id
                    return (
                      <div key={s.id} className="border border-[#B08D46]/50 bg-background/40 px-5 py-4 animate-fade-up">
                        <div
                          tabIndex={0}
                          aria-expanded={open}
                          onClick={() => setOpenId(open ? null : s.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setOpenId(open ? null : s.id)
                            }
                          }}
                          className="flex flex-wrap items-center gap-2 cursor-pointer select-none group/ver"
                        >
                          <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[#8C2F1B]">
                            Версія №{s.version}
                          </span>
                          <span className="text-xs text-muted-foreground font-quote italic flex items-center gap-1 transition-colors group-hover/ver:text-[#8C2F1B]">
                            <FileArchive className="w-3 h-3" />
                            {s.file_name ?? '—'} · {fmtSize(s.size_bytes)} · {fmtStamp(s.created_at)}
                          </span>
                          {s.confirmed && (
                            <span className="px-2 py-0.5 text-[10px] font-display uppercase tracking-[0.12em] border border-[#4A6B3A]/50 text-[#3E5A30] bg-[#4A6B3A]/10">
                              подтверждено руководителемъ
                            </span>
                          )}
                          <span className="flex items-center gap-2 ml-auto">
                            {!s.confirmed && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDelTarget(s)
                                }}
                                onKeyDown={(e) => e.stopPropagation()}
                                disabled={busy !== ''}
                                title="Удалить эту версію (пока не подтверждена)"
                                className="inline-flex items-center gap-1.5 h-7 px-2 font-display text-[10px] uppercase tracking-[0.18em] border border-[#B08D46]/60 bg-card text-muted-foreground transition-all duration-200 hover:border-[#8C2F1B] hover:text-[#8C2F1B] disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {busy === `del-${s.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                удалить
                              </button>
                            )}
                            {s.supervisor_comment && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setOpenId(open ? null : s.id)
                                }}
                                onKeyDown={(e) => e.stopPropagation()}
                                className="p-1 text-muted-foreground hover:text-[#8C2F1B]"
                                title={open ? 'Свернуть' : 'Показать замечанія'}
                              >
                                {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            )}
                          </span>
                        </div>

                        {s.note && (
                          <p className="font-quote italic text-xs text-muted-foreground mt-2">
                            комментарийъ студента: {s.note}
                          </p>
                        )}

                        <Collapse open={open && !!s.supervisor_comment}>
                          <div className="mt-3">
                            <div className="border border-[#4A6B3A]/50 bg-[#4A6B3A]/5 px-4 py-3">
                              <p className="font-display text-[10px] uppercase tracking-[0.3em] text-[#3E5A30] mb-2 flex items-center gap-1.5">
                                <Stamp className="w-3.5 h-3.5" />
                                Замечанія руководителя
                                {s.confirmed_at ? ` · ${fmtStamp(s.confirmed_at)}` : ''}
                              </p>
                              <p className="text-sm whitespace-pre-line leading-relaxed">{s.supervisor_comment}</p>
                            </div>
                          </div>
                        </Collapse>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Модалка подтверждения удаления версии (как въ «Литературе») ── */}
      {delTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B2118]/50 animate-fade-in"
          onClick={() => setDelTarget(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md border border-[#B08D46]/60 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_30px_70px_-20px_rgba(43,33,24,0.5)] animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <Corners />
            <div className="border border-border px-6 py-5">
              <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
                <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  Подтверждение
                </p>
                <button
                  onClick={() => setDelTarget(null)}
                  title="Закрыть"
                  className="p-1.5 border border-border text-muted-foreground hover:text-[#8C2F1B] hover:border-[#8C2F1B]/50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="font-quote text-sm text-foreground leading-relaxed">
                Удалить <b className="text-[#8C2F1B]">версію №{delTarget.version}</b> — {delTarget.file_name ?? '—'} ({fmtSize(delTarget.size_bytes)})?
              </p>
              <p className="font-quote text-sm text-muted-foreground mt-2">
                Файлъ изъ хранилища и запись о версии будутъ удалены.
              </p>
              <p className="font-quote italic text-xs text-[#8C2F1B]/80 mt-3">
                Вниманіе: дѣйствіе нельзя будеть отменить.
              </p>

              <div className="flex items-center justify-end gap-4 mt-5">
                <button
                  onClick={() => setDelTarget(null)}
                  className="text-xs font-quote italic text-muted-foreground hover:text-[#8C2F1B] transition-colors"
                >
                  отмѣнить
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={busy !== ''}
                  className="inline-flex items-center gap-1.5 border border-[#6E2415] bg-[#8C2F1B] text-[#F3EDDF] font-display text-[10px] uppercase tracking-[0.18em] px-5 py-2 transition-all duration-200 hover:bg-[#7A2715] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy === `del-${delTarget.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  удалить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
