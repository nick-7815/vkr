'use server'

import { createClient } from '@/lib/supabase/server'

async function requireSupervisor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Не авторизован')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'supervisor') {
    throw new Error('Доступ только для наставника')
  }
  if (profile.is_active === false) {
    throw new Error('Учетная запись отключена')
  }

  return user.id
}

/* ── Виза источника: принять / вернуть с замечанием ── */
export async function reviewBibItem(data: {
  itemId: string
  decision: 'approved' | 'rework'
  comment?: string
}) {
  const userId = await requireSupervisor()
  const supabase = await createClient()

  if (data.decision === 'rework' && !data.comment?.trim()) {
    return { success: false, error: 'К замечанию нужен комментарий' }
  }

  const { data: item } = await supabase
    .from('bibliography_items')
    .select('id, status, application_id')
    .eq('id', data.itemId)
    .limit(1)
    .maybeSingle()

  // RLS: чужой источник наставник не видит — «не найден» = «не ваш список»
  if (!item) {
    return { success: false, error: 'Источник не найден (список не ваш)' }
  }
  if (item.status === 'approved') {
    return { success: false, error: 'Источник уже принят' }
  }
  if (data.decision === 'rework' && item.status !== 'pending') {
    return { success: false, error: 'На доработку возвращается только источник «на проверке»' }
  }

  // список принадлежит дипломнику этого наставника? (вторая линия после RLS)
  // наставник определяется через тему: applications.supervisor_id нет,
  // связь — topics.supervisor_id
  const { data: app } = await supabase
    .from('applications')
    .select('id, topic_id')
    .eq('id', item.application_id)
    .limit(1)
    .maybeSingle()

  if (!app) {
    return { success: false, error: 'Список этого студента вам не принадлежит' }
  }

  const { data: topic } = await supabase
    .from('topics')
    .select('id, supervisor_id')
    .eq('id', app.topic_id)
    .limit(1)
    .maybeSingle()

  if (!topic || topic.supervisor_id !== userId) {
    return { success: false, error: 'Список этого студента вам не принадлежит' }
  }

  const { error } = await supabase
    .from('bibliography_items')
    .update({
      status: data.decision,
      comment: data.decision === 'rework' ? data.comment!.trim() : null,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.itemId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/* ── Отмена отправленного замечания: источник возвращается «на проверку» ── */
export async function cancelReworkItem(itemId: string) {
  const userId = await requireSupervisor()
  const supabase = await createClient()

  const { data: item } = await supabase
    .from('bibliography_items')
    .select('id, status, application_id')
    .eq('id', itemId)
    .limit(1)
    .maybeSingle()

  // RLS: чужой источник наставник не видит — «не найден» = «не ваш список»
  if (!item) {
    return { success: false, error: 'Источник не найден (список не ваш)' }
  }
  if (item.status !== 'rework') {
    return { success: false, error: 'Отменить можно только отправленное замечание' }
  }

  // список принадлежит дипломнику этого наставника? (вторая линия после RLS)
  // связь — topics.supervisor_id
  const { data: app } = await supabase
    .from('applications')
    .select('id, topic_id')
    .eq('id', item.application_id)
    .limit(1)
    .maybeSingle()

  if (!app) {
    return { success: false, error: 'Список этого студента вам не принадлежит' }
  }

  const { data: topic } = await supabase
    .from('topics')
    .select('id, supervisor_id')
    .eq('id', app.topic_id)
    .limit(1)
    .maybeSingle()

  if (!topic || topic.supervisor_id !== userId) {
    return { success: false, error: 'Список этого студента вам не принадлежит' }
  }

  const { error } = await supabase
    .from('bibliography_items')
    .update({
      status: 'pending',
      comment: null,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}