'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import SideBar from './SideBar'
import TopBar from './TopBar'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Verificar autenticação
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && pathname !== '/login' && pathname !== '/reset') {
        router.push('/login')
      }
      setLoading(false)
    })

    // Listener para mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && pathname !== '/login' && pathname !== '/reset') {
        router.push('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [router, pathname])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  // Páginas públicas (sem layout)
  if (pathname === '/login' || pathname === '/reset') {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SideBar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto bg-gray-100 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
