'use server'

import { createClient } from '@/lib/supabase/server'

type Db = Awaited<ReturnType<typeof createClient>>

const KINDS = ['book', 'article', 'url', 'standard', 'other'] as const

/* Шаг 3д: база происхождения источника (обязательные базы методички) */
const ORIGINS = ['vstu', 'elibrary', 'scopus', 'web', 'other'] as const

async function requireStudent() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Не авторизован')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'student') {
    throw new Error('Доступ только для студентов')
  }
  if (profile.is_active === false) {
    throw new Error('Учетная запись отключена')
  }

  return user.id
}

/* Окно этапа регламента открыто? (сравнение дат строками — как в isApplicationsOpen) */
async function isStageOpen(supabase: Db, cycleId: string, stage: string): Promise<boolean> {
  const { data: win } = await supabase
    .from('regulation_windows')
    .select('starts_on, ends_on')
    .eq('cycle_id', cycleId)
    .eq('stage', stage)
    .limit(1)
    .maybeSingle()

  if (!win) return false

  const n = new Date()
  const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  return win.starts_on <= today && win.ends_on >= today
}

type BibFields = {
  kind: string
  authors: string
  title: string
  source?: string
  year?: string
  url?: string
  origin?: string
}

/* Общая валидация полей источника */
function validateFields(data: BibFields): string | null {
  if (!KINDS.includes(data.kind as (typeof KINDS)[number])) {
    return 'Укажите вид источника'
  }
  if (!data.title?.trim()) {
    return 'Укажите название источника'
  }
  if (data.title.trim().length > 300) {
    return 'Название слишком длинное (до 300 знаков)'
  }
  if (data.authors && data.authors.trim().length > 300) {
    return 'Поле авторов слишком длинное (до 300 знаков)'
  }
  if (data.year && data.year.trim()) {
    const y = Number(data.year.trim())
    if (!Number.isInteger(y) || y < 1900 || y > 2100) {
      return 'Год — целое число от 1900 до 2100'
    }
  }
  if (data.url && data.url.trim() && !/^https?:\/\/\S+$/i.test(data.url.trim())) {
    return 'Ссылка должна начинаться с http:// или https://'
  }
  /* серверное зеркало клиентского правила: статья без журнала не принимается */
  if (data.kind === 'article' && !data.source?.trim()) {
    return 'Для статьи укажите журнал / издание'
  }
  if (data.origin && data.origin.trim() && !ORIGINS.includes(data.origin as (typeof ORIGINS)[number])) {
    return 'Неизвестная база источника'
  }
  return null
}

/* Шаг 3д: автоопределение базы по URL/изданию — в форме можно переопределить */
function guessOrigin(url?: string, source?: string, kind?: string): string | null {
  const hay = `${(url ?? '').toLowerCase()} ${(source ?? '').toLowerCase()}`
  if (/elibrary/.test(hay)) return 'elibrary'
  if (/scopus/.test(hay)) return 'scopus'
  if (/vstu\.ru|волггту/.test(hay)) return 'vstu'
  if (kind === 'url') return 'web'
  return null
}

/* указанная пользователем база сильнее автоопределения */
function normalizeOrigin(data: BibFields): string | null {
  if (data.origin && ORIGINS.includes(data.origin as (typeof ORIGINS)[number])) {
    return data.origin
  }
  return guessOrigin(data.url, data.source, data.kind)
}

function fieldsToRow(data: BibFields) {
  return {
    kind: data.kind,
    authors: data.authors?.trim() || '',
    title: data.title.trim(),
    source: data.source?.trim() || null,
    year: data.year && data.year.trim() ? Number(data.year.trim()) : null,
    url: data.url?.trim() || null,
    origin: normalizeOrigin(data),
    updated_at: new Date().toISOString(),
  }
}

/* ── Добавить источник в список ── */
export async function addBibItem(data: BibFields) {
  const userId = await requireStudent()
  const supabase = await createClient()

  const invalid = validateFields(data)
  if (invalid) return { success: false, error: invalid }

  // активный цикл
  const { data: cycle } = await supabase
    .from('cycles')
    .select('id, name')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!cycle) {
    return { success: false, error: 'Активного цикла нет — список недоступен' }
  }

  // окно этапа «Литература»
  const open = await isStageOpen(supabase, cycle.id, 'bibliography')
  if (!open) {
    return { success: false, error: 'Окно «Литература» закрыто — ведение списка недоступно' }
  }

  // своя подача с утверждённой приказом темой
  const { data: app } = await supabase
    .from('applications')
    .select('id, status')
    .eq('student_id', userId)
    .eq('cycle_id', cycle.id)
    .limit(1)
    .maybeSingle()

  if (!app) {
    return { success: false, error: 'У вас нет подачи в этом цикле' }
  }
  if (app.status !== 'approved' && app.status !== 'published') {
    return { success: false, error: 'Список откроется после утверждения темы приказом' }
  }

  // следующий номер позиции
  const { data: last } = await supabase
    .from('bibliography_items')
    .select('position')
    .eq('application_id', app.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('bibliography_items').insert({
    application_id: app.id,
    cycle_id: cycle.id,
    student_id: userId,
    position: (last?.position ?? 0) + 1,
    status: 'pending',
    ...fieldsToRow(data),
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/* ── Шаг 3д: отметить/снять «есть ссылка в тексте» ──
   Текст ВКР ведётся вне трекера, отметка — самоподтверждение студента.
   Доступно на любом статусе источника (в т.ч. принятом наставником). */
export async function toggleBibCited(itemId: string, cited: boolean) {
  await requireStudent()
  const supabase = await createClient()

  const { data: item } = await supabase
    .from('bibliography_items')
    .select('id')
    .eq('id', itemId)
    .limit(1)
    .maybeSingle()

  if (!item) {
    return { success: false, error: 'Источник не найден' }
  }

  const { error } = await supabase
    .from('bibliography_items')
    .update({ cited: Boolean(cited), updated_at: new Date().toISOString() })
    .eq('id', itemId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/* ── Шаг 3д+: отметить/снять «есть ссылка в тексте» у всѣх источников разом ──
   Явный фильтр по student_id (плюс RLS) — чужие строки не задеваются.
   Доступно на любом статусе источников. */
export async function setAllBibCited(cited: boolean) {
  const userId = await requireStudent()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bibliography_items')
    .update({ cited: Boolean(cited), updated_at: new Date().toISOString() })
    .eq('student_id', userId)
    .select('id')

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, count: data?.length ?? 0 }
}

/* ── Править свой источник (не принятый); после правки замечания — снова «на проверке» ── */
export async function updateBibItem(data: BibFields & { itemId: string }) {
  await requireStudent()
  const supabase = await createClient()

  const invalid = validateFields(data)
  if (invalid) return { success: false, error: invalid }

  const { data: item } = await supabase
    .from('bibliography_items')
    .select('id, status')
    .eq('id', data.itemId)
    .limit(1)
    .maybeSingle()

  // RLS: чужой источник студент не видит — «не найден» = «не ваш»
  if (!item) {
    return { success: false, error: 'Источник не найден' }
  }
  if (item.status === 'approved') {
    return { success: false, error: 'Источник уже принят наставником — правка закрыта' }
  }

  // после правки замечания источник снова «на проверке»
  // (статусом управляет только эта пара: rework → pending; approved уже отсечён выше)
  const { error } = await supabase
    .from('bibliography_items')
    .update({
      ...fieldsToRow(data),
      ...(item.status === 'rework' ? { status: 'pending' } : {}),
    })
    .eq('id', data.itemId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/* ── Удалить свой источник (не принятый) ── */
export async function deleteBibItem(itemId: string) {
  await requireStudent()
  const supabase = await createClient()

  const { data: item } = await supabase
    .from('bibliography_items')
    .select('id, status')
    .eq('id', itemId)
    .limit(1)
    .maybeSingle()

  if (!item) {
    return { success: false, error: 'Источник не найден' }
  }
  if (item.status === 'approved') {
    return { success: false, error: 'Источник уже принят наставником — удаление закрыто' }
  }

  const { error } = await supabase
    .from('bibliography_items')
    .delete()
    .eq('id', itemId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/* ── Импорт списка из ведомости CSV ──
   Валидация каждого ряда — та же validateFields, что и в ручной форме;
   дубли — по названию (без учёта регистра) против своего списка и внутри файла;
   всё вносится со статусом pending — наставник визирует как обычно */
const KIND_ALIASES: Record<string, string> = {
  book: 'book', 'книга': 'book', 'книги': 'book',
  article: 'article', 'статья': 'article', 'статьи': 'article',
  url: 'url', 'интернет-ресурс': 'url', 'интернетъ-ресурсъ': 'url', 'сайт': 'url',
  standard: 'standard', 'стандарт': 'standard', 'стандартъ': 'standard',
  other: 'other', 'прочее': 'other',
}

/* Шаг 3д: база источника въ CSV (колонка origin, не обязательна) */
const ORIGIN_ALIASES: Record<string, string> = {
  vstu: 'vstu', 'волггту': 'vstu', 'библиотека волггту': 'vstu', 'б-ка волггту': 'vstu',
  elibrary: 'elibrary', 'elibrary.ru': 'elibrary', 'ринц': 'elibrary',
  scopus: 'scopus',
  web: 'web', 'интернет': 'web', 'интернетъ': 'web', 'интернет-источник': 'web', 'интернетъ-источникъ': 'web', 'internet': 'web', 'сайт': 'web',
  other: 'other', 'прочее': 'other',
}

const MAX_IMPORT_ROWS = 150

export async function importBibItems(rows: Array<Record<string, string>>) {
  const userId = await requireStudent()
  const supabase = await createClient()

  if (!Array.isArray(rows) || rows.length === 0) {
    return { success: 0, errors: ['Ведомость пуста — нет строк для внесения'] }
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return { success: 0, errors: [`Слишком много строк: до ${MAX_IMPORT_ROWS} за один раз`] }
  }

  // активный цикл, окно «Литература», подача с утверждённой темой — как в addBibItem
  const { data: cycle } = await supabase
    .from('cycles')
    .select('id, name')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!cycle) {
    return { success: 0, errors: ['Активного цикла нет — список недоступен'] }
  }

  const open = await isStageOpen(supabase, cycle.id, 'bibliography')
  if (!open) {
    return { success: 0, errors: ['Окно «Литература» закрыто — ведение списка недоступно'] }
  }

  const { data: app } = await supabase
    .from('applications')
    .select('id, status')
    .eq('student_id', userId)
    .eq('cycle_id', cycle.id)
    .limit(1)
    .maybeSingle()

  if (!app) {
    return { success: 0, errors: ['У вас нет подачи в этом цикле'] }
  }
  if (app.status !== 'approved' && app.status !== 'published') {
    return { success: 0, errors: ['Список откроется после утверждения темы приказом'] }
  }

  // существующие названия — для проверки дублей
  const { data: existing } = await supabase
    .from('bibliography_items')
    .select('title')
    .eq('application_id', app.id)

  const seen = new Set((existing ?? []).map((r) => r.title.trim().toLowerCase()))

  // следующий номер позиции
  const { data: last } = await supabase
    .from('bibliography_items')
    .select('position')
    .eq('application_id', app.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  let position = (last?.position ?? 0) + 1
  let successCount = 0
  const errors: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const rowNo = i + 1
    const raw = rows[i]
    try {
      // заголовки колонок: trim + lower — «Title» и «title» равнозначны
      const row: Record<string, string> = {}
      for (const [k, v] of Object.entries(raw)) {
        row[String(k).trim().toLowerCase()] = typeof v === 'string' ? v : String(v ?? '')
      }

      // kind: англ/рус синонимы; пусто или незнакомое — «книга»
      const kind = KIND_ALIASES[(row.kind ?? '').trim().toLowerCase()] ?? 'book'
      const originAlias = ORIGIN_ALIASES[(row.origin ?? '').trim().toLowerCase()]
      const data: BibFields = {
        kind,
        authors: row.authors ?? '',
        title: row.title ?? '',
        source: row.source ?? '',
        year: row.year ?? '',
        url: row.url ?? '',
        origin: originAlias,
      }

      const invalid = validateFields(data)
      if (invalid) {
        errors.push(`Строка ${rowNo}: ${invalid.toLowerCase()}`)
        continue
      }

      const key = data.title.trim().toLowerCase()
      if (seen.has(key)) {
        errors.push(`Строка ${rowNo}: «${data.title.trim()}» уже есть в списке`)
        continue
      }

      const { error } = await supabase.from('bibliography_items').insert({
        application_id: app.id,
        cycle_id: cycle.id,
        student_id: userId,
        position,
        status: 'pending',
        ...fieldsToRow(data),
      })

      if (error) {
        errors.push(`Строка ${rowNo}: ${error.message}`)
        continue
      }

      seen.add(key)
      position++
      successCount++
    } catch (err: unknown) {
      errors.push(`Строка ${rowNo}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { success: successCount, errors }
}