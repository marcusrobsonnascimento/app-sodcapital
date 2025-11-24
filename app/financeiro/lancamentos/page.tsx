'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, Search, CheckCircle, AlertTriangle, XCircle, X, RefreshCw, ChevronDown } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import PlanoContaPicker from '@/components/planocontapicker'

// Toast notification system
type ToastType = 'success' | 'warning' | 'error'

interface Toast {
  id: number
  message: string
  type: ToastType
  requiresConfirmation?: boolean
}

// Types
interface Empresa {
  id: string
  nome: string
}

interface Projeto {
  id: string
  empresa_id: string
  nome: string
  projeto_pai_id: string | null
}

interface BancoConta {
  id: string
  empresa_id: string
  banco_nome: string
  numero_conta: string
  agencia: string
  nome_banco?: string
  banco?: { nome: string }
  bancos?: { nome: string } | { nome: string }[] | null
  digito_conta?: string
  tipo_conta: string
}

interface Contraparte {
  id: string
  nome: string
  apelido: string | null
}

interface PlanoContaFluxo {
  id: string
  codigo_conta: string
  categoria: string
  subcategoria: string
  tipo_fluxo: string
  sentido: 'Entrada' | 'Saida' | null
}

interface Retencao {
  id?: string
  imposto: string
  valor: number
  valorFormatado?: string
  detalhe: string | null
}

interface Lancamento {
  id: string
  tipo: 'Entrada' | 'Saida'
  empresa_id: string
  projeto_id: string | null
  subprojeto_id: string | null
  banco_conta_id: string | null
  contraparte_id: string | null
  plano_conta_id: string
  valor_bruto: number
  valor_liquido: number
  data_emissao: string | null
  data_vencimento: string
  data_previsao_pagamento: string | null
  data_liquidacao: string | null
  status: 'ABERTO' | 'PAGO_RECEBIDO' | 'CANCELADO'
  documento_tipo: string | null
  documento_numero: string | null
  observacoes: string | null
  created_at: string
  pagamento_terceiro: boolean
  empresa_pagadora_id: string | null
  empresa_nome?: string
  projeto_nome?: string
  subprojeto_nome?: string
  contraparte_nome?: string
  empresa_pagadora_nome?: string
  plano_conta?: PlanoContaFluxo
  retencoes?: Retencao[]
}

// Helpers de formatação
const formatCurrencyBRL = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

const formatCurrencyInput = (value: string): string => {
  const numbers = value.replace(/\D/g, '')
  if (!numbers) return ''
  const amount = parseInt(numbers, 10) / 100
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

const parseCurrencyInput = (value: string): number => {
  if (!value) return 0
  const cleaned = value.replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

const formatDateForInput = (date: string | null): string => {
  if (!date) return ''
  return date.split('T')[0]
}

// Função para formatar data para exibição sem aplicar timezone
const formatDateLocal = (dateString: string | null): string => {
  if (!dateString) return ''
  // Parse direto da string no formato YYYY-MM-DD para evitar conversão de timezone
  const [year, month, day] = dateString.split('T')[0].split('-')
  return `${day}/${month}/${year}`
}

// Schema de validação sem Zod - usaremos validação manual
interface LancamentoForm {
  tipo: 'Entrada' | 'Saida'
  empresa_id: string
  tipo_fluxo: string
  projeto_id?: string
  subprojeto_id?: string
  pagamento_terceiro: boolean
  empresa_pagadora_id?: string
  banco_conta_id: string
  contraparte_id: string
  plano_conta_id: string
  valor_bruto: number
  data_emissao: string
  data_vencimento: string
  data_previsao_pagamento?: string
  documento_tipo?: string
  documento_numero?: string
  observacoes?: string
}

const IMPOSTOS = [
  { value: 'COFINS', label: 'COFINS' },
  { value: 'CSLL', label: 'CSLL' },
  { value: 'INSS', label: 'INSS' },
  { value: 'IRRF', label: 'IRRF' },
  { value: 'ISSQN', label: 'ISSQN' },
  { value: 'OUTRO', label: 'Outro' },
  { value: 'PIS', label: 'PIS' }
]

export default function LancamentosPage() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [subprojetos, setSubprojetos] = useState<Projeto[]>([])
  const [bancosContas, setBancosContas] = useState<BancoConta[]>([])
  const [empresasPagadoras, setEmpresasPagadoras] = useState<Empresa[]>([])
  const [contrapartes, setContrapartes] = useState<Contraparte[]>([])
  const [tiposFluxo, setTiposFluxo] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isLancamentoPago, setIsLancamentoPago] = useState(false)
  const [statusOriginal, setStatusOriginal] = useState<'ABERTO' | 'PAGO_RECEBIDO' | 'CANCELADO' | null>(null)

  // Estados para paginação infinita
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const ITEMS_PER_PAGE = 50

  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTipoFilter, setSelectedTipoFilter] = useState<string>('')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('')
  const [selectedEmpresaFilter, setSelectedEmpresaFilter] = useState<string>('')
  const [selectedProjetoFilter, setSelectedProjetoFilter] = useState<string>('')
  const [selectedSubprojetoFilter, setSelectedSubprojetoFilter] = useState<string>('')
  const [selectedContraparteFilter, setSelectedContraparteFilter] = useState<string>('')
  const [selectedCategoriaFilter, setSelectedCategoriaFilter] = useState<string>('')
  const [dataVencimentoInicio, setDataVencimentoInicio] = useState('')
  const [dataVencimentoFim, setDataVencimentoFim] = useState('')

  // Filtros de coluna (inline na tabela)
  const [colFilterTipo, setColFilterTipo] = useState<string>('')
  const [colFilterPgtoTerc, setColFilterPgtoTerc] = useState<string>('')
  const [colFilterEmpresa, setColFilterEmpresa] = useState<string>('')
  const [colFilterProjeto, setColFilterProjeto] = useState<string>('')
  const [colFilterContraparte, setColFilterContraparte] = useState<string>('')
  const [colFilterCategoria, setColFilterCategoria] = useState<string>('')
  const [colFilterValorBruto, setColFilterValorBruto] = useState<string>('')
  const [colFilterValorLiquido, setColFilterValorLiquido] = useState<string>('')
  const [colFilterVencimento, setColFilterVencimento] = useState<string>('')
  const [colFilterStatus, setColFilterStatus] = useState<string>('')

  // Listas para os filtros
  const [projetosFilter, setProjetosFilter] = useState<Projeto[]>([])
  const [subprojetosFilter, setSubprojetosFilter] = useState<Projeto[]>([])
  const [categorias, setCategorias] = useState<string[]>([])

  // Estados para combobox de contraparte
  const [contraparteSearchTerm, setContraparteSearchTerm] = useState('')
  const [showContraparteDropdown, setShowContraparteDropdown] = useState(false)
  const [contraparteNomeExibicao, setContraparteNomeExibicao] = useState('')

  // Retenções
  const [retencoes, setRetencoes] = useState<Retencao[]>([])
  const [valorBruto, setValorBruto] = useState<number>(0)
  const [valorBrutoFormatado, setValorBrutoFormatado] = useState<string>('')
  const [valorLiquido, setValorLiquido] = useState<number>(0)

  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({
    show: false,
    id: null
  })
  const [liquidarModal, setLiquidarModal] = useState<{ show: boolean; id: string | null }>({
    show: false,
    id: null
  })
  const [dataLiquidacao, setDataLiquidacao] = useState('')
  const [validationModal, setValidationModal] = useState<{ show: boolean; message: string }>({
    show: false,
    message: ''
  })

  const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<LancamentoForm>({
    defaultValues: {
      tipo: 'Saida',
      empresa_id: '',
      tipo_fluxo: '',
      projeto_id: '',
      subprojeto_id: '',
      pagamento_terceiro: false,
      empresa_pagadora_id: '',
      banco_conta_id: '',
      contraparte_id: '',
      plano_conta_id: '',
      valor_bruto: 0,
      data_emissao: '',
      data_vencimento: '',
      data_previsao_pagamento: '',
      documento_tipo: '',
      documento_numero: '',
      observacoes: ''
    }
  })

  const tipo = watch('tipo')
  const empresaId = watch('empresa_id')
  const tipoFluxo = watch('tipo_fluxo')
  const projetoId = watch('projeto_id')
  const pagamentoTerceiro = watch('pagamento_terceiro')
  const empresaPagadoraId = watch('empresa_pagadora_id')

  // Toast functions
  const showToast = (message: string, type: ToastType = 'success', requiresConfirmation: boolean = false) => {
    const id = toastIdCounter
    setToastIdCounter(prev => prev + 1)
    setToasts(prev => [...prev, { id, message, type, requiresConfirmation }])
    
    if (!requiresConfirmation) {
      setTimeout(() => {
        dismissToast(id)
      }, 3000)
    }
  }

  const dismissToast = (id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  // Funções para filtros de coluna
  const formatFilterCurrency = (value: string): string => {
    const numbers = value.replace(/\D/g, '')
    if (!numbers) return ''
    const amount = parseInt(numbers, 10) / 100
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount)
  }

  const parseFilterCurrency = (value: string): number => {
    if (!value) return 0
    const cleaned = value.replace(/\./g, '').replace(',', '.')
    return parseFloat(cleaned) || 0
  }

  const clearAllColumnFilters = () => {
    setColFilterTipo('')
    setColFilterPgtoTerc('')
    setColFilterEmpresa('')
    setColFilterProjeto('')
    setColFilterContraparte('')
    setColFilterCategoria('')
    setColFilterValorBruto('')
    setColFilterValorLiquido('')
    setColFilterVencimento('')
    setColFilterStatus('')
  }

  const hasActiveColumnFilters = colFilterTipo || colFilterPgtoTerc || colFilterEmpresa || 
    colFilterProjeto || colFilterContraparte || colFilterCategoria || 
    colFilterValorBruto || colFilterValorLiquido || colFilterVencimento || colFilterStatus

  const getToastStyles = (type: ToastType) => {
    switch (type) {
      case 'success':
        return { borderColor: '#10b981', icon: CheckCircle, iconColor: '#10b981' }
      case 'warning':
        return { borderColor: '#f59e0b', icon: AlertTriangle, iconColor: '#f59e0b' }
      case 'error':
        return { borderColor: '#ef4444', icon: XCircle, iconColor: '#ef4444' }
    }
  }

  // Badge styles
  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'ABERTO':
        return { bg: '#fef3c7', text: '#92400e', label: 'Aberto' }
      case 'PAGO_RECEBIDO':
        return { bg: '#d1fae5', text: '#065f46', label: 'Liquidado' }
      case 'CANCELADO':
        return { bg: '#fee2e2', text: '#991b1b', label: 'Cancelado' }
      default:
        return { bg: '#f3f4f6', text: '#1f2937', label: status }
    }
  }

  const getTipoBadgeStyle = (tipo: string) => {
    switch (tipo) {
      case 'Entrada':
        return { bg: '#d1fae5', text: '#065f46', label: 'Recebimento' }
      case 'Saida':
        return { bg: '#fee2e2', text: '#991b1b', label: 'Pagamento' }
      default:
        return { bg: '#f3f4f6', text: '#1f2937', label: tipo }
    }
  }

  // Retenções handlers
  const adicionarRetencao = () => {
    setRetencoes(prev => [...prev, { imposto: 'IRRF', valor: 0, valorFormatado: '0,00', detalhe: null }])
  }

  const removerRetencao = (index: number) => {
    const novasRetencoes = retencoes.filter((_, i) => i !== index)
    setRetencoes(novasRetencoes)
  }

  const atualizarRetencao = (index: number, campo: string, valor: string) => {
    const novasRetencoes = [...retencoes]
    if (campo === 'valorFormatado') {
      const formatted = formatCurrencyInput(valor)
      const numericValue = parseCurrencyInput(formatted)
      novasRetencoes[index].valorFormatado = formatted
      novasRetencoes[index].valor = numericValue
    } else if (campo === 'imposto') {
      novasRetencoes[index].imposto = valor
    } else if (campo === 'detalhe') {
      novasRetencoes[index].detalhe = valor
    }
    setRetencoes(novasRetencoes)
  }

  // Carregar dados iniciais
  useEffect(() => {
    fetchEmpresas()
    fetchContrapartes()
    fetchTiposFluxo()
  }, [])

  useEffect(() => {
    if (empresaId) {
      fetchProjetos(empresaId)
      // Carregar empresas pagadoras (todas menos a selecionada)
      fetchEmpresasPagadoras(empresaId)
      // Carregar contas bancárias baseadas se é pagamento por terceiro
      if (pagamentoTerceiro && empresaPagadoraId) {
        fetchBancosContas(empresaPagadoraId)
      } else {
        fetchBancosContas(empresaId)
      }
      // Buscar projetos para o filtro
      fetchProjetosFilter(empresaId)
    } else {
      setProjetos([])
      setSubprojetos([])
      setBancosContas([])
      setEmpresasPagadoras([])
      setProjetosFilter([])
      setSubprojetosFilter([])
    }
  }, [empresaId, pagamentoTerceiro, empresaPagadoraId])

  useEffect(() => {
    if (projetoId) {
      fetchSubprojetos(projetoId)
    } else {
      setSubprojetos([])
    }
  }, [projetoId])

  useEffect(() => {
    if (selectedProjetoFilter) {
      fetchSubprojetosFilter(selectedProjetoFilter)
    } else {
      setSubprojetosFilter([])
    }
  }, [selectedProjetoFilter])

  // Calcular valor líquido quando retenções mudam ou valor bruto muda
  useEffect(() => {
    const totalRetencoes = retencoes.reduce((acc, ret) => acc + ret.valor, 0)
    const liquido = valorBruto - totalRetencoes
    setValorLiquido(liquido)
  }, [retencoes, valorBruto])

  // Carregar lançamentos quando filtros mudam
  useEffect(() => {
    setPage(0)
    setHasMore(true)
    fetchLancamentos(0, true)
  }, [
    searchTerm,
    selectedTipoFilter,
    selectedStatusFilter,
    selectedEmpresaFilter,
    selectedProjetoFilter,
    selectedSubprojetoFilter,
    selectedContraparteFilter,
    selectedCategoriaFilter,
    dataVencimentoInicio,
    dataVencimentoFim
  ])

  const fetchEmpresas = async () => {
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome')
      
      if (error) throw error
      setEmpresas(data || [])
    } catch (error) {
      console.error('Erro ao carregar empresas:', error)
    }
  }

  const fetchEmpresasPagadoras = async (empresaIdExcluir: string) => {
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome')
        .eq('ativo', true)
        .neq('id', empresaIdExcluir)
        .order('nome')
      
      if (error) throw error
      setEmpresasPagadoras(data || [])
    } catch (error) {
      console.error('Erro ao carregar empresas pagadoras:', error)
    }
  }

  const fetchProjetos = async (empresaId: string) => {
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, empresa_id, nome, projeto_pai_id')
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .is('projeto_pai_id', null)
        .order('nome')
      
      if (error) throw error
      setProjetos(data || [])
    } catch (error) {
      console.error('Erro ao carregar projetos:', error)
    }
  }

  const fetchSubprojetos = async (projetoId: string) => {
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, empresa_id, nome, projeto_pai_id')
        .eq('projeto_pai_id', projetoId)
        .eq('ativo', true)
        .order('nome')
      
      if (error) throw error
      setSubprojetos(data || [])
    } catch (error) {
      console.error('Erro ao carregar subprojetos:', error)
    }
  }

  const fetchProjetosFilter = async (empresaId: string) => {
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, empresa_id, nome, projeto_pai_id')
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .is('projeto_pai_id', null)
        .order('nome')
      
      if (error) throw error
      setProjetosFilter(data || [])
    } catch (error) {
      console.error('Erro ao carregar projetos para filtro:', error)
    }
  }

  const fetchSubprojetosFilter = async (projetoId: string) => {
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, empresa_id, nome, projeto_pai_id')
        .eq('projeto_pai_id', projetoId)
        .eq('ativo', true)
        .order('nome')
      
      if (error) throw error
      setSubprojetosFilter(data || [])
    } catch (error) {
      console.error('Erro ao carregar subprojetos para filtro:', error)
    }
  }

  const fetchBancosContas = async (empresaId: string) => {
    try {
      const { data, error } = await supabase
        .from('bancos_contas')
        .select(`
          id,
          empresa_id,
          banco_nome,
          numero_conta,
          agencia,
          tipo_conta,
          banco_id,
          bancos:banco_id (
            nome
          )
        `)
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .eq('tipo_conta', 'CC')
        .order('banco_nome')
      
      if (error) throw error
      setBancosContas(data || [])
    } catch (error) {
      console.error('Erro ao carregar bancos contas:', error)
    }
  }

  const fetchContrapartes = async () => {
    try {
      const { data, error } = await supabase
        .from('contrapartes')
        .select('id, nome, apelido')
        .eq('ativo', true)
        .order('nome')
      
      if (error) throw error
      setContrapartes(data || [])
    } catch (error) {
      console.error('Erro ao carregar contrapartes:', error)
    }
  }

  const fetchTiposFluxo = async () => {
    try {
      const { data, error } = await supabase
        .from('plano_contas_fluxo')
        .select('tipo_fluxo')
        .eq('ativo', true)
      
      if (error) throw error
      const uniqueTipos = Array.from(new Set(data?.map(item => item.tipo_fluxo) || []))
      setTiposFluxo(uniqueTipos.sort())
    } catch (error) {
      console.error('Erro ao carregar tipos de fluxo:', error)
    }
  }

  const fetchCategorias = async () => {
    try {
      const { data, error } = await supabase
        .from('plano_contas_fluxo')
        .select('categoria')
        .eq('ativo', true)
      
      if (error) throw error
      const uniqueCategorias = Array.from(new Set(data?.map(item => item.categoria) || []))
      setCategorias(uniqueCategorias.sort())
    } catch (error) {
      console.error('Erro ao carregar categorias:', error)
    }
  }

  useEffect(() => {
    fetchCategorias()
  }, [])

  const fetchLancamentos = async (pageNum: number = 0, reset: boolean = false) => {
    try {
      if (pageNum === 0) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }

      let query = supabase
        .from('lancamentos')
        .select(`
          id,
          tipo,
          empresa_id,
          projeto_id,
          subprojeto_id,
          banco_conta_id,
          contraparte_id,
          plano_conta_id,
          pagamento_terceiro,
          empresa_pagadora_id,
          valor_bruto,
          valor_liquido,
          data_emissao,
          data_vencimento,
          data_previsao_pagamento,
          data_liquidacao,
          status,
          documento_tipo,
          documento_numero,
          observacoes,
          created_at,
          empresas!lancamentos_empresa_id_fkey(nome),
          empresa_pagadora:empresas!lancamentos_empresa_pagadora_id_fkey(nome),
          projeto:projetos!projeto_id(nome),
          subprojeto:projetos!subprojeto_id(nome),
          contrapartes(nome),
          plano_contas_fluxo!inner(
            id,
            codigo_conta,
            categoria,
            subcategoria,
            tipo_fluxo
          )
        `)

      // Aplicar filtros
      if (selectedTipoFilter) {
        query = query.eq('tipo', selectedTipoFilter)
      }
      if (selectedStatusFilter) {
        query = query.eq('status', selectedStatusFilter)
      }
      if (selectedEmpresaFilter) {
        query = query.eq('empresa_id', selectedEmpresaFilter)
      }
      if (selectedProjetoFilter) {
        query = query.eq('projeto_id', selectedProjetoFilter)
      }
      if (selectedSubprojetoFilter) {
        query = query.eq('subprojeto_id', selectedSubprojetoFilter)
      }
      if (selectedContraparteFilter) {
        query = query.eq('contraparte_id', selectedContraparteFilter)
      }
      if (selectedCategoriaFilter) {
        query = query.eq('plano_contas_fluxo.categoria', selectedCategoriaFilter)
      }
      if (dataVencimentoInicio) {
        query = query.gte('data_vencimento', dataVencimentoInicio)
      }
      if (dataVencimentoFim) {
        query = query.lte('data_vencimento', dataVencimentoFim)
      }
      if (searchTerm) {
        query = query.or(`documento_numero.ilike.%${searchTerm}%,observacoes.ilike.%${searchTerm}%`)
      }

      // Paginação
      const from = pageNum * ITEMS_PER_PAGE
      const to = from + ITEMS_PER_PAGE - 1

      query = query
        .order('data_vencimento', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to)

      const { data, error } = await query

      if (error) throw error

      const formattedData = (data || []).map((item: any) => ({
        ...item,
        empresa_nome: item.empresas?.nome,
        empresa_pagadora_nome: Array.isArray(item.empresa_pagadora) ? item.empresa_pagadora[0]?.nome : item.empresa_pagadora?.nome,
        projeto_nome: item.projeto?.nome,
        subprojeto_nome: item.subprojeto?.nome,
        contraparte_nome: Array.isArray(item.contrapartes) ? item.contrapartes[0]?.nome : item.contrapartes?.nome,
        plano_conta: item.plano_contas_fluxo
      }))

      // Buscar retenções para cada lançamento
      const lancamentosComRetencoes = await Promise.all(
        formattedData.map(async (lanc: any) => {
          const { data: retencoesData, error: retencoesError } = await supabase
            .from('lancamento_retencoes')
            .select('*')
            .eq('lancamento_id', lanc.id)

          if (retencoesError) {
            console.error('Erro ao buscar retenções:', retencoesError)
            return { ...lanc, retencoes: [] }
          }

          return {
            ...lanc,
            retencoes: retencoesData || []
          }
        })
      )

      if (reset || pageNum === 0) {
        setLancamentos(lancamentosComRetencoes)
      } else {
        setLancamentos(prev => [...prev, ...lancamentosComRetencoes])
      }

      setHasMore(lancamentosComRetencoes.length === ITEMS_PER_PAGE)
    } catch (error) {
      console.error('Erro ao carregar lançamentos:', error)
      showToast('Erro ao carregar lançamentos', 'error')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const handleLoadMore = () => {
    const nextPage = page + 1
    setPage(nextPage)
    fetchLancamentos(nextPage, false)
  }

  const openModal = async (lancamento?: Lancamento) => {
    if (lancamento) {
      setEditingId(lancamento.id)
      setIsLancamentoPago(lancamento.status === 'PAGO_RECEBIDO')
      setStatusOriginal(lancamento.status)
      
      // Carregar dados dependentes da empresa
      await fetchProjetos(lancamento.empresa_id)
      await fetchEmpresasPagadoras(lancamento.empresa_id)
      
      // Carregar contas bancárias baseadas em pagamento_terceiro
      if (lancamento.pagamento_terceiro && lancamento.empresa_pagadora_id) {
        await fetchBancosContas(lancamento.empresa_pagadora_id)
      } else {
        await fetchBancosContas(lancamento.empresa_id)
      }
      
      // Se tiver projeto, carregar subprojetos
      if (lancamento.projeto_id) {
        await fetchSubprojetos(lancamento.projeto_id)
      }
      
      setValue('tipo', lancamento.tipo)
      setValue('empresa_id', lancamento.empresa_id)
      setValue('projeto_id', lancamento.projeto_id || '')
      setValue('subprojeto_id', lancamento.subprojeto_id || '')
      setValue('pagamento_terceiro', lancamento.pagamento_terceiro || false)
      setValue('empresa_pagadora_id', lancamento.empresa_pagadora_id || '')
      setValue('banco_conta_id', lancamento.banco_conta_id || '')
      setValue('contraparte_id', lancamento.contraparte_id || '')
      setValue('plano_conta_id', lancamento.plano_conta_id)
      setValue('data_emissao', formatDateForInput(lancamento.data_emissao))
      setValue('data_vencimento', formatDateForInput(lancamento.data_vencimento))
      setValue('data_previsao_pagamento', formatDateForInput(lancamento.data_previsao_pagamento))
      setValue('documento_tipo', lancamento.documento_tipo || '')
      setValue('documento_numero', lancamento.documento_numero || '')
      setValue('observacoes', lancamento.observacoes || '')
      
      // Definir valor bruto
      setValorBruto(lancamento.valor_bruto)
      setValorBrutoFormatado(formatCurrencyInput(lancamento.valor_bruto.toFixed(2)))
      setValue('valor_bruto', lancamento.valor_bruto)

      // Carregar tipo_fluxo
      if (lancamento.plano_conta) {
        setValue('tipo_fluxo', lancamento.plano_conta.tipo_fluxo)
      }

      // Carregar retenções
      const { data: retencoesData, error: retencoesError } = await supabase
        .from('lancamento_retencoes')
        .select('*')
        .eq('lancamento_id', lancamento.id)

      if (retencoesError) {
        console.error('Erro ao carregar retenções:', retencoesError)
        setRetencoes([])
      } else {
        const retencoesFormatadas = (retencoesData || []).map(ret => ({
          ...ret,
          valorFormatado: formatCurrencyInput(ret.valor.toFixed(2))
        }))
        setRetencoes(retencoesFormatadas)
      }

      // Carregar nome da contraparte
      if (lancamento.contraparte_id) {
        // Primeiro tentar usar o nome que veio com o lançamento
        if (lancamento.contraparte_nome) {
          setContraparteNomeExibicao(lancamento.contraparte_nome)
        } else {
          // Se não veio, buscar na lista de contrapartes
          const contraparte = contrapartes.find(c => c.id === lancamento.contraparte_id)
          if (contraparte) {
            setContraparteNomeExibicao(contraparte.apelido || contraparte.nome)
          }
        }
      } else {
        setContraparteNomeExibicao('')
      }
    } else {
      setEditingId(null)
      setIsLancamentoPago(false)
      setStatusOriginal(null)
      reset()
      setRetencoes([])
      setValorBruto(0)
      setValorBrutoFormatado('')
      setValorLiquido(0)
      setContraparteNomeExibicao('')
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setIsLancamentoPago(false)
    setStatusOriginal(null)
    reset()
    setRetencoes([])
    setValorBruto(0)
    setValorBrutoFormatado('')
    setValorLiquido(0)
    setContraparteNomeExibicao('')
  }

  const onSubmit = async (formData: LancamentoForm) => {
    try {
      // Validação de campos obrigatórios
      const camposFaltando: string[] = []

      if (!formData.empresa_id) camposFaltando.push('Empresa')
      if (!formData.tipo_fluxo) camposFaltando.push('Tipo de Fluxo')
      if (formData.tipo_fluxo !== 'Corporativo' && !formData.projeto_id) camposFaltando.push('Projeto')
      if (formData.pagamento_terceiro && !formData.empresa_pagadora_id) camposFaltando.push('Empresa Pagadora')
      if (!formData.banco_conta_id) camposFaltando.push('Conta Bancária')
      if (!formData.contraparte_id) camposFaltando.push('Contraparte')
      if (!formData.plano_conta_id) camposFaltando.push('Plano de Conta')
      if (!valorBruto || valorBruto <= 0) camposFaltando.push('Valor Bruto')
      if (!formData.data_emissao) camposFaltando.push('Data Emissão')
      if (!formData.data_vencimento) camposFaltando.push('Data Vencimento')

      if (camposFaltando.length > 0) {
        const mensagem = camposFaltando.join(', ')
        setValidationModal({ show: true, message: mensagem })
        return
      }

      const lancamentoData = {
        tipo: formData.tipo,
        empresa_id: formData.empresa_id,
        projeto_id: formData.projeto_id || null,
        subprojeto_id: formData.subprojeto_id || null,
        pagamento_terceiro: formData.pagamento_terceiro || false,
        empresa_pagadora_id: formData.pagamento_terceiro ? formData.empresa_pagadora_id || null : null,
        banco_conta_id: formData.banco_conta_id,
        contraparte_id: formData.contraparte_id,
        plano_conta_id: formData.plano_conta_id,
        valor_bruto: valorBruto,
        valor_liquido: valorLiquido,
        data_emissao: formData.data_emissao,
        data_vencimento: formData.data_vencimento,
        data_previsao_pagamento: formData.data_previsao_pagamento || null,
        documento_tipo: formData.documento_tipo || null,
        documento_numero: formData.documento_numero || null,
        observacoes: formData.observacoes || null
      }

      if (editingId) {
        // Atualizar
        const { error } = await supabase
          .from('lancamentos')
          .update(lancamentoData)
          .eq('id', editingId)

        if (error) throw error

        // Deletar retenções antigas
        await supabase
          .from('lancamento_retencoes')
          .delete()
          .eq('lancamento_id', editingId)

        // Inserir novas retenções
        if (retencoes.length > 0) {
          const retencoesData = retencoes.map(ret => ({
            lancamento_id: editingId,
            imposto: ret.imposto,
            valor: ret.valor,
            detalhe: ret.detalhe
          }))

          const { error: retencoesError } = await supabase
            .from('lancamento_retencoes')
            .insert(retencoesData)

          if (retencoesError) throw retencoesError
        }

        showToast('Lançamento atualizado com sucesso!')
      } else {
        // Criar
        const { data, error } = await supabase
          .from('lancamentos')
          .insert([lancamentoData])
          .select()
          .single()

        if (error) throw error

        // Inserir retenções
        if (retencoes.length > 0) {
          const retencoesData = retencoes.map(ret => ({
            lancamento_id: data.id,
            imposto: ret.imposto,
            valor: ret.valor,
            detalhe: ret.detalhe
          }))

          const { error: retencoesError } = await supabase
            .from('lancamento_retencoes')
            .insert(retencoesData)

          if (retencoesError) throw retencoesError
        }

        showToast('Lançamento criado com sucesso!')
      }

      closeModal()
      fetchLancamentos()
    } catch (error) {
      console.error('Erro ao salvar lançamento:', error)
      showToast('Erro ao salvar lançamento', 'error', true)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      // Primeiro deletar as retenções
      await supabase
        .from('lancamento_retencoes')
        .delete()
        .eq('lancamento_id', id)

      // Depois deletar o lançamento
      const { error } = await supabase
        .from('lancamentos')
        .delete()
        .eq('id', id)

      if (error) throw error

      showToast('Lançamento excluído com sucesso!')
      setDeleteConfirm({ show: false, id: null })
      fetchLancamentos()
    } catch (error) {
      console.error('Erro ao excluir lançamento:', error)
      showToast('Erro ao excluir lançamento', 'error', true)
    }
  }

  const handleLiquidar = async () => {
    if (!liquidarModal.id || !dataLiquidacao) return

    try {
      const { error } = await supabase
        .from('lancamentos')
        .update({
          status: 'PAGO_RECEBIDO',
          data_liquidacao: dataLiquidacao
        })
        .eq('id', liquidarModal.id)

      if (error) throw error

      showToast('Lançamento liquidado com sucesso!')
      setLiquidarModal({ show: false, id: null })
      setDataLiquidacao('')
      fetchLancamentos()
    } catch (error) {
      console.error('Erro ao liquidar lançamento:', error)
      showToast('Erro ao liquidar lançamento', 'error', true)
    }
  }

  const filteredContrapartes = contrapartes.filter(c =>
    contraparteSearchTerm === '' ||
    c.nome.toLowerCase().includes(contraparteSearchTerm.toLowerCase()) ||
    (c.apelido && c.apelido.toLowerCase().includes(contraparteSearchTerm.toLowerCase()))
  )

  const handleSelectContraparte = (contraparte: Contraparte) => {
    setValue('contraparte_id', contraparte.id)
    setContraparteNomeExibicao(contraparte.apelido || contraparte.nome)
    setContraparteSearchTerm('')
    setShowContraparteDropdown(false)
  }

  // Filtrar lançamentos pelos filtros de coluna
  const lancamentosFiltrados = lancamentos.filter((lancamento) => {
    // Filtro TIPO
    if (colFilterTipo && lancamento.tipo !== colFilterTipo) return false

    // Filtro PGTO TERC
    if (colFilterPgtoTerc) {
      const isPgtoTerc = lancamento.pagamento_terceiro
      if (colFilterPgtoTerc === 'SIM' && !isPgtoTerc) return false
      if (colFilterPgtoTerc === 'NAO' && isPgtoTerc) return false
    }

    // Filtro EMPRESA
    if (colFilterEmpresa && lancamento.empresa_id !== colFilterEmpresa) return false

    // Filtro PROJETO
    if (colFilterProjeto && lancamento.projeto_id !== colFilterProjeto) return false

    // Filtro CONTRAPARTE
    if (colFilterContraparte && lancamento.contraparte_id !== colFilterContraparte) return false

    // Filtro CATEGORIA
    if (colFilterCategoria && lancamento.plano_conta?.categoria !== colFilterCategoria) return false

    // Filtro VALOR BRUTO
    if (colFilterValorBruto) {
      const filterValue = parseFilterCurrency(colFilterValorBruto)
      if (filterValue > 0 && lancamento.valor_bruto !== filterValue) return false
    }

    // Filtro VALOR LÍQUIDO
    if (colFilterValorLiquido) {
      const filterValue = parseFilterCurrency(colFilterValorLiquido)
      if (filterValue > 0 && lancamento.valor_liquido !== filterValue) return false
    }

    // Filtro VENCIMENTO
    if (colFilterVencimento && lancamento.data_vencimento !== colFilterVencimento) return false

    // Filtro STATUS
    if (colFilterStatus && lancamento.status !== colFilterStatus) return false

    return true
  })

  return (
    <div style={{ padding: '24px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      {/* Cabeçalho */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <h1 style={{
          fontSize: '26px',
          fontWeight: '700',
          color: '#1f2937',
          margin: 0
        }}>
          Lançamentos Financeiros
        </h1>
        <button
          onClick={() => openModal()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 20px',
            backgroundColor: '#1555D6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1044b5'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1555D6'}
        >
          <Plus size={16} />
          Novo Lançamento
        </button>
      </div>

      {/* Filtros */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '16px'
        }}>
          {/* Busca */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Buscar
            </label>
            <div style={{ position: 'relative' }}>
              <Search style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '16px',
                height: '16px',
                color: '#9ca3af'
              }} />
              <input
                type="text"
                placeholder="Doc ou Observação..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 10px 9px 36px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#1555D6'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>
          </div>

          {/* Filtro Tipo */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Tipo
            </label>
            <select
              value={selectedTipoFilter}
              onChange={(e) => setSelectedTipoFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todos</option>
              <option value="Entrada">Recebimento</option>
              <option value="Saida">Pagamento</option>
            </select>
          </div>

          {/* Filtro Status */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Status
            </label>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todos</option>
              <option value="ABERTO">Aberto</option>
              <option value="PAGO_RECEBIDO">Liquidado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </div>

          {/* Filtro Empresa */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Empresa
            </label>
            <select
              value={selectedEmpresaFilter}
              onChange={(e) => {
                setSelectedEmpresaFilter(e.target.value)
                setSelectedProjetoFilter('')
                setSelectedSubprojetoFilter('')
                if (e.target.value) {
                  fetchProjetosFilter(e.target.value)
                } else {
                  setProjetosFilter([])
                  setSubprojetosFilter([])
                }
              }}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todas</option>
              {empresas.map(empresa => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Projeto */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Projeto
            </label>
            <select
              value={selectedProjetoFilter}
              onChange={(e) => {
                setSelectedProjetoFilter(e.target.value)
                setSelectedSubprojetoFilter('')
                if (e.target.value) {
                  fetchSubprojetosFilter(e.target.value)
                } else {
                  setSubprojetosFilter([])
                }
              }}
              disabled={!selectedEmpresaFilter}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: selectedEmpresaFilter ? 'pointer' : 'not-allowed',
                backgroundColor: selectedEmpresaFilter ? 'white' : '#f9fafb',
                color: selectedEmpresaFilter ? '#1f2937' : '#9ca3af'
              }}
            >
              <option value="">Todos</option>
              {projetosFilter.map(projeto => (
                <option key={projeto.id} value={projeto.id}>
                  {projeto.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Subprojeto */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Subprojeto
            </label>
            <select
              value={selectedSubprojetoFilter}
              onChange={(e) => setSelectedSubprojetoFilter(e.target.value)}
              disabled={!selectedProjetoFilter}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: selectedProjetoFilter ? 'pointer' : 'not-allowed',
                backgroundColor: selectedProjetoFilter ? 'white' : '#f9fafb',
                color: selectedProjetoFilter ? '#1f2937' : '#9ca3af'
              }}
            >
              <option value="">Todos</option>
              {subprojetosFilter.map(subprojeto => (
                <option key={subprojeto.id} value={subprojeto.id}>
                  {subprojeto.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Contraparte */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Contraparte
            </label>
            <select
              value={selectedContraparteFilter}
              onChange={(e) => setSelectedContraparteFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todas</option>
              {contrapartes.map(contraparte => (
                <option key={contraparte.id} value={contraparte.id}>
                  {contraparte.apelido || contraparte.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Categoria */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Categoria
            </label>
            <select
              value={selectedCategoriaFilter}
              onChange={(e) => setSelectedCategoriaFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todas</option>
              {categorias.map(categoria => (
                <option key={categoria} value={categoria}>
                  {categoria}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Data Vencimento Início */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Vencimento (Início)
            </label>
            <input
              type="date"
              value={dataVencimentoInicio}
              onChange={(e) => setDataVencimentoInicio(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>

          {/* Filtro Data Vencimento Fim */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Vencimento (Fim)
            </label>
            <input
              type="date"
              value={dataVencimentoFim}
              onChange={(e) => setDataVencimentoFim(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>
        </div>

        {/* Botões de ação */}
        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={() => {
              setSearchTerm('')
              setSelectedTipoFilter('')
              setSelectedStatusFilter('')
              setSelectedEmpresaFilter('')
              setSelectedProjetoFilter('')
              setSelectedSubprojetoFilter('')
              setSelectedContraparteFilter('')
              setSelectedCategoriaFilter('')
              setDataVencimentoInicio('')
              setDataVencimentoFim('')
              setProjetosFilter([])
              setSubprojetosFilter([])
              // Limpar filtros de coluna
              clearAllColumnFilters()
            }}
            style={{
              padding: '9px 18px',
              backgroundColor: 'white',
              color: '#6b7280',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
          >
            Limpar Filtros
          </button>
          <button
            onClick={() => fetchLancamentos()}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 18px',
              backgroundColor: loading ? '#d1d5db' : '#1555D6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = '#1044b5'
            }}
            onMouseOut={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = '#1555D6'
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        {/* Indicador de filtros de coluna ativos */}
        {hasActiveColumnFilters && (
          <div style={{
            padding: '8px 16px',
            backgroundColor: '#eff6ff',
            borderBottom: '1px solid #bfdbfe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ fontSize: '13px', color: '#1e40af' }}>
              <strong>{lancamentosFiltrados.length}</strong> de <strong>{lancamentos.length}</strong> lançamentos exibidos (filtros de coluna ativos)
            </span>
            <button
              onClick={clearAllColumnFilters}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#1e40af',
                backgroundColor: 'white',
                border: '1px solid #93c5fd',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Limpar filtros de coluna
            </button>
          </div>
        )}
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'left',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  TIPO
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'center',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  PGTO TERC
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'left',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  EMPRESA
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'left',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  PROJETO
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'left',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  CONTRAPARTE
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'left',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  CATEGORIA
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'right',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  VALOR BRUTO
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'right',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  VALOR LÍQUIDO
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'center',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  VENCIMENTO
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'center',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  STATUS
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'center',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  AÇÕES
                </th>
              </tr>
              {/* Linha de Filtros */}
              <tr style={{ backgroundColor: '#ffffff', borderBottom: '2px solid #e5e7eb' }}>
                {/* Filtro TIPO */}
                <td style={{ padding: '4px 8px' }}>
                  <select
                    value={colFilterTipo}
                    onChange={(e) => setColFilterTipo(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Todos</option>
                    <option value="Saida">Pagamento</option>
                    <option value="Entrada">Recebimento</option>
                  </select>
                </td>
                {/* Filtro PGTO TERC */}
                <td style={{ padding: '4px 8px' }}>
                  <select
                    value={colFilterPgtoTerc}
                    onChange={(e) => setColFilterPgtoTerc(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Todos</option>
                    <option value="SIM">Sim</option>
                    <option value="NAO">Não</option>
                  </select>
                </td>
                {/* Filtro EMPRESA */}
                <td style={{ padding: '4px 8px' }}>
                  <select
                    value={colFilterEmpresa}
                    onChange={(e) => setColFilterEmpresa(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Todas</option>
                    {empresas.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.nome}</option>
                    ))}
                  </select>
                </td>
                {/* Filtro PROJETO */}
                <td style={{ padding: '4px 8px' }}>
                  <select
                    value={colFilterProjeto}
                    onChange={(e) => setColFilterProjeto(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Todos</option>
                    {projetosFilter.map(proj => (
                      <option key={proj.id} value={proj.id}>{proj.nome}</option>
                    ))}
                  </select>
                </td>
                {/* Filtro CONTRAPARTE */}
                <td style={{ padding: '4px 8px' }}>
                  <select
                    value={colFilterContraparte}
                    onChange={(e) => setColFilterContraparte(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Todas</option>
                    {contrapartes.map(cp => (
                      <option key={cp.id} value={cp.id}>{cp.apelido || cp.nome}</option>
                    ))}
                  </select>
                </td>
                {/* Filtro CATEGORIA */}
                <td style={{ padding: '4px 8px' }}>
                  <select
                    value={colFilterCategoria}
                    onChange={(e) => setColFilterCategoria(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Todas</option>
                    {categorias.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </td>
                {/* Filtro VALOR BRUTO */}
                <td style={{ padding: '4px 8px' }}>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={colFilterValorBruto}
                    onChange={(e) => setColFilterValorBruto(formatFilterCurrency(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      textAlign: 'right'
                    }}
                  />
                </td>
                {/* Filtro VALOR LÍQUIDO */}
                <td style={{ padding: '4px 8px' }}>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={colFilterValorLiquido}
                    onChange={(e) => setColFilterValorLiquido(formatFilterCurrency(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      textAlign: 'right'
                    }}
                  />
                </td>
                {/* Filtro VENCIMENTO */}
                <td style={{ padding: '4px 8px' }}>
                  <input
                    type="date"
                    value={colFilterVencimento}
                    onChange={(e) => setColFilterVencimento(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px'
                    }}
                  />
                </td>
                {/* Filtro STATUS */}
                <td style={{ padding: '4px 8px' }}>
                  <select
                    value={colFilterStatus}
                    onChange={(e) => setColFilterStatus(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Todos</option>
                    <option value="ABERTO">Aberto</option>
                    <option value="PAGO_RECEBIDO">Liquidado</option>
                    <option value="CANCELADO">Cancelado</option>
                  </select>
                </td>
                {/* Botão Limpar Filtros */}
                <td style={{ padding: '4px 8px' }}>
                  {hasActiveColumnFilters && (
                    <button
                      onClick={clearAllColumnFilters}
                      title="Limpar todos os filtros"
                      style={{
                        width: '100%',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: '500',
                        color: '#dc2626',
                        backgroundColor: '#fee2e2',
                        border: '1px solid #fecaca',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                    >
                      <X size={12} />
                      Limpar
                    </button>
                  )}
                </td>
              </tr>
            </thead>
            <tbody>
              {lancamentosFiltrados.map((lancamento) => {
                const statusStyle = getStatusBadgeStyle(lancamento.status)
                const tipoStyle = getTipoBadgeStyle(lancamento.tipo)

                return (
                  <tr
                    key={lancamento.id}
                    style={{
                      borderBottom: '1px solid #f3f4f6',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    {/* TIPO */}
                    <td style={{ padding: '6px 8px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '8px',
                        fontWeight: '600',
                        backgroundColor: tipoStyle.bg,
                        color: tipoStyle.text,
                        whiteSpace: 'nowrap'
                      }}>
                        {tipoStyle.label}
                      </span>
                    </td>

                    {/* PGTO TERCEIRO */}
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      {lancamento.pagamento_terceiro ? (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <span
                            className="tooltip-btn"
                            data-tooltip={`Pago por: ${lancamento.empresa_pagadora_nome || 'N/A'}`}
                            style={{
                              display: 'inline-block',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '8px',
                              fontWeight: '600',
                              backgroundColor: '#dbeafe',
                              color: '#1e40af',
                              whiteSpace: 'nowrap',
                              cursor: 'help'
                            }}
                          >
                            SIM
                          </span>
                        </div>
                      ) : (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          fontSize: '8px',
                          fontWeight: '500',
                          color: '#6b7280'
                        }}>
                          NÃO
                        </span>
                      )}
                    </td>

                    {/* EMPRESA */}
                    <td style={{
                      padding: '6px 8px',
                      fontSize: '9px',
                      color: '#1f2937',
                      fontWeight: '500',
                      wordWrap: 'break-word',
                      wordBreak: 'break-word',
                      whiteSpace: 'normal',
                      lineHeight: '1.4',
                    }}>
                      {lancamento.empresa_nome}
                    </td>

                    {/* PROJETO */}
                    <td style={{
                      padding: '6px 8px',
                      fontSize: '9px',
                      color: '#6b7280',
                      wordWrap: 'break-word',
                      wordBreak: 'break-word',
                      whiteSpace: 'normal',
                      lineHeight: '1.4',
                    }}>
                      {lancamento.projeto_nome || '-'}
                    </td>

                    {/* CONTRAPARTE */}
                    <td style={{
                      padding: '6px 8px',
                      fontSize: '9px',
                      color: '#6b7280',
                      wordWrap: 'break-word',
                      wordBreak: 'break-word',
                      whiteSpace: 'normal',
                      lineHeight: '1.4',
                    }}>
                      {lancamento.contraparte_nome || '-'}
                    </td>

                    {/* CATEGORIA */}
                    <td style={{
                      padding: '6px 8px',
                      fontSize: '9px',
                      color: '#6b7280',
                      wordWrap: 'break-word',
                      wordBreak: 'break-word',
                      whiteSpace: 'normal',
                      lineHeight: '1.4',
                    }}>
                      {lancamento.plano_conta?.categoria || '-'}
                    </td>

                    {/* VALOR BRUTO */}
                    <td style={{
                      padding: '6px 8px',
                      fontSize: '9px',
                      color: '#1f2937',
                      fontWeight: '600',
                      textAlign: 'right',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatCurrencyBRL(lancamento.valor_bruto)}
                    </td>

                    {/* VALOR LÍQUIDO */}
                    <td style={{
                      padding: '6px 8px',
                      fontSize: '9px',
                      color: '#1f2937',
                      fontWeight: '600',
                      textAlign: 'right',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatCurrencyBRL(lancamento.valor_liquido)}
                    </td>

                    {/* VENCIMENTO */}
                    <td style={{
                      padding: '6px 8px',
                      fontSize: '9px',
                      color: '#6b7280',
                      whiteSpace: 'nowrap',
                      textAlign: 'center'
                    }}>
                      {formatDateLocal(lancamento.data_vencimento)}
                    </td>

                    {/* STATUS */}
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '8px',
                        fontWeight: '600',
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.text,
                        whiteSpace: 'nowrap'
                      }}>
                        {statusStyle.label}
                      </span>
                    </td>


                    {/* AÇÕES */}
                    <td style={{
                      padding: '6px 8px',
                      textAlign: 'center'
                    }}>
                      <div style={{
                        display: 'flex',
                        gap: '6px',
                        justifyContent: 'center'
                      }}>
                        {lancamento.status === 'ABERTO' && (
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <button
                              onClick={() => setLiquidarModal({ show: true, id: lancamento.id })}
                              className="tooltip-btn"
                              data-tooltip="Liquidar"
                              style={{
                                padding: '4px',
                                backgroundColor: '#d1fae5',
                                color: '#10b981',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s'
                              }}
                              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#a7f3d0'}
                              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#d1fae5'}
                            >
                              <CheckCircle size={13} />
                            </button>
                          </div>
                        )}
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <button
                            onClick={() => openModal(lancamento)}
                            className="tooltip-btn"
                            data-tooltip="Editar"
                            style={{
                              padding: '4px',
                              backgroundColor: '#e0e7ff',
                              color: '#1555D6',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#c7d2fe'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#e0e7ff'}
                          >
                            <Pencil size={13} />
                          </button>
                        </div>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <button
                            onClick={() => setDeleteConfirm({ show: true, id: lancamento.id })}
                            className="tooltip-btn"
                            data-tooltip="Excluir"
                            style={{
                              padding: '4px',
                              backgroundColor: '#fee2e2',
                              color: '#ef4444',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fecaca'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            borderTop: '1px solid #e5e7eb'
          }}>
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              style={{
                padding: '10px 24px',
                backgroundColor: loadingMore ? '#d1d5db' : '#1555D6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: loadingMore ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {loadingMore ? 'Carregando...' : 'Carregar Mais'}
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
          }}
          onClick={closeModal}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '100%',
              maxHeight: '90vh',
              margin: '16px',
              display: 'flex',
              flexDirection: 'column',
              animation: 'scaleIn 0.2s ease-out',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              position: 'sticky',
              top: 0,
              backgroundColor: 'white',
              borderBottom: '1px solid #e5e7eb',
              padding: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 10
            }}>
              <h2 style={{
                fontSize: '18px',
                fontWeight: '700',
                color: '#1f2937',
                margin: 0
              }}>
                {editingId ? 'Editar Lançamento' : 'Novo Lançamento'}
              </h2>
              <button
                onClick={closeModal}
                style={{
                  padding: '6px',
                  backgroundColor: '#f3f4f6',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
              >
                <X size={18} color="#6b7280" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit(onSubmit)} style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '14px',
                marginBottom: '16px'
              }}>
                {/* Empresa */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Empresa *
                  </label>
                  <select
                    {...register('empresa_id')}
                    disabled={isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                  >
                    <option value="">Selecione...</option>
                    {empresas.map(empresa => (
                      <option key={empresa.id} value={empresa.id}>
                        {empresa.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tipo de Fluxo */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Tipo de Fluxo *
                  </label>
                  <select
                    {...register('tipo_fluxo')}
                    disabled={isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                  >
                    <option value="">Selecione...</option>
                    {tiposFluxo.map(tipoFluxo => (
                      <option key={tipoFluxo} value={tipoFluxo}>
                        {tipoFluxo}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tipo */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Tipo *
                  </label>
                  <select
                    {...register('tipo')}
                    disabled={isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                  >
                    <option value="Entrada">Recebimento</option>
                    <option value="Saida">Pagamento</option>
                  </select>
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1.2fr 0.8fr 1fr 1.3fr',
                gap: '14px',
                marginBottom: '16px'
              }}>
                {/* Projeto */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Projeto {tipoFluxo !== 'Corporativo' && '*'}
                  </label>
                  <select
                    {...register('projeto_id')}
                    disabled={!empresaId || isLancamentoPago || tipoFluxo === 'Corporativo'}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: empresaId && !isLancamentoPago && tipoFluxo !== 'Corporativo' ? 'pointer' : 'not-allowed',
                      backgroundColor: empresaId && !isLancamentoPago && tipoFluxo !== 'Corporativo' ? 'white' : '#f9fafb',
                      color: empresaId && !isLancamentoPago && tipoFluxo !== 'Corporativo' ? '#1f2937' : '#9ca3af'
                    }}
                  >
                    <option value="">Selecione...</option>
                    {projetos.map(projeto => (
                      <option key={projeto.id} value={projeto.id}>
                        {projeto.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Subprojeto */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Subprojeto
                  </label>
                  <select
                    {...register('subprojeto_id')}
                    disabled={!projetoId || isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: projetoId && !isLancamentoPago ? 'pointer' : 'not-allowed',
                      backgroundColor: projetoId && !isLancamentoPago ? 'white' : '#f9fafb',
                      color: projetoId && !isLancamentoPago ? '#1f2937' : '#9ca3af'
                    }}
                  >
                    <option value="">Selecione...</option>
                    {subprojetos.map(subprojeto => (
                      <option key={subprojeto.id} value={subprojeto.id}>
                        {subprojeto.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Pagamento por Terceiro */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Pgto Conta/Ordem?
                  </label>
                  <select
                    {...register('pagamento_terceiro')}
                    disabled={isLancamentoPago}
                    onChange={(e) => {
                      const value = e.target.value === 'true'
                      setValue('pagamento_terceiro', value)
                      if (!value) {
                        setValue('empresa_pagadora_id', '')
                        setValue('banco_conta_id', '')
                        if (empresaId) {
                          fetchBancosContas(empresaId)
                        }
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                  >
                    <option value="false">Não</option>
                    <option value="true">Sim</option>
                  </select>
                </div>

                {/* Empresa Pagadora */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Empresa Pagadora {pagamentoTerceiro && '*'}
                  </label>
                  <select
                    {...register('empresa_pagadora_id')}
                    disabled={!pagamentoTerceiro || isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: pagamentoTerceiro && !isLancamentoPago ? 'pointer' : 'not-allowed',
                      backgroundColor: pagamentoTerceiro && !isLancamentoPago ? 'white' : '#f9fafb',
                      color: pagamentoTerceiro && !isLancamentoPago ? '#1f2937' : '#9ca3af'
                    }}
                  >
                    <option value="">Selecione...</option>
                    {empresasPagadoras.map(empresa => (
                      <option key={empresa.id} value={empresa.id}>
                        {empresa.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Conta Bancária */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Conta Bancária *
                  </label>
                  <select
                    {...register('banco_conta_id')}
                    disabled={!empresaId || isLancamentoPago || (pagamentoTerceiro && !empresaPagadoraId)}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: empresaId && !isLancamentoPago && (!pagamentoTerceiro || empresaPagadoraId) ? 'pointer' : 'not-allowed',
                      backgroundColor: empresaId && !isLancamentoPago && (!pagamentoTerceiro || empresaPagadoraId) ? 'white' : '#f9fafb',
                      color: empresaId && !isLancamentoPago && (!pagamentoTerceiro || empresaPagadoraId) ? '#1f2937' : '#9ca3af'
                    }}
                  >
                    <option value="">Selecione...</option>
                    {bancosContas.map(conta => {
                      // bancos pode ser array ou objeto dependendo do relacionamento
                      const bancosData = Array.isArray(conta.bancos) ? conta.bancos[0] : conta.bancos
                      const nomeBanco = bancosData?.nome || conta.banco_nome || 'Banco não informado'
                      return (
                        <option key={conta.id} value={conta.id}>
                          {nomeBanco} - Ag: {conta.agencia} - Conta: {conta.numero_conta}
                        </option>
                      )
                    })}
                  </select>
                </div>
              </div>

              {/* Plano de Contas e Contraparte na mesma linha */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '14px'
                }}>
                  <div style={{ gridColumn: 'span 3' }}>
                    <PlanoContaPicker
                      value={watch('plano_conta_id')}
                      onChange={(value) => setValue('plano_conta_id', value)}
                      tipoFluxoFilter={watch('tipo_fluxo')}
                      sentidoFilter={watch('tipo')}
                      error={errors.plano_conta_id?.message}
                    />
                  </div>

                  <div style={{ position: 'relative' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Contraparte *
                    </label>
                    <input
                      type="text"
                      value={contraparteNomeExibicao}
                      onChange={(e) => {
                        setContraparteNomeExibicao(e.target.value)
                        setContraparteSearchTerm(e.target.value)
                        setShowContraparteDropdown(true)
                      }}
                      disabled={isLancamentoPago}
                      placeholder="Digite para buscar..."
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
                        outline: 'none',
                        backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                        cursor: isLancamentoPago ? 'not-allowed' : 'text',
                        color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                      }}
                      onFocus={(e) => {
                        setShowContraparteDropdown(true)
                        if (!isLancamentoPago) {
                          e.currentTarget.style.borderColor = '#1555D6'
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb'
                        e.currentTarget.style.boxShadow = 'none'
                        setTimeout(() => setShowContraparteDropdown(false), 200)
                      }}
                    />
                    {showContraparteDropdown && filteredContrapartes.length > 0 && !isLancamentoPago && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        zIndex: 1000,
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}>
                        {filteredContrapartes.map(contraparte => (
                          <div
                            key={contraparte.id}
                            onClick={() => handleSelectContraparte(contraparte)}
                            style={{
                              padding: '8px 10px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              color: '#1f2937',
                              borderBottom: '1px solid #f3f4f6'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                          >
                            <div style={{ fontWeight: '500' }}>
                              {contraparte.apelido || contraparte.nome}
                            </div>
                            {contraparte.apelido && (
                              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                                {contraparte.nome}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>



              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '14px',
                marginBottom: '16px'
              }}>
                {/* Data Emissão */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Data Emissão *
                  </label>
                  <input
                    {...register('data_emissao')}
                    type="date"
                    disabled={isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      cursor: isLancamentoPago ? 'not-allowed' : 'text',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                    onFocus={(e) => {
                      if (!isLancamentoPago) e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                </div>

                {/* Data Vencimento */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Data Vencimento *
                  </label>
                  <input
                    {...register('data_vencimento')}
                    type="date"
                    disabled={isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      cursor: isLancamentoPago ? 'not-allowed' : 'text',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                    onFocus={(e) => {
                      if (!isLancamentoPago) e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                </div>

                {/* Previsão Pagamento */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Previsão Pag.
                  </label>
                  <input
                    {...register('data_previsao_pagamento')}
                    type="date"
                    disabled={isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      cursor: isLancamentoPago ? 'not-allowed' : 'text',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                    onFocus={(e) => {
                      if (!isLancamentoPago) e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Valor Bruto *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute',
                      left: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '13px',
                      color: '#6b7280',
                      fontWeight: '500'
                    }}>
                      R$
                    </span>
                    <input
                      type="text"
                      value={valorBrutoFormatado}
                      disabled={isLancamentoPago}
                      onChange={(e) => {
                        const formatted = formatCurrencyInput(e.target.value)
                        setValorBrutoFormatado(formatted)
                        const numericValue = parseCurrencyInput(formatted)
                        setValorBruto(numericValue)
                        setValue('valor_bruto', numericValue)
                      }}
                      style={{
                        width: '100%',
                        padding: '9px 10px 9px 32px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
                        outline: 'none',
                        textAlign: 'right',
                        backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                        cursor: isLancamentoPago ? 'not-allowed' : 'text',
                        color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                      }}
                      onFocus={(e) => {
                        if (!isLancamentoPago) {
                          e.currentTarget.style.borderColor = '#1555D6'
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Tipo Doc
                  </label>
                  <input
                    {...register('documento_tipo')}
                    type="text"
                    disabled={isLancamentoPago}
                    placeholder="NF, Boleto..."
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      cursor: isLancamentoPago ? 'not-allowed' : 'text',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                    onFocus={(e) => {
                      if (!isLancamentoPago) {
                        e.currentTarget.style.borderColor = '#1555D6'
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Nº Doc
                  </label>
                  <input
                    {...register('documento_numero')}
                    type="text"
                    disabled={isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      cursor: isLancamentoPago ? 'not-allowed' : 'text',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                    onFocus={(e) => {
                      if (!isLancamentoPago) {
                        e.currentTarget.style.borderColor = '#1555D6'
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                </div>
              </div>

              {/* Retenções */}
              <div style={{
                borderTop: '1px solid #e5e7eb',
                margin: '16px 0',
                paddingTop: '16px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '14px'
                }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#1f2937',
                    margin: 0
                  }}>
                    Retenções de Impostos
                  </h3>
                  <button
                    type="button"
                    onClick={adicionarRetencao}
                    disabled={isLancamentoPago}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      backgroundColor: isLancamentoPago ? '#d1d5db' : '#e0e7ff',
                      color: isLancamentoPago ? '#9ca3af' : '#1555D6',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => {
                      if (!isLancamentoPago) {
                        e.currentTarget.style.backgroundColor = '#c7d2fe'
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!isLancamentoPago) {
                        e.currentTarget.style.backgroundColor = '#e0e7ff'
                      }
                    }}
                  >
                    <Plus size={16} />
                    Adicionar Retenção
                  </button>
                </div>

                {retencoes.length > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    {retencoes.map((retencao, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr 2fr auto',
                          gap: '12px',
                          alignItems: 'end',
                          padding: '12px',
                          backgroundColor: '#f9fafb',
                          borderRadius: '8px',
                          marginBottom: '8px'
                        }}
                      >
                        <div>
                          <label style={{
                            display: 'block',
                            fontSize: '13px',
                            fontWeight: '500',
                            color: '#374151',
                            marginBottom: '6px'
                          }}>
                            Imposto
                          </label>
                          <select
                            value={retencao.imposto}
                            onChange={(e) => atualizarRetencao(index, 'imposto', e.target.value)}
                            disabled={isLancamentoPago}
                            style={{
                              width: '100%',
                              padding: '9px 10px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              fontSize: '13px',
                              outline: 'none',
                              cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                              backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                              color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                            }}
                          >
                            {IMPOSTOS.map((imp) => (
                              <option key={imp.value} value={imp.value}>
                                {imp.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{
                            display: 'block',
                            fontSize: '13px',
                            fontWeight: '500',
                            color: '#374151',
                            marginBottom: '6px'
                          }}>
                            Valor
                          </label>
                          <div style={{ position: 'relative' }}>
                            <span style={{
                              position: 'absolute',
                              left: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              fontSize: '13px',
                              color: '#6b7280',
                              fontWeight: '500'
                            }}>
                              R$
                            </span>
                            <input
                              type="text"
                              value={retencao.valorFormatado}
                              onChange={(e) => atualizarRetencao(index, 'valorFormatado', e.target.value)}
                              disabled={isLancamentoPago}
                              style={{
                                width: '100%',
                                padding: '9px 10px 9px 32px',
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                fontSize: '13px',
                                outline: 'none',
                                textAlign: 'right',
                                backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                                cursor: isLancamentoPago ? 'not-allowed' : 'text',
                                color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                              }}
                            />
                          </div>
                        </div>

                        <div>
                          <label style={{
                            display: 'block',
                            fontSize: '13px',
                            fontWeight: '500',
                            color: '#374151',
                            marginBottom: '6px'
                          }}>
                            Detalhe
                          </label>
                          <input
                            type="text"
                            value={retencao.detalhe || ''}
                            onChange={(e) => atualizarRetencao(index, 'detalhe', e.target.value)}
                            disabled={isLancamentoPago}
                            placeholder="Informações adicionais..."
                            style={{
                              width: '100%',
                              padding: '9px 10px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              fontSize: '13px',
                              outline: 'none',
                              backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                              cursor: isLancamentoPago ? 'not-allowed' : 'text',
                              color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                            }}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => removerRetencao(index)}
                          disabled={isLancamentoPago}
                          style={{
                            padding: '9px',
                            backgroundColor: isLancamentoPago ? '#d1d5db' : '#fee2e2',
                            color: isLancamentoPago ? '#9ca3af' : '#ef4444',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                          }}
                          onMouseOver={(e) => {
                            if (!isLancamentoPago) {
                              e.currentTarget.style.backgroundColor = '#fecaca'
                            }
                          }}
                          onMouseOut={(e) => {
                            if (!isLancamentoPago) {
                              e.currentTarget.style.backgroundColor = '#fee2e2'
                            }
                          }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Valor Líquido */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px',
                  backgroundColor: '#f0f9ff',
                  borderRadius: '8px',
                  border: '1px solid #bae6fd'
                }}>
                  <span style={{
                    fontSize: '15px',
                    fontWeight: '600',
                    color: '#0369a1'
                  }}>
                    Valor Líquido
                  </span>
                  <span style={{
                    fontSize: '17px',
                    fontWeight: '700',
                    color: '#0369a1'
                  }}>
                    {formatCurrencyBRL(valorLiquido)}
                  </span>
                </div>
              </div>

              {/* Observações */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Observações
                </label>
                <textarea
                  {...register('observacoes')}
                  disabled={isLancamentoPago}
                  rows={3}
                  placeholder="Informações adicionais sobre o lançamento..."
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '13px',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                    cursor: isLancamentoPago ? 'not-allowed' : 'text',
                    color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                  }}
                  onFocus={(e) => {
                    if (!isLancamentoPago) {
                      e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>

              {/* Modal Footer */}
              <div style={{
                position: 'sticky',
                bottom: 0,
                backgroundColor: 'white',
                borderTop: '1px solid #e5e7eb',
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                borderBottomLeftRadius: '12px',
                borderBottomRightRadius: '12px'
              }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    padding: '10px 24px',
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
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
                    padding: '10px 24px',
                    backgroundColor: '#1555D6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1044b5'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1555D6'}
                >
                  {editingId ? 'Atualizar' : 'Criar'} Lançamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
          }}
          onClick={() => setDeleteConfirm({ show: false, id: null })}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              padding: '32px',
              width: '100%',
              margin: '16px',
              animation: 'scaleIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: '56px',
              height: '56px',
              margin: '0 auto 20px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertTriangle style={{ width: '28px', height: '28px', color: '#ef4444' }} />
            </div>

            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '12px',
              textAlign: 'center'
            }}>
              Confirmar Exclusão
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              marginBottom: '24px',
              textAlign: 'center',
              lineHeight: '1.5'
            }}>
              Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.
            </p>

            <div style={{
              display: 'flex',
              gap: '12px'
            }}>
              <button
                onClick={() => setDeleteConfirm({ show: false, id: null })}
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
                onClick={() => deleteConfirm.id && handleDelete(deleteConfirm.id)}
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

      {/* Liquidar Modal */}
      {liquidarModal.show && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
          }}
          onClick={() => {
            setLiquidarModal({ show: false, id: null })
            setDataLiquidacao('')
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              padding: '32px',
              width: '100%',
              margin: '16px',
              animation: 'scaleIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: '56px',
              height: '56px',
              margin: '0 auto 20px',
              borderRadius: '50%',
              backgroundColor: '#d1fae5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CheckCircle style={{ width: '28px', height: '28px', color: '#10b981' }} />
            </div>

            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '12px',
              textAlign: 'center'
              }}>
            Liquidar Lançamento
</h2>
            <p style={{
            fontSize: '14px',
            color: '#6b7280',
            marginBottom: '20px',
            textAlign: 'center',
            lineHeight: '1.5'
            }}>
            Confirme a data de pagamento/recebimento:
            </p>
<div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '8px'
          }}>
            Data de Liquidação *
          </label>
          <input
            type="date"
            value={dataLiquidacao}
            onChange={(e) => setDataLiquidacao(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#1555D6'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
        </div>

        <div style={{
          display: 'flex',
          gap: '12px'
        }}>
          <button
            onClick={() => {
              setLiquidarModal({ show: false, id: null })
              setDataLiquidacao('')
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
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
          >
            Cancelar
          </button>
          <button
            onClick={handleLiquidar}
            disabled={!dataLiquidacao}
            style={{
              flex: 1,
              padding: '12px 24px',
              backgroundColor: dataLiquidacao ? '#10b981' : '#d1d5db',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              color: 'white',
              cursor: dataLiquidacao ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              if (dataLiquidacao) {
                e.currentTarget.style.backgroundColor = '#059669'
              }
            }}
            onMouseOut={(e) => {
              if (dataLiquidacao) {
                e.currentTarget.style.backgroundColor = '#10b981'
              }
            }}
          >
            Confirmar Liquidação
          </button>
        </div>
      </div>
    </div>
  )}

  {/* Validation Modal */}
  {validationModal.show && (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)'
      }}
      onClick={() => setValidationModal({ show: false, message: '' })}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          borderTop: '4px solid #f59e0b',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          padding: '24px',
          width: '90%',
          maxWidth: '400px',
          margin: '16px',
          animation: 'scaleIn 0.2s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          marginBottom: '20px'
        }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            backgroundColor: '#fef3c7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: '2px'
          }}>
            <AlertTriangle style={{ width: '16px', height: '16px', color: '#f59e0b' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{
              fontSize: '14px',
              color: '#111827',
              margin: 0,
              lineHeight: '1.5',
              fontWeight: '500'
            }}>
              Faltam os seguintes campos obrigatórios: {validationModal.message}
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={() => setValidationModal({ show: false, message: '' })}
            style={{
              padding: '8px 20px',
              backgroundColor: '#f59e0b',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#d97706'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f59e0b'}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )}

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
            padding: toast.requiresConfirmation ? '20px' : '16px 20px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            flexDirection: toast.requiresConfirmation ? 'column' : 'row',
            alignItems: toast.requiresConfirmation ? 'stretch' : 'center',
            gap: toast.requiresConfirmation ? '16px' : '12px',
            minWidth: '400px',
            animation: 'scaleIn 0.3s ease-out',
            pointerEvents: toast.requiresConfirmation ? 'auto' : 'none'
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Icon style={{ width: '24px', height: '24px', flexShrink: 0, color: iconColor }} />
            <span style={{
              fontSize: '14px',
              fontWeight: '500',
              flex: 1,
              color: '#374151',
              lineHeight: '1.5',
              whiteSpace: 'pre-line'
            }}>
              {toast.message}
            </span>
          </div>
          
          {toast.requiresConfirmation && (
            <button
              onClick={() => dismissToast(toast.id)}
              style={{
                padding: '10px 24px',
                backgroundColor: '#1555D6',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                color: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
                alignSelf: 'center',
                minWidth: '100px'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1044b5'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1555D6'}
            >
              OK
            </button>
          )}
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
    
    /* Tooltips customizados */
    .tooltip-btn[data-tooltip] {
      position: relative;
    }
    
    .tooltip-btn[data-tooltip]::before {
      content: attr(data-tooltip);
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%) translateY(-4px);
      padding: 4px 8px;
      background-color: #1f2937;
      color: white;
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
      border-radius: 4px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
      z-index: 1000;
    }
    
    .tooltip-btn[data-tooltip]::after {
      content: "";
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%) translateY(2px);
      border: 4px solid transparent;
      border-top-color: #1f2937;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
      z-index: 1000;
    }
    
    .tooltip-btn[data-tooltip]:hover::before {
      opacity: 1;
      transform: translateX(-50%) translateY(-8px);
    }
    
    .tooltip-btn[data-tooltip]:hover::after {
      opacity: 1;
      transform: translateX(-50%) translateY(-2px);
    }
  `}</style>
</div>
)
}