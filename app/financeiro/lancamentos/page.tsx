'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, Search, CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react'
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
  banco?: string
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

// Schema de validação
const lancamentoSchema = z.object({
  tipo: z.enum(['Entrada', 'Saida'], { required_error: 'Tipo é obrigatório' }),
  empresa_id: z.string().min(1, 'Empresa é obrigatória'),
  projeto_id: z.string().min(1, 'Projeto é obrigatório'),
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
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTipoFilter, setSelectedTipoFilter] = useState<string>('')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('')
  const [selectedEmpresaFilter, setSelectedEmpresaFilter] = useState<string>('')
  const [selectedProjetoFilter, setSelectedProjetoFilter] = useState<string>('')
  const [selectedContraparteFilter, setSelectedContraparteFilter] = useState<string>('')
  const [dataVencimentoInicio, setDataVencimentoInicio] = useState('')
  const [dataVencimentoFim, setDataVencimentoFim] = useState('')

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
        return { borderColor: '#eab308', icon: AlertTriangle, iconColor: '#eab308' }
      case 'error':
        return { borderColor: '#ef4444', icon: XCircle, iconColor: '#ef4444' }
    }
  }

  useEffect(() => {
    loadEmpresas()
    loadContrapartes()
    loadLancamentos()
  }, [])

  useEffect(() => {
    if (selectedEmpresaFilter) {
      loadProjetosFilter(selectedEmpresaFilter)
      setSelectedProjetoFilter('')
    } else {
      setSelectedProjetoFilter('')
    }
  }, [selectedEmpresaFilter])

  useEffect(() => {
    if (selectedEmpresaId) {
      loadProjetos(selectedEmpresaId)
      loadBancosContas(selectedEmpresaId)
      
      // Não limpa os campos se estiver editando
      if (!editingId) {
        setValue('projeto_id', '')
        setValue('subprojeto_id', '')
        setValue('banco_conta_id', '')
        setSubprojetos([])
      }
    }
  }, [selectedEmpresaId, editingId])

  useEffect(() => {
    if (selectedProjetoId) {
      loadSubprojetos(selectedProjetoId)
      
      // Não limpa o campo se estiver editando
      if (!editingId) {
        setValue('subprojeto_id', '')
      }
    } else {
      if (!editingId) {
        setSubprojetos([])
        setValue('subprojeto_id', '')
      }
    }
  }, [selectedProjetoId, editingId])

  useEffect(() => {
    const totalRetencoes = retencoes.reduce((sum, ret) => sum + (ret.valor || 0), 0)
    const liquido = Math.max(0, valorBruto - totalRetencoes)
    setValorLiquido(liquido)
  }, [valorBruto, retencoes])

  const loadEmpresas = async () => {
    try {
      console.log('🔍 [FILTRO] Carregando empresas...')
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome')
        // REMOVIDO: .eq('ativo', true) - causava erro mesmo com todas empresas ativas
        .order('nome', { ascending: true })

      if (error) {
        console.error('❌ [FILTRO] Erro na query:', error)
        throw error
      }
      
      console.log('✅ [FILTRO] Empresas carregadas:', data?.length)
      console.log('📋 [FILTRO] Primeiras 3:', data?.slice(0, 3))
      setEmpresas(data || [])
    } catch (err) {
      console.error('❌ [FILTRO] Erro ao carregar empresas:', err)
      setEmpresas([])
      // showToast('Erro ao carregar empresas', 'error') // REMOVIDO - não incomodar usuário
    }
  }

  const loadProjetos = async (empresaId: string) => {
    try {
      console.log('🔍 Carregando projetos para empresa:', empresaId)
      const { data, error } = await supabase
        .from('projetos')
        .select('id, empresa_id, nome, projeto_pai_id')
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .is('projeto_pai_id', null)
        .order('nome', { ascending: true })

      if (error) throw error
      setProjetos(data || [])
      console.log('✅ Projetos carregados:', data?.length)
    } catch (err) {
      console.error('❌ Erro ao carregar projetos:', err)
      showToast('Erro ao carregar projetos', 'error')
    }
  }

  const loadSubprojetos = async (projetoId: string) => {
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, empresa_id, nome, projeto_pai_id')
        .eq('projeto_pai_id', projetoId)
        .order('nome', { ascending: true })

      if (error) throw error
      setSubprojetos(data || [])
    } catch (err) {
      console.error('Erro ao carregar subprojetos:', err)
      showToast('Erro ao carregar subprojetos', 'error')
    }
  }

  const loadProjetosFilter = async (empresaId: string) => {
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, empresa_id, nome, projeto_pai_id')
        .eq('empresa_id', empresaId)
        .order('nome', { ascending: true })

      if (error) throw error
      setProjetos(data || [])
    } catch (err) {
      console.error('Erro ao carregar projetos:', err)
    }
  }

  const loadBancosContas = async (empresaId: string) => {
    try {
      const { data, error } = await supabase
        .from('bancos_contas')
        .select(`
          id, 
          empresa_id, 
          banco_nome, 
          agencia, 
          numero_conta, 
          tipo_conta,
          bancos(nome)
        `)
        .eq('empresa_id', empresaId)
        .eq('tipo_conta', 'CC')
        .eq('ativo', true)

      if (error) throw error
      
      // Mapear para incluir o nome do banco do relacionamento
      const contasComBanco = (data || []).map((conta: any) => ({
        ...conta,
        nome_banco: conta.bancos?.nome || conta.banco_nome || ''
      }))
      
      // Remover duplicados baseado no ID
      const uniqueContas = contasComBanco.filter((conta, index, self) =>
        index === self.findIndex((t) => t.id === conta.id)
      )
      
      setBancosContas(uniqueContas)
    } catch (err) {
      console.error('Erro ao carregar contas bancárias:', err)
      showToast('Erro ao carregar contas bancárias', 'error')
    }
  }

  const loadContrapartes = async () => {
    try {
      const { data, error } = await supabase
        .from('contrapartes')
        .select('id, nome, apelido')
        .eq('ativo', true)
        .order('nome', { ascending: true })

      if (error) throw error
      setContrapartes(data || [])
    } catch (err) {
      console.error('Erro ao carregar contrapartes:', err)
      showToast('Erro ao carregar contrapartes', 'error')
    }
  }

  const loadLancamentos = async () => {
    setLoading(true)
    try {
      const { data: todasEmpresas } = await supabase.from('empresas').select('id, nome')
      const { data: todosProjetos } = await supabase.from('projetos').select('id, nome')
      const { data: todasContrapartes } = await supabase.from('contrapartes').select('id, nome, apelido')
      const { data: todasContas } = await supabase
        .from('plano_contas_fluxo')
        .select('id, codigo_conta, categoria, subcategoria, tipo_fluxo, sentido')

      const { data: lancamentosData, error: lancamentosError } = await supabase
        .from('lancamentos')
        .select('*')
        .order('data_vencimento', { ascending: true })
        .order('created_at', { ascending: false })

      if (lancamentosError) throw lancamentosError

      const lancamentosIds = (lancamentosData || []).map((l: any) => l.id)
      const { data: todasRetencoes } = await supabase
        .from('lancamento_retencoes')
        .select('*')
        .in('lancamento_id', lancamentosIds)

      const lancamentosCompletos = (lancamentosData || []).map((lanc: any) => {
        const empresa = todasEmpresas?.find(e => e.id === lanc.empresa_id)
        const projeto = todosProjetos?.find(p => p.id === lanc.projeto_id)
        const subprojeto = todosProjetos?.find(p => p.id === lanc.subprojeto_id)
        const contraparte = todasContrapartes?.find(c => c.id === lanc.contraparte_id)
        const planoConta = todasContas?.find(pc => pc.id === lanc.plano_conta_id)
        const retencoesDoLancamento = todasRetencoes?.filter(r => r.lancamento_id === lanc.id) || []

        return {
          ...lanc,
          empresa_nome: empresa?.nome || 'Sem empresa',
          projeto_nome: projeto?.nome || '',
          subprojeto_nome: subprojeto?.nome || '',
          contraparte_nome: contraparte?.nome || '',
          plano_conta: planoConta || null,
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
      if (retencoes.length > 0) {
        const impostos = retencoes.map(r => r.imposto)
        const impostosUnicos = new Set(impostos)
        
        if (impostos.length !== impostosUnicos.size) {
          const duplicados: string[] = []
          impostos.forEach((imposto, index) => {
            if (impostos.indexOf(imposto) !== index && !duplicados.includes(imposto)) {
              duplicados.push(imposto)
            }
          })
          
          const nomesDuplicados = duplicados.join(', ')
          showToastWithConfirmation(
            `Não é permitido adicionar retenções duplicadas. Imposto(s) duplicado(s): ${nomesDuplicados}`,
            'warning'
          )
          return
        }
      }

      const lancamentoData = {
        tipo: data.tipo,
        empresa_id: data.empresa_id,
        projeto_id: data.projeto_id || null,
        subprojeto_id: data.subprojeto_id || null,
        banco_conta_id: data.banco_conta_id || null,
        contraparte_id: data.contraparte_id || null,
        plano_conta_id: data.plano_conta_id,
        valor_bruto: valorBruto,
        valor_liquido: valorLiquido,
        data_emissao: data.data_emissao || null,
        data_vencimento: data.data_vencimento,
        data_previsao_pagamento: data.data_previsao_pagamento || null,
        data_liquidacao: null,
        status: 'ABERTO' as const,
        documento_tipo: data.documento_tipo || null,
        documento_numero: data.documento_numero || null,
        observacoes: data.observacoes || null
      }

      if (editingId) {
        const { error: lancError } = await supabase
          .from('lancamentos')
          .update(lancamentoData)
          .eq('id', editingId)

        if (lancError) throw lancError

        await supabase
          .from('lancamento_retencoes')
          .delete()
          .eq('lancamento_id', editingId)

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
        const { data: novoLancamento, error: lancError } = await supabase
          .from('lancamentos')
          .insert([lancamentoData])
          .select()
          .single()

        if (lancError) throw lancError

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

  const onSubmitError = (errors: any) => {
    const errorMessages: string[] = []
    
    Object.keys(errors).forEach((key) => {
      if (errors[key]?.message) {
        errorMessages.push(errors[key].message)
      }
    })

    if (errorMessages.length > 0) {
      const message = errorMessages.join(' • ')
      showToastWithConfirmation(message, 'warning')
    }
  }

  const handleEdit = async (lancamento: Lancamento) => {
    try {
      console.log('🔍 [EDIT] Iniciando edição:', {
        id: lancamento.id,
        empresa_id: lancamento.empresa_id,
        projeto_id: lancamento.projeto_id,
        subprojeto_id: lancamento.subprojeto_id
      })
      
      setEditingId(lancamento.id)
      
      // Carrega os dados relacionados ANTES de popular o form
      if (lancamento.empresa_id) {
        // Aguarda o carregamento dos projetos e contas
        await Promise.all([
          loadProjetos(lancamento.empresa_id),
          loadBancosContas(lancamento.empresa_id)
        ])
        console.log('✅ [EDIT] Projetos e contas carregados')
        
        // Se tem projeto, carrega subprojetos
        if (lancamento.projeto_id) {
          await loadSubprojetos(lancamento.projeto_id)
          console.log('✅ [EDIT] Subprojetos carregados')
        }
        
        // Aguarda 500ms para garantir que os estados foram atualizados
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // Agora popula TODO o formulário de uma vez usando reset
      console.log('🔍 [EDIT] Populando formulário com reset()')
      reset({
        tipo: lancamento.tipo,
        empresa_id: lancamento.empresa_id,
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
      console.log('✅ [EDIT] Formulário populado')

      setValorBruto(lancamento.valor_bruto)
      // Converte para centavos arredondando antes de formatar
      const valorEmCentavos = Math.round(lancamento.valor_bruto * 100)
      setValorBrutoFormatado(formatCurrencyInput(valorEmCentavos.toString()))
      
      const retencoesFormatadas = (lancamento.retencoes || []).map(ret => {
        const retValorEmCentavos = Math.round(ret.valor * 100)
        return {
          ...ret,
          valorFormatado: formatCurrencyInput(retValorEmCentavos.toString())
        }
      })
      setRetencoes(retencoesFormatadas)

      setShowModal(true)
    } catch (error) {
      console.error('Erro ao editar lançamento:', error)
      showToast('Erro ao carregar dados para edição', 'error')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await supabase
        .from('lancamento_retencoes')
        .delete()
        .eq('lancamento_id', id)

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
    setRetencoes([])
    setValorBruto(0)
    setValorBrutoFormatado('')
    setValorLiquido(0)
    setSubprojetos([])
    setProjetos([])
    setBancosContas([])

    reset({
      tipo: 'Saida',
      empresa_id: '',
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
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setRetencoes([])
    setValorBruto(0)
    setValorBrutoFormatado('')
    setValorLiquido(0)
    setSubprojetos([])
    setProjetos([])
    setBancosContas([])
    reset()
  }

  const addRetencao = () => {
    setRetencoes([...retencoes, { imposto: 'IRRF', valor: 0, valorFormatado: '', detalhe: null }])
  }

  const removeRetencao = (index: number) => {
    setRetencoes(retencoes.filter((_, i) => i !== index))
  }

  const updateRetencao = (index: number, field: keyof Retencao, value: any) => {
    const updated = [...retencoes]
    updated[index] = { ...updated[index], [field]: value }
    setRetencoes(updated)
  }

  const updateRetencaoValor = (index: number, valorFormatado: string) => {
    const updated = [...retencoes]
    updated[index] = {
      ...updated[index],
      valorFormatado,
      valor: parseCurrencyInput(valorFormatado)
    }
    setRetencoes(updated)
  }

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

    let matchesPeriodo = true
    if (dataVencimentoInicio && dataVencimentoFim) {
      const vencimento = new Date(lanc.data_vencimento)
      const inicio = new Date(dataVencimentoInicio)
      const fim = new Date(dataVencimentoFim)
      matchesPeriodo = vencimento >= inicio && vencimento <= fim
    }

    return matchesSearch && matchesTipo && matchesStatus && matchesEmpresa && 
           matchesProjeto && matchesContraparte && matchesPeriodo
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
    return tipo === 'Entrada'
      ? { bg: '#d1fae5', color: '#065f46', label: 'Recebimento' }
      : { bg: '#fee2e2', color: '#991b1b', label: 'Pagamento' }
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1600px', margin: '0 auto' }}>
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

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          marginBottom: '12px'
        }}>
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
              <option value="Entrada">Recebimento</option>
              <option value="Saida">Pagamento</option>
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
            overflowY: 'auto',
            backdropFilter: 'blur(4px)'
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

            <div style={{ padding: '18px' }}>
              <form onSubmit={handleSubmit(onSubmit, onSubmitError)}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr 120px 1fr 1fr',
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
                      Projeto *
                    </label>
                    <select
                      key={`projeto-${editingId || 'new'}-${selectedEmpresaId}`}
                      {...register('projeto_id')}
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
                          {bc.nome_banco || 'Banco'} - Ag: {bc.agencia} - Conta: {bc.numero_conta}
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
                      Contraparte *
                    </label>
                    <select
                      key={`contraparte-${editingId || 'new'}`}
                      {...register('contraparte_id')}
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
                      {contrapartes.map((cp) => (
                        <option key={cp.id} value={cp.id}>{cp.nome}</option>
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

                <div style={{ marginBottom: '14px' }}>
                  <PlanoContaPicker
                     key={`plano-conta-${editingId || 'new'}-${watch('plano_conta_id')}`}
                     value={watch('plano_conta_id')}
                     onChange={(id) => setValue('plano_conta_id', id)}
                     sentidoFilter={selectedTipoLancamento}
                     error={errors.plano_conta_id?.message}
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
                          textAlign: 'right'
                        }}
                        placeholder="0,00"
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
                      placeholder="NF, Boleto..."
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
                      placeholder="123456"
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
                            type="text"
                            value={ret.valorFormatado || ''}
                            onChange={(e) => {
                              const formatted = formatCurrencyInput(e.target.value)
                              updateRetencaoValor(index, formatted)
                            }}
                            placeholder="0,00"
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
                            value={ret.detalhe || ''}
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
                    Código Financeiro
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
                        {lanc.plano_conta ? (
                          <div>
                            <div style={{ fontFamily: 'monospace', fontWeight: '600', marginBottom: '4px' }}>
                              {lanc.plano_conta.codigo_conta}
                            </div>
                            <div style={{ fontSize: '11px', color: '#6b7280' }}>
                              Plano Contábil: 1.00.000.001 - Descrição: Em Desenvolvimento
                            </div>
                          </div>
                        ) : (
                          '-'
                        )}
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
              <AlertTriangle style={{ width: '28px', height: '28px', color: '#dc2626' }} />
            </div>

            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '12px',
              textAlign: 'center'
            }}>
              Excluir Lançamento
            </h2>

            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              textAlign: 'center',
              marginBottom: '8px',
              lineHeight: '1.5'
            }}>
              Tem certeza que deseja excluir este lançamento?
            </p>

            <p style={{
              fontSize: '13px',
              color: '#ef4444',
              textAlign: 'center',
              marginBottom: '24px',
              fontWeight: '500'
            }}>
              Esta ação não pode ser desfeita.
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
                  backgroundColor: '#dc2626',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#b91c1c'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
              >
                Sim, Excluir
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