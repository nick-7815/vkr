'use client'

import { createClient } from '@/lib/supabase/client'
import NoticeToast from '@/components/notice-toast'
import { useState, useEffect, useMemo } from 'react'
import Papa from 'papaparse'
import {
  Loader2, UserPlus, FileDown, AlertCircle, CheckCircle2, Search,
  Ban, RotateCcw, Pencil, X, Eye, EyeOff,
} from 'lucide-react'
import { importStudentsFromCsv, createUserManually, setUserActive, updateProfile } from './actions'
type UserRole =
  | 'student' | 'supervisor' | 'reviewer'
  | 'secretary' | 'head' | 'deputy'

type User = {
  id: string
  full_name: string
  email: string
  role: string
  student_id?: string
  is_active?: boolean
}

const ROLE_LABELS: Record<UserRole, string> = {
  student: 'Студентъ',
  supervisor: 'Наставникъ',
  reviewer: 'Рецензентъ',
  secretary: 'Секретарь',
  head: 'Заведующий кафедрой',
  deputy: 'Зам. заведующего',
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

/* Бейдж звания: сургуч — начальство, латунь — преподаватели, серый — студенты */
function RoleBadge({ role }: { role: string }) {
  const label = ROLE_LABELS[role as UserRole] ?? role
  const wax = role === 'deputy' || role === 'head'
  const brass = !wax && role !== 'student'
  return (
    <span
      className={`inline-block font-display text-[9px] uppercase tracking-[0.18em] px-2.5 py-1 border ${
        wax
          ? 'bg-[#8C2F1B] border-[#6E2415] text-[#F3EDDF] shadow-[inset_0_0_0_1px_rgba(243,237,223,0.2)]'
          : brass
            ? 'border-[#B08D46]/60 bg-[#B08D46]/10 text-[#8A6B2F]'
            : 'border-border bg-secondary text-muted-foreground'
      }`}
    >
      {label}
    </span>
  )
}

/* Поле документа: подчёркнутая строка с прорастающей латунной чертой */
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

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </label>
  )
}

/* Кнопки */
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

function JournalToggle({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 h-11 px-5 font-display text-[11px] uppercase tracking-[0.2em] border transition-all duration-200 active:scale-[0.99] ${
        active
          ? 'bg-[#8C2F1B] border-[#6E2415] text-[#F3EDDF] shadow-[inset_0_0_0_1px_rgba(243,237,223,0.2)]'
          : 'bg-card border-[#B08D46]/60 text-foreground hover:border-[#8C2F1B] hover:text-[#8C2F1B]'
      }`}
    >
      {children}
    </button>
  )
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [importResults, setImportResults] = useState<{
    success: number
    errors: string[]
    credentials: Array<{ email: string; password: string; full_name: string }>
  } | null>(null)

  // поиск по реестру
  const [search, setSearch] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newFullName, setNewFullName] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('student')
  const [newStudentId, setNewStudentId] = useState('')
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [newShow, setNewShow] = useState(false)
    // правка записи
  // правка записи
  const [editing, setEditing] = useState<User | null>(null)
  const [editFullName, setEditFullName] = useState('')
  const [editStudentId, setEditStudentId] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editPassword, setEditPassword] = useState('')
  const [editShow, setEditShow] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()   // ← добавили
    if (user) setCurrentUserId(user.id)  
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, student_id, email, is_active')
      .order('created_at', { ascending: false })

    if (error) {
      setNotice({ type: 'err', text: 'Ошибка загрузки реестра: ' + error.message })
    } else {
      setUsers(profiles || [])
    }
    setLoading(false)
  }

  // живой фильтр: только ФИО и зачетка + сортировка по первой букве (А → Я)
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? users.filter((u) =>
          u.full_name?.toLowerCase().includes(q) ||
          u.student_id?.toLowerCase().includes(q)
        )
      : users
    return [...list].sort((a, b) =>
      (a.full_name ?? '').localeCompare(b.full_name ?? '', 'ru')
    )
  }, [users, search])

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()

    // клиентская валидация (серверная дублируется в actions.ts)
    const errors: Record<string, string> = {}
    if (newRole === 'student') {
      if (!newStudentId.trim()) {
        errors.studentId = 'Для студента обязателен номер зачетной книжки'
      } else if (!/^\d{6,10}$/.test(newStudentId.trim())) {
        errors.studentId = 'Только цифры, 6–10 знаков'
      }
    } else if (newStudentId.trim()) {
      errors.studentId = 'Зачетка указывается только студентам'
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setNotice({ type: 'err', text: 'Запись не внесена — исправьте отмеченные поля' })
      return
    }

    setSubmitting(true)
    setNotice(null)

    const result = await createUserManually({
      email: newEmail,
      password: newPassword,
      full_name: newFullName,
      role: newRole,
      student_id: newStudentId,
    })

    if (!result.success) {
      setNotice({ type: 'err', text: 'Ошибка внесения записи: ' + result.error })
    } else {
      setNotice({
        type: 'ok',
        text: `Запись внесена: ${newFullName} — ${ROLE_LABELS[newRole]}.\nПароль передайте пользователю лично, въ делахъ его не хранить.`,
      })
      setNewEmail('')
      setNewPassword('')
      setNewFullName('')
      setNewStudentId('')
      loadUsers()
      setFieldErrors({})
    }
    setSubmitting(false)
  }

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setNotice(null)
    setImporting(true)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const csvData = results.data as Array<{
          full_name: string
          email: string
          student_id: string
          password?: string
        }>

        const result = await importStudentsFromCsv(csvData)
        setImportResults(result)
        setNotice({
          type: result.errors.length > 0 ? 'err' : 'ok',
          text: `Импортъ оконченъ: внесено записей — ${result.success}${result.errors.length > 0 ? `, ошибокъ — ${result.errors.length}` : ''}.`,
        })
        loadUsers()
        setImporting(false)
      },
      error: (error) => {
        setNotice({ type: 'err', text: 'Ошибка чтения файла: ' + error.message })
        setImporting(false)
      },
    })
  }

  const toggleActive = async (u: User) => {
    setRowBusy(u.id)
    const next = !(u.is_active ?? true)
    const result = await setUserActive(u.id, next)
    setRowBusy(null)
    if (!result.success) {
      setNotice({ type: 'err', text: result.error || 'Ошибка' })
      return
    }
    loadUsers()
  }

  const openEdit = (u: User) => {
    setEditing(u)
    setEditFullName(u.full_name)
    setEditStudentId(u.student_id || '')
    setEditPassword('')
    setEditError(null)

    setNotice(null)
  }

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return

    // клиентская валидация зачетки — зеркально форме создания
    if (editing.role === 'student') {
      if (!editStudentId.trim()) {
        setEditError('Для студента обязателен номер зачетной книжки')
        return
      }
      if (!/^\d{6,10}$/.test(editStudentId.trim())) {
        setEditError('Номер зачетной книжки — только цифры (6–10 знаков)')
        return
      }
    }

        // длина нового пароля (если указан) — ловим на клиенте
    if (editPassword && editPassword.length > 0 && editPassword.length < 6) {
      setEditError('Новый пароль: минимум 6 знаков')
      return
    }

    setEditSaving(true)
    setEditError(null)
    const result = await updateProfile({
      userId: editing.id,
      full_name: editFullName,
      student_id: editStudentId,
      password: editPassword || undefined,
    })
    setEditSaving(false)

    if (!result.success) {
      setEditError(result.error || 'Ошибка правки')
      return
    }
    setEditing(null)
    loadUsers()
  }



  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 animate-fade-in"
        style={{ minHeight: 'calc(100vh - 6rem)' }}
      >
        <Loader2 className="w-6 h-6 animate-spin text-[#8C2F1B]" />
        <p className="font-quote italic text-muted-foreground">Канцелярия готовитъ реестръ...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Шапка раздела ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 animate-fade-up">
        <div className="pt-1">
          <p className="font-display text-[10px] tracking-[0.36em] text-muted-foreground">
            РАЗДЕЛЪ II · РЕЕСТРЪ ЗАПИСЕЙ
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
            Пользователи
          </h1>
          <p className="font-quote italic text-muted-foreground mt-2">
            записи вноситъ канцелярия — самостоятельной регистрации не установлено
          </p>
        </div>

        <div className="flex flex-col items-end gap-2.5">
          <JournalToggle
            active={showForm}
            onClick={() => { setShowForm(!showForm); setShowImport(false); setNotice(null) }}
          >
            <UserPlus className="w-4 h-4" />
            Вписать запись
          </JournalToggle>
          <JournalToggle
            active={showImport}
            onClick={() => {
              if (importing) return
              setShowImport(!showImport); setShowForm(false); setNotice(null); setImportResults(null)
            }}
          >
            <FileDown className="w-4 h-4" />
            Импортъ CSV
          </JournalToggle>
        </div>
      </div>

      {/* ── Уведомление-тост (общая компонента) ── */}
      <NoticeToast notice={notice} onClose={() => setNotice(null)} />

      {/* ── Ведомость № 2: вписание записи (плавная) ── */}
      <Collapse open={showForm}>
        <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.35)]">
          <Corners />
          <div className="border border-border px-7 py-6">
            <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Ведомость № 2
            </p>
            <h2 className="font-display text-xl font-bold tracking-tight text-center mt-1.5 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
              Вписание новой записи
            </h2>

            <form onSubmit={createUser} className="mt-7 grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-5">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="fio">Фамилия, имя, отчество</FieldLabel>
                                <JournalInput id="fio" placeholder="Ивановъ Иванъ Ивановичъ" value={newFullName} onChange={(e) => setNewFullName(e.target.value)} required disabled={submitting} />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="email">Электронная почта</FieldLabel>
                                <JournalInput id="email" type="email" placeholder="ivanov@university.ru" autoComplete="off" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required disabled={submitting} />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="password">Пароль (вузовский или новый, мин. 6)</FieldLabel>
                <div className="relative">
                  <JournalInput
                    id="password"
                    type={newShow ? 'text' : 'password'}
                    placeholder="••••••"
                    autoComplete="new-password"
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={submitting}
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setNewShow(!newShow)}
                    tabIndex={-1}
                    aria-label={newShow ? 'Скрыть пароль' : 'Показать пароль'}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {newShow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="role">Звание въ реестре</FieldLabel>
                <select
                  id="role"
                  value={newRole}
                  onChange={(e) => {
                    const role = e.target.value as UserRole
                    setNewRole(role)
                    // зачетка имеет смысл только у студентов: при смене звания сбрасываем
                    if (role !== 'student') {
                      setNewStudentId('')
                      setFieldErrors((prev) => {
                        if (!prev.studentId) return prev
                        const { studentId: _dropped, ...rest } = prev
                        return rest
                      })
                    }
                  }}
                  disabled={submitting}
                                    className="w-full h-11 bg-[#FAF5E8] border border-input px-3 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                                                <FieldLabel htmlFor="studentId">
                  {newRole === 'student'
                    ? 'Номеръ зачетной книжки (обязателенъ, 6–10 цифръ)'
                    : 'Номеръ зачетной книжки — не применимо'}
                </FieldLabel>
                <JournalInput
                  id="studentId"
                  placeholder={newRole === 'student' ? '2024001' : '— зачетка только у студентовъ —'}
                  inputMode={newRole === 'student' ? 'numeric' : undefined}
                  value={newStudentId}
                  disabled={newRole !== 'student' || submitting}
                  onChange={(e) => {
                    // для студентов пускаем только цифры
                    setNewStudentId(newRole === 'student' ? e.target.value.replace(/\D/g, '') : e.target.value)
                  }}
                  className={newRole !== 'student' ? 'opacity-50 cursor-not-allowed' : ''}
                />
                {fieldErrors.studentId && (
                  <p className="text-xs text-[#8C2F1B] font-quote italic">{fieldErrors.studentId}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <button type="submit" disabled={submitting} className="w-full disabled:opacity-60">
                  <WaxButton className="h-12 w-full">
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Вносится...
                      </>
                    ) : (
                      'Внести запись въ реестръ'
                    )}
                  </WaxButton>
                </button>
              </div>
            </form>
          </div>
        </div>
      </Collapse>

      {/* ── Импорт из ведомости CSV (плавный) ── */}
      <Collapse open={showImport}>
        <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.35)]">
          <Corners />
          <div className="border border-border px-7 py-6">
            <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Приложение · Импортъ студентовъ
            </p>
            <h2 className="font-display text-xl font-bold tracking-tight text-center mt-1.5 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
              Перепись изъ ведомости CSV
            </h2>

            <div className="mt-6 grid md:grid-cols-2 gap-5 items-start">
              {/* формат */}
              <div className="bg-[#FAF5E8] border border-border p-4">
                <p className="font-display text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                  Форматъ ведомости
                </p>
                <code className="block font-mono text-xs text-foreground/80 leading-relaxed">
                  full_name,email,student_id,password<br />
                  Ивановъ Иванъ Ивановичъ,ivanov@university.ru,2024001,Qwerty123!<br />
                  Петровъ Петръ Петровичъ,petrov@university.ru,2024002,Qwerty456!
                </code>
                <p className="font-quote italic text-xs text-muted-foreground mt-3">
                  Колонка password обязательна — вузовский пароль студента.
                  Строки без пароля не принимаются: такую запись зам. заведующий
                  вноситъ вручную.
                </p>
              </div>

              {/* выбор файла / индикатор импорта */}
              {importing ? (
                <div className="border border-[#B08D46]/40 bg-secondary/40 px-4 py-6 text-center">
                  <Loader2 className="w-5 h-5 mx-auto animate-spin text-[#8C2F1B] mb-2" />
                  <p className="font-display text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    Канцелярия вноситъ записи...
                  </p>
                  <p className="font-quote italic text-xs text-muted-foreground mt-1">
                    для большихъ ведомостей это занимает до минуты
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
                  Внесено въ реестръ: {importResults.success}
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

      {/* ── Реестр записей ── */}
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
            {/* строка реестра: поиск + счетчик */}
            <div className="flex flex-wrap items-center gap-4 pb-3 border-b border-border mb-2">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Реестръ записей
              </p>

              {/* поиск */}
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Поискъ: ФИО или номеръ зачетки..."
                  className="peer w-full h-9 bg-[#FAF5E8] border border-input pl-9 pr-3 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 placeholder:text-muted-foreground/50"
                />
                <span
                  className="absolute bottom-0 left-0 h-[2px] w-full origin-left scale-x-0 bg-gradient-to-r from-[#C9A45C] to-[#8A6B2F] transition-transform duration-500 ease-out peer-focus:scale-x-100"
                  aria-hidden
                />
              </div>

              <p className="font-display text-[10px] uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap">
                {search.trim()
                  ? `найдено ${filteredUsers.length} изъ ${users.length}`
                  : `всего ${users.length}`}
              </p>
            </div>

              <div className="overflow-x-auto lg:overflow-visible">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-[#B08D46]/40">
                    <th className="text-left p-3 font-display text-[10px] uppercase tracking-[0.24em] text-muted-foreground font-normal">
                      Фамилия, имя, отчество
                    </th>
                    <th className="text-left p-3 font-display text-[10px] uppercase tracking-[0.24em] text-muted-foreground font-normal">
                      Почта
                    </th>
                    <th className="text-left p-3 font-display text-[10px] uppercase tracking-[0.24em] text-muted-foreground font-normal">
                      Звание
                    </th>
                    <th className="text-left p-3 font-display text-[10px] uppercase tracking-[0.24em] text-muted-foreground font-normal">
                      Зачетка
                    </th>
                    <th className="text-right p-3 font-display text-[10px] uppercase tracking-[0.24em] text-muted-foreground font-normal">
                      Правка
                    </th>
                      <th className="text-right p-3 font-display text-[10px] uppercase tracking-[0.24em] text-muted-foreground font-normal">
                      Отключение
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user, i) => (
                    <tr
                      key={user.id}
                      className="border-b border-border/60 last:border-0 hover:bg-secondary/50 transition-colors animate-fade-up"
                      style={{ animationDelay: `${Math.min(i, 20) * 40}ms` }}
                    >
                      <td className="p-3 font-medium">
                        {user.full_name}
                        {user.is_active === false && (
                          <span className="ml-2 font-display text-[9px] uppercase tracking-[0.18em] px-2 py-0.5 border border-[#8C2F1B]/60 text-[#8C2F1B] bg-[#8C2F1B]/5 align-middle">
                            отключенъ
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground font-quote">{user.email}</td>
                      <td className="p-3">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="p-3 text-muted-foreground font-display">{user.student_id || '—'}</td>
                                            <td className="p-3">
                        <div className="flex justify-end">
                          <button
                            onClick={() => openEdit(user)}
                            title="Править запись"
                            className="p-2 border border-[#B08D46]/50 text-muted-foreground hover:text-[#8C2F1B] hover:border-[#8C2F1B] transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end">
                          {user.id === currentUserId ? (
                            <span className="text-xs text-muted-foreground/60 font-quote italic pr-2">
                              это вы
                            </span>
                          ) : (
                            <button
                              onClick={() => toggleActive(user)}
                              disabled={rowBusy === user.id}
                              title={user.is_active === false ? 'Включить запись' : 'Отключить запись'}
                              className={`p-2 border transition-colors disabled:opacity-50 ${
                                user.is_active === false
                                  ? 'border-[#8C2F1B]/60 text-[#8C2F1B] bg-[#8C2F1B]/5 hover:bg-[#8C2F1B] hover:text-[#F3EDDF] hover:border-[#6E2415]'
                                  : 'border-[#B08D46]/50 text-muted-foreground hover:text-[#8C2F1B] hover:border-[#8C2F1B]'
                              }`}
                            >
                              {rowBusy === user.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : user.is_active === false ? (
                                <RotateCcw className="w-3.5 h-3.5" />
                              ) : (
                                <Ban className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                       <td colSpan={6} className="p-8 text-center font-quote italic text-muted-foreground">
                        {search.trim()
                          ? 'по запросу ничего не найдено'
                          : 'Реестръ пустъ — записей не значится'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

            {/* ── Правка записи (модаль) ── */}
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
                Правка записи
              </p>
              <h2 className="font-display text-xl font-bold tracking-tight text-center mt-1.5 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
                {editing.full_name}
              </h2>
              <p className="text-center text-xs text-muted-foreground mt-1">
                звание: {ROLE_LABELS[editing.role as UserRole] ?? editing.role}
              </p>
              {editError && (
                <div className="mt-4 flex items-start gap-2.5 border-l-2 border-[#8C2F1B] bg-red-50 px-4 py-3 animate-fade-up">
                  <AlertCircle className="w-4 h-4 text-[#8C2F1B] mt-0.5 shrink-0" />
                  <p className="text-sm text-red-800">{editError}</p>
                </div>
              )}

              <form onSubmit={saveEdit} className="mt-6 space-y-5">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="edit-fio">Фамилия, имя, отчество</FieldLabel>
                  <JournalInput
                    id="edit-fio"
                    placeholder="Ивановъ Иванъ Ивановичъ"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    required
                    disabled={editSaving}
                  />
                </div>

                {editing.role === 'student' && (
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="edit-sid">Номеръ зачетной книжки (6–10 цифръ)</FieldLabel>
                    <JournalInput
                      id="edit-sid"
                      placeholder="2024001"
                      inputMode="numeric"
                      value={editStudentId}
                      onChange={(e) => setEditStudentId(e.target.value.replace(/\D/g, ''))}
                      disabled={editSaving}
                    />
                  </div>
                )}

                                <div className="pt-5 border-t border-border">
                  <p className="font-display text-[10px] uppercase tracking-[0.24em] text-muted-foreground mb-4">
                    Смена пароля — опционально
                  </p>
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="edit-pass">Новый пароль (мин. 6, пусто — не менять)</FieldLabel>
                    <div className="relative">
                      <JournalInput
                        id="edit-pass"
                        type={editShow ? 'text' : 'password'}
                        placeholder="••••••"
                        autoComplete="new-password"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        disabled={editSaving}
                        className="pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setEditShow(!editShow)}
                        tabIndex={-1}
                        aria-label={editShow ? 'Скрыть пароль' : 'Показать пароль'}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {editShow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
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

      {/* ── Подпись ── */}
      <p className="text-right font-quote italic text-xs text-muted-foreground/80 animate-fade-in [animation-delay:600ms]">
        Сведения верны — канцелярия кафедры
      </p>
    </div>
  )
}