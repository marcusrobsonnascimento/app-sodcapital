'use client'

import { useState } from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { usePanels } from '@/contexts/PanelContext'
import { getPageInfo } from '@/lib/pageRegistry'
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
  ChevronDown,
  ChevronRight,
  Landmark,
  ListTree,
  Receipt
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
      { title: 'Conciliação', icon: GitCompare, href: '/financeiro/conciliacao' },
      { 
        title: 'Movimentação Bancária', 
        icon: Landmark,
        children: [
          { title: 'Movimentos', icon: DollarSign, href: '/financeiro/movimentos' },
          { title: 'Transferências', icon: GitCompare, href: '/financeiro/transferencias' },
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
      { title: 'CRI', icon: FileSignature, href: '/contratos/cri' }
    ]
  }
]

export default function SideBar() {
  const pathname = usePathname()
  const { panels, openPanel } = usePanels()
  const [expandedItems, setExpandedItems] = useState<string[]>(['Cadastros', 'Financeiro'])
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)

  const toggleExpand = (title: string) => {
    setExpandedItems(prev =>
      prev.includes(title)
        ? prev.filter(item => item !== title)
        : [...prev, title]
    )
  }

  // Handler para clique em item do menu
  const handleMenuClick = (href: string, title: string, e: React.MouseEvent) => {
    e.preventDefault()
    
    // Verificar se a página está registrada
    const pageInfo = getPageInfo(href)
    if (!pageInfo) {
      console.warn(`Página não registrada: ${href}`)
      return
    }

    // Ctrl+Click ou Clique com botão do meio = novo painel
    const forceNew = e.ctrlKey || e.metaKey || e.button === 1
    openPanel(href, title, forceNew)
  }

  // Verificar se uma rota está ativa em algum painel
  const isRouteActive = (href: string): boolean => {
    return panels.some(p => p.route === href)
  }

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    const Icon = item.icon
    const isExpanded = expandedItems.includes(item.title)
    const isActive = item.href ? isRouteActive(item.href) : false
    const hasChildren = item.children && item.children.length > 0
    const isHovered = hoveredItem === item.title

    if (hasChildren) {
      return (
        <div key={item.title} style={{ marginBottom: '0.25rem' }}>
          <button
            onClick={() => toggleExpand(item.title)}
            onMouseEnter={() => setHoveredItem(item.title)}
            onMouseLeave={() => setHoveredItem(null)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: level > 0 ? '0.5rem 0.75rem' : '0.625rem 0.75rem',
              borderRadius: '8px',
              backgroundColor: isHovered || isExpanded ? '#f3f4f6' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontFamily: 'inherit'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Icon 
                size={level > 0 ? 18 : 20} 
                style={{ 
                  color: isExpanded ? '#1555D6' : '#6b7280',
                  transition: 'color 0.2s ease'
                }} 
              />
              <span 
                style={{ 
                  fontSize: level > 0 ? '0.8125rem' : '0.875rem',
                  fontWeight: '500',
                  color: '#374151',
                  transition: 'color 0.2s ease'
                }}
              >
                {item.title}
              </span>
            </div>
            {isExpanded ? (
              <ChevronDown size={16} style={{ color: '#1555D6' }} />
            ) : (
              <ChevronRight size={16} style={{ color: '#9ca3af' }} />
            )}
          </button>
          
          {isExpanded && (
            <div 
              style={{ 
                marginLeft: level > 0 ? '0.75rem' : '1rem',
                marginTop: '0.25rem',
                paddingLeft: '0.75rem',
                borderLeft: '2px solid #e5e7eb',
                animation: 'slideDown 0.2s ease-out'
              }}
            >
              {item.children.map(child => renderMenuItem(child, level + 1))}
            </div>
          )}
        </div>
      )
    }

    return (
      <a
        key={item.href}
        href={item.href!}
        onClick={(e) => handleMenuClick(item.href!, item.title, e)}
        onMouseDown={(e) => {
          // Capturar clique do botão do meio
          if (e.button === 1) {
            e.preventDefault()
            handleMenuClick(item.href!, item.title, e)
          }
        }}
        onMouseEnter={() => setHoveredItem(item.title)}
        onMouseLeave={() => setHoveredItem(null)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: level > 0 ? '0.5rem 0.75rem' : '0.625rem 0.75rem',
          borderRadius: '8px',
          backgroundColor: isActive ? '#1555D6' : isHovered ? '#f3f4f6' : 'transparent',
          textDecoration: 'none',
          transition: 'all 0.2s ease',
          marginBottom: '0.25rem',
          position: 'relative'
        }}
        title={`Clique para abrir • Ctrl+Clique para novo painel`}
      >
        <Icon 
          size={level > 0 ? 18 : 20}
          style={{ 
            color: isActive ? '#ffffff' : '#6b7280',
            transition: 'color 0.2s ease'
          }} 
        />
        <span 
          style={{ 
            fontSize: level > 0 ? '0.8125rem' : '0.875rem',
            fontWeight: '500',
            color: isActive ? '#ffffff' : '#374151',
            transition: 'color 0.2s ease',
            flex: 1
          }}
        >
          {item.title}
        </span>
        
        {/* Indicador de página aberta em outro painel */}
        {isActive && !panels.find(p => p.route === item.href)?.isActive && (
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            opacity: 0.7
          }} />
        )}
      </a>
    )
  }

  return (
    <aside 
      style={{
        width: '280px',
        height: '100vh',
        backgroundColor: '#ffffff',
        borderRight: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0
      }}
    >
      {/* Logo/Header */}
      <div 
        style={{
          padding: '1.5rem',
          borderBottom: '1px solid #f3f4f6'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.25rem' }}>
          <Image
            src="/sodcapital-logo.png"
            alt="SodCapital"
            width={150}
            height={45}
            style={{ width: 'auto', height: 'auto' }}
            priority
          />
        </div>
        <p 
          style={{ 
            fontSize: '0.75rem',
            color: '#6b7280',
            fontWeight: '500',
            textAlign: 'center'
          }}
        >
          ERP Financeiro
        </p>
      </div>

      {/* Dica de uso */}
      <div style={{
        padding: '8px 16px',
        backgroundColor: '#f0f9ff',
        borderBottom: '1px solid #e0f2fe',
        fontSize: '11px',
        color: '#0369a1',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <span style={{ fontSize: '14px' }}>💡</span>
        <span><strong>Ctrl+Clique</strong> abre em novo painel</span>
      </div>

      {/* Menu Navigation */}
      <nav 
        id="sidebar-nav"
        style={{
          flex: '1',
          overflowY: 'auto',
          padding: '1rem',
          scrollBehavior: 'smooth'
        }}
      >
        <style>{`
          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translateY(-5px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          #sidebar-nav::-webkit-scrollbar {
            width: 6px;
          }

          #sidebar-nav::-webkit-scrollbar-track {
            background: transparent;
          }

          #sidebar-nav::-webkit-scrollbar-thumb {
            background: #e5e7eb;
            border-radius: 3px;
          }

          #sidebar-nav::-webkit-scrollbar-thumb:hover {
            background: #d1d5db;
          }
        `}</style>
        {menuItems.map(item => renderMenuItem(item))}
      </nav>

      {/* Footer */}
      <div 
        style={{
          padding: '1rem',
          borderTop: '1px solid #f3f4f6',
          textAlign: 'center'
        }}
      >
        <p 
          style={{ 
            fontSize: '0.6875rem',
            color: '#9ca3af',
            fontWeight: '500'
          }}
        >
          © 2025 SodCapital
        </p>
      </div>
    </aside>
  )
}