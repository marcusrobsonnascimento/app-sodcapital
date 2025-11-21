'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Plus, Pencil, Trash2, Search, RefreshCw, ArrowRightLeft, Building2, Calendar, TrendingDown, TrendingUp, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

// Toast notification system
type ToastType = 'success' | 'warning' | 'error'

interface Toast {
  id: number
  message: string
  type: ToastType
  requiresConfirmation?: boolean
}

interface Transferencia {
  id: string
  org_id: string
  conta_origem_id: string
  conta_destino_id: string
  data_transferencia: string
  valor: number
  historico?: string
  documento?: string
  created_at: string
  conta_origem: {
    numero_conta: string
    banco_nome: string
    agencia: string
    tipo_conta: string
    empresas: { nome: string } | null
    bancos: { nome: string; codigo: string } | null
  } | null
  conta_destino: {
    numero_conta: string
    banco_nome: string
    agencia: string
    tipo_conta: string
    empresas: { nome: string } | null
    bancos: { nome: string; codigo: string } | null
  } | null
}

interface BancoConta {
  id: string
  empresa_id: string
  numero_conta: string
  banco_nome: string
  agencia: string
  tipo_conta: string
  empresas: { nome: string } | null
  bancos: { nome: string; codigo: string } | null
}

interface Empresa {
  id: string
  nome: string
}

const transferenciaSchema = z.object({
  empresa_origem_id: z.string().optional(),
  conta_origem_id: z.string().optional(),
  empresa_destino_id: z.string().optional(),
  conta_destino_id: z.string().optional(),
  data_transferencia: z.string().optional(),
  valor: z.string().optional(),
  historico: z.string().optional(),
  documento: z.string().optional()
})

type TransferenciaForm = z.infer<typeof transferenciaSchema>

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

const formatDate = (dateString: string): string => {
  const [year, month, day] = dateString.split('T')[0].split('-')
  return `${day}/${month}/${year}`
}

export default function TransferenciasPage() {
  const [transferencias, setTransferencias] = useState<Transferencia[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [bancosContas, setBancosContas] = useState<BancoConta[]>([])
  const [contasOrigem, setContasOrigem] = useState<BancoConta[]>([])
  const [contasDestino, setContasDestino] = useState<BancoConta[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [empresaOrigemFiltro, setEmpresaOrigemFiltro] = useState<string>('')
  const [empresaDestinoFiltro, setEmpresaDestinoFiltro] = useState<string>('')
  const [dataInicial, setDataInicial] = useState<string>('')
  const [dataFinal, setDataFinal] = useState<string>('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({
    show: false,
    id: null
  })
  const [validationModal, setValidationModal] = useState<{ show: boolean; message: string }>({
    show: false,
    message: ''
  })
  
  const [currentPage, setCurrentPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const PAGE_SIZE = 100
  const [valorFormatado, setValorFormatado] = useState('')

  const { register, handleSubmit, reset, setValue, formState: { errors }, watch } = useForm<TransferenciaForm>({
    resolver: zodResolver(transferenciaSchema)
  })

  const empresaOrigemValue = watch('empresa_origem_id')
  const empresaDestinoValue = watch('empresa_destino_id')

  // Função para formatar valor em BRL
  const formatarValorBRL = (valor: string): string => {
    // Remove tudo que não é número
    const apenasNumeros = valor.replace(/\D/g, '')
    
    // Se vazio, retorna vazio
    if (!apenasNumeros) return ''
    
    // Converte para número e divide por 100 (para considerar centavos)
    const numero = parseInt(apenasNumeros) / 100
    
    // Formata no padrão brasileiro
    return numero.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  // Função para desformatar (converter de BRL para número)
  const desformatarValorBRL = (valorFormatado: string): string => {
    // Remove pontos de milhares e substitui vírgula por ponto
    return valorFormatado.replace(/\./g, '').replace(',', '.')
  }

  // Handler para mudança no campo valor
  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valorDigitado = e.target.value
    const valorFormatadoNovo = formatarValorBRL(valorDigitado)
    setValorFormatado(valorFormatadoNovo)
    
    // Atualiza o valor no formulário (desformatado)
    const valorDesformatado = desformatarValorBRL(valorFormatadoNovo)
    setValue('valor', valorDesformatado)
  }

  // Toast functions
  const addToast = (message: string, type: ToastType, requiresConfirmation: boolean = false) => {
    const id = toastIdCounter
    setToastIdCounter(prev => prev + 1)
    setToasts(prev => [...prev, { id, message, type, requiresConfirmation }])
    
    if (!requiresConfirmation) {
      setTimeout(() => dismissToast(id), 4000)
    }
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

  useEffect(() => {
    fetchEmpresas()
    fetchBancosContas()
    fetchTransferencias()
  }, [])

  useEffect(() => {
    if (empresaOrigemValue) {
      const contas = bancosContas
        .filter(c => c.empresa_id === empresaOrigemValue)
        .sort((a, b) => {
          // Ordena por banco_nome, depois por tipo_conta, depois por numero_conta
          const bancoCompare = (a.banco_nome || '').localeCompare(b.banco_nome || '')
          if (bancoCompare !== 0) return bancoCompare
          
          const tipoCompare = (a.tipo_conta || '').localeCompare(b.tipo_conta || '')
          if (tipoCompare !== 0) return tipoCompare
          
          return (a.numero_conta || '').localeCompare(b.numero_conta || '')
        })
      setContasOrigem(contas)
    } else {
      setContasOrigem([])
    }
  }, [empresaOrigemValue, bancosContas])

  useEffect(() => {
    if (empresaDestinoValue) {
      const contas = bancosContas
        .filter(c => c.empresa_id === empresaDestinoValue)
        .sort((a, b) => {
          // Ordena por banco_nome, depois por tipo_conta, depois por numero_conta
          const bancoCompare = (a.banco_nome || '').localeCompare(b.banco_nome || '')
          if (bancoCompare !== 0) return bancoCompare
          
          const tipoCompare = (a.tipo_conta || '').localeCompare(b.tipo_conta || '')
          if (tipoCompare !== 0) return tipoCompare
          
          return (a.numero_conta || '').localeCompare(b.numero_conta || '')
        })
      setContasDestino(contas)
    } else {
      setContasDestino([])
    }
  }, [empresaDestinoValue, bancosContas])

  const fetchEmpresas = async () => {
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select('*')
        .eq('ativo', true)
        .order('nome')
      
      if (error) throw error
      setEmpresas(data || [])
    } catch (error: any) {
      addToast('Erro ao carregar empresas: ' + error.message, 'error')
    }
  }

  const fetchBancosContas = async () => {
    try {
      const { data, error } = await supabase
        .from('bancos_contas')
        .select(`
          *,
          empresas (nome),
          bancos (nome, codigo)
        `)
        .eq('ativo', true)
        .order('banco_nome')
        .order('tipo_conta')
        .order('numero_conta')
      
      if (error) throw error
      setBancosContas(data || [])
    } catch (error: any) {
      addToast('Erro ao carregar contas: ' + error.message, 'error')
    }
  }

  const fetchTransferencias = async (page = 0) => {
    try {
      setLoading(true)
      
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      // Buscar movimentos de transferência enviada
      const { data: movimentosEnviados, error: errorMovimentos } = await supabase
        .from('movimentos_bancarios')
        .select('*')
        .eq('tipo_movimento', 'TRANSFERENCIA_ENVIADA')
        .order('data_movimento', { ascending: false })
        .range(from, to)

      if (errorMovimentos) throw errorMovimentos

      // Se não houver movimentos, retornar vazio
      if (!movimentosEnviados || movimentosEnviados.length === 0) {
        setTransferencias([])
        setHasMore(false)
        return
      }

      // Coletar IDs únicos de contas origem e IDs dos movimentos enviados
      const contaIds = new Set<string>()
      const movimentoEnviadoIds: string[] = []

      movimentosEnviados.forEach(mov => {
        if (mov.banco_conta_id) contaIds.add(mov.banco_conta_id)
        movimentoEnviadoIds.push(mov.id)
      })

      // Buscar contas bancárias de origem
      const { data: contas, error: errorContas } = await supabase
        .from('bancos_contas')
        .select(`
          id,
          numero_conta,
          banco_nome,
          agencia,
          tipo_conta,
          empresas(nome),
          bancos(nome, codigo)
        `)
        .in('id', Array.from(contaIds))

      if (errorContas) throw errorContas

      // Buscar movimentos RECEBIDOS que correspondem aos movimentos ENVIADOS
      const { data: movimentosDestino, error: errorDestino } = await supabase
        .from('movimentos_bancarios')
        .select('id, banco_conta_id, transferencia_id')
        .eq('tipo_movimento', 'TRANSFERENCIA_RECEBIDA')
        .in('transferencia_id', movimentoEnviadoIds)

      if (errorDestino) throw errorDestino

      // Pegar IDs das contas de destino
      const contaDestinoIds = movimentosDestino
        ?.map(m => m.banco_conta_id)
        .filter(id => id && !contaIds.has(id)) || []

      // Se houver contas de destino que ainda não foram buscadas
      let contasDestino: any[] = []
      if (contaDestinoIds.length > 0) {
        const { data, error } = await supabase
          .from('bancos_contas')
          .select(`
            id,
            numero_conta,
            banco_nome,
            agencia,
            tipo_conta,
            empresas(nome),
            bancos(nome, codigo)
          `)
          .in('id', contaDestinoIds)

        if (!error && data) {
          contasDestino = data
        }
      }

      // Criar mapa de contas
      const contasMap = new Map()
      contas?.forEach(conta => contasMap.set(conta.id, conta))
      contasDestino?.forEach(conta => contasMap.set(conta.id, conta))

      // Criar mapa de movimentos destino
      // Com link bidirecional: movimento RECEBIDO tem transferencia_id apontando para o movimento ENVIADO
      const movimentosDestinoMap = new Map()
      movimentosDestino?.forEach(mov => {
        if (mov.transferencia_id) {
          // A chave é o ID do movimento ENVIADO (que está em transferencia_id do RECEBIDO)
          movimentosDestinoMap.set(mov.transferencia_id, mov)
        }
      })

      // Transformar dados para o formato de transferências
      const transferenciasData = movimentosEnviados.map(mov => {
        const contaOrigem = contasMap.get(mov.banco_conta_id)
        
        // Buscar movimento destino usando o ID do movimento enviado
        const movimentoDestino = movimentosDestinoMap.get(mov.id)
        const contaDestino = movimentoDestino 
          ? contasMap.get(movimentoDestino.banco_conta_id)
          : null

        return {
          id: mov.id,
          org_id: mov.org_id,
          conta_origem_id: mov.banco_conta_id,
          conta_destino_id: movimentoDestino?.banco_conta_id || null,
          data_transferencia: mov.data_movimento,
          valor: mov.valor,
          historico: mov.historico,
          documento: mov.documento,
          created_at: mov.created_at,
          conta_origem: contaOrigem || null,
          conta_destino: contaDestino || null
        }
      })

      if (page === 0) {
        setTransferencias(transferenciasData)
      } else {
        setTransferencias(prev => [...prev, ...transferenciasData])
      }
      
      setHasMore(movimentosEnviados.length === PAGE_SIZE)
      setCurrentPage(page)
    } catch (error: any) {
      addToast('Erro ao carregar transferências: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      fetchTransferencias(currentPage + 1)
    }
  }

  const openModal = (transferencia?: Transferencia) => {
    if (transferencia) {
      setEditingId(transferencia.id)
      
      console.log('Transferencia:', transferencia)
      console.log('Conta origem ID:', transferencia.conta_origem_id)
      console.log('Conta destino ID:', transferencia.conta_destino_id)
      
      // Encontrar empresa de origem e destino
      const contaOrigem = bancosContas.find(c => c.id === transferencia.conta_origem_id)
      const contaDestino = bancosContas.find(c => c.id === transferencia.conta_destino_id)
      
      console.log('Conta origem encontrada:', contaOrigem)
      console.log('Conta destino encontrada:', contaDestino)
      
      // Primeiro setar as empresas (isso vai disparar os useEffect que populam contasOrigem e contasDestino)
      setValue('empresa_origem_id', contaOrigem?.empresa_id || '')
      setValue('empresa_destino_id', contaDestino?.empresa_id || '')
      
      // Aguardar um tick para os useEffect popularem os arrays de contas, então setar as contas
      setTimeout(() => {
        console.log('Setando conta_origem_id:', transferencia.conta_origem_id)
        console.log('Setando conta_destino_id:', transferencia.conta_destino_id)
        setValue('conta_origem_id', transferencia.conta_origem_id || '')
        setValue('conta_destino_id', transferencia.conta_destino_id || '')
      }, 200)
      
      setValue('data_transferencia', transferencia.data_transferencia)
      setValue('valor', transferencia.valor.toString())
      setValue('historico', transferencia.historico || '')
      setValue('documento', transferencia.documento || '')
      
      // Formatar o valor para exibição
      setValorFormatado(transferencia.valor.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }))
    } else {
      setEditingId(null)
      setValorFormatado('')
      reset({
        empresa_origem_id: '',
        conta_origem_id: '',
        empresa_destino_id: '',
        conta_destino_id: '',
        data_transferencia: new Date().toISOString().split('T')[0],
        valor: '',
        historico: '',
        documento: ''
      })
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setValorFormatado('')
    reset()
  }

  const onSubmit = async (data: TransferenciaForm) => {
    // Validações manuais
    const errors: string[] = []
    
    if (!data.empresa_origem_id) errors.push('Empresa de Origem')
    if (!data.conta_origem_id) errors.push('Conta Bancária de Origem')
    if (!data.empresa_destino_id) errors.push('Empresa de Destino')
    if (!data.conta_destino_id) errors.push('Conta Bancária de Destino')
    if (!data.data_transferencia) errors.push('Data da Transferência')
    if (!data.valor || data.valor === '0' || data.valor === '0.00') errors.push('Valor')
    
    if (errors.length > 0) {
      const camposFaltantes = errors.join(', ')
      setValidationModal({
        show: true,
        message: `Campos obrigatórios não preenchidos: ${camposFaltantes}`
      })
      return
    }

    try {
      // Validação: conta origem não pode ser igual à conta destino
      if (data.conta_origem_id === data.conta_destino_id) {
        setValidationModal({
          show: true,
          message: 'Conta bancária de origem não pode ser igual à conta bancária de destino. Favor ajustar.'
        })
        return
      }

      const valor = parseFloat(data.valor)

      if (editingId) {
        // Atualizar transferência existente
        // Buscar primeiro o movimento de saída para saber qual é o movimento de entrada
        const { data: movSaida, error: errorBuscaSaida } = await supabase
          .from('movimentos_bancarios')
          .select('transferencia_id')
          .eq('id', editingId)
          .single()

        if (errorBuscaSaida) throw errorBuscaSaida

        // Atualizar movimento de saída
        const { error: errorSaida } = await supabase
          .from('movimentos_bancarios')
          .update({
            banco_conta_id: data.conta_origem_id,
            data_movimento: data.data_transferencia,
            valor: valor,
            historico: data.historico || null,
            documento: data.documento || null
          })
          .eq('id', editingId)

        if (errorSaida) throw errorSaida

        // Atualizar movimento de entrada usando o transferencia_id
        if (movSaida?.transferencia_id) {
          const { error: errorEntrada } = await supabase
            .from('movimentos_bancarios')
            .update({
              banco_conta_id: data.conta_destino_id,
              data_movimento: data.data_transferencia,
              valor: valor,
              historico: data.historico || null,
              documento: data.documento || null
            })
            .eq('id', movSaida.transferencia_id)

          if (errorEntrada) throw errorEntrada
        }

        addToast('Transferência atualizada com sucesso!', 'success')
      } else {
        // Criar nova transferência
        // 1. Criar movimento de entrada (TRANSFERENCIA_RECEBIDA) primeiro sem transferencia_id
        const { data: movEntrada, error: errorEntrada } = await supabase
          .from('movimentos_bancarios')
          .insert({
            banco_conta_id: data.conta_destino_id,
            tipo_movimento: 'TRANSFERENCIA_RECEBIDA',
            data_movimento: data.data_transferencia,
            valor: valor,
            historico: data.historico || null,
            documento: data.documento || null,
            conciliado: false,
            transferencia_id: null
          })
          .select()
          .single()

        if (errorEntrada || !movEntrada) throw errorEntrada

        // 2. Criar movimento de saída (TRANSFERENCIA_ENVIADA) vinculado ao de entrada
        const { data: movSaida, error: errorSaida } = await supabase
          .from('movimentos_bancarios')
          .insert({
            banco_conta_id: data.conta_origem_id,
            tipo_movimento: 'TRANSFERENCIA_ENVIADA',
            data_movimento: data.data_transferencia,
            valor: valor,
            historico: data.historico || null,
            documento: data.documento || null,
            transferencia_id: movEntrada.id,
            conciliado: false
          })
          .select()
          .single()

        if (errorSaida || !movSaida) throw errorSaida

        // 3. Atualizar movimento de entrada com referência ao de saída (link bidirecional)
        const { error: errorUpdateEntrada } = await supabase
          .from('movimentos_bancarios')
          .update({ transferencia_id: movSaida.id })
          .eq('id', movEntrada.id)

        if (errorUpdateEntrada) throw errorUpdateEntrada

        addToast('Transferência criada com sucesso!', 'success')
      }

      closeModal()
      fetchTransferencias()
    } catch (error: any) {
      addToast('Erro ao salvar transferência: ' + error.message, 'error')
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm.id) return

    try {
      // Buscar o movimento de saída para pegar os dados completos
      const { data: movSaida, error: errorBusca } = await supabase
        .from('movimentos_bancarios')
        .select('id, transferencia_id, banco_conta_id, data_movimento')
        .eq('id', deleteConfirm.id)
        .single()

      if (errorBusca) throw errorBusca

      // Buscar movimento de entrada
      let movEntrada = null
      if (movSaida?.transferencia_id) {
        const { data, error } = await supabase
          .from('movimentos_bancarios')
          .select('banco_conta_id, data_movimento')
          .eq('id', movSaida.transferencia_id)
          .single()
        
        if (!error && data) {
          movEntrada = data
        }
      }

      // Verificar se a data está em período fechado para conta de origem
      const { data: fechamentoOrigemData, error: errorFechamentoOrigem } = await supabase
        .from('fechamentos_bancarios')
        .select('id, data_fechamento')
        .eq('banco_conta_id', movSaida.banco_conta_id)
        .eq('fechado', true)
        .gte('data_fechamento', movSaida.data_movimento)
        .order('data_fechamento', { ascending: true })
        .limit(1)

      if (errorFechamentoOrigem) throw errorFechamentoOrigem

      if (fechamentoOrigemData && fechamentoOrigemData.length > 0) {
        setValidationModal({
          show: true,
          message: 'Não é possível excluir esta transferência. A data está em um período já fechado na conta de origem. Solicite ao administrador a reabertura do período.'
        })
        setDeleteConfirm({ show: false, id: null })
        return
      }

      // Verificar se a data está em período fechado para conta de destino (se houver)
      if (movEntrada) {
        const { data: fechamentoDestinoData, error: errorFechamentoDestino } = await supabase
          .from('fechamentos_bancarios')
          .select('id, data_fechamento')
          .eq('banco_conta_id', movEntrada.banco_conta_id)
          .eq('fechado', true)
          .gte('data_fechamento', movEntrada.data_movimento)
          .order('data_fechamento', { ascending: true })
          .limit(1)

        if (errorFechamentoDestino) throw errorFechamentoDestino

        if (fechamentoDestinoData && fechamentoDestinoData.length > 0) {
          setValidationModal({
            show: true,
            message: 'Não é possível excluir esta transferência. A data está em um período já fechado na conta de destino. Solicite ao administrador a reabertura do período.'
          })
          setDeleteConfirm({ show: false, id: null })
          return
        }
      }

      // Se passou nas validações, pode deletar
      // IMPORTANTE: Como temos link bidirecional, precisamos quebrar AMBOS os links primeiro
      
      if (movSaida?.transferencia_id) {
        // 1. Remover o link do movimento de SAÍDA (setar transferencia_id = null)
        const { error: errorUpdateSaida } = await supabase
          .from('movimentos_bancarios')
          .update({ transferencia_id: null })
          .eq('id', deleteConfirm.id)

        if (errorUpdateSaida) throw errorUpdateSaida

        // 2. Remover o link do movimento de ENTRADA (setar transferencia_id = null)
        const { error: errorUpdateEntrada } = await supabase
          .from('movimentos_bancarios')
          .update({ transferencia_id: null })
          .eq('id', movSaida.transferencia_id)

        if (errorUpdateEntrada) throw errorUpdateEntrada

        // 3. Agora deletar o movimento de ENTRADA
        const { error: errorEntrada } = await supabase
          .from('movimentos_bancarios')
          .delete()
          .eq('id', movSaida.transferencia_id)

        if (errorEntrada) throw errorEntrada
      }

      // 4. Por fim, deletar movimento de SAÍDA
      const { error: errorSaida } = await supabase
        .from('movimentos_bancarios')
        .delete()
        .eq('id', deleteConfirm.id)

      if (errorSaida) throw errorSaida

      addToast('Transferência excluída com sucesso!', 'success')
      setDeleteConfirm({ show: false, id: null })
      fetchTransferencias()
    } catch (error: any) {
      addToast('Erro ao excluir transferência: ' + error.message, 'error')
      setDeleteConfirm({ show: false, id: null })
    }
  }

  // Filtrar transferências
  const filteredTransferencias = transferencias.filter(transferencia => {
    const matchSearch = !searchTerm || 
      transferencia.conta_origem?.empresas?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transferencia.conta_destino?.empresas?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transferencia.conta_origem?.banco_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transferencia.conta_origem?.bancos?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transferencia.conta_destino?.banco_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transferencia.conta_destino?.bancos?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transferencia.historico?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transferencia.documento?.toLowerCase().includes(searchTerm.toLowerCase())

    const contaOrigemEmpresaId = bancosContas.find(c => c.id === transferencia.conta_origem_id)?.empresa_id
    const contaDestinoEmpresaId = bancosContas.find(c => c.id === transferencia.conta_destino_id)?.empresa_id
    
    const matchEmpresaOrigem = !empresaOrigemFiltro || contaOrigemEmpresaId === empresaOrigemFiltro
    const matchEmpresaDestino = !empresaDestinoFiltro || contaDestinoEmpresaId === empresaDestinoFiltro
    
    const dataTransf = new Date(transferencia.data_transferencia)
    const matchDataInicial = !dataInicial || dataTransf >= new Date(dataInicial)
    const matchDataFinal = !dataFinal || dataTransf <= new Date(dataFinal)

    return matchSearch && matchEmpresaOrigem && matchEmpresaDestino && matchDataInicial && matchDataFinal
  })

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f9fafb',
      padding: '24px'
    }}>
      {/* Header */}
      <div style={{
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: '700',
            color: '#111827',
            marginBottom: '4px'
          }}>
            Transferências entre Contas
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#6b7280'
          }}>
            Gerencie transferências entre contas bancárias da sua organização
          </p>
        </div>
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
          <Plus size={20} />
          Nova Transferência
        </button>
      </div>

      {/* Filtros */}
      <div style={{
        backgroundColor: 'white',
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        marginBottom: '20px'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 0.8fr 0.8fr',
          gap: '12px',
          marginBottom: '12px'
        }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '4px'
            }}>
              Empresa Origem
            </label>
            <select
              value={empresaOrigemFiltro}
              onChange={(e) => setEmpresaOrigemFiltro(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todas</option>
              {empresas.map(empresa => (
                <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '4px'
            }}>
              Empresa Destino
            </label>
            <select
              value={empresaDestinoFiltro}
              onChange={(e) => setEmpresaDestinoFiltro(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todas</option>
              {empresas.map(empresa => (
                <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '4px'
            }}>
              Data Inicial
            </label>
            <input
              type="date"
              value={dataInicial}
              onChange={(e) => setDataInicial(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
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
              fontSize: '12px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '4px'
            }}>
              Data Final
            </label>
            <input
              type="date"
              value={dataFinal}
              onChange={(e) => setDataFinal(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
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
            placeholder="Buscar por empresa, banco, histórico ou documento..."
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

        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end',
          marginTop: '16px'
        }}>
          <button
            onClick={() => {
              setSearchTerm('')
              setEmpresaOrigemFiltro('')
              setEmpresaDestinoFiltro('')
              setDataInicial('')
              setDataFinal('')
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
            onClick={() => fetchTransferencias(0)}
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
        ) : filteredTransferencias.length === 0 ? (
          <div style={{
            padding: '60px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <p style={{ fontSize: '16px', fontWeight: '500', marginBottom: '8px' }}>
              Nenhuma transferência encontrada
            </p>
            <p style={{ fontSize: '14px' }}>
              {transferencias.length === 0 
                ? 'Comece criando sua primeira transferência'
                : 'Tente ajustar os filtros de busca'}
            </p>
          </div>
        ) : (
          <>
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
                      whiteSpace: 'nowrap'
                    }}>
                      DATA
                    </th>
                    <th style={{
                      padding: '6px 8px',
                      textAlign: 'left',
                      fontSize: '8px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      whiteSpace: 'nowrap'
                    }}>
                      ORIGEM
                    </th>
                    <th style={{
                      padding: '6px 8px',
                      textAlign: 'center',
                      fontSize: '8px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      whiteSpace: 'nowrap'
                    }}>
                      
                    </th>
                    <th style={{
                      padding: '6px 8px',
                      textAlign: 'left',
                      fontSize: '8px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      whiteSpace: 'nowrap'
                    }}>
                      DESTINO
                    </th>
                    <th style={{
                      padding: '6px 8px',
                      textAlign: 'right',
                      fontSize: '8px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      whiteSpace: 'nowrap'
                    }}>
                      VALOR
                    </th>
                    <th style={{
                      padding: '6px 8px',
                      textAlign: 'left',
                      fontSize: '8px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      whiteSpace: 'nowrap'
                    }}>
                      HISTÓRICO
                    </th>
                    <th style={{
                      padding: '6px 8px',
                      textAlign: 'center',
                      fontSize: '8px',
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
                  {filteredTransferencias.map((transferencia) => (
                    <tr
                      key={transferencia.id}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                    >
                      {/* DATA */}
                      <td style={{
                        padding: '6px 8px',
                        fontSize: '9px',
                        color: '#6b7280',
                        whiteSpace: 'nowrap'
                      }}>
                        {formatDate(transferencia.data_transferencia)}
                      </td>

                      {/* ORIGEM */}
                      <td style={{
                        padding: '6px 8px',
                        fontSize: '9px',
                        color: '#1f2937'
                      }}>
                        <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', lineHeight: '1.4' }}>
                          <div style={{ fontWeight: '600' }}>
                            {transferencia.conta_origem?.empresas?.nome || '-'}
                          </div>
                          <div style={{ fontSize: '8px', color: '#6b7280', marginTop: '2px' }}>
                            {transferencia.conta_origem?.banco_nome || transferencia.conta_origem?.bancos?.nome || 'Banco'} - Ag: {transferencia.conta_origem?.agencia} - Conta: {transferencia.conta_origem?.numero_conta}
                          </div>
                          {transferencia.conta_origem?.tipo_conta && (
                            <div style={{ fontSize: '7px', color: '#9ca3af', marginTop: '1px', fontStyle: 'italic' }}>
                              {transferencia.conta_origem.tipo_conta}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* SETA */}
                      <td style={{
                        padding: '6px 8px',
                        textAlign: 'center'
                      }}>
                        <ArrowRightLeft size={14} style={{ color: '#1555D6' }} />
                      </td>

                      {/* DESTINO */}
                      <td style={{
                        padding: '6px 8px',
                        fontSize: '9px',
                        color: '#1f2937'
                      }}>
                        <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', lineHeight: '1.4' }}>
                          <div style={{ fontWeight: '600' }}>
                            {transferencia.conta_destino?.empresas?.nome || '-'}
                          </div>
                          <div style={{ fontSize: '8px', color: '#6b7280', marginTop: '2px' }}>
                            {transferencia.conta_destino?.banco_nome || transferencia.conta_destino?.bancos?.nome || 'Banco'} - Ag: {transferencia.conta_destino?.agencia} - Conta: {transferencia.conta_destino?.numero_conta}
                          </div>
                          {transferencia.conta_destino?.tipo_conta && (
                            <div style={{ fontSize: '7px', color: '#9ca3af', marginTop: '1px', fontStyle: 'italic' }}>
                              {transferencia.conta_destino.tipo_conta}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* VALOR */}
                      <td style={{
                        padding: '6px 8px',
                        fontSize: '9px',
                        color: '#1f2937',
                        fontWeight: '600',
                        textAlign: 'right',
                        whiteSpace: 'nowrap'
                      }}>
                        {formatCurrency(transferencia.valor)}
                      </td>

                      {/* HISTÓRICO */}
                      <td style={{
                        padding: '6px 8px',
                        fontSize: '9px',
                        color: '#6b7280'
                      }}>
                        <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', lineHeight: '1.4', maxWidth: '200px' }}>
                          {transferencia.historico || '-'}
                        </div>
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
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <button
                              onClick={() => openModal(transferencia)}
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
                              onClick={() => setDeleteConfirm({ show: true, id: transferencia.id })}
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
                  ))}
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
                  disabled={loading}
                  style={{
                    padding: '10px 24px',
                    backgroundColor: loading ? '#d1d5db' : '#1555D6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: '600',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {loading ? 'Carregando...' : 'Carregar Mais'}
                </button>
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
            backdropFilter: 'blur(4px)'
          }}
          onClick={closeModal}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '800px',
              maxHeight: '90vh',
              margin: '16px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: '6px 20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{
                fontSize: '16px',
                fontWeight: '700',
                color: '#111827',
                margin: 0
              }}>
                {editingId ? 'Editar Transferência' : 'Nova Transferência'}
              </h2>
              <button
                onClick={closeModal}
                style={{
                  padding: '8px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: '#6b7280',
                  fontSize: '20px'
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit(onSubmit)} style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
              <div style={{ display: 'grid', gap: '6px' }}>
                {/* Origem */}
                <div style={{
                  padding: '8px',
                  backgroundColor: '#f0fdf4',
                  borderRadius: '6px',
                  border: '1px solid #bbf7d0'
                }}>
                  <h3 style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#166534',
                    marginBottom: '5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <TrendingDown size={13} />
                    Conta de Origem
                  </h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '11px',
                        fontWeight: '500',
                        color: '#374151',
                        marginBottom: '2px'
                      }}>
                        Empresa *
                      </label>
                      <select
                        {...register('empresa_origem_id')}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          fontSize: '12px',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">Selecione...</option>
                        {empresas.map(empresa => (
                          <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                        ))}
                      </select>
                      {errors.empresa_origem_id && (
                        <span style={{ fontSize: '10px', color: '#ef4444', marginTop: '2px', display: 'block' }}>
                          {errors.empresa_origem_id.message}
                        </span>
                      )}
                    </div>

                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '11px',
                        fontWeight: '500',
                        color: '#374151',
                        marginBottom: '2px'
                      }}>
                        Conta Bancária *
                      </label>
                      <select
                        {...register('conta_origem_id')}
                        disabled={!empresaOrigemValue}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          fontSize: '12px',
                          outline: 'none',
                          cursor: empresaOrigemValue ? 'pointer' : 'not-allowed',
                          backgroundColor: empresaOrigemValue ? 'white' : '#f9fafb'
                        }}
                      >
                        <option value="">Selecione...</option>
                        {contasOrigem.map(conta => (
                          <option key={conta.id} value={conta.id}>
                            {conta.banco_nome || conta.bancos?.nome || 'Banco Desconhecido'} - Ag: {conta.agencia} - Conta: {conta.numero_conta} - {conta.tipo_conta || 'N/A'}
                          </option>
                        ))}
                      </select>
                      {errors.conta_origem_id && (
                        <span style={{ fontSize: '10px', color: '#ef4444', marginTop: '2px', display: 'block' }}>
                          {errors.conta_origem_id.message}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Destino */}
                <div style={{
                  padding: '8px',
                  backgroundColor: '#eff6ff',
                  borderRadius: '6px',
                  border: '1px solid #bfdbfe'
                }}>
                  <h3 style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#1e40af',
                    marginBottom: '5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <TrendingUp size={13} />
                    Conta de Destino
                  </h3>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '11px',
                        fontWeight: '500',
                        color: '#374151',
                        marginBottom: '2px'
                      }}>
                        Empresa *
                      </label>
                      <select
                        {...register('empresa_destino_id')}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          fontSize: '12px',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">Selecione...</option>
                        {empresas.map(empresa => (
                          <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                        ))}
                      </select>
                      {errors.empresa_destino_id && (
                        <span style={{ fontSize: '10px', color: '#ef4444', marginTop: '2px', display: 'block' }}>
                          {errors.empresa_destino_id.message}
                        </span>
                      )}
                    </div>

                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '11px',
                        fontWeight: '500',
                        color: '#374151',
                        marginBottom: '2px'
                      }}>
                        Conta Bancária *
                      </label>
                      <select
                        {...register('conta_destino_id')}
                        disabled={!empresaDestinoValue}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          fontSize: '12px',
                          outline: 'none',
                          cursor: empresaDestinoValue ? 'pointer' : 'not-allowed',
                          backgroundColor: empresaDestinoValue ? 'white' : '#f9fafb'
                        }}
                      >
                        <option value="">Selecione...</option>
                        {contasDestino.map(conta => (
                          <option key={conta.id} value={conta.id}>
                            {conta.banco_nome || conta.bancos?.nome || 'Banco Desconhecido'} - Ag: {conta.agencia} - Conta: {conta.numero_conta} - {conta.tipo_conta || 'N/A'}
                          </option>
                        ))}
                      </select>
                      {errors.conta_destino_id && (
                        <span style={{ fontSize: '10px', color: '#ef4444', marginTop: '2px', display: 'block' }}>
                          {errors.conta_destino_id.message}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dados da Transferência */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '2px'
                    }}>
                      Data da Transferência *
                    </label>
                    <input
                      type="date"
                      {...register('data_transferencia')}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '12px',
                        outline: 'none'
                      }}
                    />
                    {errors.data_transferencia && (
                      <span style={{ fontSize: '10px', color: '#ef4444', marginTop: '2px', display: 'block' }}>
                        {errors.data_transferencia.message}
                      </span>
                    )}
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '2px'
                    }}>
                      Valor *
                    </label>
                    <input
                      type="text"
                      placeholder="0,00"
                      value={valorFormatado}
                      onChange={handleValorChange}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '12px',
                        outline: 'none'
                      }}
                    />
                    <input type="hidden" {...register('valor')} />
                    {errors.valor && (
                      <span style={{ fontSize: '10px', color: '#ef4444', marginTop: '2px', display: 'block' }}>
                        {errors.valor.message}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '2px'
                  }}>
                    Histórico
                  </label>
                  <textarea
                    {...register('historico')}
                    rows={2}
                    placeholder="Descrição da transferência..."
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '12px',
                      outline: 'none',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '2px'
                  }}>
                    Documento
                  </label>
                  <input
                    type="text"
                    placeholder="Número do documento..."
                    {...register('documento')}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      fontSize: '12px',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-end',
                marginTop: '6px',
                paddingTop: '8px',
                borderTop: '1px solid #e5e7eb'
              }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    padding: '6px 16px',
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '12px',
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
                    padding: '6px 16px',
                    backgroundColor: '#1555D6',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1044b5'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1555D6'}
                >
                  {editingId ? 'Atualizar' : 'Criar'} Transferência
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
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
              <Trash2 style={{ width: '28px', height: '28px', color: '#ef4444' }} />
            </div>

            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '12px',
              textAlign: 'center'
            }}>
              Excluir Transferência
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              marginBottom: '24px',
              textAlign: 'center',
              lineHeight: '1.5'
            }}>
              Tem certeza que deseja excluir esta transferência? Esta ação não pode ser desfeita e removerá ambos os movimentos (saída e entrada).
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

      {/* Modal de Validação */}
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
              backgroundColor: '#fef3c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertTriangle style={{ width: '28px', height: '28px', color: '#f59e0b' }} />
            </div>

            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '12px',
              textAlign: 'center'
            }}>
              Atenção
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              marginBottom: '24px',
              textAlign: 'center',
              lineHeight: '1.5'
            }}>
              {validationModal.message}
            </p>

            <button
              onClick={() => setValidationModal({ show: false, message: '' })}
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
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
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