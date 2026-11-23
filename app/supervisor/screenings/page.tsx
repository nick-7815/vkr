'use client'

/* ── Шаг 4. Просмотры: карточки наставника-рецензента ──
   По схеме «как надо»: наставник смотрит чужих студентов (его студента
   смотрят другие). В карточке — оценка, комментарий и контакт для
   консультации; окно закрылось без оценки — плашка «просрочено».
   Отдельной роли нет: наставник без студентов видит здесь свои карточки,
   когда канцелярия назначит его рецензентом. */

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { saveReview } from './actions'
import NoticeToast, { type Notice } from '@/components/notice-toast'

type Asg = {
  id: string
  cycle_id: string
  student_id: string
  screening_no: number
  grade: number | null
  comment: string | null
  contact: string | null
  status: string
  student: { full_name: string } | null
}
type AppRow = { student_id: string; final_title: string | null; topic: { title: string } | null }
type Win = { cycle_id: string; stage: string; starts_on: string; ends_on: string }
type Draft = { grade: string; comment: string; contact: string }

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
function PageHeader() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 animate-fade-up">
      <div className="pt-1">
        <p className="font-display text-[10px] tracking-[0.36em] text-muted-foreground">
          РАЗДЕЛЪ VI · ПРОСМОТРЫ
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
          Просмотры
        </h1>
        <p className="font-quote italic text-muted-foreground mt-2">
          мои карточки рецензента — оценка, комментарий и контактъ
        </p>
      </div>
    </div>
  )
}

export default function SupervisorScreeningsPage() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState<Notice>(null)

  const [cycleName, setCycleName] = useState<string | null>(null)
  const [asgs, setAsgs] = useState<Asg[]>([])
  const [apps, setApps] = useState<Map<string, AppRow>>(new Map())
  const [wins, setWins] = useState<Win[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  const say = (ok: boolean, text: string) => {
    setToast({ type: ok ? 'ok' : 'err', text }) // NoticeToast гаснет сам: 4,5 с / 7 с
  }

  const loadAll = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data: rows } = await supabase
      .from('screening_assignments')
      .select('id, cycle_id, student_id, screening_no, grade, comment, contact, status, student:profiles!screening_assignments_student_id_fkey(full_name)')
      .eq('supervisor_id', user.id)
    const list = (rows as unknown as Asg[]) ?? []
    setAsgs(list)

    const draftState: Record<string, Draft> = {}
    for (const r of list) {
      draftState[r.id] = { grade: r.grade != null ? String(r.grade) : '', comment: r.comment ?? '', contact: r.contact ?? '' }
    }
    setDrafts(draftState)

    const cycleIds = [...new Set(list.map((r) => r.cycle_id))]
    if (cycleIds.length > 0) {
      const [cy, ap, w] = await Promise.all([
        supabase.from('cycles').select('id, name').in('id', cycleIds),
        supabase.from('applications').select('student_id, final_title, topic:topics(title)').in('cycle_id', cycleIds),
        supabase.from('regulation_windows').select('cycle_id, stage, starts_on, ends_on').in('cycle_id', cycleIds).in('stage', ['screening1', 'screening2']),
      ])
      setCycleName(cy.data?.[0]?.name ?? null)
      const am = new Map<string, AppRow>()
      for (const r of (ap.data as unknown as AppRow[]) ?? []) am.set(r.student_id, r)
      setApps(am)
      setWins((w.data as Win[]) ?? [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [])

  const today = localToday()

  const save = async (id: string) => {
    const d = drafts[id]
    if (!d) return
    setBusy(id)
    const grade = d.grade === '' ? null : Number(d.grade)
    const res = await saveReview(id, grade, d.comment, d.contact)
    say(res.ok, res.message ?? (res.ok ? 'Сохранено' : 'Ошибка'))
    if (res.ok) await loadAll()
    setBusy('')
  }

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 animate-fade-in"
        style={{ minHeight: 'calc(100vh - 6rem)' }}
      >
        <Loader2 className="w-6 h-6 animate-spin text-[#8C2F1B]" />
        <p className="font-quote italic text-muted-foreground">Загружаю мои просмотры...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader />
      <NoticeToast notice={toast} onClose={() => setToast(null)} />

      <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up">
        <Corners />
        <div className="border border-border px-7 py-6">
          <p className="font-display text-[10px] tracking-[0.3em] text-muted-foreground uppercase pb-3 border-b border-border">
            Просмотры · мои карточки рецензента
          </p>

          {cycleName && (
            <p className="font-quote italic text-sm text-muted-foreground mt-3">
              Циклъ «{cycleName}» · студентовъ въ ролѣ рецензента: {new Set(asgs.map((a) => a.student_id)).size}
            </p>
          )}

          {asgs.length === 0 ? (
            <p className="font-quote italic text-sm text-muted-foreground py-8 text-center">
              Просмотров нетъ — канцелярия ещё не назначила васъ рецензентомъ.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {[1, 2].map((no) => {
                const group = asgs.filter((a) => a.screening_no === no)
                if (group.length === 0) return null
                return group.map((a) => {
                  const w = wins.find((x) => x.cycle_id === a.cycle_id && x.stage === `screening${no}`)
                  const late = !!w && w.ends_on < today && a.status !== 'done'
                  const app = apps.get(a.student_id)
                  const d = drafts[a.id]
                  return (
                    <div
                      key={a.id}
                      className="border border-[#B08D46]/50 bg-background/40 px-5 py-4 animate-fade-up"
                      style={{ animationDelay: `${Math.max(0, asgs.findIndex((x) => x.id === a.id)) * 80}ms` }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-[10px] uppercase tracking-[0.18em] text-[#8C2F1B]">
                          Просмотръ №{no}
                        </span>
                        <span className="font-quote text-[15px] font-bold">{a.student?.full_name ?? '—'}</span>
                        {w && (
                          <span className="text-xs text-muted-foreground font-quote italic">
                            окно {fmt(w.starts_on)} — {fmt(w.ends_on)}
                          </span>
                        )}
                        {a.status === 'done' ? (
                          <span className="ml-auto px-2 py-0.5 text-[10px] font-display uppercase tracking-[0.12em] border border-[#4A6B3A]/50 text-[#3E5A30] bg-[#4A6B3A]/10">
                            сданъ{a.grade != null ? ` · оценка ${a.grade}` : ''}
                          </span>
                        ) : late ? (
                          <span className="ml-auto px-2 py-0.5 text-[10px] font-display uppercase tracking-[0.12em] border border-[#8C2F1B]/60 text-[#8C2F1B] bg-[#8C2F1B]/10">
                            просрочено
                          </span>
                        ) : (
                          <span className="ml-auto px-2 py-0.5 text-[10px] font-display uppercase tracking-[0.12em] border border-[#B08D46]/60 text-muted-foreground">
                            ожидаетъ
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {app?.final_title ?? app?.topic?.title ?? ''}
                      </p>

                      <div className="mt-3 grid md:grid-cols-[90px_1fr_220px] gap-2">
                        <select
                          value={d?.grade ?? ''}
                          onChange={(e) => setDrafts((s) => ({ ...s, [a.id]: { ...s[a.id], grade: e.target.value } }))}
                          title="Оценка за просмотр"
                          className="h-9 text-sm border border-[#B08D46]/60 bg-card px-2"
                        >
                          <option value="">—</option>
                          {[5, 4, 3, 2].map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                        <textarea
                          value={d?.comment ?? ''}
                          onChange={(e) => setDrafts((s) => ({ ...s, [a.id]: { ...s[a.id], comment: e.target.value } }))}
                          placeholder="Комментарій къ просмотру"
                          rows={2}
                          className="text-sm border border-[#B08D46]/60 bg-card px-3 py-2 resize-none"
                        />
                        <input
                          value={d?.contact ?? ''}
                          onChange={(e) => setDrafts((s) => ({ ...s, [a.id]: { ...s[a.id], contact: e.target.value } }))}
                          placeholder="Контактъ для консультации"
                          className="h-9 text-sm border border-[#B08D46]/60 bg-card px-3"
                        />
                      </div>

                      <button
                        onClick={() => save(a.id)}
                        disabled={busy !== ''}
                        className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 font-display text-[10px] uppercase tracking-[0.18em] border border-[#6E2415] bg-[#8C2F1B] text-[#F3EDDF] transition-all duration-200 hover:bg-[#7A2715] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {busy === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        сохранить
                      </button>
                    </div>
                  )
                })
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
