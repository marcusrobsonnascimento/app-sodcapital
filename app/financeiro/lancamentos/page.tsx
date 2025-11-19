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
  { value: 'IRRF', label: 'IRRF' },
  { value: 'INSS', label: 'INSS' },
  { value: 'ISSQN', label: 'ISSQN' },
  { value: 'PIS', label: 'PIS' },
  { value: 'COFINS', label: 'COFINS' },
  { value: 'CSLL', label: 'CSLL' },
  { value: 'OUTRO', label: 'Outro' }
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
  const [selectedContraparteFilter, setSelectedContraparteFilter] = useState<string>('')
  const [dataVencimentoInicio, setDataVencimentoInicio] = useState('')
  const [dataVencimentoFim, setDataVencimentoFim] = useState('')

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

  // Toast functions
  const showToast = (message: string, type: ToastType) => {
    const id = toastIdCounter
    setToastIdCounter(prev => prev + 1)
    const newToast: Toast = { id, message, type }
    setToasts(prev => [...prev, newToast])
    const duration = type === 'warning' ? 2000 : 3000
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }, duration)
  }

  const showToastWithConfirmation = (message: string, type: ToastType) => {
    const id = toastIdCounter
    setToastIdCounter(prev => prev + 1)
    const newToast: Toast = { id, message, type, requiresConfirmation: true }
    setToasts(prev => [...prev, newToast])
  }

  const dismissToast = (id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

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

  // Limpar projeto quando tipo de fluxo for Corporativo
  useEffect(() => {
    if (selectedTipoFluxo === 'Corporativo') {
      setValue('projeto_id', '')
      setValue('subprojeto_id', '')
    }
  }, [selectedTipoFluxo, setValue])

  // Load data functions
  const loadEmpresas = async () => {
    const { data, error } = await supabase
      .from('empresas')
      .select('*')
      .eq('ativo', true)
      .order('nome')
    if (error) {
      console.error('Erro ao carregar empresas:', error)
      showToast('Erro ao carregar empresas', 'error')
    } else {
      setEmpresas(data || [])
    }
  }

  const loadProjetos = async (empresaId: string) => {
    const { data, error } = await supabase
      .from('projetos')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .is('projeto_pai_id', null)
      .order('nome')
    if (error) {
      console.error('Erro ao carregar projetos:', error)
      showToast('Erro ao carregar projetos', 'error')
    } else {
      setProjetos(data || [])
    }
  }

  const loadSubprojetos = async (projetoId: string) => {
    const { data, error } = await supabase
      .from('projetos')
      .select('*')
      .eq('projeto_pai_id', projetoId)
      .eq('ativo', true)
      .order('nome')
    if (error) {
      console.error('Erro ao carregar subprojetos:', error)
      showToast('Erro ao carregar subprojetos', 'error')
    } else {
      setSubprojetos(data || [])
    }
  }

  const loadBancosContas = async (empresaId: string) => {
    const { data, error } = await supabase
      .from('bancos_contas')
      .select(`
        *,
        banco:bancos(nome)
      `)
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .eq('tipo_conta', 'CC')
      .order('banco_nome')
    if (error) {
      console.error('Erro ao carregar contas bancárias:', error)
      showToast('Erro ao carregar contas bancárias', 'error')
    } else {
      setBancosContas(data || [])
    }
  }

  const loadContrapartes = async () => {
    const { data, error } = await supabase
      .from('contrapartes')
      .select('*')
      .eq('ativo', true)
      .order('nome')
    if (error) {
      console.error('Erro ao carregar contrapartes:', error)
      showToast('Erro ao carregar contrapartes', 'error')
    } else {
      setContrapartes(data || [])
    }
  }

  const loadTiposFluxo = async () => {
    const { data, error } = await supabase
      .from('plano_contas_fluxo')
      .select('tipo_fluxo')
      .eq('ativo', true)
    
    if (error) {
      console.error('Erro ao carregar tipos de fluxo:', error)
      showToast('Erro ao carregar tipos de fluxo', 'error')
    } else {
      const tiposUnicos = Array.from(new Set((data || []).map(item => item.tipo_fluxo))).sort()
      setTiposFluxo(tiposUnicos)
    }
  }

  const loadRetencoes = async (lancamentoId: string) => {
    const { data, error } = await supabase
      .from('lancamento_retencoes')
      .select('*')
      .eq('lancamento_id', lancamentoId)
    
    if (error) {
      console.error('Erro ao carregar retenções:', error)
    } else {
      const retencoesFormatadas = (data || []).map(r => ({
        ...r,
        valorFormatado: formatCurrencyInput((r.valor * 100).toString())
      }))
      setRetencoes(retencoesFormatadas)
    }
  }

  const loadLancamentos = async (pageNum: number = 0, isLoadMore = false) => {
    if (isLoadMore) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }

    let query = supabase
      .from('lancamentos')
      .select(`
        *,
        empresa:empresas!lancamentos_empresa_id_fkey(nome),
        projeto:projetos!lancamentos_projeto_id_fkey(nome),
        subprojeto:projetos!lancamentos_subprojeto_id_fkey(nome),
        contraparte:contrapartes(nome),
        plano_conta:plano_contas_fluxo(*)
      `)
      .order('data_vencimento', { ascending: false })
      .order('created_at', { ascending: false })
      .range(pageNum * ITEMS_PER_PAGE, (pageNum + 1) * ITEMS_PER_PAGE - 1)

    // Aplicar filtros
    if (searchTerm) {
      query = query.or(`documento_numero.ilike.%${searchTerm}%,observacoes.ilike.%${searchTerm}%`)
    }
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
    if (selectedContraparteFilter) {
      query = query.eq('contraparte_id', selectedContraparteFilter)
    }
    if (dataVencimentoInicio) {
      query = query.gte('data_vencimento', dataVencimentoInicio)
    }
    if (dataVencimentoFim) {
      query = query.lte('data_vencimento', dataVencimentoFim)
    }

    const { data, error } = await query

    if (error) {
      console.error('Erro ao carregar lançamentos:', error)
      showToast('Erro ao carregar lançamentos', 'error')
      if (isLoadMore) {
        setLoadingMore(false)
      } else {
        setLoading(false)
      }
      return
    }

    const lancamentosFormatados = (data || []).map(l => ({
      ...l,
      empresa_nome: l.empresa?.nome,
      projeto_nome: l.projeto?.nome,
      subprojeto_nome: l.subprojeto?.nome,
      contraparte_nome: l.contraparte?.nome
    }))

    if (isLoadMore) {
      setLancamentos(prev => [...prev, ...lancamentosFormatados])
    } else {
      setLancamentos(lancamentosFormatados)
    }

    setHasMore(lancamentosFormatados.length === ITEMS_PER_PAGE)
    
    if (isLoadMore) {
      setLoadingMore(false)
    } else {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEmpresas()
    loadContrapartes()
    loadTiposFluxo()
    loadLancamentos()
  }, [])

  useEffect(() => {
    setPage(0)
    loadLancamentos(0, false)
  }, [
    searchTerm,
    selectedTipoFilter,
    selectedStatusFilter,
    selectedEmpresaFilter,
    selectedProjetoFilter,
    selectedContraparteFilter,
  ])

  useEffect(() => {
    if (selectedEmpresaId) {
      loadProjetos(selectedEmpresaId)
      loadBancosContas(selectedEmpresaId)
      setValue('projeto_id', '')
      setValue('subprojeto_id', '')
      setValue('banco_conta_id', '')
    } else {
      setProjetos([])
      setBancosContas([])
    }
  }, [selectedEmpresaId, setValue])

  useEffect(() => {
    if (selectedProjetoId) {
      loadSubprojetos(selectedProjetoId)
      setValue('subprojeto_id', '')
    } else {
      setSubprojetos([])
    }
  }, [selectedProjetoId, setValue])

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = () => setShowContraparteDropdown(false)
    if (showContraparteDropdown) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showContraparteDropdown])

  const handleLoadMore = () => {
    const nextPage = page + 1
    setPage(nextPage)
    loadLancamentos(nextPage, true)
  }

  const handleAtualizar = () => {
    setPage(0)
    loadLancamentos(0, false)
  }

  // Funções do combobox de contraparte
  const contrapartesFiltradas = contrapartes.filter(c => 
    c.nome.toLowerCase().includes(contraparteSearchTerm.toLowerCase()) ||
    (c.apelido && c.apelido.toLowerCase().includes(contraparteSearchTerm.toLowerCase()))
  )

  const handleSelectContraparte = (contraparteId: string, contraparteNome: string) => {
    setSelectedContraparteFilter(contraparteId)
    setContraparteNomeExibicao(contraparteNome)
    setContraparteSearchTerm(contraparteNome)
    setShowContraparteDropdown(false)
    setPage(0)
    loadLancamentos(0, false)
  }

  const handleClearContraparte = () => {
    setSelectedContraparteFilter('')
    setContraparteNomeExibicao('')
    setContraparteSearchTerm('')
    setShowContraparteDropdown(false)
    setPage(0)
    loadLancamentos(0, false)
  }

  const openModal = (lancamento?: Lancamento) => {
    if (lancamento) {
      setEditingId(lancamento.id)
      
      // Definir se o lançamento está pago
      const isPago = lancamento.status === 'PAGO_RECEBIDO'
      setIsLancamentoPago(isPago)

      // Carregar retenções
      loadRetencoes(lancamento.id)

      // Popular o formulário
      setValue('tipo', lancamento.tipo)
      setValue('empresa_id', lancamento.empresa_id)
      setValue('tipo_fluxo', lancamento.plano_conta?.tipo_fluxo || '')
      setValue('projeto_id', lancamento.projeto_id || '')
      setValue('subprojeto_id', lancamento.subprojeto_id || '')
      setValue('banco_conta_id', lancamento.banco_conta_id || '')
      setValue('contraparte_id', lancamento.contraparte_id || '')
      setValue('plano_conta_id', lancamento.plano_conta_id)
      setValue('valor_bruto', lancamento.valor_bruto)
      setValue('data_emissao', formatDateForInput(lancamento.data_emissao))
      setValue('data_vencimento', formatDateForInput(lancamento.data_vencimento))
      setValue('data_previsao_pagamento', formatDateForInput(lancamento.data_previsao_pagamento))
      setValue('documento_tipo', lancamento.documento_tipo || '')
      setValue('documento_numero', lancamento.documento_numero || '')
      setValue('observacoes', lancamento.observacoes || '')

      setValorBruto(lancamento.valor_bruto)
      setValorBrutoFormatado(formatCurrencyInput((lancamento.valor_bruto * 100).toString()))
      setValorLiquido(lancamento.valor_liquido)
    } else {
      setEditingId(null)
      setIsLancamentoPago(false)
      setRetencoes([])
      setValorBruto(0)
      setValorBrutoFormatado('')
      setValorLiquido(0)
      reset()
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setIsLancamentoPago(false)
    setRetencoes([])
    setValorBruto(0)
    setValorBrutoFormatado('')
    setValorLiquido(0)
    reset()
  }

  const calcularValorLiquido = (valorBruto: number, retencoes: Retencao[]): number => {
    const totalRetencoes = retencoes.reduce((sum, r) => sum + r.valor, 0)
    return valorBruto - totalRetencoes
  }

  useEffect(() => {
    const liquido = calcularValorLiquido(valorBruto, retencoes)
    setValorLiquido(liquido)
  }, [valorBruto, retencoes])

  const adicionarRetencao = () => {
    setRetencoes([
      ...retencoes,
      { imposto: 'IRRF', valor: 0, valorFormatado: '', detalhe: null }
    ])
  }

  const removerRetencao = (index: number) => {
    setRetencoes(retencoes.filter((_, i) => i !== index))
  }

  const atualizarRetencao = (index: number, campo: keyof Retencao, valor: any) => {
    const novasRetencoes = [...retencoes]
    
    if (campo === 'valorFormatado') {
      const formatted = formatCurrencyInput(valor)
      const numericValue = parseCurrencyInput(formatted)
      novasRetencoes[index] = {
        ...novasRetencoes[index],
        valorFormatado: formatted,
        valor: numericValue
      }
    } else {
      novasRetencoes[index] = {
        ...novasRetencoes[index],
        [campo]: valor
      }
    }
    
    setRetencoes(novasRetencoes)
  }

  const onSubmit = async (formData: LancamentoForm) => {
    const lancamentoData = {
      tipo: formData.tipo,
      empresa_id: formData.empresa_id,
      projeto_id: selectedTipoFluxo === 'Corporativo' ? null : (formData.projeto_id || null),
      subprojeto_id: formData.subprojeto_id || null,
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
      observacoes: formData.observacoes || null,
      status: 'ABERTO',
      sentido: formData.tipo === 'Entrada' ? 'Entrada' : 'Saida'
    }

    if (editingId) {
      // Atualização
      const { error } = await supabase
        .from('lancamentos')
        .update(lancamentoData)
        .eq('id', editingId)

      if (error) {
        console.error('Erro ao atualizar lançamento:', error)
        showToast('Erro ao atualizar lançamento', 'error')
        return
      }

      // Atualizar retenções
      await supabase
        .from('lancamento_retencoes')
        .delete()
        .eq('lancamento_id', editingId)

      if (retencoes.length > 0) {
        const retencoesData = retencoes.map(r => ({
          lancamento_id: editingId,
          imposto: r.imposto,
          valor: r.valor,
          detalhe: r.detalhe
        }))

        await supabase
          .from('lancamento_retencoes')
          .insert(retencoesData)
      }

      showToast('Lançamento atualizado com sucesso!', 'success')
    } else {
      // Criação
      const { data: newLancamento, error } = await supabase
        .from('lancamentos')
        .insert([lancamentoData])
        .select()
        .single()

      if (error) {
        console.error('Erro ao criar lançamento:', error)
        showToast('Erro ao criar lançamento', 'error')
        return
      }

      // Inserir retenções
      if (retencoes.length > 0 && newLancamento) {
        const retencoesData = retencoes.map(r => ({
          lancamento_id: newLancamento.id,
          imposto: r.imposto,
          valor: r.valor,
          detalhe: r.detalhe
        }))

        await supabase
          .from('lancamento_retencoes')
          .insert(retencoesData)
      }

      showToast('Lançamento criado com sucesso!', 'success')
    }

    closeModal()
    loadLancamentos()
  }

  const onSubmitError = (errors: any) => {
    console.log('Erros de validação:', errors)
    const firstError = Object.values(errors)[0] as any
    if (firstError?.message) {
      showToast(firstError.message, 'error')
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm.id) return

    const { error } = await supabase
      .from('lancamentos')
      .delete()
      .eq('id', deleteConfirm.id)

    if (error) {
      console.error('Erro ao excluir lançamento:', error)
      showToast('Erro ao excluir lançamento', 'error')
    } else {
      showToast('Lançamento excluído com sucesso!', 'success')
      loadLancamentos()
    }

    setDeleteConfirm({ show: false, id: null })
  }

  const handleLiquidar = async () => {
    if (!liquidarModal.id || !dataLiquidacao) return

    const { error } = await supabase
      .from('lancamentos')
      .update({
        status: 'PAGO_RECEBIDO',
        data_liquidacao: dataLiquidacao
      })
      .eq('id', liquidarModal.id)

    if (error) {
      console.error('Erro ao liquidar lançamento:', error)
      showToast('Erro ao liquidar lançamento', 'error')
    } else {
      showToast('Lançamento liquidado com sucesso!', 'success')
      loadLancamentos()
    }

    setLiquidarModal({ show: false, id: null })
    setDataLiquidacao('')
  }

  const getStatusBadgeStyle = (status: string) => {
    const styles = {
      ABERTO: { bg: '#fef3c7', text: '#92400e', label: 'Aberto' },
      PAGO_RECEBIDO: { bg: '#d1fae5', text: '#065f46', label: 'Liquidado' },
      CANCELADO: { bg: '#fee2e2', text: '#991b1b', label: 'Cancelado' }
    }
    return styles[status as keyof typeof styles] || styles.ABERTO
  }

  const getTipoBadgeStyle = (tipo: string) => {
    return tipo === 'Entrada'
      ? { bg: '#d1fae5', text: '#065f46', label: 'Recebimento' }
      : { bg: '#fee2e2', text: '#991b1b', label: 'Pagamento' }
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '18px',
        color: '#6b7280'
      }}>
        Carregando...
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1800px', margin: '0 auto' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <h1 style={{
          fontSize: '28px',
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
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1044b5'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1555D6'}
        >
          <Plus size={20} />
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
          gap: '16px'
        }}>
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
              <Search
                size={18}
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
                placeholder="Documento, observações..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 10px 9px 38px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px',
                  outline: 'none'
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
              onChange={(e) => setSelectedEmpresaFilter(e.target.value)}
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
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.nome}</option>
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
              Vencimento - De
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
              Vencimento - Até
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
              Contraparte
            </label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Digite para buscar..."
                  value={contraparteSearchTerm}
                  onChange={(e) => {
                    setContraparteSearchTerm(e.target.value)
                    setShowContraparteDropdown(true)
                  }}
                  onFocus={() => setShowContraparteDropdown(true)}
                  style={{
                    width: '100%',
                    padding: '9px 32px 9px 10px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
                {selectedContraparteFilter && (
                  <X
                    size={16}
                    onClick={handleClearContraparte}
                    style={{
                      position: 'absolute',
                      right: '32px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#9ca3af',
                      cursor: 'pointer'
                    }}
                  />
                )}
                <ChevronDown
                  size={16}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#9ca3af',
                    pointerEvents: 'none'
                  }}
                />
              </div>
              
              {showContraparteDropdown && contrapartesFiltradas.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    marginTop: '4px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    zIndex: 10
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {contrapartesFiltradas.slice(0, 50).map((contraparte) => (
                    <div
                      key={contraparte.id}
                      onClick={() => handleSelectContraparte(contraparte.id, contraparte.nome)}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        borderBottom: '1px solid #f3f4f6',
                        backgroundColor: selectedContraparteFilter === contraparte.id ? '#eff6ff' : 'white'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedContraparteFilter !== contraparte.id) {
                          e.currentTarget.style.backgroundColor = '#f9fafb'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedContraparteFilter !== contraparte.id) {
                          e.currentTarget.style.backgroundColor = 'white'
                        }
                      }}
                    >
                      <div style={{ fontWeight: '500', color: '#111827' }}>
                        {contraparte.nome}
                      </div>
                      {contraparte.apelido && (
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {contraparte.apelido}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px',
              visibility: 'hidden'
            }}>
              Ações
            </label>
            <button
              onClick={handleAtualizar}
              style={{
                width: '100%',
                padding: '9px 16px',
                backgroundColor: '#1555D6',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '500',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1044b5'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1555D6'}
            >
              <RefreshCw size={16} />
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
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Tipo
                </th>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Empresa
                </th>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Projeto
                </th>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Contraparte
                </th>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Categoria
                </th>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'right',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Valor Bruto
                </th>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'right',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Valor Líquido
                </th>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Vencimento
                </th>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Status
                </th>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'right',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Ações
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
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600',
                        backgroundColor: tipoStyle.bg,
                        color: tipoStyle.text
                      }}>
                        {tipoStyle.label}
                      </span>
                    </td>
                    <td style={{
                      padding: '14px 16px',
                      fontSize: '13px',
                      color: '#1f2937',
                      fontWeight: '500'
                    }}>
                      {lancamento.empresa_nome}
                    </td>
                    <td style={{
                      padding: '14px 16px',
                      fontSize: '13px',
                      color: '#6b7280'
                    }}>
                      {lancamento.projeto_nome || '-'}
                    </td>
                    <td style={{
                      padding: '14px 16px',
                      fontSize: '13px',
                      color: '#6b7280'
                    }}>
                      {lancamento.contraparte_nome || '-'}
                    </td>
                    <td style={{
                      padding: '14px 16px',
                      fontSize: '13px',
                      color: '#6b7280'
                    }}>
                      {lancamento.plano_conta?.categoria || '-'}
                    </td>
                    <td style={{
                      padding: '14px 16px',
                      fontSize: '13px',
                      color: '#1f2937',
                      fontWeight: '600',
                      textAlign: 'right'
                    }}>
                      {formatCurrencyBRL(lancamento.valor_bruto)}
                    </td>
                    <td style={{
                      padding: '14px 16px',
                      fontSize: '13px',
                      color: '#1f2937',
                      fontWeight: '600',
                      textAlign: 'right'
                    }}>
                      {formatCurrencyBRL(lancamento.valor_liquido)}
                    </td>
                    <td style={{
                      padding: '14px 16px',
                      fontSize: '13px',
                      color: '#6b7280'
                    }}>
                      {formatDate(lancamento.data_vencimento)}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600',
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.text
                      }}>
                        {statusStyle.label}
                      </span>
                    </td>
                    <td style={{
                      padding: '14px 16px',
                      textAlign: 'right'
                    }}>
                      <div style={{
                        display: 'flex',
                        gap: '8px',
                        justifyContent: 'flex-end'
                      }}>
                        {lancamento.status === 'ABERTO' && (
                          <button
                            onClick={() => setLiquidarModal({ show: true, id: lancamento.id })}
                            style={{
                              padding: '6px 10px',
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
                        )}
                        <button
                          onClick={() => openModal(lancamento)}
                          style={{
                            padding: '6px',
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
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ show: true, id: lancamento.id })}
                          style={{
                            padding: '6px',
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
                          <Trash2 size={16} />
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
                fontSize: '14px',
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
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6'
                    e.currentTarget.style.color = '#6b7280'
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = '#9ca3af'
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{ padding: '18px', overflowY: 'auto' }}>
              <form onSubmit={handleSubmit(onSubmit, onSubmitError)}>
                {/* LINHA 1: Empresa | Tipo de Fluxo | Projeto | Subprojeto | Tipo | Conta Bancária */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr 1fr 120px 1fr',
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
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
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
                      <option value="">Selecione</option>
                      {empresas.map((emp) => (
                        <option key={emp.id} value={emp.id}>{emp.nome}</option>
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
                      Tipo de Fluxo *
                    </label>
                    <select
                      {...register('tipo_fluxo')}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
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
                      <option value="">Selecione</option>
                      {tiposFluxo.map((tipo) => (
                        <option key={tipo} value={tipo}>{tipo}</option>
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
                      Projeto {selectedTipoFluxo !== 'Corporativo' && '*'}
                    </label>
                    <select
                      key={`projeto-${editingId || 'new'}-${selectedEmpresaId}`}
                      {...register('projeto_id')}
                      disabled={!selectedEmpresaId || selectedTipoFluxo === 'Corporativo'}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
                        outline: 'none',
                        cursor: (selectedEmpresaId && selectedTipoFluxo !== 'Corporativo') ? 'pointer' : 'not-allowed',
                        opacity: (selectedEmpresaId && selectedTipoFluxo !== 'Corporativo') ? 1 : 0.6
                      }}
                      onFocus={(e) => {
                        if (selectedEmpresaId && selectedTipoFluxo !== 'Corporativo') {
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
                      {projetos.map((proj) => (
                        <option key={proj.id} value={proj.id}>{proj.nome}</option>
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
                      Subprojeto
                    </label>
                    <select
                      key={`subprojeto-${editingId || 'new'}-${selectedProjetoId}`}
                      {...register('subprojeto_id')}
                      disabled={!selectedProjetoId || subprojetos.length === 0}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
                        outline: 'none',
                        cursor: (selectedProjetoId && subprojetos.length > 0) ? 'pointer' : 'not-allowed',
                        opacity: (selectedProjetoId && subprojetos.length > 0) ? 1 : 0.6
                      }}
                      onFocus={(e) => {
                        if (selectedProjetoId && subprojetos.length > 0) {
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
                      {subprojetos.map((sub) => (
                        <option key={sub.id} value={sub.id}>{sub.nome}</option>
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
                      Tipo *
                    </label>
                    <select
                      {...register('tipo')}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
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
                      disabled={!selectedEmpresaId}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
                        outline: 'none',
                        cursor: selectedEmpresaId ? 'pointer' : 'not-allowed',
                        opacity: selectedEmpresaId ? 1 : 0.6
                      }}
                      onFocus={(e) => {
                        if (selectedEmpresaId) {
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
                      Previsão Pgto
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
                        color: isLancamentoPago ? '#6b7280' : '#1555D6',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '500',
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

                  {retencoes.map((retencao, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 2fr 40px',
                        gap: '12px',
                        marginBottom: '12px',
                        padding: '12px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '8px'
                      }}
                    >
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#374151',
                          marginBottom: '6px'
                        }}>
                          Tipo de Imposto
                        </label>
                        <select
                          value={retencao.imposto}
                          onChange={(e) => atualizarRetencao(index, 'imposto', e.target.value)}
                          disabled={isLancamentoPago}
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            fontSize: '13px',
                            outline: 'none',
                            cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                            backgroundColor: isLancamentoPago ? '#e5e7eb' : 'white',
                            color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                          }}
                        >
                          {IMPOSTOS.map((imp) => (
                            <option key={imp.value} value={imp.value}>{imp.label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#374151',
                          marginBottom: '6px'
                        }}>
                          Valor
                        </label>
                        <div style={{ position: 'relative' }}>
                          <span style={{
                            position: 'absolute',
                            left: '8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: '12px',
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
                              padding: '8px 8px 8px 28px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              fontSize: '13px',
                              outline: 'none',
                              textAlign: 'right',
                              backgroundColor: isLancamentoPago ? '#e5e7eb' : 'white',
                              cursor: isLancamentoPago ? 'not-allowed' : 'text',
                              color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '12px',
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
                          placeholder="Descrição adicional..."
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            fontSize: '13px',
                            outline: 'none',
                            backgroundColor: isLancamentoPago ? '#e5e7eb' : 'white',
                            cursor: isLancamentoPago ? 'not-allowed' : 'text',
                            color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                          }}
                        />
                      </div>

                      <div style={{
                        display: 'flex',
                        alignItems: 'flex-end'
                      }}>
                        <button
                          type="button"
                          onClick={() => removerRetencao(index)}
                          disabled={isLancamentoPago}
                          style={{
                            padding: '8px',
                            backgroundColor: isLancamentoPago ? '#d1d5db' : '#fee2e2',
                            color: isLancamentoPago ? '#6b7280' : '#ef4444',
                            border: 'none',
                            borderRadius: '6px',
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
                    </div>
                  ))}

                  <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '16px',
                    padding: '14px',
                    backgroundColor: '#f0f9ff',
                    borderRadius: '8px',
                    marginTop: '12px'
                  }}>
                    <div>
                      <div style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        marginBottom: '4px'
                      }}>
                        Valor Bruto
                      </div>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '700',
                        color: '#1f2937'
                      }}>
                        {formatCurrencyBRL(valorBruto)}
                      </div>
                    </div>
                    
                    <div>
                      <div style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        marginBottom: '4px'
                      }}>
                        Total Retenções
                      </div>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '700',
                        color: '#ef4444'
                      }}>
                        - {formatCurrencyBRL(retencoes.reduce((sum, r) => sum + r.valor, 0))}
                      </div>
                    </div>

                    <div>
                      <div style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        marginBottom: '4px'
                      }}>
                        Valor Líquido
                      </div>
                      <div style={{
                        fontSize: '18px',
                        fontWeight: '700',
                        color: '#10b981'
                      }}>
                        {formatCurrencyBRL(valorLiquido)}
                      </div>
                    </div>
                  </div>
                </div>

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
                    disabled={isLancamentoPago}
                    rows={3}
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

                {/* Botões do formulário */}
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end',
                  paddingTop: '16px',
                  borderTop: '1px solid #e5e7eb'
                }}>
                  <button
                    type="button"
                    onClick={closeModal}
                    style={{
                      padding: '12px 24px',
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
                      padding: '12px 24px',
                      backgroundColor: '#1555D6',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: 'white',
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
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
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
                onClick={handleDelete}
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