'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
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

  // Loading spinner melhorado
  if (loading) {
    return (
      <div 
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
          gap: '1.5rem'
        }}
      >
        {/* Logo ou nome */}
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
            <Image
              src="/sodcapital-logo.png"
              alt="SodCapital"
              width={160}
              height={48}
              style={{ width: 'auto', height: 'auto' }}
              priority
            />
          </div>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Carregando sistema...
          </p>
        </div>

        {/* Spinner animado */}
        <div 
          style={{
            width: '48px',
            height: '48px',
            border: '3px solid #e5e7eb',
            borderTop: '3px solid #1555D6',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }}
        />
        
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  // Páginas públicas (renderizar sem layout)
  if (isPublicPage) {
    return <>{children}</>
  }

  // Páginas privadas (com layout completo e melhorado)
  return (
    <div 
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#f9fafb'
      }}
    >
      <SideBar />
      
      <div 
        style={{
          flex: '1',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          backgroundColor: '#f9fafb'
        }}
      >
        <TopBar />
        
        <main 
          style={{
            flex: '1',
            overflowY: 'auto',
            backgroundColor: '#f9fafb',
            padding: '2rem',
            transition: 'all 0.3s ease'
          }}
        >
          <div 
            style={{
              maxWidth: '1600px',
              margin: '0 auto',
              animation: 'fadeIn 0.3s ease-in-out'
            }}
          >
            {children}
          </div>
        </main>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Scrollbar customizada */
        main::-webkit-scrollbar {
          width: 8px;
        }

        main::-webkit-scrollbar-track {
          background: #f1f1f1;
        }

        main::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 4px;
        }

        main::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
      `}</style>
    </div>
  )
}