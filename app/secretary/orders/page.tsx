'use client'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect } from 'react'
import { generateOrder, sendOrder, markOrderReply, publishOrder, deleteOrder } from './actions'
import {
  Loader2, Plus, AlertCircle, CheckCircle2, X,
  FileText, Send, PenLine, Megaphone, Ban, RotateCcw, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react'

/* ── Типы ── */
type Order = {
  id: string
  cycle_id: string
  status: string
  rework_note: string | null
  published_at: string | null
  created_at: string
  cycle: { name: string } | null
}
type OrderItem = {
  id: string
  application_id: string
  student: { full_name: string } | null
  topic: { title: string } | null
  application: { final_title: string; status: string } | null
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Проектъ',
  sent: 'Отправленъ въ ректоратъ',
  rework: 'Возвращенъ съ замечаніями',
  signed: 'Подписанъ',
  published: 'Опубликованъ',
}

const APP_STATUS_LABELS: Record<string, string> = {
  submitted: 'Подано',
  in_order: 'В приказе',
  published: 'Утверждено',
}

/* ── Декор ── */
function Corners() {
  const base = 'absolute w-4 h-4 border-[#B08D46] pointer-events-none'
  return (
    <>
      <span className={`${base} top-1 left-1 border-t border-l`} />
      <span className={`${base} top-1 right-1 border-t border-r`} />
      <span className={`${base} bottom-1 left-1 border-b border-l`} />
      <span className={`${base} bottom-1 right-1 border-b border-r`} />
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status
  const published = status === 'published'
  const signed = status === 'signed'
  const rework = status === 'rework'
  return (
    <span
      className={`inline-block font-display text-[9px] uppercase tracking-[0.18em] px-2.5 py-1 border ${
        published
          ? 'bg-[#8C2F1B] border-[#6E2415] text-[#F3EDDF] shadow-[inset_0_0_0_1px_rgba(243,237,223,0.2)]'
          : rework
            ? 'border-[#8C2F1B]/60 bg-[#8C2F1B]/5 text-[#8C2F1B]'
            : signed
              ? 'border-[#B08D46]/60 bg-[#B08D46]/10 text-[#8A6B2F]'
              : 'border-border bg-secondary text-muted-foreground'
      }`}
    >
      {label}
    </span>
  )
}

function WaxButton({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`group relative block overflow-hidden border border-[#6E2415] bg-[#8C2F1B] text-[#F3EDDF] text-[12px] font-semibold uppercase tracking-[0.22em] shadow-[inset_0_0_0_1px_rgba(243,237,223,0.25)] transition-all duration-200 hover:bg-[#7A2715] hover:shadow-[0_8px_22px_-8px_rgba(140,47,27,0.6),inset_0_0_0_1px_rgba(243,237,223,0.25)] active:scale-[0.99] ${className}`}>
      <span
        className="absolute inset-y-0 left-0 w-1/3 -translate-x-[160%] group-hover:translate-x-[380%] transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-[#C9A45C]/35 to-transparent pointer-events-none"
        aria-hidden
      />
      <span className="relative z-10 flex items-center justify-center gap-2.5 h-full">{children}</span>
    </span>
  )
}

export default function SecretaryOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [cycle, setCycle] = useState<{ id: string; name: string } | null>(null)
  const [submittedCount, setSubmittedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // раскрытый приказ + его строки + busy
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [items, setItems] = useState<Record<string, OrderItem[]>>({})
  const [itemsLoading, setItemsLoading] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // удаление черновика
  const [deletingOrder, setDeletingOrder] = useState<Order | null>(null)
  const [deleteOrderBusy, setDeleteOrderBusy] = useState(false)

  // замечания ректората (модаль)
  const [fixingOrder, setFixingOrder] = useState<Order | null>(null)
  const [fixNote, setFixNote] = useState('')
  const [fixBusy, setFixBusy] = useState(false)
  const [fixError, setFixError] = useState<string | null>(null)

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    const supabase = createClient()

    const { data: cycleData } = await supabase
      .from('cycles')
      .select('id, name')
      .eq('status', 'active')
      .maybeSingle()
    setCycle(cycleData)

    if (cycleData) {
      const { count } = await supabase
        .from('applications')
        .select('*', { count: 'exact', head: true })
        .eq('cycle_id', cycleData.id)
        .eq('status', 'submitted')
      setSubmittedCount(count ?? 0)
    } else {
      setSubmittedCount(0)
    }

    const { data, error } = await supabase
      .from('orders')
      .select('id, cycle_id, status, rework_note, published_at, created_at, cycle:cycles(name)')
      .order('created_at', { ascending: false })

    if (error) {
      setNotice({ type: 'err', text: 'Ошибка загрузки приказов: ' + error.message })
    } else {
      setOrders((data as unknown as Order[]) || [])
    }
    setLoading(false)
  }

  const toggleExpand = async (order: Order) => {
    if (expandedId === order.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(order.id)
    setItemsLoading(order.id)

    const supabase = createClient()
    const { data } = await supabase
      .from('order_items')
      .select('id, application_id, application:applications(final_title, status, student:profiles!applications_student_id_fkey(full_name)), topic:applications!order_items_application_id_fkey(topics(title))')
      .eq('order_id', order.id)
      .order('id')

    // упрощённо: тянем через application → student отдельно
    const rows = (data as any[]) || []
    const enriched: OrderItem[] = []
    for (const r of rows) {
      const { data: appData } = await supabase
        .from('applications')
        .select('final_title, status, student_id')
        .eq('id', r.application_id)
        .single()
      let studentName: string | null = null
      let topicTitle: string | null = null
      if (appData) {
        const { data: s } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', appData.student_id)
          .single()
        studentName = s?.full_name || null
        const { data: tt } = await supabase
          .from('topics')
          .select('title')
          .eq('id', (r as any).application?.topic_id ?? '')
          .maybeSingle()
        topicTitle = tt?.title || null
      }
      enriched.push({
        id: r.id,
        application_id: r.application_id,
        student: { full_name: studentName || 'Студентъ' },
        topic: { title: topicTitle || '' },
        application: { final_title: appData?.final_title || '', status: appData?.status || '' },
      })
    }
    setItems((prev) => ({ ...prev, [order.id]: enriched }))
    setItemsLoading(null)
  }

  const handleGenerate = async () => {
    if (!cycle) return
    setBusyId('generate')
    setNotice(null)
    const result = await generateOrder(cycle.id)
    setBusyId(null)

    if (!result.success) {
      setNotice({ type: 'err', text: result.error || 'Ошибка сборки' })
      return
    }
    setNotice({ type: 'ok', text: `Проект приказа собран: пар въ приказе — ${(result as any).count}. Проверьте и отправьте въ ректорат.` })
    loadAll()
  }

  const handleLifecycle = async (order: Order, action: 'send' | 'sign' | 'publish') => {
    setBusyId(order.id)
    setNotice(null)

    let result
    if (action === 'send') result = await sendOrder(order.id)
    else if (action === 'sign') result = await markOrderReply(order.id, 'signed')
    else result = await publishOrder(order.id)

    setBusyId(null)

    if (!result.success) {
      setNotice({ type: 'err', text: result.error || 'Ошибка' })
      return
    }
    loadAll()
  }

  const openFix = (order: Order) => {
    setFixingOrder(order)
    setFixNote(order.rework_note || '')
    setFixError(null)
    setNotice(null)
  }

  const doFix = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fixingOrder) return

    if (!fixNote.trim()) {
      setFixError('Укажите текстъ замечаній ректората')
      return
    }

    setFixBusy(true)
    setFixError(null)
    const result = await markOrderReply(fixingOrder.id, 'fix', fixNote)
    setFixBusy(false)

    if (!result.success) {
      setFixError(result.error || 'Ошибка')
      return
    }
    setFixingOrder(null)
    setNotice({ type: 'ok', text: 'Приказъ возвращенъ на доработку — наставники увидят замечанія у своих подач' })
    loadAll()
  }

  const doDeleteOrder = async () => {
    if (!deletingOrder) return
    setDeleteOrderBusy(true)
    const result = await deleteOrder(deletingOrder.id)
    setDeleteOrderBusy(false)

    if (!result.success) {
      setNotice({ type: 'err', text: result.error || 'Ошибка удаления' })
      setDeletingOrder(null)
      return
    }
    if (expandedId === deletingOrder.id) setExpandedId(null)
    setDeletingOrder(null)
    loadAll()
  }

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 animate-fade-in"
        style={{ minHeight: 'calc(100vh - 6rem)' }}
      >
        <Loader2 className="w-6 h-6 animate-spin text-[#8C2F1B]" />
        <p className="font-quote italic text-muted-foreground">Канцелярия готовит приказы...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* ── Шапка ── */}
      <div className="flex flex-wrap items-start justify-between gap-4 animate-fade-up">
        <div className="pt-1">
          <p className="font-display text-[10px] tracking-[0.36em] text-muted-foreground">
            РАЗДЕЛЪ V · ПРИКАЗЫ
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
            Приказы
          </h1>
          <p className="font-quote italic text-muted-foreground mt-2">
            проект собирается автоматически из поданных студентов
          </p>
        </div>
      </div>

      {/* ── Баннер ── */}
      {notice && (
        <div
          className={`flex items-start gap-2.5 border px-4 py-3 animate-fade-up ${
            notice.type === 'ok'
              ? 'border-[#B08D46]/60 bg-[#B08D46]/10'
              : 'border-l-2 border-l-[#8C2F1B] border-red-200 bg-red-50'
          }`}
        >
          {notice.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-[#8A6B2F] mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-[#8C2F1B] mt-0.5 shrink-0" />
          )}
          <p className={`text-sm ${notice.type === 'ok' ? 'text-[#6E5A2A]' : 'text-red-800'}`}>{notice.text}</p>
        </div>
      )}

      {/* ── Активный цикл: сборка проекта ── */}
      {cycle ? (
        <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.35)] animate-fade-up">
          <Corners />
          <div className="border border-border px-7 py-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-display text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Активный циклъ
              </p>
              <p className="font-display text-xl font-bold tracking-tight mt-1 [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
                {cycle.name}
              </p>
              <p className="font-quote italic text-sm text-muted-foreground mt-1">
                подано студентовъ: {submittedCount}
              </p>
            </div>
            <button
              onClick={handleGenerate}
              disabled={busyId === 'generate' || submittedCount === 0}
              className="disabled:opacity-60"
            >
              <WaxButton className="h-12 px-8">
                {busyId === 'generate' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Собирается...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Собрать проектъ
                  </>
                )}
              </WaxButton>
            </button>
          </div>
        </div>
      ) : (
        <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up">
          <Corners />
          <div className="border border-border px-6 py-12 text-center">
            <FileText className="w-8 h-8 mx-auto text-[#B08D46]/60 mb-4" />
            <p className="font-display text-lg font-bold">Активного цикла нет</p>
            <p className="font-quote italic text-sm text-muted-foreground mt-2">
              Приказы формируются для активного цикла
            </p>
          </div>
        </div>
      )}

      {/* ── Реестр приказов ── */}
      <div className="relative">
        <span
          className="absolute -top-8 -right-2 font-display text-[9rem] leading-none text-[#B08D46]/[0.06] select-none pointer-events-none"
          aria-hidden
        >
          V
        </span>

        {orders.length === 0 ? (
          <div className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up [animation-delay:150ms]">
            <Corners />
            <div className="border border-border px-6 py-12 text-center">
              <FileText className="w-8 h-8 mx-auto text-[#B08D46]/60 mb-4" />
              <p className="font-display text-lg font-bold">Приказов еще нет</p>
              <p className="font-quote italic text-sm text-muted-foreground mt-2">
                Соберите первый проект из поданных студентов
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order, i) => {
              const isExpanded = expandedId === order.id
              const orderItems = items[order.id]
              return (
                <div
                  key={order.id}
                  className="relative border border-[#B08D46]/50 bg-card p-1.5 shadow-[0_1px_2px_rgba(43,33,24,0.06),0_18px_44px_-22px_rgba(43,33,24,0.3)] animate-fade-up"
                  style={{ animationDelay: `${Math.min(i, 10) * 60}ms` }}
                >
                  <Corners />
                  <div className="border border-border">
                    {/* шапка приказа */}
                    <div className="px-6 py-4 flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => toggleExpand(order)}
                        className="p-1.5 border border-[#B08D46]/50 text-muted-foreground hover:text-[#8C2F1B] hover:border-[#8C2F1B] transition-colors"
                        title={isExpanded ? 'Свернуть состав' : 'Состав приказа'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className="font-display text-lg font-bold tracking-tight [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
                          Приказъ отъ {new Date(order.created_at).toLocaleDateString('ru-RU')}
                        </p>
                        <p className="font-quote italic text-sm text-muted-foreground mt-0.5">
                          циклъ «{order.cycle?.name || '—'}»
                        </p>
                      </div>

                      <StatusBadge status={order.status} />

                      {/* кнопки lifecycle */}
                      <div className="flex items-center gap-1.5">
                        {order.status === 'draft' && (
                          <>
                            <button
                              onClick={() => handleLifecycle(order, 'send')}
                              disabled={busyId === order.id}
                              title="Отправить в ректорат"
                              className="p-2 border border-[#8C2F1B]/60 text-[#8C2F1B] bg-[#8C2F1B]/5 hover:bg-[#8C2F1B] hover:text-[#F3EDDF] transition-colors disabled:opacity-50"
                            >
                              {busyId === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => setDeletingOrder(order)}
                              title="Удалить проект"
                              className="p-2 border border-[#B08D46]/50 text-muted-foreground hover:text-[#8C2F1B] hover:border-[#8C2F1B] transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {order.status === 'sent' && (
                          <>
                            <button
                              onClick={() => handleLifecycle(order, 'sign')}
                              disabled={busyId === order.id}
                              title="Ректорат подписал"
                              className="p-2 border border-[#8C2F1B]/60 text-[#8C2F1B] bg-[#8C2F1B]/5 hover:bg-[#8C2F1B] hover:text-[#F3EDDF] transition-colors disabled:opacity-50"
                            >
                              {busyId === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenLine className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => openFix(order)}
                              disabled={busyId === order.id}
                              title="Ректорат вернул с замечаниями"
                              className="p-2 border border-[#B08D46]/50 text-muted-foreground hover:text-[#8C2F1B] hover:border-[#8C2F1B] transition-colors disabled:opacity-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {order.status === 'rework' && (
                          <>
                            <button
                              onClick={() => handleLifecycle(order, 'send')}
                              disabled={busyId === order.id}
                              title="Отправить в ректорат повторно"
                              className="p-2 border border-[#8C2F1B]/60 text-[#8C2F1B] bg-[#8C2F1B]/5 hover:bg-[#8C2F1B] hover:text-[#F3EDDF] transition-colors disabled:opacity-50"
                            >
                              {busyId === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => setDeletingOrder(order)}
                              title="Удалить возвращённый приказ"
                              className="p-2 border border-[#B08D46]/50 text-muted-foreground hover:text-[#8C2F1B] hover:border-[#8C2F1B] transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {order.status === 'signed' && (
                          <button
                            onClick={() => handleLifecycle(order, 'publish')}
                            disabled={busyId === order.id}
                            title="Опубликовать приказ"
                            className="p-2 border border-[#8C2F1B]/60 text-[#8C2F1B] bg-[#8C2F1B]/5 hover:bg-[#8C2F1B] hover:text-[#F3EDDF] transition-colors disabled:opacity-50"
                          >
                            {busyId === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* замечания ректората — видны всегда, без раскрытия */}
                    {order.status === 'rework' && order.rework_note && (
                      <div className="border-t border-border px-6 py-4 bg-red-50/60 flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-[#8C2F1B] mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-display text-[10px] uppercase tracking-[0.22em] text-[#8C2F1B]">
                            Замечанія ректората
                          </p>
                          <p className="font-quote italic text-sm text-red-900 mt-1 whitespace-pre-wrap">
                            «{order.rework_note}»
                          </p>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            Наставники исправят формулировки — после этого отправьте приказъ повторно
                          </p>
                        </div>
                      </div>
                    )}

                    {/* состав приказа */}
                    {isExpanded && (
                      <div className="border-t border-border px-6 py-5 bg-secondary/30">
                        <p className="font-display text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-4">
                          Составъ приказа · пары студент — тема
                        </p>

                        {itemsLoading === order.id ? (
                          <div className="flex items-center gap-2.5 py-4 justify-center">
                            <Loader2 className="w-4 h-4 animate-spin text-[#8C2F1B]" />
                            <p className="font-quote italic text-sm text-muted-foreground">Канцелярия готовитъ составъ...</p>
                          </div>
                        ) : orderItems && orderItems.length > 0 ? (
                          <div className="space-y-3">
                            {orderItems.map((it, j) => (
                              <div
                                key={it.id}
                                className="border border-border px-5 py-4 flex items-start gap-4 animate-fade-up"
                                style={{ animationDelay: `${j * 40}ms` }}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-display text-[15px] font-bold">
                                    {it.student?.full_name || 'Студентъ'}
                                  </p>
                                  <p className="text-sm text-muted-foreground mt-1 font-quote italic">
                                    «{it.application?.final_title || it.topic?.title || '—'}»
                                  </p>
                                </div>
                                <span className="shrink-0 inline-block font-display text-[9px] uppercase tracking-[0.18em] px-2.5 py-1 border border-[#B08D46]/60 bg-[#B08D46]/10 text-[#8A6B2F]">
                                  {APP_STATUS_LABELS[it.application?.status ?? ''] ?? '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="font-quote italic text-sm text-muted-foreground text-center py-4">
                            Составъ пустъ
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Удаление приказа (модаль) ── */}
      {deletingOrder && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setDeletingOrder(null)}
        >
          <div
            className="relative w-full max-w-md bg-card border border-[#B08D46]/50 p-1.5 shadow-[0_24px_60px_-20px_rgba(43,33,24,0.5)] animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <Corners />
            <div className="border border-border px-7 py-6">
              <button
                onClick={() => setDeletingOrder(null)}
                className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>

              <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Удаление приказа
              </p>
              <h2 className="font-display text-lg font-bold tracking-tight text-center mt-2 leading-snug">
                Приказъ отъ {new Date(deletingOrder.created_at).toLocaleDateString('ru-RU')}
              </h2>
              <p className="font-quote italic text-sm text-muted-foreground text-center mt-3">
                {deletingOrder.status === 'rework'
                  ? 'Возвращённый приказ будет удален вместе со списком пар, замечания с подач снимутся. Студенты останутся «Подано» — соберите проект заново.'
                  : 'Проект будет удален вместе со списком пар. Студенты останутся в статусе «Подано» — их можно подать заново в новом проекте.'}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDeletingOrder(null)}
                  className="h-11 border border-[#B08D46]/60 bg-card text-foreground font-display text-[11px] uppercase tracking-[0.2em] transition-all hover:border-[#8C2F1B] active:scale-[0.99]"
                >
                  Отмена
                </button>
                <button
                  onClick={doDeleteOrder}
                  disabled={deleteOrderBusy}
                  className="h-11 border border-[#6E2415] bg-[#8C2F1B] text-[#F3EDDF] font-display text-[11px] uppercase tracking-[0.2em] transition-all hover:bg-[#7A2715] active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {deleteOrderBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Удалить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Замечания ректората (модаль) ── */}
      {fixingOrder && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setFixingOrder(null)}
        >
          <div
            className="relative w-full max-w-md bg-card border border-[#B08D46]/50 p-1.5 shadow-[0_24px_60px_-20px_rgba(43,33,24,0.5)] animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <Corners />
            <div className="border border-border px-7 py-6">
              <button
                onClick={() => setFixingOrder(null)}
                className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>

              <p className="text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Ответъ ректората
              </p>
              <h2 className="font-display text-lg font-bold tracking-tight text-center mt-2 leading-snug">
                Замечанія къ приказу
              </h2>
              <p className="font-quote italic text-sm text-muted-foreground text-center mt-3">
                Приказъ вернется на доработку: наставники увидят замечанія у своих подач и исправят формулировки тем
              </p>

              {fixError && (
                <div className="mt-4 flex items-start gap-2.5 border-l-2 border-[#8C2F1B] bg-red-50 px-4 py-3 animate-fade-up">
                  <AlertCircle className="w-4 h-4 text-[#8C2F1B] mt-0.5 shrink-0" />
                  <p className="text-sm text-red-800">{fixError}</p>
                </div>
              )}

              <form onSubmit={doFix} className="mt-6 space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="fix-note" className="block text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Что указал ректоратъ
                  </label>
                  <textarea
                    id="fix-note"
                    value={fixNote}
                    onChange={(e) => setFixNote(e.target.value)}
                    required
                    rows={4}
                    maxLength={500}
                    disabled={fixBusy}
                    placeholder="Например: уточнить формулировку темы для Ивановой И. И."
                    className="w-full bg-[#FAF5E8] border border-input px-3.5 py-3 text-sm outline-none transition-all duration-200 focus:border-[#8C2F1B] focus:ring-3 focus:ring-[#8C2F1B]/10 disabled:opacity-50 placeholder:text-muted-foreground/50 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFixingOrder(null)}
                    className="h-11 border border-[#B08D46]/60 bg-card text-foreground font-display text-[11px] uppercase tracking-[0.2em] transition-all hover:border-[#8C2F1B] active:scale-[0.99]"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={fixBusy}
                    className="h-11 border border-[#6E2415] bg-[#8C2F1B] text-[#F3EDDF] font-display text-[11px] uppercase tracking-[0.2em] transition-all hover:bg-[#7A2715] active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {fixBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Вернуть на доработку'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Подпись ── */}
      <p className="text-right font-quote italic text-xs text-muted-foreground/80 animate-fade-in [animation-delay:600ms]">
        Проектъ собирается автоматически из поданных студентов — Task_GenOrder
      </p>
    </div>
  )
}