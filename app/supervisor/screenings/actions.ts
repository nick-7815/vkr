'use server'

/* ── Шаг 4. Просмотры: карточка рецензента ──
   По схеме: в карточке просмотра — оценка, комментарий и контакт
   для консультации. Оценка выставлена → статус «done». */

import { createClient } from '@/lib/supabase/server'

type ActionResult = { ok: boolean; message?: string }

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
    throw new Error('Доступ только для наставников')
  }
  if (profile.is_active === false) {
    throw new Error('Учетная запись отключена')
  }
  return user.id
}

export async function saveReview(
  id: string,
  grade: number | null,
  comment: string,
  contact: string,
): Promise<ActionResult> {
  const uid = await requireSupervisor()
  const supabase = await createClient()

  if (grade !== null && ![2, 3, 4, 5].includes(grade)) {
    return { ok: false, message: 'Оценка — 2, 3, 4 или 5' }
  }

  /* владение карточкой: рецензент правит только своё */
  const { data: row } = await supabase
    .from('screening_assignments')
    .select('id')
    .eq('id', id)
    .eq('supervisor_id', uid)
    .limit(1)
    .maybeSingle()
  if (!row) {
    return { ok: false, message: 'Назначение не найдено' }
  }

  const { error } = await supabase
    .from('screening_assignments')
    .update({
      grade: grade ?? null,
      comment: comment.trim() || null,
      contact: contact.trim() || null,
      status: grade ? 'done' : 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { ok: false, message: error.message }
  return { ok: true, message: grade ? 'Просмотр сдан' : 'Черновик сохранён — без оценки статус «ожидаетъ»' }
}
