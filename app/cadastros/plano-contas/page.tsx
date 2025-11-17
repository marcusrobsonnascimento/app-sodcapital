'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Plus, Pencil, Trash2, Search, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

// Types
type Sentido = 'Entrada' | 'Saida'

interface PlanoContaFluxo {
  id: string
  codigo_conta: string
  sentido: Sentido
  classificacao: string
  tipo_fluxo: string
  grupo: string
  categoria: string
  subcategoria: string
  cod_cont: string | null
  conta_cont: string | null
  ativo: boolean
  created_at?: string
  updated_at?: string
}

// Toast notification system
type ToastType = 'success' | 'warning' | 'error'

interface Toast {
  id: number
  message: string
  type: ToastType
}

const formatTitleCase = (text: string): string => {
  if (!text) return ''
  
  return text
    .toLowerCase()
    .split(' ')
    .map(word => {
      if (word.length === 0) return word
      if (word.length > 2) {
        return word.charAt(0).toUpperCase() + word.slice(1)
      }
      return word.toLowerCase()
    })
    .join(' ')
}

const planoContaSchema = z.object({
  codigo_conta: z.string().min(1, 'Código é obrigatório'),
  sentido: z.enum(['Entrada', 'Saida'], { required_error: 'Sentido é obrigatório' }),
  classificacao: z.string()
    .min(1, 'Classificação é obrigatória')
    .max(100, 'Classificação deve ter no máximo 100 caracteres')
    .transform(val => formatTitleCase(val)),
  tipo_fluxo: z.string().min(1, 'Tipo de fluxo é obrigatório'),
  grupo: z.string()
    .min(1, 'Grupo é obrigatório')
    .max(100, 'Grupo deve ter no máximo 100 caracteres')
    .transform(val => formatTitleCase(val)),
  categoria: z.string()
    .min(1, 'Categoria é obrigatória')
    .max(100, 'Categoria deve ter no máximo 100 caracteres')
    .transform(val => formatTitleCase(val)),
  subcategoria: z.string()
    .min(1, 'Subcategoria é obrigatória')
    .max(100, 'Subcategoria deve ter no máximo 100 caracteres')
    .transform(val => formatTitleCase(val)),
  cod_cont: z.string().optional(),
  conta_cont: z.string()
    .max(60, 'Conta contábil deve ter no máximo 60 caracteres')
    .optional()
    .transform(val => val ? formatTitleCase(val) : val),
  ativo: z.boolean().default(true)
})

type PlanoContaFormData = z.infer<typeof planoContaSchema>

export default function PlanoContasPage() {
  const [contas, setContas] = useState<PlanoContaFluxo[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [warningMessage, setWarningMessage] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deletingConta, setDeletingConta] = useState<PlanoContaFluxo | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [tipoFluxoFilter, setTipoFluxoFilter] = useState<string>('TODOS')
  const [classificacaoFilter, setClassificacaoFilter] = useState<string>('TODOS')
  const [sentidoFilter, setSentidoFilter] = useState<Sentido | 'TODOS'>('TODOS')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)
  const [gruposDisponiveis, setGruposDisponiveis] = useState<string[]>([])
  const [categoriasDisponiveis, setCategoriasDisponiveis] = useState<string[]>([])
  const [tiposFluxoDisponiveis, setTiposFluxoDisponiveis] = useState<string[]>([])
  const [classificacoesDisponiveis, setClassificacoesDisponiveis] = useState<string[]>([])
  const [checkingDependencies, setCheckingDependencies] = useState(false)

  const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<PlanoContaFormData>({
    resolver: zodResolver(planoContaSchema),
    defaultValues: {
      ativo: true
    }
  })

  const showToast = (message: string, type: ToastType) => {
    const id = toastIdCounter
    setToastIdCounter(prev => prev + 1)
    
    const newToast: Toast = { id, message, type }
    setToasts(prev => [...prev, newToast])
    
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }, 4000)
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
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(searchTerm)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchTerm])

  useEffect(() => {
    loadContas()
    loadAutocompleteData()
  }, [])

  const loadContas = async () => {
    try {
      const { data, error } = await supabase
        .from('plano_contas_fluxo')
        .select('*')
        .order('codigo_conta', { ascending: true })

      if (error) throw error
      setContas(data || [])
    } catch (err) {
      console.error('Erro ao carregar plano de contas:', err)
      showToast('Erro ao carregar plano de contas', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadAutocompleteData = async () => {
    try {
      const { data: gruposData, error: gruposError } = await supabase
        .from('plano_contas_fluxo')
        .select('grupo')
        .not('grupo', 'is', null)
        .order('grupo')

      if (!gruposError && gruposData) {
        const grupos = Array.from(new Set(gruposData.map(item => item.grupo).filter(Boolean))) as string[]
        setGruposDisponiveis(grupos)
      }

      const { data: categoriasData, error: categoriasError } = await supabase
        .from('plano_contas_fluxo')
        .select('categoria')
        .order('categoria')

      if (!categoriasError && categoriasData) {
        const categorias = Array.from(new Set(categoriasData.map(item => item.categoria).filter(Boolean))) as string[]
        setCategoriasDisponiveis(categorias)
      }

      const { data: tiposData, error: tiposError } = await supabase
        .from('plano_contas_fluxo')
        .select('tipo_fluxo')
        .order('tipo_fluxo')

      if (!tiposError && tiposData) {
        const tipos = Array.from(new Set(tiposData.map(item => item.tipo_fluxo).filter(Boolean))) as string[]
        setTiposFluxoDisponiveis(tipos)
      }

      const { data: classifData, error: classifError } = await supabase
        .from('plano_contas_fluxo')
        .select('classificacao')
        .order('classificacao')

      if (!classifError && classifData) {
        const classif = Array.from(new Set(classifData.map(item => item.classificacao).filter(Boolean))) as string[]
        setClassificacoesDisponiveis(classif)
      }
    } catch (error) {
      console.error('Erro ao carregar dados de autocomplete:', error)
    }
  }

  const verificarVinculos = async (planoContaId: string): Promise<{ temVinculo: boolean; mensagem: string }> => {
    try {
      const { data: lancamentos, error: errorLancamentos } = await supabase
        .from('lancamentos')
        .select('id')
        .eq('plano_conta_id', planoContaId)
        .limit(1)

      if (errorLancamentos) {
        console.error('Erro ao verificar lançamentos:', errorLancamentos)
        throw errorLancamentos
      }

      if (lancamentos && lancamentos.length > 0) {
        return {
          temVinculo: true,
          mensagem: 'Esta conta não pode ser excluída porque possui lançamentos vinculados.'
        }
      }

      const contaParaExcluir = contas.find(c => c.id === planoContaId)
      if (contaParaExcluir) {
        const { data: contasBancarias, error: errorContas } = await supabase
          .from('bancos_contas')
          .select('id')
          .eq('conta_contabil_codigo', contaParaExcluir.codigo_conta)
          .limit(1)

        if (errorContas) {
          console.error('Erro ao verificar contas bancárias:', errorContas)
          throw errorContas
        }

        if (contasBancarias && contasBancarias.length > 0) {
          return {
            temVinculo: true,
            mensagem: 'Esta conta não pode ser excluída porque possui contas bancárias vinculadas.'
          }
        }
      }

      return { temVinculo: false, mensagem: '' }
    } catch (error) {
      console.error('Erro ao verificar vínculos:', error)
      throw error
    }
  }

  const verificarCombinacaoDuplicada = async (
    tipo_fluxo: string,
    grupo: string,
    categoria: string,
    subcategoria: string,
    sentido: Sentido,
    idAtual?: string
  ): Promise<boolean> => {
    try {
      let query = supabase
        .from('plano_contas_fluxo')
        .select('id')
        .eq('tipo_fluxo', tipo_fluxo)
        .eq('grupo', grupo)
        .eq('categoria', categoria)
        .eq('subcategoria', subcategoria)
        .eq('sentido', sentido)
        .limit(1)

      if (idAtual) {
        query = query.neq('id', idAtual)
      }

      const { data, error } = await query

      if (error) throw error
      return data && data.length > 0
    } catch (error) {
      console.error('Erro ao verificar combinação duplicada:', error)
      throw error
    }
  }

  const verificarCodigoDuplicado = async (
    codigo_conta: string,
    idAtual?: string
  ): Promise<boolean> => {
    try {
      let query = supabase
        .from('plano_contas_fluxo')
        .select('id')
        .eq('codigo_conta', codigo_conta)
        .limit(1)

      if (idAtual) {
        query = query.neq('id', idAtual)
      }

      const { data, error } = await query

      if (error) throw error
      return data && data.length > 0
    } catch (error) {
      console.error('Erro ao verificar código duplicado:', error)
      throw error
    }
  }

  const handleFormatInput = (fieldName: keyof PlanoContaFormData, value: string) => {
    const formatted = formatTitleCase(value)
    setValue(fieldName, formatted as any)
  }

  const onSubmit = async (data: PlanoContaFormData) => {
    try {
      // Verificar se o código da conta já existe
      const codigoDuplicado = await verificarCodigoDuplicado(
        data.codigo_conta,
        editingId || undefined
      )
      if (codigoDuplicado) {
        setWarningMessage(`Já existe uma conta cadastrada com esse código - Sentido: ${data.sentido} - Tipo de Fluxo: ${data.tipo_fluxo} - Grupo: ${data.grupo} - Categoria: ${data.categoria} - Subcategoria: ${data.subcategoria}. Por favor, verifique os dados informados.`)
        setShowWarningModal(true)
        return
      }

      // Verificar se a combinação já existe
      const combinacaoDuplicada = await verificarCombinacaoDuplicada(
        data.tipo_fluxo,
        data.grupo,
        data.categoria,
        data.subcategoria,
        data.sentido,
        editingId || undefined
      )
      if (combinacaoDuplicada) {
        setWarningMessage(`Já existe uma conta cadastrada com essa combinação - Sentido: ${data.sentido} - Tipo de Fluxo: ${data.tipo_fluxo} - Grupo: ${data.grupo} - Categoria: ${data.categoria} - Subcategoria: ${data.subcategoria}. Por favor, verifique os dados informados.`)
        setShowWarningModal(true)
        return
      }

      const payload = {
        codigo_conta: data.codigo_conta,
        sentido: data.sentido,
        classificacao: data.classificacao,
        tipo_fluxo: data.tipo_fluxo,
        grupo: data.grupo,
        categoria: data.categoria,
        subcategoria: data.subcategoria,
        cod_cont: data.cod_cont || null,
        conta_cont: data.conta_cont || null,
        ativo: data.ativo,
        updated_at: new Date().toISOString()
      }

      if (editingId) {
        const { error } = await supabase
          .from('plano_contas_fluxo')
          .update(payload)
          .eq('id', editingId)

        if (error) {
          console.error('Erro detalhado ao atualizar:', error)
          
          if (error.code === '23505') {
            showToast('Combinação já existe', 'warning')
            return
          }
          
          throw new Error(`Erro ao atualizar conta: ${error.message}`)
        }
        showToast('Conta atualizada com sucesso!', 'success')
      } else {
        const { error } = await supabase
          .from('plano_contas_fluxo')
          .insert([payload])

        if (error) {
          console.error('Erro detalhado ao criar:', error)
          
          if (error.code === '23505') {
            showToast('Combinação já existe', 'warning')
            return
          }
          
          throw new Error(`Erro ao criar conta: ${error.message}`)
        }
        showToast('Conta criada com sucesso!', 'success')
      }

      loadContas()
      loadAutocompleteData()
      closeModal()
    } catch (err: any) {
      console.error('Erro ao salvar conta:', err)
      const errorMessage = err.message || 'Erro desconhecido ao salvar conta'
      showToast(errorMessage, 'error')
    }
  }

  const onSubmitError = (errors: any) => {
    if (errors.codigo_conta) {
      showToast(errors.codigo_conta.message, 'warning')
    } else if (errors.sentido) {
      showToast(errors.sentido.message, 'warning')
    } else if (errors.classificacao) {
      showToast(errors.classificacao.message, 'warning')
    } else if (errors.tipo_fluxo) {
      showToast(errors.tipo_fluxo.message, 'warning')
    } else if (errors.grupo) {
      showToast(errors.grupo.message, 'warning')
    } else if (errors.categoria) {
      showToast(errors.categoria.message, 'warning')
    } else if (errors.subcategoria) {
      showToast(errors.subcategoria.message, 'warning')
    }
  }

  const handleEdit = (conta: PlanoContaFluxo) => {
    setEditingId(conta.id)
    reset({
      codigo_conta: conta.codigo_conta,
      sentido: conta.sentido,
      classificacao: conta.classificacao,
      tipo_fluxo: conta.tipo_fluxo,
      grupo: conta.grupo,
      categoria: conta.categoria,
      subcategoria: conta.subcategoria,
      cod_cont: conta.cod_cont || '',
      conta_cont: conta.conta_cont || '',
      ativo: conta.ativo
    })
    setShowModal(true)
  }

  const openDeleteModal = async (conta: PlanoContaFluxo) => {
    setCheckingDependencies(true)
    
    try {
      const { temVinculo, mensagem } = await verificarVinculos(conta.id)
      
      if (temVinculo) {
        showToast(mensagem, 'warning')
        setCheckingDependencies(false)
        return
      }

      setDeleteId(conta.id)
      setDeletingConta(conta)
      setShowDeleteModal(true)
    } catch (error) {
      showToast('Erro ao verificar dependências da conta', 'error')
    } finally {
      setCheckingDependencies(false)
    }
  }

  const closeDeleteModal = () => {
    setShowDeleteModal(false)
    setDeleteId(null)
    setDeletingConta(null)
  }

  const confirmDelete = async () => {
    if (!deleteId) return

    try {
      const { error } = await supabase
        .from('plano_contas_fluxo')
        .delete()
        .eq('id', deleteId)

      if (error) throw error
      showToast('Conta excluída com sucesso!', 'success')
      loadContas()
      loadAutocompleteData()
      closeDeleteModal()
    } catch (err) {
      console.error('Erro ao excluir conta:', err)
      showToast('Erro ao excluir conta', 'error')
      closeDeleteModal()
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    reset({
      codigo_conta: '',
      sentido: 'Entrada',
      classificacao: '',
      tipo_fluxo: tiposFluxoDisponiveis[0] || '',
      grupo: '',
      categoria: '',
      subcategoria: '',
      cod_cont: '',
      conta_cont: '',
      ativo: true
    })
  }

  const filteredContas = contas.filter(c => {
    const matchesSearch = 
      c.codigo_conta.includes(debouncedSearch) ||
      c.categoria.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      c.subcategoria.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      c.grupo.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      c.classificacao.toLowerCase().includes(debouncedSearch.toLowerCase())
    
    const matchesTipoFluxo = tipoFluxoFilter === 'TODOS' || c.tipo_fluxo === tipoFluxoFilter
    const matchesClassificacao = classificacaoFilter === 'TODOS' || c.classificacao === classificacaoFilter
    const matchesSentido = sentidoFilter === 'TODOS' || c.sentido === sentidoFilter

    return matchesSearch && matchesTipoFluxo && matchesClassificacao && matchesSentido
  })

  const getSentidoBadgeColor = (sentido: Sentido) => {
    if (sentido === 'Entrada') return { bg: '#dcfce7', color: '#16a34a' }
    if (sentido === 'Saida') return { bg: '#fee2e2', color: '#dc2626' }
    return { bg: '#f3f4f6', color: '#6b7280' }
  }

  const getTipoFluxoBadgeColor = (tipo: string) => {
    const cores: Record<string, { bg: string; color: string }> = {
      'Negócios': { bg: '#dbeafe', color: '#1e40af' },
      'Corporativo': { bg: '#e0e7ff', color: '#4338ca' },
      'default': { bg: '#f3f4f6', color: '#6b7280' }
    }
    
    return cores[tipo] || cores['default']
  }

  const getClassificacaoBadgeColor = (classif: string) => {
    const cores: Record<string, { bg: string; color: string }> = {
      'Operacionais': { bg: '#d1fae5', color: '#065f46' },
      'Não Operacionais': { bg: '#fed7aa', color: '#c2410c' },
      'Investimentos (Não Operacional)': { bg: '#a7f3d0', color: '#064e3b' },
      'Financiamento': { bg: '#e0e7ff', color: '#4338ca' },
      'Investimento (Operacional)': { bg: '#7dd3fc', color: '#0c4a6e' },
      'Impostos': { bg: '#cbd5e1', color: '#334155' },
      'SG&A': { bg: '#fce7f3', color: '#be185d' },
      'Outras Operacionais': { bg: '#93c5fd', color: '#1e3a8a' },
      'Outras Não Operacionais': { bg: '#fb923c', color: '#7c2d12' },
      'default': { bg: '#f3f4f6', color: '#6b7280' }
    }
    
    return cores[classif] || cores['default']
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: '400px',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '3px solid #e5e7eb',
          borderTop: '3px solid #1555D6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <div style={{ fontSize: '14px', color: '#6b7280' }}>
          Carregando plano de contas...
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        maxWidth: '100%'
      }}>
        <div style={{
          padding: '32px',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '24px'
          }}>
            <div>
              <h1 style={{
                fontSize: '28px',
                fontWeight: '700',
                color: '#111827',
                marginBottom: '4px'
              }}>
                Plano de Contas (Fluxo)
              </h1>
              <p style={{
                fontSize: '14px',
                color: '#6b7280'
              }}>
                Gerencie o plano de contas unificado para fluxo de caixa
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
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
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1044b5'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1555D6'}
            >
              <Plus style={{ width: '20px', height: '20px' }} />
              Nova Conta
            </button>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
              <Search style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '20px',
                height: '20px',
                color: '#9ca3af'
              }} />
              <input
                type="text"
                placeholder="Buscar por código, grupo, categoria, subcategoria ou classificação..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px 12px 48px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'all 0.2s'
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

            <select
              value={tipoFluxoFilter}
              onChange={(e) => setTipoFluxoFilter(e.target.value)}
              style={{
                padding: '12px 16px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: 'pointer',
                backgroundColor: 'white'
              }}
            >
              <option value="TODOS">Todos os Tipos</option>
              {tiposFluxoDisponiveis.map((tipo) => (
                <option key={tipo} value={tipo}>{tipo}</option>
              ))}
            </select>

            <select
              value={classificacaoFilter}
              onChange={(e) => setClassificacaoFilter(e.target.value)}
              style={{
                padding: '12px 16px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: 'pointer',
                backgroundColor: 'white'
              }}
            >
              <option value="TODOS">Todas as Classificações</option>
              {classificacoesDisponiveis.map((classif) => (
                <option key={classif} value={classif}>{classif}</option>
              ))}
            </select>

            <select
              value={sentidoFilter}
              onChange={(e) => setSentidoFilter(e.target.value as Sentido | 'TODOS')}
              style={{
                padding: '12px 16px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: 'pointer',
                backgroundColor: 'white'
              }}
            >
              <option value="TODOS">Todos os Sentidos</option>
              <option value="Entrada">Entrada</option>
              <option value="Saida">Saída</option>
            </select>
          </div>
        </div>

        <div style={{ width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  width: '10%'
                }}>
                  Código
                </th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  width: '7%'
                }}>
                  Sentido
                </th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  width: '12%'
                }}>
                  Classificação
                </th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  width: '9%'
                }}>
                  Tipo Fluxo
                </th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  width: '15%'
                }}>
                  Grupo
                </th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  width: '15%'
                }}>
                  Categoria
                </th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  width: '20%'
                }}>
                  Subcategoria
                </th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  width: '7%'
                }}>
                  Status
                </th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'right',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  width: '5%'
                }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredContas.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{
                    padding: '48px 24px',
                    textAlign: 'center',
                    color: '#9ca3af',
                    fontSize: '14px'
                  }}>
                    <div>
                      <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
                      <div style={{ fontWeight: '600', marginBottom: '8px' }}>Nenhuma conta encontrada</div>
                      <div style={{ fontSize: '13px' }}>Clique em "Nova Conta" para começar</div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredContas.map((conta) => {
                  const sentidoColors = getSentidoBadgeColor(conta.sentido)
                  const tipoColors = getTipoFluxoBadgeColor(conta.tipo_fluxo)
                  const classifColors = getClassificacaoBadgeColor(conta.classificacao)
                  
                  return (
                    <tr
                      key={conta.id}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{
                        padding: '14px 16px',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#111827',
                        fontFamily: 'monospace'
                      }}>
                        {conta.codigo_conta}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          borderRadius: '12px',
                          backgroundColor: sentidoColors.bg,
                          color: sentidoColors.color
                        }}>
                          {conta.sentido}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: '500',
                          borderRadius: '12px',
                          backgroundColor: classifColors.bg,
                          color: classifColors.color
                        }}>
                          {conta.classificacao}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: '500',
                          borderRadius: '12px',
                          backgroundColor: tipoColors.bg,
                          color: tipoColors.color
                        }}>
                          {conta.tipo_fluxo}
                        </span>
                      </td>
                      <td style={{
                        padding: '14px 16px',
                        fontSize: '13px',
                        color: '#374151',
                        fontWeight: '500'
                      }}>
                        {conta.grupo}
                      </td>
                      <td style={{
                        padding: '14px 16px',
                        fontSize: '13px',
                        color: '#111827'
                      }}>
                        {conta.categoria}
                      </td>
                      <td style={{
                        padding: '14px 16px',
                        fontSize: '13px',
                        color: '#6b7280'
                      }}>
                        {conta.subcategoria}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: '500',
                          borderRadius: '12px',
                          backgroundColor: conta.ativo ? '#dcfce7' : '#f3f4f6',
                          color: conta.ativo ? '#16a34a' : '#6b7280'
                        }}>
                          {conta.ativo ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '8px'
                        }}>
                          <button
                            onClick={() => handleEdit(conta)}
                            style={{
                              padding: '8px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'background-color 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <Pencil style={{ width: '16px', height: '16px', color: '#6b7280' }} />
                          </button>
                          <button
                            onClick={() => openDeleteModal(conta)}
                            disabled={checkingDependencies}
                            style={{
                              padding: '8px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: checkingDependencies ? 'wait' : 'pointer',
                              transition: 'background-color 0.2s',
                              opacity: checkingDependencies ? 0.5 : 1
                            }}
                            onMouseOver={(e) => {
                              if (!checkingDependencies) {
                                e.currentTarget.style.backgroundColor = '#fee2e2'
                              }
                            }}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <Trash2 style={{ width: '16px', height: '16px', color: '#dc2626' }} />
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

      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            backdropFilter: 'blur(4px)'
          }}
          onClick={closeModal}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              padding: '32px',
              width: '100%',
              maxWidth: '700px',
              margin: '16px',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '24px'
            }}>
              {editingId ? 'Editar Conta' : 'Nova Conta'}
            </h2>

            <form onSubmit={handleSubmit(onSubmit, onSubmitError)} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Código da Conta *
                  </label>
                  <input
                    {...register('codigo_conta')}
                    onChange={(e) => {
                      const value = e.target.value
                      setValue('codigo_conta', value)
                      
                      // Auto-ajustar sentido baseado no primeiro caractere
                      if (value.length > 0) {
                        const firstChar = value.charAt(0)
                        if (firstChar === '1') {
                          setValue('sentido', 'Entrada')
                        } else if (firstChar === '2') {
                          setValue('sentido', 'Saida')
                        }
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s',
                      fontFamily: 'monospace'
                    }}
                    placeholder="1.01.01.01.001"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                      
                      // Validar padrão do código quando perder o foco
                      const value = e.target.value.trim()
                      if (value) {
                        const pattern = /^[12]\.\d{2}\.\d{2}\.\d{2}\.\d{3}$/
                        if (!pattern.test(value)) {
                          showToast('Código inválido! Use o formato: 1.XX.XX.XX.XXX ou 2.XX.XX.XX.XXX', 'warning')
                          e.currentTarget.style.borderColor = '#eab308'
                        } else {
                          const firstChar = value.charAt(0)
                          if (firstChar !== '1' && firstChar !== '2') {
                            showToast('Código deve começar com 1 (Entrada) ou 2 (Saída)', 'warning')
                            e.currentTarget.style.borderColor = '#eab308'
                          }
                        }
                      }
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Sentido *
                  </label>
                  <select
                    {...register('sentido')}
                    disabled
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      cursor: 'not-allowed',
                      backgroundColor: '#f9fafb',
                      color: '#6b7280'
                    }}
                  >
                    <option value="Entrada">Entrada</option>
                    <option value="Saida">Saída</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Classificação *
                  </label>
                  <input
                    {...register('classificacao')}
                    list="classificacoes-list"
                    onChange={(e) => handleFormatInput('classificacao', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    placeholder="Ex: Operacionais"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                  <datalist id="classificacoes-list">
                    {classificacoesDisponiveis.map(classif => (
                      <option key={classif} value={classif} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Tipo de Fluxo *
                  </label>
                  <select
                    {...register('tipo_fluxo')}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      cursor: 'pointer',
                      backgroundColor: 'white'
                    }}
                  >
                    <option value="">Selecione o tipo de fluxo</option>
                    {tiposFluxoDisponiveis.length === 0 ? (
                      <option disabled>Carregando...</option>
                    ) : (
                      tiposFluxoDisponiveis.map((tipo) => (
                        <option key={tipo} value={tipo}>{tipo}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Grupo *
                </label>
                <input
                  {...register('grupo')}
                  list="grupos-list"
                  onChange={(e) => handleFormatInput('grupo', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  placeholder="Ex: Imobiliário"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#1555D6'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                <datalist id="grupos-list">
                  {gruposDisponiveis.map(grupo => (
                    <option key={grupo} value={grupo} />
                  ))}
                </datalist>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Categoria *
                </label>
                <input
                  {...register('categoria')}
                  list="categorias-list"
                  onChange={(e) => handleFormatInput('categoria', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  placeholder="Ex: Compra e Venda"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#1555D6'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                <datalist id="categorias-list">
                  {categoriasDisponiveis.map(categoria => (
                    <option key={categoria} value={categoria} />
                  ))}
                </datalist>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Subcategoria *
                </label>
                <input
                  {...register('subcategoria')}
                  onChange={(e) => handleFormatInput('subcategoria', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  placeholder="Ex: Venda À Vista"
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Cód. Contábil
                  </label>
                  <input
                    {...register('cod_cont')}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s',
                      fontFamily: 'monospace'
                    }}
                    placeholder="1.00.000.001"
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
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Descrição Contábil
                  </label>
                  <input
                    {...register('conta_cont')}
                    onChange={(e) => handleFormatInput('conta_cont', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    placeholder="Ex: Receita de Vendas"
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

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  {...register('ativo')}
                  id="ativo"
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                    accentColor: '#1555D6'
                  }}
                />
                <label
                  htmlFor="ativo"
                  style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Conta ativa
                </label>
              </div>

              <div style={{
                display: 'flex',
                gap: '12px',
                paddingTop: '8px'
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
      )}

      {showWarningModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            backdropFilter: 'blur(4px)'
          }}
          onClick={() => setShowWarningModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              padding: '0',
              width: '100%',
              maxWidth: '500px',
              margin: '16px',
              animation: 'scaleIn 0.2s ease-out',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header amarelo */}
            <div style={{
              backgroundColor: '#fbbf24',
              padding: '20px 32px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <AlertTriangle style={{ width: '28px', height: '28px', color: '#78350f', flexShrink: 0 }} />
              <h2 style={{
                fontSize: '20px',
                fontWeight: '700',
                color: '#78350f',
                margin: 0
              }}>
                AVISO
              </h2>
            </div>

            {/* Conteúdo */}
            <div style={{ padding: '32px' }}>
              <p style={{
                fontSize: '14px',
                color: '#374151',
                lineHeight: '1.6',
                margin: 0,
                marginBottom: '28px'
              }}>
                {warningMessage}
              </p>

              <button
                onClick={() => setShowWarningModal(false)}
                style={{
                  width: '100%',
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
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            backdropFilter: 'blur(4px)'
          }}
          onClick={closeDeleteModal}
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
              Excluir Conta
            </h2>

            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              textAlign: 'center',
              marginBottom: '8px',
              lineHeight: '1.5'
            }}>
              Tem certeza que deseja excluir a conta
            </p>
            
            {deletingConta && (
              <>
                <p style={{
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#111827',
                  textAlign: 'center',
                  marginBottom: '4px',
                  fontFamily: 'monospace'
                }}>
                  {deletingConta.codigo_conta}
                </p>
                <p style={{
                  fontSize: '14px',
                  color: '#6b7280',
                  textAlign: 'center',
                  marginBottom: '24px'
                }}>
                  {deletingConta.categoria} - {deletingConta.subcategoria}?
                </p>
              </>
            )}

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
                onClick={closeDeleteModal}
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
                onClick={confirmDelete}
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