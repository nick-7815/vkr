'use client'
import Papa from 'papaparse'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useRef } from 'react'
import { createTopic, updateTopic, deleteTopic, importTopicsFromCsv, submitStudent, cancelApplication } from './actions'
import {
  Loader2, Plus, BookOpen, AlertCircle, CheckCircle2, X,
  ChevronDown, ChevronUp, Pencil, Trash2, FileDown, UserPlus, Ban,
} from 'lucide-react'

/* ── Типы ── */
type Topic = {
  id: string
  cycle_id: string
  supervisor_id: string
  title: string
  description: string | null
  source: string
  status: string
  created_at: string
}
type Cycle = { id: string; name: string; status: string }

type Student = { id: string; full_name: string }
type Application = {
  id: string
  student_id: string
  topic_id: string
  final_title: string
  status: string
  rework_note: string | null
  student: { full_name: string } | null
  topic: { title: string } | null
}

const SOURCE_LABELS: Record<string, string> = {
  new: 'Новая',
  carried_over: 'С прошлых лет',
}

const STATUS_LABELS: Record<string, string> = {
  catalog: 'В каталоге',
  approved: 'Утверждена',
  rejected: 'Отклонена',
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

function JournalInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <input
        {...props}
        className={`peer w-full h-11 bg-[#FAF5E8] border border-input px-3.5 pb-1 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 disabled:opacity-50 placeholder:text-muted-foreground/50 ${props.className ?? ''}`}
      />
      <span
        className="absolute bottom-0 left-0 h-[2px] w-full origin-left scale-x-0 bg-gradient-to-r from-[#C9A45C] to-[#8A6B2F] transition-transform duration-500 ease-out peer-focus:scale-x-100"
        aria-hidden
      />
    </div>
  )
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </label>
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

function SourceBadge({ source }: { source: string }) {
  return (
    <span className="inline-block font-display text-[9px] uppercase tracking-[0.18em] px-2.5 py-1 border border-[#B08D46]/60 bg-[#B08D46]/10 text-[#8A6B2F]">
      {SOURCE_LABELS[source] ?? source}
    </span>
  )
}

export default function SupervisorTopicsPage() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [cycle, setCycle] = useState<Cycle | null>(null)
  const [myId, setMyId] = useState<string | null>(null)
  const [myRole, setMyRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // форма темы
  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formSource, setFormSource] = useState<'new' | 'carried_over'>('new')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

    // правка темы (модаль)
  const [editing, setEditing] = useState<Topic | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editSource, setEditSource] = useState<'new' | 'carried_over'>('new')

  // удаление
  const [deleting, setDeleting] = useState<Topic | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
    // импорт CSV
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<{ success: number; errors: string[] } | null>(null)

  const [cancelling, setCancelling] = useState<Application | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)

    // подачи студентов
  const [students, setStudents] = useState<Student[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [showSubmit, setShowSubmit] = useState(false)
  const [submitStudentId, setSubmitStudentId] = useState('')
  const [submitTopicId, setSubmitTopicId] = useState('')
  const [submitFinal, setSubmitFinal] = useState('')
  const [submitBusy, setSubmitBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // при ошибке — скролл к баннеру, чтобы её точно увидели
  const noticeRef = useRef<HTMLDivElement | null>(null)
  const showError = (text: string) => {
    setNotice({ type: 'err', text })
    setTimeout(() => {
      noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }

    const openCancel = (a: Application) => {
    setCancelling(a)
  }

  const doCancel = async () => {
    if (!cancelling) return
    setCancelBusy(true)
    const result = await cancelApplication(cancelling.id)
    setCancelBusy(false)

    if (!result.success) {
      setNotice({ type: 'err', text: result.error || 'Ошибка отмены' })
      setCancelling(null)
      return
    }
    setCancelling(null)
    loadAll()
  }

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setMyId(user.id)
      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (prof) setMyRole(prof.role)
    }

    // активный цикл
    const { data: cycleData } = await supabase
      .from('cycles')
      .select('id, name, status')
      .eq('status', 'active')
      .maybeSingle()
    setCycle(cycleData)

    // мои темы (в активном цикле, если есть; иначе все)
    let query = supabase
      .from('topics')
      .select('*')
      .order('created_at', { ascending: false })
    if (cycleData) {
      query = query.eq('cycle_id', cycleData.id)
    }
    // наставник видит только свои; замзав — все (RLS сам фильтрует)
    const { data: topicsData } = await query
    setTopics((topicsData as Topic[]) || [])

    // студенты (для подачи) — только роль student
    const { data: studentsData } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'student')
      .eq('is_active', true)
      .order('full_name')
    setStudents((studentsData as Student[]) || [])

    // подачи активного цикла (если есть)
    if (cycleData) {
      const { data: appsData } = await supabase
        .from('applications')
        .select('id, student_id, topic_id, final_title, status, rework_note, student:profiles!applications_student_id_fkey(full_name), topic:topics(title)')
        .eq('cycle_id', cycleData.id)
        .order('created_at', { ascending: false })
      setApplications((appsData as unknown as Application[]) || [])
    } else {
      setApplications([])
    }

    setLoading(false)
  }

  const openCreate = () => {
    setFormTitle('')
    setFormDesc('')
    setFormSource('new')
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (t: Topic) => {
    setEditing(t)
    setEditTitle(t.title)
    setEditDesc(t.description || '')
    setEditSource(t.source as 'new' | 'carried_over')
    setEditError(null)
  }

  const toggleForm = () => {
    if (showForm) {
      setShowForm(false)
    } else {
      openCreate()
    }
    setNotice(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cycle) return

    // нужен supervisor_id: себе или выбранному (замзав)
    const supervisorId = myId || ''

        // клиентская проверка дубля — по уже загруженному каталогу
    const dup = topics.some(
      (t) => t.title.trim().toLowerCase() === formTitle.trim().toLowerCase()
    )
    if (dup) {
      setFormError('Тема с таким названием уже есть в каталоге этого цикла')
      return
    }

    setSaving(true)
    setFormError(null)

    const result = await createTopic({
      cycle_id: cycle.id,
      supervisor_id: supervisorId,
      title: formTitle,
      description: formDesc,
      source: formSource,
    })

    setSaving(false)

    if (!result.success) {
      setFormError(result.error || 'Ошибка сохранения')
      return
    }

    setShowForm(false)
    loadAll()
  }

  const doEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return

    if (!editTitle.trim()) {
      setEditError('Укажите название темы')
      return
    }
        // клиентский дубль — по загруженному каталогу (кроме самой себя)
    const dup = topics.some(
      (t) => t.id !== editing.id &&
      t.title.trim().toLowerCase() === editTitle.trim().toLowerCase()
    )
    if (dup) {
      setEditError('Тема с таким названием уже есть в каталоге этого цикла')
      return
    }

    setEditSaving(true)
    setEditError(null)
    const result = await updateTopic({
      topicId: editing.id,
      title: editTitle,
      description: editDesc,
      source: editSource,
    })
    setEditSaving(false)

    if (!result.success) {
      setEditError(result.error || 'Ошибка правки')
      return
    }
    setEditing(null)
    loadAll()
  }


  const doDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    const result = await deleteTopic(deleting.id)
    setDeleteBusy(false)

    if (!result.success) {
      // закреплённая тема — особый случай: скроллим к баннеру
      if (result.error?.includes('закреплена за студентом')) {
        setNotice({ type: 'err', text: result.error })
        setTimeout(() => {
          noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
      } else {
        showError(result.error || 'Ошибка удаления')
      }
      setDeleting(null)
      return
    }
    setDeleting(null)
    loadAll()
  }

    const doSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cycle) return

    if (!submitStudentId) {
      setSubmitError('Выберите студента')
      return
    }
    if (!submitTopicId) {
      setSubmitError('Выберите тему')
      return
    }
    if (!submitFinal.trim()) {
      setSubmitError('Укажите итоговую формулировку темы')
      return
    }

        // тема уже занята другим студентом?
    const taken = applications.some((a) => a.topic_id === submitTopicId)
    if (taken) {
      setSubmitError('Эта тема уже подана за студента')
      return
    }

    setSubmitBusy(true)
    setSubmitError(null)
    const result = await submitStudent({
      cycleId: cycle.id,
      studentId: submitStudentId,
      topicId: submitTopicId,
      finalTitle: submitFinal,
    })
    setSubmitBusy(false)

    if (!result.success) {
      setSubmitError(result.error || 'Ошибка подачи')
      return
    }
    setSubmitError(null)
    setShowSubmit(false)
    setSubmitStudentId('')
    setSubmitTopicId('')
    setSubmitFinal('')
    loadAll()
  }

    const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !cycle) return

    setNotice(null)
    setImporting(true)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const csvData = results.data as Array<{
          title: string
          description?: string
          source?: string
        }>

        const result = await importTopicsFromCsv(cycle.id, myId || '', csvData)
        setImportResults(result)
        setNotice({
          type: result.errors.length > 0 ? 'err' : 'ok',
          text: `Импортъ оконченъ: внесено темъ — ${result.success}${result.errors.length > 0 ? `, ошибокъ — ${result.errors.length}` : ''}.`,
        })
        loadAll()
        setImporting(false)
      },
      error: (error) => {
        setNotice({ type: 'err', text: 'Ошибка чтения файла: ' + error.message })
        setImporting(false)
      },
    })
  }

  // замечания ректората по моим подачам — для баннера сверху
  const reworkNotes = applications
    .filter((a) => a.rework_note && topics.some((t) => t.id === a.topic_id))
    .map((a) => ({
      note: a.rework_note as string,
      topic: topics.find((t) => t.id === a.topic_id)?.title ?? a.final_title,
    }))

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 animate-fade-in"
        style={{ minHeight: 'calc(100vh - 6rem)' }}
      >
        <Loader2 className="w-6 h-6 animate-spin text-[#8C2F1B]" />
        <p className="font-quote italic text-muted-foreground">Канцелярия готовит каталог...</p>
      </div>
    )
  }

  // нет активного цикла — темы вносить некуда
  if (!cycle) {
    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4 animate-fade-up">
          <div className="pt-1">
            <p className="font-display text-[10px] tracking-[0.36em] text-muted-foreground">
              {myRole === 'deputy' ? 'РАЗДЕЛЪ IV · ТЕМЫ КАФЕДРЫ' : 'РАЗДЕЛЪ IV · МОИ ТЕМЫ'}
            </p>
            <h1 className="font-display text-3xl font-bold tracking-tight mt-2 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
              {myRole === 'deputy' ? 'Темы кафедры' : 'Мои темы'}
            </h1>
          </div>
        </div>

        <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up">
          <Corners />
          <div className="border border-border px-6 py-12 text-center">
            <BookOpen className="w-8 h-8 mx-auto text-[#B08D46]/60 mb-4" />
            <p className="font-display text-lg font-bold">Цикл не открыт</p>
            <p className="font-quote italic text-sm text-muted-foreground mt-2">
              Темы вносятся в активный цикл — зам. заведующий еще не открыл учебный год
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Шапка ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 animate-fade-up">
        <div className="pt-1">
          <p className="font-display text-[10px] tracking-[0.36em] text-muted-foreground">
            {myRole === 'deputy' ? 'РАЗДЕЛЪ IV · ТЕМЫ КАФЕДРЫ' : 'РАЗДЕЛЪ IV · МОИ ТЕМЫ'}
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
            Темы ВКР
          </h1>
          <p className="font-quote italic text-muted-foreground mt-2">
            Циклъ «{cycle.name}» — темы видятъ студенты в каталоге
          </p>
        </div>

        <div className="flex flex-col items-end gap-2.5">
          {myRole !== 'deputy' && (
            <button
              onClick={toggleForm}
              className={`inline-flex items-center gap-2.5 h-11 px-5 font-display text-[11px] uppercase tracking-[0.2em] border transition-all duration-200 active:scale-[0.99] ${
                showForm
                  ? 'bg-[#8C2F1B] border-[#6E2415] text-[#F3EDDF]'
                  : 'bg-card border-[#B08D46]/60 text-foreground hover:border-[#8C2F1B] hover:text-[#8C2F1B]'
              }`}
            >
              <Plus className="w-4 h-4" />
              Вписать тему
            </button>
          )}
          {myRole !== 'deputy' && (
            <button
              onClick={() => { if (importing) return; setShowImport(!showImport); setNotice(null); setImportResults(null) }}
              className={`inline-flex items-center gap-2.5 h-11 px-5 font-display text-[11px] uppercase tracking-[0.2em] border transition-all duration-200 active:scale-[0.99] ${
                showImport
                  ? 'bg-[#8C2F1B] border-[#6E2415] text-[#F3EDDF]'
                  : 'bg-card border-[#B08D46]/60 text-foreground hover:border-[#8C2F1B] hover:text-[#8C2F1B]'
              }`}
            >
              <FileDown className="w-4 h-4" />
              Импортъ CSV
            </button>
          )}
                    <button
            onClick={() => { if (submitBusy) return; setShowSubmit(!showSubmit); setNotice(null); setSubmitError(null) }}
            className={`inline-flex items-center gap-2.5 h-11 px-5 font-display text-[11px] uppercase tracking-[0.2em] border transition-all duration-200 active:scale-[0.99] ${
              showSubmit
                ? 'bg-[#8C2F1B] border-[#6E2415] text-[#F3EDDF]'
                : 'bg-card border-[#B08D46]/60 text-foreground hover:border-[#8C2F1B] hover:text-[#8C2F1B]'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            Подать студента
          </button>
        </div>
      </div>

      {/* ── Баннер (успех/ошибка) ── */}
      {notice && (
        <div
          ref={noticeRef}
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
          <p className={`text-sm ${notice.type === 'ok' ? 'text-[#6E5A2A]' : 'text-red-800'}`}>{notice.text}</p>
        </div>
      )}

      {/* ── Замечанія ректората по подачам (Task_NotifyFix) ── */}
      {reworkNotes.length > 0 && (
        <div className="border-l-2 border-l-[#8C2F1B] border-red-200 bg-red-50 px-4 py-3.5 animate-fade-up">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-[#8C2F1B] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-display text-[10px] uppercase tracking-[0.22em] text-[#8C2F1B]">
                Ректоратъ вернул приказъ съ замечаніями
              </p>
              {reworkNotes.map((r, i) => (
                <p key={i} className="font-quote italic text-sm text-red-900 mt-1 whitespace-pre-wrap">
                  «{r.note}» — по теме «{r.topic}»
                </p>
              ))}
              <p className="text-xs text-muted-foreground mt-1.5">
                Исправьте формулировку темы через «правку» — подача обновится автоматически; секретарь отправит приказъ повторно
              </p>
            </div>
          </div>
        </div>
      )}

      
      {/* ── Форма темы (плавная) ── */}
      <Collapse open={showForm}>
        <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.35)]">
          <Corners />
          <div className="border border-border px-7 py-6 relative">
            <button
              onClick={() => setShowForm(false)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>

            <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Ведомость № 4
            </p>
            <h2 className="font-display text-xl font-bold tracking-tight text-center mt-1.5 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
                Новая тема
            </h2>

            {formError && (
              <div className="mt-4 flex items-start gap-2.5 border-l-2 border-[#8C2F1B] bg-red-50 px-4 py-3 animate-fade-up">
                <AlertCircle className="w-4 h-4 text-[#8C2F1B] mt-0.5 shrink-0" />
                <p className="text-sm text-red-800">{formError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-5 max-w-xl mx-auto">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="topic-title">Название темы</FieldLabel>
                <JournalInput
                  id="topic-title"
                  placeholder="Разработка информационной системы..."
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  maxLength={300}
                  disabled={saving}
                />
              </div>

              <div className="space-y-1.5">
                <FieldLabel htmlFor="topic-desc">Описание (необязательно)</FieldLabel>
                <textarea
                  id="topic-desc"
                  placeholder="Что предстоит сделать, какие технологии..."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={3}
                  disabled={saving}
                  className="peer w-full bg-[#FAF5E8] border border-input px-3.5 py-2.5 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 disabled:opacity-50 placeholder:text-muted-foreground/50 resize-none"
                />
              </div>

                <div className="space-y-1.5">
                  <FieldLabel>Источник</FieldLabel>
                  <div className="flex gap-3">
                    {(['new', 'carried_over'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFormSource(s)}
                        className={`flex-1 h-11 border font-display text-[11px] uppercase tracking-[0.14em] transition-all duration-200 active:scale-[0.99] ${
                          formSource === s
                            ? 'bg-[#8C2F1B] border-[#6E2415] text-[#F3EDDF]'
                            : 'bg-card border-[#B08D46]/60 text-foreground hover:border-[#8C2F1B]'
                        }`}
                      >
                        {SOURCE_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>

              <button type="submit" disabled={saving} className="w-full disabled:opacity-60">
                <WaxButton className="h-12 w-full">
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Сохраняется...
                    </>
                  ) : (
                    'Внести тему'
                  )}
                </WaxButton>
              </button>
            </form>
          </div>
        </div>
      </Collapse>

                  {/* ── Импорт CSV (плавный) ── */}
      <Collapse open={showImport}>
        <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.35)]">
          <Corners />
          <div className="border border-border px-7 py-6">
            <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Приложение · Импортъ темъ
            </p>
            <h2 className="font-display text-xl font-bold tracking-tight text-center mt-1.5 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
              Перепись изъ ведомости CSV
            </h2>

            <div className="mt-6 grid md:grid-cols-2 gap-5 items-start">
              <div className="bg-[#FAF5E8] border border-border p-4">
                <p className="font-display text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                  Форматъ ведомости
                </p>
                <code className="block font-mono text-xs text-foreground/80 leading-relaxed">
                  title,description,source<br />
                  Разработка ML-модели прогноза,Next.js + Supabase,new<br />
                  Анализ данных за прошлый цикл,,carried_over
                </code>
                <p className="font-quote italic text-xs text-muted-foreground mt-3">
                  Только колонка title обязательна. Дубли названий в цикле не принимаются.
                </p>
              </div>

              

              {importing ? (
                <div className="border border-[#B08D46]/40 bg-secondary/40 px-4 py-6 text-center">
                  <Loader2 className="w-5 h-5 mx-auto animate-spin text-[#8C2F1B] mb-2" />
                  <p className="font-display text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    Канцелярия вноситъ темы...
                  </p>
                </div>
              ) : (
                <label className="block cursor-pointer border border-dashed border-[#B08D46]/60 bg-secondary/40 px-4 py-6 text-center transition-colors hover:bg-secondary hover:border-[#8C2F1B]/60">
                  <input type="file" accept=".csv" onChange={handleCsvImport} className="hidden" />
                  <FileDown className="w-5 h-5 mx-auto text-[#8C2F1B] mb-2" />
                  <span className="font-display text-[11px] uppercase tracking-[0.22em]">
                    Выбрать файлъ ведомости
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">
                    файлы формата .csv
                  </p>
                </label>
              )}
            </div>

            

            {importResults && (
              <div className="mt-5 border border-border bg-[#FAF5E8] px-4 py-3 animate-fade-up">
                <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[#8A6B2F]">
                  Внесено въ каталогъ: {importResults.success}
                </p>
                {importResults.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[#8C2F1B]">
                      Не принято ({importResults.errors.length}):
                    </p>
                    <ul className="list-disc list-inside text-sm text-red-800 max-h-40 overflow-y-auto mt-1">
                      {importResults.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Collapse>

             {/* ── Подачи студентов ── */}
      <div className="relative">
        <span
          className="absolute -top-8 -right-2 font-display text-[9rem] leading-none text-[#B08D46]/[0.06] select-none pointer-events-none"
          aria-hidden
        >
          ✓
        </span>

        {/* тоггл подачи */}
        <Collapse open={showSubmit}>
          <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.35)] mb-4">
            <Corners />
            <div className="border border-border px-7 py-6 relative">
              <button
                onClick={() => setShowSubmit(false)}
                className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>

              <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Второй круг
              </p>
              <h2 className="font-display text-xl font-bold tracking-tight text-center mt-1.5 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
                Подать студента
              </h2>
              <p className="font-quote italic text-sm text-muted-foreground text-center mt-2">
                {myRole === 'deputy'
                  ? 'Студент + тема из каталога кафедры — формулировка пойдёт в приказ'
                  : 'Студент + тема из ваших — формулировка пойдёт в приказ'}
              </p>

              {submitError && (
                <div className="mt-4 flex items-start gap-2.5 border-l-2 border-[#8C2F1B] bg-red-50 px-4 py-3 animate-fade-up">
                  <AlertCircle className="w-4 h-4 text-[#8C2F1B] mt-0.5 shrink-0" />
                  <p className="text-sm text-red-800">{submitError}</p>
                </div>
              )}

              <form onSubmit={doSubmit} className="mt-6 space-y-5 max-w-xl mx-auto">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="sub-student">Студент</FieldLabel>
                  <select
                    id="sub-student"
                    value={submitStudentId}
                    onChange={(e) => setSubmitStudentId(e.target.value)}
                    required
                    disabled={submitBusy}
                    className="w-full h-11 bg-[#FAF5E8] border border-input px-3 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 cursor-pointer disabled:opacity-50"
                  >
                    <option value="" disabled>Выберите студента...</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>{s.full_name}</option>
                    ))}
                  </select>
                </div>

                  <div className="space-y-1.5">
                  <FieldLabel htmlFor="sub-topic">
                    {myRole === 'deputy' ? 'Тема (из каталога кафедры)' : 'Тема (из ваших)'}
                  </FieldLabel>
                  <select
                    id="sub-topic"
                    value={submitTopicId}
                    onChange={(e) => {
                      setSubmitTopicId(e.target.value)
                      // автоподстановка формулировки из каталожной темы
                      const t = topics.find((x) => x.id === e.target.value)
                      if (t) setSubmitFinal(t.title)
                    }}
                    required
                    disabled={submitBusy}
                    className="w-full h-11 bg-[#FAF5E8] border border-input px-3 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 cursor-pointer disabled:opacity-50"
                  >
                    <option value="" disabled>Выберите тему...</option>
                    {topics.map((t) => (
                      <option
                        key={t.id}
                        value={t.id}
                        disabled={applications.some((a) => a.topic_id === t.id)}
                      >
                        {t.title}{applications.some((a) => a.topic_id === t.id) ? ' — уже подана' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <FieldLabel htmlFor="sub-final">Итоговая формулировка (пойдёт в диплом)</FieldLabel>
                  <textarea
                    id="sub-final"
                    placeholder="Уточнённая формулировка темы..."
                    value={submitFinal}
                    onChange={(e) => setSubmitFinal(e.target.value)}
                    rows={2}
                    required
                    maxLength={300}
                    disabled={submitBusy}
                    className="w-full bg-[#FAF5E8] border border-input px-3.5 py-2.5 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 disabled:opacity-50 resize-none"
                  />
                </div>

                <button type="submit" disabled={submitBusy} className="w-full disabled:opacity-60">
                  <WaxButton className="h-12 w-full">
                    {submitBusy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Подается...
                      </>
                    ) : (
                      'Подать студента'
                    )}
                  </WaxButton>
                </button>
              </form>
            </div>
          </div>
        </Collapse>

        {/* список подач */}
        <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up [animation-delay:150ms]">
          <Corners />
          <div className="border border-border px-6 py-5">
            
            <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground pb-3 border-b border-border mb-2">
              Поданные студенты · {applications.length}
            </p>

            {applications.length === 0 ? (
              <p className="font-quote italic text-sm text-muted-foreground text-center py-6">
                Подач еще нет — второй круг пуст
              </p>
            ) : (
              <div className="space-y-3">
{applications.map((a, i) => (
  <div
    key={a.id}
    className="border border-border px-5 py-4 flex items-start gap-4 animate-fade-up"
    style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
  >
    <div className="min-w-0 flex-1">
      <p className="font-display text-[15px] font-bold">
        {a.student?.full_name || 'Студентъ'}
      </p>
      <p className="text-sm text-muted-foreground mt-1 font-quote italic">
        «{a.final_title}»
      </p>
      {a.rework_note && (
        <div className="mt-2 inline-block border border-[#8C2F1B]/50 bg-[#8C2F1B]/5 px-3 py-1.5 -rotate-1">
          <p className="font-display text-[9px] uppercase tracking-[0.18em] text-[#8C2F1B]">Замечаніе ректората</p>
          <p className="font-quote italic text-xs text-red-900 mt-0.5 whitespace-pre-wrap">{a.rework_note}</p>
        </div>
      )}
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <span className="inline-block font-display text-[9px] uppercase tracking-[0.18em] px-2.5 py-1 border border-[#B08D46]/60 bg-[#B08D46]/10 text-[#8A6B2F]">
        {a.status === 'submitted' ? 'Подано' : a.status === 'in_order' ? 'В приказе' : 'Утверждено'}
      </span>
      {(() => {
        const topic = topics.find((t) => t.id === a.topic_id)
        if (!topic || topic.status === 'approved') return null
        return (
          <button
            onClick={() => openEdit(topic)}
            title="Править тему"
            className="p-2 border border-[#B08D46]/50 text-muted-foreground hover:text-[#8C2F1B] hover:border-[#8C2F1B] transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )
      })()}
      {a.status === 'submitted' && (
        <button
          onClick={() => openCancel(a)}
          title="Отменить подачу"
          className="p-2 border border-[#8C2F1B]/60 text-[#8C2F1B] bg-[#8C2F1B]/5 hover:bg-[#8C2F1B] hover:text-[#F3EDDF] transition-colors"
        >
          <Ban className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  </div>
))}
              </div>
            )}
          </div>
        </div>
      </div>



      {/* ── Каталог тем ── */}
      <div className="relative">
        <span
          className="absolute -top-8 -right-2 font-display text-[9rem] leading-none text-[#B08D46]/[0.06] select-none pointer-events-none"
          aria-hidden
        >
          IV
        </span>

        {topics.length === 0 ? (
          <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up">
            <Corners />
            <div className="border border-border px-6 py-12 text-center">
              <BookOpen className="w-8 h-8 mx-auto text-[#B08D46]/60 mb-4" />
              <p className="font-display text-lg font-bold">Каталогъ пустъ</p>
              <p className="font-quote italic text-sm text-muted-foreground mt-2">
                {myRole === 'deputy'
                  ? 'Тем еще нет — темы вносят наставники в разделе «Мои темы»'
                  : 'Тем еще нет — впишите первую через «Вписать тему»'}
              </p>
            </div>
          </div>
        ) : (
            <div className="space-y-3">
            <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground pb-3 border-b border-border mb-2">
              Каталогъ темъ · {topics.length}
            </p>
            {topics.map((t, i) => (
              <div
                key={t.id}
                className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_14px_36px_-20px_rgba(43,33,24,0.3)] animate-fade-up"
                style={{ animationDelay: `${Math.min(i, 15) * 40}ms` }}
              >
                <Corners />
                <div className="border border-border px-5 py-4 flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[15px] font-bold [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
                      {t.title}
                    </p>
                    {t.description && (
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{t.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                      <SourceBadge source={t.source} />
                      <span className="text-xs text-muted-foreground font-quote italic">
                        {STATUS_LABELS[t.status] ?? t.status}
                      </span>
                        {applications.some((a) => a.topic_id === t.id) && (
                        <span className="inline-block font-display text-[9px] uppercase tracking-[0.18em] px-2.5 py-1 border border-[#8C2F1B]/60 text-[#8C2F1B] bg-[#8C2F1B]/5">
                          закреплена за студентом
                        </span>
                      )}
                    </div>
                  </div>

                  {/* действия: правка/удаление только неутверждённых */}
                  {t.status !== 'approved' && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => openEdit(t)}
                        title="Править тему"
                        className="p-2 border border-[#B08D46]/50 text-muted-foreground hover:text-[#8C2F1B] hover:border-[#8C2F1B] transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleting(t)}
                        title="Удалить тему"
                        className="p-2 border border-[#B08D46]/50 text-muted-foreground hover:text-[#8C2F1B] hover:border-[#8C2F1B] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>


            {/* ── Правка темы (модаль) ── */}
      {editing && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setEditing(null)}
        >
          <div
            className="relative w-full max-w-md bg-card border border-[#B08D46]/50 p-1.5 shadow-[0_24px_60px_-20px_rgba(43,33,24,0.5)] animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <Corners />
            <div className="border border-border px-7 py-6">
              <button
                onClick={() => setEditing(null)}
                className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>

              <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Правка темы
              </p>
              <h2 className="font-display text-lg font-bold tracking-tight text-center mt-2 leading-snug">
                {editing.title}
              </h2>

              {editError && (
                <div className="mt-4 flex items-start gap-2.5 border-l-2 border-[#8C2F1B] bg-red-50 px-4 py-3 animate-fade-up">
                  <AlertCircle className="w-4 h-4 text-[#8C2F1B] mt-0.5 shrink-0" />
                  <p className="text-sm text-red-800">{editError}</p>
                </div>
              )}

              <form onSubmit={doEdit} className="mt-6 space-y-5">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="edit-title">Название темы</FieldLabel>
                  <JournalInput
                    id="edit-title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                    maxLength={300}
                    disabled={editSaving}
                  />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel htmlFor="edit-desc">Описание (необязательно)</FieldLabel>
                  <textarea
                    id="edit-desc"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={3}
                    disabled={editSaving}
                    className="w-full bg-[#FAF5E8] border border-input px-3.5 py-2.5 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 disabled:opacity-50 resize-none"
                  />
                </div>

                                <div className="space-y-1.5">
                  <FieldLabel>Источник</FieldLabel>
                  <div className="flex gap-3">
                    {(['new', 'carried_over'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setEditSource(s)}
                        className={`flex-1 h-11 border font-display text-[11px] uppercase tracking-[0.14em] transition-all duration-200 active:scale-[0.99] ${
                          editSource === s
                            ? 'bg-[#8C2F1B] border-[#6E2415] text-[#F3EDDF]'
                            : 'bg-card border-[#B08D46]/60 text-foreground hover:border-[#8C2F1B]'
                        }`}
                      >
                        {SOURCE_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>

                <button type="submit" disabled={editSaving} className="w-full disabled:opacity-60">
                  <WaxButton className="h-12 w-full">
                    {editSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Сохраняется...
                      </>
                    ) : (
                      'Сохранить правку'
                    )}
                  </WaxButton>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}



      {/* ── Удаление (модаль) ── */}
      {deleting && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setDeleting(null)}
        >
          <div
            className="relative w-full max-w-md bg-card border border-[#B08D46]/50 p-1.5 shadow-[0_24px_60px_-20px_rgba(43,33,24,0.5)] animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <Corners />
            <div className="border border-border px-7 py-6">
              <button
                onClick={() => setDeleting(null)}
                className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>

              <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Удаление темы
              </p>
              <h2 className="font-display text-lg font-bold tracking-tight text-center mt-2 leading-snug">
                {deleting.title}
              </h2>
              <p className="font-quote italic text-sm text-muted-foreground text-center mt-3">
                Тема будет исключена из каталога. Отменить это будет нельзя.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDeleting(null)}
                  className="h-11 border border-[#B08D46]/60 bg-card text-foreground font-display text-[11px] uppercase tracking-[0.2em] transition-all hover:border-[#8C2F1B] active:scale-[0.99]"
                >
                  Отмена
                </button>
                <button
                  onClick={doDelete}
                  disabled={deleteBusy}
                  className="h-11 border border-[#6E2415] bg-[#8C2F1B] text-[#F3EDDF] font-display text-[11px] uppercase tracking-[0.2em] transition-all hover:bg-[#7A2715] active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {deleteBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Удалить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Отмена подачи (модаль) ── */}
      {cancelling && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setCancelling(null)}
        >
          <div
            className="relative w-full max-w-md bg-card border border-[#B08D46]/50 p-1.5 shadow-[0_24px_60px_-20px_rgba(43,33,24,0.5)] animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <Corners />
            <div className="border border-border px-7 py-6">
              <button
                onClick={() => setCancelling(null)}
                className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>

              <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Отмена подачи
              </p>
              <h2 className="font-display text-lg font-bold tracking-tight text-center mt-2 leading-snug">
                {cancelling.student?.full_name}
              </h2>
              <p className="font-quote italic text-sm text-muted-foreground text-center mt-3">
                Подача будет отозвана: студент вернётся в список неподанных.
                После открытия приказа отмена станет невозможной.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setCancelling(null)}
                  className="h-11 border border-[#B08D46]/60 bg-card text-foreground font-display text-[11px] uppercase tracking-[0.2em] transition-all hover:border-[#8C2F1B] active:scale-[0.99]"
                >
                  Оставить
                </button>
                <button
                  onClick={doCancel}
                  disabled={cancelBusy}
                  className="h-11 border border-[#6E2415] bg-[#8C2F1B] text-[#F3EDDF] font-display text-[11px] uppercase tracking-[0.2em] transition-all hover:bg-[#7A2715] active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {cancelBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Отменить подачу'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* ── Подпись ── */}
      <p className="text-right font-quote italic text-xs text-muted-foreground/80 animate-fade-in [animation-delay:600ms]">
        Первый кругъ: темы без фамилий студентов — подача отдельно
      </p>
    </div>
  )
}