'use server'

import { createClient } from '@/lib/supabase/server'

/* Зам. заведующего правит даты окон по ходу цикла (SubProcess_DateChange);
   создание циклов, переименование и статусы — у секретаря */

async function requireDeputyOrSecretary() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Не авторизован')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'deputy' && profile?.role !== 'secretary') {
    throw new Error('Доступ только для зам. заведующего или секретаря')
  }
}

/* Сохранить окна регламента цикла.
   Окна с пустыми датами удаляются; пары «с/по» обязательны вместе */
export async function saveWindows(
  cycleId: string,
  windows: Array<{ stage: string; starts_on: string; ends_on: string }>
) {
  await requireDeputyOrSecretary()

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
