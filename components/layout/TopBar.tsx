'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { LogOut, User, Calendar, Building2, FolderKanban } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export default function TopBar() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  
  // Filtros globais
  const [periodo, setPeriodo] = useState<string>('mes')
  const [empresaId, setEmpresaId] = useState<string>('')
  const [projetoId, setProjetoId] = useState<string>('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="h-16 bg-white border-b border-border px-6 flex items-center justify-between">
      {/* Filtros Globais */}
      <div className="flex items-center gap-4">
        {/* Período */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray" />
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="text-sm border border-input rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
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
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-gray" />
          <select
            value={empresaId}
            onChange={(e) => setEmpresaId(e.target.value)}
            className="text-sm border border-input rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todas as Empresas</option>
            {/* Será populado dinamicamente */}
          </select>
        </div>

        {/* Projeto */}
        <div className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-gray" />
          <select
            value={projetoId}
            onChange={(e) => setProjetoId(e.target.value)}
            className="text-sm border border-input rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todos os Projetos</option>
            {/* Será populado dinamicamente */}
          </select>
        </div>
      </div>

      {/* User Menu */}
      <div className="relative">
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-muted transition"
        >
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <User className="h-4 w-4 text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-700">
              {user?.email?.split('@')[0] || 'Usuário'}
            </p>
            <p className="text-xs text-gray">CEO</p>
          </div>
        </button>

        {showUserMenu && (
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-border py-2 z-50">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-muted transition"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
