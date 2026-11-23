'use client'

/* ── Шаг 4. Просмотры: назначение рецензентов (секретарь / замзав) ──
   По схеме «как надо»: на каждом просмотре у студента два рецензента —
   наставники, не его руководитель; шаффл без повторов или вручную;
   окно закрылось без оценок — просрочка видна канцелярии.
   Отдельной роли нет: рецензент — любой наставник из реестра. */

import { createClient } from '@/lib/supabase/client'
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Shuffle, Trash2, X } from 'lucide-react'
import { shuffleReviewers, setSlot, removeAssignment, clearCycle } from '@/lib/screening-actions'
import NoticeToast, { type Notice } from '@/components/notice-toast'

type Teacher = { id: string; full_name: string }
type Win = { stage: string; starts_on: string; ends_on: string }
type AppRow = {
  student_id: string
  final_title: string | null
  student: { full_name: string } | null
  topic: { supervisor_id?: string; title: string; supervisor: { full_name: string } | null } | null
}
type Asg = {
  id: string
  student_id: string
  supervisor_id: string
  screening_no: number
  grade: number | null
  status: string
}

function localToday(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

const fmt = (d: string) =>
  new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

/* ── Декор: латунные уголки рамки (как на всех разделах) ── */
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

/* ── Шапка раздела (как на «Приказах» и «Циклах») ── */
function PageHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 animate-fade-up">
      <div className="pt-1">
        <p className="font-display text-[10px] tracking-[0.36em] text-muted-foreground">
          РАЗДЕЛЪ VI · ПРОСМОТРЫ
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
          Просмотры
        </h1>
        <p className="font-quote italic text-muted-foreground mt-2">{subtitle}</p>
      </div>
    </div>
  )
}

export default function ScreeningAdmin() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState<Notice>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const [cycle, setCycle] = useState<{ id: string; name: string } | null>(null)
  const [windows, setWindows] = useState<Record<number, Win | null>>({ 1: null, 2: null })
  const [apps, setApps] = useState<AppRow[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [assignments, setAssignments] = useState<Asg[]>([])

  const say = (ok: boolean, text: string) => {
    setToast({ type: ok ? 'ok' : 'err', text }) // NoticeToast гаснет сам: 4,5 с / 7 с
  }

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

    if (!c) {
      setLoading(false)
      return
    }

    const [w, a, t, asg] = await Promise.all([
      supabase.from('regulation_windows').select('stage, starts_on, ends_on').eq('cycle_id', c.id).in('stage', ['screening1', 'screening2']),
      supabase
        .from('applications')
        .select('student_id, final_title, student:profiles!applications_student_id_fkey(full_name), topic:topics(supervisor_id, title, supervisor:profiles(full_name))')
        .eq('cycle_id', c.id)
        .in('status', ['approved', 'published']),
      supabase.from('profiles').select('id, full_name').eq('role', 'supervisor').eq('is_active', true).order('full_name'),
      supabase.from('screening_assignments').select('id, student_id, supervisor_id, screening_no, grade, status').eq('cycle_id', c.id),
    ])

    const wins = (w.data as Win[] | null) ?? []
    setWindows({
      1: wins.find((x) => x.stage === 'screening1') ?? null,
      2: wins.find((x) => x.stage === 'screening2') ?? null,
    })
    setApps((a.data as unknown as AppRow[]) ?? [])
    setTeachers((t.data as Teacher[]) ?? [])
    setAssignments((asg.data as Asg[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  const today = localToday()

  const windowLate = (no: number) => {
    const w = windows[no]
    return !!w && w.ends_on < today
  }

  const byStudent = useMemo(() => {
    const m = new Map<string, Asg[]>()
    for (const s of assignments) {
      const arr = m.get(s.student_id) ?? []
      arr.push(s)
      m.set(s.student_id, arr)
    }
    return m
  }, [assignments])

  const doneCount = assignments.filter((s) => s.status === 'done').length
  const slotsTotal = apps.length * 4

  const run = async (key: string, fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) => {
    setBusy(key)
    const res = await fn()
    say(res.ok, res.message ?? (res.ok ? 'Готово' : 'Ошибка'))
    if (res.ok && after) after()
    setBusy('')
  }

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 animate-fade-in"
        style={{ minHeight: 'calc(100vh - 6rem)' }}
      >
        <Loader2 className="w-6 h-6 animate-spin text-[#8C2F1B]" />
        <p className="font-quote italic text-muted-foreground">Канцелярия готовитъ просмотры...</p>
      </div>
    )
  }

  if (!cycle) {
    return (
      <div className="space-y-8">
        <PageHeader subtitle="назначеніе рецензентовъ: шаффлъ безъ повторовъ или вручную" />
        <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up">
          <Corners />
          <div className="border border-border px-7 py-10 text-center">
            <p className="font-quote italic text-muted-foreground">
              Активного цикла нетъ — назначеніе появится после открытыя цикла.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader subtitle="назначеніе рецензентовъ: шаффлъ безъ повторовъ или вручную" />
      <NoticeToast notice={toast} onClose={() => setToast(null)} />

      <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up">
        <Corners />
        <div className="border border-border px-7 py-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
            <div>
              <p className="font-display text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
                Просмотры · назначеніе рецензентовъ
              </p>
              <p className="font-quote italic text-sm text-muted-foreground mt-1">
                Циклъ «{cycle.name}» · студентовъ утверждено: {apps.length} · слотовъ занято: {assignments.length}/{slotsTotal || '—'} · сдано: {doneCount}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => run('shuffle', () => shuffleReviewers(cycle.id), loadAll)}
                disabled={busy !== '' || apps.length === 0}
                title="Разложить рецензентов автоматически: два наставника на просмотр, без руководителя студента"
                className="inline-flex items-center gap-1.5 h-8 px-3 font-display text-[10px] uppercase tracking-[0.18em] border border-[#6E2415] bg-[#8C2F1B] text-[#F3EDDF] transition-all duration-200 hover:bg-[#7A2715] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy === 'shuffle' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shuffle className="w-3.5 h-3.5" />}
                шаффлъ
              </button>
              {confirmClear ? (
                <span className="inline-flex items-center gap-2">
                  <span className="text-xs text-[#8C2F1B]">убрать всѣ?</span>
                  <button
                    onClick={() => {
                      setConfirmClear(false)
                      run('clear', () => clearCycle(cycle.id), loadAll)
                    }}
                    disabled={busy !== ''}
                    className="h-8 px-3 font-display text-[10px] uppercase tracking-[0.18em] border border-[#8C2F1B] bg-[#8C2F1B]/10 text-[#8C2F1B]"
                  >
                    да
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="h-8 px-3 font-display text-[10px] uppercase tracking-[0.18em] border border-border bg-card text-muted-foreground"
                  >
                    отмена
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  disabled={busy !== '' || assignments.length === 0}
                  title="Убрать все назначения цикла"
                  className="inline-flex items-center gap-1.5 h-8 px-3 font-display text-[10px] uppercase tracking-[0.18em] border bg-card border-border text-muted-foreground hover:border-[#8C2F1B] hover:text-[#8C2F1B] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  убрать всѣ
                </button>
              )}
            </div>
          </div>

          {[1, 2].map((no) => {
            const w = windows[no]
            return (
              <p key={no} className="mt-2 text-xs text-muted-foreground">
                Просмотръ №{no}:{' '}
                {w ? (
                  <>
                    окно <span className="font-quote italic">{fmt(w.starts_on)} — {fmt(w.ends_on)}</span>
                    {windowLate(no) && <span className="ml-2 text-[#8C2F1B] font-bold uppercase tracking-[0.12em]">окно закрылось</span>}
                  </>
                ) : (
                  <span className="italic">окно замзавомъ не задано</span>
                )}
              </p>
            )
          })}

          {apps.length === 0 ? (
            <p className="font-quote italic text-sm text-muted-foreground py-8 text-center">
              Утверждённыхъ подачъ нетъ — рецензентовъ раскладывать не на кого.
            </p>
          ) : (
              <div className={`overflow-x-auto mt-4 transition-opacity duration-500 ${busy === 'shuffle' ? 'opacity-40 pointer-events-none' : ''}`}>
                <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left font-display text-[10px] uppercase tracking-[0.18em] text-muted-foreground pb-2 pr-3">Студентъ</th>
                    <th className="text-left font-display text-[10px] uppercase tracking-[0.18em] text-muted-foreground pb-2 pr-3">Тема</th>
                    <th className="text-left font-display text-[10px] uppercase tracking-[0.18em] text-muted-foreground pb-2 pr-3">Наставникъ</th>
                    {[1, 2].map((no) => (
                      <th key={no} className="text-left font-display text-[10px] uppercase tracking-[0.18em] text-muted-foreground pb-2 pr-3">
                        Просмотръ №{no}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {apps.map((a) => {
                    const list = byStudent.get(a.student_id) ?? []
                    const own = a.topic?.supervisor?.full_name
                    const topicSupId = a.topic?.supervisor_id
                    return (
                      <tr key={a.student_id} className="border-b border-border/60 align-top">
                        <td className="py-3 pr-3 font-quote font-bold whitespace-nowrap">{a.student?.full_name ?? '—'}</td>
                        <td className="py-3 pr-3 max-w-[200px] text-xs text-muted-foreground line-clamp-2">
                          {a.final_title ?? a.topic?.title ?? '—'}
                        </td>
                        <td className="py-3 pr-3 whitespace-nowrap text-xs">{own ?? '—'}</td>
                        {[1, 2].map((no) => {
                          const rows = list.filter((s) => s.screening_no === no)
                          const late = windowLate(no) && rows.some((r) => r.status !== 'done')
                          const pickedIds = rows.map((r) => r.supervisor_id)
                          const selectable = teachers.filter((t) => t.id !== topicSupId && !pickedIds.includes(t.id))
                          return (
                            <td key={no} className="py-2 pr-3">
                              {late && (
                                <span className="inline-block mb-1 px-2 py-0.5 text-[10px] font-display uppercase tracking-[0.12em] border border-[#8C2F1B]/60 text-[#8C2F1B] bg-[#8C2F1B]/10">
                                  просрочено
                                </span>
                              )}
                              <div className="space-y-1.5">
                                {rows.map((r, i) => (
                                  <span
                                    key={r.id}
                                    className="flex items-center gap-1.5 animate-fade-up"
                                    style={{ animationDelay: `${i * 90}ms` }}
                                  >
                                    <span
                                      className={`inline-flex items-center gap-1 px-2 py-1 text-xs border ${
                                        r.status === 'done'
                                          ? 'border-[#4A6B3A]/50 bg-[#4A6B3A]/10 text-[#3E5A30]'
                                          : 'border-[#B08D46]/60 bg-card text-foreground/80'
                                      }`}
                                    >
                                      {teachers.find((t) => t.id === r.supervisor_id)?.full_name ?? '—'}
                                      {r.status === 'done' && r.grade != null && <b>· {r.grade}</b>}
                                    </span>
                                    <button
                                      onClick={() => run(`del-${r.id}`, () => removeAssignment(r.id), loadAll)}
                                      disabled={busy !== ''}
                                      title="Снять рецензента"
                                      className="p-1 text-muted-foreground hover:text-[#8C2F1B] disabled:opacity-40"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                ))}
                                {rows.length < 2 && (
                                  <select
                                    value=""
                                    onChange={(e) => {
                                      const id = e.target.value
                                      if (id) run(`set-${a.student_id}-${no}`, () => setSlot(cycle.id, a.student_id, no, id), loadAll)
                                    }}
                                    disabled={busy !== '' || selectable.length === 0}
                                    title={selectable.length === 0 ? 'Свободных наставников нет' : 'Назначить рецензента'}
                                    className="w-[190px] h-7 text-xs border border-dashed border-[#B08D46]/60 bg-card px-2 text-muted-foreground disabled:opacity-40 animate-fade-in"
                                    style={{ animationDelay: `${rows.length * 90}ms` }}
                                  >
                                    <option value="">+ рецензентъ…</option>
                                    {selectable.map((t) => (
                                      <option key={t.id} value={t.id}>{t.full_name}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
