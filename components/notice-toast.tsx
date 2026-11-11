'use client'

import { useEffect, useRef } from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

export type Notice = { type: 'ok' | 'err'; text: string } | null

/* ── Единое уведомление-тост для всех разделов ──
   Плавает поверх страницы в правом верхнем углу — видно при любом скролле.
   Гаснет само: удача — 4,5 с, ошибка — 7 с; закрывается крестиком.
   whitespace-pre-line — чтобы многострочные тексты (ведомости админки) читались. */
export default function NoticeToast({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => closeRef.current(), notice.type === 'ok' ? 4500 : 7000)
    return () => clearTimeout(t)
  }, [notice])

  if (!notice) return null

  return (
    <div className="fixed top-4 right-4 z-50 w-[min(26rem,calc(100vw-2rem))] animate-fade-up" aria-live="polite">
      <div
        className={`flex items-start gap-2.5 border px-4 py-3 shadow-[0_18px_44px_-20px_rgba(43,33,24,0.5)] ${
          notice.type === 'ok'
            ? 'border-[#B08D46]/70 bg-[#FAF5E8]'
            : 'border-l-2 border-l-[#8C2F1B] border-red-200 bg-red-50'
        }`}
      >
        {notice.type === 'ok' ? (
          <CheckCircle2 className="w-4 h-4 text-[#8A6B2F] mt-0.5 shrink-0" />
        ) : (
          <AlertCircle className="w-4 h-4 text-[#8C2F1B] mt-0.5 shrink-0" />
        )}
        <p className={`text-sm flex-1 whitespace-pre-line ${notice.type === 'ok' ? 'text-[#6E5A2A]' : 'text-red-800'}`}>
          {notice.text}
        </p>
        <button
          onClick={() => closeRef.current()}
          title="Скрыть"
          className="shrink-0 text-muted-foreground/50 hover:text-[#8C2F1B] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
