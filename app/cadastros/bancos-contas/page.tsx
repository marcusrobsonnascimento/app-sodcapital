'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatCurrency } from '@/lib/utils'
import { 
  Plus, Pencil, Trash2, Search, CheckCircle, AlertTriangle, XCircle,
  Calendar, DollarSign, TrendingUp, FileText, Eye, Calculator,
  Download, CreditCard, Clock
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type ToastType = 'success' | 'warning' | 'error'
type IndiceType = 'CDI' | 'IPCA' | 'SELIC' | 'DI' | 'IGP-M' | 'OUTRO'
type TipoAmortizacao = 'PRICE' | 'SAC'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface Mutuo {
  id: string
  org_id: string
  de_empresa_id: string | null
  para_empresa_id: string | null
  contraparte_pf_id: string | null
  principal: number
  indice: IndiceType
  spread_anual: number
  carencia_meses: number
  periodicidade: string
  data_inicio: string
  data_fim: string | null
  multa_percentual: number
  mora_percentual: number
  contrato_numero: string | null
  observacoes: string | null
  created_at: string
  de_empresa?: { nome: string }
  para_empresa?: { nome: string }
  contraparte_pf?: { nome: string }
}

interface Parcela {
  id: string
  org_id: string
  mutuo_id: string
  num_parcela: number
  data_vencimento: string
  valor_principal: number
  valor_juros: number
  valor_iof: number
  pago: boolean
  data_pagamento: string | null
  lancamento_id: string | null
}

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const mutuoSchema = z.object({
  de_empresa_id: z.string().min(1, 'Empresa devedora é obrigatória'),
  para_empresa_id: z.string().optional(),
  contraparte_pf_id: z.string().optional(),
  principal: z.number().min(0.01, 'Principal deve ser maior que zero'),
  indice: z.enum(['CDI', 'IPCA', 'SELIC', 'DI', 'IGP-M', 'OUTRO']),
  spread_anual: z.number().min(0, 'Spread não pode ser negativo'),
  carencia_meses: z.number().int().min(0, 'Carência não pode ser negativa'),
  periodicidade: z.string().default('MENSAL'),
  data_inicio: z.string().min(1, 'Data de início é obrigatória'),
  data_fim: z.string().optional(),
  multa_percentual: z.number().min(0).default(0),
  mora_percentual: z.number().min(0).default(0),
  contrato_numero: z.string().optional(),
  observacoes: z.string().optional()
}).refine(data => {
  // Validar que pelo menos para_empresa_id OU contraparte_pf_id está preenchido
  return data.para_empresa_id || data.contraparte_pf_id
}, {
  message: 'Selecione a empresa credora OU a contraparte pessoa física',
  path: ['para_empresa_id']
})

const gerarParcelasSchema = z.object({
  qtd_parcelas: z.number().int().min(1, 'Quantidade mínima é 1 parcela'),
  carencia_meses: z.number().int().min(0, 'Carência não pode ser negativa'),
  tipo_amortizacao: z.enum(['PRICE', 'SAC']),
  iof_percentual: z.number().min(0).default(0),
  substituir_futuras: z.boolean().default(false)
})

const liquidarParcelaSchema = z.object({
  data_pagamento: z.string().min(1, 'Data de pagamento é obrigatória')
})

type MutuoForm = z.infer<typeof mutuoSchema>
type GerarParcelasForm = z.infer<typeof gerarParcelasSchema>
type LiquidarParcelaForm = z.infer<typeof liquidarParcelaSchema>

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

function calcularDiasAtraso(dataVencimento: string): number {
  const hoje = new Date()
  const vencimento = new Date(dataVencimento)
  const diff = hoje.getTime() - vencimento.getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

// Cálculo PRICE simplificado
function calcularParcelasPRICE(
  principal: number,
  spreadAnual: number,
  qtdParcelas: number,
  carenciaMeses: number,
  iofPercentual: number,
  dataInicio: string
): Parcela[] {
  const parcelas: Parcela[] = []
  const taxaMensal = (spreadAnual / 12) / 100 // Taxa mensal decimal
  
  // PMT = P * i * (1 + i)^n / ((1 + i)^n - 1)
  const pmt = taxaMensal > 0
    ? principal * taxaMensal * Math.pow(1 + taxaMensal, qtdParcelas) / (Math.pow(1 + taxaMensal, qtdParcelas) - 1)
    : principal / qtdParcelas

  let saldoDevedor = principal
  const dataInicioDate = new Date(dataInicio)

  for (let i = 1; i <= qtdParcelas; i++) {
    const estaNaCarencia = i <= carenciaMeses
    
    // Calcular data de vencimento
    const dataVencimento = new Date(dataInicioDate)
    dataVencimento.setMonth(dataVencimento.getMonth() + i)

    let valorJuros = 0
    let valorPrincipal = 0
    
    if (estaNaCarencia) {
      // Durante carência: só juros
      valorJuros = saldoDevedor * taxaMensal
      valorPrincipal = 0
    } else {
      // Após carência: amortização normal
      valorJuros = saldoDevedor * taxaMensal
      valorPrincipal = pmt - valorJuros
      
      // Ajuste para última parcela
      if (i === qtdParcelas) {
        valorPrincipal = saldoDevedor
      }
      
      saldoDevedor -= valorPrincipal
    }

    const valorIof = (valorPrincipal + valorJuros) * (iofPercentual / 100)

    parcelas.push({
      id: '', // Será gerado no servidor
      org_id: '',
      mutuo_id: '',
      num_parcela: i,
      data_vencimento: dataVencimento.toISOString().split('T')[0],
      valor_principal: Math.round(valorPrincipal * 100) / 100,
      valor_juros: Math.round(valorJuros * 100) / 100,
      valor_iof: Math.round(valorIof * 100) / 100,
      pago: false,
      data_pagamento: null,
      lancamento_id: null
    })
  }

  return parcelas
}

// Cálculo SAC simplificado
function calcularParcelasSAC(
  principal: number,
  spreadAnual: number,
  qtdParcelas: number,
  carenciaMeses: number,
  iofPercentual: number,
  dataInicio: string
): Parcela[] {
  const parcelas: Parcela[] = []
  const taxaMensal = (spreadAnual / 12) / 100
  const amortizacaoConstante = principal / (qtdParcelas - carenciaMeses)
  
  let saldoDevedor = principal
  const dataInicioDate = new Date(dataInicio)

  for (let i = 1; i <= qtdParcelas; i++) {
    const estaNaCarencia = i <= carenciaMeses
    
    const dataVencimento = new Date(dataInicioDate)
    dataVencimento.setMonth(dataVencimento.getMonth() + i)

    let valorJuros = saldoDevedor * taxaMensal
    let valorPrincipal = 0
    
    if (estaNaCarencia) {
      valorPrincipal = 0
    } else {
      valorPrincipal = amortizacaoConstante
      // Ajuste para última parcela
      if (i === qtdParcelas) {
        valorPrincipal = saldoDevedor
      }
      saldoDevedor -= valorPrincipal
    }

    const valorIof = (valorPrincipal + valorJuros) * (iofPercentual / 100)

    parcelas.push({
      id: '',
      org_id: '',
      mutuo_id: '',
      num_parcela: i,
      data_vencimento: dataVencimento.toISOString().split('T')[0],
      valor_principal: Math.round(valorPrincipal * 100) / 100,
      valor_juros: Math.round(valorJuros * 100) / 100,
      valor_iof: Math.round(valorIof * 100) / 100,
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

async function createMutuoAction(data: MutuoForm) {
  try {
    const { data: mutuo, error } = await supabase
      .from('mutuos')
      .insert([data])
      .select()
      .single()

    if (error) throw error
    return { success: true, data: mutuo }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function updateMutuoAction(id: string, data: MutuoForm) {
  try {
    const { error } = await supabase
      .from('mutuos')
      .update(data)
      .eq('id', id)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function deleteMutuoAction(id: string) {
  try {
    // Verificar se há parcelas pagas
    const { data: parcelasPagas } = await supabase
      .from('mutuos_parcelas')
      .select('id')
      .eq('mutuo_id', id)
      .eq('pago', true)
      .limit(1)

    if (parcelasPagas && parcelasPagas.length > 0) {
      return { 
        success: false, 
        error: 'Não é possível excluir: existem parcelas pagas vinculadas a este contrato' 
      }
    }

    const { error } = await supabase
      .from('mutuos')
      .delete()
      .eq('id', id)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function gerarParcelasAction(
  mutuoId: string,
  mutuo: Mutuo,
  params: GerarParcelasForm
) {
  try {
    // Se substituir futuras, deletar parcelas não pagas
    if (params.substituir_futuras) {
      await supabase
        .from('mutuos_parcelas')
        .delete()
        .eq('mutuo_id', mutuoId)
        .eq('pago', false)
    }

    // Calcular parcelas
    const calculaFn = params.tipo_amortizacao === 'PRICE' 
      ? calcularParcelasPRICE 
      : calcularParcelasSAC

    const parcelasCalculadas = calculaFn(
      mutuo.principal,
      mutuo.spread_anual,
      params.qtd_parcelas,
      params.carencia_meses,
      params.iof_percentual,
      mutuo.data_inicio
    )

    // Inserir parcelas
    const parcelasParaInserir = parcelasCalculadas.map(p => ({
      mutuo_id: mutuoId,
      num_parcela: p.num_parcela,
      data_vencimento: p.data_vencimento,
      valor_principal: p.valor_principal,
      valor_juros: p.valor_juros,
      valor_iof: p.valor_iof
    }))

    const { error } = await supabase
      .from('mutuos_parcelas')
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
      .from('mutuos_parcelas')
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
      .from('mutuos_parcelas')
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MutuosPage() {
  // Estados principais
  const [mutuos, setMutuos] = useState<Mutuo[]>([])
  const [empresas, setEmpresas] = useState<any[]>([])
  const [contrapartes, setContrapartes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Modais e drawers
  const [showMutuoModal, setShowMutuoModal] = useState(false)
  const [showCronogramaDrawer, setShowCronogramaDrawer] = useState(false)
  const [showGerarParcelasModal, setShowGerarParcelasModal] = useState(false)
  const [showLiquidarModal, setShowLiquidarModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  
  // Estados de edição
  const [editingMutuoId, setEditingMutuoId] = useState<string | null>(null)
  const [selectedMutuo, setSelectedMutuo] = useState<Mutuo | null>(null)
  const [parcelas, setParcelas] = useState<Parcela[]>([])
  const [selectedParcela, setSelectedParcela] = useState<Parcela | null>(null)
  const [mutuoToDelete, setMutuoToDelete] = useState<string | null>(null)
  const [parcelasSimuladas, setParcelasSimuladas] = useState<Parcela[]>([])
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroDevedora, setFiltroDevedora] = useState('')
  const [filtroCredora, setFiltroCredora] = useState('')
  const [filtroIndice, setFiltroIndice] = useState('')
  
  // Toast
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)
  
  // KPIs
  const [kpis, setKpis] = useState({
    totalContratos: 0,
    saldoDevedor: 0,
    parcelasVencidas: { qtd: 0, valor: 0 },
    proximos30Dias: { qtd: 0, valor: 0 }
  })

  // Forms
  const mutuoForm = useForm<MutuoForm>({
    resolver: zodResolver(mutuoSchema),
    defaultValues: {
      principal: 0,
      spread_anual: 0,
      carencia_meses: 0,
      periodicidade: 'MENSAL',
      multa_percentual: 0,
      mora_percentual: 0,
      indice: 'CDI'
    }
  })

  const gerarParcelasForm = useForm<GerarParcelasForm>({
    resolver: zodResolver(gerarParcelasSchema),
    defaultValues: {
      qtd_parcelas: 12,
      carencia_meses: 0,
      tipo_amortizacao: 'PRICE',
      iof_percentual: 0,
      substituir_futuras: false
    }
  })

  const liquidarForm = useForm<LiquidarParcelaForm>({
    resolver: zodResolver(liquidarParcelaSchema)
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
    if (mutuos.length > 0) {
      calcularKpis()
    }
  }, [mutuos])

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

      // Carregar contrapartes PF
      const { data: contrapartesData } = await supabase
        .from('contrapartes')
        .select('*')
        .order('nome')

      setContrapartes(contrapartesData || [])

      // Carregar mútuos com relacionamentos
      const { data: mutuosData, error } = await supabase
        .from('mutuos')
        .select(`
          *,
          de_empresa:de_empresa_id(nome),
          para_empresa:para_empresa_id(nome),
          contraparte_pf:contraparte_pf_id(nome)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      setMutuos(mutuosData || [])
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
      showToast('Erro ao carregar contratos de mútuo', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadParcelas = async (mutuoId: string) => {
    try {
      const { data, error } = await supabase
        .from('mutuos_parcelas')
        .select('*')
        .eq('mutuo_id', mutuoId)
        .order('num_parcela')

      if (error) throw error
      setParcelas(data || [])
    } catch (err) {
      console.error('Erro ao carregar parcelas:', err)
      showToast('Erro ao carregar parcelas', 'error')
    }
  }

  const calcularKpis = async () => {
    try {
      // Total de contratos
      const totalContratos = mutuos.length

      // Buscar todas as parcelas
      const { data: todasParcelas } = await supabase
        .from('mutuos_parcelas')
        .select('*')

      if (!todasParcelas) return

      // Calcular saldo devedor (soma de principal não pago)
      const saldoDevedor = todasParcelas
        .filter(p => !p.pago)
        .reduce((acc, p) => acc + parseFloat(p.valor_principal.toString()), 0)

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
          acc + parseFloat(p.valor_principal.toString()) + 
          parseFloat(p.valor_juros.toString()) + 
          parseFloat(p.valor_iof.toString()), 0)
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
          acc + parseFloat(p.valor_principal.toString()) + 
          parseFloat(p.valor_juros.toString()) + 
          parseFloat(p.valor_iof.toString()), 0)
      }

      setKpis({
        totalContratos,
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

  const handleCreateMutuo = async (data: MutuoForm) => {
    try {
      const result = await createMutuoAction(data)
      
      if (!result.success) {
        showToast(result.error || 'Erro ao criar contrato', 'error')
        return
      }

      showToast('Contrato de mútuo criado com sucesso!', 'success')
      loadData()
      closeMutuoModal()
    } catch (err: any) {
      showToast(err.message || 'Erro ao criar contrato', 'error')
    }
  }

  const handleUpdateMutuo = async (data: MutuoForm) => {
    if (!editingMutuoId) return

    try {
      const result = await updateMutuoAction(editingMutuoId, data)
      
      if (!result.success) {
        showToast(result.error || 'Erro ao atualizar contrato', 'error')
        return
      }

      showToast('Contrato de mútuo atualizado com sucesso!', 'success')
      loadData()
      closeMutuoModal()
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar contrato', 'error')
    }
  }

  const handleDeleteMutuo = async () => {
    if (!mutuoToDelete) return

    try {
      const result = await deleteMutuoAction(mutuoToDelete)
      
      if (!result.success) {
        showToast(result.error || 'Erro ao excluir contrato', 'error')
        return
      }

      showToast('Contrato de mútuo excluído com sucesso!', 'success')
      loadData()
    } catch (err: any) {
      showToast(err.message || 'Erro ao excluir contrato', 'error')
    } finally {
      setShowDeleteModal(false)
      setMutuoToDelete(null)
    }
  }

  const handleGerarParcelas = async (data: GerarParcelasForm) => {
    if (!selectedMutuo) return

    try {
      const result = await gerarParcelasAction(selectedMutuo.id, selectedMutuo, data)
      
      if (!result.success) {
        showToast(result.error || 'Erro ao gerar parcelas', 'error')
        return
      }

      showToast(`${result.qtd} parcelas geradas com sucesso!`, 'success')
      loadParcelas(selectedMutuo.id)
      setShowGerarParcelasModal(false)
      setParcelasSimuladas([])
    } catch (err: any) {
      showToast(err.message || 'Erro ao gerar parcelas', 'error')
    }
  }

  const handleSimularParcelas = (data: GerarParcelasForm) => {
    if (!selectedMutuo) return

    const calculaFn = data.tipo_amortizacao === 'PRICE' 
      ? calcularParcelasPRICE 
      : calcularParcelasSAC

    const parcelas = calculaFn(
      selectedMutuo.principal,
      selectedMutuo.spread_anual,
      data.qtd_parcelas,
      data.carencia_meses,
      data.iof_percentual,
      selectedMutuo.data_inicio
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
      if (selectedMutuo) {
        loadParcelas(selectedMutuo.id)
      }
      setShowLiquidarModal(false)
      setSelectedParcela(null)
    } catch (err: any) {
      showToast(err.message || 'Erro ao liquidar parcela', 'error')
    }
  }

  const handleDesfazerLiquidacao = async (parcela: Parcela) => {
    try {
      const result = await desfazerLiquidacaoAction(parcela.id)
      
      if (!result.success) {
        showToast(result.error || 'Erro ao desfazer liquidação', 'error')
        return
      }

      showToast('Liquidação desfeita com sucesso!', 'success')
      if (selectedMutuo) {
        loadParcelas(selectedMutuo.id)
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao desfazer liquidação', 'error')
    }
  }

  // ============================================================================
  // MODAL HANDLERS
  // ============================================================================

  const openMutuoModal = () => {
    setEditingMutuoId(null)
    mutuoForm.reset({
      de_empresa_id: '',
      para_empresa_id: '',
      contraparte_pf_id: '',
      principal: 0,
      spread_anual: 0,
      carencia_meses: 0,
      periodicidade: 'MENSAL',
      data_inicio: '',
      data_fim: '',
      multa_percentual: 0,
      mora_percentual: 0,
      contrato_numero: '',
      observacoes: '',
      indice: 'CDI'
    })
    setShowMutuoModal(true)
  }

  const closeMutuoModal = () => {
    setShowMutuoModal(false)
    setEditingMutuoId(null)
  }

  const handleEditMutuo = (mutuo: Mutuo) => {
    setEditingMutuoId(mutuo.id)
    mutuoForm.reset({
      de_empresa_id: mutuo.de_empresa_id || '',
      para_empresa_id: mutuo.para_empresa_id || '',
      contraparte_pf_id: mutuo.contraparte_pf_id || '',
      principal: mutuo.principal,
      spread_anual: mutuo.spread_anual,
      carencia_meses: mutuo.carencia_meses,
      periodicidade: mutuo.periodicidade,
      data_inicio: formatDateInput(mutuo.data_inicio),
      data_fim: mutuo.data_fim ? formatDateInput(mutuo.data_fim) : '',
      multa_percentual: mutuo.multa_percentual,
      mora_percentual: mutuo.mora_percentual,
      contrato_numero: mutuo.contrato_numero || '',
      observacoes: mutuo.observacoes || '',
      indice: mutuo.indice
    })
    setShowMutuoModal(true)
  }

  const openCronograma = (mutuo: Mutuo) => {
    setSelectedMutuo(mutuo)
    loadParcelas(mutuo.id)
    setShowCronogramaDrawer(true)
  }

  const closeCronograma = () => {
    setShowCronogramaDrawer(false)
    setSelectedMutuo(null)
    setParcelas([])
  }

  const openGerarParcelas = () => {
    if (!selectedMutuo) return
    gerarParcelasForm.reset({
      qtd_parcelas: 12,
      carencia_meses: selectedMutuo.carencia_meses,
      tipo_amortizacao: 'PRICE',
      iof_percentual: 0,
      substituir_futuras: false
    })
    setParcelasSimuladas([])
    setShowGerarParcelasModal(true)
  }

  const openLiquidarParcela = (parcela: Parcela) => {
    setSelectedParcela(parcela)
    liquidarForm.reset({
      data_pagamento: new Date().toISOString().split('T')[0]
    })
    setShowLiquidarModal(true)
  }

  // ============================================================================
  // FILTERING
  // ============================================================================

  const filteredMutuos = mutuos.filter(mutuo => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      const matchNumero = mutuo.contrato_numero?.toLowerCase().includes(search)
      const matchDevedora = mutuo.de_empresa?.nome?.toLowerCase().includes(search)
      const matchCredora = mutuo.para_empresa?.nome?.toLowerCase().includes(search)
      const matchPF = mutuo.contraparte_pf?.nome?.toLowerCase().includes(search)
      
      if (!matchNumero && !matchDevedora && !matchCredora && !matchPF) return false
    }

    if (filtroDevedora && mutuo.de_empresa_id !== filtroDevedora) return false
    if (filtroCredora && mutuo.para_empresa_id !== filtroCredora) return false
    if (filtroIndice && mutuo.indice !== filtroIndice) return false

    return true
  })

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const getStatusMutuo = (mutuo: Mutuo, parcelasDoMutuo: Parcela[]) => {
    if (!parcelasDoMutuo || parcelasDoMutuo.length === 0) {
      return { label: 'Sem Parcelas', color: '#9ca3af', bg: '#f3f4f6' }
    }

    const todasPagas = parcelasDoMutuo.every(p => p.pago)
    if (todasPagas) {
      return { label: 'Quitado', color: '#065f46', bg: '#d1fae5' }
    }

    const hoje = new Date()
    const temVencida = parcelasDoMutuo.some(p => {
      if (p.pago) return false
      return new Date(p.data_vencimento) < hoje
    })

    if (temVencida) {
      return { label: 'Em Atraso', color: '#991b1b', bg: '#fee2e2' }
    }

    return { label: 'Em Curso', color: '#1e40af', bg: '#dbeafe' }
  }

  const getProximoVencimento = (parcelasDoMutuo: Parcela[]) => {
    const futuras = parcelasDoMutuo
      .filter(p => !p.pago)
      .sort((a, b) => new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime())

    return futuras[0] || null
  }

  const calcularSaldoDevedor = (parcelasDoMutuo: Parcela[]) => {
    return parcelasDoMutuo
      .filter(p => !p.pago)
      .reduce((acc, p) => acc + p.valor_principal, 0)
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
            Contratos de Mútuo
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#6b7280'
          }}>
            Gerencie contratos de mútuo intercompany e com pessoas físicas
          </p>
        </div>
        <button
          onClick={openMutuoModal}
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
          Novo Contrato
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
              Total de Contratos
            </span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#111827' }}>
            {kpis.totalContratos}
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
              placeholder="Buscar por nº contrato, empresa..."
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

          {/* Filtro Devedora */}
          <select
            value={filtroDevedora}
            onChange={(e) => setFiltroDevedora(e.target.value)}
            style={{
              padding: '10px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
              backgroundColor: 'white'
            }}
          >
            <option value="">Todas Devedoras</option>
            {empresas.map(e => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>

          {/* Filtro Credora */}
          <select
            value={filtroCredora}
            onChange={(e) => setFiltroCredora(e.target.value)}
            style={{
              padding: '10px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
              backgroundColor: 'white'
            }}
          >
            <option value="">Todas Credoras</option>
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
        </div>
      </div>

      {/* Tabela de Contratos */}
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
                  Nº Contrato
                </th>
                <th style={{
                  padding: '16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase'
                }}>
                  Devedora → Credora
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
                  Principal
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
              {filteredMutuos.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{
                    padding: '48px 16px',
                    textAlign: 'center',
                    color: '#9ca3af',
                    fontSize: '14px'
                  }}>
                    Nenhum contrato encontrado
                  </td>
                </tr>
              ) : (
                filteredMutuos.map((mutuo) => {
                  const credoraLabel = mutuo.para_empresa?.nome || mutuo.contraparte_pf?.nome || '-'
                  // TODO: buscar parcelas do mutuo para calcular status
                  const status = { label: 'Em Curso', color: '#1e40af', bg: '#dbeafe' }
                  
                  return (
                    <tr key={mutuo.id} style={{
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
                        fontWeight: '500'
                      }}>
                        {mutuo.contrato_numero || `#${mutuo.id.substring(0, 8)}`}
                      </td>
                      <td style={{
                        padding: '16px',
                        fontSize: '14px',
                        color: '#374151'
                      }}>
                        <div>
                          <div style={{ fontWeight: '500', marginBottom: '2px' }}>
                            {mutuo.de_empresa?.nome || '-'}
                          </div>
                          <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                            → {credoraLabel}
                          </div>
                        </div>
                      </td>
                      <td style={{
                        padding: '16px',
                        fontSize: '14px',
                        color: '#374151'
                      }}>
                        {mutuo.indice} + {mutuo.spread_anual.toFixed(2)}% a.a.
                      </td>
                      <td style={{
                        padding: '16px',
                        fontSize: '14px',
                        color: '#374151',
                        fontWeight: '500',
                        textAlign: 'right'
                      }}>
                        {formatCurrency(mutuo.principal)}
                      </td>
                      <td style={{
                        padding: '16px',
                        fontSize: '14px',
                        color: '#374151'
                      }}>
                        <div style={{ fontSize: '12px' }}>
                          {formatDate(mutuo.data_inicio)}
                          {mutuo.data_fim && (
                            <> → {formatDate(mutuo.data_fim)}</>
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
                          justifyContent: 'flex-end'
                        }}>
                          <button
                            onClick={() => openCronograma(mutuo)}
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
                            onClick={() => handleEditMutuo(mutuo)}
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
                              setMutuoToDelete(mutuo.id)
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

      {/* Modal: Criar/Editar Contrato */}
      {showMutuoModal && (
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
              {editingMutuoId ? 'Editar Contrato de Mútuo' : 'Novo Contrato de Mútuo'}
            </h2>

            <form onSubmit={mutuoForm.handleSubmit(
              editingMutuoId ? handleUpdateMutuo : handleCreateMutuo
            )}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Empresa Devedora */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Empresa Devedora *
                  </label>
                  <select
                    {...mutuoForm.register('de_empresa_id')}
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
                    <option value="">Selecione a empresa devedora</option>
                    {empresas.map(e => (
                      <option key={e.id} value={e.id}>{e.nome}</option>
                    ))}
                  </select>
                  {mutuoForm.formState.errors.de_empresa_id && (
                    <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                      {mutuoForm.formState.errors.de_empresa_id.message}
                    </span>
                  )}
                </div>

                {/* Empresa Credora OU Contraparte PF */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Empresa Credora
                    </label>
                    <select
                      {...mutuoForm.register('para_empresa_id')}
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
                      <option value="">Selecione (opcional)</option>
                      {empresas.map(e => (
                        <option key={e.id} value={e.id}>{e.nome}</option>
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
                      OU Contraparte PF
                    </label>
                    <select
                      {...mutuoForm.register('contraparte_pf_id')}
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
                      <option value="">Selecione (opcional)</option>
                      {contrapartes.map(c => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Principal, Índice, Spread */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Principal (R$) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...mutuoForm.register('principal', { valueAsNumber: true })}
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
                      {...mutuoForm.register('indice')}
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
                    <input
                      type="number"
                      step="0.01"
                      {...mutuoForm.register('spread_anual', { valueAsNumber: true })}
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
                  </div>
                </div>

                {/* Carência e Periodicidade */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Carência (meses)
                    </label>
                    <input
                      type="number"
                      {...mutuoForm.register('carencia_meses', { valueAsNumber: true })}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                      placeholder="0"
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
                      {...mutuoForm.register('periodicidade')}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                      placeholder="MENSAL"
                    />
                  </div>
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
                      Data Início *
                    </label>
                    <input
                      type="date"
                      {...mutuoForm.register('data_inicio')}
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
                      Data Fim (opcional)
                    </label>
                    <input
                      type="date"
                      {...mutuoForm.register('data_fim')}
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

                {/* Multa e Mora */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Multa (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...mutuoForm.register('multa_percentual', { valueAsNumber: true })}
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
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Mora (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...mutuoForm.register('mora_percentual', { valueAsNumber: true })}
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
                    {...mutuoForm.register('contrato_numero')}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                    placeholder="Ex: CTR-2024-001"
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
                    {...mutuoForm.register('observacoes')}
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
                    placeholder="Informações adicionais sobre o contrato..."
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
                    onClick={closeMutuoModal}
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
                    {editingMutuoId ? 'Atualizar' : 'Criar'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drawer: Cronograma de Parcelas */}
      {showCronogramaDrawer && selectedMutuo && (
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
              maxWidth: '1000px',
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
                  Cronograma de Parcelas
                </h2>
                <p style={{
                  fontSize: '14px',
                  color: '#6b7280'
                }}>
                  Contrato: {selectedMutuo.contrato_numero || `#${selectedMutuo.id.substring(0, 8)}`}
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
                        }}>Principal</th>
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
                        }}>IOF</th>
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
                        }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parcelas.map((parcela) => {
                        const total = parcela.valor_principal + parcela.valor_juros + parcela.valor_iof
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
                              {formatCurrency(parcela.valor_principal)}
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
                              color: '#374151'
                            }}>
                              {formatCurrency(parcela.valor_iof)}
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
                          {formatCurrency(parcelas.reduce((acc, p) => acc + p.valor_principal, 0))}
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
                          {formatCurrency(parcelas.reduce((acc, p) => acc + p.valor_iof, 0))}
                        </td>
                        <td style={{
                          padding: '12px',
                          textAlign: 'right',
                          fontSize: '14px',
                          color: '#111827'
                        }}>
                          {formatCurrency(
                            parcelas.reduce((acc, p) => 
                              acc + p.valor_principal + p.valor_juros + p.valor_iof, 0
                            )
                          )}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Gerar Parcelas */}
      {showGerarParcelasModal && selectedMutuo && (
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
                  ℹ️ <strong>Cálculo base simplificado:</strong> Juros calculados linearmente com base no spread anual. 
                  Indexadores externos (CDI, IPCA, etc.) podem ser integrados futuramente.
                </div>

                {/* Parâmetros */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
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
                      Carência (meses)
                    </label>
                    <input
                      type="number"
                      {...gerarParcelasForm.register('carencia_meses', { valueAsNumber: true })}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                      min="0"
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
                      IOF (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...gerarParcelasForm.register('iof_percentual', { valueAsNumber: true })}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                      min="0"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                {/* Tipo de Amortização */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Tipo de Amortização
                  </label>
                  <select
                    {...gerarParcelasForm.register('tipo_amortizacao')}
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
                    <option value="PRICE">PRICE (Parcelas fixas)</option>
                    <option value="SAC">SAC (Amortização constante)</option>
                  </select>
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
                          <th style={{ padding: '8px', textAlign: 'right' }}>Principal</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Juros</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>IOF</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parcelasSimuladas.map((p, idx) => (
                          <tr key={idx} style={{ borderTop: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '8px', textAlign: 'center' }}>{p.num_parcela}</td>
                            <td style={{ padding: '8px' }}>{formatDate(p.data_vencimento)}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>
                              {formatCurrency(p.valor_principal)}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>
                              {formatCurrency(p.valor_juros)}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>
                              {formatCurrency(p.valor_iof)}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600' }}>
                              {formatCurrency(p.valor_principal + p.valor_juros + p.valor_iof)}
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
                    <span>Principal:</span>
                    <strong>{formatCurrency(selectedParcela.valor_principal)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>Juros:</span>
                    <strong>{formatCurrency(selectedParcela.valor_juros)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>IOF:</span>
                    <strong>{formatCurrency(selectedParcela.valor_iof)}</strong>
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
                      selectedParcela.valor_principal + 
                      selectedParcela.valor_juros + 
                      selectedParcela.valor_iof
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
              Excluir Contrato de Mútuo
            </h2>

            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              textAlign: 'center',
              marginBottom: '24px',
              lineHeight: '1.5'
            }}>
              Tem certeza que deseja excluir este contrato? Esta ação não pode ser desfeita.
            </p>

            <div style={{
              display: 'flex',
              gap: '12px'
            }}>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false)
                  setMutuoToDelete(null)
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
                onClick={handleDeleteMutuo}
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