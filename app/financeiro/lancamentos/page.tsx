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
  empresa_nome?: string
  projeto_nome?: string
  subprojeto_nome?: string
  contraparte_nome?: string
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

// Schema de validação - projeto opcional quando tipo_fluxo é Corporativo
const lancamentoSchema = z.object({
  tipo: z.enum(['Entrada', 'Saida'], { required_error: 'Tipo é obrigatório' }),
  empresa_id: z.string().min(1, 'Empresa é obrigatória'),
  tipo_fluxo: z.string().min(1, 'Tipo de Fluxo é obrigatório'),
  projeto_id: z.string().optional(),
  subprojeto_id: z.string().optional(),
  banco_conta_id: z.string().min(1, 'Conta bancária é obrigatória'),
  contraparte_id: z.string().min(1, 'Contraparte é obrigatória'),
  plano_conta_id: z.string().min(1, 'Plano de conta é obrigatório'),
  valor_bruto: z.coerce.number().min(0.01, 'Valor bruto é obrigatório'),
  data_emissao: z.string().min(1, 'Data de emissão é obrigatória'),
  data_vencimento: z.string().min(1, 'Data de vencimento é obrigatória'),
  data_previsao_pagamento: z.string().optional(),
  documento_tipo: z.string().optional(),
  documento_numero: z.string().optional(),
  observacoes: z.string().optional()
}).refine((data) => {
  // Se tipo_fluxo não for Corporativo, projeto_id é obrigatório
  if (data.tipo_fluxo !== 'Corporativo' && !data.projeto_id) {
    return false
  }
  return true
}, {
  message: 'Projeto é obrigatório quando Tipo de Fluxo não for Corporativo',
  path: ['projeto_id']
})

type LancamentoForm = z.infer<typeof lancamentoSchema>

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

  const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<LancamentoForm>({
    resolver: zodResolver(lancamentoSchema),
    defaultValues: {
      tipo: 'Saida',
      empresa_id: '',
      tipo_fluxo: '',
      projeto_id: '',
      subprojeto_id: '',
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

  const selectedEmpresaId = watch('empresa_id')
  const selectedTipoFluxo = watch('tipo_fluxo')
  const selectedProjetoId = watch('projeto_id')
  const selectedTipoLancamento = watch('tipo')

  // Helper function para buscar todos os registros (paginação automática)
  const fetchAllRecords = async (tableName: string, selectQuery: string = '*', filters?: any) => {
    const PAGE_SIZE = 1000
    let allData: any[] = []
    let from = 0
    let hasMore = true

    while (hasMore) {
      let query = supabase
        .from(tableName)
        .select(selectQuery)
        .range(from, from + PAGE_SIZE - 1)

      // Aplicar filtros adicionais
      if (filters) {
        Object.keys(filters).forEach(key => {
          const value = filters[key]
          if (value !== undefined && value !== null) {
            if (key === 'order') {
              // Ordenar pela coluna especificada
              query = query.order(value, { ascending: true })
            } else if (typeof value === 'boolean') {
              query = query.eq(key, value)
            } else if (key === 'is_null') {
              query = query.is(value.column, value.value)
            } else {
              query = query.eq(key, value)
            }
          }
        })
      }

      const { data, error } = await query

      if (error) throw error

      if (data && data.length > 0) {
        allData = [...allData, ...data]
        if (data.length < PAGE_SIZE) {
          hasMore = false
        } else {
          from += PAGE_SIZE
        }
      } else {
        hasMore = false
      }
    }

    return allData
  }

  // Toast functions
  const showToast = (message: string, type: ToastType) => {
    const id = toastIdCounter
    setToastIdCounter(prev => prev + 1)
    const newToast: Toast = { id, message, type }
    setToasts(prev => [...prev, newToast])

    if (type !== 'error') {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 5000)
    }
  }

  const showConfirmToast = (message: string, type: ToastType) => {
    const id = toastIdCounter
    setToastIdCounter(prev => prev + 1)
    const newToast: Toast = { id, message, type, requiresConfirmation: true }
    setToasts(prev => [...prev, newToast])
  }

  const dismissToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const getToastStyles = (type: ToastType) => {
    switch (type) {
      case 'success':
        return {
          borderColor: '#10b981',
          icon: CheckCircle,
          iconColor: '#10b981'
        }
      case 'warning':
        return {
          borderColor: '#f59e0b',
          icon: AlertTriangle,
          iconColor: '#f59e0b'
        }
      case 'error':
        return {
          borderColor: '#ef4444',
          icon: XCircle,
          iconColor: '#ef4444'
        }
    }
  }

  // Helpers para badges
  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'ABERTO':
        return { bg: '#fef3c7', text: '#92400e', label: 'Aberto' }
      case 'PAGO_RECEBIDO':
        return { bg: '#d1fae5', text: '#065f46', label: 'Liquidado' }
      case 'CANCELADO':
        return { bg: '#fee2e2', text: '#991b1b', label: 'Cancelado' }
      default:
        return { bg: '#e5e7eb', text: '#374151', label: status }
    }
  }

  const getTipoBadgeStyle = (tipo: string) => {
    switch (tipo) {
      case 'Entrada':
        return { bg: '#d1fae5', text: '#065f46', label: 'Recebimento' }
      case 'Saida':
        return { bg: '#fee2e2', text: '#991b1b', label: 'Pagamento' }
      default:
        return { bg: '#e5e7eb', text: '#374151', label: tipo }
    }
  }

  // Fetch initial data
  useEffect(() => {
    fetchEmpresas()
    fetchContrapartes()
    fetchTiposFluxo()
    fetchProjetosForFilter()
    fetchCategorias()
    fetchLancamentos()
  }, [])

  // Carregar subprojetos quando um projeto for selecionado nos filtros
  useEffect(() => {
    if (selectedProjetoFilter) {
      fetchSubprojetosForFilter(selectedProjetoFilter)
    } else {
      setSubprojetosFilter([])
      setSelectedSubprojetoFilter('')
    }
  }, [selectedProjetoFilter])

  // Update project list when empresa changes
  useEffect(() => {
    if (selectedEmpresaId) {
      fetchProjetos(selectedEmpresaId)
      fetchBancosContas(selectedEmpresaId)
    } else {
      setProjetos([])
      setSubprojetos([])
      setBancosContas([])
    }
  }, [selectedEmpresaId])

  // Update subproject list when project changes
  useEffect(() => {
    if (selectedProjetoId) {
      fetchSubprojetos(selectedProjetoId)
    } else {
      setSubprojetos([])
    }
  }, [selectedProjetoId])

  // Recalcular valor líquido quando retenções mudam
  useEffect(() => {
    const totalRetencoes = retencoes.reduce((acc, r) => acc + r.valor, 0)
    setValorLiquido(valorBruto - totalRetencoes)
  }, [retencoes, valorBruto])

  const fetchEmpresas = async () => {
    try {
      const data = await fetchAllRecords('empresas', '*', { ativo: true, order: 'nome' })
      setEmpresas(data || [])
    } catch (error: any) {
      console.error('Erro ao buscar empresas:', error)
      showConfirmToast('Erro ao carregar empresas', 'error')
    }
  }

  const fetchProjetos = async (empresaId: string) => {
    try {
      const PAGE_SIZE = 1000
      let allData: any[] = []
      let from = 0
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('projetos')
          .select('*')
          .eq('empresa_id', empresaId)
          .eq('ativo', true)
          .is('projeto_pai_id', null)
          .order('nome')
          .range(from, from + PAGE_SIZE - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allData = [...allData, ...data]
          if (data.length < PAGE_SIZE) {
            hasMore = false
          } else {
            from += PAGE_SIZE
          }
        } else {
          hasMore = false
        }
      }

      setProjetos(allData || [])
    } catch (error: any) {
      console.error('Erro ao buscar projetos:', error)
      showConfirmToast('Erro ao carregar projetos', 'error')
    }
  }

  const fetchSubprojetos = async (projetoId: string) => {
    try {
      const data = await fetchAllRecords('projetos', '*', { 
        projeto_pai_id: projetoId, 
        ativo: true, 
        order: 'nome' 
      })
      setSubprojetos(data || [])
    } catch (error: any) {
      console.error('Erro ao buscar subprojetos:', error)
    }
  }

  const fetchBancosContas = async (empresaId: string) => {
    try {
      const PAGE_SIZE = 1000
      let allData: any[] = []
      let from = 0
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('bancos_contas')
          .select(`
            *,
            banco:bancos(nome)
          `)
          .eq('empresa_id', empresaId)
          .eq('ativo', true)
          .range(from, from + PAGE_SIZE - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allData = [...allData, ...data]
          if (data.length < PAGE_SIZE) {
            hasMore = false
          } else {
            from += PAGE_SIZE
          }
        } else {
          hasMore = false
        }
      }

      // Ordenar por banco_nome e depois por numero_conta
      allData.sort((a, b) => {
        const nomeA = (a.banco_nome || a.banco?.nome || '').toLowerCase()
        const nomeB = (b.banco_nome || b.banco?.nome || '').toLowerCase()
        if (nomeA < nomeB) return -1
        if (nomeA > nomeB) return 1
        return (a.numero_conta || '').localeCompare(b.numero_conta || '')
      })

      setBancosContas(allData || [])
    } catch (error: any) {
      console.error('Erro ao buscar contas bancárias:', error)
      showConfirmToast('Erro ao carregar contas bancárias', 'error')
    }
  }

  const fetchContrapartes = async () => {
    try {
      const data = await fetchAllRecords('contrapartes', '*', { ativo: true, order: 'nome' })
      // Aplicar trim nos nomes e apelidos
      const cleanedData = (data || []).map(c => ({
        ...c,
        nome: c.nome?.trim() || '',
        apelido: c.apelido?.trim() || null
      }))
      // Ordenar alfabeticamente pelo campo que será exibido (apelido ou nome)
      const sortedData = cleanedData.sort((a, b) => {
        const displayNameA = (a.apelido || a.nome).toLowerCase()
        const displayNameB = (b.apelido || b.nome).toLowerCase()
        return displayNameA.localeCompare(displayNameB, 'pt-BR', { sensitivity: 'base' })
      })
      setContrapartes(sortedData)
    } catch (error: any) {
      console.error('Erro ao buscar contrapartes:', error)
      showConfirmToast('Erro ao carregar contrapartes', 'error')
    }
  }

  const fetchTiposFluxo = async () => {
    try {
      const data = await fetchAllRecords('plano_contas_fluxo', 'tipo_fluxo', { ativo: true })
      const uniqueTipos = Array.from(new Set(data?.map((item: any) => item.tipo_fluxo) || []))
      setTiposFluxo(uniqueTipos.sort())
    } catch (error: any) {
      console.error('Erro ao buscar tipos de fluxo:', error)
      showConfirmToast('Erro ao carregar tipos de fluxo', 'error')
    }
  }

  const fetchProjetosForFilter = async () => {
    try {
      const PAGE_SIZE = 1000
      let allData: any[] = []
      let from = 0
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('projetos')
          .select('*')
          .eq('ativo', true)
          .is('projeto_pai_id', null)
          .order('nome')
          .range(from, from + PAGE_SIZE - 1)

        if (error) throw error

        if (data && data.length > 0) {
          allData = [...allData, ...data]
          if (data.length < PAGE_SIZE) {
            hasMore = false
          } else {
            from += PAGE_SIZE
          }
        } else {
          hasMore = false
        }
      }

      setProjetosFilter(allData || [])
    } catch (error: any) {
      console.error('Erro ao buscar projetos para filtro:', error)
    }
  }

  const fetchSubprojetosForFilter = async (projetoId: string) => {
    try {
      const data = await fetchAllRecords('projetos', '*', { 
        projeto_pai_id: projetoId, 
        ativo: true, 
        order: 'nome' 
      })
      setSubprojetosFilter(data || [])
    } catch (error: any) {
      console.error('Erro ao buscar subprojetos para filtro:', error)
    }
  }

  const fetchCategorias = async () => {
    try {
      const data = await fetchAllRecords('plano_contas_fluxo', 'categoria', { ativo: true })
      const uniqueCategorias = Array.from(new Set(data?.map((item: any) => item.categoria) || []))
      setCategorias(uniqueCategorias.sort())
    } catch (error: any) {
      console.error('Erro ao buscar categorias:', error)
    }
  }

  const fetchLancamentos = async (resetPagination = false) => {
    try {
      if (resetPagination) {
        setPage(0)
        setHasMore(true)
      }

      const currentPage = resetPagination ? 0 : page
      const from = currentPage * ITEMS_PER_PAGE
      const to = from + ITEMS_PER_PAGE - 1

      let query = supabase
        .from('lancamentos')
        .select(`
          *,
          empresa:empresas(nome),
          projeto:projetos!lancamentos_projeto_id_fkey(nome),
          subprojeto:projetos!lancamentos_subprojeto_id_fkey(nome),
          contraparte:contrapartes(nome),
          plano_conta:plano_contas_fluxo(*)
        `)
        .order('data_vencimento', { ascending: false })

      // Apply filters (exceto searchTerm que será aplicado em memória)
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
        // Buscar IDs dos planos de conta com a categoria selecionada
        const { data: planosData } = await supabase
          .from('plano_contas_fluxo')
          .select('id')
          .eq('categoria', selectedCategoriaFilter)
          .eq('ativo', true)
        
        if (planosData && planosData.length > 0) {
          const planoIds = planosData.map(p => p.id)
          query = query.in('plano_conta_id', planoIds)
        } else {
          // Se não encontrou planos com essa categoria, retornar vazio
          setLancamentos([])
          setHasMore(false)
          setLoading(false)
          setLoadingMore(false)
          return
        }
      }
      if (dataVencimentoInicio) {
        query = query.gte('data_vencimento', dataVencimentoInicio)
      }
      if (dataVencimentoFim) {
        query = query.lte('data_vencimento', dataVencimentoFim)
      }

      // Aplicar range apenas se não tiver busca de texto
      if (!searchTerm) {
        query = query.range(from, to)
      }

      const { data, error } = await query

      if (error) throw error

      let formattedData = data?.map((l: any) => ({
        ...l,
        empresa_nome: l.empresa?.nome,
        projeto_nome: l.projeto?.nome,
        subprojeto_nome: l.subprojeto?.nome,
        contraparte_nome: l.contraparte?.nome
      })) || []

      // Aplicar filtro de busca em memória
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        formattedData = formattedData.filter((l: any) => {
          return (
            l.tipo?.toLowerCase().includes(searchLower) ||
            l.status?.toLowerCase().includes(searchLower) ||
            l.empresa_nome?.toLowerCase().includes(searchLower) ||
            l.projeto_nome?.toLowerCase().includes(searchLower) ||
            l.subprojeto_nome?.toLowerCase().includes(searchLower) ||
            l.contraparte_nome?.toLowerCase().includes(searchLower) ||
            l.plano_conta?.categoria?.toLowerCase().includes(searchLower) ||
            l.valor_bruto?.toString().includes(searchLower) ||
            l.valor_liquido?.toString().includes(searchLower) ||
            l.data_vencimento?.includes(searchLower) ||
            l.observacoes?.toLowerCase().includes(searchLower) ||
            l.documento_numero?.toLowerCase().includes(searchLower) ||
            l.documento_tipo?.toLowerCase().includes(searchLower)
          )
        })
      }

      if (resetPagination) {
        setLancamentos(formattedData)
      } else {
        setLancamentos(prev => [...prev, ...formattedData])
      }

      setHasMore(!searchTerm && formattedData.length === ITEMS_PER_PAGE)
      setLoading(false)
      setLoadingMore(false)
    } catch (error: any) {
      console.error('Erro ao buscar lançamentos:', error)
      showConfirmToast('Erro ao carregar lançamentos', 'error')
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const handleLoadMore = () => {
    setLoadingMore(true)
    setPage(prev => prev + 1)
  }

  useEffect(() => {
    if (page > 0) {
      fetchLancamentos()
    }
  }, [page])

  // Refetch on filter change
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchLancamentos(true)
    }, 300)

    return () => clearTimeout(delayDebounceFn)
  }, [searchTerm, selectedTipoFilter, selectedStatusFilter, selectedEmpresaFilter, selectedProjetoFilter, selectedSubprojetoFilter, selectedContraparteFilter, selectedCategoriaFilter, dataVencimentoInicio, dataVencimentoFim])

  // Fetch retenções ao abrir modal de edição
  const fetchRetencoes = async (lancamentoId: string) => {
    try {
      const { data, error } = await supabase
        .from('lancamento_retencoes')
        .select('*')
        .eq('lancamento_id', lancamentoId)

      if (error) throw error

      const retencoesFormatadas = data?.map(r => ({
        ...r,
        valorFormatado: new Intl.NumberFormat('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(r.valor)
      })) || []

      setRetencoes(retencoesFormatadas)
    } catch (error: any) {
      console.error('Erro ao buscar retenções:', error)
      showConfirmToast('Erro ao carregar retenções', 'error')
    }
  }

  const adicionarRetencao = () => {
    const novaRetencao: Retencao = {
      imposto: 'IRRF',
      valor: 0,
      valorFormatado: '0,00',
      detalhe: null
    }
    setRetencoes([...retencoes, novaRetencao])
  }

  const removerRetencao = (index: number) => {
    setRetencoes(retencoes.filter((_, i) => i !== index))
  }

  const atualizarRetencao = (index: number, field: keyof Retencao, value: any) => {
    const updated = [...retencoes]
    if (field === 'valorFormatado') {
      const formatted = formatCurrencyInput(value)
      updated[index].valorFormatado = formatted
      updated[index].valor = parseCurrencyInput(formatted)
    } else {
      updated[index][field] = value as never
    }
    setRetencoes(updated)
  }

  const openModal = async (lancamento?: Lancamento) => {
    if (lancamento) {
      setEditingId(lancamento.id)
      setIsLancamentoPago(lancamento.status === 'PAGO_RECEBIDO')
      setStatusOriginal(lancamento.status)

      // Buscar as retenções
      await fetchRetencoes(lancamento.id)

      // Primeiro definir empresa_id para habilitar os combos dependentes
      setValue('empresa_id', lancamento.empresa_id)
      
      // Aguardar os dados serem carregados
      await fetchProjetos(lancamento.empresa_id)
      await fetchBancosContas(lancamento.empresa_id)
      
      if (lancamento.projeto_id) {
        await fetchSubprojetos(lancamento.projeto_id)
      }

      // Buscar o tipo_fluxo do plano de conta selecionado
      if (lancamento.plano_conta_id) {
        const { data: planoData } = await supabase
          .from('plano_contas_fluxo')
          .select('tipo_fluxo')
          .eq('id', lancamento.plano_conta_id)
          .single()

        if (planoData) {
          setValue('tipo_fluxo', planoData.tipo_fluxo)
        }
      }

      // Agora preencher todos os campos
      reset({
        tipo: lancamento.tipo,
        empresa_id: lancamento.empresa_id,
        tipo_fluxo: lancamento.plano_conta?.tipo_fluxo || '',
        projeto_id: lancamento.projeto_id || '',
        subprojeto_id: lancamento.subprojeto_id || '',
        banco_conta_id: lancamento.banco_conta_id || '',
        contraparte_id: lancamento.contraparte_id || '',
        plano_conta_id: lancamento.plano_conta_id,
        valor_bruto: lancamento.valor_bruto,
        data_emissao: formatDateForInput(lancamento.data_emissao),
        data_vencimento: formatDateForInput(lancamento.data_vencimento),
        data_previsao_pagamento: formatDateForInput(lancamento.data_previsao_pagamento),
        documento_tipo: lancamento.documento_tipo || '',
        documento_numero: lancamento.documento_numero || '',
        observacoes: lancamento.observacoes || ''
      })

      // Definir valores formatados
      setValorBruto(lancamento.valor_bruto)
      setValorBrutoFormatado(new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(lancamento.valor_bruto))

      // Buscar nome da contraparte para exibição
      if (lancamento.contraparte_id) {
        const contraparte = contrapartes.find(c => c.id === lancamento.contraparte_id)
        if (contraparte) {
          setContraparteNomeExibicao(contraparte.apelido || contraparte.nome)
        }
      }
    } else {
      setEditingId(null)
      setIsLancamentoPago(false)
      setStatusOriginal(null)
      setRetencoes([])
      setValorBruto(0)
      setValorBrutoFormatado('')
      setValorLiquido(0)
      setContraparteNomeExibicao('')
      reset({
        tipo: 'Saida',
        empresa_id: '',
        tipo_fluxo: '',
        projeto_id: '',
        subprojeto_id: '',
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
      })
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setIsLancamentoPago(false)
    setStatusOriginal(null)
    setRetencoes([])
    setValorBruto(0)
    setValorBrutoFormatado('')
    setValorLiquido(0)
    setContraparteNomeExibicao('')
    reset()
  }

  const onSubmit = async (formData: LancamentoForm) => {
    try {
      // Preparar dados do lançamento
      const lancamentoData = {
        tipo: formData.tipo,
        empresa_id: formData.empresa_id,
        projeto_id: formData.projeto_id || null,
        subprojeto_id: formData.subprojeto_id || null,
        banco_conta_id: formData.banco_conta_id,
        contraparte_id: formData.contraparte_id,
        plano_conta_id: formData.plano_conta_id,
        valor_bruto: formData.valor_bruto,
        valor_liquido: valorLiquido,
        data_emissao: formData.data_emissao,
        data_vencimento: formData.data_vencimento,
        data_previsao_pagamento: formData.data_previsao_pagamento || null,
        documento_tipo: formData.documento_tipo || null,
        documento_numero: formData.documento_numero || null,
        observacoes: formData.observacoes || null,
        status: statusOriginal || 'ABERTO'
      }

      if (editingId) {
        // Update
        const { error: lancamentoError } = await supabase
          .from('lancamentos')
          .update(lancamentoData)
          .eq('id', editingId)

        if (lancamentoError) throw lancamentoError

        // Atualizar retenções
        // Primeiro deletar as antigas
        const { error: deleteError } = await supabase
          .from('lancamento_retencoes')
          .delete()
          .eq('lancamento_id', editingId)

        if (deleteError) throw deleteError

        // Inserir as novas
        if (retencoes.length > 0) {
          const retencoesData = retencoes.map(r => ({
            lancamento_id: editingId,
            imposto: r.imposto,
            valor: r.valor,
            detalhe: r.detalhe
          }))

          const { error: insertError } = await supabase
            .from('lancamento_retencoes')
            .insert(retencoesData)

          if (insertError) throw insertError
        }

        showToast('Lançamento atualizado com sucesso!', 'success')
      } else {
        // Create
        const { data: newLancamento, error: lancamentoError } = await supabase
          .from('lancamentos')
          .insert(lancamentoData)
          .select()
          .single()

        if (lancamentoError) throw lancamentoError

        // Inserir retenções
        if (retencoes.length > 0) {
          const retencoesData = retencoes.map(r => ({
            lancamento_id: newLancamento.id,
            imposto: r.imposto,
            valor: r.valor,
            detalhe: r.detalhe
          }))

          const { error: retencoesError } = await supabase
            .from('lancamento_retencoes')
            .insert(retencoesData)

          if (retencoesError) throw retencoesError
        }

        showToast('Lançamento criado com sucesso!', 'success')
      }

      closeModal()
      fetchLancamentos(true)
    } catch (error: any) {
      console.error('Erro ao salvar lançamento:', error)
      showConfirmToast(error.message || 'Erro ao salvar lançamento', 'error')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      // Primeiro deletar as retenções
      const { error: retencoesError } = await supabase
        .from('lancamento_retencoes')
        .delete()
        .eq('lancamento_id', id)

      if (retencoesError) throw retencoesError

      // Depois deletar o lançamento
      const { error } = await supabase
        .from('lancamentos')
        .delete()
        .eq('id', id)

      if (error) throw error

      showToast('Lançamento excluído com sucesso!', 'success')
      setDeleteConfirm({ show: false, id: null })
      fetchLancamentos(true)
    } catch (error: any) {
      console.error('Erro ao excluir:', error)
      showConfirmToast(error.message || 'Erro ao excluir lançamento', 'error')
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

      showToast('Lançamento liquidado com sucesso!', 'success')
      setLiquidarModal({ show: false, id: null })
      setDataLiquidacao('')
      fetchLancamentos(true)
    } catch (error: any) {
      console.error('Erro ao liquidar:', error)
      showConfirmToast(error.message || 'Erro ao liquidar lançamento', 'error')
    }
  }

  const handleRefresh = () => {
    fetchLancamentos(true)
  }

  const handleClearFilters = () => {
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
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        fontSize: '14px',
        color: '#6b7280'
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid #e5e7eb',
          borderTop: '3px solid #1555D6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', maxWidth: '100%', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: '700',
          color: '#1f2937',
          margin: 0
        }}>
          Lançamentos
        </h1>
        <button
          onClick={() => openModal()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
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
          <Plus size={18} />
          Novo Lançamento
        </button>
      </div>

      {/* Filters */}
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
          <div>
            <label style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Buscar
            </label>
            <div style={{ position: 'relative' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#9ca3af'
                }}
              />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 8px 8px 36px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '11px',
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

          <div>
            <label style={{
              display: 'block',
              fontSize: '11px',
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
                padding: '8px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '11px',
                outline: 'none',
                cursor: 'pointer'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <option value="">Todos</option>
              <option value="Entrada">Recebimento</option>
              <option value="Saida">Pagamento</option>
            </select>
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '11px',
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
                padding: '8px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '11px',
                outline: 'none',
                cursor: 'pointer'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <option value="">Todos</option>
              <option value="ABERTO">Aberto</option>
              <option value="PAGO_RECEBIDO">Liquidado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Empresa
            </label>
            <select
              value={selectedEmpresaFilter}
              onChange={(e) => setSelectedEmpresaFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '11px',
                outline: 'none',
                cursor: 'pointer'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <option value="">Todas</option>
              {empresas.map((empresa) => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Projeto
            </label>
            <select
              value={selectedProjetoFilter}
              onChange={(e) => setSelectedProjetoFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '11px',
                outline: 'none',
                cursor: 'pointer'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <option value="">Todos</option>
              {projetosFilter.map((projeto) => (
                <option key={projeto.id} value={projeto.id}>
                  {projeto.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Subprojeto
            </label>
            <select
              value={selectedSubprojetoFilter}
              onChange={(e) => setSelectedSubprojetoFilter(e.target.value)}
              disabled={!selectedProjetoFilter || subprojetosFilter.length === 0}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '11px',
                outline: 'none',
                cursor: (!selectedProjetoFilter || subprojetosFilter.length === 0) ? 'not-allowed' : 'pointer',
                opacity: (!selectedProjetoFilter || subprojetosFilter.length === 0) ? 0.6 : 1,
                backgroundColor: (!selectedProjetoFilter || subprojetosFilter.length === 0) ? '#f9fafb' : 'white'
              }}
              onFocus={(e) => {
                if (selectedProjetoFilter && subprojetosFilter.length > 0) {
                  e.currentTarget.style.borderColor = '#1555D6'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                }
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <option value="">Todos</option>
              {subprojetosFilter.map((subprojeto) => (
                <option key={subprojeto.id} value={subprojeto.id}>
                  {subprojeto.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '11px',
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
                padding: '8px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '11px',
                outline: 'none',
                cursor: 'pointer'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <option value="">Todas</option>
              {contrapartes.map((contraparte) => (
                <option key={contraparte.id} value={contraparte.id}>
                  {contraparte.apelido || contraparte.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '11px',
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
                padding: '8px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '11px',
                outline: 'none',
                cursor: 'pointer'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <option value="">Todas</option>
              {categorias.map((categoria) => (
                <option key={categoria} value={categoria}>
                  {categoria}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Vencimento De
            </label>
            <input
              type="date"
              value={dataVencimentoInicio}
              onChange={(e) => setDataVencimentoInicio(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '11px',
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

          <div>
            <label style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Vencimento Até
            </label>
            <input
              type="date"
              value={dataVencimentoFim}
              onChange={(e) => setDataVencimentoFim(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '11px',
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

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleClearFilters}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#6b7280'}
            >
              <X size={13} />
              Limpar Filtros
            </button>
            <button
              onClick={handleRefresh}
              style={{
                padding: '8px 16px',
                backgroundColor: '#1555D6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1044b5'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1555D6'}
            >
              <RefreshCw size={13} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontSize: '9.6px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap'
                }}>
                  TIPO
                </th>
                <th style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontSize: '9.6px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap'
                }}>
                  EMPRESA
                </th>
                <th style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontSize: '9.6px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap'
                }}>
                  PROJETO
                </th>
                <th style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontSize: '9.6px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap'
                }}>
                  CONTRAPARTE
                </th>
                <th style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontSize: '9.6px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap'
                }}>
                  CATEGORIA
                </th>
                <th style={{
                  padding: '10px 12px',
                  textAlign: 'right',
                  fontSize: '9.6px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap'
                }}>
                  VALOR BRUTO
                </th>
                <th style={{
                  padding: '10px 12px',
                  textAlign: 'right',
                  fontSize: '9.6px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap'
                }}>
                  VALOR LÍQUIDO
                </th>
                <th style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontSize: '9.6px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap'
                }}>
                  VENCIMENTO
                </th>
                <th style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontSize: '9.6px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap'
                }}>
                  STATUS
                </th>
                <th style={{
                  padding: '10px 12px',
                  textAlign: 'right',
                  fontSize: '9.6px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap'
                }}>
                  AÇÕES
                </th>
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((lancamento) => {
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
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '9.6px',
                        fontWeight: '600',
                        backgroundColor: tipoStyle.bg,
                        color: tipoStyle.text,
                        whiteSpace: 'nowrap'
                      }}>
                        {tipoStyle.label}
                      </span>
                    </td>
                    <td style={{
                      padding: '10px 12px',
                      fontSize: '10.4px',
                      color: '#1f2937',
                      fontWeight: '500',
                      maxWidth: '150px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {lancamento.empresa_nome}
                    </td>
                    <td style={{
                      padding: '10px 12px',
                      fontSize: '10.4px',
                      color: '#6b7280',
                      maxWidth: '120px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {lancamento.projeto_nome || '-'}
                    </td>
                    <td style={{
                      padding: '10px 12px',
                      fontSize: '10.4px',
                      color: '#6b7280',
                      maxWidth: '150px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {lancamento.contraparte_nome || '-'}
                    </td>
                    <td style={{
                      padding: '10px 12px',
                      fontSize: '10.4px',
                      color: '#6b7280',
                      maxWidth: '130px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {lancamento.plano_conta?.categoria || '-'}
                    </td>
                    <td style={{
                      padding: '10px 12px',
                      fontSize: '10.4px',
                      color: '#1f2937',
                      fontWeight: '600',
                      textAlign: 'right',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatCurrencyBRL(lancamento.valor_bruto)}
                    </td>
                    <td style={{
                      padding: '10px 12px',
                      fontSize: '10.4px',
                      color: '#1f2937',
                      fontWeight: '600',
                      textAlign: 'right',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatCurrencyBRL(lancamento.valor_liquido)}
                    </td>
                    <td style={{
                      padding: '10px 12px',
                      fontSize: '10.4px',
                      color: '#6b7280',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatDate(lancamento.data_vencimento)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '9.6px',
                        fontWeight: '600',
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.text,
                        whiteSpace: 'nowrap'
                      }}>
                        {statusStyle.label}
                      </span>
                    </td>
                    <td style={{
                      padding: '10px 12px',
                      textAlign: 'right'
                    }}>
                      <div style={{
                        display: 'flex',
                        gap: '6px',
                        justifyContent: 'flex-end'
                      }}>
                        {lancamento.status === 'ABERTO' && (
                          <button
                            onClick={() => setLiquidarModal({ show: true, id: lancamento.id })}
                            style={{
                              padding: '5px 8px',
                              backgroundColor: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '9.6px',
                              fontWeight: '500',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              whiteSpace: 'nowrap'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#059669'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
                          >
                            Liquidar
                          </button>
                        )}
                        <button
                          onClick={() => openModal(lancamento)}
                          style={{
                            padding: '5px',
                            backgroundColor: '#e0e7ff',
                            color: '#1555D6',
                            border: 'none',
                            borderRadius: '6px',
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
                        <button
                          onClick={() => setDeleteConfirm({ show: true, id: lancamento.id })}
                          style={{
                            padding: '5px',
                            backgroundColor: '#fee2e2',
                            color: '#ef4444',
                            border: 'none',
                            borderRadius: '6px',
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
            backdropFilter: 'blur(4px)',
            overflowY: 'auto',
            padding: '20px'
          }}
          onClick={closeModal}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '1400px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              position: 'sticky',
              top: 0,
              backgroundColor: 'white',
              borderBottom: '1px solid #e5e7eb',
              padding: '16px 20px',
              borderTopLeftRadius: '12px',
              borderTopRightRadius: '12px',
              zIndex: 10
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <h2 style={{
                  fontSize: '20px',
                  fontWeight: '600',
                  color: '#1f2937',
                  margin: 0
                }}>
                  {editingId ? 'Editar Lançamento' : 'Novo Lançamento'}
                </h2>
                <button
                  onClick={closeModal}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    padding: '0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'color 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.color = '#1f2937'}
                  onMouseOut={(e) => e.currentTarget.style.color = '#9ca3af'}
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ padding: '20px' }}>
                <div style={{
                  borderBottom: '1px solid #e5e7eb',
                  paddingBottom: '16px',
                  marginBottom: '16px'
                }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#1f2937',
                    marginTop: 0,
                    marginBottom: '14px'
                  }}>
                    Informações Básicas
                  </h3>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '12px',
                  marginBottom: '14px'
                }}>
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
                    >
                      <option value="">Selecione</option>
                      {empresas.map((e) => (
                        <option key={e.id} value={e.id}>{e.nome}</option>
                      ))}
                    </select>
                    {errors.empresa_id && (
                      <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
                        {errors.empresa_id.message}
                      </span>
                    )}
                  </div>

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
                      disabled={!selectedEmpresaId || isLancamentoPago}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
                        outline: 'none',
                        cursor: (!selectedEmpresaId || isLancamentoPago) ? 'not-allowed' : 'pointer',
                        opacity: selectedEmpresaId ? 1 : 0.6,
                        backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                        color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                      }}
                      onFocus={(e) => {
                        if (selectedEmpresaId && !isLancamentoPago) {
                          e.currentTarget.style.borderColor = '#1555D6'
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      <option value="">Selecione</option>
                      {tiposFluxo.map((tipo) => (
                        <option key={tipo} value={tipo}>{tipo}</option>
                      ))}
                    </select>
                    {errors.tipo_fluxo && (
                      <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
                        {errors.tipo_fluxo.message}
                      </span>
                    )}
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Projeto {selectedTipoFluxo !== 'Corporativo' && '*'}
                    </label>
                    <select
                      key={`projeto-${editingId || 'new'}-${selectedEmpresaId}`}
                      {...register('projeto_id')}
                      disabled={!selectedEmpresaId || isLancamentoPago}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
                        outline: 'none',
                        cursor: (!selectedEmpresaId || isLancamentoPago) ? 'not-allowed' : 'pointer',
                        opacity: selectedEmpresaId ? 1 : 0.6,
                        backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                        color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                      }}
                      onFocus={(e) => {
                        if (selectedEmpresaId && !isLancamentoPago) {
                          e.currentTarget.style.borderColor = '#1555D6'
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      <option value="">Selecione</option>
                      {projetos.map((p) => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                    </select>
                    {errors.projeto_id && (
                      <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
                        {errors.projeto_id.message}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '12px',
                  marginBottom: '14px'
                }}>
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
                      key={`subprojeto-${editingId || 'new'}-${selectedProjetoId}`}
                      {...register('subprojeto_id')}
                      disabled={!selectedProjetoId || isLancamentoPago}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
                        outline: 'none',
                        cursor: (!selectedProjetoId || isLancamentoPago) ? 'not-allowed' : 'pointer',
                        opacity: selectedProjetoId ? 1 : 0.6,
                        backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                        color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                      }}
                      onFocus={(e) => {
                        if (selectedProjetoId && !isLancamentoPago) {
                          e.currentTarget.style.borderColor = '#1555D6'
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      <option value="">Selecione</option>
                      {subprojetos.map((sp) => (
                        <option key={sp.id} value={sp.id}>{sp.nome}</option>
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
                      Tipo de Operação *
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
                    >
                      <option value="Entrada">Recebimento</option>
                      <option value="Saida">Pagamento</option>
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
                      Conta Bancária *
                    </label>
                    <select
                      key={`banco-${editingId || 'new'}-${selectedEmpresaId}`}
                      {...register('banco_conta_id')}
                      disabled={!selectedEmpresaId || isLancamentoPago}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
                        outline: 'none',
                        cursor: (!selectedEmpresaId || isLancamentoPago) ? 'not-allowed' : 'pointer',
                        opacity: selectedEmpresaId ? 1 : 0.6,
                        backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                        color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                      }}
                      onFocus={(e) => {
                        if (selectedEmpresaId && !isLancamentoPago) {
                          e.currentTarget.style.borderColor = '#1555D6'
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      <option value="">Selecione</option>
                      {bancosContas.map((bc) => (
                        <option key={bc.id} value={bc.id}>
                          {bc.banco_nome || bc.banco?.nome || 'Banco'} - Ag: {bc.agencia} - Conta: {bc.numero_conta}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{
                  borderTop: '1px solid #e5e7eb',
                  margin: '16px 0',
                  paddingTop: '16px'
                }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#1f2937',
                    marginTop: 0,
                    marginBottom: '14px'
                  }}>
                    Plano de Contas
                  </h3>
                </div>

                {/* PlanoContaPicker agora com Contraparte incluída */}
                <div style={{ marginBottom: '14px' }}>
                  <PlanoContaPicker
                     key={`plano-conta-${editingId || 'new'}-${watch('plano_conta_id')}`}
                     value={watch('plano_conta_id')}
                     onChange={(id) => setValue('plano_conta_id', id)}
                     sentidoFilter={selectedTipoLancamento}
                     tipoFluxoFilter={selectedTipoFluxo}
                     error={errors.plano_conta_id?.message}
                     showContraparte={true}
                     contraparteValue={watch('contraparte_id')}
                     onContraparteChange={(id) => setValue('contraparte_id', id)}
                     contrapartes={contrapartes}
                     contraparteError={errors.contraparte_id?.message}
                />
                </div>

                <div style={{
                  borderTop: '1px solid #e5e7eb',
                  margin: '16px 0',
                  paddingTop: '16px'
                }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#1f2937',
                    marginTop: 0,
                    marginBottom: '14px'
                  }}>
                    Datas, Documentos e Valores
                  </h3>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr 1fr 0.8fr 0.6fr',
                  gap: '12px',
                  marginBottom: '14px'
                }}>
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
                              placeholder="Observação opcional"
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
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '20px',
                    padding: '16px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px'
                  }}>
                    <div>
                      <span style={{
                        display: 'block',
                        fontSize: '13px',
                        color: '#6b7280',
                        marginBottom: '4px'
                      }}>
                        Total de Retenções
                      </span>
                      <span style={{
                        fontSize: '18px',
                        fontWeight: '700',
                        color: '#ef4444'
                      }}>
                        {formatCurrencyBRL(retencoes.reduce((acc, r) => acc + r.valor, 0))}
                      </span>
                    </div>
                    <div>
                      <span style={{
                        display: 'block',
                        fontSize: '13px',
                        color: '#6b7280',
                        marginBottom: '4px'
                      }}>
                        Valor Líquido
                      </span>
                      <span style={{
                        fontSize: '18px',
                        fontWeight: '700',
                        color: '#10b981'
                      }}>
                        {formatCurrencyBRL(valorLiquido)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Observações */}
                <div style={{ marginBottom: '14px' }}>
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
                    rows={3}
                    disabled={isLancamentoPago}
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
              maxWidth: '450px',
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
              maxWidth: '450px',
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
            maxWidth: '600px',
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
              lineHeight: '1.5'
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
  `}</style>
</div>
)
}