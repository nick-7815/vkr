'use server'

import { createClient } from '@/lib/supabase/server'

/* Циклы ведёт секретарь (Task_InitCycle в дорожке секретаря на BPMN-схеме);
   править окна дат может и зам. заведующего (SubProcess_DateChange) */

async function requireSecretary() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Не авторизован')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'secretary') {
    throw new Error('Доступ только для секретаря кафедры')
  }
}

async function requireSecretaryOrDeputy() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Не авторизован')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'secretary' && profile?.role !== 'deputy') {
    throw new Error('Доступ только для секретаря или зам. заведующего')
  }
}

/* Создать цикл учебного года */
export async function createCycle(name: string) {
  await requireSecretary()

  const supabase = await createClient()

  const trimmed = name.trim()
  if (!trimmed) {
    return { success: false, error: 'Укажите название цикла (например, 2025/2026)' }
  }
  if (trimmed.length > 50) {
    return { success: false, error: 'Название слишком длинное (до 50 знаков)' }
  }

  const { error } = await supabase
    .from('cycles')
    .insert({ name: trimmed, status: 'planning' })

  if (error) {
    const msg = error.message.includes('duplicate')
      ? 'Цикл с таким названием уже значится в реестре'
      : error.message
    return { success: false, error: msg }
  }

  return { success: true }
}

/* Сменить статус цикла */
export async function setCycleStatus(
  cycleId: string,
  status: 'planning' | 'active' | 'closed'
) {
  await requireSecretary()

  const supabase = await createClient()

  // активным может быть только один цикл
  if (status === 'active') {
    const { data: other } = await supabase
      .from('cycles')
      .select('id, name')
      .eq('status', 'active')
      .neq('id', cycleId)
      .limit(1)

    if (other && other.length > 0) {
      return {
        success: false,
        error: `Уже есть активный цикл «${other[0].name}» — сначала закройте его`,
      }
    }
  }

  const { error } = await supabase
    .from('cycles')
    .update({ status })
    .eq('id', cycleId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/* Сохранить окна регламента цикла.
   Окна с пустыми датами удаляются; пары «с/по» обязательны вместе */
export async function saveWindows(
  cycleId: string,
  windows: Array<{ stage: string; starts_on: string; ends_on: string }>
) {
  await requireSecretaryOrDeputy()

  const supabase = await createClient()

  // проверка пар дат
  for (const w of windows) {
    const hasStart = !!w.starts_on
    const hasEnd = !!w.ends_on
    if (hasStart !== hasEnd) {
      return {
        success: false,
        error: `Этап «${w.stage}»: укажите обе даты или очистите обе`,
      }
    }
    if (hasStart && hasEnd && w.ends_on < w.starts_on) {
      return {
        success: false,
        error: `Этап «${w.stage}»: дата окончания раньше даты начала`,
      }
    }
  }

  // перезапись: старые окна цикла удаляем, вставляем заполненные
  const { error: delError } = await supabase
    .from('regulation_windows')
    .delete()
    .eq('cycle_id', cycleId)

  if (delError) {
    return { success: false, error: delError.message }
  }

  const rows = windows
    .filter((w) => w.starts_on && w.ends_on)
    .map((w) => ({
      cycle_id: cycleId,
      stage: w.stage,
      starts_on: w.starts_on,
      ends_on: w.ends_on,
    }))

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from('regulation_windows')
      .insert(rows)

    if (insertError) {
      return { success: false, error: insertError.message }
    }
  }

  return { success: true }
}

/* Переименовать цикл */
export async function renameCycle(cycleId: string, name: string) {
  await requireSecretary()

  const supabase = await createClient()

  const trimmed = name.trim()
  if (!trimmed) {
    return { success: false, error: 'Укажите название цикла' }
  }
  if (trimmed.length > 50) {
    return { success: false, error: 'Название слишком длинное (до 50 знаков)' }
  }

  const { error } = await supabase
    .from('cycles')
    .update({ name: trimmed })
    .eq('id', cycleId)

  if (error) {
    const msg = error.message.includes('duplicate')
      ? 'Цикл с таким названием уже значится в реестре'
      : error.message
    return { success: false, error: msg }
  }

  return { success: true }
}
