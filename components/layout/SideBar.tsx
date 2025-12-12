'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { usePanels } from '@/contexts/PanelContext'
import { getPageInfo } from '@/lib/pageRegistry'
import { supabase } from '@/lib/supabaseClient'
import {
  LayoutDashboard,
  Building2,
  FolderKanban,
  CreditCard,
  Users,
  FileText,
  DollarSign,
  GitCompare,
  BarChart3,
  FileBarChart,
  TrendingUp,
  PieChart,
  FileSignature,
  ChevronRight,
  Landmark,
  ListTree,
  Receipt,
  LogOut,
  User,
  Home,
  Calendar,
  Bell,
  Percent,
  FilePlus,
  List,
  RefreshCw,
  AlertCircle,
  Calculator
} from 'lucide-react'

type MenuItem = {
  title: string
  icon: any
  href?: string
  children?: MenuItem[]
}

const menuItems: MenuItem[] = [
  {
    title: 'Dashboard',
    icon: LayoutDashboard,
    href: '/dashboard'
  },
  {
    title: 'Cadastros',
    icon: Building2,
    children: [
      { title: 'Empresas', icon: Building2, href: '/cadastros/empresas' },
      { title: 'Projetos', icon: FolderKanban, href: '/cadastros/projetos' },
      { title: 'Plano de Contas', icon: ListTree, href: '/cadastros/plano-contas' },
      { title: 'Bancos', icon: Landmark, href: '/cadastros/bancos' },
      { title: 'Contas Bancárias', icon: CreditCard, href: '/cadastros/bancos-contas' },
      { title: 'Contrapartes', icon: Users, href: '/cadastros/contrapartes' }
    ]
  },
  {
    title: 'Modelos',
    icon: FileSignature,
    href: '/modelos'
  },
  {
    title: 'Financeiro',
    icon: DollarSign,
    children: [
      { title: 'Lançamentos', icon: DollarSign, href: '/financeiro/lancamentos' },
      { title: 'Baixar Pagamentos', icon: Receipt, href: '/financeiro/baixarpgtos' },
      { 
        title: 'Movimentação Bancária', 
        icon: Landmark,
        children: [
          { title: 'Movimentos', icon: DollarSign, href: '/financeiro/movimentos' },
          { title: 'Transferências', icon: GitCompare, href: '/financeiro/transferencias' },
          { title: 'Conciliação', icon: GitCompare, href: '/financeiro/movimentos/conciliacao' },
          { title: 'Fechamento Diário', icon: FileSignature, href: '/financeiro/fechamento' },
          { title: 'Extrato de Conta', icon: FileText, href: '/financeiro/extrato' }
        ]
      }
    ]
  },
  {
    title: 'Relatórios Financeiros',
    icon: BarChart3,
    children: [
      { title: 'Fluxo de Caixa Projetado', icon: TrendingUp, href: '/relatorios/fluxo' },
      { 
        title: 'Fluxo de Caixa Realizado', 
        icon: TrendingUp,
        children: [
          { title: 'Anual Realizado', icon: TrendingUp, href: '/relatorios/fluxorealizado/realizado' },
          { title: 'Mensal Realizado', icon: TrendingUp, href: '/relatorios/fluxorealizado/mensal' }
        ]
      },
    ]
  },
  {
    title: 'Relatórios Controladoria',
    icon: FileBarChart,
    children: [
      { title: 'DRE', icon: FileBarChart, href: '/relatorios/dre' },
      { title: 'Painel de PL', icon: PieChart, href: '/relatorios/pl' }
    ]
  },
  {
    title: 'Contratos',
    icon: FileSignature,
    children: [
      { title: 'Mútuos', icon: FileSignature, href: '/contratos/mutuos' },
      { title: 'CRI', icon: FileSignature, href: '/contratos/cri' },
      { 
        title: 'Locação Imobiliária', 
        icon: Home,
        children: [
          { title: 'Contratos', icon: List, href: '/contratos/locacao' },
          { title: 'Novo Contrato', icon: FilePlus, href: '/contratos/locacao/novo' },
          { title: 'Parcelas', icon: Calendar, href: '/contratos/locacao/parcelas' },
          { title: 'Reajustes', icon: Percent, href: '/contratos/locacao/reajustes' },
          { title: 'Alertas', icon: Bell, href: '/contratos/locacao/alertas' },
          { title: 'Índices Econômicos', icon: Calculator, href: '/contratos/locacao/indices' }
        ]
      }
    ]
  }
]

// Componente de Submenu usando Portal
function SubmenuPortal({ 
  children, 
  position, 
  onMouseEnter, 
  onMouseLeave 
}: { 
  children: React.ReactNode
  position: { top: number; left: number }
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [adjustedPosition, setAdjustedPosition] = useState(position)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  useEffect(() => {
    if (mounted && menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect()
      const windowHeight = window.innerHeight
      const windowWidth = window.innerWidth
      
      let newTop = position.top
      let newLeft = position.left
      
      // Verificar se estoura embaixo
      if (position.top + menuRect.height > windowHeight - 20) {
        // Posicionar para cima
        newTop = Math.max(20, windowHeight - menuRect.height - 20)
      }
      
      // Verificar se estoura à direita
      if (position.left + menuRect.width > windowWidth - 20) {
        newLeft = position.left - menuRect.width - 8
      }
      
      setAdjustedPosition({ top: newTop, left: newLeft })
    }
  }, [mounted, position])

  if (!mounted) return null

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: adjustedPosition.top,
        left: adjustedPosition.left,
        zIndex: 9999,
        animation: 'slideRight 0.15s ease-out'
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e5e7eb',
          padding: '6px',
          minWidth: '200px'
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

export default function SideBar() {
  const router = useRouter()
  const { panels, openPanel } = usePanels()
  const [user, setUser] = useState<any>(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)
  const [openSubSubmenu, setOpenSubSubmenu] = useState<string | null>(null)
  const [submenuPosition, setSubmenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [subSubmenuPosition, setSubSubmenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })

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

  // Handler para clique em item do menu
  const handleMenuClick = (href: string, title: string, e: React.MouseEvent) => {
    e.preventDefault()
    
    const pageInfo = getPageInfo(href)
    if (!pageInfo) {
      console.warn(`Página não registrada: ${href}`)
      return
    }

    const forceNew = e.ctrlKey || e.metaKey || e.button === 1
    openPanel(href, title, forceNew)
    
    // Fechar submenus após clicar
    setOpenSubmenu(null)
    setOpenSubSubmenu(null)
  }

  // Verificar se uma rota está ativa em algum painel
  const isRouteActive = (href: string): boolean => {
    return panels.some(p => p.route === href)
  }

  // Handlers para submenu com delay
  const handleSubmenuEnter = (title: string, element: HTMLElement) => {
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current)
    }
    
    // Calcular posição do submenu
    const rect = element.getBoundingClientRect()
    setSubmenuPosition({
      top: rect.top,
      left: rect.right + 4
    })
    setOpenSubmenu(title)
  }

  const handleSubmenuLeave = () => {
    submenuTimeoutRef.current = setTimeout(() => {
      setOpenSubmenu(null)
      setOpenSubSubmenu(null)
    }, 150)
  }

  const handleSubmenuStay = () => {
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current)
    }
  }

  const handleSubSubmenuEnter = (title: string, element: HTMLElement) => {
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current)
    }
    
    const rect = element.getBoundingClientRect()
    setSubSubmenuPosition({
      top: rect.top,
      left: rect.right + 4
    })
    setOpenSubSubmenu(title)
  }

  // Renderizar itens do submenu
  const renderSubmenuItems = (children: MenuItem[], isSubLevel: boolean = false) => {
    return children.map((child) => {
      const ChildIcon = child.icon
      const hasChildren = child.children && child.children.length > 0
      const isActive = child.href ? isRouteActive(child.href) : false
      const isSubOpen = openSubSubmenu === child.title

      if (hasChildren) {
        return (
          <div
            key={child.title}
            style={{ position: 'relative' }}
            onMouseEnter={(e) => handleSubSubmenuEnter(child.title, e.currentTarget)}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                backgroundColor: isSubOpen ? '#f3f4f6' : 'transparent',
                transition: 'background-color 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isSubOpen ? '#f3f4f6' : 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ChildIcon size={16} style={{ color: '#6b7280' }} />
                <span style={{ fontSize: '13px', color: '#374151', fontWeight: '500' }}>
                  {child.title}
                </span>
              </div>
              <ChevronRight size={14} style={{ color: '#9ca3af' }} />
            </div>

            {/* Sub-submenu Portal */}
            {isSubOpen && child.children && (
              <SubmenuPortal
                position={subSubmenuPosition}
                onMouseEnter={handleSubmenuStay}
                onMouseLeave={handleSubmenuLeave}
              >
                {renderSubmenuItems(child.children, true)}
              </SubmenuPortal>
            )}
          </div>
        )
      }

      return (
        <a
          key={child.title}
          href={child.href}
          onClick={(e) => handleMenuClick(child.href!, child.title, e)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 10px',
            borderRadius: '6px',
            textDecoration: 'none',
            backgroundColor: isActive ? '#eff6ff' : 'transparent',
            transition: 'background-color 0.15s ease'
          }}
          onMouseEnter={(e) => {
            if (!isActive) e.currentTarget.style.backgroundColor = '#f3f4f6'
          }}
          onMouseLeave={(e) => {
            if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <ChildIcon 
            size={16} 
            style={{ 
              color: isActive ? '#2563eb' : '#6b7280'
            }} 
          />
          <span 
            style={{ 
              fontSize: '13px',
              color: isActive ? '#2563eb' : '#374151',
              fontWeight: isActive ? '600' : '500'
            }}
          >
            {child.title}
          </span>
        </a>
      )
    })
  }

  // Renderizar item do menu principal
  const renderMenuItem = (item: MenuItem) => {
    const Icon = item.icon
    const hasChildren = item.children && item.children.length > 0
    const isActive = item.href ? isRouteActive(item.href) : false
    const isHovered = hoveredItem === item.title
    const isSubmenuOpen = openSubmenu === item.title

    if (hasChildren) {
      return (
        <div
          key={item.title}
          style={{ marginBottom: '4px' }}
          onMouseEnter={(e) => {
            setHoveredItem(item.title)
            handleSubmenuEnter(item.title, e.currentTarget)
          }}
          onMouseLeave={() => {
            setHoveredItem(null)
            handleSubmenuLeave()
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              backgroundColor: isSubmenuOpen ? '#f3f4f6' : 'transparent',
              transition: 'background-color 0.15s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isSubmenuOpen ? '#f3f4f6' : 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Icon size={18} style={{ color: '#6b7280' }} />
              <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                {item.title}
              </span>
            </div>
            <ChevronRight 
              size={16} 
              style={{ 
                color: '#9ca3af',
                transition: 'transform 0.2s ease',
                transform: isSubmenuOpen ? 'rotate(90deg)' : 'rotate(0deg)'
              }} 
            />
          </div>

          {/* Submenu Portal */}
          {isSubmenuOpen && item.children && (
            <SubmenuPortal
              position={submenuPosition}
              onMouseEnter={handleSubmenuStay}
              onMouseLeave={handleSubmenuLeave}
            >
              {renderSubmenuItems(item.children)}
            </SubmenuPortal>
          )}
        </div>
      )
    }

    return (
      <a
        key={item.title}
        href={item.href}
        onClick={(e) => handleMenuClick(item.href!, item.title, e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 12px',
          marginBottom: '4px',
          borderRadius: '8px',
          textDecoration: 'none',
          backgroundColor: isActive ? '#eff6ff' : 'transparent',
          transition: 'background-color 0.15s ease'
        }}
        onMouseEnter={(e) => {
          setHoveredItem(item.title)
          if (!isActive) e.currentTarget.style.backgroundColor = '#f3f4f6'
        }}
        onMouseLeave={(e) => {
          setHoveredItem(null)
          if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        <Icon 
          size={18} 
          style={{ 
            color: isActive ? '#2563eb' : '#6b7280'
          }} 
        />
        <span 
          style={{ 
            fontSize: '14px',
            fontWeight: isActive ? '600' : '500',
            color: isActive ? '#2563eb' : '#374151'
          }}
        >
          {item.title}
        </span>
      </a>
    )
  }

  return (
    <>
      {/* Estilos de animação */}
      <style>{`
        @keyframes slideRight {
          from {
            opacity: 0;
            transform: translateX(-8px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>

      <aside
        style={{
          width: '260px',
          height: '100vh',
          backgroundColor: '#ffffff',
          borderRight: '1px solid #f3f4f6',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          overflow: 'hidden'
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #f3f4f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Image
            src="/logo.png"
            alt="SOD Capital"
            width={140}
            height={50}
            style={{ objectFit: 'contain' }}
            priority
          />
        </div>

        {/* Tip Bar */}
        <div style={{
          padding: '8px 12px',
          margin: '8px 12px 0',
          borderRadius: '6px',
          backgroundColor: '#f0f9ff',
          borderBottom: '1px solid #e0f2fe',
          fontSize: '11px',
          color: '#0369a1',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span style={{ fontSize: '13px' }}>💡</span>
          <span><strong>Ctrl+Clique</strong> abre em novo painel</span>
        </div>

        {/* Menu Navigation */}
        <nav 
          id="sidebar-nav"
          style={{
            flex: '1',
            overflowY: 'auto',
            padding: '12px',
            scrollBehavior: 'smooth'
          }}
        >
          {menuItems.map(item => renderMenuItem(item))}
        </nav>

        {/* Footer com usuário */}
        <div 
          ref={userMenuRef}
          style={{
            padding: '12px',
            borderTop: '1px solid #f3f4f6',
            position: 'relative'
          }}
        >
          {/* Botão do usuário */}
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '8px',
              backgroundColor: showUserMenu ? '#f3f4f6' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
              fontFamily: 'inherit'
            }}
            onMouseEnter={(e) => {
              if (!showUserMenu) e.currentTarget.style.backgroundColor = '#f9fafb'
            }}
            onMouseLeave={(e) => {
              if (!showUserMenu) e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <div 
              style={{
                width: '36px',
                height: '36px',
                backgroundColor: '#1555D6',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <User size={18} style={{ color: '#ffffff' }} />
            </div>
            <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
              <p 
                style={{ 
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#374151',
                  margin: 0,
                  lineHeight: '1.3',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {user?.email?.split('@')[0] || 'Usuário'}
              </p>
              <p 
                style={{ 
                  fontSize: '11px',
                  color: '#6b7280',
                  margin: 0,
                  lineHeight: '1.3'
                }}
              >
                CEO
              </p>
            </div>
            <ChevronRight 
              size={16} 
              style={{ 
                color: '#9ca3af',
                transform: showUserMenu ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
                flexShrink: 0
              }} 
            />
          </button>

          {/* Menu dropdown do usuário (usando Portal) */}
          {showUserMenu && (
            <UserMenuPortal userMenuRef={userMenuRef} onClose={() => setShowUserMenu(false)}>
              {/* User Info */}
              <div 
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid #f3f4f6',
                  marginBottom: '6px'
                }}
              >
                <p 
                  style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#111827',
                    margin: '0 0 2px 0'
                  }}
                >
                  {user?.email?.split('@')[0] || 'Usuário'}
                </p>
                <p 
                  style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    margin: 0,
                    wordBreak: 'break-all'
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
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#dc2626',
                  fontWeight: '500',
                  transition: 'background-color 0.15s ease',
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
                <LogOut size={16} />
                Sair
              </button>
            </UserMenuPortal>
          )}

          {/* Copyright */}
          <p 
            style={{ 
              fontSize: '10px',
              color: '#9ca3af',
              fontWeight: '500',
              textAlign: 'center',
              marginTop: '10px',
              marginBottom: 0
            }}
          >
            © 2025 SodCapital
          </p>
        </div>
      </aside>
    </>
  )
}

// Componente Portal para menu do usuário
function UserMenuPortal({ 
  children, 
  userMenuRef,
  onClose
}: { 
  children: React.ReactNode
  userMenuRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    
    if (userMenuRef.current) {
      const rect = userMenuRef.current.getBoundingClientRect()
      setPosition({
        top: rect.top - 100,
        left: rect.right + 8
      })
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        userMenuRef.current && 
        !userMenuRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        onClose()
      }
    }

    // Delay para evitar fechar imediatamente
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)

    return () => {
      setMounted(false)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [userMenuRef, onClose])

  if (!mounted) return null

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 9999,
        animation: 'slideRight 0.15s ease-out'
      }}
    >
      <div
        style={{
          width: '220px',
          backgroundColor: '#ffffff',
          borderRadius: '10px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          border: '1px solid #e5e7eb',
          padding: '8px'
        }}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}