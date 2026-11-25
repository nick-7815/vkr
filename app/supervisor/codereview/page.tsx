'use client'

/* ── Шагъ 5а. Ревью кода: кабинет руководителя ──
   По схеме: руководитель «Проверить замечания и дополнить своими» —
   смотрит архив студента и вписывает замечания; «Подтвердить результат
   проверки» — ставит штампъ подтверждения (студент его видит на «Моей работе»).
   Без ИИ: заключение LLM отложено отдельным блоком. */

import { createClient } from '@/lib/supabase/client'
import NoticeToast from '@/components/notice-toast'
import { useState, useEffect } from 'react'
import { Loader2, FileArchive, ChevronDown, Stamp, CheckCircle2, Undo2, Download, PencilLine } from 'lucide-react'
import { saveSupervisorComment, confirmResult } from './actions'

type Sub = {
  id: string
  student_id: string
  version: number
  storage_path: string
  file_name: string | null
  size_bytes: number | null
  note: string | null
  supervisor_comment: string | null
  supervisor_comment_at: string | null
  confirmed: boolean
  confirmed_at: string | null
  created_at: string
  student: { full_name: string } | null
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

/* ── Плавное раскрытие (как въ «Литературе»): панель остаётся въ DOM
   во время сворачивания (500 мс), затем убирается — отступы не «дырявят» ── */
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

const fmtStamp = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const fmtSize = (b: number | null) =>
  b == null ? '—' : b < 1048576 ? `${Math.round(b / 1024)} КБ` : `${(b / 1048576).toFixed(1)} МБ`

export default function SupervisorCodereviewPage() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [cycleName, setCycleName] = useState<string | null>(null)
  const [students, setStudents] = useState<Map<string, string>>(new Map()) // id → ФИО
  const [topics, setTopics] = useState<Map<string, string>>(new Map()) // student_id → тема
  const [subs, setSubs] = useState<Sub[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [openId, setOpenId] = useState<string | null>(null)

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

    /* мои студенты — черезъ подачи (связка студентъ→тема, какъ въ шагахъ 3–4) */
    const { data: t } = await supabase
      .from('applications')
      .select('student_id, final_title, topic:topics(title, supervisor_id)')
      .in('status', ['submitted', 'approved', 'published', 'in_order'])
    const tRows = (t as {
      student_id: string
      final_title: string | null
      topic: { title: string; supervisor_id: string } | null
    }[] | null) ?? []
    const stMap = new Map<string, string>()
    const tpMap = new Map<string, string>()
    for (const r of tRows) {
      if (r.topic?.supervisor_id !== user.id) continue
      if (!stMap.has(r.student_id)) stMap.set(r.student_id, '')
      tpMap.set(r.student_id, r.final_title || r.topic?.title || '')
    }

    const { data: c } = await supabase
      .from('cycles')
      .select('name')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setCycleName(c?.name ?? null)

    let rows: Sub[] = []
    if (stMap.size > 0) {
      const { data: s } = await supabase
        .from('code_submissions')
        .select('id, student_id, version, storage_path, file_name, size_bytes, note, supervisor_comment, supervisor_comment_at, confirmed, confirmed_at, created_at, student:profiles!code_submissions_student_id_fkey(full_name)')
        .in('student_id', [...stMap.keys()])
        .order('created_at', { ascending: false })
      rows = (s as unknown as Sub[]) ?? []
    }

    /* ФИО дополняем из подач, если в карте пусто */
    for (const r of rows) {
      if (!stMap.get(r.student_id) && r.student?.full_name) stMap.set(r.student_id, r.student.full_name)
    }

    setStudents(stMap)
    setTopics(tpMap)
    setSubs(rows)
    const d: Record<string, string> = {}
    for (const r of rows) d[r.id] = r.supervisor_comment ?? ''
    setDrafts(d)
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  const run = async (key: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(key)
    const res = await fn()
    say(res.ok, res.message ?? (res.ok ? 'Готово' : 'Ошибка'))
    if (res.ok) await loadAll()
    setBusy('')
  }

  /* ── Скачать архивъ: Storage (RLS пропускаетъ руководителя) → файлъ на дискъ ── */
  const download = async (s: Sub) => {
    setBusy(`dl-${s.id}`)
    const supabase = createClient()
    const { data, error } = await supabase.storage.from('code-archives').download(s.storage_path)
    if (error || !data) {
      say(false, 'Архивъ скачать не удалось: ' + (error?.message || 'файлъ не найденъ'))
      setBusy('')
      return
    }
    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = s.file_name || `arkhiv_v${s.version}.zip`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    say(true, `Архивъ «${s.file_name}» скачанъ — можно смотреть содержимое`)
    setBusy('')
  }

  /* последняя версия по каждому студенту */
  const latestByStudent = new Map<string, Sub>()
  for (const r of subs) {
    if (!latestByStudent.has(r.student_id)) latestByStudent.set(r.student_id, r)
  }
  const latest = [...latestByStudent.values()].sort((a, b) =>
    (students.get(a.student_id) ?? '').localeCompare(students.get(b.student_id) ?? ''),
  )

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 animate-fade-in"
        style={{ minHeight: 'calc(100vh - 6rem)' }}
      >
        <Loader2 className="w-6 h-6 animate-spin text-[#8C2F1B]" />
        <p className="font-quote italic text-muted-foreground">Загружаю архивы моих студентов...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Шапка ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 animate-fade-up">
        <div className="pt-1">
          <p className="font-display text-[10px] tracking-[0.36em] text-muted-foreground">
            РАЗДЕЛЪ VII · РЕВЬЮ КОДА
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
            Ревью кода
          </h1>
          <p className="font-quote italic text-muted-foreground mt-2">
            архивы студентовъ — замечанія своими словами и подтвержденіе проверки
            {cycleName ? ` · циклъ «${cycleName}»` : ''}
          </p>
        </div>
      </div>

      <NoticeToast notice={toast} onClose={() => setToast(null)} />

      <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up">
        <Corners />
        <div className="border border-border px-7 py-6">
          {students.size === 0 ? (
            <p className="font-quote italic text-sm text-muted-foreground py-8 text-center">
              У васъ нетъ студентовъ въ руководстве — ревью появится, когда тема будетъ утверждена.
            </p>
          ) : latest.length === 0 ? (
            <p className="font-quote italic text-sm text-muted-foreground py-8 text-center">
              Архивовъ ещё нетъ — студенты не загружали работы на «Моей работе».
            </p>
          ) : (
            <div className="space-y-3">
              {latest.map((s) => {
                const open = openId === s.id
                const older = subs.filter((x) => x.student_id === s.student_id && x.id !== s.id)
                const isMine = s.confirmed
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
                      className="flex flex-wrap items-center gap-2 cursor-pointer select-none group/sub"
                    >
                      <span className="font-quote text-[15px] font-bold transition-colors group-hover/sub:text-[#8C2F1B]">
                        {students.get(s.student_id) ?? '—'}
                      </span>
                      <span className="text-xs text-muted-foreground font-quote italic flex items-center gap-1">
                        <FileArchive className="w-3 h-3" />
                        версія №{s.version} · {s.file_name ?? '—'} · {fmtSize(s.size_bytes)} · {fmtStamp(s.created_at)}
                      </span>
                      {isMine && (
                        <span className="px-2 py-0.5 text-[10px] font-display uppercase tracking-[0.12em] border border-[#4A6B3A]/50 text-[#3E5A30] bg-[#4A6B3A]/10">
                          подтверждено
                        </span>
                      )}
                      <span className="flex items-center gap-2 ml-auto">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            download(s)
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          disabled={busy !== ''}
                          title="Скачать архивъ на дискъ"
                          className="inline-flex items-center gap-1.5 h-8 px-3 font-display text-[10px] uppercase tracking-[0.18em] border border-[#B08D46]/60 bg-card text-foreground transition-all duration-200 hover:border-[#8C2F1B] hover:text-[#8C2F1B] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {busy === `dl-${s.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          скачать архивъ
                        </button>
                        <span
                          title={open ? 'Свернуть' : 'Открыть ревью'}
                          className="p-1.5 border border-[#B08D46]/50 text-muted-foreground group-hover/sub:text-[#8C2F1B] group-hover/sub:border-[#8C2F1B] transition-colors"
                        >
                          <ChevronDown className={`w-4 h-4 transition-transform duration-500 ${open ? 'rotate-180' : ''}`} />
                        </span>
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      тема: {topics.get(s.student_id) ?? '—'}
                      {s.note ? ` · студентъ: «${s.note}»` : ''}
                    </p>

                    <Collapse open={open}>
                      <div className="mt-3 space-y-3">
                        <div>
                          <p className="font-display text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2 flex items-center gap-1.5">
                            <Stamp className="w-3.5 h-3.5" />
                            Проверить замечанія и дополнить своими
                          </p>
                          <textarea
                            value={drafts[s.id] ?? ''}
                            onChange={(e) => setDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                            placeholder="Ваши замечанія къ коду студента…"
                            rows={3}
                            className="w-full text-sm border border-[#B08D46]/60 bg-card px-3 py-2 resize-none"
                          />
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <button
                              onClick={() => run(`comment-${s.id}`, () => saveSupervisorComment(s.id, drafts[s.id] ?? ''))}
                              disabled={busy !== ''}
                              className="inline-flex items-center gap-1.5 h-8 px-3 font-display text-[10px] uppercase tracking-[0.18em] border border-[#6E2415] bg-[#8C2F1B] text-[#F3EDDF] transition-all duration-200 hover:bg-[#7A2715] disabled:opacity-40"
                            >
                              {busy === `comment-${s.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                              сохранить замечанія
                            </button>
                            {isMine ? (
                              <button
                                onClick={() => run(`unconfirm-${s.id}`, () => confirmResult(s.id, false, ''))}
                                disabled={busy !== ''}
                                title="Снять подтверждение"
                                className="inline-flex items-center gap-1.5 h-8 px-3 font-display text-[10px] uppercase tracking-[0.18em] border bg-card border-border text-muted-foreground hover:border-[#8C2F1B] hover:text-[#8C2F1B] transition-all duration-200 disabled:opacity-40"
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                                снять подтверждение
                              </button>
                            ) : (
                              <button
                                onClick={() => run(`confirm-${s.id}`, () => confirmResult(s.id, true, drafts[s.id] ?? ''))}
                                disabled={busy !== ''}
                                title="Подтвердить результат проверки"
                                className="inline-flex items-center gap-1.5 h-8 px-3 font-display text-[10px] uppercase tracking-[0.18em] border border-[#4A6B3A]/60 bg-[#4A6B3A]/10 text-[#3E5A30] transition-all duration-200 hover:bg-[#4A6B3A]/20 disabled:opacity-40"
                              >
                                <Stamp className="w-3.5 h-3.5" />
                                подтвердить результатъ проверки
                              </button>
                            )}
                          </div>
                          {(() => {
                            const saved = s.supervisor_comment ?? ''
                            const dirty = (drafts[s.id] ?? '') !== saved
                            return (
                              <>
                                {s.supervisor_comment && !dirty && (
                                  <p className="font-quote italic text-xs text-[#3E5A30] mt-1.5 flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    замечанія сохранены{s.supervisor_comment_at ? ` · ${fmtStamp(s.supervisor_comment_at)}` : ''}
                                  </p>
                                )}
                                {dirty && (
                                  <p className="font-quote italic text-xs text-[#8A6B2F] mt-1.5 flex items-center gap-1.5">
                                    <PencilLine className="w-3.5 h-3.5" />
                                    въ полѣ есть несохранённые правки — нажмите «сохранить замечанія»
                                  </p>
                                )}
                              </>
                            )
                          })()}
                        </div>

                        {older.length > 0 && (
                          <div className="border-t border-border pt-3">
                            <p className="font-display text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
                              Старые версии ({older.length})
                            </p>
                            <div className="space-y-1">
                              {older.map((o) => (
                                <div key={o.id} className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="font-display text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                    №{o.version}
                                  </span>
                                  <span className="text-muted-foreground font-quote italic">
                                    {o.file_name ?? '—'} · {fmtStamp(o.created_at)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Collapse>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
