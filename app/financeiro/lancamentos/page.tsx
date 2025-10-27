'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, Search, CheckCircle, AlertTriangle, XCircle, Filter, DollarSign, X, Calendar } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

// Toast notification system
type ToastType = 'success' | 'warning' | 'error'

interface Toast {
  id: number
  message: string
  type: ToastType
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
}

interface BancoConta {
  id: string
  empresa_id: string
  banco_nome: string
  numero_conta: string
}

interface Contraparte {
  id: string
  nome: string
}

interface Tipo {
  id: string
  nome: string
}

interface Grupo {
  id: string
  tipo_id: string
  nome: string
}

interface Categoria {
  id: string
  grupo_id: string
  nome: string
}

interface Subcategoria {
  id: string
  categoria_id: string
  nome: string
}

interface Retencao {
  id?: string
  imposto: string
  valor: number
  detalhe: string
}

interface Lancamento {
  id: string
  tipo: 'RECEITA' | 'DESPESA'
  empresa_id: string
  projeto_id: string | null
  banco_conta_id: string | null
  contraparte_id: string | null
  subcategoria_id: string
  valor_bruto: number
  valor_liquido: number
  data_emissao: string | null
  data_vencimento: string
  data_liquidacao: string | null
  status: 'ABERTO' | 'PAGO_RECEBIDO' | 'CANCELADO'
  documento_tipo: string | null
  documento_numero: string | null
  observacoes: string | null
  created_at: string
  empresa_nome?: string
  projeto_nome?: string
  contraparte_nome?: string
  subcategoria_nome?: string
  categoria_nome?: string
  grupo_nome?: string
  tipo_plano_nome?: string
  retencoes?: Retencao[]
}

// Função para formatar moeda BRL
const formatCurrencyBRL = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).valueOf().format(value)
}

// Função para formatar data para input date
const formatDateForInput = (date: string | null): string => {
  if (!date) return ''
  return date.split('T')[0]
}

const lancamentoSchema = z.object({
  tipo: z.enum(['RECEITA', 'DESPESA'], { required_error: 'Tipo é obrigatório' }),
  empresa_id: z.string().min(1, 'Empresa é obrigatória'),
  projeto_id: z.string().optional(),
  banco_conta_id: z.string().optional(),
  contraparte_id: z.string().optional(),
  tipo_plano_id: z.string().min(1, 'Tipo do plano de contas é obrigatório'),
  grupo_id: z.string().min(1, 'Grupo é obrigatório'),
  categoria_id: z.string().min(1, 'Categoria é obrigatória'),
  subcategoria_id: z.string().min(1, 'Subcategoria é obrigatória'),
  valor_bruto: z.coerce.number().min(0, 'Valor bruto deve ser maior ou igual a 0'),
  data_emissao: z.string().optional(),
  data_vencimento: z.string().min(1, 'Data de vencimento é obrigatória'),
  documento_tipo: z.string().optional(),
  documento_numero: z.string().optional(),
  observacoes: z.string().optional()
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
  const [bancosContas, setBancosContas] = useState<BancoConta[]>([])
  const [contrapartes, setContrapartes] = useState<Contraparte[]>([])
  const [tipos, setTipos] = useState<Tipo[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTipoFilter, setSelectedTipoFilter] = useState<string>('')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('')
  const [selectedEmpresaFilter, setSelectedEmpresaFilter] = useState<string>('')
  const [selectedProjetoFilter, setSelectedProjetoFilter] = useState<string>('')
  const [selectedContraparteFilter, setSelectedContraparteFilter] = useState<string>('')
  const [selectedTipoPlanoFilter, setSelectedTipoPlanoFilter] = useState<string>('')
  const [selectedGrupoFilter, setSelectedGrupoFilter] = useState<string>('')
  const [selectedCategoriaFilter, setSelectedCategoriaFilter] = useState<string>('')
  const [selectedSubcategoriaFilter, setSelectedSubcategoriaFilter] = useState<string>('')
  const [dataVencimentoInicio, setDataVencimentoInicio] = useState('')
  const [dataVencimentoFim, setDataVencimentoFim] = useState('')

  // Retenções
  const [retencoes, setRetencoes] = useState<Retencao[]>([])
  const [valorBruto, setValorBruto] = useState<number>(0)
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
      tipo: 'DESPESA',
      empresa_id: '',
      projeto_id: '',
      banco_conta_id: '',
      contraparte_id: '',
      tipo_plano_id: '',
      grupo_id: '',
      categoria_id: '',
      subcategoria_id: '',
      valor_bruto: 0,
      data_emissao: '',
      data_vencimento: '',
      documento_tipo: '',
      documento_numero: '',
      observacoes: ''
    }
  })

  const selectedEmpresaId = watch('empresa_id')
  const selectedTipoPlanoId = watch('tipo_plano_id')
  const selectedGrupoId = watch('grupo_id')
  const selectedCategoriaId = watch('categoria_id')

  // Toast functions
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
        return {
          borderColor: '#10b981',
          icon: CheckCircle,
          iconColor: '#10b981'
        }
      case 'warning':
        return {
          borderColor: '#eab308',
          icon: AlertTriangle,
          iconColor: '#eab308'
        }
      case 'error':
        return {
          borderColor: '#ef4444',
          icon: XCircle,
          iconColor: '#ef4444'
        }
    }
  }

  useEffect(() => {
    loadEmpresas()
    loadContrapartes()
    loadTipos()
    loadLancamentos()
  }, [])

  // Filtros de plano de contas (filtros superiores)
  useEffect(() => {
    if (selectedTipoPlanoFilter) {
      loadGrupos(selectedTipoPlanoFilter)
      setSelectedGrupoFilter('')
      setSelectedCategoriaFilter('')
      setSelectedSubcategoriaFilter('')
    } else {
      setGrupos([])
      setSelectedGrupoFilter('')
      setSelectedCategoriaFilter('')
      setSelectedSubcategoriaFilter('')
    }
  }, [selectedTipoPlanoFilter])

  useEffect(() => {
    if (selectedGrupoFilter) {
      loadCategorias(selectedGrupoFilter)
      setSelectedCategoriaFilter('')
      setSelectedSubcategoriaFilter('')
    } else {
      setCategorias([])
      setSelectedCategoriaFilter('')
      setSelectedSubcategoriaFilter('')
    }
  }, [selectedGrupoFilter])

  useEffect(() => {
    if (selectedCategoriaFilter) {
      loadSubcategorias(selectedCategoriaFilter)
      setSelectedSubcategoriaFilter('')
    } else {
      setSubcategorias([])
      setSelectedSubcategoriaFilter('')
    }
  }, [selectedCategoriaFilter])

  // Filtros de empresa/projeto
  useEffect(() => {
    if (selectedEmpresaFilter) {
      loadProjetosFilter(selectedEmpresaFilter)
      setSelectedProjetoFilter('')
    } else {
      setSelectedProjetoFilter('')
    }
  }, [selectedEmpresaFilter])

  // Formulário - quando mudar empresa
  useEffect(() => {
    if (selectedEmpresaId && !isEditing) {
      loadProjetos(selectedEmpresaId)
      loadBancosContas(selectedEmpresaId)
      setValue('projeto_id', '')
      setValue('banco_conta_id', '')
    }
  }, [selectedEmpresaId])

  // Formulário - cascata plano de contas
  useEffect(() => {
    if (selectedTipoPlanoId && !isEditing) {
      loadGrupos(selectedTipoPlanoId)
      setValue('grupo_id', '')
      setValue('categoria_id', '')
      setValue('subcategoria_id', '')
    }
  }, [selectedTipoPlanoId])

  useEffect(() => {
    if (selectedGrupoId && !isEditing) {
      loadCategorias(selectedGrupoId)
      setValue('categoria_id', '')
      setValue('subcategoria_id', '')
    }
  }, [selectedGrupoId])

  useEffect(() => {
    if (selectedCategoriaId && !isEditing) {
      loadSubcategorias(selectedCategoriaId)
      setValue('subcategoria_id', '')
    }
  }, [selectedCategoriaId])

  // Recalcular valor líquido quando mudar valor bruto ou retenções
  useEffect(() => {
    const totalRetencoes = retencoes.reduce((sum, ret) => sum + (ret.valor || 0), 0)
    const liquido = Math.max(0, valorBruto - totalRetencoes)
    setValorLiquido(liquido)
  }, [valorBruto, retencoes])

  const loadEmpresas = async () => {
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome')
        .order('nome', { ascending: true })

      if (error) throw error
      setEmpresas(data || [])
    } catch (err) {
      console.error('Erro ao carregar empresas:', err)
      showToast('Erro ao carregar empresas', 'error')
    }
  }

  const loadProjetos = async (empresaId: string) => {
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, empresa_id, nome')
        .eq('empresa_id', empresaId)
        .order('nome', { ascending: true })

      if (error) throw error
      setProjetos(data || [])
    } catch (err) {
      console.error('Erro ao carregar projetos:', err)
      showToast('Erro ao carregar projetos', 'error')
    }
  }

  const loadProjetosFilter = async (empresaId: string) => {
    // Para o filtro, carregar projetos sem alterar o estado principal
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, empresa_id, nome')
        .eq('empresa_id', empresaId)
        .order('nome', { ascending: true })

      if (error) throw error
      // Aqui você poderia ter um estado separado para projetos do filtro
      // Por simplicidade, vamos usar o mesmo estado
      setProjetos(data || [])
    } catch (err) {
      console.error('Erro ao carregar projetos:', err)
    }
  }

  const loadBancosContas = async (empresaId: string) => {
    try {
      const { data, error } = await supabase
        .from('bancos_contas')
        .select('id, empresa_id, banco_nome, numero_conta')
        .eq('empresa_id', empresaId)
        .order('banco_nome', { ascending: true })

      if (error) throw error
      setBancosContas(data || [])
    } catch (err) {
      console.error('Erro ao carregar contas bancárias:', err)
      showToast('Erro ao carregar contas bancárias', 'error')
    }
  }

  const loadContrapartes = async () => {
    try {
      const { data, error } = await supabase
        .from('contrapartes')
        .select('id, nome')
        .order('nome', { ascending: true })

      if (error) throw error
      setContrapartes(data || [])
    } catch (err) {
      console.error('Erro ao carregar contrapartes:', err)
      showToast('Erro ao carregar contrapartes', 'error')
    }
  }

  const loadTipos = async () => {
    try {
      const { data, error } = await supabase
        .from('pc_tipos')
        .select('id, nome')
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true })

      if (error) throw error
      setTipos(data || [])
    } catch (err) {
      console.error('Erro ao carregar tipos:', err)
      showToast('Erro ao carregar tipos', 'error')
    }
  }

  const loadGrupos = async (tipoId: string) => {
    try {
      const { data, error } = await supabase
        .from('pc_grupos')
        .select('id, tipo_id, nome')
        .eq('tipo_id', tipoId)
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true })

      if (error) throw error
      setGrupos(data || [])
    } catch (err) {
      console.error('Erro ao carregar grupos:', err)
      showToast('Erro ao carregar grupos', 'error')
    }
  }

  const loadCategorias = async (grupoId: string) => {
    try {
      const { data, error } = await supabase
        .from('pc_categorias')
        .select('id, grupo_id, nome')
        .eq('grupo_id', grupoId)
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true })

      if (error) throw error
      setCategorias(data || [])
    } catch (err) {
      console.error('Erro ao carregar categorias:', err)
      showToast('Erro ao carregar categorias', 'error')
    }
  }

  const loadSubcategorias = async (categoriaId: string) => {
    try {
      const { data, error } = await supabase
        .from('pc_subcategorias')
        .select('id, categoria_id, nome')
        .eq('categoria_id', categoriaId)
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true })

      if (error) throw error
      setSubcategorias(data || [])
    } catch (err) {
      console.error('Erro ao carregar subcategorias:', err)
      showToast('Erro ao carregar subcategorias', 'error')
    }
  }

  const loadLancamentos = async () => {
    setLoading(true)
    try {
      // Carregar tipos se ainda não carregados
      let tiposParaUsar = tipos
      if (tipos.length === 0) {
        const { data: tiposData } = await supabase
          .from('pc_tipos')
          .select('id, nome')
        tiposParaUsar = tiposData || []
        setTipos(tiposParaUsar)
      }

      // Carregar dados auxiliares
      const { data: todosGrupos } = await supabase.from('pc_grupos').select('id, tipo_id, nome')
      const { data: todasCategorias } = await supabase.from('pc_categorias').select('id, grupo_id, nome')
      const { data: todasSubcategorias } = await supabase.from('pc_subcategorias').select('id, categoria_id, nome')
      const { data: todasEmpresas } = await supabase.from('empresas').select('id, nome')
      const { data: todosProjetos } = await supabase.from('projetos').select('id, nome')
      const { data: todasContrapartes } = await supabase.from('contrapartes').select('id, nome')

      // Carregar lançamentos
      const { data: lancamentosData, error: lancamentosError } = await supabase
        .from('lancamentos')
        .select('*')
        .order('data_vencimento', { ascending: true })
        .order('created_at', { ascending: false })

      if (lancamentosError) throw lancamentosError

      // Carregar retenções de todos os lançamentos
      const lancamentosIds = (lancamentosData || []).map((l: any) => l.id)
      const { data: todasRetencoes } = await supabase
        .from('lancamento_retencoes')
        .select('*')
        .in('lancamento_id', lancamentosIds)

      // Fazer joins manuais
      const lancamentosCompletos = (lancamentosData || []).map((lanc: any) => {
        const subcategoria = todasSubcategorias?.find(s => s.id === lanc.subcategoria_id)
        const categoria = todasCategorias?.find(c => c.id === subcategoria?.categoria_id)
        const grupo = todosGrupos?.find(g => g.id === categoria?.grupo_id)
        const tipo = tiposParaUsar.find(t => t.id === grupo?.tipo_id)
        const empresa = todasEmpresas?.find(e => e.id === lanc.empresa_id)
        const projeto = todosProjetos?.find(p => p.id === lanc.projeto_id)
        const contraparte = todasContrapartes?.find(c => c.id === lanc.contraparte_id)
        const retencoesDoLancamento = todasRetencoes?.filter(r => r.lancamento_id === lanc.id) || []

        return {
          ...lanc,
          subcategoria_nome: subcategoria?.nome || 'Sem subcategoria',
          categoria_nome: categoria?.nome || 'Sem categoria',
          grupo_nome: grupo?.nome || 'Sem grupo',
          tipo_plano_nome: tipo?.nome || 'Sem tipo',
          empresa_nome: empresa?.nome || 'Sem empresa',
          projeto_nome: projeto?.nome || '',
          contraparte_nome: contraparte?.nome || '',
          retencoes: retencoesDoLancamento
        }
      })

      setLancamentos(lancamentosCompletos)
    } catch (err) {
      console.error('Erro ao carregar lançamentos:', err)
      showToast('Erro ao carregar lançamentos', 'error')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data: LancamentoForm) => {
    try {
      const lancamentoData = {
        tipo: data.tipo,
        empresa_id: data.empresa_id,
        projeto_id: data.projeto_id || null,
        banco_conta_id: data.banco_conta_id || null,
        contraparte_id: data.contraparte_id || null,
        subcategoria_id: data.subcategoria_id,
        valor_bruto: valorBruto,
        valor_liquido: valorLiquido,
        data_emissao: data.data_emissao || null,
        data_vencimento: data.data_vencimento,
        data_liquidacao: null,
        status: 'ABERTO' as const,
        documento_tipo: data.documento_tipo || null,
        documento_numero: data.documento_numero || null,
        observacoes: data.observacoes || null
      }

      if (editingId) {
        // Atualizar
        const { error: lancError } = await supabase
          .from('lancamentos')
          .update(lancamentoData)
          .eq('id', editingId)

        if (lancError) throw lancError

        // Deletar retenções antigas
        await supabase
          .from('lancamento_retencoes')
          .delete()
          .eq('lancamento_id', editingId)

        // Inserir novas retenções
        if (retencoes.length > 0) {
          const retencoesData = retencoes
            .filter(r => r.valor > 0)
            .map(r => ({
              lancamento_id: editingId,
              imposto: r.imposto,
              valor: r.valor,
              detalhe: r.detalhe || null
            }))

          if (retencoesData.length > 0) {
            const { error: retError } = await supabase
              .from('lancamento_retencoes')
              .insert(retencoesData)

            if (retError) throw retError
          }
        }

        showToast('Lançamento atualizado com sucesso!', 'success')
      } else {
        // Criar
        const { data: novoLancamento, error: lancError } = await supabase
          .from('lancamentos')
          .insert([lancamentoData])
          .select()
          .single()

        if (lancError) throw lancError

        // Inserir retenções
        if (retencoes.length > 0 && novoLancamento) {
          const retencoesData = retencoes
            .filter(r => r.valor > 0)
            .map(r => ({
              lancamento_id: novoLancamento.id,
              imposto: r.imposto,
              valor: r.valor,
              detalhe: r.detalhe || null
            }))

          if (retencoesData.length > 0) {
            const { error: retError } = await supabase
              .from('lancamento_retencoes')
              .insert(retencoesData)

            if (retError) throw retError
          }
        }

        showToast('Lançamento criado com sucesso!', 'success')
      }

      loadLancamentos()
      closeModal()
    } catch (err: any) {
      console.error('Erro ao salvar lançamento:', err)
      showToast(err.message || 'Erro ao salvar lançamento', 'error')
    }
  }

  const handleEdit = async (lancamento: Lancamento) => {
    try {
      setIsEditing(true)
      setEditingId(lancamento.id)

      // Buscar dados para popular cascata
      const { data: subcategoria } = await supabase
        .from('pc_subcategorias')
        .select('id, categoria_id')
        .eq('id', lancamento.subcategoria_id)
        .single()

      const { data: categoria } = await supabase
        .from('pc_categorias')
        .select('id, grupo_id')
        .eq('id', subcategoria?.categoria_id)
        .single()

      const { data: grupo } = await supabase
        .from('pc_grupos')
        .select('id, tipo_id')
        .eq('id', categoria?.grupo_id)
        .single()

      // Carregar listas dependentes
      if (lancamento.empresa_id) {
        await loadProjetos(lancamento.empresa_id)
        await loadBancosContas(lancamento.empresa_id)
      }

      if (grupo?.tipo_id) {
        await loadGrupos(grupo.tipo_id)
      }

      if (categoria?.grupo_id) {
        await loadCategorias(categoria.grupo_id)
      }

      if (subcategoria?.categoria_id) {
        await loadSubcategorias(subcategoria.categoria_id)
      }

      // Setar valores
      setValue('tipo', lancamento.tipo)
      setValue('empresa_id', lancamento.empresa_id)
      setValue('projeto_id', lancamento.projeto_id || '')
      setValue('banco_conta_id', lancamento.banco_conta_id || '')
      setValue('contraparte_id', lancamento.contraparte_id || '')
      setValue('tipo_plano_id', grupo?.tipo_id || '')
      setValue('grupo_id', categoria?.grupo_id || '')
      setValue('categoria_id', subcategoria?.categoria_id || '')
      setValue('subcategoria_id', lancamento.subcategoria_id)
      setValue('valor_bruto', lancamento.valor_bruto)
      setValue('data_emissao', formatDateForInput(lancamento.data_emissao))
      setValue('data_vencimento', formatDateForInput(lancamento.data_vencimento))
      setValue('documento_tipo', lancamento.documento_tipo || '')
      setValue('documento_numero', lancamento.documento_numero || '')
      setValue('observacoes', lancamento.observacoes || '')

      setValorBruto(lancamento.valor_bruto)
      setRetencoes(lancamento.retencoes || [])

      await new Promise(resolve => setTimeout(resolve, 50))
      setShowModal(true)
      setTimeout(() => setIsEditing(false), 100)
    } catch (error) {
      console.error('Erro ao editar lançamento:', error)
      showToast('Erro ao carregar dados para edição', 'error')
      setIsEditing(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      // Deletar retenções primeiro
      await supabase
        .from('lancamento_retencoes')
        .delete()
        .eq('lancamento_id', id)

      // Deletar lançamento
      const { error } = await supabase
        .from('lancamentos')
        .delete()
        .eq('id', id)

      if (error) throw error

      showToast('Lançamento excluído com sucesso!', 'success')
      loadLancamentos()
      setDeleteConfirm({ show: false, id: null })
    } catch (err: any) {
      console.error('Erro ao excluir lançamento:', err)
      showToast('Erro ao excluir lançamento', 'error')
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
      loadLancamentos()
      setLiquidarModal({ show: false, id: null })
      setDataLiquidacao('')
    } catch (err) {
      console.error('Erro ao liquidar lançamento:', err)
      showToast('Erro ao liquidar lançamento', 'error')
    }
  }

  const handleCancelar = async (id: string) => {
    try {
      const { error } = await supabase
        .from('lancamentos')
        .update({ status: 'CANCELADO' })
        .eq('id', id)

      if (error) throw error

      showToast('Lançamento cancelado com sucesso!', 'success')
      loadLancamentos()
    } catch (err) {
      console.error('Erro ao cancelar lançamento:', err)
      showToast('Erro ao cancelar lançamento', 'error')
    }
  }

  const openNewModal = () => {
    setEditingId(null)
    setIsEditing(false)
    setRetencoes([])
    setValorBruto(0)
    setValorLiquido(0)
    reset({
      tipo: 'DESPESA',
      empresa_id: '',
      projeto_id: '',
      banco_conta_id: '',
      contraparte_id: '',
      tipo_plano_id: '',
      grupo_id: '',
      categoria_id: '',
      subcategoria_id: '',
      valor_bruto: 0,
      data_emissao: '',
      data_vencimento: '',
      documento_tipo: '',
      documento_numero: '',
      observacoes: ''
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setIsEditing(false)
    setRetencoes([])
    setValorBruto(0)
    setValorLiquido(0)
    reset()
  }

  const addRetencao = () => {
    setRetencoes([...retencoes, { imposto: 'IRRF', valor: 0, detalhe: '' }])
  }

  const removeRetencao = (index: number) => {
    setRetencoes(retencoes.filter((_, i) => i !== index))
  }

  const updateRetencao = (index: number, field: keyof Retencao, value: any) => {
    const updated = [...retencoes]
    updated[index] = { ...updated[index], [field]: value }
    setRetencoes(updated)
  }

  // Filtrar lançamentos
  const filteredLancamentos = lancamentos.filter(lanc => {
    const matchesSearch = 
      lanc.documento_numero?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lanc.observacoes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lanc.contraparte_nome?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesTipo = !selectedTipoFilter || lanc.tipo === selectedTipoFilter
    const matchesStatus = !selectedStatusFilter || lanc.status === selectedStatusFilter
    const matchesEmpresa = !selectedEmpresaFilter || lanc.empresa_id === selectedEmpresaFilter
    const matchesProjeto = !selectedProjetoFilter || lanc.projeto_id === selectedProjetoFilter
    const matchesContraparte = !selectedContraparteFilter || lanc.contraparte_id === selectedContraparteFilter

    // Filtros de plano de contas
    const matchesTipoPlano = !selectedTipoPlanoFilter || lanc.tipo_plano_nome === tipos.find(t => t.id === selectedTipoPlanoFilter)?.nome
    const matchesGrupo = !selectedGrupoFilter || lanc.grupo_nome === grupos.find(g => g.id === selectedGrupoFilter)?.nome
    const matchesCategoria = !selectedCategoriaFilter || lanc.categoria_nome === categorias.find(c => c.id === selectedCategoriaFilter)?.nome
    const matchesSubcategoria = !selectedSubcategoriaFilter || lanc.subcategoria_nome === subcategorias.find(s => s.id === selectedSubcategoriaFilter)?.nome

    // Filtro de período
    let matchesPeriodo = true
    if (dataVencimentoInicio && dataVencimentoFim) {
      const vencimento = new Date(lanc.data_vencimento)
      const inicio = new Date(dataVencimentoInicio)
      const fim = new Date(dataVencimentoFim)
      matchesPeriodo = vencimento >= inicio && vencimento <= fim
    }

    return matchesSearch && matchesTipo && matchesStatus && matchesEmpresa && 
           matchesProjeto && matchesContraparte && matchesTipoPlano && matchesGrupo && 
           matchesCategoria && matchesSubcategoria && matchesPeriodo
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ABERTO':
        return { bg: '#fef3c7', color: '#92400e', label: 'Aberto' }
      case 'PAGO_RECEBIDO':
        return { bg: '#d1fae5', color: '#065f46', label: 'Pago/Recebido' }
      case 'CANCELADO':
        return { bg: '#fee2e2', color: '#991b1b', label: 'Cancelado' }
      default:
        return { bg: '#f3f4f6', color: '#374151', label: status }
    }
  }

  const getTipoBadge = (tipo: string) => {
    return tipo === 'RECEITA'
      ? { bg: '#d1fae5', color: '#065f46', label: 'Receita' }
      : { bg: '#fee2e2', color: '#991b1b', label: 'Despesa' }
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header Card */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          <h1 style={{
            fontSize: '24px',
            fontWeight: '600',
            color: '#1f2937',
            margin: 0
          }}>
            Lançamentos (AP/AR)
          </h1>
          <button
            onClick={openNewModal}
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
            <Plus size={18} />
            Novo Lançamento
          </button>
        </div>

        {/* Filtros - Linha 1 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          marginBottom: '12px'
        }}>
          {/* Período Início */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Vencimento (De)
            </label>
            <input
              type="date"
              value={dataVencimentoInicio}
              onChange={(e) => setDataVencimentoInicio(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none'
              }}
            />
          </div>

          {/* Período Fim */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Vencimento (Até)
            </label>
            <input
              type="date"
              value={dataVencimentoFim}
              onChange={(e) => setDataVencimentoFim(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none'
              }}
            />
          </div>

          {/* Tipo */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
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
                padding: '8px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todos</option>
              <option value="RECEITA">Receita</option>
              <option value="DESPESA">Despesa</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
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
                padding: '8px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todos</option>
              <option value="ABERTO">Aberto</option>
              <option value="PAGO_RECEBIDO">Pago/Recebido</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </div>

          {/* Empresa */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
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
                padding: '8px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
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

          {/* Projeto */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Projeto
            </label>
            <select
              value={selectedProjetoFilter}
              onChange={(e) => setSelectedProjetoFilter(e.target.value)}
              disabled={!selectedEmpresaFilter}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: selectedEmpresaFilter ? 'pointer' : 'not-allowed',
                opacity: selectedEmpresaFilter ? 1 : 0.6
              }}
            >
              <option value="">Todos</option>
              {projetos.map((proj) => (
                <option key={proj.id} value={proj.id}>{proj.nome}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Filtros - Linha 2: Plano de Contas */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          marginBottom: '12px'
        }}>
          {/* Tipo Plano */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Tipo (Plano)
            </label>
            <select
              value={selectedTipoPlanoFilter}
              onChange={(e) => setSelectedTipoPlanoFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todos</option>
              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>{tipo.nome}</option>
              ))}
            </select>
          </div>

          {/* Grupo */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Grupo
            </label>
            <select
              value={selectedGrupoFilter}
              onChange={(e) => setSelectedGrupoFilter(e.target.value)}
              disabled={!selectedTipoPlanoFilter}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: selectedTipoPlanoFilter ? 'pointer' : 'not-allowed',
                opacity: selectedTipoPlanoFilter ? 1 : 0.6
              }}
            >
              <option value="">Todos</option>
              {grupos.map((grupo) => (
                <option key={grupo.id} value={grupo.id}>{grupo.nome}</option>
              ))}
            </select>
          </div>

          {/* Categoria */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Categoria
            </label>
            <select
              value={selectedCategoriaFilter}
              onChange={(e) => setSelectedCategoriaFilter(e.target.value)}
              disabled={!selectedGrupoFilter}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: selectedGrupoFilter ? 'pointer' : 'not-allowed',
                opacity: selectedGrupoFilter ? 1 : 0.6
              }}
            >
              <option value="">Todas</option>
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.nome}</option>
              ))}
            </select>
          </div>

          {/* Subcategoria */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Subcategoria
            </label>
            <select
              value={selectedSubcategoriaFilter}
              onChange={(e) => setSelectedSubcategoriaFilter(e.target.value)}
              disabled={!selectedCategoriaFilter}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: selectedCategoriaFilter ? 'pointer' : 'not-allowed',
                opacity: selectedCategoriaFilter ? 1 : 0.6
              }}
            >
              <option value="">Todas</option>
              {subcategorias.map((sub) => (
                <option key={sub.id} value={sub.id}>{sub.nome}</option>
              ))}
            </select>
          </div>

          {/* Contraparte */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
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
                padding: '8px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todas</option>
              {contrapartes.map((cp) => (
                <option key={cp.id} value={cp.id}>{cp.nome}</option>
              ))}
            </select>
          </div>

          {/* Busca */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
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
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#9ca3af'
                }}
              />
              <input
                type="text"
                placeholder="Doc, obs, contraparte..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 34px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <div style={{
              display: 'inline-block',
              width: '32px',
              height: '32px',
              border: '3px solid #e5e7eb',
              borderTopColor: '#1555D6',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }} />
            <p style={{ marginTop: '16px', fontSize: '14px' }}>Carregando lançamentos...</p>
          </div>
        ) : filteredLancamentos.length === 0 ? (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <p style={{ fontSize: '14px' }}>Nenhum lançamento encontrado</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '14px'
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    width: '100px'
                  }}>
                    Vencimento
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    width: '90px'
                  }}>
                    Tipo
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase'
                  }}>
                    Empresa
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase'
                  }}>
                    Subcategoria
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase'
                  }}>
                    Contraparte
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    width: '110px'
                  }}>
                    Bruto
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    width: '110px'
                  }}>
                    Retenções
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    width: '110px'
                  }}>
                    Líquido
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'center',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    width: '120px'
                  }}>
                    Status
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'center',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    width: '160px'
                  }}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredLancamentos.map((lanc) => {
                  const statusBadge = getStatusBadge(lanc.status)
                  const tipoBadge = getTipoBadge(lanc.tipo)
                  const totalRetencoes = (lanc.retencoes || []).reduce((sum, r) => sum + r.valor, 0)

                  return (
                    <tr
                      key={lanc.id}
                      style={{
                        borderTop: '1px solid #e5e7eb',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '12px 16px', color: '#374151', fontSize: '13px' }}>
                        {new Date(lanc.data_vencimento).toLocaleDateString('pt-BR')}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          fontSize: '11px',
                          fontWeight: '500',
                          borderRadius: '12px',
                          backgroundColor: tipoBadge.bg,
                          color: tipoBadge.color
                        }}>
                          {tipoBadge.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#374151', fontSize: '13px' }}>
                        {lanc.empresa_nome}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#374151', fontSize: '13px' }}>
                        {lanc.subcategoria_nome}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: '13px' }}>
                        {lanc.contraparte_nome || '-'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#374151', fontWeight: '500', fontSize: '13px' }}>
                        {formatCurrencyBRL(lanc.valor_bruto)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#ef4444', fontSize: '13px' }}>
                        {totalRetencoes > 0 ? `-${formatCurrencyBRL(totalRetencoes)}` : '-'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#059669', fontWeight: '600', fontSize: '13px' }}>
                        {formatCurrencyBRL(lanc.valor_liquido)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          fontSize: '11px',
                          fontWeight: '500',
                          borderRadius: '12px',
                          backgroundColor: statusBadge.bg,
                          color: statusBadge.color
                        }}>
                          {statusBadge.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{
                          display: 'flex',
                          gap: '6px',
                          justifyContent: 'center',
                          flexWrap: 'wrap'
                        }}>
                          <button
                            onClick={() => handleEdit(lanc)}
                            disabled={lanc.status === 'CANCELADO'}
                            style={{
                              padding: '6px',
                              backgroundColor: 'transparent',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              cursor: lanc.status === 'CANCELADO' ? 'not-allowed' : 'pointer',
                              opacity: lanc.status === 'CANCELADO' ? 0.5 : 1,
                              transition: 'all 0.2s',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            onMouseOver={(e) => {
                              if (lanc.status !== 'CANCELADO') {
                                e.currentTarget.style.backgroundColor = '#f3f4f6'
                              }
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                            }}
                            title="Editar"
                          >
                            <Pencil size={14} color="#6b7280" />
                          </button>

                          {lanc.status === 'ABERTO' && (
                            <>
                              <button
                                onClick={() => {
                                  setLiquidarModal({ show: true, id: lanc.id })
                                  setDataLiquidacao(new Date().toISOString().split('T')[0])
                                }}
                                style={{
                                  padding: '6px',
                                  backgroundColor: 'transparent',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.backgroundColor = '#f0fdf4'
                                  e.currentTarget.style.borderColor = '#86efac'
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent'
                                  e.currentTarget.style.borderColor = '#e5e7eb'
                                }}
                                title="Liquidar"
                              >
                                <CheckCircle size={14} color="#10b981" />
                              </button>

                              <button
                                onClick={() => {
                                  if (confirm('Tem certeza que deseja cancelar este lançamento?')) {
                                    handleCancelar(lanc.id)
                                  }
                                }}
                                style={{
                                  padding: '6px',
                                  backgroundColor: 'transparent',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.backgroundColor = '#fef3c7'
                                  e.currentTarget.style.borderColor = '#fcd34d'
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent'
                                  e.currentTarget.style.borderColor = '#e5e7eb'
                                }}
                                title="Cancelar"
                              >
                                <XCircle size={14} color="#eab308" />
                              </button>

                              <button
                                onClick={() => setDeleteConfirm({ show: true, id: lanc.id })}
                                style={{
                                  padding: '6px',
                                  backgroundColor: 'transparent',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.backgroundColor = '#fef2f2'
                                  e.currentTarget.style.borderColor = '#fecaca'
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent'
                                  e.currentTarget.style.borderColor = '#e5e7eb'
                                }}
                                title="Excluir"
                              >
                                <Trash2 size={14} color="#ef4444" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
            zIndex: 1000
          }}
          onClick={() => setDeleteConfirm({ show: false, id: null })}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#1f2937',
              marginTop: 0,
              marginBottom: '12px'
            }}>
              Confirmar exclusão
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              marginBottom: '24px'
            }}>
              Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.
            </p>
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setDeleteConfirm({ show: false, id: null })}
                style={{
                  padding: '10px 20px',
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
                  padding: '10px 20px',
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
            zIndex: 1000
          }}
          onClick={() => {
            setLiquidarModal({ show: false, id: null })
            setDataLiquidacao('')
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#1f2937',
              marginTop: 0,
              marginBottom: '12px'
            }}>
              Liquidar Lançamento
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              marginBottom: '20px'
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
              />
            </div>

            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => {
                  setLiquidarModal({ show: false, id: null })
                  setDataLiquidacao('')
                }}
                style={{
                  padding: '10px 20px',
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
                  padding: '10px 20px',
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

      {/* Create/Edit Modal - CONTINUA NO PRÓXIMO COMENTÁRIO */}
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
            padding: '20px',
            overflowY: 'auto'
          }}
          onClick={closeModal}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '900px',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              margin: '20px 0'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
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

            {/* Body */}
            <div style={{ padding: '18px' }}>
              <form onSubmit={handleSubmit(onSubmit)}>
                {/* Grid 2 colunas */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '14px'
                }}>
                  {/* Tipo */}
                  <div style={{ marginBottom: '0' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
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
                        padding: '10px 12px',
                        border: `1px solid ${errors.tipo ? '#ef4444' : '#e5e7eb'}`,
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="RECEITA">Receita</option>
                      <option value="DESPESA">Despesa</option>
                    </select>
                    {errors.tipo && (
                      <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
                        {errors.tipo.message}
                      </span>
                    )}
                  </div>

                  {/* Empresa */}
                  <div style={{ marginBottom: '0' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
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
                        padding: '10px 12px',
                        border: `1px solid ${errors.empresa_id ? '#ef4444' : '#e5e7eb'}`,
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">Selecione uma empresa</option>
                      {empresas.map((emp) => (
                        <option key={emp.id} value={emp.id}>{emp.nome}</option>
                      ))}
                    </select>
                    {errors.empresa_id && (
                      <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
                        {errors.empresa_id.message}
                      </span>
                    )}
                  </div>

                  {/* Projeto */}
                  <div style={{ marginBottom: '0' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Projeto
                    </label>
                    <select
                      {...register('projeto_id')}
                      disabled={!selectedEmpresaId}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: selectedEmpresaId ? 'pointer' : 'not-allowed',
                        opacity: selectedEmpresaId ? 1 : 0.6
                      }}
                    >
                      <option value="">Nenhum</option>
                      {projetos.map((proj) => (
                        <option key={proj.id} value={proj.id}>{proj.nome}</option>
                      ))}
                    </select>
                  </div>

                  {/* Conta Bancária */}
                  <div style={{ marginBottom: '0' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Conta Bancária
                    </label>
                    <select
                      {...register('banco_conta_id')}
                      disabled={!selectedEmpresaId}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: selectedEmpresaId ? 'pointer' : 'not-allowed',
                        opacity: selectedEmpresaId ? 1 : 0.6
                      }}
                    >
                      <option value="">Nenhuma</option>
                      {bancosContas.map((bc) => (
                        <option key={bc.id} value={bc.id}>
                          {bc.banco_nome} - {bc.numero_conta}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Contraparte */}
                  <div style={{ marginBottom: '0', gridColumn: '1 / -1' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Contraparte
                    </label>
                    <select
                      {...register('contraparte_id')}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">Nenhuma</option>
                      {contrapartes.map((cp) => (
                        <option key={cp.id} value={cp.id}>{cp.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Separador */}
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

                {/* Plano de Contas - Grid 4 colunas */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '14px',
                  marginBottom: '14px'
                }}>
                  {/* Tipo Plano */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Tipo *
                    </label>
                    <select
                      {...register('tipo_plano_id')}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1px solid ${errors.tipo_plano_id ? '#ef4444' : '#e5e7eb'}`,
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">Selecione</option>
                      {tipos.map((tipo) => (
                        <option key={tipo.id} value={tipo.id}>{tipo.nome}</option>
                      ))}
                    </select>
                    {errors.tipo_plano_id && (
                      <span style={{ fontSize: '11px', color: '#ef4444', marginTop: '2px', display: 'block' }}>
                        {errors.tipo_plano_id.message}
                      </span>
                    )}
                  </div>

                  {/* Grupo */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Grupo *
                    </label>
                    <select
                      {...register('grupo_id')}
                      disabled={!selectedTipoPlanoId}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1px solid ${errors.grupo_id ? '#ef4444' : '#e5e7eb'}`,
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: selectedTipoPlanoId ? 'pointer' : 'not-allowed',
                        opacity: selectedTipoPlanoId ? 1 : 0.6
                      }}
                    >
                      <option value="">Selecione</option>
                      {grupos.map((grupo) => (
                        <option key={grupo.id} value={grupo.id}>{grupo.nome}</option>
                      ))}
                    </select>
                    {errors.grupo_id && (
                      <span style={{ fontSize: '11px', color: '#ef4444', marginTop: '2px', display: 'block' }}>
                        {errors.grupo_id.message}
                      </span>
                    )}
                  </div>

                  {/* Categoria */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Categoria *
                    </label>
                    <select
                      {...register('categoria_id')}
                      disabled={!selectedGrupoId}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1px solid ${errors.categoria_id ? '#ef4444' : '#e5e7eb'}`,
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: selectedGrupoId ? 'pointer' : 'not-allowed',
                        opacity: selectedGrupoId ? 1 : 0.6
                      }}
                    >
                      <option value="">Selecione</option>
                      {categorias.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.nome}</option>
                      ))}
                    </select>
                    {errors.categoria_id && (
                      <span style={{ fontSize: '11px', color: '#ef4444', marginTop: '2px', display: 'block' }}>
                        {errors.categoria_id.message}
                      </span>
                    )}
                  </div>

                  {/* Subcategoria */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Subcategoria *
                    </label>
                    <select
                      {...register('subcategoria_id')}
                      disabled={!selectedCategoriaId}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1px solid ${errors.subcategoria_id ? '#ef4444' : '#e5e7eb'}`,
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: selectedCategoriaId ? 'pointer' : 'not-allowed',
                        opacity: selectedCategoriaId ? 1 : 0.6
                      }}
                    >
                      <option value="">Selecione</option>
                      {subcategorias.map((sub) => (
                        <option key={sub.id} value={sub.id}>{sub.nome}</option>
                      ))}
                    </select>
                    {errors.subcategoria_id && (
                      <span style={{ fontSize: '11px', color: '#ef4444', marginTop: '2px', display: 'block' }}>
                        {errors.subcategoria_id.message}
                      </span>
                    )}
                  </div>
                </div>

                {/* Separador Valores */}
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
                    Valores
                  </h3>
                </div>

                {/* Valor Bruto */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Valor Bruto *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={valorBruto}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0
                      setValorBruto(val)
                      setValue('valor_bruto', val)
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                    placeholder="0,00"
                  />
                </div>

                {/* Retenções */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '10px'
                  }}>
                    <label style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151'
                    }}>
                      Retenções
                    </label>
                    <button
                      type="button"
                      onClick={addRetencao}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        backgroundColor: '#f3f4f6',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '500',
                        color: '#374151',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                    >
                      <Plus size={14} />
                      Adicionar
                    </button>
                  </div>

                  {retencoes.length > 0 && (
                    <div style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      overflow: 'hidden'
                    }}>
                      {retencoes.map((ret, index) => (
                        <div
                          key={index}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '140px 1fr 1fr 40px',
                            gap: '10px',
                            padding: '10px',
                            borderBottom: index < retencoes.length - 1 ? '1px solid #e5e7eb' : 'none',
                            alignItems: 'center'
                          }}
                        >
                          <select
                            value={ret.imposto}
                            onChange={(e) => updateRetencao(index, 'imposto', e.target.value)}
                            style={{
                              padding: '8px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              fontSize: '13px',
                              outline: 'none'
                            }}
                          >
                            {IMPOSTOS.map((imp) => (
                              <option key={imp.value} value={imp.value}>{imp.label}</option>
                            ))}
                          </select>

                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={ret.valor || ''}
                            onChange={(e) => updateRetencao(index, 'valor', parseFloat(e.target.value) || 0)}
                            placeholder="Valor"
                            style={{
                              padding: '8px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              fontSize: '13px',
                              outline: 'none'
                            }}
                          />

                          <input
                            type="text"
                            value={ret.detalhe}
                            onChange={(e) => updateRetencao(index, 'detalhe', e.target.value)}
                            placeholder="Detalhe (opcional)"
                            style={{
                              padding: '8px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              fontSize: '13px',
                              outline: 'none'
                            }}
                          />

                          <button
                            type="button"
                            onClick={() => removeRetencao(index)}
                            style={{
                              padding: '6px',
                              backgroundColor: 'transparent',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = '#fef2f2'
                              e.currentTarget.style.borderColor = '#fecaca'
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.style.borderColor = '#e5e7eb'
                            }}
                          >
                            <X size={14} color="#ef4444" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Valor Líquido */}
                <div style={{
                  padding: '12px',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: '8px',
                  marginBottom: '14px'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#065f46'
                    }}>
                      Valor Líquido:
                    </span>
                    <span style={{
                      fontSize: '18px',
                      fontWeight: '700',
                      color: '#059669'
                    }}>
                      {formatCurrencyBRL(valorLiquido)}
                    </span>
                  </div>
                </div>

                {/* Separador Datas */}
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
                    Datas e Documentos
                  </h3>
                </div>

                {/* Datas - Grid 3 colunas */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '14px',
                  marginBottom: '14px'
                }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Data Emissão
                    </label>
                    <input
                      {...register('data_emissao')}
                      type="date"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
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
                      Data Vencimento *
                    </label>
                    <input
                      {...register('data_vencimento')}
                      type="date"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: `1px solid ${errors.data_vencimento ? '#ef4444' : '#e5e7eb'}`,
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    />
                    {errors.data_vencimento && (
                      <span style={{ fontSize: '11px', color: '#ef4444', marginTop: '2px', display: 'block' }}>
                        {errors.data_vencimento.message}
                      </span>
                    )}
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Tipo Documento
                    </label>
                    <input
                      {...register('documento_tipo')}
                      type="text"
                      placeholder="Ex: NF, Boleto, Recibo"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                {/* Documento Número */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Número Documento
                  </label>
                  <input
                    {...register('documento_numero')}
                    type="text"
                    placeholder="Ex: 123456"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Observações */}
                <div style={{ marginBottom: '16px' }}>
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
                    {...register('observacoes')}
                    rows={3}
                    placeholder="Informações adicionais..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      resize: 'vertical',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                {/* Buttons */}
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  paddingTop: '4px'
                }}>
                  <button
                    type="button"
                    onClick={closeModal}
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
                    {editingId ? 'Atualizar' : 'Criar'}
                  </button>
                </div>
              </form>
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