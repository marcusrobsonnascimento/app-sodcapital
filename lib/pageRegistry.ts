// Registro de páginas disponíveis para os painéis
// Mapeia rotas para imports dinâmicos dos componentes

import dynamic from 'next/dynamic'
import { ComponentType } from 'react'

// Tipo para o registro
export interface PageInfo {
  title: string
  component: ComponentType<any>
}

// Registro de todas as páginas
// Adicione novas páginas aqui conforme necessário
export const pageRegistry: Record<string, PageInfo> = {
  // Dashboard
  '/dashboard': {
    title: 'Dashboard',
    component: dynamic(() => import('@/app/dashboard/page'))
  },

  // Cadastros
  '/cadastros/empresas': {
    title: 'Empresas',
    component: dynamic(() => import('@/app/cadastros/empresas/page'))
  },
  '/cadastros/projetos': {
    title: 'Projetos',
    component: dynamic(() => import('@/app/cadastros/projetos/page'))
  },
  '/cadastros/plano-contas': {
    title: 'Plano de Contas',
    component: dynamic(() => import('@/app/cadastros/plano-contas/page'))
  },
  '/cadastros/bancos': {
    title: 'Bancos',
    component: dynamic(() => import('@/app/cadastros/bancos/page'))
  },
  '/cadastros/bancos-contas': {
    title: 'Contas Bancárias',
    component: dynamic(() => import('@/app/cadastros/bancos-contas/page'))
  },
  '/cadastros/contrapartes': {
    title: 'Contrapartes',
    component: dynamic(() => import('@/app/cadastros/contrapartes/page'))
  },

  // Financeiro
  '/financeiro/lancamentos': {
    title: 'Lançamentos',
    component: dynamic(() => import('@/app/financeiro/lancamentos/page'))
  },
  '/financeiro/baixarpgtos': {
    title: 'Baixar Pagamentos',
    component: dynamic(() => import('@/app/financeiro/baixarpgtos/page'))
  },
  '/financeiro/movimentos': {
    title: 'Movimentos',
    component: dynamic(() => import('@/app/financeiro/movimentos/page'))
  },
  '/financeiro/transferencias': {
    title: 'Transferências',
    component: dynamic(() => import('@/app/financeiro/transferencias/page'))
  },
  '/financeiro/fechamento': {
    title: 'Fechamento Diário',
    component: dynamic(() => import('@/app/financeiro/fechamento/page'))
  },
  '/financeiro/extrato': {
    title: 'Extrato de Conta',
    component: dynamic(() => import('@/app/financeiro/extrato/page'))
  },
  '/financeiro/movimentos/conciliacao': {
    title: 'Conciliação',
    component: dynamic(() => import('@/app/financeiro/movimentos/conciliacao/page'))
  },

  // Relatórios Financeiros
  '/relatorios/fluxo': {
    title: 'Fluxo de Caixa Projetado',
    component: dynamic(() => import('@/app/relatorios/fluxo/page'))
  },
  '/relatorios/fluxorealizado/realizado': {
    title: 'Fluxo Anual Realizado',
    component: dynamic(() => import('@/app/relatorios/fluxorealizado/realizado/page'))
  },

  // Relatórios Controladoria
  '/relatorios/dre': {
    title: 'DRE',
    component: dynamic(() => import('@/app/relatorios/dre/page'))
  },
  '/relatorios/pl': {
    title: 'Painel de PL',
    component: dynamic(() => import('@/app/relatorios/pl/page'))
  },

  // Contratos
  '/contratos/mutuos': {
    title: 'Mútuos',
    component: dynamic(() => import('@/app/contratos/mutuos/page'))
  },
  '/contratos/cri': {
    title: 'CRI',
    component: dynamic(() => import('@/app/contratos/cri/page'))
  },

  // Contratos de Locação Imobiliária
  '/contratos/locacao': {
    title: 'Contratos de Locação',
    component: dynamic(() => import('@/app/contratos/locacao/page'))
  },
  '/contratos/locacao/novo': {
    title: 'Novo Contrato de Locação',
    component: dynamic(() => import('@/app/contratos/locacao/novo/page'))
  },
  '/contratos/locacao/parcelas': {
    title: 'Parcelas de Locação',
    component: dynamic(() => import('@/app/contratos/locacao/parcelas/page'))
  },
  '/contratos/locacao/reajustes': {
    title: 'Reajustes de Locação',
    component: dynamic(() => import('@/app/contratos/locacao/reajustes/page'))
  },
  '/contratos/locacao/alertas': {
    title: 'Alertas de Contratos',
    component: dynamic(() => import('@/app/contratos/locacao/alertas/page'))
  },
  '/contratos/locacao/indices': {
    title: 'Índices Econômicos',
    component: dynamic(() => import('@/app/contratos/locacao/indices/page'))
  }
}

// Função auxiliar para obter info da página
export function getPageInfo(route: string): PageInfo | null {
  return pageRegistry[route] || null
}

// Função para verificar se uma rota está registrada
export function isRouteRegistered(route: string): boolean {
  return route in pageRegistry
}