'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Plus, Pencil, Trash2, Search, DollarSign, TrendingUp, TrendingDown, Calendar } from 'lucide-react'
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

interface MovimentoBancario {
  id: string
  org_id: string
  banco_conta_id: string
  tipo_movimento: 'ENTRADA' | 'SAIDA' | 'TRANSFERENCIA_ENVIADA' | 'TRANSFERENCIA_RECEBIDA'
  data_movimento: string
  valor: number
  historico?: string
  documento?: string
  conciliado: boolean
  created_at: string
  bancos_contas: {
    numero_conta: string
    banco_nome: string
    empresas: {
      nome: string
    } | null
  } | null
}

interface BancoConta {
  id: string
  empresa_id: string
  numero_conta: string
  banco_nome: string
  banco_nome_real?: string
  agencia: string
  tipo_conta: string
  empresas: { nome: string } | null
  bancos?: { nome: string } | null
}

interface Empresa {
  id: string
  nome: string
}

const movimentoSchema = z.object({
  empresa_id: z.string().min(1, 'Empresa é obrigatória'),
  banco_conta_id: z.string().min(1, 'Conta bancária é obrigatória'),
  tipo_movimento: z.enum(['ENTRADA', 'SAIDA'], { required_error: 'Tipo de movimento é obrigatório' }),
  data_movimento: z.string().min(1, 'Data do movimento é obrigatória'),
  valor: z.string().min(1, 'Valor é obrigatório'),
  historico: z.string().optional(),
  documento: z.string().optional()
})

type MovimentoForm = z.infer<typeof movimentoSchema>

export default function MovimentosPage() {
  const [movimentos, setMovimentos] = useState<MovimentoBancario[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [bancosContas, setBancosContas] = useState<BancoConta[]>([])
  const [bancosContasModal, setBancosContasModal] = useState<BancoConta[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [empresaFiltro, setEmpresaFiltro] = useState<string>('')
  const [contaFiltro, setContaFiltro] = useState<string>('')
  const [tipoFiltro, setTipoFiltro] = useState<string>('')
  const [dataInicial, setDataInicial] = useState<string>('')
  const [dataFinal, setDataFinal] = useState<string>('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)
  
  // Estados para paginação
  const [currentPage, setCurrentPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const PAGE_SIZE = 100

  const { register, handleSubmit, reset, setValue, formState: { errors }, watch } = useForm<MovimentoForm>({
    resolver: zodResolver(movimentoSchema)
  })

  const empresaModalValue = watch('empresa_id')
  const [valorFormatado, setValorFormatado] = useState('')

  // Função para formatar valor como moeda brasileira
  const formatarMoeda = (valor: string): string => {
    // Remove tudo exceto números
    const apenasNumeros = valor.replace(/\D/g, '')
    
    // Se vazio, retorna vazio
    if (!apenasNumeros) return ''
    
    // Converte para número (divide por 100 para ter centavos)
    const numero = parseFloat(apenasNumeros) / 100
    
    // Formata como moeda brasileira
    return numero.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  // Função para converter valor formatado para número
  const desformatarMoeda = (valorFormatado: string): string => {
    const apenasNumeros = valorFormatado.replace(/\D/g, '')
    if (!apenasNumeros) return '0'
    return (parseFloat(apenasNumeros) / 100).toString()
  }

  // Handler para mudança no campo de valor
  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valorDigitado = e.target.value
    const valorFormatadoNovo = formatarMoeda(valorDigitado)
    setValorFormatado(valorFormatadoNovo)
    setValue('valor', desformatarMoeda(valorDigitado))
  }

  // Toast functions
  const showToast = (message: string, type: ToastType) => {
    const id = toastIdCounter
    setToastIdCounter(prev => prev + 1)
    
    const newToast: Toast = { id, message, type }
    setToasts(prev => [...prev, newToast])
    
    setTimeout(() => {
      dismissToast(id)
    }, 4000)
  }

  const dismissToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const getToastStyles = (type: ToastType) => {
    const styles = {
      success: { borderColor: '#10b981', icon: DollarSign, iconColor: '#10b981' },
      error: { borderColor: '#ef4444', icon: TrendingDown, iconColor: '#ef4444' },
      warning: { borderColor: '#eab308', icon: TrendingUp, iconColor: '#eab308' }
    }
    return styles[type]
  }

  useEffect(() => {
    loadEmpresas()
    loadMovimentos()
  }, [])

  useEffect(() => {
    if (empresaFiltro) {
      loadBancosContas(empresaFiltro)
    } else {
      loadBancosContas()
    }
    // Limpar filtro de conta quando empresa mudar
    setContaFiltro('')
  }, [empresaFiltro])

  // Carregar contas do modal quando empresa for selecionada
  useEffect(() => {
    if (empresaModalValue) {
      loadBancosContasModal(empresaModalValue)
      // Limpar seleção de conta ao mudar empresa
      setValue('banco_conta_id', '')
    } else {
      setBancosContasModal([])
      setValue('banco_conta_id', '')
    }
  }, [empresaModalValue, setValue])

  const loadEmpresas = async () => {
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome')

      if (error) throw error
      setEmpresas(data || [])
    } catch (err) {
      console.error('Erro ao carregar empresas:', err)
      showToast('Erro ao carregar lista de empresas', 'error')
    }
  }

  const loadBancosContas = async (empresaId?: string) => {
    try {
      let query = supabase
        .from('bancos_contas')
        .select('*')
        .eq('ativo', true)
        .order('banco_nome')

      if (empresaId) {
        query = query.eq('empresa_id', empresaId)
      }

      const { data, error } = await query

      if (error) throw error
      
      setBancosContas(data || [])
    } catch (err) {
      console.error('Erro ao carregar contas bancárias:', err)
      showToast('Erro ao carregar contas bancárias', 'error')
    }
  }

  const loadBancosContasModal = async (empresaId: string) => {
    try {
      const { data, error } = await supabase
        .from('bancos_contas')
        .select(`
          *,
          bancos!bancos_contas_banco_id_fkey (
            nome
          )
        `)
        .eq('ativo', true)
        .eq('empresa_id', empresaId)

      if (error) throw error
      
      // Normalizar dados incluindo nome do banco do JOIN
      const normalizedData = (data || []).map(conta => ({
        ...conta,
        banco_nome_real: conta.bancos?.nome || conta.banco_nome,
        bancos: Array.isArray(conta.bancos) 
          ? (conta.bancos.length > 0 ? conta.bancos[0] : null)
          : conta.bancos
      }))
      
      // Ordenar por banco_nome_real, agencia e numero_conta
      normalizedData.sort((a, b) => {
        const nomeA = (a.banco_nome_real || '').toLowerCase()
        const nomeB = (b.banco_nome_real || '').toLowerCase()
        if (nomeA !== nomeB) return nomeA.localeCompare(nomeB)
        
        const agenciaA = (a.agencia || '').toLowerCase()
        const agenciaB = (b.agencia || '').toLowerCase()
        if (agenciaA !== agenciaB) return agenciaA.localeCompare(agenciaB)
        
        const contaA = (a.numero_conta || '').toLowerCase()
        const contaB = (b.numero_conta || '').toLowerCase()
        return contaA.localeCompare(contaB)
      })
      
      setBancosContasModal(normalizedData as any)
    } catch (err) {
      console.error('Erro ao carregar contas bancárias do modal:', err)
      showToast('Erro ao carregar contas bancárias', 'error')
    }
  }

  const loadMovimentos = async (page = 0, append = false) => {
    try {
      if (page === 0) {
        setLoading(true)
        setCurrentPage(0)
      } else {
        setLoadingMore(true)
      }

      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const { data, error, count } = await supabase
        .from('movimentos_bancarios')
        .select(`
          *,
          bancos_contas!movimentos_bancarios_banco_conta_id_fkey (
            numero_conta,
            banco_nome,
            empresas!bancos_contas_empresa_id_fkey (nome)
          )
        `, { count: 'exact' })
        .range(from, to)
        .order('data_movimento', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      
      // Normalizar o retorno para garantir que os JOINs sejam objetos ou null
      const normalizedData = (data || []).map(movimento => ({
        ...movimento,
        bancos_contas: movimento.bancos_contas ? {
          ...movimento.bancos_contas,
          empresas: Array.isArray((movimento.bancos_contas as any).empresas)
            ? (((movimento.bancos_contas as any).empresas.length > 0 
                ? (movimento.bancos_contas as any).empresas[0] 
                : null))
            : (movimento.bancos_contas as any).empresas
        } : null
      }))
      
      if (append) {
        setMovimentos(prev => [...prev, ...normalizedData as MovimentoBancario[]])
      } else {
        setMovimentos(normalizedData as MovimentoBancario[])
      }

      setTotalCount(count || 0)
      setHasMore((count || 0) > (page + 1) * PAGE_SIZE)
      setCurrentPage(page)
    } catch (err) {
      console.error('Erro ao carregar movimentos:', err)
      showToast('Erro ao carregar movimentos bancários', 'error')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const handleLoadMore = () => {
    loadMovimentos(currentPage + 1, true)
  }

  const onSubmit = async (data: MovimentoForm) => {
    try {
      // Verificar última data de fechamento
      const { data: ultimaData, error: checkError } = await supabase
        .rpc('obter_ultima_data_fechamento', { 
          p_banco_conta_id: data.banco_conta_id 
        })

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Erro ao verificar fechamento:', checkError)
        showToast('Erro ao verificar data de fechamento', 'error')
        return
      }

      if (ultimaData && data.data_movimento <= ultimaData) {
        showToast(`Não é permitido lançar movimentos em data igual ou anterior ao último fechamento (${new Date(ultimaData).toLocaleDateString('pt-BR')})`, 'warning')
        return
      }

      // Payload SEM org_id - o DEFAULT vai preencher automaticamente
      const payload = {
        banco_conta_id: data.banco_conta_id,
        tipo_movimento: data.tipo_movimento,
        data_movimento: data.data_movimento,
        valor: parseFloat(data.valor),
        historico: data.historico || null,
        documento: data.documento || null,
        conciliado: false
      }

      if (editingId) {
        const { error } = await supabase
          .from('movimentos_bancarios')
          .update(payload)
          .eq('id', editingId)

        if (error) {
          throw new Error(`Erro ao atualizar movimento: ${error.message}`)
        }
        showToast('Movimento atualizado com sucesso!', 'success')
      } else {
        const { error } = await supabase
          .from('movimentos_bancarios')
          .insert([payload])

        if (error) {
          throw new Error(`Erro ao criar movimento: ${error.message}`)
        }
        showToast('Movimento criado com sucesso!', 'success')
      }

      closeModal()
      loadMovimentos()
    } catch (err: any) {
      console.error('Erro ao salvar movimento:', err)
      const errorMessage = err.message || 'Erro desconhecido ao salvar movimento'
      showToast(errorMessage, 'error')
    }
  }



  const handleEdit = (movimento: MovimentoBancario) => {
    setEditingId(movimento.id)
    
    // Obter empresa_id da conta bancária
    const conta = bancosContas.find(bc => bc.id === movimento.banco_conta_id)
    
    setValue('empresa_id', conta?.empresa_id || '')
    setValue('banco_conta_id', movimento.banco_conta_id)
    setValue('tipo_movimento', movimento.tipo_movimento as 'ENTRADA' | 'SAIDA')
    setValue('data_movimento', movimento.data_movimento)
    setValue('valor', movimento.valor.toString())
    setValue('historico', movimento.historico || '')
    setValue('documento', movimento.documento || '')
    
    // Formatar valor para exibição
    setValorFormatado(movimento.valor.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }))
    
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este movimento?')) return

    try {
      // Buscar o movimento para validar fechamento
      const { data: movimento, error: fetchError } = await supabase
        .from('movimentos_bancarios')
        .select('banco_conta_id, data_movimento')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      // Verificar última data de fechamento
      const { data: ultimaData, error: checkError } = await supabase
        .rpc('obter_ultima_data_fechamento', { 
          p_banco_conta_id: movimento.banco_conta_id 
        })

      if (checkError && checkError.code !== 'PGRST116') throw checkError

      if (ultimaData && movimento.data_movimento <= ultimaData) {
        showToast(`Não é permitido excluir movimentos em data igual ou anterior ao último fechamento (${new Date(ultimaData).toLocaleDateString('pt-BR')})`, 'warning')
        return
      }

      const { error } = await supabase
        .from('movimentos_bancarios')
        .delete()
        .eq('id', id)

      if (error) throw error

      showToast('Movimento excluído com sucesso!', 'success')
      loadMovimentos()
    } catch (err: any) {
      console.error('Erro ao excluir movimento:', err)
      showToast(err?.message || 'Erro ao excluir movimento bancário', 'error')
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setBancosContasModal([])
    setValorFormatado('')
    reset()
  }

  const openNewModal = () => {
    setEditingId(null)
    setBancosContasModal([])
    setValorFormatado('')
    reset({
      empresa_id: '',
      banco_conta_id: '',
      tipo_movimento: 'ENTRADA',
      data_movimento: '',
      valor: '',
      historico: '',
      documento: ''
    })
    setShowModal(true)
  }

  // Cálculos dos KPIs
  const totalEntradas = movimentos
    .filter(m => m.tipo_movimento === 'ENTRADA' || m.tipo_movimento === 'TRANSFERENCIA_RECEBIDA')
    .reduce((sum, m) => sum + m.valor, 0)

  const totalSaidas = movimentos
    .filter(m => m.tipo_movimento === 'SAIDA' || m.tipo_movimento === 'TRANSFERENCIA_ENVIADA')
    .reduce((sum, m) => sum + m.valor, 0)

  const saldoLiquido = totalEntradas - totalSaidas

  // Filtros
  const filteredMovimentos = movimentos.filter(m => {
    // Buscar empresa_id da conta bancária do movimento
    const contaMovimento = bancosContas.find(bc => bc.id === m.banco_conta_id)
    const matchEmpresa = !empresaFiltro || contaMovimento?.empresa_id === empresaFiltro
    const matchConta = !contaFiltro || m.banco_conta_id === contaFiltro
    const matchTipo = !tipoFiltro || m.tipo_movimento === tipoFiltro
    const matchDataInicial = !dataInicial || m.data_movimento >= dataInicial
    const matchDataFinal = !dataFinal || m.data_movimento <= dataFinal
    const matchSearch = !searchTerm || 
      m.bancos_contas?.empresas?.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.bancos_contas?.banco_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.bancos_contas?.numero_conta.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.historico?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.documento?.toLowerCase().includes(searchTerm.toLowerCase())

    return matchEmpresa && matchConta && matchTipo && matchDataInicial && matchDataFinal && matchSearch
  })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR')
  }

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'ENTRADA':
        return { bg: '#dcfce7', color: '#166534', label: 'Entrada' }
      case 'SAIDA':
        return { bg: '#fee2e2', color: '#991b1b', label: 'Saída' }
      case 'TRANSFERENCIA_ENVIADA':
        return { bg: '#fef3c7', color: '#92400e', label: 'Transf. Enviada' }
      case 'TRANSFERENCIA_RECEBIDA':
        return { bg: '#dbeafe', color: '#1e40af', label: 'Transf. Recebida' }
      default:
        return { bg: '#f3f4f6', color: '#374151', label: tipo }
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#1f2937',
            marginBottom: '4px'
          }}>
            Movimentos Bancários
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280' }}>
            Gerencie entradas e saídas das contas bancárias
          </p>
        </div>
        <button
          onClick={openNewModal}
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
          Novo Movimento
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>Total Entradas</p>
              <p style={{ fontSize: '24px', fontWeight: '700', color: '#10b981' }}>
                {formatCurrency(totalEntradas)}
              </p>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              backgroundColor: '#dcfce7',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <TrendingUp style={{ width: '24px', height: '24px', color: '#10b981' }} />
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>Total Saídas</p>
              <p style={{ fontSize: '24px', fontWeight: '700', color: '#ef4444' }}>
                {formatCurrency(totalSaidas)}
              </p>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              backgroundColor: '#fee2e2',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <TrendingDown style={{ width: '24px', height: '24px', color: '#ef4444' }} />
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>Saldo Líquido</p>
              <p style={{
                fontSize: '24px',
                fontWeight: '700',
                color: saldoLiquido >= 0 ? '#1555D6' : '#ef4444'
              }}>
                {formatCurrency(saldoLiquido)}
              </p>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              backgroundColor: saldoLiquido >= 0 ? '#dbeafe' : '#fee2e2',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <DollarSign style={{
                width: '24px',
                height: '24px',
                color: saldoLiquido >= 0 ? '#1555D6' : '#ef4444'
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        marginBottom: '16px'
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
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Empresa
            </label>
            <select
              value={empresaFiltro}
              onChange={(e) => setEmpresaFiltro(e.target.value)}
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
              <option value="">Todas as empresas</option>
              {empresas.map(empresa => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.nome}
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
              Conta Bancária
            </label>
            <select
              value={contaFiltro}
              onChange={(e) => setContaFiltro(e.target.value)}
              disabled={!empresaFiltro}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: empresaFiltro ? 'pointer' : 'not-allowed',
                opacity: empresaFiltro ? 1 : 0.6
              }}
            >
              <option value="">{empresaFiltro ? 'Todas as contas' : 'Selecione uma conta'}</option>
              {bancosContas
                .filter(bc => !empresaFiltro || bc.empresa_id === empresaFiltro)
                .map(bc => (
                  <option key={bc.id} value={bc.id}>
                    {bc.banco_nome || 'Banco'} - Ag: {bc.agencia} - Conta: {bc.numero_conta}
                  </option>
                ))
              }
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
              Tipo
            </label>
            <select
              value={tipoFiltro}
              onChange={(e) => setTipoFiltro(e.target.value)}
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
              <option value="">Todos os tipos</option>
              <option value="ENTRADA">Entrada</option>
              <option value="SAIDA">Saída</option>
              <option value="TRANSFERENCIA_ENVIADA">Transf. Enviada</option>
              <option value="TRANSFERENCIA_RECEBIDA">Transf. Recebida</option>
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
              Data Inicial
            </label>
            <input
              type="date"
              value={dataInicial}
              onChange={(e) => setDataInicial(e.target.value)}
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
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Data Final
            </label>
            <input
              type="date"
              value={dataFinal}
              onChange={(e) => setDataFinal(e.target.value)}
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

        <div style={{ position: 'relative' }}>
          <Search style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '20px',
            height: '20px',
            color: '#9ca3af'
          }} />
          <input
            type="text"
            placeholder="Buscar por empresa, banco, conta, histórico ou documento..."
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
      </div>

      {/* Tabela */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{
            padding: '60px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '4px solid #f3f4f6',
              borderTop: '4px solid #1555D6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
          </div>
        ) : filteredMovimentos.length === 0 ? (
          <div style={{
            padding: '60px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <p style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>
              Nenhum movimento encontrado
            </p>
            <p style={{ fontSize: '14px' }}>
              {movimentos.length === 0 
                ? 'Comece criando seu primeiro movimento bancário'
                : 'Tente ajustar os filtros de busca'}
            </p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    <th style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Data
                    </th>
                    <th style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Empresa / Conta
                    </th>
                    <th style={{
                      padding: '12px 16px',
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
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Valor
                    </th>
                    <th style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Histórico
                    </th>
                    <th style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Documento
                    </th>
                    <th style={{
                      padding: '12px 16px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      width: '120px'
                    }}>
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovimentos.map((movimento, index) => {
                    const tipoStyle = getTipoColor(movimento.tipo_movimento)
                    return (
                      <tr
                        key={movimento.id}
                        style={{
                          borderTop: '1px solid #f3f4f6',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                      >
                        <td style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Calendar style={{ width: '16px', height: '16px', color: '#9ca3af' }} />
                            <span style={{ fontSize: '14px', color: '#374151' }}>
                              {formatDate(movimento.data_movimento)}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div>
                            <p style={{
                              fontSize: '14px',
                              fontWeight: '500',
                              color: '#1f2937',
                              marginBottom: '2px'
                            }}>
                              {movimento.bancos_contas?.empresas?.nome || 'N/A'}
                            </p>
                            <p style={{ fontSize: '13px', color: '#6b7280' }}>
                              {movimento.bancos_contas?.banco_nome} • {movimento.bancos_contas?.numero_conta}
                            </p>
                          </div>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 12px',
                            backgroundColor: tipoStyle.bg,
                            color: tipoStyle.color,
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '500'
                          }}>
                            {tipoStyle.label}
                          </span>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'right' }}>
                          <span style={{
                            fontSize: '14px',
                            fontWeight: '600',
                            color: movimento.tipo_movimento === 'ENTRADA' || movimento.tipo_movimento === 'TRANSFERENCIA_RECEBIDA'
                              ? '#10b981'
                              : '#ef4444'
                          }}>
                            {formatCurrency(movimento.valor)}
                          </span>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span style={{
                            fontSize: '14px',
                            color: '#374151',
                            display: 'block',
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {movimento.historico || '-'}
                          </span>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span style={{ fontSize: '14px', color: '#374151' }}>
                            {movimento.documento || '-'}
                          </span>
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div style={{
                            display: 'flex',
                            gap: '8px',
                            justifyContent: 'center'
                          }}>
                            <button
                              onClick={() => handleEdit(movimento)}
                              style={{
                                padding: '8px',
                                backgroundColor: '#f3f4f6',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s'
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#1555D6'
                                const icon = e.currentTarget.querySelector('svg')
                                if (icon) (icon as SVGElement).style.color = 'white'
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = '#f3f4f6'
                                const icon = e.currentTarget.querySelector('svg')
                                if (icon) (icon as SVGElement).style.color = '#6b7280'
                              }}
                            >
                              <Pencil style={{ width: '16px', height: '16px', color: '#6b7280' }} />
                            </button>
                            <button
                              onClick={() => handleDelete(movimento.id)}
                              style={{
                                padding: '8px',
                                backgroundColor: '#f3f4f6',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s'
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#ef4444'
                                const icon = e.currentTarget.querySelector('svg')
                                if (icon) (icon as SVGElement).style.color = 'white'
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = '#f3f4f6'
                                const icon = e.currentTarget.querySelector('svg')
                                if (icon) (icon as SVGElement).style.color = '#6b7280'
                              }}
                            >
                              <Trash2 style={{ width: '16px', height: '16px', color: '#6b7280' }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {hasMore && (
              <div style={{
                borderTop: '1px solid #e5e7eb',
                padding: '20px',
                textAlign: 'center'
              }}>
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: loadingMore ? '#e5e7eb' : '#1555D6',
                    color: loadingMore ? '#9ca3af' : 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: loadingMore ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseOver={(e) => {
                    if (!loadingMore) {
                      e.currentTarget.style.backgroundColor = '#1044b5'
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!loadingMore) {
                      e.currentTarget.style.backgroundColor = '#1555D6'
                    }
                  }}
                >
                  {loadingMore ? (
                    <>
                      <div style={{
                        width: '16px',
                        height: '16px',
                        border: '2px solid #9ca3af',
                        borderTop: '2px solid transparent',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }} />
                      Carregando...
                    </>
                  ) : (
                    `Carregar Mais (${movimentos.length} de ${totalCount})`
                  )}
                </button>
              </div>
            )}

            {/* Info de registros carregados */}
            {!hasMore && movimentos.length > 0 && (
              <div style={{
                borderTop: '1px solid #e5e7eb',
                padding: '16px',
                textAlign: 'center',
                color: '#6b7280',
                fontSize: '14px'
              }}>
                Todos os {totalCount} registros foram carregados
              </div>
            )}
          </>
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
            padding: '20px'
          }}
          onClick={closeModal}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '24px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <h2 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#1f2937'
              }}>
                {editingId ? 'Editar Movimento' : 'Novo Movimento'}
              </h2>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} style={{ padding: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Linha: Empresa e Conta Bancária */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* Select de Empresa */}
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
                        padding: '10px 12px',
                        border: errors.empresa_id ? '1px solid #ef4444' : '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: 'pointer',
                        backgroundColor: 'white'
                      }}
                    >
                      <option value="">Selecione uma empresa</option>
                      {empresas.map(empresa => (
                        <option key={empresa.id} value={empresa.id}>
                          {empresa.nome}
                        </option>
                      ))}
                    </select>
                    {errors.empresa_id && (
                      <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
                        {errors.empresa_id.message}
                      </span>
                    )}
                  </div>

                  {/* Select de Conta Bancária */}
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
                      disabled={!empresaModalValue || bancosContasModal.length === 0}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: errors.banco_conta_id ? '1px solid #ef4444' : '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: (!empresaModalValue || bancosContasModal.length === 0) ? 'not-allowed' : 'pointer',
                        backgroundColor: (!empresaModalValue || bancosContasModal.length === 0) ? '#f9fafb' : 'white',
                        color: (!empresaModalValue || bancosContasModal.length === 0) ? '#9ca3af' : '#374151'
                      }}
                    >
                      <option value="">
                        {!empresaModalValue 
                          ? 'Selecione uma empresa primeiro' 
                          : bancosContasModal.length === 0 
                            ? 'Nenhuma conta disponível' 
                            : 'Selecione uma conta'}
                      </option>
                      {bancosContasModal.map(conta => (
                        <option key={conta.id} value={conta.id}>
                          {conta.banco_nome_real || conta.banco_nome || 'Banco'} - Ag: {conta.agencia} - Conta: {conta.numero_conta}{conta.tipo_conta ? ` (${conta.tipo_conta})` : ''}
                        </option>
                      ))}
                    </select>
                    {errors.banco_conta_id && (
                      <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
                        {errors.banco_conta_id.message}
                      </span>
                    )}
                  </div>
                </div>

                {/* Tipo, Data e Valor */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
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
                      {...register('tipo_movimento')}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: errors.tipo_movimento ? '1px solid #ef4444' : '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="ENTRADA">Entrada</option>
                      <option value="SAIDA">Saída</option>
                    </select>
                    {errors.tipo_movimento && (
                      <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
                        {errors.tipo_movimento.message}
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
                      Data *
                    </label>
                    <input
                      type="date"
                      {...register('data_movimento')}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: errors.data_movimento ? '1px solid #ef4444' : '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'all 0.2s'
                      }}
                      onFocus={(e) => {
                        if (!errors.data_movimento) {
                          e.currentTarget.style.borderColor = '#1555D6'
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = errors.data_movimento ? '#ef4444' : '#e5e7eb'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    />
                    {errors.data_movimento && (
                      <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
                        {errors.data_movimento.message}
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
                      Valor *
                    </label>
                    <input
                      type="text"
                      value={valorFormatado}
                      onChange={handleValorChange}
                      placeholder="0,00"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: errors.valor ? '1px solid #ef4444' : '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'all 0.2s'
                      }}
                      onFocus={(e) => {
                        if (!errors.valor) {
                          e.currentTarget.style.borderColor = '#1555D6'
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = errors.valor ? '#ef4444' : '#e5e7eb'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    />
                    <input type="hidden" {...register('valor')} />
                    {errors.valor && (
                      <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
                        {errors.valor.message}
                      </span>
                    )}
                  </div>
                </div>

                {/* Histórico */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Histórico
                  </label>
                  <textarea
                    {...register('historico')}
                    rows={3}
                    placeholder="Descrição do movimento..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s',
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

                {/* Documento */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Documento
                  </label>
                  <input
                    {...register('documento')}
                    placeholder="Número do documento"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
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

                {/* Botões */}
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end',
                  marginTop: '8px'
                }}>
                  <button
                    type="button"
                    onClick={closeModal}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: '10px 20px',
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
                    {editingId ? 'Atualizar' : 'Salvar'}
                  </button>
                </div>
              </div>
            </form>
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
                minWidth: '400px',
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