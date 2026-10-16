'use server'

import { createClient } from '@/lib/supabase/server'

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

/* Собрать проект приказа из всех поданных студентов активного цикла (Task_GenOrder) */
export async function generateOrder(cycleId: string) {
  await requireSecretaryOrDeputy()

  const supabase = await createClient()

  // поданные студенты цикла
  const { data: apps, error: appsError } = await supabase
    .from('applications')
    .select('id')
    .eq('cycle_id', cycleId)
    .eq('status', 'submitted')

  if (appsError) {
    return { success: false, error: appsError.message }
  }
  if (!apps || apps.length === 0) {
    return { success: false, error: 'Нет поданных студентов — собирать не из чего' }
  }

  // проект приказа
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({ cycle_id: cycleId, status: 'draft' })
    .select('id')
    .single()

  if (orderError || !order) {
    return { success: false, error: orderError?.message || 'Не удалось создать приказ' }
  }

  // строки приказа — все поданные пары
  const items = apps.map((a) => ({
    order_id: order.id,
    application_id: a.id,
  }))

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(items)

  if (itemsError) {
    // откат: удаляем пустой приказ
    await supabase.from('orders').delete().eq('id', order.id)
    return { success: false, error: itemsError.message }
  }

  return { success: true, orderId: order.id, count: items.length }
}

/* Отправить проект в ректорат (Task_CheckOrder) */
export async function sendOrder(orderId: string) {
  await requireSecretaryOrDeputy()

  const supabase = await createClient()

  // отправить можно только проект (draft)
  const { error } = await supabase
    .from('orders')
    .update({ status: 'sent' })
    .eq('id', orderId)
    .eq('status', 'draft')

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/* Зафиксировать ответ ректората (Event_OrderReply + Gateway_Signed) */
export async function markOrderReply(
  orderId: string,
  outcome: 'signed' | 'fix'
) {
  await requireSecretaryOrDeputy()

  const supabase = await createClient()

  // ответ можно фиксировать только у отправленного
  const { error } = await supabase
    .from('orders')
    .update({ status: outcome === 'signed' ? 'signed' : 'draft' })
    .eq('id', orderId)
    .eq('status', 'sent')

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/* Опубликовать приказ (Task_PublishOrder) + зафиксировать статусы */
export async function publishOrder(orderId: string) {
  await requireSecretaryOrDeputy()

  const supabase = await createClient()

  // опубликовать можно только подписанный
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, cycle_id, status')
    .eq('id', orderId)
    .single()

  if (!order) {
    return { success: false, error: 'Приказ не найден' }
  }
  if (order.status !== 'signed') {
    return { success: false, error: 'Опубликовать можно только подписанный приказ' }
  }

  // 1) приказ → published
  const { error: pubError } = await supabase
    .from('orders')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', orderId)

  if (pubError) {
    return { success: false, error: pubError.message }
  }

  // 2) все строки приказа → applications published
  const { data: items } = await supabase
    .from('order_items')
    .select('application_id')
    .eq('order_id', orderId)

  if (items && items.length > 0) {
    const appIds = items.map((i) => i.application_id)

    const { error: appsError } = await supabase
      .from('applications')
      .update({ status: 'published' })
      .in('id', appIds)

    if (appsError) {
      return { success: false, error: 'Приказ опубликован, но статусы подач не обновлены: ' + appsError.message }
    }

    // 3) темы этих подач → approved
    const { data: apps } = await supabase
      .from('applications')
      .select('topic_id')
      .in('id', appIds)

    const topicIds = (apps || []).map((a) => a.topic_id).filter(Boolean)

    if (topicIds.length > 0) {
      const { error: topicsError } = await supabase
        .from('topics')
        .update({ status: 'approved' })
        .in('id', topicIds)

      if (topicsError) {
        return { success: false, error: 'Пары и темы обновлены, но статусы тем не изменены: ' + topicsError.message }
      }
    }
  }

  return { success: true }
}
/* Удалить проект (только draft, без отправки) */
export async function deleteOrder(orderId: string) {
  await requireSecretaryOrDeputy()

  const supabase = await createClient()

  const { data: order } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single()

  if (!order) {
    return { success: false, error: 'Приказ не найден' }
  }
  if (order.status !== 'draft') {
    return { success: false, error: 'Удалить можно только проект (до отправки)' }
  }

  // order_items удалятся каскадом (on delete cascade)
  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', orderId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}