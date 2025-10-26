'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  ChevronRight
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
    href: '/'
  },
  {
    title: 'Cadastros',
    icon: Building2,
    children: [
      { title: 'Empresas', icon: Building2, href: '/cadastros/empresas' },
      { title: 'Projetos', icon: FolderKanban, href: '/cadastros/projetos' },
      { title: 'Contas Bancárias', icon: CreditCard, href: '/cadastros/bancos-contas' },
      { title: 'Contrapartes', icon: Users, href: '/cadastros/contrapartes' }
    ]
  },
  {
    title: 'Plano de Contas',
    icon: FileText,
    children: [
      { title: 'Tipos', icon: FileText, href: '/plano-contas/tipos' },
      { title: 'Grupos', icon: FileText, href: '/plano-contas/grupos' },
      { title: 'Categorias', icon: FileText, href: '/plano-contas/categorias' },
      { title: 'Subcategorias', icon: FileText, href: '/plano-contas/subcategorias' }
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
      { title: 'Conciliação', icon: GitCompare, href: '/financeiro/conciliacao' }
    ]
  },
  {
    title: 'Relatórios',
    icon: BarChart3,
    children: [
      { title: 'DRE', icon: FileBarChart, href: '/relatorios/dre' },
      { title: 'Fluxo de Caixa', icon: TrendingUp, href: '/relatorios/fluxo' },
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
  const [expandedItems, setExpandedItems] = useState<string[]>(['Cadastros'])
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)

  const toggleExpand = (title: string) => {
    setExpandedItems(prev =>
      prev.includes(title)
        ? prev.filter(item => item !== title)
        : [...prev, title]
    )
  }

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    const Icon = item.icon
    const isExpanded = expandedItems.includes(item.title)
    const isActive = item.href === pathname
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
              padding: '0.625rem 0.75rem',
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
                size={20} 
                style={{ 
                  color: isExpanded ? '#1555D6' : '#6b7280',
                  transition: 'color 0.2s ease'
                }} 
              />
              <span 
                style={{ 
                  fontSize: '0.875rem',
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
                marginLeft: '1rem',
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
      <Link
        key={item.href}
        href={item.href!}
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
          marginBottom: '0.25rem'
        }}
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
            transition: 'color 0.2s ease'
          }}
        >
          {item.title}
        </span>
      </Link>
    )
  }

  return (
    <>
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
          <h1 
            style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              color: '#1555D6',
              marginBottom: '0.25rem',
              letterSpacing: '0.3px'
            }}
          >
            SODCAPITAL
          </h1>
          <p 
            style={{ 
              fontSize: '0.75rem',
              color: '#6b7280',
              fontWeight: '500'
            }}
          >
            ERP Financeiro
          </p>
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

        /* Scrollbar customizada para o menu */
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
    </>
  )
}