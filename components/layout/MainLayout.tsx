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

  // Páginas públicas (sem layout e sem verificação)
  const isPublicPage = pathname === '/login' || pathname === '/reset' || pathname?.startsWith('/reset/')

  useEffect(() => {
    // Se for página pública, não verifica autenticação
    if (isPublicPage) {
      setLoading(false)
      return
    }

    // Verificar autenticação para páginas privadas
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
      } else {
        setLoading(false)
      }
    })

    // Listener para mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && !isPublicPage) {
        router.push('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [router, pathname, isPublicPage])

  // Loading spinner
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  // Páginas públicas (renderizar sem layout)
  if (isPublicPage) {
    return <>{children}</>
  }

  // Páginas privadas (com layout completo)
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
