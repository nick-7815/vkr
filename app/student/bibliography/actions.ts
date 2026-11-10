'use server'

import { createClient } from '@/lib/supabase/server'

type Db = Awaited<ReturnType<typeof createClient>>

const KINDS = ['book', 'article', 'url', 'standard', 'other'] as const

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
  return null
}

function fieldsToRow(data: BibFields) {
  return {
    kind: data.kind,
    authors: data.authors?.trim() || '',
    title: data.title.trim(),
    source: data.source?.trim() || null,
    year: data.year && data.year.trim() ? Number(data.year.trim()) : null,
    url: data.url?.trim() || null,
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
