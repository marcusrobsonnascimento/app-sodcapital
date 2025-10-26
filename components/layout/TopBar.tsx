'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { LogOut, User, Calendar, Building2, FolderKanban, ChevronDown } from 'lucide-react'

export default function TopBar() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  
  // Filtros globais
  const [periodo, setPeriodo] = useState<string>('mes')
  const [empresaId, setEmpresaId] = useState<string>('')
  const [projetoId, setProjetoId] = useState<string>('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })

    // Fechar menu ao clicar fora
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      <header 
        style={{
          height: '72px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e5e7eb',
          padding: '0 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
        }}
      >
        {/* Filtros Globais */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          {/* Período */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              position: 'relative'
            }}
          >
            <Calendar 
              size={18} 
              style={{ color: '#6b7280' }} 
            />
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              style={{
                fontSize: '0.875rem',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '0.5rem 2rem 0.5rem 0.75rem',
                backgroundColor: '#ffffff',
                color: '#374151',
                cursor: 'pointer',
                outline: 'none',
                appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.5rem center',
                backgroundSize: '1rem',
                transition: 'all 0.2s ease',
                fontWeight: '500'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#1555D6'
                e.target.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e5e7eb'
                e.target.style.boxShadow = 'none'
              }}
            >
              <option value="dia">Hoje</option>
              <option value="semana">Esta Semana</option>
              <option value="mes">Este Mês</option>
              <option value="trimestre">Este Trimestre</option>
              <option value="ano">Este Ano</option>
              <option value="ytd">YTD</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>

          {/* Empresa */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              position: 'relative'
            }}
          >
            <Building2 
              size={18} 
              style={{ color: '#6b7280' }} 
            />
            <select
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
              style={{
                fontSize: '0.875rem',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '0.5rem 2rem 0.5rem 0.75rem',
                backgroundColor: '#ffffff',
                color: '#374151',
                cursor: 'pointer',
                outline: 'none',
                appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.5rem center',
                backgroundSize: '1rem',
                transition: 'all 0.2s ease',
                fontWeight: '500',
                minWidth: '180px'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#1555D6'
                e.target.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e5e7eb'
                e.target.style.boxShadow = 'none'
              }}
            >
              <option value="">Todas as Empresas</option>
              {/* Será populado dinamicamente */}
            </select>
          </div>

          {/* Projeto */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              position: 'relative'
            }}
          >
            <FolderKanban 
              size={18} 
              style={{ color: '#6b7280' }} 
            />
            <select
              value={projetoId}
              onChange={(e) => setProjetoId(e.target.value)}
              style={{
                fontSize: '0.875rem',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '0.5rem 2rem 0.5rem 0.75rem',
                backgroundColor: '#ffffff',
                color: '#374151',
                cursor: 'pointer',
                outline: 'none',
                appearance: 'none',
                backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/%3E%3C/svg%3E")',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.5rem center',
                backgroundSize: '1rem',
                transition: 'all 0.2s ease',
                fontWeight: '500',
                minWidth: '180px'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#1555D6'
                e.target.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e5e7eb'
                e.target.style.boxShadow = 'none'
              }}
            >
              <option value="">Todos os Projetos</option>
              {/* Será populado dinamicamente */}
            </select>
          </div>
        </div>

        {/* User Menu */}
        <div 
          ref={userMenuRef}
          style={{ position: 'relative' }}
        >
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.5rem 1rem',
              borderRadius: '10px',
              backgroundColor: showUserMenu ? '#f3f4f6' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontFamily: 'inherit'
            }}
            onMouseEnter={(e) => {
              if (!showUserMenu) {
                e.currentTarget.style.backgroundColor = '#f9fafb'
              }
            }}
            onMouseLeave={(e) => {
              if (!showUserMenu) {
                e.currentTarget.style.backgroundColor = 'transparent'
              }
            }}
          >
            <div 
              style={{
                width: '40px',
                height: '40px',
                backgroundColor: '#1555D6',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <User size={20} style={{ color: '#ffffff' }} />
            </div>
            <div style={{ textAlign: 'left' }}>
              <p 
                style={{ 
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#374151',
                  margin: 0,
                  lineHeight: '1.25'
                }}
              >
                {user?.email?.split('@')[0] || 'Usuário'}
              </p>
              <p 
                style={{ 
                  fontSize: '0.75rem',
                  color: '#6b7280',
                  margin: 0,
                  lineHeight: '1.25'
                }}
              >
                CEO
              </p>
            </div>
            <ChevronDown 
              size={16} 
              style={{ 
                color: '#9ca3af',
                transform: showUserMenu ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease'
              }} 
            />
          </button>

          {showUserMenu && (
            <div 
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 0.5rem)',
                width: '220px',
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                border: '1px solid #e5e7eb',
                padding: '0.5rem',
                zIndex: 50,
                animation: 'slideDown 0.2s ease-out'
              }}
            >
              {/* User Info */}
              <div 
                style={{
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid #f3f4f6',
                  marginBottom: '0.5rem'
                }}
              >
                <p 
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: '#111827',
                    margin: '0 0 0.25rem 0'
                  }}
                >
                  {user?.email?.split('@')[0] || 'Usuário'}
                </p>
                <p 
                  style={{
                    fontSize: '0.75rem',
                    color: '#6b7280',
                    margin: 0
                  }}
                >
                  {user?.email || 'usuario@sodcapital.com'}
                </p>
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  color: '#dc2626',
                  fontWeight: '500',
                  transition: 'background-color 0.2s ease',
                  fontFamily: 'inherit',
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#fef2f2'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <LogOut size={18} />
                Sair
              </button>
            </div>
          )}
        </div>
      </header>

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  )
}