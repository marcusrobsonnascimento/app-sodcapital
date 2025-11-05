// Types atualizados para lançamentos - pós migração para plano de contas unificado

export type TipoLancamento = 'Entrada' | 'Saida'
export type StatusLancamento = 'ABERTO' | 'PAGO_RECEBIDO' | 'CANCELADO'

export interface Retencao {
  id?: string
  lancamento_id?: string
  imposto: string
  valor: number
  valorFormatado?: string // Para uso no form
  detalhe: string | null
}

export interface Lancamento {
  id: string
  tipo: TipoLancamento // NOVO: Entrada ou Saída
  empresa_id: string
  projeto_id: string | null
  banco_conta_id: string | null
  contraparte_id: string | null
  plano_conta_id: string // NOVO: substituiu tipo_id, grupo_id, categoria_id, subcategoria_id
  valor_bruto: number
  valor_liquido: number
  data_emissao: string | null
  data_vencimento: string
  data_liquidacao: string | null
  status: StatusLancamento
  documento_tipo: string | null
  documento_numero: string | null
  observacoes: string | null
  sentido?: TipoLancamento // Derivado do plano_conta
  created_at: string
  org_id: string
  
  // Joins para exibição
  empresa_nome?: string
  projeto_nome?: string
  contraparte_nome?: string
  plano_conta?: {
    codigo_conta: string
    categoria: string
    subcategoria: string
    tipo_fluxo: string
    sentido: TipoLancamento | null
  }
  retencoes?: Retencao[]
}

export interface LancamentoForm {
  tipo: TipoLancamento
  empresa_id: string
  projeto_id: string
  banco_conta_id: string
  contraparte_id: string
  plano_conta_id: string // NOVO
  valor_bruto: number
  data_emissao: string
  data_vencimento: string
  documento_tipo?: string
  documento_numero?: string
  observacoes?: string
}

// Helpers
export const IMPOSTOS = [
  { value: 'IRRF', label: 'IRRF' },
  { value: 'INSS', label: 'INSS' },
  { value: 'ISSQN', label: 'ISSQN' },
  { value: 'PIS', label: 'PIS' },
  { value: 'COFINS', label: 'COFINS' },
  { value: 'CSLL', label: 'CSLL' },
  { value: 'OUTRO', label: 'Outro' }
] as const

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

export function formatCurrencyInput(value: string): string {
  const numbers = value.replace(/\D/g, '')
  if (!numbers) return ''
  const amount = parseInt(numbers, 10) / 100
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

export function parseCurrencyInput(value: string): number {
  if (!value) return 0
  const cleaned = value.replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

export function formatDateForInput(date: string | null): string {
  if (!date) return ''
  return date.split('T')[0]
}