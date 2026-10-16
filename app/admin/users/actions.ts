'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function requireDeputy() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Не авторизован')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'deputy') {
    throw new Error('Доступ только для зам. заведующего')
  }

  return user.id        // ← добавили
}

/* ── Валидация записи (общая для формы и CSV) ──
   Возвращает строку ошибки или null, если всё чисто */
async function validateEntry(
  supabase: ReturnType<typeof createAdminClient>,
  entry: {
    email: string
    password: string
    full_name: string
    role: string
    student_id?: string
  }
): Promise<string | null> {
  if (!entry.full_name?.trim()) {
    return 'Не указано ФИО'
  }
  if (!entry.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email.trim())) {
    return 'Не указана почта или формат неверный'
  }
  if (!entry.password || entry.password.length < 6) {
    return 'Пароль обязателен, минимум 6 знаков'
  }
  if (!entry.role) {
    return 'Не указано звание'
  }

  // уникальность почты среди уже зарегистрированных профилей
  const { data: emailTaken } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', entry.email.trim())
    .limit(1)
  if (emailTaken && emailTaken.length > 0) {
    return 'Эта почта уже значится в реестре'
  }

  const sid = entry.student_id?.trim() || ''

  if (entry.role === 'student') {
    // зачетка: обязательна, только цифры, 6–10 знаков
    if (!sid) {
      return 'Для студента обязателен номер зачетной книжки'
    }
    if (!/^\d{6,10}$/.test(sid)) {
      return 'Номер зачетной книжки — только цифры (6–10 знаков)'
    }
    // уникальность зачетки среди всех профилей
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('student_id', sid)
      .limit(1)
    if (existing && existing.length > 0) {
      return `Зачетка ${sid} уже значится в реестре`
    }
  } else if (sid) {
    // зачетка у не-студента — отвергаем
    return 'Номер зачетной книжки указывается только студентам'
  }

  return null
}

export async function importStudentsFromCsv(csvData: Array<{
  full_name: string
  email: string
  student_id: string
  password?: string
}>) {
  await requireDeputy()

  const supabase = createAdminClient()
  let successCount = 0
  const errors: string[] = []
  const credentials: Array<{ email: string; password: string; full_name: string }> = []

  for (const row of csvData) {
    try {
      // пароль обязателен: вузовский из ведомости. Генерации нет
      if (!row.password?.trim()) {
        const who = row.full_name?.trim() || row.email?.trim() || 'строка без имени и почты'
        errors.push(`${who}: нет пароля в ведомости — запись не внесена`)
        continue
      }

      const error = await validateEntry(supabase, {
        email: row.email,
        password: row.password.trim(),
        full_name: row.full_name,
        role: 'student',
        student_id: row.student_id,
      })

      if (error) {
        const who = row.full_name?.trim() || row.email?.trim() || 'строка без имени и почты'
        errors.push(`${who} (${row.email || 'почта не указана'}): ${error}`)
        continue
      }

      const { error: createError } = await supabase.auth.admin.createUser({
        email: row.email.trim(),
        password: row.password.trim(),
        email_confirm: true,
        user_metadata: {
          full_name: row.full_name.trim(),
          role: 'student',
          student_id: row.student_id?.trim() || null,
        },
      })

      if (createError) {
        // страховка: переводим типовую ошибку Supabase на русский
        const msg = createError.message.includes('already been registered')
          ? 'почта уже зарегистрирована'
          : createError.message
        errors.push(`${row.full_name?.trim() || row.email}: ${msg}`)
      } else {
        successCount++
        credentials.push({
          email: row.email.trim(),
          password: row.password.trim(),
          full_name: row.full_name.trim(),
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`Ошибка обработки строки: ${msg}`)
    }
  }

  return { success: successCount, errors, credentials }
}

export async function createUserManually(data: {
  email: string
  password: string
  full_name: string
  role: string
  student_id?: string
}) {
  await requireDeputy()

  const supabase = createAdminClient()

  // серверная валидация (клиентскую можно обойти)
  const validationError = await validateEntry(supabase, data)
  if (validationError) {
    return { success: false, error: validationError }
  }

  const { error } = await supabase.auth.admin.createUser({
    email: data.email.trim(),
    password: data.password,
    email_confirm: true,
    user_metadata: {
      full_name: data.full_name.trim(),
      role: data.role,
      student_id: data.student_id?.trim() || null,
    },
  })

  if (error) {
    // страховка-перевод и здесь
    const msg = error.message.includes('already been registered')
      ? 'Эта почта уже значится в реестре'
      : error.message
    return { success: false, error: msg }
  }

  return { success: true }
}

/* ── Включение / отключение записи ── */
export async function setUserActive(userId: string, active: boolean) {
  const currentUserId = await requireDeputy()

  // зам. заведующий не может отключить самого себя
  if (!active && userId === currentUserId) {
    return { success: false, error: 'Нельзя отключить собственную запись' }
  }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('profiles')
    .update({ is_active: active })
    .eq('id', userId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
/* ── Правка записи: ФИО, зачетка + опциональная смена пароля ── */
export async function updateProfile(data: {
  userId: string
  full_name: string
  student_id?: string
  password?: string
}) {
  await requireDeputy()

  const supabase = createAdminClient()

  if (!data.full_name?.trim()) {
    return { success: false, error: 'Не указано ФИО' }
  }

  // пароль опционален: если указан — проверяем длину
  if (data.password !== undefined && data.password.length > 0 && data.password.length < 6) {
    return { success: false, error: 'Новый пароль: минимум 6 знаков' }
  }

  const sid = data.student_id?.trim() || ''

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.userId)
    .single()

  if (!profile) {
    return { success: false, error: 'Запись не найдена' }
  }

  if (profile.role === 'student') {
    if (!sid) {
      return { success: false, error: 'Для студента обязателен номер зачетной книжки' }
    }
    if (!/^\d{6,10}$/.test(sid)) {
      return { success: false, error: 'Номер зачетной книжки — только цифры (6–10 знаков)' }
    }
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('student_id', sid)
      .neq('id', data.userId)
      .limit(1)
    if (existing && existing.length > 0) {
      return { success: false, error: `Зачетка ${sid} уже значится в реестре` }
    }
  } else if (sid) {
    return { success: false, error: 'Номер зачетной книжки указывается только студентам' }
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ full_name: data.full_name.trim(), student_id: sid || null })
    .eq('id', data.userId)

  if (profileError) {
    return { success: false, error: profileError.message }
  }

  // updateUserById умеет менять и метаданные, и пароль одним вызовом
  const authUpdate: {
    user_metadata: Record<string, unknown>
    password?: string
  } = {
    user_metadata: {
      full_name: data.full_name.trim(),
      role: profile.role,
      student_id: sid || null,
    },
  }
  if (data.password && data.password.length > 0) {
    authUpdate.password = data.password
  }

  const { error: metaError } = await supabase.auth.admin.updateUserById(
    data.userId,
    authUpdate
  )

  if (metaError) {
    return { success: false, error: 'Данные обновлены, но пароль не изменен: ' + metaError.message }
  }

  return { success: true }
}