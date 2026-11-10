'use server'

import { createClient } from '@/lib/supabase/server'

type Db = Awaited<ReturnType<typeof createClient>>

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

/* Окно «Каталогъ и подача» открыто? */
async function isApplicationsOpen(supabase: Db, cycleId: string): Promise<boolean> {
  const { data: win } = await supabase
    .from('regulation_windows')
    .select('starts_on, ends_on')
    .eq('cycle_id', cycleId)
    .eq('stage', 'applications')
    .limit(1)
    .maybeSingle()

  if (!win) return false

  const n = new Date()
  const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  return win.starts_on <= today && win.ends_on >= today
}

/* ── Подать за себя ── */
export async function submitOwnApplication(topicId: string) {
  const userId = await requireStudent()
  const supabase = await createClient()

  // активный цикл
  const { data: cycle } = await supabase
    .from('cycles')
    .select('id, name')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!cycle) {
    return { success: false, error: 'Активного цикла нет — подача закрыта' }
  }

  // окно регламента
  const open = await isApplicationsOpen(supabase, cycle.id)
  if (!open) {
    return { success: false, error: 'Окно «Каталогъ и подача» закрыто — подача недоступна' }
  }

  // тема свободна? (catalog = в каталоге; approved = уже утверждена приказом)
  const { data: topic } = await supabase
    .from('topics')
    .select('id, title, status')
    .eq('id', topicId)
    .maybeSingle()

  if (!topic) {
    return { success: false, error: 'Тема не найдена' }
  }
  if (topic.status !== 'catalog') {
    return { success: false, error: 'Тема недоступна для подачи (уже утверждена приказом)' }
  }

  // своя подача уже есть? (RLS показывает только свои записи)
  const { data: mine } = await supabase
    .from('applications')
    .select('id')
    .eq('student_id', userId)
    .eq('cycle_id', cycle.id)
    .limit(1)
  if (mine && mine.length > 0) {
    return { success: false, error: 'У вас уже есть подача в этом цикле' }
  }

  const { error } = await supabase.from('applications').insert({
    cycle_id: cycle.id,
    student_id: userId,
    topic_id: topicId,
    final_title: topic.title,
    status: 'submitted',
  })

  if (error) {
    // «тема занята другим студентом» по RLS не видна — её ловит уникальный индекс
    if (error.message.includes('applications_topic_cycle_unique')) {
      return { success: false, error: 'Тема уже подана другим студентом' }
    }
    if (error.message.includes('applications_student_cycle_unique')) {
      return { success: false, error: 'У вас уже есть подача в этом цикле' }
    }
    return { success: false, error: error.message }
  }

  return { success: true }
}

/* ── Отозвать свою подачу ── */
export async function withdrawOwnApplication(applicationId: string) {
  const userId = await requireStudent()
  const supabase = await createClient()

  const { data: app } = await supabase
    .from('applications')
    .select('id, status, cycle_id')
    .eq('id', applicationId)
    .maybeSingle()

  // RLS: чужую подачу студент не видит — «не найдена» = «не ваша»
  if (!app) {
    return { success: false, error: 'Подача не найдена' }
  }
  if (app.status !== 'submitted') {
    return { success: false, error: 'Подача уже в приказе — отзыв закрыт' }
  }

  const open = await isApplicationsOpen(supabase, app.cycle_id)
  if (!open) {
    return { success: false, error: 'Окно «Каталогъ и подача» закрыто — отзыв недоступен' }
  }

  const { error } = await supabase
    .from('applications')
    .delete()
    .eq('id', applicationId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}