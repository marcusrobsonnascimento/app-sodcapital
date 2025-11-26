'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  Clock, 
  Link2, 
  Link2Off,
  Eye,
  RefreshCw, 
  Download,
  X,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Ban,
  Check,
  ArrowRightLeft,
  Lightbulb,
  FileSpreadsheet,
  Building2,
  CreditCard
} from 'lucide-react'

// ==================== TYPES ====================

interface Empresa {
  id: string
  nome: string
}

interface BancoConta {
  id: string
  empresa_id: string
  banco_nome: string
  numero_conta: string
  agencia: string
  tipo_conta: string
  org_id: string
}

interface TransacaoOFX {
  fitid: string
  data: string
  tipo: 'CREDIT' | 'DEBIT'
  valor: number
  memo: string
  checknum: string
}

interface ExtratoBancario {
  id: string
  org_id: string
  banco_conta_id: string
  data_lancamento: string
  historico: string | null
  valor: number
  documento_ref: string | null
  created_at: string
  selecionado?: boolean
  conciliacao?: {
    id: string
    status: string
    lancamento_id: string | null
    movimento_id: string | null
    observacoes: string | null
  } | null
}

interface Lancamento {
  id: string
  tipo: string
  valor_liquido: number
  data_vencimento: string
  data_liquidacao: string | null
  contraparte_nome: string
  status: string
  documento_numero?: string
  origem: 'LANCAMENTO'
  selecionado?: boolean
}

interface MovimentoBancario {
  id: string
  org_id: string
  banco_conta_id: string
  tipo_movimento: string
  valor: number
  data_movimento: string
  historico: string | null
  conta_destino_id?: string
  conta_destino_nome?: string
  origem: 'TRANSFERENCIA'
  selecionado?: boolean
}

type LancamentoOuMovimento = Lancamento | MovimentoBancario

interface Conciliacao {
  id: string
  org_id: string
  banco_conta_id: string
  extrato_id: string
  lancamento_id: string | null
  movimento_id: string | null
  status: string
  observacoes: string | null
  created_at: string
  extrato?: ExtratoBancario
  lancamento?: Lancamento
  movimento?: MovimentoBancario
}

interface DadosOFX {
  banco: string
  conta: string
  dataInicio: string
  dataFim: string
  saldoFinal: number
  transacoes: TransacaoOFX[]
}

// ==================== PARSER OFX ====================

const parseOFX = (conteudo: string): DadosOFX | null => {
  try {
    const bankIdMatch = conteudo.match(/<BANKID>(\d+)/)
    const acctIdMatch = conteudo.match(/<ACCTID>(\d+)/)
    const dtStartMatch = conteudo.match(/<DTSTART>(\d{8})/)
    const dtEndMatch = conteudo.match(/<DTEND>(\d{8})/)
    const balAmtMatch = conteudo.match(/<BALAMT>([\d.-]+)/)

    const banco = bankIdMatch ? bankIdMatch[1] : ''
    const conta = acctIdMatch ? acctIdMatch[1] : ''
    const dataInicio = dtStartMatch ? formatarDataOFX(dtStartMatch[1]) : ''
    const dataFim = dtEndMatch ? formatarDataOFX(dtEndMatch[1]) : ''
    const saldoFinal = balAmtMatch ? parseFloat(balAmtMatch[1]) : 0

    const transacoes: TransacaoOFX[] = []
    const stmtTrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g
    let match

    while ((match = stmtTrnRegex.exec(conteudo)) !== null) {
      const bloco = match[1]
      
      const tipoMatch = bloco.match(/<TRNTYPE>(\w+)/)
      const dataMatch = bloco.match(/<DTPOSTED>(\d{8})/)
      const valorMatch = bloco.match(/<TRNAMT>([\d.-]+)/)
      const fitidMatch = bloco.match(/<FITID>(\S+)/)
      const checknumMatch = bloco.match(/<CHECKNUM>(\S+)/)
      const memoMatch = bloco.match(/<MEMO>([^\n<]+)/)

      if (tipoMatch && dataMatch && valorMatch && fitidMatch) {
        transacoes.push({
          fitid: fitidMatch[1],
          data: formatarDataOFX(dataMatch[1]),
          tipo: tipoMatch[1] as 'CREDIT' | 'DEBIT',
          valor: parseFloat(valorMatch[1]),
          memo: memoMatch ? memoMatch[1].trim() : '',
          checknum: checknumMatch ? checknumMatch[1] : ''
        })
      }
    }

    return { banco, conta, dataInicio, dataFim, saldoFinal, transacoes }
  } catch (error) {
    console.error('Erro ao parsear OFX:', error)
    return null
  }
}

const formatarDataOFX = (data: string): string => {
  return `${data.substring(0, 4)}-${data.substring(4, 6)}-${data.substring(6, 8)}`
}

// ==================== FORMATTERS ====================

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

const formatCurrencySimple = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(value))
}

const formatDateBR = (dateString: string | null): string => {
  if (!dateString) return '-'
  const [year, month, day] = dateString.split('-')
  return `${day}/${month}/${year}`
}

const getNomeBanco = (codigo: string): string => {
  const bancos: Record<string, string> = {
    '001': 'Banco do Brasil',
    '033': 'Santander',
    '104': 'Caixa Econômica',
    '237': 'Bradesco',
    '341': 'Itaú',
    '0341': 'Itaú'
  }
  return bancos[codigo] || `Banco ${codigo}`
}

// ==================== COMPONENT ====================

export default function ConciliacaoBancariaPage() {
  // Estados principais
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [bancosContas, setBancosContas] = useState<BancoConta[]>([])
  const [extratos, setExtratos] = useState<ExtratoBancario[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [movimentos, setMovimentos] = useState<MovimentoBancario[]>([])
  const [conciliacoes, setConciliacoes] = useState<Conciliacao[]>([])
  
  // Estados de seleção
  const [empresaSelecionada, setEmpresaSelecionada] = useState('')
  const [contaSelecionada, setContaSelecionada] = useState('')
  const [contaInfo, setContaInfo] = useState<BancoConta | null>(null)
  
  // Estados do OFX
  const [dadosOFX, setDadosOFX] = useState<DadosOFX | null>(null)
  const [arquivoNome, setArquivoNome] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  
  // Estados de loading
  const [loading, setLoading] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [importando, setImportando] = useState(false)
  
  // Estados de filtro
  const [filtroStatusExtrato, setFiltroStatusExtrato] = useState<string>('PENDENTE')
  const [searchTermExtrato, setSearchTermExtrato] = useState('')
  const [searchTermConta, setSearchTermConta] = useState('')
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFim, setPeriodoFim] = useState('')
  const [mostrarConciliados, setMostrarConciliados] = useState(false)
  
  // Estados de seleção para conciliação
  const [extratosSelecionados, setExtratosSelecionados] = useState<string[]>([])
  const [lancamentosSelecionados, setLancamentosSelecionados] = useState<string[]>([])
  
  // Modal de edição de lançamento
  const [showEditarLancamentoModal, setShowEditarLancamentoModal] = useState(false)
  const [lancamentoParaEditar, setLancamentoParaEditar] = useState<Lancamento | null>(null)
  
  // Toast
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' | 'warning' }>({
    show: false,
    message: '',
    type: 'success'
  })

  // Modal de erro
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // ==================== FETCH FUNCTIONS ====================

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

  const fetchBancosContas = async (empresaId: string) => {
    try {
      const { data, error } = await supabase
        .from('bancos_contas')
        .select(`
          id,
          empresa_id,
          org_id,
          numero_conta,
          agencia,
          tipo_conta,
          bancos(nome)
        `)
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .order('numero_conta')
      
      if (error) throw error
      
      const formatted = (data || []).map((item: any) => ({
        id: item.id,
        empresa_id: item.empresa_id,
        org_id: item.org_id,
        banco_nome: Array.isArray(item.bancos) ? item.bancos[0]?.nome : item.bancos?.nome || 'Banco',
        numero_conta: item.numero_conta,
        agencia: item.agencia,
        tipo_conta: item.tipo_conta
      }))
      
      setBancosContas(formatted)
    } catch (error) {
      console.error('Erro ao carregar contas:', error)
    }
  }

  const fetchExtratos = async (contaId: string) => {
    try {
      setLoading(true)
      
      // Buscar extratos
      const { data: extratosData, error: extratosError } = await supabase
        .from('extratos_bancarios')
        .select('*')
        .eq('banco_conta_id', contaId)
        .order('data_lancamento', { ascending: false })
      
      if (extratosError) throw extratosError

      // Buscar conciliações
      const extratosIds = (extratosData || []).map(e => e.id)
      
      let conciliacoesData: any[] = []
      if (extratosIds.length > 0) {
        const { data, error } = await supabase
          .from('conciliacoes')
          .select('*')
          .in('extrato_id', extratosIds)
        
        if (!error) conciliacoesData = data || []
      }

      // Combinar dados
      const conciliacoesMap = new Map(conciliacoesData.map(c => [c.extrato_id, c]))
      
      const formatted = (extratosData || []).map(e => ({
        ...e,
        conciliacao: conciliacoesMap.get(e.id) || null,
        selecionado: false
      }))
      
      setExtratos(formatted)
    } catch (error) {
      console.error('Erro ao carregar extratos:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchLancamentos = async (contaId: string) => {
    try {
      const { data, error } = await supabase
        .from('lancamentos')
        .select(`
          id,
          tipo,
          valor_liquido,
          data_vencimento,
          data_liquidacao,
          status,
          documento_numero,
          contrapartes(nome, apelido)
        `)
        .eq('banco_conta_id', contaId)
        .eq('status', 'PAGO_RECEBIDO')
        .order('data_liquidacao', { ascending: false })
      
      if (error) throw error
      
      const formatted: Lancamento[] = (data || []).map((item: any) => ({
        id: item.id,
        tipo: item.tipo,
        valor_liquido: item.valor_liquido,
        data_vencimento: item.data_vencimento,
        data_liquidacao: item.data_liquidacao,
        status: item.status,
        documento_numero: item.documento_numero,
        contraparte_nome: Array.isArray(item.contrapartes) 
          ? (item.contrapartes[0]?.apelido || item.contrapartes[0]?.nome)
          : (item.contrapartes?.apelido || item.contrapartes?.nome) || '',
        origem: 'LANCAMENTO',
        selecionado: false
      }))
      
      setLancamentos(formatted)
    } catch (error) {
      console.error('Erro ao carregar lançamentos:', error)
    }
  }

  const fetchMovimentos = async (contaId: string) => {
    try {
      // Buscar movimentos bancários de transferência da conta
      const { data, error } = await supabase
        .from('movimentos_bancarios')
        .select(`
          id,
          org_id,
          banco_conta_id,
          tipo_movimento,
          valor,
          data_movimento,
          historico,
          documento,
          conciliado,
          transferencia_id,
          lancamento_id
        `)
        .eq('banco_conta_id', contaId)
        .in('tipo_movimento', ['TRANSFERENCIA_ENVIADA', 'TRANSFERENCIA_RECEBIDA'])
        .order('data_movimento', { ascending: false })
      
      if (error) {
        console.error('Erro na query movimentos_bancarios:', error)
        // Se der erro, tenta sem o filtro de tipo
        const { data: dataAll, error: errorAll } = await supabase
          .from('movimentos_bancarios')
          .select('*')
          .eq('banco_conta_id', contaId)
          .order('data_movimento', { ascending: false })
        
        if (errorAll) {
          console.error('Erro também sem filtro:', errorAll)
          setMovimentos([])
          return
        }
        
        console.log('Todos movimentos:', dataAll)
        
        // Filtrar manualmente
        const transferencias = (dataAll || []).filter((item: any) => 
          item.tipo_movimento === 'TRANSFERENCIA_ENVIADA' || 
          item.tipo_movimento === 'TRANSFERENCIA_RECEBIDA'
        )
        
        const formatted: MovimentoBancario[] = transferencias.map((item: any) => ({
          id: item.id,
          org_id: item.org_id,
          banco_conta_id: item.banco_conta_id,
          tipo_movimento: item.tipo_movimento,
          valor: item.tipo_movimento === 'TRANSFERENCIA_ENVIADA' ? -item.valor : item.valor,
          data_movimento: item.data_movimento,
          historico: item.historico || `${item.tipo_movimento} - ${item.documento || ''}`,
          conta_destino_id: item.transferencia_id,
          conta_destino_nome: '',
          origem: 'TRANSFERENCIA',
          selecionado: false
        }))
        
        setMovimentos(formatted)
        return
      }
      
      console.log('Movimentos encontrados:', data?.length || 0)
      
      const formatted: MovimentoBancario[] = (data || []).map((item: any) => ({
        id: item.id,
        org_id: item.org_id,
        banco_conta_id: item.banco_conta_id,
        tipo_movimento: item.tipo_movimento,
        valor: item.tipo_movimento === 'TRANSFERENCIA_ENVIADA' ? -item.valor : item.valor,
        data_movimento: item.data_movimento,
        historico: item.historico || `${item.tipo_movimento} - ${item.documento || ''}`,
        conta_destino_id: item.transferencia_id,
        conta_destino_nome: '',
        origem: 'TRANSFERENCIA',
        selecionado: false
      }))
      
      setMovimentos(formatted)
    } catch (error) {
      console.error('Erro ao carregar movimentos:', error)
      setMovimentos([])
    }
  }

  const fetchConciliacoes = async (contaId: string) => {
    try {
      const { data, error } = await supabase
        .from('conciliacoes')
        .select('*')
        .eq('banco_conta_id', contaId)
        .eq('status', 'CONCILIADO')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setConciliacoes(data || [])
    } catch (error) {
      console.error('Erro ao carregar conciliações:', error)
    }
  }

  // ==================== EFFECTS ====================

  useEffect(() => {
    fetchEmpresas()
  }, [])

  useEffect(() => {
    if (empresaSelecionada) {
      fetchBancosContas(empresaSelecionada)
      setContaSelecionada('')
      setContaInfo(null)
      setDadosOFX(null)
      setExtratos([])
      setLancamentos([])
      setMovimentos([])
    }
  }, [empresaSelecionada])

  useEffect(() => {
    if (contaSelecionada) {
      const conta = bancosContas.find(c => c.id === contaSelecionada)
      setContaInfo(conta || null)
      fetchExtratos(contaSelecionada)
      fetchLancamentos(contaSelecionada)
      fetchMovimentos(contaSelecionada)
      fetchConciliacoes(contaSelecionada)
    }
  }, [contaSelecionada])

  // ==================== HANDLERS ====================

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000)
  }

  const showError = (message: string) => {
    setErrorMessage(message)
    setShowErrorModal(true)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      await processarArquivo(files[0])
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      await processarArquivo(files[0])
    }
  }

  const processarArquivo = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.ofx')) {
      showError('Por favor, selecione um arquivo .OFX válido')
      return
    }

    if (!contaSelecionada) {
      showError('Selecione uma conta bancária antes de importar o arquivo')
      return
    }

    setProcessando(true)
    setArquivoNome(file.name)

    try {
      const conteudo = await file.text()
      const dados = parseOFX(conteudo)
      
      if (!dados) {
        showError('Erro ao processar arquivo OFX. Verifique se o arquivo está no formato correto.')
        return
      }

      setDadosOFX(dados)
      showToast(`Arquivo processado: ${dados.transacoes.length} transações encontradas`, 'success')
    } catch (error: any) {
      showError(`Erro ao ler arquivo: ${error.message}`)
    } finally {
      setProcessando(false)
    }
  }

  const importarOFX = async () => {
    if (!dadosOFX || !contaInfo) return

    setImportando(true)
    try {
      let importados = 0
      let ignorados = 0

      for (const transacao of dadosOFX.transacoes) {
        // Verificar se já existe
        const { data: existente } = await supabase
          .from('extratos_bancarios')
          .select('id')
          .eq('banco_conta_id', contaSelecionada)
          .eq('documento_ref', transacao.fitid)
          .single()

        if (!existente) {
          const { error } = await supabase
            .from('extratos_bancarios')
            .insert({
              org_id: contaInfo.org_id,
              banco_conta_id: contaSelecionada,
              data_lancamento: transacao.data,
              historico: transacao.memo,
              valor: transacao.valor,
              documento_ref: transacao.fitid
            })

          if (!error) importados++
        } else {
          ignorados++
        }
      }

      showToast(`Importação concluída: ${importados} novos, ${ignorados} já existentes`, 'success')
      setDadosOFX(null)
      setArquivoNome('')
      await fetchExtratos(contaSelecionada)
    } catch (error: any) {
      showError(`Erro na importação: ${error.message}`)
    } finally {
      setImportando(false)
    }
  }

  // ==================== SELEÇÃO ====================

  const toggleExtratoSelecionado = (id: string) => {
    setExtratosSelecionados(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const toggleLancamentoSelecionado = (id: string, origem: 'LANCAMENTO' | 'TRANSFERENCIA') => {
    const chave = `${origem}:${id}`
    setLancamentosSelecionados(prev => 
      prev.includes(chave) ? prev.filter(x => x !== chave) : [...prev, chave]
    )
  }

  const selecionarTodosExtratos = () => {
    const pendentes = extratosFiltrados.filter(e => !e.conciliacao || e.conciliacao.status === 'PENDENTE')
    if (extratosSelecionados.length === pendentes.length) {
      setExtratosSelecionados([])
    } else {
      setExtratosSelecionados(pendentes.map(e => e.id))
    }
  }

  const selecionarTodosLancamentos = () => {
    const chaves = lancamentosFiltrados.map(item => `${item.origem}:${item.id}`)
    if (lancamentosSelecionados.length === chaves.length) {
      setLancamentosSelecionados([])
    } else {
      setLancamentosSelecionados(chaves)
    }
  }

  // ==================== CONCILIAÇÃO ====================

  const vincular = async () => {
    if (extratosSelecionados.length === 0) {
      showToast('Selecione ao menos um lançamento do arquivo', 'warning')
      return
    }

    if (lancamentosSelecionados.length === 0) {
      showToast('Selecione ao menos um lançamento da conta', 'warning')
      return
    }

    if (extratosSelecionados.length !== lancamentosSelecionados.length) {
      showToast('Selecione a mesma quantidade de itens em ambos os lados', 'warning')
      return
    }

    try {
      for (let i = 0; i < extratosSelecionados.length; i++) {
        const extratoId = extratosSelecionados[i]
        const [origem, id] = lancamentosSelecionados[i].split(':')

        const insertData: any = {
          org_id: contaInfo!.org_id,
          banco_conta_id: contaSelecionada,
          extrato_id: extratoId,
          status: 'CONCILIADO'
        }

        if (origem === 'LANCAMENTO') {
          insertData.lancamento_id = id
        } else {
          insertData.movimento_id = id
        }

        const { error } = await supabase
          .from('conciliacoes')
          .insert(insertData)

        if (error) throw error
      }

      showToast(`${extratosSelecionados.length} conciliação(ões) realizada(s)`, 'success')
      setExtratosSelecionados([])
      setLancamentosSelecionados([])
      await fetchExtratos(contaSelecionada)
      await fetchConciliacoes(contaSelecionada)
    } catch (error: any) {
      showError(`Erro ao vincular: ${error.message}`)
    }
  }

  const desvincular = async (conciliacaoId: string) => {
    try {
      const { error } = await supabase
        .from('conciliacoes')
        .delete()
        .eq('id', conciliacaoId)

      if (error) throw error

      showToast('Conciliação desfeita', 'success')
      await fetchExtratos(contaSelecionada)
      await fetchConciliacoes(contaSelecionada)
    } catch (error: any) {
      showError(`Erro ao desvincular: ${error.message}`)
    }
  }

  const desvincularTodos = async () => {
    if (conciliacoes.length === 0) return

    try {
      const { error } = await supabase
        .from('conciliacoes')
        .delete()
        .eq('banco_conta_id', contaSelecionada)
        .eq('status', 'CONCILIADO')

      if (error) throw error

      showToast('Todas as conciliações foram desfeitas', 'success')
      await fetchExtratos(contaSelecionada)
      await fetchConciliacoes(contaSelecionada)
    } catch (error: any) {
      showError(`Erro ao desvincular: ${error.message}`)
    }
  }

  const sugestaoAutomatica = async () => {
    if (!contaInfo) return

    try {
      let matches = 0
      const extratosPendentes = extratos.filter(e => !e.conciliacao || e.conciliacao.status === 'PENDENTE')

      for (const extrato of extratosPendentes) {
        // Buscar match em lançamentos
        const lancMatch = lancamentos.find(l => {
          const valorMatch = Math.abs(Math.abs(l.valor_liquido) - Math.abs(extrato.valor)) < 0.01
          const dataMatch = l.data_liquidacao === extrato.data_lancamento
          const tipoMatch = (extrato.valor > 0 && l.tipo === 'Entrada') || (extrato.valor < 0 && l.tipo === 'Saida')
          return valorMatch && dataMatch && tipoMatch
        })

        if (lancMatch) {
          const { error } = await supabase
            .from('conciliacoes')
            .insert({
              org_id: contaInfo.org_id,
              banco_conta_id: contaSelecionada,
              extrato_id: extrato.id,
              lancamento_id: lancMatch.id,
              status: 'CONCILIADO'
            })

          if (!error) matches++
          continue
        }

        // Buscar match em movimentos
        const movMatch = movimentos.find(m => {
          const valorMatch = Math.abs(Math.abs(m.valor) - Math.abs(extrato.valor)) < 0.01
          const dataMatch = m.data_movimento === extrato.data_lancamento
          return valorMatch && dataMatch
        })

        if (movMatch) {
          const { error } = await supabase
            .from('conciliacoes')
            .insert({
              org_id: contaInfo.org_id,
              banco_conta_id: contaSelecionada,
              extrato_id: extrato.id,
              movimento_id: movMatch.id,
              status: 'CONCILIADO'
            })

          if (!error) matches++
        }
      }

      showToast(`Sugestão automática: ${matches} conciliação(ões) realizada(s)`, 'success')
      await fetchExtratos(contaSelecionada)
      await fetchConciliacoes(contaSelecionada)
    } catch (error: any) {
      showError(`Erro na sugestão: ${error.message}`)
    }
  }

  const ignorarExtrato = async (extrato: ExtratoBancario) => {
    if (!contaInfo) return

    try {
      if (extrato.conciliacao) {
        await supabase
          .from('conciliacoes')
          .update({ status: 'IGNORADO' })
          .eq('id', extrato.conciliacao.id)
      } else {
        await supabase
          .from('conciliacoes')
          .insert({
            org_id: contaInfo.org_id,
            banco_conta_id: contaSelecionada,
            extrato_id: extrato.id,
            status: 'IGNORADO'
          })
      }

      showToast('Transação marcada como ignorada', 'success')
      await fetchExtratos(contaSelecionada)
    } catch (error: any) {
      showError(`Erro ao ignorar: ${error.message}`)
    }
  }

  // ==================== COMPUTED VALUES ====================

  const extratosFiltrados = extratos.filter(e => {
    const status = e.conciliacao?.status || 'PENDENTE'
    
    if (!mostrarConciliados && status === 'CONCILIADO') return false
    if (filtroStatusExtrato && filtroStatusExtrato !== 'TODOS' && status !== filtroStatusExtrato) return false
    
    if (searchTermExtrato) {
      const termo = searchTermExtrato.toLowerCase()
      return e.historico?.toLowerCase().includes(termo) ||
             e.documento_ref?.toLowerCase().includes(termo)
    }
    return true
  })

  // Combinar lançamentos e movimentos
  const lancamentosEMovimentos: LancamentoOuMovimento[] = [
    ...lancamentos,
    ...movimentos
  ].sort((a, b) => {
    const dataA = 'data_liquidacao' in a ? a.data_liquidacao : a.data_movimento
    const dataB = 'data_liquidacao' in b ? b.data_liquidacao : b.data_movimento
    return (dataB || '').localeCompare(dataA || '')
  })

  const lancamentosFiltrados = lancamentosEMovimentos.filter(item => {
    if (searchTermConta) {
      const termo = searchTermConta.toLowerCase()
      if ('contraparte_nome' in item) {
        return item.contraparte_nome?.toLowerCase().includes(termo) ||
               item.documento_numero?.toLowerCase().includes(termo)
      } else {
        return item.historico?.toLowerCase().includes(termo)
      }
    }
    return true
  })

  const estatisticas = {
    total: extratos.length,
    conciliados: extratos.filter(e => e.conciliacao?.status === 'CONCILIADO').length,
    pendentes: extratos.filter(e => !e.conciliacao || e.conciliacao.status === 'PENDENTE').length,
    ignorados: extratos.filter(e => e.conciliacao?.status === 'IGNORADO').length
  }

  const totalExtratosSelecionados = extratosSelecionados.reduce((acc, id) => {
    const extrato = extratos.find(e => e.id === id)
    return acc + (extrato?.valor || 0)
  }, 0)

  const totalLancamentosSelecionados = lancamentosSelecionados.reduce((acc, chave) => {
    const [origem, id] = chave.split(':')
    if (origem === 'LANCAMENTO') {
      const lanc = lancamentos.find(l => l.id === id)
      return acc + (lanc?.valor_liquido || 0)
    } else {
      const mov = movimentos.find(m => m.id === id)
      return acc + (mov?.valor || 0)
    }
  }, 0)

  const diferenca = Math.abs(totalExtratosSelecionados) - Math.abs(totalLancamentosSelecionados)

  // ==================== RENDER ====================

  return (
    <div style={{ padding: '16px', backgroundColor: '#f1f5f9', minHeight: '100vh' }}>
      {/* Cabeçalho */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
              Conciliação Bancária
            </h1>
            {contaInfo && (
              <p style={{ fontSize: '13px', color: '#64748b' }}>
                {contaInfo.banco_nome} - AG: {contaInfo.agencia} / CC: {contaInfo.numero_conta}
              </p>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                fetchExtratos(contaSelecionada)
                fetchLancamentos(contaSelecionada)
                fetchMovimentos(contaSelecionada)
              }}
              disabled={!contaSelecionada}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                backgroundColor: '#f1f5f9',
                color: '#475569',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: contaSelecionada ? 'pointer' : 'not-allowed',
                opacity: contaSelecionada ? 1 : 0.5
              }}
            >
              <RefreshCw size={14} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Seleção de Empresa e Conta */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
              Empresa
            </label>
            <select
              value={empresaSelecionada}
              onChange={(e) => setEmpresaSelecionada(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '13px'
              }}
            >
              <option value="">Selecione...</option>
              {empresas.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
              Conta Bancária
            </label>
            <select
              value={contaSelecionada}
              onChange={(e) => setContaSelecionada(e.target.value)}
              disabled={!empresaSelecionada}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '13px'
              }}
            >
              <option value="">Selecione...</option>
              {bancosContas.map(conta => (
                <option key={conta.id} value={conta.id}>
                  {conta.banco_nome} - {conta.numero_conta} ({conta.tipo_conta})
                </option>
              ))}
            </select>
          </div>

          {/* Upload OFX */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
              Importar OFX
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${isDragging ? '#1555D6' : '#e5e7eb'}`,
                borderRadius: '6px',
                padding: '8px',
                textAlign: 'center',
                backgroundColor: isDragging ? '#eff6ff' : 'white',
                cursor: contaSelecionada ? 'pointer' : 'not-allowed',
                opacity: contaSelecionada ? 1 : 0.5
              }}
              onClick={() => contaSelecionada && document.getElementById('file-input')?.click()}
            >
              <input
                id="file-input"
                type="file"
                accept=".ofx"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {arquivoNome || 'Arraste .OFX ou clique'}
              </span>
            </div>
          </div>
        </div>

        {/* Preview OFX */}
        {dadosOFX && (
          <div style={{
            marginTop: '12px',
            padding: '12px',
            backgroundColor: '#f0fdf4',
            borderRadius: '6px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ fontSize: '13px', color: '#166534' }}>
              <strong>{dadosOFX.transacoes.length}</strong> transações encontradas | 
              Período: {formatDateBR(dadosOFX.dataInicio)} a {formatDateBR(dadosOFX.dataFim)} | 
              Saldo: {formatCurrency(dadosOFX.saldoFinal)}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { setDadosOFX(null); setArquivoNome('') }}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={importarOFX}
                disabled={importando}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#166534',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                {importando ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Área de Conciliação - Duas Colunas */}
      {contaSelecionada && (
        <>
          {/* Barra de Ações */}
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '8px 8px 0 0',
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={vincular}
                disabled={extratosSelecionados.length === 0 || lancamentosSelecionados.length === 0}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  backgroundColor: '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: extratosSelecionados.length > 0 && lancamentosSelecionados.length > 0 ? 'pointer' : 'not-allowed',
                  opacity: extratosSelecionados.length > 0 && lancamentosSelecionados.length > 0 ? 1 : 0.5
                }}
              >
                <Link2 size={14} />
                Vincular
              </button>
              <button
                onClick={desvincularTodos}
                disabled={conciliacoes.length === 0}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: conciliacoes.length > 0 ? 'pointer' : 'not-allowed',
                  opacity: conciliacoes.length > 0 ? 1 : 0.5
                }}
              >
                <Link2Off size={14} />
                Desvincular Todos
              </button>
              <button
                onClick={sugestaoAutomatica}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  backgroundColor: '#eab308',
                  color: '#1e293b',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                <Lightbulb size={14} />
                Sugestão
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'white', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={mostrarConciliados}
                  onChange={(e) => setMostrarConciliados(e.target.checked)}
                />
                Visualizar Conciliados
              </label>
            </div>
          </div>

          {/* Grid de Duas Colunas */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0',
            backgroundColor: 'white',
            borderRadius: '0 0 8px 8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}>
            {/* Coluna Esquerda - Lançamentos do Arquivo (Extrato) */}
            <div style={{ borderRight: '2px solid #e2e8f0' }}>
              <div style={{
                backgroundColor: '#f8fafc',
                padding: '10px 12px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileSpreadsheet size={16} />
                  Lançamentos do Arquivo (Extrato)
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  {estatisticas.pendentes} pendentes
                </span>
              </div>

              {/* Filtro */}
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={searchTermExtrato}
                  onChange={(e) => setSearchTermExtrato(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                />
              </div>

              {/* Lista de Extratos */}
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ backgroundColor: '#f8fafc', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', width: '30px' }}>
                        <input
                          type="checkbox"
                          checked={extratosSelecionados.length > 0 && extratosSelecionados.length === extratosFiltrados.filter(e => !e.conciliacao || e.conciliacao.status === 'PENDENTE').length}
                          onChange={selecionarTodosExtratos}
                        />
                      </th>
                      <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Data</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Documento</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Histórico</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extratosFiltrados.map(extrato => {
                      const status = extrato.conciliacao?.status || 'PENDENTE'
                      const isSelected = extratosSelecionados.includes(extrato.id)
                      const isConciliado = status === 'CONCILIADO'
                      
                      return (
                        <tr
                          key={extrato.id}
                          style={{
                            backgroundColor: isSelected ? '#dbeafe' : isConciliado ? '#f0fdf4' : 'white',
                            cursor: isConciliado ? 'default' : 'pointer'
                          }}
                          onClick={() => !isConciliado && toggleExtratoSelecionado(extrato.id)}
                        >
                          <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                            {!isConciliado && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation()
                                  toggleExtratoSelecionado(extrato.id)
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            )}
                            {isConciliado && <CheckCircle2 size={14} color="#16a34a" />}
                          </td>
                          <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9' }}>
                            {formatDateBR(extrato.data_lancamento)}
                          </td>
                          <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {extrato.documento_ref || '-'}
                          </td>
                          <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {extrato.historico || '-'}
                          </td>
                          <td style={{
                            padding: '6px',
                            borderBottom: '1px solid #f1f5f9',
                            textAlign: 'right',
                            fontWeight: '600',
                            color: extrato.valor >= 0 ? '#16a34a' : '#dc2626'
                          }}>
                            {formatCurrencySimple(extrato.valor)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totalizador */}
              <div style={{
                padding: '10px 12px',
                backgroundColor: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                Lançamentos Selecionados: {formatCurrency(totalExtratosSelecionados)}
              </div>
            </div>

            {/* Coluna Direita - Lançamentos da Conta */}
            <div>
              <div style={{
                backgroundColor: '#f8fafc',
                padding: '10px 12px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CreditCard size={16} />
                  Lançamentos da Conta
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  {lancamentos.length} lanç. + {movimentos.length} transf.
                </span>
              </div>

              {/* Filtro */}
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={searchTermConta}
                  onChange={(e) => setSearchTermConta(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}
                />
              </div>

              {/* Lista de Lançamentos e Movimentos */}
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ backgroundColor: '#f8fafc', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', width: '30px' }}>
                        <input
                          type="checkbox"
                          checked={lancamentosSelecionados.length > 0 && lancamentosSelecionados.length === lancamentosFiltrados.length}
                          onChange={selecionarTodosLancamentos}
                        />
                      </th>
                      <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Data</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Documento</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Histórico</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Valor</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>Origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lancamentosFiltrados.map(item => {
                      const isLancamento = 'contraparte_nome' in item
                      const chave = `${item.origem}:${item.id}`
                      const isSelected = lancamentosSelecionados.includes(chave)
                      const data = isLancamento ? (item as Lancamento).data_liquidacao : (item as MovimentoBancario).data_movimento
                      const valor = isLancamento ? (item as Lancamento).valor_liquido : (item as MovimentoBancario).valor
                      const historico = isLancamento 
                        ? (item as Lancamento).contraparte_nome 
                        : (item as MovimentoBancario).historico || (item as MovimentoBancario).conta_destino_nome
                      const documento = isLancamento ? (item as Lancamento).documento_numero : '-'
                      
                      return (
                        <tr
                          key={chave}
                          style={{
                            backgroundColor: isSelected ? '#dbeafe' : 'white',
                            cursor: 'pointer'
                          }}
                          onClick={() => toggleLancamentoSelecionado(item.id, item.origem)}
                        >
                          <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                e.stopPropagation()
                                toggleLancamentoSelecionado(item.id, item.origem)
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9' }}>
                            {formatDateBR(data)}
                          </td>
                          <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9' }}>
                            {documento || '-'}
                          </td>
                          <td style={{ padding: '6px', borderBottom: '1px solid #f1f5f9', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {historico || '-'}
                          </td>
                          <td style={{
                            padding: '6px',
                            borderBottom: '1px solid #f1f5f9',
                            textAlign: 'right',
                            fontWeight: '600',
                            color: valor >= 0 ? '#16a34a' : '#dc2626'
                          }}>
                            {formatCurrencySimple(valor)}
                          </td>
                          <td style={{ padding: '6px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                            <span 
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isLancamento) {
                                  setLancamentoParaEditar(item as Lancamento)
                                  setShowEditarLancamentoModal(true)
                                }
                              }}
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: '600',
                                backgroundColor: isLancamento ? '#dbeafe' : '#fef3c7',
                                color: isLancamento ? '#1e40af' : '#92400e',
                                cursor: isLancamento ? 'pointer' : 'default'
                              }}
                            >
                              {isLancamento ? 'Lanç.' : 'Transf.'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totalizador */}
              <div style={{
                padding: '10px 12px',
                backgroundColor: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                Lançamentos Selecionados: {formatCurrency(totalLancamentosSelecionados)}
              </div>
            </div>
          </div>

          {/* Área de Diferença */}
          <div style={{
            backgroundColor: diferenca === 0 ? '#f0fdf4' : '#fef2f2',
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            marginTop: '-1px'
          }}>
            <span style={{
              fontSize: '13px',
              fontWeight: '600',
              color: diferenca === 0 ? '#166534' : '#991b1b'
            }}>
              Diferença: {formatCurrency(diferenca)}
            </span>
            {diferenca === 0 && extratosSelecionados.length > 0 && (
              <CheckCircle2 size={16} color="#16a34a" />
            )}
          </div>

          {/* Seção de Conciliações Realizadas */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            marginTop: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>
                Conciliações Realizadas ({conciliacoes.length})
              </h3>
            </div>

            {conciliacoes.length > 0 ? (
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ backgroundColor: '#f8fafc' }}>
                    <tr>
                      <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Data Extrato</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Histórico Extrato</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Valor</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '1px solid #e2e8f0' }}>Tipo</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', width: '80px' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conciliacoes.map(conc => {
                      const extrato = extratos.find(e => e.id === conc.extrato_id)
                      const tipo = conc.lancamento_id ? 'Lançamento' : conc.movimento_id ? 'Transferência' : '-'
                      const lancamentoRelacionado = conc.lancamento_id ? lancamentos.find(l => l.id === conc.lancamento_id) : null
                      
                      return (
                        <tr key={conc.id}>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                            {formatDateBR(extrato?.data_lancamento || null)}
                          </td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                            {extrato?.historico || '-'}
                          </td>
                          <td style={{
                            padding: '8px 12px',
                            borderBottom: '1px solid #f1f5f9',
                            textAlign: 'right',
                            fontWeight: '600',
                            color: (extrato?.valor || 0) >= 0 ? '#16a34a' : '#dc2626'
                          }}>
                            {formatCurrency(extrato?.valor || 0)}
                          </td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                            <span 
                              onClick={() => {
                                if (lancamentoRelacionado) {
                                  setLancamentoParaEditar(lancamentoRelacionado)
                                  setShowEditarLancamentoModal(true)
                                }
                              }}
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                backgroundColor: tipo === 'Lançamento' ? '#dbeafe' : '#fef3c7',
                                color: tipo === 'Lançamento' ? '#1e40af' : '#92400e',
                                cursor: lancamentoRelacionado ? 'pointer' : 'default'
                              }}
                            >
                              {tipo}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                            <button
                              onClick={() => desvincular(conc.id)}
                              style={{
                                padding: '4px 8px',
                                backgroundColor: '#fee2e2',
                                color: '#991b1b',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '11px',
                                cursor: 'pointer'
                              }}
                            >
                              Desvincular
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                Nenhuma conciliação realizada ainda
              </div>
            )}
          </div>
        </>
      )}

      {/* Toast */}
      {toast.show && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: toast.type === 'success' ? '#166534' : toast.type === 'error' ? '#991b1b' : '#92400e',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '14px'
        }}>
          {toast.type === 'success' && <CheckCircle2 size={18} />}
          {toast.type === 'error' && <XCircle size={18} />}
          {toast.type === 'warning' && <AlertCircle size={18} />}
          {toast.message}
        </div>
      )}

      {/* Modal de Erro */}
      {showErrorModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <XCircle size={24} color="#dc2626" />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>Erro</h3>
            </div>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>{errorMessage}</p>
            <button
              onClick={() => setShowErrorModal(false)}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#1555D6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal de Edição de Lançamento */}
      {showEditarLancamentoModal && lancamentoParaEditar && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                Detalhes do Lançamento
              </h3>
              <button
                onClick={() => {
                  setShowEditarLancamentoModal(false)
                  setLancamentoParaEditar(null)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} color="#64748b" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
                    Tipo
                  </label>
                  <div style={{
                    padding: '10px 12px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: '#1e293b'
                  }}>
                    {lancamentoParaEditar.tipo}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
                    Status
                  </label>
                  <div style={{
                    padding: '10px 12px',
                    backgroundColor: lancamentoParaEditar.tipo === 'Entrada' ? '#dcfce7' : '#fee2e2',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: lancamentoParaEditar.tipo === 'Entrada' ? '#166534' : '#991b1b'
                  }}>
                    {lancamentoParaEditar.tipo === 'Entrada' ? 'RECEBIDO' : 'PAGO'}
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
                  Contraparte
                </label>
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                  fontSize: '14px',
                  color: '#1e293b'
                }}>
                  {lancamentoParaEditar.contraparte_nome || '-'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
                    Data Vencimento
                  </label>
                  <div style={{
                    padding: '10px 12px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: '#1e293b'
                  }}>
                    {formatDateBR(lancamentoParaEditar.data_vencimento)}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
                    Data Liquidação
                  </label>
                  <div style={{
                    padding: '10px 12px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: '#1e293b'
                  }}>
                    {formatDateBR(lancamentoParaEditar.data_liquidacao)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
                    Documento
                  </label>
                  <div style={{
                    padding: '10px 12px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: '#1e293b'
                  }}>
                    {lancamentoParaEditar.documento_numero || '-'}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>
                    Valor Líquido
                  </label>
                  <div style={{
                    padding: '10px 12px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: lancamentoParaEditar.valor_liquido >= 0 ? '#16a34a' : '#dc2626'
                  }}>
                    {formatCurrency(lancamentoParaEditar.valor_liquido)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  onClick={() => {
                    // Abrir página de lançamentos com o ID
                    window.open(`/lancamentos?id=${lancamentoParaEditar.id}`, '_blank')
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#1555D6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Eye size={16} />
                  Abrir Lançamento
                </button>
                <button
                  onClick={() => {
                    setShowEditarLancamentoModal(false)
                    setLancamentoParaEditar(null)
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}