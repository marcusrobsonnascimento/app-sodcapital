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
import { cn } from '@/lib/utils'

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

    if (hasChildren) {
      return (
        <div key={item.title}>
          <button
            onClick={() => toggleExpand(item.title)}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors",
              level === 0 ? "hover:bg-muted" : "hover:bg-gray-100",
              isExpanded && "bg-muted"
            )}
          >
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5 text-gray" />
              <span className="text-sm font-medium text-gray-700">{item.title}</span>
            </div>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray" />
            )}
          </button>
          {isExpanded && (
            <div className="ml-4 mt-1 space-y-1">
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
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
          isActive
            ? "bg-primary text-white"
            : "hover:bg-muted text-gray-700",
          level > 0 && "text-sm"
        )}
      >
        <Icon className={cn("h-5 w-5", isActive ? "text-white" : "text-gray")} />
        <span className="font-medium">{item.title}</span>
      </Link>
    )
  }

  return (
    <aside className="w-64 h-screen bg-white border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <h1 className="text-2xl font-bold text-primary">SodCapital</h1>
        <p className="text-xs text-gray mt-1">ERP Financeiro</p>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {menuItems.map(item => renderMenuItem(item))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <p className="text-xs text-gray text-center">
          © 2025 SodCapital
        </p>
      </div>
    </aside>
  )
}
