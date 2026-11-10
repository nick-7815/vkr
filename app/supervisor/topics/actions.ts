'use server'

import { createClient } from '@/lib/supabase/server'

async function requireSupervisorOrDeputy() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Не авторизован')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'supervisor' && profile?.role !== 'deputy') {
    throw new Error('Доступ только для наставника или зам. заведующего')
  }

  return { userId: user.id, role: profile.role as 'supervisor' | 'deputy' }
}

/* Внести тему (наставник — себе; замзав — указывает наставника) */
export async function createTopic(data: {
  cycle_id: string
  supervisor_id: string
  title: string
  description?: string
  source?: 'new' | 'carried_over'
}) {
  const { userId, role } = await requireSupervisorOrDeputy()

  const supabase = await createClient()

  if (!data.title?.trim()) {
    return { success: false, error: 'Укажите название темы' }
  }
  if (data.title.trim().length > 300) {
    return { success: false, error: 'Название слишком длинное (до 300 знаков)' }
  }

    // дубль названия в рамках цикла
  const { data: dup } = await supabase
    .from('topics')
    .select('id')
    .eq('cycle_id', data.cycle_id)
    .ilike('title', data.title.trim())
    .limit(1)
  if (dup && dup.length > 0) {
    return { success: false, error: 'Тема с таким названием уже есть в каталоге этого цикла' }
  }

  // наставник создаёт только СЕБЕ; замзав темы вручную не вносит —
  // он управляет подачами («Подать студента») и правит формулировки
  if (role === 'supervisor' && data.supervisor_id !== userId) {
    return { success: false, error: 'Наставник вносит темы только себе' }
  }
  if (role === 'deputy') {
    return { success: false, error: 'Темы вносит наставник в своём разделе «Мои темы»' }
  }

  const { error } = await supabase.from('topics').insert({
    cycle_id: data.cycle_id,
    supervisor_id: data.supervisor_id,
    title: data.title.trim(),
    description: data.description?.trim() || null,
    source: data.source === 'carried_over' ? 'carried_over' : 'new',
    status: 'catalog',
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/* Править тему (название/описание) */
export async function updateTopic(data: {
  topicId: string
  title: string
  description?: string
  source?: 'new' | 'carried_over'
}) {
  const { userId, role } = await requireSupervisorOrDeputy()

  const supabase = await createClient()

  if (!data.title?.trim()) {
    return { success: false, error: 'Укажите название темы' }
  }

  // проверка прав: свой наставник или замзав (RLS продублирует)
  const { data: topic } = await supabase
    .from('topics')
    .select('supervisor_id, status, cycle_id')
    .eq('id', data.topicId)
    .single()

  if (!topic) {
    return { success: false, error: 'Тема не найдена' }
  }
  if (role === 'supervisor' && topic.supervisor_id !== userId) {
    return { success: false, error: 'Можно править только свои темы' }
  }
  // утверждённую приказом тему не правим формулировкой
  if (topic.status === 'approved') {
    return { success: false, error: 'Тема утверждена приказом — правка закрыта' }
  }
    // дубль названия в рамках цикла (не считая саму себя)
  const { data: dup } = await supabase
    .from('topics')
    .select('id')
    .eq('cycle_id', topic.cycle_id)
    .ilike('title', data.title.trim())
    .neq('id', data.topicId)
    .limit(1)
  if (dup && dup.length > 0) {
    return { success: false, error: 'Тема с таким названием уже есть в каталоге этого цикла' }
  }

  const { error } = await supabase
    .from('topics')
    .update({
      title: data.title.trim(),
      description: data.description?.trim() || null,
      source: data.source === 'carried_over' ? 'carried_over' : 'new',
    })
    .eq('id', data.topicId)

  if (error) {
    return { success: false, error: error.message }
  }

  // синхронизация: у поданных студентов формулировка = формулировка темы;
  // правка темы = ответ на замечание ректората — штамп снимается сразу
  const { error: syncError } = await supabase
    .from('applications')
    .update({ final_title: data.title.trim(), rework_note: null })
    .eq('topic_id', data.topicId)

  if (syncError) {
    return { success: false, error: 'Тема обновлена, но подачи не синхронизированы: ' + syncError.message }
  }

  return { success: true }
}

/* Удалить тему (только из каталога, не из приказа) */
export async function deleteTopic(topicId: string) {
  const { userId, role } = await requireSupervisorOrDeputy()

  const supabase = await createClient()

  const { data: topic } = await supabase
    .from('topics')
    .select('supervisor_id, status')
    .eq('id', topicId)
    .single()

  if (!topic) {
    return { success: false, error: 'Тема не найдена' }
  }
  if (role === 'supervisor' && topic.supervisor_id !== userId) {
    return { success: false, error: 'Можно удалять только свои темы' }
  }
  if (topic.status === 'approved') {
    return { success: false, error: 'Тема утверждена приказом — удаление закрыто' }
  }

    // тема привязана к подаче студента — удаление закрыто
  const { data: used } = await supabase
    .from('applications')
    .select('id')
    .eq('topic_id', topicId)
    .limit(1)
  if (used && used.length > 0) {
    return { success: false, error: 'Тема закреплена за студентом (подача) — сначала отмените подачу' }
  }

  const { error } = await supabase
    .from('topics')
    .delete()
    .eq('id', topicId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/* Импорт тем из CSV (в цикл, наставнику) */
export async function importTopicsFromCsv(
  cycleId: string,
  supervisorId: string,
  csvData: Array<{ title: string; description?: string; source?: string }>
) {
  const { userId, role } = await requireSupervisorOrDeputy()

  const supabase = await createClient()
  let successCount = 0
  const errors: string[] = []

  // наставник импортирует только себе
  if (role === 'supervisor' && supervisorId !== userId) {
    return { success: 0, errors: ['Наставник импортирует темы только себе'] }
  }
  if (role === 'deputy') {
    return { success: 0, errors: ['Импорт тем — функция наставника (раздел «Мои темы»)'] }
  }

  for (const row of csvData) {
    try {
      if (!row.title?.trim()) {
        errors.push('Строка пропущена: нет названия темы')
        continue
      }

      // дубль названия в рамках цикла
      const { data: dup } = await supabase
        .from('topics')
        .select('id')
        .eq('cycle_id', cycleId)
        .ilike('title', row.title.trim())
        .limit(1)
      if (dup && dup.length > 0) {
        errors.push(`«${row.title.trim()}»: такая тема уже есть в каталоге`)
        continue
      }

      const source = row.source?.trim() === 'carried_over' ? 'carried_over' : 'new'

      const { error } = await supabase.from('topics').insert({
        cycle_id: cycleId,
        supervisor_id: supervisorId,
        title: row.title.trim(),
        description: row.description?.trim() || null,
        source,
        status: 'catalog',
      })

      if (error) {
        errors.push(`«${row.title.trim()}»: ${error.message}`)
      } else {
        successCount++
      }
    } catch (err: unknown) {
      errors.push(`Ошибка обработки строки: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { success: successCount, errors }
}
/* ── Подать студента (пара студент — тема) ── */
export async function submitStudent(data: {
  cycleId: string
  studentId: string
  topicId: string
  finalTitle: string
}) {
  const { userId, role } = await requireSupervisorOrDeputy()

  const supabase = await createClient()

  if (!data.finalTitle?.trim()) {
    return { success: false, error: 'Укажите итоговую формулировку темы' }
  }

  // тема существует и принадлежит наставнику (или замзав)
  const { data: topic } = await supabase
    .from('topics')
    .select('id, supervisor_id, title')
    .eq('id', data.topicId)
    .single()

  if (!topic) {
    return { success: false, error: 'Тема не найдена' }
  }
  if (role === 'supervisor' && topic.supervisor_id !== userId) {
    return { success: false, error: 'Можно подавать только на свои темы' }
  }

  // студент существует и он студент
  const { data: student } = await supabase
    .from('profiles')
    .select('id, role, full_name, is_active')
    .eq('id', data.studentId)
    .single()

  if (!student || student.role !== 'student') {
    return { success: false, error: 'Выбранный профиль не является студентом' }
  }
    // отключенный студент не может быть подан
  if (student.is_active === false) {
    return { success: false, error: 'Учетная запись студента отключена' }
  }

  // у студента уже есть подача в этом цикле?
  const { data: existing } = await supabase
    .from('applications')
    .select('id')
    .eq('student_id', data.studentId)
    .eq('cycle_id', data.cycleId)
    .limit(1)
  if (existing && existing.length > 0) {
    return {
      success: false,
      error: `У студента ${student.full_name} уже есть подача в этом цикле`,
    }
  }

    // тема уже занята другим студентом в этом цикле?
  const { data: taken } = await supabase
    .from('applications')
    .select('id, student:profiles!applications_student_id_fkey(full_name)')
    .eq('topic_id', data.topicId)
    .eq('cycle_id', data.cycleId)
    .limit(1)
  if (taken && taken.length > 0) {
    const takenName = (taken[0] as any).student?.full_name || 'другим студентом'
    return {
      success: false,
      error: `Тема уже подана за ${takenName}`,
    }
  }

  const { error } = await supabase.from('applications').insert({
    cycle_id: data.cycleId,
    student_id: data.studentId,
    topic_id: data.topicId,
    final_title: data.finalTitle.trim(),
    status: 'submitted',
  })

  if (error) {
    const msg = error.message.includes('duplicate')
      ? 'У этого студента уже есть подача в цикле'
      : error.message
    return { success: false, error: msg }
  }

  return { success: true, studentName: student.full_name || '' }
}
/* Правка итоговой формулировки подачи (пока не в приказе) */
export async function updateApplication(applicationId: string, finalTitle: string) {
  const { userId, role } = await requireSupervisorOrDeputy()

  const supabase = await createClient()

  if (!finalTitle?.trim()) {
    return { success: false, error: 'Итоговая формулировка обязательна' }
  }

  const { data: app } = await supabase
    .from('applications')
    .select('status, topic:topics(supervisor_id)')
    .eq('id', applicationId)
    .single()

  if (!app) {
    return { success: false, error: 'Подача не найдена' }
  }
  if (app.status !== 'submitted') {
    return { success: false, error: 'Править можно только подачу со статусом «Подано»' }
  }
  if (role === 'supervisor' && (app.topic as any)?.supervisor_id !== userId) {
    return { success: false, error: 'Можно править только свои подачи' }
  }
  

  const { error } = await supabase
    .from('applications')
    .update({ final_title: finalTitle.trim() })
    .eq('id', applicationId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/* Отменить подачу (только пока статус submitted) */
export async function cancelApplication(applicationId: string) {
  const { userId, role } = await requireSupervisorOrDeputy()

  const supabase = await createClient()

  const { data: app } = await supabase
    .from('applications')
    .select('status, topic:topics(supervisor_id)')
    .eq('id', applicationId)
    .single()

  if (!app) {
    return { success: false, error: 'Подача не найдена' }
  }
  if (app.status !== 'submitted') {
    return { success: false, error: 'Отменить можно только подачу со статусом «Подано»' }
  }
  const topicData = app.topic as unknown as { supervisor_id: string } | null
  if (role === 'supervisor' && topicData?.supervisor_id !== userId) {
    return { success: false, error: 'Можно отменять только свои подачи' }
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