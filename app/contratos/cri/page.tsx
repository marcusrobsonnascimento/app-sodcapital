'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatCurrency } from '@/lib/utils'
import { 
  Plus, Pencil, Trash2, Search, CheckCircle, AlertTriangle, XCircle,
  Calendar, DollarSign, TrendingUp, FileText, Eye, Calculator,
  Download, CreditCard, Clock, Activity, PieChart as PieChartIcon, LineChart as LineChartIcon
} from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type ToastType = 'success' | 'warning' | 'error'
type IndiceType = 'CDI' | 'IPCA' | 'SELIC' | 'DI' | 'IGP-M' | 'OUTRO'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface CriEmissao {
  id: string
  org_id: string
  empresa_id: string
  serie: string
  indice: IndiceType
  spread_anual: number
  principal_inicial: number
  data_emissao: string
  data_vencimento_final: string | null
  contrato_numero: string | null
  observacoes: string | null
  created_at: string
  empresa?: { nome: string }
}

interface CriParcela {
  id: string
  org_id: string
  cri_id: string
  num_parcela: number
  data_vencimento: string
  valor_amortizacao: number
  valor_juros: number
  pago: boolean
  data_pagamento: string | null
  lancamento_id: string | null
}

interface CriEvento {
  id: string
  org_id: string
  cri_id: string
  data_evento: string
  tipo: string
  valor: number | null
  detalhe: string | null
}

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const criEmissaoSchema = z.object({
  empresa_id: z.string().min(1, 'Empresa é obrigatória'),
  serie: z.string().min(1, 'Série é obrigatória'),
  indice: z.enum(['CDI', 'IPCA', 'SELIC', 'DI', 'IGP-M', 'OUTRO']),
  spread_anual: z.number().min(0, 'Spread não pode ser negativo'),
  principal_inicial: z.number().min(0.01, 'Principal deve ser maior que zero'),
  data_emissao: z.string().min(1, 'Data de emissão é obrigatória'),
  data_vencimento_final: z.string().optional(),
  contrato_numero: z.string().optional(),
  observacoes: z.string().optional()
})

const gerarParcelasSchema = z.object({
  qtd_parcelas: z.number().int().min(1, 'Quantidade mínima é 1 parcela'),
  periodicidade: z.string().default('MENSAL'),
  substituir_futuras: z.boolean().default(false)
})

const eventoSchema = z.object({
  data_evento: z.string().min(1, 'Data do evento é obrigatória'),
  tipo: z.string().min(1, 'Tipo do evento é obrigatório'),
  valor: z.number().optional(),
  detalhe: z.string().optional()
})

const liquidarParcelaSchema = z.object({
  data_pagamento: z.string().min(1, 'Data de pagamento é obrigatória')
})

const gerarLancamentosSchema = z.object({
  intervalo: z.enum(['vencidas', 'proximas_30', 'todas']),
  subcategoria_amortizacao: z.string().min(1, 'Selecione a subcategoria para amortização'),
  subcategoria_juros: z.string().min(1, 'Selecione a subcategoria para juros'),
  conta_id: z.string().optional(),
  projeto_id: z.string().optional()
})

type CriEmissaoForm = z.infer<typeof criEmissaoSchema>
type GerarParcelasForm = z.infer<typeof gerarParcelasSchema>
type EventoForm = z.infer<typeof eventoSchema>
type LiquidarParcelaForm = z.infer<typeof liquidarParcelaSchema>
type GerarLancamentosForm = z.infer<typeof gerarLancamentosSchema>

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('pt-BR')
}

function formatDateInput(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toISOString().split('T')[0]
}

const integerFormatter = new Intl.NumberFormat('pt-BR')

function parseDecimalInput(value: string): number {
  if (!value) return 0
  const normalized = value.replace(/\./g, '').replace(',', '.')
  const parsed = parseFloat(normalized)
  return Number.isNaN(parsed) ? 0 : parsed
}

// Aplica máscara decimal pt-BR enquanto o usuário digita
function formatMaskedDecimalFromDigits(
  rawDigits: string,
  decimalPlaces: number,
  options: { useThousands?: boolean } = {}
) {
  const digits = rawDigits.replace(/\D/g, '')
  if (!digits) {
    return { display: '', value: 0 }
  }

  const padded = digits.padStart(decimalPlaces + 1, '0')
  const integerPart = decimalPlaces > 0 ? padded.slice(0, -decimalPlaces) : padded
  const decimalPart = decimalPlaces > 0 ? padded.slice(-decimalPlaces) : ''
  const normalizedInteger = integerPart.replace(/^0+/, '') || '0'
  const integerDisplay = options.useThousands
    ? integerFormatter.format(BigInt(normalizedInteger))
    : normalizedInteger

  const display =
    decimalPlaces > 0
      ? `${integerDisplay},${decimalPart}`
      : integerDisplay

  const numericString =
    decimalPlaces > 0
      ? `${integerPart || '0'}.${decimalPart}`
      : integerPart || '0'

  const numericValue = Number.parseFloat(numericString)

  return {
    display,
    value: Number.isNaN(numericValue) ? 0 : numericValue
  }
}

function formatDecimalDisplay(
  value: number | null | undefined,
  options: { min?: number; max?: number } = {}
): string {
  const minDigits = options.min ?? 2
  const maxDigits = options.max ?? minDigits
  if (value === null || value === undefined || Number.isNaN(value)) {
    return minDigits === 0 ? '0' : `0,${'0'.repeat(minDigits)}`
  }

  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits
  })
}

function calcularDiasAtraso(dataVencimento: string): number {
  const hoje = new Date()
  const vencimento = new Date(dataVencimento)
  const diff = hoje.getTime() - vencimento.getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

// Cálculo PRICE simplificado para CRI
function calcularParcelasPRICE(
  principalInicial: number,
  spreadAnual: number,
  qtdParcelas: number,
  dataEmissao: string
): CriParcela[] {
  const parcelas: CriParcela[] = []
  const taxaMensal = (spreadAnual / 12) / 100 // Taxa mensal decimal
  
  // PMT = P * i * (1 + i)^n / ((1 + i)^n - 1)
  const pmt = taxaMensal > 0
    ? principalInicial * taxaMensal * Math.pow(1 + taxaMensal, qtdParcelas) / (Math.pow(1 + taxaMensal, qtdParcelas) - 1)
    : principalInicial / qtdParcelas

  let saldoDevedor = principalInicial
  const dataEmissaoDate = new Date(dataEmissao)

  for (let i = 1; i <= qtdParcelas; i++) {
    // Calcular data de vencimento
    const dataVencimento = new Date(dataEmissaoDate)
    dataVencimento.setMonth(dataVencimento.getMonth() + i)

    // Calcular juros sobre saldo devedor
    const valorJuros = saldoDevedor * taxaMensal
    
    // Amortização é o que sobra da parcela fixa
    let valorAmortizacao = pmt - valorJuros
    
    // Ajuste para última parcela (fecha saldo devedor)
    if (i === qtdParcelas) {
      valorAmortizacao = saldoDevedor
    }
    
    saldoDevedor -= valorAmortizacao

    parcelas.push({
      id: '', // Será gerado no servidor
      org_id: '',
      cri_id: '',
      num_parcela: i,
      data_vencimento: dataVencimento.toISOString().split('T')[0],
      valor_amortizacao: Math.round(valorAmortizacao * 100) / 100,
      valor_juros: Math.round(valorJuros * 100) / 100,
      pago: false,
      data_pagamento: null,
      lancamento_id: null
    })
  }

  return parcelas
}

// ============================================================================
// SERVER ACTIONS (Placeholder - devem usar getServiceSupabase no servidor real)
// ============================================================================

// NOTA: Estas funções devem ser movidas para server actions reais com 'use server'
// e usar getServiceSupabase() do lib/supabaseServer.ts

async function createCriAction(data: CriEmissaoForm) {
  try {
    const { data: emissao, error } = await supabase
      .from('cri_emissoes')
      .insert([data])
      .select()
      .single()

    if (error) throw error
    return { success: true, data: emissao }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function updateCriAction(id: string, data: CriEmissaoForm) {
  try {
    const { error } = await supabase
      .from('cri_emissoes')
      .update(data)
      .eq('id', id)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function deleteCriAction(id: string) {
  try {
    // Verificar se há parcelas pagas
    const { data: parcelasPagas } = await supabase
      .from('cri_parcelas')
      .select('id')
      .eq('cri_id', id)
      .eq('pago', true)
      .limit(1)

    if (parcelasPagas && parcelasPagas.length > 0) {
      return { 
        success: false, 
        error: 'Não foi possível excluir: existem parcelas pagas vinculadas a esta emissão' 
      }
    }

    const { error } = await supabase
      .from('cri_emissoes')
      .delete()
      .eq('id', id)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function gerarParcelasAction(
  criId: string,
  emissao: CriEmissao,
  params: GerarParcelasForm
) {
  try {
    // Se substituir futuras, deletar parcelas não pagas
    if (params.substituir_futuras) {
      await supabase
        .from('cri_parcelas')
        .delete()
        .eq('cri_id', criId)
        .eq('pago', false)
    }

    // Calcular parcelas usando PRICE
    const parcelasCalculadas = calcularParcelasPRICE(
      emissao.principal_inicial,
      emissao.spread_anual,
      params.qtd_parcelas,
      emissao.data_emissao
    )

    // Inserir parcelas
    const parcelasParaInserir = parcelasCalculadas.map(p => ({
      cri_id: criId,
      num_parcela: p.num_parcela,
      data_vencimento: p.data_vencimento,
      valor_amortizacao: p.valor_amortizacao,
      valor_juros: p.valor_juros
    }))

    const { error } = await supabase
      .from('cri_parcelas')
      .insert(parcelasParaInserir)

    if (error) throw error
    return { success: true, qtd: parcelasCalculadas.length }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function liquidarParcelaAction(parcelaId: string, dataPagamento: string) {
  try {
    const { error } = await supabase
      .from('cri_parcelas')
      .update({
        pago: true,
        data_pagamento: dataPagamento
      })
      .eq('id', parcelaId)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function desfazerLiquidacaoAction(parcelaId: string) {
  try {
    const { error } = await supabase
      .from('cri_parcelas')
      .update({
        pago: false,
        data_pagamento: null
      })
      .eq('id', parcelaId)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function criarEventoAction(criId: string, data: EventoForm) {
  try {
    const { error } = await supabase
      .from('cri_eventos')
      .insert([{ cri_id: criId, ...data }])

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function excluirEventoAction(eventoId: string) {
  try {
    const { error } = await supabase
      .from('cri_eventos')
      .delete()
      .eq('id', eventoId)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function gerarLancamentosAction(criId: string, parcelas: CriParcela[], params: GerarLancamentosForm) {
  try {
    // TODO: Implementar geração de lançamentos
    // 1. Filtrar parcelas pelo intervalo (vencidas/proximas_30/todas)
    // 2. Para cada parcela, criar lançamentos para amortização e juros (se valor > 0)
    // 3. Vincular lancamento_id na parcela
    // 4. Aplicar aprovação automática se DESPESA
    
    console.log('Gerar lançamentos:', { criId, parcelas, params })
    return { success: true, qtd: 0 }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CriPage() {
  // Estados principais
  const [emissoes, setEmissoes] = useState<CriEmissao[]>([])
  const [empresas, setEmpresas] = useState<any[]>([])
  const [subcategorias, setSubcategorias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Modais e drawers
  const [showCriModal, setShowCriModal] = useState(false)
  const [showCronogramaDrawer, setShowCronogramaDrawer] = useState(false)
  const [showGerarParcelasModal, setShowGerarParcelasModal] = useState(false)
  const [showEventosModal, setShowEventosModal] = useState(false)
  const [showLiquidarModal, setShowLiquidarModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showGerarLancamentosModal, setShowGerarLancamentosModal] = useState(false)
  
  // Estados de edição
  const [editingCriId, setEditingCriId] = useState<string | null>(null)
  const [selectedCri, setSelectedCri] = useState<CriEmissao | null>(null)
  const [parcelas, setParcelas] = useState<CriParcela[]>([])
  const [eventos, setEventos] = useState<CriEvento[]>([])
  const [selectedParcela, setSelectedParcela] = useState<CriParcela | null>(null)
  const [criToDelete, setCriToDelete] = useState<string | null>(null)
  const [parcelasSimuladas, setParcelasSimuladas] = useState<CriParcela[]>([])
  const [spreadAnualInput, setSpreadAnualInput] = useState('0,00')
  const [principalInput, setPrincipalInput] = useState('0,00')
  const [eventoValorInput, setEventoValorInput] = useState('')
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [filtroIndice, setFiltroIndice] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState('')
  
  // Toast
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)
  
  // KPIs
  const [kpis, setKpis] = useState({
    totalEmissoes: 0,
    principalTotal: 0,
    saldoDevedor: 0,
    parcelasVencidas: { qtd: 0, valor: 0 },
    proximos30Dias: { qtd: 0, valor: 0 }
  })

  // Forms
  const criForm = useForm<CriEmissaoForm>({
    resolver: zodResolver(criEmissaoSchema),
    defaultValues: {
      empresa_id: '',
      serie: '',
      indice: 'CDI',
      spread_anual: 0,
      principal_inicial: 0,
      data_emissao: '',
      data_vencimento_final: '',
      contrato_numero: '',
      observacoes: ''
    }
  })

  const gerarParcelasForm = useForm<GerarParcelasForm>({
    resolver: zodResolver(gerarParcelasSchema),
    defaultValues: {
      qtd_parcelas: 12,
      periodicidade: 'MENSAL',
      substituir_futuras: false
    }
  })

  const eventoForm = useForm<EventoForm>({
    resolver: zodResolver(eventoSchema)
  })

  const liquidarForm = useForm<LiquidarParcelaForm>({
    resolver: zodResolver(liquidarParcelaSchema)
  })

  const gerarLancamentosForm = useForm<GerarLancamentosForm>({
    resolver: zodResolver(gerarLancamentosSchema)
  })

  // ============================================================================
  // TOAST FUNCTIONS
  // ============================================================================

  const showToast = (message: string, type: ToastType) => {
    const id = toastIdCounter
    setToastIdCounter(prev => prev + 1)
    
    const newToast: Toast = { id, message, type }
    setToasts(prev => [...prev, newToast])
    
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }, 3000)
  }

  const getToastStyles = (type: ToastType) => {
    switch (type) {
      case 'success':
        return { borderColor: '#10b981', icon: CheckCircle, iconColor: '#10b981' }
      case 'warning':
        return { borderColor: '#eab308', icon: AlertTriangle, iconColor: '#eab308' }
      case 'error':
        return { borderColor: '#ef4444', icon: XCircle, iconColor: '#ef4444' }
    }
  }

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (emissoes.length > 0) {
      calcularKpis()
    }
  }, [emissoes])

  const loadData = async () => {
    try {
      setLoading(true)

      // Carregar empresas
      const { data: empresasData } = await supabase
        .from('empresas')
        .select('*')
        .eq('ativo', true)
        .order('nome')

      setEmpresas(empresasData || [])

      // Carregar subcategorias (para mapeamento de lançamentos)
      const { data: subcategoriasData } = await supabase
        .from('pc_subcategorias')
        .select('*')
        .order('nome')

      setSubcategorias(subcategoriasData || [])

      // Carregar emissões com relacionamentos
      const { data: emissoesData, error } = await supabase
        .from('cri_emissoes')
        .select(`
          *,
          empresa:empresa_id(nome)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setEmissoes(emissoesData || [])
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
      showToast('Erro ao carregar emissões de CRI', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadParcelas = async (criId: string) => {
    try {
      const { data, error } = await supabase
        .from('cri_parcelas')
        .select('*')
        .eq('cri_id', criId)
        .order('num_parcela')

      if (error) throw error
      setParcelas(data || [])
    } catch (err) {
      console.error('Erro ao carregar parcelas:', err)
      showToast('Erro ao carregar parcelas', 'error')
    }
  }

  const loadEventos = async (criId: string) => {
    try {
      const { data, error } = await supabase
        .from('cri_eventos')
        .select('*')
        .eq('cri_id', criId)
        .order('data_evento', { ascending: false })

      if (error) throw error
      setEventos(data || [])
    } catch (err) {
      console.error('Erro ao carregar eventos:', err)
      showToast('Erro ao carregar eventos', 'error')
    }
  }

  const calcularKpis = async () => {
    try {
      // Total de emissões
      const totalEmissoes = emissoes.length

      // Principal total
      const principalTotal = emissoes.reduce((acc, e) => acc + parseFloat(e.principal_inicial.toString()), 0)

      // Buscar todas as parcelas
      const { data: todasParcelas } = await supabase
        .from('cri_parcelas')
        .select('*')

      if (!todasParcelas) return

      // Calcular saldo devedor (soma de amortizações não pagas)
      const saldoDevedor = todasParcelas
        .filter(p => !p.pago)
        .reduce((acc, p) => acc + parseFloat(p.valor_amortizacao.toString()), 0)

      // Parcelas vencidas
      const hoje = new Date()
      const vencidas = todasParcelas.filter(p => {
        if (p.pago) return false
        const venc = new Date(p.data_vencimento)
        return venc < hoje
      })

      const parcelasVencidas = {
        qtd: vencidas.length,
        valor: vencidas.reduce((acc, p) => 
          acc + parseFloat(p.valor_amortizacao.toString()) + 
          parseFloat(p.valor_juros.toString()), 0)
      }

      // Próximos 30 dias
      const daqui30Dias = new Date()
      daqui30Dias.setDate(daqui30Dias.getDate() + 30)
      
      const proximas = todasParcelas.filter(p => {
        if (p.pago) return false
        const venc = new Date(p.data_vencimento)
        return venc >= hoje && venc <= daqui30Dias
      })

      const proximos30Dias = {
        qtd: proximas.length,
        valor: proximas.reduce((acc, p) => 
          acc + parseFloat(p.valor_amortizacao.toString()) + 
          parseFloat(p.valor_juros.toString()), 0)
      }

      setKpis({
        totalEmissoes,
        principalTotal,
        saldoDevedor,
        parcelasVencidas,
        proximos30Dias
      })
    } catch (err) {
      console.error('Erro ao calcular KPIs:', err)
    }
  }

  // ============================================================================
  // CRUD HANDLERS
  // ============================================================================

  const handleCreateCri = async (data: CriEmissaoForm) => {
    try {
      const result = await createCriAction(data)
      
      if (!result.success) {
        showToast(result.error || 'Erro ao criar emissão', 'error')
        return
      }

      showToast('Emissão de CRI criada com sucesso!', 'success')
      loadData()
      closeCriModal()
    } catch (err: any) {
      showToast(err.message || 'Erro ao criar emissão', 'error')
    }
  }

  const handleUpdateCri = async (data: CriEmissaoForm) => {
    if (!editingCriId) return

    try {
      const result = await updateCriAction(editingCriId, data)
      
      if (!result.success) {
        showToast(result.error || 'Erro ao atualizar emissão', 'error')
        return
      }

      showToast('Emissão de CRI atualizada com sucesso!', 'success')
      loadData()
      closeCriModal()
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar emissão', 'error')
    }
  }

  const handleDeleteCri = async () => {
    if (!criToDelete) return

    try {
      const result = await deleteCriAction(criToDelete)
      
      if (!result.success) {
        showToast(result.error || 'Erro ao excluir emissão', 'error')
        return
      }

      showToast('Emissão de CRI excluída com sucesso!', 'success')
      loadData()
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir emissão', 'error')
    } finally {
      setShowDeleteModal(false)
      setCriToDelete(null)
    }
  }

  const handleGerarParcelas = async (data: GerarParcelasForm) => {
    if (!selectedCri) return

    try {
      const result = await gerarParcelasAction(selectedCri.id, selectedCri, data)
      
      if (!result.success) {
        showToast(result.error || 'Erro ao gerar parcelas', 'error')
        return
      }

      showToast(`${result.qtd} parcelas geradas com sucesso!`, 'success')
      loadParcelas(selectedCri.id)
      setShowGerarParcelasModal(false)
      setParcelasSimuladas([])
    } catch (err: any) {
      showToast(err.message || 'Erro ao gerar parcelas', 'error')
    }
  }

  const handleSimularParcelas = (data: GerarParcelasForm) => {
    if (!selectedCri) return

    const parcelas = calcularParcelasPRICE(
      selectedCri.principal_inicial,
      selectedCri.spread_anual,
      data.qtd_parcelas,
      selectedCri.data_emissao
    )

    setParcelasSimuladas(parcelas)
  }

  const handleLiquidarParcela = async (data: LiquidarParcelaForm) => {
    if (!selectedParcela) return

    try {
      const result = await liquidarParcelaAction(selectedParcela.id, data.data_pagamento)
      
      if (!result.success) {
        showToast(result.error || 'Erro ao liquidar parcela', 'error')
        return
      }

      showToast('Parcela liquidada com sucesso!', 'success')
      if (selectedCri) {
        loadParcelas(selectedCri.id)
      }
      setShowLiquidarModal(false)
      setSelectedParcela(null)
    } catch (err: any) {
      showToast(err.message || 'Erro ao liquidar parcela', 'error')
    }
  }

  const handleDesfazerLiquidacao = async (parcela: CriParcela) => {
    try {
      const result = await desfazerLiquidacaoAction(parcela.id)
      
      if (!result.success) {
        showToast(result.error || 'Erro ao desfazer liquidação', 'error')
        return
      }

      showToast('Liquidação desfeita com sucesso!', 'success')
      if (selectedCri) {
        loadParcelas(selectedCri.id)
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao desfazer liquidação', 'error')
    }
  }

  const handleCriarEvento = async (data: EventoForm) => {
    if (!selectedCri) return

    try {
      const result = await criarEventoAction(selectedCri.id, data)
      
      if (!result.success) {
        showToast(result.error || 'Erro ao criar evento', 'error')
        return
      }

      showToast('Evento registrado com sucesso!', 'success')
      loadEventos(selectedCri.id)
      eventoForm.reset()
      setEventoValorInput('')
    } catch (err: any) {
      showToast(err.message || 'Erro ao criar evento', 'error')
    }
  }

  const handleExcluirEvento = async (eventoId: string) => {
    try {
      const result = await excluirEventoAction(eventoId)
      
      if (!result.success) {
        showToast(result.error || 'Erro ao excluir evento', 'error')
        return
      }

      showToast('Evento excluído com sucesso!', 'success')
      if (selectedCri) {
        loadEventos(selectedCri.id)
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir evento', 'error')
    }
  }

  const handleGerarLancamentos = async (data: GerarLancamentosForm) => {
    if (!selectedCri) return

    try {
      const result = await gerarLancamentosAction(selectedCri.id, parcelas, data)
      
      if (!result.success) {
        showToast(result.error || 'Erro ao gerar lançamentos', 'error')
        return
      }

      showToast('Lançamentos gerados com sucesso!', 'success')
      loadParcelas(selectedCri.id)
      setShowGerarLancamentosModal(false)
    } catch (err: any) {
      showToast(err.message || 'Erro ao gerar lançamentos', 'error')
    }
  }

  // ============================================================================
  // MODAL HANDLERS
  // ============================================================================

  const openCriModal = () => {
    setEditingCriId(null)
    criForm.reset({
      empresa_id: '',
      serie: '',
      indice: 'CDI',
      spread_anual: 0,
      principal_inicial: 0,
      data_emissao: '',
      data_vencimento_final: '',
      contrato_numero: '',
      observacoes: ''
    })
    setSpreadAnualInput('0,00')
    setPrincipalInput('0,00')
    setShowCriModal(true)
  }

  const closeCriModal = () => {
    setShowCriModal(false)
    setEditingCriId(null)
    setSpreadAnualInput('0,00')
    setPrincipalInput('0,00')
  }

  const handleEditCri = (cri: CriEmissao) => {
    setEditingCriId(cri.id)
    criForm.reset({
      empresa_id: cri.empresa_id,
      serie: cri.serie,
      indice: cri.indice,
      spread_anual: cri.spread_anual,
      principal_inicial: cri.principal_inicial,
      data_emissao: formatDateInput(cri.data_emissao),
      data_vencimento_final: cri.data_vencimento_final ? formatDateInput(cri.data_vencimento_final) : '',
      contrato_numero: cri.contrato_numero || '',
      observacoes: cri.observacoes || ''
    })
    setSpreadAnualInput(formatDecimalDisplay(cri.spread_anual, { min: 2, max: 2 }))
    setPrincipalInput(formatDecimalDisplay(cri.principal_inicial))
    setShowCriModal(true)
  }

  const openCronograma = (cri: CriEmissao) => {
    setSelectedCri(cri)
    loadParcelas(cri.id)
    setShowCronogramaDrawer(true)
  }

  const closeCronograma = () => {
    setShowCronogramaDrawer(false)
    setSelectedCri(null)
    setParcelas([])
  }

  const openGerarParcelas = () => {
    if (!selectedCri) return
    gerarParcelasForm.reset({
      qtd_parcelas: 12,
      periodicidade: 'MENSAL',
      substituir_futuras: false
    })
    setParcelasSimuladas([])
    setShowGerarParcelasModal(true)
  }

  const openEventos = (cri: CriEmissao) => {
    setSelectedCri(cri)
    loadEventos(cri.id)
    eventoForm.reset({
      data_evento: new Date().toISOString().split('T')[0],
      tipo: '',
      valor: undefined,
      detalhe: ''
    })
    setEventoValorInput('')
    setShowEventosModal(true)
  }

  const openLiquidarParcela = (parcela: CriParcela) => {
    setSelectedParcela(parcela)
    liquidarForm.reset({
      data_pagamento: new Date().toISOString().split('T')[0]
    })
    setShowLiquidarModal(true)
  }

  const openGerarLancamentos = () => {
    if (!selectedCri) return
    gerarLancamentosForm.reset({
      intervalo: 'vencidas',
      subcategoria_amortizacao: '',
      subcategoria_juros: '',
      conta_id: '',
      projeto_id: ''
    })
    setShowGerarLancamentosModal(true)
  }

  // ============================================================================
  // FILTERING
  // ============================================================================

  const filteredEmissoes = emissoes.filter(emissao => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      const matchSerie = emissao.serie?.toLowerCase().includes(search)
      const matchNumero = emissao.contrato_numero?.toLowerCase().includes(search)
      const matchEmpresa = emissao.empresa?.nome?.toLowerCase().includes(search)
      
      if (!matchSerie && !matchNumero && !matchEmpresa) return false
    }

    if (filtroEmpresa && emissao.empresa_id !== filtroEmpresa) return false
    if (filtroIndice && emissao.indice !== filtroIndice) return false
    
    // TODO: Implementar filtro de situação quando tivermos as parcelas carregadas

    return true
  })

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const getStatusEmissao = (emissao: CriEmissao, parcelasEmissao: CriParcela[]) => {
    if (!parcelasEmissao || parcelasEmissao.length === 0) {
      return { label: 'Sem Parcelas', color: '#9ca3af', bg: '#f3f4f6' }
    }

    const todasPagas = parcelasEmissao.every(p => p.pago)
    if (todasPagas) {
      return { label: 'Quitado', color: '#065f46', bg: '#d1fae5' }
    }

    const hoje = new Date()
    const temVencida = parcelasEmissao.some(p => {
      if (p.pago) return false
      return new Date(p.data_vencimento) < hoje
    })

    if (temVencida) {
      return { label: 'Em Atraso', color: '#991b1b', bg: '#fee2e2' }
    }

    return { label: 'Em Curso', color: '#1e40af', bg: '#dbeafe' }
  }

  const getProximoVencimento = (parcelasEmissao: CriParcela[]) => {
    const futuras = parcelasEmissao
      .filter(p => !p.pago)
      .sort((a, b) => new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime())

    return futuras[0] || null
  }

  const calcularSaldoDevedor = (parcelasEmissao: CriParcela[]) => {
    return parcelasEmissao
      .filter(p => !p.pago)
      .reduce((acc, p) => acc + p.valor_amortizacao, 0)
  }

  // Dados para gráfico donut (composição juros vs amortização)
  const getComposicaoData = () => {
    if (!parcelas.length) return []
    
    const totalAmortizacao = parcelas.reduce((acc, p) => acc + p.valor_amortizacao, 0)
    const totalJuros = parcelas.reduce((acc, p) => acc + p.valor_juros, 0)

    return [
      { name: 'Amortização', value: totalAmortizacao, color: '#1555D6' },
      { name: 'Juros', value: totalJuros, color: '#10b981' }
    ]
  }

  // Dados para gráfico de linha (evolução do saldo devedor)
  const getEvolucaoSaldoData = () => {
    if (!parcelas.length || !selectedCri) return []
    
    let saldo = selectedCri.principal_inicial
    const data = [{ mes: 0, saldo }]

    parcelas.forEach((p, idx) => {
      saldo -= p.valor_amortizacao
      data.push({ mes: idx + 1, saldo: Math.max(0, saldo) })
    })

    return data
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '400px'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid #e5e7eb',
          borderTop: '4px solid #1555D6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
      </div>
    )
  }

  return (
    <div style={{
      padding: '32px',
      maxWidth: '1400px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '32px'
      }}>
        <div>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#111827',
            marginBottom: '8px'
          }}>
            Contratos de CRI
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#6b7280'
          }}>
            Gerencie emissões de Certificados de Recebíveis Imobiliários
          </p>
        </div>
        <button
          onClick={openCriModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 24px',
            backgroundColor: '#1555D6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1044b5'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1555D6'}
        >
          <Plus style={{ width: '20px', height: '20px' }} />
          Nova Emissão
        </button>
      </div>

      {/* KPIs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <FileText style={{ width: '24px', height: '24px', color: '#1555D6' }} />
            <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>
              Total de Emissões
            </span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#111827' }}>
            {kpis.totalEmissoes}
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <TrendingUp style={{ width: '24px', height: '24px', color: '#6366f1' }} />
            <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>
              Principal Total
            </span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#111827' }}>
            {formatCurrency(kpis.principalTotal)}
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <DollarSign style={{ width: '24px', height: '24px', color: '#10b981' }} />
            <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>
              Saldo Devedor
            </span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#111827' }}>
            {formatCurrency(kpis.saldoDevedor)}
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <AlertTriangle style={{ width: '24px', height: '24px', color: '#ef4444' }} />
            <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>
              Parcelas Vencidas
            </span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#111827' }}>
            {kpis.parcelasVencidas.qtd}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
            {formatCurrency(kpis.parcelasVencidas.valor)}
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Clock style={{ width: '24px', height: '24px', color: '#eab308' }} />
            <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>
              Próximos 30 Dias
            </span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#111827' }}>
            {kpis.proximos30Dias.qtd}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
            {formatCurrency(kpis.proximos30Dias.valor)}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        marginBottom: '24px'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px'
        }}>
          {/* Busca geral */}
          <div style={{ position: 'relative' }}>
            <Search style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '18px',
              height: '18px',
              color: '#9ca3af'
            }} />
            <input
              type="text"
              placeholder="Buscar por série, nº contrato..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 40px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none'
              }}
            />
          </div>

          {/* Filtro Empresa */}
          <select
            value={filtroEmpresa}
            onChange={(e) => setFiltroEmpresa(e.target.value)}
            style={{
              padding: '10px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
              backgroundColor: 'white'
            }}
          >
            <option value="">Todas Empresas</option>
            {empresas.map(e => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>

          {/* Filtro Índice */}
          <select
            value={filtroIndice}
            onChange={(e) => setFiltroIndice(e.target.value)}
            style={{
              padding: '10px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
              backgroundColor: 'white'
            }}
          >
            <option value="">Todos Índices</option>
            <option value="CDI">CDI</option>
            <option value="IPCA">IPCA</option>
            <option value="SELIC">SELIC</option>
            <option value="DI">DI</option>
            <option value="IGP-M">IGP-M</option>
            <option value="OUTRO">OUTRO</option>
          </select>

          {/* Filtro Situação */}
          <select
            value={filtroSituacao}
            onChange={(e) => setFiltroSituacao(e.target.value)}
            style={{
              padding: '10px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
              backgroundColor: 'white'
            }}
          >
            <option value="">Todas Situações</option>
            <option value="em_curso">Em Curso</option>
            <option value="vencidas">Com Parcelas Vencidas</option>
            <option value="quitado">Quitado</option>
          </select>
        </div>
      </div>

      {/* Tabela de Emissões */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th style={{
                  padding: '16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase'
                }}>
                  Série
                </th>
                <th style={{
                  padding: '16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase'
                }}>
                  Empresa
                </th>
                <th style={{
                  padding: '16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase'
                }}>
                  Índice + Spread
                </th>
                <th style={{
                  padding: '16px',
                  textAlign: 'right',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase'
                }}>
                  Principal Inicial
                </th>
                <th style={{
                  padding: '16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase'
                }}>
                  Período
                </th>
                <th style={{
                  padding: '16px',
                  textAlign: 'center',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase'
                }}>
                  Status
                </th>
                <th style={{
                  padding: '16px',
                  textAlign: 'right',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase'
                }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredEmissoes.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{
                    padding: '48px 16px',
                    textAlign: 'center',
                    color: '#9ca3af',
                    fontSize: '14px'
                  }}>
                    Nenhuma emissão encontrada
                  </td>
                </tr>
              ) : (
                filteredEmissoes.map((emissao) => {
                  // TODO: buscar parcelas da emissão para calcular status
                  const status = { label: 'Em Curso', color: '#1e40af', bg: '#dbeafe' }
                  
                  return (
                    <tr key={emissao.id} style={{
                      borderTop: '1px solid #f3f4f6',
                      transition: 'background-color 0.2s'
                    }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{
                        padding: '16px',
                        fontSize: '14px',
                        color: '#374151',
                        fontWeight: '600'
                      }}>
                        {emissao.serie}
                      </td>
                      <td style={{
                        padding: '16px',
                        fontSize: '14px',
                        color: '#374151'
                      }}>
                        {emissao.empresa?.nome || '-'}
                      </td>
                      <td style={{
                        padding: '16px',
                        fontSize: '14px',
                        color: '#374151'
                      }}>
                        {emissao.indice} + {emissao.spread_anual.toFixed(2)}% a.a.
                      </td>
                      <td style={{
                        padding: '16px',
                        fontSize: '14px',
                        color: '#374151',
                        fontWeight: '500',
                        textAlign: 'right'
                      }}>
                        {formatCurrency(emissao.principal_inicial)}
                      </td>
                      <td style={{
                        padding: '16px',
                        fontSize: '14px',
                        color: '#374151'
                      }}>
                        <div style={{ fontSize: '12px' }}>
                          {formatDate(emissao.data_emissao)}
                          {emissao.data_vencimento_final && (
                            <> → {formatDate(emissao.data_vencimento_final)}</>
                          )}
                        </div>
                      </td>
                      <td style={{
                        padding: '16px',
                        textAlign: 'center'
                      }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          backgroundColor: status.bg,
                          color: status.color
                        }}>
                          {status.label}
                        </span>
                      </td>
                      <td style={{
                        padding: '16px',
                        textAlign: 'right'
                      }}>
                        <div style={{
                          display: 'flex',
                          gap: '8px',
                          justifyContent: 'flex-end',
                          flexWrap: 'wrap'
                        }}>
                          <button
                            onClick={() => openCronograma(emissao)}
                            style={{
                              padding: '8px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: '#10b981',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = '#d1fae5'
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                            }}
                            title="Ver Cronograma"
                          >
                            <Calendar style={{ width: '18px', height: '18px' }} />
                          </button>
                          <button
                            onClick={() => openEventos(emissao)}
                            style={{
                              padding: '8px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: '#6366f1',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = '#e0e7ff'
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                            }}
                            title="Eventos"
                          >
                            <Activity style={{ width: '18px', height: '18px' }} />
                          </button>
                          <button
                            onClick={() => handleEditCri(emissao)}
                            style={{
                              padding: '8px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: '#1555D6',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = '#eff6ff'
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                            }}
                            title="Editar"
                          >
                            <Pencil style={{ width: '18px', height: '18px' }} />
                          </button>
                          <button
                            onClick={() => {
                              setCriToDelete(emissao.id)
                              setShowDeleteModal(true)
                            }}
                            style={{
                              padding: '8px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: '#ef4444',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = '#fef2f2'
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                            }}
                            title="Excluir"
                          >
                            <Trash2 style={{ width: '18px', height: '18px' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Criar/Editar Emissão */}
      {showCriModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '700px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '20px'
            }}>
              {editingCriId ? 'Editar Emissão de CRI' : 'Nova Emissão de CRI'}
            </h2>

            <form onSubmit={criForm.handleSubmit(
              editingCriId ? handleUpdateCri : handleCreateCri
            )}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Empresa */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Empresa Emissora *
                  </label>
                  <select
                    {...criForm.register('empresa_id')}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      backgroundColor: 'white'
                    }}
                  >
                    <option value="">Selecione a empresa emissora</option>
                    {empresas.map(e => (
                      <option key={e.id} value={e.id}>{e.nome}</option>
                    ))}
                  </select>
                  {criForm.formState.errors.empresa_id && (
                    <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                      {criForm.formState.errors.empresa_id.message}
                    </span>
                  )}
                </div>

                {/* Série, Índice, Spread */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Série *
                    </label>
                    <input
                      type="text"
                      {...criForm.register('serie')}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                      placeholder="Ex: 001"
                    />
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Índice *
                    </label>
                    <select
                      {...criForm.register('indice')}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        backgroundColor: 'white'
                      }}
                    >
                      <option value="CDI">CDI</option>
                      <option value="IPCA">IPCA</option>
                      <option value="SELIC">SELIC</option>
                      <option value="DI">DI</option>
                      <option value="IGP-M">IGP-M</option>
                      <option value="OUTRO">OUTRO</option>
                    </select>
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Spread a.a. (%) *
                    </label>
                    <Controller
                      control={criForm.control}
                      name="spread_anual"
                      render={({ field: { onChange, onBlur, name, ref } }) => (
                        <input
                          ref={ref}
                          name={name}
                          type="text"
                          inputMode="decimal"
                          value={spreadAnualInput}
                          onChange={(event) => {
                            const digits = event.target.value.replace(/\D/g, '')
                            if (!digits) {
                              setSpreadAnualInput('')
                              onChange(0)
                              return
                            }
                            const { display, value } = formatMaskedDecimalFromDigits(digits, 2)
                            setSpreadAnualInput(display)
                            onChange(value)
                          }}
                          onBlur={() => {
                            onBlur()
                            if (!spreadAnualInput) {
                              setSpreadAnualInput('0,00')
                              onChange(0)
                              return
                            }
                            const parsedValue = parseDecimalInput(spreadAnualInput)
                            setSpreadAnualInput(
                              formatDecimalDisplay(parsedValue, { min: 2, max: 2 })
                            )
                            onChange(parsedValue)
                          }}
                          onFocus={() => {
                            if (spreadAnualInput === '0,00') {
                              setSpreadAnualInput('')
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '12px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            fontSize: '14px',
                            outline: 'none'
                          }}
                          placeholder="0,00"
                        />
                      )}
                    />
                  </div>
                </div>

                {/* Principal Inicial */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Principal Inicial (R$) *
                  </label>
                  <Controller
                    control={criForm.control}
                    name="principal_inicial"
                    render={({ field: { onChange, onBlur, name, ref } }) => (
                      <input
                        ref={ref}
                        name={name}
                        type="text"
                        inputMode="decimal"
                        value={principalInput}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, '')
                          if (!digits) {
                            setPrincipalInput('')
                            onChange(0)
                            return
                          }
                          const { display, value } = formatMaskedDecimalFromDigits(digits, 2, {
                            useThousands: true
                          })
                          setPrincipalInput(display)
                          onChange(value)
                        }}
                        onBlur={() => {
                          onBlur()
                          if (!principalInput) {
                            setPrincipalInput('0,00')
                            onChange(0)
                            return
                          }
                          const parsedValue = parseDecimalInput(principalInput)
                          setPrincipalInput(formatDecimalDisplay(parsedValue))
                          onChange(parsedValue)
                        }}
                        onFocus={() => {
                          if (principalInput === '0,00') {
                            setPrincipalInput('')
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '12px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          fontSize: '14px',
                          outline: 'none'
                        }}
                        placeholder="0,00"
                      />
                    )}
                  />
                </div>

                {/* Datas */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Data de Emissão *
                    </label>
                    <input
                      type="date"
                      {...criForm.register('data_emissao')}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Vencimento Final (opcional)
                    </label>
                    <input
                      type="date"
                      {...criForm.register('data_vencimento_final')}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                {/* Nº Contrato */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Número do Contrato
                  </label>
                  <input
                    type="text"
                    {...criForm.register('contrato_numero')}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                    placeholder="Ex: CRI-2024-001"
                  />
                </div>

                {/* Observações */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Observações
                  </label>
                  <textarea
                    {...criForm.register('observacoes')}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      resize: 'vertical'
                    }}
                    placeholder="Informações adicionais sobre a emissão..."
                  />
                </div>

                {/* Botões */}
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  paddingTop: '8px'
                }}>
                  <button
                    type="button"
                    onClick={closeCriModal}
                    style={{
                      flex: 1,
                      padding: '12px 24px',
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{
                      flex: 1,
                      padding: '12px 24px',
                      backgroundColor: '#1555D6',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1044b5'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1555D6'}
                  >
                    {editingCriId ? 'Atualizar' : 'Criar'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drawer: Cronograma de Parcelas */}
      {showCronogramaDrawer && selectedCri && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000
        }}
          onClick={closeCronograma}
        >
          <div 
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: '90%',
              maxWidth: '1100px',
              backgroundColor: 'white',
              boxShadow: '-4px 0 6px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do Drawer */}
            <div style={{
              padding: '24px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h2 style={{
                  fontSize: '24px',
                  fontWeight: '700',
                  color: '#111827',
                  marginBottom: '4px'
                }}>
                  Cronograma de Parcelas - {selectedCri.serie}
                </h2>
                <p style={{
                  fontSize: '14px',
                  color: '#6b7280'
                }}>
                  {selectedCri.empresa?.nome} | {selectedCri.indice} + {selectedCri.spread_anual.toFixed(2)}% a.a.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={openGerarParcelas}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
                >
                  <Calculator style={{ width: '18px', height: '18px' }} />
                  Gerar Parcelas
                </button>
                <button
                  onClick={openGerarLancamentos}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px',
                    backgroundColor: '#6366f1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4f46e5'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#6366f1'}
                >
                  <CreditCard style={{ width: '18px', height: '18px' }} />
                  Gerar Lançamentos
                </button>
                <button
                  onClick={closeCronograma}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>

            {/* Corpo do Drawer */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px'
            }}>
              {parcelas.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '48px 24px',
                  color: '#9ca3af'
                }}>
                  <Calculator style={{ 
                    width: '48px', 
                    height: '48px', 
                    margin: '0 auto 16px',
                    color: '#d1d5db'
                  }} />
                  <p style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>
                    Nenhuma parcela gerada
                  </p>
                  <p style={{ fontSize: '14px' }}>
                    Clique em "Gerar Parcelas" para criar o cronograma
                  </p>
                </div>
              ) : (
                <>
                  {/* Gráficos */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: '16px',
                    marginBottom: '24px'
                  }}>
                    {/* Gráfico Donut - Composição */}
                    <div style={{
                      backgroundColor: 'white',
                      padding: '20px',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <h3 style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#111827',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <PieChartIcon style={{ width: '20px', height: '20px' }} />
                        Composição Total
                      </h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={getComposicaoData()}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                            label={(entry) => `${entry.name}: ${formatCurrency(entry.value)}`}
                          >
                            {getComposicaoData().map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: any) => formatCurrency(value)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Gráfico de Linha - Evolução Saldo */}
                    <div style={{
                      backgroundColor: 'white',
                      padding: '20px',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb'
                    }}>
                      <h3 style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#111827',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <LineChartIcon style={{ width: '20px', height: '20px' }} />
                        Evolução do Saldo Devedor
                      </h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={getEvolucaoSaldoData()}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="mes" label={{ value: 'Parcela', position: 'insideBottom', offset: -5 }} />
                          <YAxis />
                          <Tooltip formatter={(value: any) => formatCurrency(value)} />
                          <Line type="monotone" dataKey="saldo" stroke="#1555D6" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Tabela de Parcelas */}
                  <div style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    border: '1px solid #e5e7eb',
                    overflow: 'hidden'
                  }}>
                    <table style={{
                      width: '100%',
                      borderCollapse: 'collapse'
                    }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f9fafb' }}>
                          <th style={{
                            padding: '12px',
                            textAlign: 'center',
                            fontSize: '12px',
                            fontWeight: '600',
                            color: '#6b7280',
                            textTransform: 'uppercase'
                          }}>#</th>
                          <th style={{
                            padding: '12px',
                            textAlign: 'left',
                            fontSize: '12px',
                            fontWeight: '600',
                            color: '#6b7280',
                            textTransform: 'uppercase'
                          }}>Vencimento</th>
                          <th style={{
                            padding: '12px',
                            textAlign: 'right',
                            fontSize: '12px',
                            fontWeight: '600',
                            color: '#6b7280',
                            textTransform: 'uppercase'
                          }}>Amortização</th>
                          <th style={{
                            padding: '12px',
                            textAlign: 'right',
                            fontSize: '12px',
                            fontWeight: '600',
                            color: '#6b7280',
                            textTransform: 'uppercase'
                          }}>Juros</th>
                          <th style={{
                            padding: '12px',
                            textAlign: 'right',
                            fontSize: '12px',
                            fontWeight: '600',
                            color: '#6b7280',
                            textTransform: 'uppercase'
                          }}>Total</th>
                          <th style={{
                            padding: '12px',
                            textAlign: 'center',
                            fontSize: '12px',
                            fontWeight: '600',
                            color: '#6b7280',
                            textTransform: 'uppercase'
                          }}>Status</th>
                          <th style={{
                            padding: '12px',
                            textAlign: 'center',
                            fontSize: '12px',
                            fontWeight: '600',
                            color: '#6b7280',
                            textTransform: 'uppercase'
                          }}>Lançamento</th>
                          <th style={{
                            padding: '12px',
                            textAlign: 'center',
                            fontSize: '12px',
                            fontWeight: '600',
                            color: '#6b7280',
                            textTransform: 'uppercase'
                          }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parcelas.map((parcela) => {
                          const total = parcela.valor_amortizacao + parcela.valor_juros
                          const diasAtraso = calcularDiasAtraso(parcela.data_vencimento)
                          const estaVencida = !parcela.pago && diasAtraso > 0

                          return (
                            <tr key={parcela.id} style={{
                              borderTop: '1px solid #f3f4f6',
                              backgroundColor: estaVencida ? '#fef2f2' : 'transparent'
                            }}>
                              <td style={{
                                padding: '12px',
                                textAlign: 'center',
                                fontSize: '14px',
                                fontWeight: '600',
                                color: '#374151'
                              }}>
                                {parcela.num_parcela}
                              </td>
                              <td style={{
                                padding: '12px',
                                fontSize: '14px',
                                color: '#374151'
                              }}>
                                <div>
                                  {formatDate(parcela.data_vencimento)}
                                  {estaVencida && (
                                    <div style={{
                                      fontSize: '12px',
                                      color: '#ef4444',
                                      marginTop: '2px'
                                    }}>
                                      {diasAtraso} dia{diasAtraso > 1 ? 's' : ''} de atraso
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td style={{
                                padding: '12px',
                                textAlign: 'right',
                                fontSize: '14px',
                                color: '#374151'
                              }}>
                                {formatCurrency(parcela.valor_amortizacao)}
                              </td>
                              <td style={{
                                padding: '12px',
                                textAlign: 'right',
                                fontSize: '14px',
                                color: '#374151'
                              }}>
                                {formatCurrency(parcela.valor_juros)}
                              </td>
                              <td style={{
                                padding: '12px',
                                textAlign: 'right',
                                fontSize: '14px',
                                fontWeight: '600',
                                color: '#111827'
                              }}>
                                {formatCurrency(total)}
                              </td>
                              <td style={{
                                padding: '12px',
                                textAlign: 'center'
                              }}>
                                {parcela.pago ? (
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '4px 12px',
                                    borderRadius: '12px',
                                    fontSize: '12px',
                                    fontWeight: '500',
                                    backgroundColor: '#d1fae5',
                                    color: '#065f46'
                                  }}>
                                    Pago
                                  </span>
                                ) : (
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '4px 12px',
                                    borderRadius: '12px',
                                    fontSize: '12px',
                                    fontWeight: '500',
                                    backgroundColor: estaVencida ? '#fee2e2' : '#f3f4f6',
                                    color: estaVencida ? '#991b1b' : '#6b7280'
                                  }}>
                                    {estaVencida ? 'Vencida' : 'Em aberto'}
                                  </span>
                                )}
                              </td>
                              <td style={{
                                padding: '12px',
                                textAlign: 'center',
                                fontSize: '12px',
                                color: '#6b7280'
                              }}>
                                {parcela.lancamento_id ? (
                                  <a 
                                    href={`/financeiro/lancamentos?id=${parcela.lancamento_id}`}
                                    style={{ color: '#1555D6', textDecoration: 'underline' }}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Ver
                                  </a>
                                ) : '-'}
                              </td>
                              <td style={{
                                padding: '12px',
                                textAlign: 'center'
                              }}>
                                <div style={{
                                  display: 'flex',
                                  gap: '8px',
                                  justifyContent: 'center'
                                }}>
                                  {!parcela.pago ? (
                                    <button
                                      onClick={() => openLiquidarParcela(parcela)}
                                      style={{
                                        padding: '6px 12px',
                                        backgroundColor: '#10b981',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        fontWeight: '500',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                      }}
                                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
                                    >
                                      Liquidar
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleDesfazerLiquidacao(parcela)}
                                      style={{
                                        padding: '6px 12px',
                                        backgroundColor: '#f3f4f6',
                                        color: '#6b7280',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        fontWeight: '500',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                      }}
                                      onMouseOver={(e) => {
                                        e.currentTarget.style.backgroundColor = '#e5e7eb'
                                        e.currentTarget.style.color = '#374151'
                                      }}
                                      onMouseOut={(e) => {
                                        e.currentTarget.style.backgroundColor = '#f3f4f6'
                                        e.currentTarget.style.color = '#6b7280'
                                      }}
                                    >
                                      Desfazer
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ backgroundColor: '#f9fafb', fontWeight: '600' }}>
                          <td colSpan={2} style={{
                            padding: '12px',
                            fontSize: '14px',
                            color: '#111827'
                          }}>
                            TOTAL
                          </td>
                          <td style={{
                            padding: '12px',
                            textAlign: 'right',
                            fontSize: '14px',
                            color: '#111827'
                          }}>
                            {formatCurrency(parcelas.reduce((acc, p) => acc + p.valor_amortizacao, 0))}
                          </td>
                          <td style={{
                            padding: '12px',
                            textAlign: 'right',
                            fontSize: '14px',
                            color: '#111827'
                          }}>
                            {formatCurrency(parcelas.reduce((acc, p) => acc + p.valor_juros, 0))}
                          </td>
                          <td style={{
                            padding: '12px',
                            textAlign: 'right',
                            fontSize: '14px',
                            color: '#111827'
                          }}>
                            {formatCurrency(
                              parcelas.reduce((acc, p) => 
                                acc + p.valor_amortizacao + p.valor_juros, 0
                              )
                            )}
                          </td>
                          <td colSpan={3}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Gerar Parcelas */}
      {showGerarParcelasModal && selectedCri && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '800px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '16px'
            }}>
              Simular e Gerar Parcelas
            </h2>

            <form onSubmit={gerarParcelasForm.handleSubmit(handleGerarParcelas)}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Alerta sobre cálculo simplificado */}
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#fef3c7',
                  border: '1px solid #fbbf24',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#92400e'
                }}>
                  ℹ️ <strong>Cálculo PRICE simplificado:</strong> Juros calculados linearmente com base no spread anual. 
                  Indexadores externos (CDI, IPCA, etc.) podem ser integrados futuramente.
                </div>

                {/* Parâmetros */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Quantidade de Parcelas *
                    </label>
                    <input
                      type="number"
                      {...gerarParcelasForm.register('qtd_parcelas', { valueAsNumber: true })}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                      min="1"
                    />
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Periodicidade
                    </label>
                    <input
                      type="text"
                      {...gerarParcelasForm.register('periodicidade')}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                      placeholder="MENSAL"
                      disabled
                    />
                  </div>
                </div>

                {/* Substituir parcelas futuras */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    {...gerarParcelasForm.register('substituir_futuras')}
                    id="substituir_futuras"
                    style={{
                      width: '18px',
                      height: '18px',
                      cursor: 'pointer',
                      accentColor: '#1555D6'
                    }}
                  />
                  <label
                    htmlFor="substituir_futuras"
                    style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      cursor: 'pointer'
                    }}
                  >
                    Substituir parcelas futuras não pagas
                  </label>
                </div>

                {/* Botão de Simulação */}
                <button
                  type="button"
                  onClick={() => handleSimularParcelas(gerarParcelasForm.getValues())}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#f3f4f6',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                >
                  🔍 Simular Cronograma
                </button>

                {/* Prévia das Parcelas Simuladas */}
                {parcelasSimuladas.length > 0 && (
                  <div style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    maxHeight: '300px',
                    overflowY: 'auto'
                  }}>
                    <table style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '12px'
                    }}>
                      <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f9fafb' }}>
                        <tr>
                          <th style={{ padding: '8px', textAlign: 'center' }}>#</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Vencimento</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Amortização</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Juros</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parcelasSimuladas.map((p, idx) => (
                          <tr key={idx} style={{ borderTop: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '8px', textAlign: 'center' }}>{p.num_parcela}</td>
                            <td style={{ padding: '8px' }}>{formatDate(p.data_vencimento)}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>
                              {formatCurrency(p.valor_amortizacao)}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>
                              {formatCurrency(p.valor_juros)}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600' }}>
                              {formatCurrency(p.valor_amortizacao + p.valor_juros)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Botões */}
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  paddingTop: '8px'
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowGerarParcelasModal(false)
                      setParcelasSimuladas([])
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 24px',
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{
                      flex: 1,
                      padding: '12px 24px',
                      backgroundColor: '#10b981',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
                  >
                    Gerar Parcelas
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Eventos */}
      {showEventosModal && selectedCri && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '700px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '16px'
            }}>
              Eventos da Emissão - {selectedCri.serie}
            </h2>

            {/* Formulário de novo evento */}
            <form onSubmit={eventoForm.handleSubmit(handleCriarEvento)} style={{
              marginBottom: '24px',
              padding: '16px',
              backgroundColor: '#f9fafb',
              borderRadius: '8px'
            }}>
              <h3 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '12px'
              }}>
                Registrar Novo Evento
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '4px'
                    }}>
                      Data *
                    </label>
                    <input
                      type="date"
                      {...eventoForm.register('data_evento')}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '4px'
                    }}>
                      Tipo *
                    </label>
                    <input
                      type="text"
                      {...eventoForm.register('tipo')}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                      placeholder="Ex: Reprecificação"
                    />
                  </div>
                </div>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '4px'
                  }}>
                    Valor (opcional)
                  </label>
                  <Controller
                    control={eventoForm.control}
                    name="valor"
                    render={({ field: { onChange, onBlur, name, ref } }) => (
                      <input
                        ref={ref}
                        name={name}
                        type="text"
                        inputMode="decimal"
                        value={eventoValorInput}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, '')
                          if (!digits) {
                            setEventoValorInput('')
                            onChange(undefined)
                            return
                          }
                          const { display, value } = formatMaskedDecimalFromDigits(digits, 2, {
                            useThousands: true
                          })
                          setEventoValorInput(display)
                          onChange(value)
                        }}
                        onBlur={() => {
                          onBlur()
                          if (!eventoValorInput) {
                            setEventoValorInput('')
                            onChange(undefined)
                            return
                          }
                          const parsedValue = parseDecimalInput(eventoValorInput)
                          setEventoValorInput(formatDecimalDisplay(parsedValue))
                          onChange(parsedValue)
                        }}
                        onFocus={() => {
                          if (eventoValorInput === '0,00') {
                            setEventoValorInput('')
                          }
                        }}
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          fontSize: '14px',
                          outline: 'none'
                        }}
                        placeholder="0,00"
                      />
                    )}
                  />
                </div>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '4px'
                  }}>
                    Detalhe
                  </label>
                  <textarea
                    {...eventoForm.register('detalhe')}
                    rows={2}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '14px',
                      outline: 'none',
                      resize: 'vertical'
                    }}
                    placeholder="Descrição do evento..."
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
                >
                  Registrar Evento
                </button>
              </div>
            </form>

            {/* Timeline de eventos */}
            <div style={{
              marginBottom: '16px'
            }}>
              <h3 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '16px'
              }}>
                Histórico de Eventos
              </h3>
              {eventos.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '24px',
                  color: '#9ca3af',
                  fontSize: '14px'
                }}>
                  Nenhum evento registrado
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  {eventos.map((evento) => (
                    <div key={evento.id} style={{
                      padding: '16px',
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      position: 'relative'
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'start',
                        marginBottom: '8px'
                      }}>
                        <div>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: '600',
                            color: '#111827',
                            marginBottom: '4px'
                          }}>
                            {evento.tipo}
                          </div>
                          <div style={{
                            fontSize: '12px',
                            color: '#6b7280'
                          }}>
                            {formatDate(evento.data_evento)}
                            {evento.valor && (
                              <> • {formatCurrency(evento.valor)}</>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleExcluirEvento(evento.id)}
                          style={{
                            padding: '6px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: '#ef4444',
                            transition: 'all 0.2s'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          title="Excluir evento"
                        >
                          <Trash2 style={{ width: '16px', height: '16px' }} />
                        </button>
                      </div>
                      {evento.detalhe && (
                        <div style={{
                          fontSize: '13px',
                          color: '#6b7280',
                          lineHeight: '1.5'
                        }}>
                          {evento.detalhe}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Botão fechar */}
            <button
              onClick={() => {
                setShowEventosModal(false)
                setEventoValorInput('')
              }}
              style={{
                width: '100%',
                padding: '12px 24px',
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal: Liquidar Parcela */}
      {showLiquidarModal && selectedParcela && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '400px'
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#111827',
              marginBottom: '16px'
            }}>
              Liquidar Parcela #{selectedParcela.num_parcela}
            </h2>

            <form onSubmit={liquidarForm.handleSubmit(handleLiquidarParcela)}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Resumo da Parcela */}
                <div style={{
                  padding: '12px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  fontSize: '13px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>Amortização:</span>
                    <strong>{formatCurrency(selectedParcela.valor_amortizacao)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>Juros:</span>
                    <strong>{formatCurrency(selectedParcela.valor_juros)}</strong>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingTop: '8px',
                    borderTop: '1px solid #e5e7eb',
                    fontSize: '14px'
                  }}>
                    <span>Total:</span>
                    <strong>{formatCurrency(
                      selectedParcela.valor_amortizacao + selectedParcela.valor_juros
                    )}</strong>
                  </div>
                </div>

                {/* Data de Pagamento */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Data de Pagamento *
                  </label>
                  <input
                    type="date"
                    {...liquidarForm.register('data_pagamento')}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Botões */}
                <div style={{
                  display: 'flex',
                  gap: '12px'
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLiquidarModal(false)
                      setSelectedParcela(null)
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 24px',
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{
                      flex: 1,
                      padding: '12px 24px',
                      backgroundColor: '#10b981',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Gerar Lançamentos */}
      {showGerarLancamentosModal && selectedCri && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '600px'
          }}>
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '16px'
            }}>
              Gerar Lançamentos
            </h2>

            <form onSubmit={gerarLancamentosForm.handleSubmit(handleGerarLancamentos)}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Alerta */}
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#dbeafe',
                  border: '1px solid #3b82f6',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#1e40af'
                }}>
                  ℹ️ Serão criados lançamentos de <strong>DESPESA</strong> para amortização e juros com base nas parcelas selecionadas.
                </div>

                {/* Intervalo */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Intervalo de Parcelas *
                  </label>
                  <select
                    {...gerarLancamentosForm.register('intervalo')}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      backgroundColor: 'white'
                    }}
                  >
                    <option value="vencidas">Apenas Vencidas</option>
                    <option value="proximas_30">Próximas 30 Dias</option>
                    <option value="todas">Todas as Futuras</option>
                  </select>
                </div>

                {/* Subcategorias */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Subcategoria Amortização *
                    </label>
                    <select
                      {...gerarLancamentosForm.register('subcategoria_amortizacao')}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        backgroundColor: 'white'
                      }}
                    >
                      <option value="">Selecione...</option>
                      {subcategorias.map(s => (
                        <option key={s.id} value={s.id}>{s.nome}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Subcategoria Juros *
                    </label>
                    <select
                      {...gerarLancamentosForm.register('subcategoria_juros')}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        backgroundColor: 'white'
                      }}
                    >
                      <option value="">Selecione...</option>
                      {subcategorias.map(s => (
                        <option key={s.id} value={s.id}>{s.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Botões */}
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  paddingTop: '8px'
                }}>
                  <button
                    type="button"
                    onClick={() => setShowGerarLancamentosModal(false)}
                    style={{
                      flex: 1,
                      padding: '12px 24px',
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{
                      flex: 1,
                      padding: '12px 24px',
                      backgroundColor: '#6366f1',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4f46e5'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#6366f1'}
                  >
                    Gerar Lançamentos
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmação de Exclusão */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '400px'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '16px'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertTriangle style={{ 
                  width: '24px', 
                  height: '24px', 
                  color: '#ef4444' 
                }} />
              </div>
            </div>

            <h2 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#111827',
              textAlign: 'center',
              marginBottom: '8px'
            }}>
              Excluir Emissão de CRI
            </h2>

            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              textAlign: 'center',
              marginBottom: '24px',
              lineHeight: '1.5'
            }}>
              Tem certeza que deseja excluir esta emissão? Esta ação não pode ser desfeita.
            </p>

            <div style={{
              display: 'flex',
              gap: '12px'
            }}>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false)
                  setCriToDelete(null)
                }}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteCri}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  backgroundColor: '#ef4444',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        pointerEvents: 'none'
      }}>
        {toasts.map((toast) => {
          const { borderColor, icon: Icon, iconColor } = getToastStyles(toast.type)
          return (
            <div
              key={toast.id}
              style={{
                backgroundColor: 'white',
                borderTop: `4px solid ${borderColor}`,
                padding: '16px 20px',
                borderRadius: '12px',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                minWidth: '300px',
                animation: 'scaleIn 0.3s ease-out'
              }}
            >
              <Icon style={{ width: '24px', height: '24px', flexShrink: 0, color: iconColor }} />
              <span style={{
                fontSize: '14px',
                fontWeight: '500',
                flex: 1,
                color: '#374151'
              }}>
                {toast.message}
              </span>
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes scaleIn {
          from {
            transform: scale(0.8);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}
