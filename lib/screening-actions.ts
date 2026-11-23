'use server'

/* ── Шаг 4. Просмотры: назначение рецензентов (канцелярия) ──
   По схеме «как надо»: рецензентов подбирает трекер — шаффл без повторов
   или вручную; руководитель студента рецензентом быть не может;
   на каждом просмотре у студента два рецензента.
   Отдельной роли нет: рецензенты — те же наставники из БД. */

import { createClient } from '@/lib/supabase/server'

type ActionResult = { ok: boolean; message?: string }

async function requireChancery() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Не авторизован')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  if (!profile || !['secretary', 'deputy', 'head'].includes(profile.role)) {
    throw new Error('Доступ только для канцелярии')
  }
  if (profile.is_active === false) {
    throw new Error('Учетная запись отключена')
  }
  return user.id
}

/* Fisher–Yates: «шаффл без повторов» из схемы */
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* ── Авто-раскладка: каждому утверждённому студенту — по два рецензента
      на просмотр №1 и №2. Уже назначенные слоты не трогаем: повторный
      запуск долагивает только пустые места. ── */
export async function shuffleReviewers(cycleId: string): Promise<ActionResult> {
  await requireChancery()
  const supabase = await createClient()

  const { data: apps } = await supabase
    .from('applications')
    .select('student_id, topic:topics(supervisor_id)')
    .eq('cycle_id', cycleId)
    .in('status', ['approved', 'published'])
  const rows = (apps as unknown as { student_id: string; topic: { supervisor_id: string } | null }[]) ?? []

  if (rows.length === 0) {
    return { ok: false, message: 'Нет утверждённых подач в цикле' }
  }

  const { data: teachers } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'supervisor')
    .eq('is_active', true)
  const teacherIds = (teachers ?? []).map((t) => t.id)
  if (teacherIds.length < 3) {
    return { ok: false, message: 'Мало наставников: нужны минимум трое (два рецензента + руководитель)' }
  }

  const { data: existing } = await supabase
    .from('screening_assignments')
    .select('student_id, screening_no, supervisor_id')
    .eq('cycle_id', cycleId)

  const taken = new Set<string>()
  const have = new Map<string, number>()
  for (const e of existing ?? []) {
    taken.add(`${e.student_id}:${e.screening_no}:${e.supervisor_id}`)
    const k = `${e.student_id}:${e.screening_no}`
    have.set(k, (have.get(k) ?? 0) + 1)
  }

  const inserts: { cycle_id: string; student_id: string; supervisor_id: string; screening_no: number }[] = []
  let skipped = 0

  for (const a of rows) {
    const own = a.topic?.supervisor_id
    const pool = shuffled(teacherIds.filter((id) => id !== own))
    if (pool.length < 2) {
      skipped++
      continue
    }
    for (const no of [1, 2]) {
      let n = have.get(`${a.student_id}:${no}`) ?? 0
      for (const id of pool) {
        if (n >= 2) break
        const key = `${a.student_id}:${no}:${id}`
        if (taken.has(key)) continue
        inserts.push({ cycle_id: cycleId, student_id: a.student_id, supervisor_id: id, screening_no: no })
        taken.add(key)
        n++
      }
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from('screening_assignments').insert(inserts)
    if (error) return { ok: false, message: error.message }
  }
  return {
    ok: true,
    message: `Назначено слотов: ${inserts.length}${skipped > 0 ? ` · пропущено студентов: ${skipped}` : ''}`,
  }
}

/* ── Вручную назначить одного рецензента на слот ── */
export async function setSlot(
  cycleId: string,
  studentId: string,
  screeningNo: number,
  supervisorId: string,
): Promise<ActionResult> {
  await requireChancery()
  const supabase = await createClient()

  if (screeningNo !== 1 && screeningNo !== 2) {
    return { ok: false, message: 'Номер просмотра — 1 или 2' }
  }

  const { data: app } = await supabase
    .from('applications')
    .select('id, topic:topics(supervisor_id)')
    .eq('cycle_id', cycleId)
    .eq('student_id', studentId)
    .in('status', ['approved', 'published'])
    .limit(1)
    .maybeSingle()
  if (!app) {
    return { ok: false, message: 'Подача студента не утверждена приказом' }
  }
  const ownSupervisor = (app as unknown as { topic: { supervisor_id: string } | null })?.topic?.supervisor_id
  if (ownSupervisor && ownSupervisor === supervisorId) {
    return { ok: false, message: 'Руководитель студента не может быть его рецензентом' }
  }

  const { data: teacher } = await supabase
    .from('profiles')
    .select('id, is_active')
    .eq('id', supervisorId)
    .eq('role', 'supervisor')
    .maybeSingle()
  if (!teacher || teacher.is_active === false) {
    return { ok: false, message: 'Это не активный наставник' }
  }

  const { data: sameSlot } = await supabase
    .from('screening_assignments')
    .select('id')
    .eq('cycle_id', cycleId)
    .eq('student_id', studentId)
    .eq('screening_no', screeningNo)
    .eq('supervisor_id', supervisorId)
    .limit(1)
    .maybeSingle()
  if (sameSlot) {
    return { ok: false, message: 'Этот наставник уже рецензент у студента на этом просмотре' }
  }

  const { count } = await supabase
    .from('screening_assignments')
    .select('*', { count: 'exact', head: true })
    .eq('cycle_id', cycleId)
    .eq('student_id', studentId)
    .eq('screening_no', screeningNo)
  if ((count ?? 0) >= 2) {
    return { ok: false, message: 'У студента уже два рецензента на этом просмотре' }
  }

  const { error } = await supabase
    .from('screening_assignments')
    .insert({ cycle_id: cycleId, student_id: studentId, supervisor_id: supervisorId, screening_no: screeningNo })
  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Рецензент назначен' }
}

/* ── Снять одного рецензента ── */
export async function removeAssignment(id: string): Promise<ActionResult> {
  await requireChancery()
  const supabase = await createClient()
  const { error } = await supabase.from('screening_assignments').delete().eq('id', id)
  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Назначение снято' }
}

/* ── Убрать все назначения цикла (осторожно: карточки наставников очистятся) ── */
export async function clearCycle(cycleId: string): Promise<ActionResult> {
  await requireChancery()
  const supabase = await createClient()
  const { error } = await supabase
    .from('screening_assignments')
    .delete()
    .eq('cycle_id', cycleId)
  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Все назначения цикла убраны' }
}
