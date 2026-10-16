'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type MenuItem = {
  href: string
  label: string
  icon: string
}

export default function Sidebar({ role, fullName }: { role: string; fullName: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)

  const getMenuItems = (): MenuItem[] => {
    switch (role) {
      case 'deputy':
        return [
          { href: '/dashboard', label: 'Дашборд', icon: '🏠' },
          { href: '/admin/users', label: 'Пользователи', icon: '👥' },
          { href: '/deputy/topics', label: 'Каталог тем', icon: '' },
          { href: '/deputy/cycles', label: 'Циклы ВКР', icon: '📅' },
          { href: '/deputy/orders', label: 'Приказы', icon: '📄' },
        ]
      case 'supervisor':
        return [
          { href: '/dashboard', label: 'Дашборд', icon: '🏠' },
          { href: '/supervisor/my-students', label: 'Мои студенты', icon: '' },
          { href: '/supervisor/topics', label: 'Мои темы', icon: '' },
        ]
      case 'student':
        return [
          { href: '/dashboard', label: 'Дашборд', icon: '🏠' },
          { href: '/student/topics', label: 'Выбор темы', icon: '📖' },
          { href: '/student/my-work', label: 'Моя работа', icon: '💼' },
        ]
      default:
        return [{ href: '/dashboard', label: 'Дашборд', icon: '🏠' }]
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const menuItems = getMenuItems()

  return (
    <>
      {/* Мобильная кнопка меню */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Overlay для мобильных */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 shadow-lg transform transition-transform duration-300 z-40 ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="flex flex-col h-full">
          {/* Логотип */}
          <div className="p-6 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-primary"> ВКР-трекер</h1>
            <p className="text-xs text-gray-500 mt-1">{fullName}</p>
            <span className="inline-block mt-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
              {role}
            </span>
          </div>

          {/* Меню */}
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {menuItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary text-white shadow-md'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Кнопка выхода */}
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
            >
              <span className="text-xl">🚪</span>
              <span className="font-medium">Выйти</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}