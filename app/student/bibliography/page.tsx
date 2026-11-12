'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useMemo, useRef } from 'react'
import Papa from 'papaparse'
import { Loader2, CheckCircle2, AlertCircle, BookMarked, FileDown, Pencil, Trash2, X, Search, ChevronDown, Copy, Check, Quote, Square, CheckSquare } from 'lucide-react'
import { addBibItem, updateBibItem, deleteBibItem, importBibItems, toggleBibCited, setAllBibCited, deleteAllBibItems } from './actions'
import { resolveSourceRef } from './resolve'
import NoticeToast from '@/components/notice-toast'
import { buildGostLine } from '@/lib/gost'
import { computeCompliance, REQUIRED_ORIGINS, ORIGIN_LABELS } from '@/lib/bib-compliance'

type BibItem = {
  id: string
  position: number
  kind: string
  authors: string
  title: string
  source: string | null
  year: number | null
  url: string | null
  origin: string | null
  cited: boolean
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

const EMPTY_FORM = { kind: 'book', authors: '', title: '', source: '', year: '', url: '', origin: '' }

type BibForm = typeof EMPTY_FORM

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

/* ── Плавный аккордеон (как на страницѣ тем) ── */
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

export default function StudentBibliographyPage() {
  const [loading, setLoading] = useState(true)
  const [cycle, setCycle] = useState<{ id: string; name: string } | null>(null)
  const [windowInfo, setWindowInfo] = useState<{ starts_on: string; ends_on: string } | null>(null)
  const [windowOpen, setWindowOpen] = useState(false)
  const [myApp, setMyApp] = useState<MyApp | null>(null)
  const [items, setItems] = useState<BibItem[]>([])

  const [form, setForm] = useState<BibForm>({ ...EMPTY_FORM })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // импорт ведомости CSV
  const [showImport, setShowImport] = useState(false)
  const importRef = useRef<HTMLDivElement>(null)
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<{ success: number; errors: string[] } | null>(null)

  // 3д+: массовая отметка «в текстѣ»
  const [busyCitedAll, setBusyCitedAll] = useState(false)

  // 3д+: массовое удаление непринятых (подтверждение — въ модальномъ окнѣ)
  const [busyDeleteAll, setBusyDeleteAll] = useState(false)
  const [showDeleteAll, setShowDeleteAll] = useState(false)

  // рефчекер: автозаполнение по DOI / ISBN / ссылке
  const [refQuery, setRefQuery] = useState('')
  const [refBusy, setRefBusy] = useState(false)
  const [refGost, setRefGost] = useState<string | null>(null)

  // копирование ГОСТ-строки источника въ буферъ
  const [copiedId, setCopiedId] = useState<string | null>(null)
  function copyGost(e: React.MouseEvent, id: string, line: string) {
    e.stopPropagation()
    navigator.clipboard
      ?.writeText(line)
      .then(() => {
        setCopiedId(id)
        setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000)
      })
      .catch(() => setNotice({ type: 'err', text: 'Не удалось скопировать — выделите строку вручную' }))
  }

  useEffect(() => {
    loadAll()
  }, [])

  /* Esc закрывает окно правки */
  useEffect(() => {
    if (!editingId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resetForm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingId])

  /* Esc закрывает подтверждение удаления */
  useEffect(() => {
    if (!showDeleteAll) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDeleteAll(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showDeleteAll])

  /* Тост теперь внутри NoticeToast — таймер там же */

  /* ── Импорт ведомости CSV: разбор на клиенте, валидация на сервере ── */
  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // позволяет выбрать тот же файл повторно
    if (!windowOpen) {
      setNotice({ type: 'err', text: 'Окно «Литература» закрыто — ведение списка недоступно' })
      return
    }

    setNotice(null)
    setImporting(true)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: async (results) => {
        const rows = results.data as Array<Record<string, string>>
        const result = await importBibItems(rows)
        setImportResults(result)
        setNotice({
          type: result.errors.length > 0 ? 'err' : 'ok',
          text: `Импортъ оконченъ: внесено источниковъ — ${result.success}${result.errors.length > 0 ? `, не принято — ${result.errors.length}` : ''}.`,
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

    /* ── Рефчекер: тянем метаданные по DOI / ISBN / ссылке ── */
  const handleResolve = async () => {
    if (!refQuery.trim() || refBusy) return
    if (!windowOpen) {
      setNotice({ type: 'err', text: 'Окно «Литература» закрыто — ведение списка недоступно' })
      return
    }
    setRefBusy(true)
    setNotice(null)
    setRefGost(null)
    const result = await resolveSourceRef(refQuery)
    setRefBusy(false)
    if (!result.success) {
      /* неудачный поиск не оставляет в полях данные прошлой находки */
      setForm({ ...EMPTY_FORM })
      setFormErrors({})
      setNotice({ type: 'err', text: result.error || 'Не удалось распознать источник' })
      return
    }
    setForm({
      kind: result.kind,
      authors: result.authors,
      title: result.title,
      source: result.source,
      year: result.year,
      url: result.url,
      origin: '',
    })
    setFormErrors({})
    setRefGost(result.gost)
    setNotice({ type: 'ok', text: `Найдено (${result.provider}) — поля заполнены, проверьте и сохраняйте` })
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
          .select('id, position, kind, authors, title, source, year, url, origin, cited, status, comment')
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
    setFormErrors({})
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
      origin: it.origin || '',
    })
    setFormErrors({})
  }

  const setField = (k: keyof BibForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    setFormErrors((p) => {
      if (!p[k]) return p
      const q = { ...p }
      delete q[k]
      return q
    })
  }

  /* ── Клиентская валидация (зеркалит серверную) ── */
  const normTitle = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

  /* проверка одного поля — вызывается на onBlur, без нажатия кнопки */
  const validateOne = (k: keyof BibForm, data: BibForm): string | undefined => {
    switch (k) {
      case 'title': {
        if (data.title.trim().length < 2) return 'Укажите название источника'
        const t = normTitle(data.title)
        if (t && items.some((i) => i.id !== editingId && normTitle(i.title) === t)) {
          return 'Источникъ с такимъ названіемъ уже есть въ спискѣ'
        }
        return undefined
      }
      case 'year': {
        if (data.year.trim()) {
          const y = Number(data.year.trim())
          if (!Number.isInteger(y) || y < 1900 || y > 2100) {
            return 'Годъ — цѣлое число отъ 1900 до 2100'
          }
        }
        return undefined
      }
      case 'url': {
        if (data.kind === 'url' && !data.url.trim()) {
          return 'Для интернетъ-ресурса ссылка обязательна'
        }
        if (data.url.trim() && !/^https?:\/\/\S+$/i.test(data.url.trim())) {
          return 'Ссылка должна начинаться съ http:// или https://'
        }
        return undefined
      }
      case 'source': {
        if (data.kind === 'article' && !data.source.trim()) {
          return 'Для статьи укажите журналъ / изданіе'
        }
        return undefined
      }
      default:
        return undefined
    }
  }

  /* полная проверка перед сохранением */
  const clientValidate = (data: BibForm): Record<string, string> => {
    const errors: Record<string, string> = {}
    for (const k of ['title', 'year', 'source', 'url'] as const) {
      const e = validateOne(k, data)
      if (e) errors[k] = e
    }
    return errors
  }

  /* проверка поля при выходе изъ него */
  const blurValidate = (k: keyof BibForm) => {
    const e = validateOne(k, form)
    setFormErrors((p) => {
      const q = { ...p }
      if (e) q[k] = e
      else delete q[k]
      return q
    })
  }

  const saveItem = async () => {
    const errors = clientValidate(form)
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      setNotice({ type: 'err', text: 'Проверьте поля — есть ошибки въ заполненіи' })
      return
    }
    setFormErrors({})
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
        ? { type: 'ok', text: 'Источникъ обновлёнъ — снова на проверкѣ у наставника' }
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

  /* Шаг 3д: шлюз «Списокъ соответствуетъ требованиямъ?» */
  const compliance = useMemo(
    () =>
      computeCompliance(items.map((i) => ({ origin: i.origin, cited: i.cited, title: i.title, authors: i.authors }))),
    [items]
  )

  /* отметка «есть ссылка въ дипломѣ» — оптимистично, откат при ошибке */
  const toggleCited = async (it: BibItem) => {
    const next = !it.cited
    setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, cited: next } : p)))
    const res = await toggleBibCited(it.id, next)
    if (!res.success) {
      setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, cited: it.cited } : p)))
      setNotice({ type: 'err', text: res.error || 'Не удалось сохранить отметку' })
    }
  }

  /* 3д+: отметить/снять «есть ссылка въ дипломѣ» у всѣх разом — оптимистично, откат при ошибке */
  const setAllCited = async (next: boolean) => {
    if (busyCitedAll || items.length === 0) return
    const before = items
    setBusyCitedAll(true)
    setItems((prev) => prev.map((p) => ({ ...p, cited: next })))
    const res = await setAllBibCited(next)
    if (!res.success) {
      setItems(before)
      setNotice({ type: 'err', text: res.error || 'Не удалось сохранить отметки' })
    } else {
      setNotice({
        type: 'ok',
        text: next
          ? `Отмечено «есть ссылка въ дипломѣ»: ${res.count} изъ ${items.length}`
          : `Отметки «есть ссылка въ дипломѣ» сняты: ${res.count}`,
      })
    }
    setBusyCitedAll(false)
  }

  /* 3д+: удалить всѣ непринятые источники — подтверждение въ модальномъ окнѣ;
     принятые наставникомъ (approved) не трогаются вовсе */
  const deletableCount = items.filter((i) => i.status !== 'approved').length
  const approvedCount = items.length - deletableCount

  const openDeleteAll = () => {
    if (busyDeleteAll || items.length === 0 || items.every((i) => i.status === 'approved')) return
    setShowDeleteAll(true)
  }

  const confirmDeleteAll = async () => {
    if (busyDeleteAll) return
    setBusyDeleteAll(true)
    setNotice(null)
    const res = await deleteAllBibItems()
    setBusyDeleteAll(false)
    setShowDeleteAll(false)
    if (!res.success) {
      setNotice({ type: 'err', text: res.error || 'Ошибка удаления' })
      return
    }
    setNotice({
      type: 'ok',
      text: `Удалено источниковъ: ${res.count}${res.skipped ? ` · принятые наставникомъ не тронуты: ${res.skipped}` : ''}`,
    })
    if (editingId) resetForm()
    loadAll()
  }

  const listAllowed = myApp && myApp.status !== 'submitted' && myApp.status !== 'in_order'

  const inputCls = (field: keyof BibForm) =>
    `w-full h-9 bg-[#FAF5E8] border ${
      formErrors[field] ? 'border-[#8C2F1B]' : 'border-input'
    } px-3 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 placeholder:text-muted-foreground/50`

  const errText = (field: keyof BibForm) =>
    formErrors[field] ? (
      <p className="text-xs text-red-700 mt-1 font-quote italic">{formErrors[field]}</p>
    ) : null

  /* ── Поля формы (общие для «нового» и для окна правки) ── */
  const renderFields = () => (
    <>
      <div>
        <label className="block text-xs font-quote italic text-muted-foreground mb-1.5">
          Вид источника
        </label>
        <select
          value={form.kind}
          onChange={(e) => setField('kind', e.target.value)}
          disabled={busy}
          className={inputCls('kind')}
        >
          {Object.entries(KIND_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-quote italic text-muted-foreground mb-1.5">
          База (обязательна для шлюза регламента)
        </label>
        <select
          value={form.origin}
          onChange={(e) => setField('origin', e.target.value)}
          disabled={busy}
          className={inputCls('origin')}
        >
          <option value="">— не указана —</option>
          <option value="vstu">Б-ка ВолгГТУ</option>
          <option value="elibrary">eLIBRARY.RU</option>
          <option value="scopus">Scopus</option>
          <option value="web">Интернетъ-источникъ</option>
          <option value="other">Прочее</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-quote italic text-muted-foreground mb-1.5">
          Годъ изданія (не обязательно)
        </label>
        <input
          type="text"
          value={form.year}
          onChange={(e) => setField('year', e.target.value)}
          onBlur={() => blurValidate('year')}
          maxLength={4}
          placeholder="2025"
          disabled={busy}
          className={inputCls('year')}
        />
        {errText('year')}
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-quote italic text-muted-foreground mb-1.5">
          Авторы (не обязательно)
        </label>
        <input
          type="text"
          value={form.authors}
          onChange={(e) => setField('authors', e.target.value)}
          maxLength={300}
          placeholder="Ивановъ И. И., Петровъ П. П."
          disabled={busy}
          className={inputCls('authors')}
        />
        {errText('authors')}
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-quote italic text-muted-foreground mb-1.5">
          Названіе <span className="text-[#8C2F1B]">*</span>
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setField('title', e.target.value)}
          onBlur={() => blurValidate('title')}
          maxLength={300}
          placeholder="Основы проектированія информационныхъ системъ"
          disabled={busy}
          className={inputCls('title')}
        />
        {errText('title')}
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-quote italic text-muted-foreground mb-1.5">
          Изданіе / журналъ / сайтъ{' '}
          {form.kind === 'article' ? (
            <span className="text-[#8C2F1B]">*</span>
          ) : (
            <span>(не обязательно)</span>
          )}
        </label>
        <input
          type="text"
          value={form.source}
          onChange={(e) => setField('source', e.target.value)}
          onBlur={() => blurValidate('source')}
          maxLength={300}
          placeholder={
            form.kind === 'article'
              ? 'Известия ВолгГТУ'
              : 'Издательство МГТУ, г. Москва'
          }
          disabled={busy}
          className={inputCls('source')}
        />
        {errText('source')}
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-quote italic text-muted-foreground mb-1.5">
          Ссылка{' '}
          {form.kind === 'url' ? (
            <span className="text-[#8C2F1B]">*</span>
          ) : (
            <span>(для интернетъ-ресурсовъ)</span>
          )}
        </label>
        <input
          type="text"
          value={form.url}
          onChange={(e) => setField('url', e.target.value)}
          onBlur={() => blurValidate('url')}
          maxLength={500}
          placeholder="https://example.com/article"
          disabled={busy}
          className={inputCls('url')}
        />
        {errText('url')}
      </div>
    </>
  )

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

      {/* ── Уведомление-тост (общая компонента) ── */}
      <NoticeToast notice={notice} onClose={() => setNotice(null)} />

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

          {/* ── Форма нового источника (правка — въ модальномъ окнѣ) ──
              карточка всегда въ потоке: если её прятать при открытой модалкѣ,
              при закрытии страница меняетъ высоту и прокрутку «ведётъ» вверхъ */}
            <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up [animation-delay:100ms]">
              <Corners />
              <div className="border border-border px-6 py-5">
                <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                    Новый источникъ
                  </p>
                  <button
                                        onClick={() => {
                      const opening = !showImport
                      setShowImport(opening)
                      setImportResults(null)
                      if (opening) {
                        // «Приложеніе» разворачивается — прокрутка сама подводитъ къ нему
                        setTimeout(() => importRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 h-8 px-3 font-display text-[10px] uppercase tracking-[0.18em] border transition-all duration-200 active:scale-[0.99] ${
                      showImport
                        ? 'bg-[#8C2F1B] border-[#6E2415] text-[#F3EDDF]'
                        : 'bg-card border-[#B08D46]/60 text-foreground hover:border-[#8C2F1B] hover:text-[#8C2F1B]'
                    } ${!windowOpen ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={!windowOpen ? 'Окно «Литература» закрыто' : 'Импорт списка из файла CSV'}
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    Импортъ CSV
                  </button>
                </div>

                                {/* ── Рефчекер: автозаполнение по DOI / ISBN / ссылке ── */}
                <div className="mb-4 bg-[#FAF5E8] border border-border p-4">
                  <p className="text-xs font-quote italic text-muted-foreground mb-2">
                    Рефчекеръ: вставьте DOI, ISBN или ссылку — поля заполнятся сами
                  </p>
                  <details className="mb-3 group/hint">
                    <summary className="inline-flex items-center gap-1.5 text-xs font-quote italic text-[#8A6B2F] cursor-pointer select-none hover:text-[#8C2F1B] transition-colors list-none [&::-webkit-details-marker]:hidden">
                      Что такое DOI, ISBN и ссылка?
                      <ChevronDown className="w-3 h-3 shrink-0 transition-transform duration-300 group-open/hint:rotate-180" />
                    </summary>
                    <div className="mt-2 border border-border/70 bg-card px-3 py-2.5 space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                      <p>
                        <b className="text-foreground">DOI</b> — цифровой идентификатор научной статьи, видъ: 10.1038/nature14539.
                        Есть у большинства статей изъ eLIBRARY, КиберЛенинки и зарубежныхъ журналовъ — ищите на страницѣ статьи.
                      </p>
                      <p>
                        <b className="text-foreground">ISBN</b> — номер книги, 10 или 13 цифръ, видъ: 978-5-…. Стоитъ на обороте
                        титульного листа и на задней обложке.
                      </p>
                      <p>
                        <b className="text-foreground">Ссылка</b> — адресъ страницы в интернете (https://…): сайты, официальные
                        документы и статьи безъ DOI.
                      </p>
                    </div>
                  </details>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={refQuery}
                      onChange={(e) => setRefQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleResolve()
                        }
                      }}
                      maxLength={500}
                      placeholder="10.1234/xyz · 978-5-… · https://…"
                      disabled={refBusy || busy || !windowOpen}
                      className="flex-1 h-9 bg-card border border-input px-3 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 placeholder:text-muted-foreground/50 disabled:opacity-50"
                    />
                    <button
                      onClick={handleResolve}
                      disabled={refBusy || busy || !windowOpen || !refQuery.trim()}
                      title={!windowOpen ? 'Окно закрыто' : 'Найти метаданные и заполнить поля'}
                      className="inline-flex items-center justify-center gap-1.5 h-9 px-4 font-display text-[10px] uppercase tracking-[0.18em] border border-[#B08D46]/60 bg-card text-foreground transition-all duration-200 hover:border-[#8C2F1B] hover:text-[#8C2F1B] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    >
                      {refBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Search className="w-3.5 h-3.5" />
                      )}
                      {refBusy ? 'Ищется...' : 'Найти'}
                    </button>
                  </div>
                  {refBusy && (
                    <p className="mt-2 flex items-center gap-2 text-xs font-quote italic text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8C2F1B]" />
                      Тянемъ метаданные: DOI → Crossref, ISBN → книжные каталоги, ссылка → страница...
                    </p>
                  )}
                  {refGost && (
                    <p className="mt-3 text-sm font-quote italic text-[#6E5A2A] border-l-2 border-[#B08D46] pl-3 break-words">
                      По ГОСТ Р 7.0.5-2008: {refGost}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{renderFields()}</div>

                <div className="flex justify-end mt-5">
                  <button
                    onClick={saveItem}
                    disabled={busy || refBusy || !windowOpen}
                    title={!windowOpen ? 'Окно закрыто' : refBusy ? 'Идёт поиск — подождите' : undefined}
                    className="border border-[#6E2415] bg-[#8C2F1B] text-[#F3EDDF] font-display text-[10px] uppercase tracking-[0.18em] px-5 py-2.5 transition-all duration-200 hover:bg-[#7A2715] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#8C2F1B]"
                  >
                    {busy ? 'Записывается...' : 'Добавить въ списокъ'}
                  </button>
                </div>
              </div>
            </div>

          {/* ── Импорт ведомости CSV ── */}
          <div ref={importRef} className="scroll-mt-6">
           <Collapse open={showImport}>
            <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.35)]">
              <Corners />
              <div className="border border-border px-6 py-5">
                <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  Приложение · Импортъ источниковъ
                </p>
                <h2 className="font-display text-lg font-bold tracking-tight text-center mt-1.5">
                  Перепись изъ ведомости CSV
                </h2>

                <div className="mt-5 grid md:grid-cols-2 gap-5 items-start">
                  <div className="bg-[#FAF5E8] border border-border p-4">
                    <p className="font-display text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                      Форматъ ведомости
                    </p>
                    <code className="block font-mono text-xs text-foreground/80 leading-relaxed">
                      kind,authors,title,source,year,url,origin<br />
                      book,Ивановъ И. И.,Базы данныхъ,Лань,2022,,vstu<br />
                      article,Петровъ П. П.,Обзоръ подходовъ,Вестникъ ИТъ,2023,,elibrary<br />
                      article,Smith J.,Deep learning survey,Nature,2024,,scopus
                    </code>
                    <p className="font-quote italic text-xs text-muted-foreground mt-3">
                      Первая строка — заголовокъ. Обязательна только колонка title.
                      kind: book / article / url / standard / other (пусто — книга).
                      origin (не обязательна): vstu / elibrary / scopus / web / other —
                      если пусто, база определяется по ссылке (для статьи нужен журналъ).
                      Годъ 1900–2100; ссылка начинается съ http:// или https://.
                      Дубли названий не принимаются.
                    </p>
                  </div>

                  {importing ? (
                    <div className="border border-[#B08D46]/40 bg-secondary/40 px-4 py-6 text-center">
                      <Loader2 className="w-5 h-5 mx-auto animate-spin text-[#8C2F1B] mb-2" />
                      <p className="font-display text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                        Канцелярія вноситъ источники...
                      </p>
                    </div>
                  ) : (
                    <label className={`block cursor-pointer border border-dashed border-[#B08D46]/60 bg-secondary/40 px-4 py-6 text-center transition-colors hover:bg-secondary hover:border-[#8C2F1B]/60 ${!windowOpen ? 'pointer-events-none opacity-50' : ''}`}>
                      <input type="file" accept=".csv" onChange={handleCsvImport} className="hidden" disabled={!windowOpen} />
                      <FileDown className="w-5 h-5 mx-auto text-[#8C2F1B] mb-2" />
                      <span className="font-display text-[11px] uppercase tracking-[0.22em]">
                        Выбрать файлъ ведомости
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">
                        файлы формата .csv — годится выгрузка изъ Excel
                      </p>
                    </label>
                  )}
                </div>

                {importResults && (
                  <div className="mt-5 border border-border bg-[#FAF5E8] px-4 py-3 animate-fade-up">
                    <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[#8A6B2F]">
                      Внесено въ списокъ: {importResults.success}
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
                <div className="flex items-center justify-between gap-4 pb-3 border-b border-border mb-2">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                    Вашъ списокъ литературы
                  </p>
                  <button
                    onClick={openDeleteAll}
                    disabled={busyDeleteAll || items.length === 0 || items.every((i) => i.status === 'approved')}
                    title={
                      items.length === 0
                        ? 'Списокъ пустъ'
                        : items.every((i) => i.status === 'approved')
                          ? 'Всѣ источники приняты наставникомъ — удаление закрыто'
                          : 'Удалить всѣ непринятые источники'
                    }
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 font-display text-[10px] uppercase tracking-[0.18em] border bg-card border-border text-muted-foreground hover:border-[#8C2F1B] hover:text-[#8C2F1B] transition-all duration-200 active:scale-[0.98] shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {busyDeleteAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    удалить всѣ
                  </button>
                </div>

                {/* ── Шаг 3д: шлюз «Списокъ соответствуетъ требованиямъ?» ── */}
                <div className="my-3 border border-border bg-[#FAF5E8]/60 px-4 py-3.5">
                  <div className="flex items-start justify-between gap-x-6 gap-y-2 flex-wrap">
                    <div>
                      <p className="font-display text-[10px] uppercase tracking-[0.25em] text-[#8A6B2F]">
                        Шлюзъ регламента: составъ списка
                      </p>
                      {compliance.ok ? (
                        <p className="font-quote text-sm text-[#8A6B2F] mt-1 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          Списокъ соответствуетъ требованиямъ — шлюзъ открытъ
                        </p>
                      ) : (
                        <p className="font-quote text-sm text-[#8C2F1B] mt-1 flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4" />
                          {compliance.total === 0 ? 'Списокъ не начатъ — нужны источники' : 'Нужны ещё источники — шлюзъ закрытъ'}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 font-quote text-xs text-muted-foreground">
                      <span>
                        всего:{' '}
                        <b className={compliance.total >= 30 ? 'text-[#8A6B2F]' : 'text-[#8C2F1B]'}>{compliance.total}/30</b>
                      </span>
                      <span>
                        зарубежные:{' '}
                        <b className={compliance.total > 0 && compliance.foreignShare >= 0.2 ? 'text-[#8A6B2F]' : 'text-[#8C2F1B]'}>
                          {Math.round(compliance.foreignShare * 100)}% ({compliance.foreign})
                        </b>
                      </span>
                      <span>
                        есть ссылка въ дипломѣ: <b className={compliance.total > 0 && compliance.cited === compliance.total ? 'text-[#8A6B2F]' : 'text-[#8C2F1B]'}>{compliance.cited}/{compliance.total}</b>
                      </span>
                      <button
                        onClick={() => setAllCited(true)}
                        disabled={busyCitedAll || items.length === 0 || compliance.cited === compliance.total}
                        className="inline-flex items-center gap-1 border border-[#B08D46]/60 bg-[#B08D46]/10 text-[#8A6B2F] px-2 py-0.5 hover:bg-[#B08D46]/20 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                        title="Отметить «есть ссылка въ дипломѣ» у всѣх источников сразу"
                      >
                        {busyCitedAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckSquare className="w-3 h-3" />}
                        всѣ съ ссылкой
                      </button>
                      <button
                        onClick={() => setAllCited(false)}
                        disabled={busyCitedAll || items.length === 0 || compliance.cited === 0}
                        className="inline-flex items-center gap-1 border border-border text-muted-foreground px-2 py-0.5 hover:text-[#8A6B2F] hover:border-[#B08D46]/60 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                        title="Снять отметки «есть ссылка въ дипломѣ» со всѣх источников"
                      >
                        <Square className="w-3 h-3" />
                        снять всѣ
                      </button>
                    </div>
                  </div>
                  {compliance.missing.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {compliance.missing.map((m) => (
                        <p key={m} className="font-quote italic text-xs text-[#8C2F1B]/90 flex gap-1.5">
                          <span className="shrink-0 text-[#8C2F1B]/60">—</span>
                          <span>{m}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {REQUIRED_ORIGINS.map((r) => {
                      const has = compliance.byOrigin[r.key] > 0
                      return (
                        <span
                          key={r.key}
                          title={
                            has
                              ? `${r.label}: источниковъ — ${compliance.byOrigin[r.key]}`
                              : `Нетъ источниковъ изъ «${r.label}» — ${r.hint}`
                          }
                          className={`inline-flex items-center gap-1 text-xs border px-2 py-0.5 font-quote ${
                            has
                              ? 'border-[#B08D46]/60 bg-[#B08D46]/10 text-[#8A6B2F]'
                              : 'border-border text-muted-foreground/70'
                          }`}
                        >
                          {has ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                          {r.label}
                          {has && ` · ${compliance.byOrigin[r.key]}`}
                        </span>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-0">
                  {items.map((it, i) => {
                    const st = ITEM_STATUS[it.status] ?? { label: it.status, tone: 'wait' as const }
                    const gost = buildGostLine({ kind: it.kind, authors: it.authors, title: it.title, source: it.source, year: it.year, url: it.url })
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
                          <p className="font-quote text-[15px] leading-snug">{gost}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                            <span className="text-xs text-muted-foreground font-quote italic">
                              {KIND_LABELS[it.kind] ?? it.kind}
                            </span>
                            {it.origin && (
                              <span className="text-xs font-quote text-[#8A6B2F]/80 border-b border-dotted border-[#B08D46]/40">
                                {ORIGIN_LABELS[it.origin] ?? it.origin}
                              </span>
                            )}
                            <button
                              onClick={() => toggleCited(it)}
                              title="Отметь, когда добавишь ссылку [N] на источникъ въ текстъ диплома (шлюзъ регламента)"
                              className={`inline-flex items-center gap-1 text-xs font-quote transition-colors ${
                                it.cited ? 'text-[#8A6B2F]' : 'text-muted-foreground/60 hover:text-[#8A6B2F]'
                              }`}
                            >
                              {it.cited ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                              есть ссылка въ дипломѣ
                            </button>
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
                            <button
                              onClick={(e) => copyGost(e, it.id, gost)}
                              title="Скопировать строку по ГОСТ Р 7.0.5-2008"
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-[#8A6B2F] transition-colors"
                            >
                              {copiedId === it.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-[#6E8A2F]" />
                                  <span className="text-[#6E8A2F]">скопировано</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>по ГОСТ</span>
                                </>
                              )}
                            </button>
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

      {/* ── Модальное окно правки ── */}
      {editingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B2118]/50 animate-fade-in"
          onClick={resetForm}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-2xl border border-[#B08D46]/60 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_30px_70px_-20px_rgba(43,33,24,0.5)] animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <Corners />
            <div className="border border-border px-6 py-5 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
                <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  Правка источника
                </p>
                <button
                  onClick={resetForm}
                  title="Закрыть"
                  className="p-1.5 border border-border text-muted-foreground hover:text-[#8C2F1B] hover:border-[#8C2F1B]/50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{renderFields()}</div>

              <div className="flex items-center justify-end gap-4 mt-5">
                <button
                  onClick={resetForm}
                  className="text-xs font-quote italic text-muted-foreground hover:text-[#8C2F1B] transition-colors"
                >
                  отмѣнить
                </button>
                <button
                  onClick={saveItem}
                  disabled={busy || !windowOpen}
                  title={!windowOpen ? 'Окно закрыто' : undefined}
                  className="border border-[#6E2415] bg-[#8C2F1B] text-[#F3EDDF] font-display text-[10px] uppercase tracking-[0.18em] px-5 py-2.5 transition-all duration-200 hover:bg-[#7A2715] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#8C2F1B]"
                >
                  {busy ? 'Записывается...' : 'Сохранить правку'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Модальное подтверждение «удалить всѣ» ── */}
      {showDeleteAll && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2B2118]/50 animate-fade-in"
          onClick={() => setShowDeleteAll(false)}
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
                  onClick={() => setShowDeleteAll(false)}
                  title="Закрыть"
                  className="p-1.5 border border-border text-muted-foreground hover:text-[#8C2F1B] hover:border-[#8C2F1B]/50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="font-quote text-sm text-foreground leading-relaxed">
                Будутъ удалены только <b className="text-[#8C2F1B]">непринятые</b> источники —{' '}
                <b>{deletableCount}</b> изъ {items.length}.
              </p>
              <p className="font-quote text-sm text-muted-foreground mt-2">
                {approvedCount > 0
                  ? `Принятые наставникомъ (${approvedCount}) останутся въ спискѣ.`
                  : 'Принятыхъ наставникомъ источниковъ въ спискѣ нѣтъ.'}
              </p>
              <p className="font-quote italic text-xs text-[#8C2F1B]/80 mt-3">
                Вниманіе: дѣйствіе нельзя будеть отменить.
              </p>

              <div className="flex items-center justify-end gap-4 mt-5">
                <button
                  onClick={() => setShowDeleteAll(false)}
                  className="text-xs font-quote italic text-muted-foreground hover:text-[#8C2F1B] transition-colors"
                >
                  отмѣнить
                </button>
                <button
                  onClick={confirmDeleteAll}
                  disabled={busyDeleteAll || deletableCount === 0}
                  className="inline-flex items-center gap-1.5 border border-[#6E2415] bg-[#8C2F1B] text-[#F3EDDF] font-display text-[10px] uppercase tracking-[0.18em] px-5 py-2 transition-all duration-200 hover:bg-[#7A2715] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busyDeleteAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  удалить {deletableCount}
                </button>
              </div>
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