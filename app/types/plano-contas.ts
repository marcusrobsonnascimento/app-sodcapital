// Types para o novo schema unificado de plano de contas de fluxo

export type TipoFluxo = 'Operacional' | 'Investimento' | 'Financiamento'
export type Sentido = 'Entrada' | 'Saida'

export interface PlanoContaFluxo {
  id: string
  codigo_conta: string // Ex: '1.03.02.01'
  tipo_fluxo: TipoFluxo
  grupo: string | null
  categoria: string
  subcategoria: string
  dre_grupo?: string | null
  sentido: Sentido | null // Derivado do prefixo do código
  ativo: boolean
  created_at: string
  updated_at: string
  // org_id não vem do front (RLS)
}

export interface PlanoContaFluxoForm {
  codigo_conta: string
  tipo_fluxo: TipoFluxo
  grupo?: string
  categoria: string
  subcategoria: string
  dre_grupo?: string
  ativo: boolean
}

// Helper para derivar sentido do código
export function derivarSentidoDoCodigo(codigo: string): Sentido | null {
  const prefixo = codigo.charAt(0)
  
  // Convenção: códigos iniciados com 1 ou 3 = Entrada, 2 ou 4 = Saída
  // Ajuste conforme sua convenção contábil
  if (prefixo === '1' || prefixo === '3') return 'Entrada'
  if (prefixo === '2' || prefixo === '4') return 'Saida'
  
  return null
}

// Validar formato do código (ex: X.XX.XX.XX)
export function validarCodigoConta(codigo: string): boolean {
  const pattern = /^\d+(\.\d+)*$/
  return pattern.test(codigo)
}

// Helper para formatar código (garantir consistência)
export function formatarCodigoConta(codigo: string): string {
  return codigo.trim().replace(/\s+/g, '')
}