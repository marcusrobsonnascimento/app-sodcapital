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
  ArrowRightLeft
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
  // Dados da conciliação (join)
  conciliacao?: {
    id: string
    status: string
    lancamento_id: string | null
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
    // Extrair dados do banco
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

    // Extrair transações
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

    return {
      banco,
      conta,
      dataInicio,
      dataFim,
      saldoFinal,
      transacoes
    }
  } catch (error) {
    console.error('Erro ao parsear OFX:', error)
    return null
  }
}

const formatarDataOFX = (data: string): string => {
  // Converte 20251110 para 2025-11-10
  return `${data.substring(0, 4)}-${data.substring(4, 6)}-${data.substring(6, 8)}`
}

// ==================== FORMATTERS ====================

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
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
    '356': 'Banco Real',
    '389': 'Banco Mercantil',
    '399': 'HSBC',
    '422': 'Safra',
    '453': 'Banco Rural',
    '633': 'Rendimento',
    '652': 'Itaú Unibanco',
    '745': 'Citibank',
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
  const [filtroStatus, setFiltroStatus] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  
  // Modal de vinculação manual
  const [showVincularModal, setShowVincularModal] = useState(false)
  const [extratoSelecionado, setExtratoSelecionado] = useState<ExtratoBancario | null>(null)
  const [lancamentosFiltradosModal, setLancamentosFiltradosModal] = useState<Lancamento[]>([])
  
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
        .eq('tipo_conta', 'CC')
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

  const fetchExtratos = async (bancoContaId: string) => {
    try {
      setLoading(true)
      
      // Buscar extratos com conciliações relacionadas
      const { data: extratosData, error: extratosError } = await supabase
        .from('extratos_bancarios')
        .select('*')
        .eq('banco_conta_id', bancoContaId)
        .order('data_lancamento', { ascending: false })
      
      if (extratosError) throw extratosError

      // Buscar conciliações para esses extratos
      const extratosIds = (extratosData || []).map(e => e.id)
      
      let conciliacoesMap = new Map()
      if (extratosIds.length > 0) {
        const { data: conciliacoesData } = await supabase
          .from('conciliacoes')
          .select('*')
          .in('extrato_id', extratosIds)
        
        conciliacoesData?.forEach(c => {
          conciliacoesMap.set(c.extrato_id, c)
        })
      }

      // Combinar dados
      const extratosComConciliacao = (extratosData || []).map(e => ({
        ...e,
        conciliacao: conciliacoesMap.get(e.id) || null
      }))

      setExtratos(extratosComConciliacao)
    } catch (error) {
      console.error('Erro ao carregar extratos:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchLancamentos = async (bancoContaId: string, dataInicio?: string, dataFim?: string) => {
    try {
      let query = supabase
        .from('lancamentos')
        .select(`
          id,
          tipo,
          valor_liquido,
          data_vencimento,
          data_liquidacao,
          status,
          contrapartes(nome)
        `)
        .eq('banco_conta_id', bancoContaId)
        .order('data_vencimento', { ascending: false })
      
      if (dataInicio) {
        query = query.gte('data_vencimento', dataInicio)
      }
      if (dataFim) {
        query = query.lte('data_vencimento', dataFim)
      }
      
      const { data, error } = await query
      
      if (error) throw error
      
      const formatted = (data || []).map((item: any) => ({
        id: item.id,
        tipo: item.tipo,
        valor_liquido: item.valor_liquido,
        data_vencimento: item.data_vencimento,
        data_liquidacao: item.data_liquidacao,
        status: item.status,
        contraparte_nome: Array.isArray(item.contrapartes) 
          ? item.contrapartes[0]?.nome 
          : item.contrapartes?.nome || ''
      }))
      
      setLancamentos(formatted)
    } catch (error) {
      console.error('Erro ao carregar lançamentos:', error)
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
    }
  }, [empresaSelecionada])

  useEffect(() => {
    if (contaSelecionada) {
      const conta = bancosContas.find(c => c.id === contaSelecionada)
      setContaInfo(conta || null)
      fetchExtratos(contaSelecionada)
      fetchLancamentos(contaSelecionada)
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
        showError('Não foi possível ler o arquivo OFX. Verifique se o formato está correto.')
        return
      }

      if (dados.transacoes.length === 0) {
        showError('Nenhuma transação encontrada no arquivo OFX.')
        return
      }

      setDadosOFX(dados)
      
      // Buscar lançamentos no período do OFX para conciliação
      await fetchLancamentos(contaSelecionada, dados.dataInicio, dados.dataFim)
      
      showToast(`Arquivo processado com sucesso! ${dados.transacoes.length} transações encontradas.`, 'success')
    } catch (error) {
      console.error('Erro ao processar arquivo:', error)
      showError('Erro ao processar o arquivo. Tente novamente.')
    } finally {
      setProcessando(false)
    }
  }

  const importarTransacoes = async () => {
    if (!dadosOFX || !contaSelecionada || !contaInfo) return

    setImportando(true)

    try {
      const orgId = contaInfo.org_id

      // Preparar transações para inserção na tabela extratos_bancarios
      const extratosParaInserir = dadosOFX.transacoes.map(t => ({
        org_id: orgId,
        banco_conta_id: contaSelecionada,
        data_lancamento: t.data,
        historico: t.memo,
        valor: t.valor, // Positivo para crédito, negativo para débito (já vem do OFX)
        documento_ref: t.fitid
      }))

      // Inserir extratos (ignorar duplicatas pelo documento_ref)
      for (const extrato of extratosParaInserir) {
        // Verificar se já existe
        const { data: existente } = await supabase
          .from('extratos_bancarios')
          .select('id')
          .eq('banco_conta_id', extrato.banco_conta_id)
          .eq('documento_ref', extrato.documento_ref)
          .single()

        if (!existente) {
          const { error } = await supabase
            .from('extratos_bancarios')
            .insert(extrato)
          
          if (error) {
            console.error('Erro ao inserir extrato:', error)
          }
        }
      }

      // Executar conciliação automática
      await conciliacaoAutomatica()

      // Recarregar extratos
      await fetchExtratos(contaSelecionada)

      showToast('Transações importadas e conciliação automática realizada!', 'success')
      setDadosOFX(null)
      setArquivoNome('')
    } catch (error: any) {
      console.error('Erro ao importar:', error)
      showError(`Erro ao importar transações: ${error.message}`)
    } finally {
      setImportando(false)
    }
  }

  const conciliacaoAutomatica = async () => {
    if (!contaSelecionada || !contaInfo) return

    try {
      // Buscar extratos sem conciliação
      const { data: extratosData } = await supabase
        .from('extratos_bancarios')
        .select('*')
        .eq('banco_conta_id', contaSelecionada)

      if (!extratosData || extratosData.length === 0) return

      // Buscar conciliações existentes
      const { data: conciliacoesExistentes } = await supabase
        .from('conciliacoes')
        .select('extrato_id')
        .eq('banco_conta_id', contaSelecionada)

      const extratosJaConciliados = new Set((conciliacoesExistentes || []).map(c => c.extrato_id))

      // Filtrar apenas extratos não conciliados
      const extratosPendentes = extratosData.filter(e => !extratosJaConciliados.has(e.id))

      if (extratosPendentes.length === 0) return

      // Buscar lançamentos liquidados da conta
      const { data: lancamentosData } = await supabase
        .from('lancamentos')
        .select('id, tipo, valor_liquido, data_liquidacao, data_vencimento')
        .eq('banco_conta_id', contaSelecionada)
        .eq('status', 'PAGO_RECEBIDO')

      if (!lancamentosData) return

      // Para cada extrato pendente, tentar encontrar match
      for (const extrato of extratosPendentes) {
        const valorExtrato = Math.abs(extrato.valor)
        const isCredito = extrato.valor > 0

        // Buscar lançamento com mesmo valor e data
        const matchExato = lancamentosData.find(l => {
          const valorLanc = Math.abs(l.valor_liquido)
          const tipoMatch = (isCredito && l.tipo === 'Entrada') || (!isCredito && l.tipo === 'Saida')
          const dataMatch = l.data_liquidacao === extrato.data_lancamento || 
                           l.data_vencimento === extrato.data_lancamento
          return Math.abs(valorLanc - valorExtrato) < 0.01 && tipoMatch && dataMatch
        })

        if (matchExato) {
          // Criar conciliação
          await supabase
            .from('conciliacoes')
            .insert({
              org_id: contaInfo.org_id,
              banco_conta_id: contaSelecionada,
              extrato_id: extrato.id,
              lancamento_id: matchExato.id,
              status: 'CONCILIADO'
            })
          continue
        }

        // Tentar match por valor com data ±3 dias
        const dataExtrato = new Date(extrato.data_lancamento)
        const matchAproximado = lancamentosData.find(l => {
          const valorLanc = Math.abs(l.valor_liquido)
          const tipoMatch = (isCredito && l.tipo === 'Entrada') || (!isCredito && l.tipo === 'Saida')
          
          const dataLanc = new Date(l.data_liquidacao || l.data_vencimento)
          const diffDias = Math.abs((dataExtrato.getTime() - dataLanc.getTime()) / (1000 * 60 * 60 * 24))
          
          return Math.abs(valorLanc - valorExtrato) < 0.01 && tipoMatch && diffDias <= 3
        })

        if (matchAproximado) {
          await supabase
            .from('conciliacoes')
            .insert({
              org_id: contaInfo.org_id,
              banco_conta_id: contaSelecionada,
              extrato_id: extrato.id,
              lancamento_id: matchAproximado.id,
              status: 'CONCILIADO'
            })
        }
      }
    } catch (error) {
      console.error('Erro na conciliação automática:', error)
    }
  }

  const abrirModalVincular = (extrato: ExtratoBancario) => {
    setExtratoSelecionado(extrato)
    
    // Filtrar lançamentos compatíveis (mesmo tipo)
    const isCredito = extrato.valor > 0
    const tipoEsperado = isCredito ? 'Entrada' : 'Saida'
    const filtrados = lancamentos.filter(l => l.tipo === tipoEsperado)
    setLancamentosFiltradosModal(filtrados)
    
    setShowVincularModal(true)
  }

  const vincularManualmente = async (lancamento: Lancamento) => {
    if (!extratoSelecionado || !contaInfo) return

    try {
      // Verificar se já existe conciliação para este extrato
      const { data: existente } = await supabase
        .from('conciliacoes')
        .select('id')
        .eq('extrato_id', extratoSelecionado.id)
        .single()

      if (existente) {
        // Atualizar
        const { error } = await supabase
          .from('conciliacoes')
          .update({
            lancamento_id: lancamento.id,
            status: 'CONCILIADO'
          })
          .eq('id', existente.id)

        if (error) throw error
      } else {
        // Inserir nova
        const { error } = await supabase
          .from('conciliacoes')
          .insert({
            org_id: contaInfo.org_id,
            banco_conta_id: contaSelecionada,
            extrato_id: extratoSelecionado.id,
            lancamento_id: lancamento.id,
            status: 'CONCILIADO'
          })

        if (error) throw error
      }

      showToast('Transação vinculada com sucesso!', 'success')
      setShowVincularModal(false)
      await fetchExtratos(contaSelecionada)
    } catch (error: any) {
      showError(`Erro ao vincular: ${error.message}`)
    }
  }

  const ignorarTransacao = async (extrato: ExtratoBancario) => {
    if (!contaInfo) return

    try {
      // Verificar se já existe conciliação
      const { data: existente } = await supabase
        .from('conciliacoes')
        .select('id')
        .eq('extrato_id', extrato.id)
        .single()

      if (existente) {
        const { error } = await supabase
          .from('conciliacoes')
          .update({ status: 'IGNORADO', lancamento_id: null })
          .eq('id', existente.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('conciliacoes')
          .insert({
            org_id: contaInfo.org_id,
            banco_conta_id: contaSelecionada,
            extrato_id: extrato.id,
            lancamento_id: null,
            status: 'IGNORADO'
          })

        if (error) throw error
      }

      showToast('Transação marcada como ignorada', 'success')
      await fetchExtratos(contaSelecionada)
    } catch (error: any) {
      showError(`Erro ao ignorar: ${error.message}`)
    }
  }

  const desfazerConciliacao = async (extrato: ExtratoBancario) => {
    if (!extrato.conciliacao) return

    try {
      const { error } = await supabase
        .from('conciliacoes')
        .delete()
        .eq('id', extrato.conciliacao.id)

      if (error) throw error

      showToast('Conciliação desfeita', 'success')
      await fetchExtratos(contaSelecionada)
    } catch (error: any) {
      showError(`Erro ao desfazer: ${error.message}`)
    }
  }

  // ==================== COMPUTED VALUES ====================

  const extratosFiltrados = extratos.filter(e => {
    // Determinar status do extrato
    const status = e.conciliacao?.status || 'PENDENTE'
    
    if (filtroStatus && status !== filtroStatus) return false
    if (searchTerm) {
      const termo = searchTerm.toLowerCase()
      return e.historico?.toLowerCase().includes(termo) ||
             e.documento_ref?.toLowerCase().includes(termo)
    }
    return true
  })

  const estatisticas = {
    total: extratos.length,
    conciliados: extratos.filter(e => e.conciliacao?.status === 'CONCILIADO').length,
    pendentes: extratos.filter(e => !e.conciliacao || e.conciliacao.status === 'PENDENTE').length,
    ignorados: extratos.filter(e => e.conciliacao?.status === 'IGNORADO').length,
    divergentes: extratos.filter(e => e.conciliacao?.status === 'DIVERGENTE').length
  }

  const getStatusInfo = (extrato: ExtratoBancario) => {
    const status = extrato.conciliacao?.status || 'PENDENTE'
    switch (status) {
      case 'CONCILIADO':
        return { bg: '#dcfce7', color: '#166534', icon: CheckCircle2, label: 'Conciliado' }
      case 'PENDENTE':
        return { bg: '#fef3c7', color: '#92400e', icon: Clock, label: 'Pendente' }
      case 'IGNORADO':
        return { bg: '#f3f4f6', color: '#6b7280', icon: Ban, label: 'Ignorado' }
      case 'DIVERGENTE':
        return { bg: '#fee2e2', color: '#991b1b', icon: AlertCircle, label: 'Divergente' }
      default:
        return { bg: '#f3f4f6', color: '#374151', icon: Clock, label: 'Pendente' }
    }
  }

  // ==================== RENDER ====================

  return (
    <div style={{ padding: '24px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      {/* Cabeçalho */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '4px' }}>
            Conciliação Bancária
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b' }}>
            Importe arquivos OFX e concilie com os lançamentos do sistema
          </p>
        </div>
        
        {extratos.length > 0 && (
          <button
            onClick={() => fetchExtratos(contaSelecionada)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              backgroundColor: '#1555D6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
        )}
      </div>

      {/* Seleção de Empresa e Conta */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
              Empresa *
            </label>
            <select
              value={empresaSelecionada}
              onChange={(e) => setEmpresaSelecionada(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              <option value="">Selecione uma empresa</option>
              {empresas.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
              Conta Bancária *
            </label>
            <select
              value={contaSelecionada}
              onChange={(e) => setContaSelecionada(e.target.value)}
              disabled={!empresaSelecionada}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: empresaSelecionada ? 'pointer' : 'not-allowed',
                backgroundColor: empresaSelecionada ? 'white' : '#f9fafb'
              }}
            >
              <option value="">Selecione uma conta</option>
              {bancosContas.map(conta => (
                <option key={conta.id} value={conta.id}>
                  {conta.banco_nome} - Ag: {conta.agencia} - CC: {conta.numero_conta}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Área de Upload */}
      {contaSelecionada && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '16px' }}>
            Importar Arquivo OFX
          </h2>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${isDragging ? '#1555D6' : '#d1d5db'}`,
              borderRadius: '12px',
              padding: '40px',
              textAlign: 'center',
              backgroundColor: isDragging ? '#eff6ff' : '#f9fafb',
              transition: 'all 0.2s',
              cursor: 'pointer'
            }}
            onClick={() => document.getElementById('fileInput')?.click()}
          >
            <input
              id="fileInput"
              type="file"
              accept=".ofx"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            
            {processando ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <RefreshCw size={40} style={{ color: '#1555D6', animation: 'spin 1s linear infinite' }} />
                <p style={{ fontSize: '14px', color: '#6b7280' }}>Processando arquivo...</p>
              </div>
            ) : dadosOFX ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <CheckCircle2 size={40} style={{ color: '#10b981' }} />
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>{arquivoNome}</p>
                <p style={{ fontSize: '13px', color: '#6b7280' }}>
                  {dadosOFX.transacoes.length} transações • {getNomeBanco(dadosOFX.banco)} • Conta: {dadosOFX.conta}
                </p>
                <p style={{ fontSize: '13px', color: '#6b7280' }}>
                  Período: {formatDateBR(dadosOFX.dataInicio)} a {formatDateBR(dadosOFX.dataFim)} • Saldo: {formatCurrency(dadosOFX.saldoFinal)}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <Upload size={40} style={{ color: '#9ca3af' }} />
                <p style={{ fontSize: '14px', color: '#6b7280' }}>
                  Arraste o arquivo OFX aqui ou <span style={{ color: '#1555D6', fontWeight: '600' }}>clique para selecionar</span>
                </p>
                <p style={{ fontSize: '12px', color: '#9ca3af' }}>
                  Formatos aceitos: .OFX (Open Financial Exchange)
                </p>
              </div>
            )}
          </div>

          {dadosOFX && (
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => { setDadosOFX(null); setArquivoNome('') }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#6b7280',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={importarTransacoes}
                disabled={importando}
                style={{
                  padding: '10px 20px',
                  backgroundColor: importando ? '#9ca3af' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: importando ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {importando ? (
                  <>
                    <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Importando...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Importar e Conciliar
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Estatísticas */}
      {extratos.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Total Importado</p>
            <p style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>{estatisticas.total}</p>
          </div>

          <div style={{
            backgroundColor: '#dcfce7',
            padding: '16px',
            borderRadius: '12px'
          }}>
            <p style={{ fontSize: '12px', color: '#166534', marginBottom: '4px' }}>Conciliados</p>
            <p style={{ fontSize: '24px', fontWeight: '700', color: '#166534' }}>{estatisticas.conciliados}</p>
          </div>

          <div style={{
            backgroundColor: '#fef3c7',
            padding: '16px',
            borderRadius: '12px'
          }}>
            <p style={{ fontSize: '12px', color: '#92400e', marginBottom: '4px' }}>Pendentes</p>
            <p style={{ fontSize: '24px', fontWeight: '700', color: '#92400e' }}>{estatisticas.pendentes}</p>
          </div>

          <div style={{
            backgroundColor: '#f3f4f6',
            padding: '16px',
            borderRadius: '12px'
          }}>
            <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Ignorados</p>
            <p style={{ fontSize: '24px', fontWeight: '700', color: '#6b7280' }}>{estatisticas.ignorados}</p>
          </div>

          <div style={{
            backgroundColor: '#fee2e2',
            padding: '16px',
            borderRadius: '12px'
          }}>
            <p style={{ fontSize: '12px', color: '#991b1b', marginBottom: '4px' }}>Divergentes</p>
            <p style={{ fontSize: '24px', fontWeight: '700', color: '#991b1b' }}>{estatisticas.divergentes}</p>
          </div>
        </div>
      )}

      {/* Filtros da Lista */}
      {extratos.length > 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          display: 'flex',
          gap: '16px',
          alignItems: 'center'
        }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="text"
              placeholder="Buscar por descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 40px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            />
          </div>

          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            style={{
              padding: '10px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer',
              minWidth: '160px'
            }}
          >
            <option value="">Todos os Status</option>
            <option value="CONCILIADO">Conciliados</option>
            <option value="PENDENTE">Pendentes</option>
            <option value="IGNORADO">Ignorados</option>
            <option value="DIVERGENTE">Divergentes</option>
          </select>
        </div>
      )}

      {/* Lista de Extratos/Conciliações */}
      {extratos.length > 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Data
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Descrição
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Tipo
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Valor
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Status
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {extratosFiltrados.map((extrato) => {
                const statusInfo = getStatusInfo(extrato)
                const StatusIcon = statusInfo.icon
                const isCredito = extrato.valor > 0
                const status = extrato.conciliacao?.status || 'PENDENTE'

                return (
                  <tr key={extrato.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151' }}>
                      {formatDateBR(extrato.data_lancamento)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: '#374151', maxWidth: '300px' }}>
                      {extrato.historico || '-'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '600',
                        backgroundColor: isCredito ? '#dcfce7' : '#fee2e2',
                        color: isCredito ? '#166534' : '#991b1b'
                      }}>
                        {isCredito ? 'Crédito' : 'Débito'}
                      </span>
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: isCredito ? '#166534' : '#991b1b',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatCurrency(Math.abs(extrato.valor))}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '600',
                        backgroundColor: statusInfo.bg,
                        color: statusInfo.color
                      }}>
                        <StatusIcon size={12} />
                        {statusInfo.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        {status === 'PENDENTE' && (
                          <>
                            <button
                              onClick={() => abrirModalVincular(extrato)}
                              title="Vincular manualmente"
                              style={{
                                padding: '6px 10px',
                                backgroundColor: '#1555D6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Link2 size={12} />
                              Vincular
                            </button>
                            <button
                              onClick={() => ignorarTransacao(extrato)}
                              title="Ignorar transação"
                              style={{
                                padding: '6px 10px',
                                backgroundColor: '#f3f4f6',
                                color: '#6b7280',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Ban size={12} />
                              Ignorar
                            </button>
                          </>
                        )}
                        {(status === 'CONCILIADO' || status === 'IGNORADO') && (
                          <button
                            onClick={() => desfazerConciliacao(extrato)}
                            title="Desfazer"
                            style={{
                              padding: '6px 10px',
                              backgroundColor: '#fef3c7',
                              color: '#92400e',
                              border: '1px solid #fcd34d',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <RefreshCw size={12} />
                            Desfazer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {extratosFiltrados.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
              Nenhuma transação encontrada com os filtros aplicados
            </div>
          )}
        </div>
      )}

      {/* Modal de Vinculação Manual */}
      {showVincularModal && extratoSelecionado && (
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
          onClick={() => setShowVincularModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              width: '90%',
              maxWidth: '800px',
              maxHeight: '80vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>
                Vincular Transação
              </h2>
              <button
                onClick={() => setShowVincularModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={24} style={{ color: '#6b7280' }} />
              </button>
            </div>

            {/* Dados da transação do extrato */}
            <div style={{
              backgroundColor: '#f8fafc',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Transação do Extrato Bancário</p>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                {extratoSelecionado.historico || 'Sem descrição'}
              </p>
              <div style={{ display: 'flex', gap: '24px' }}>
                <p style={{ fontSize: '13px', color: '#6b7280' }}>
                  Data: <strong>{formatDateBR(extratoSelecionado.data_lancamento)}</strong>
                </p>
                <p style={{ fontSize: '13px', color: extratoSelecionado.valor > 0 ? '#166534' : '#991b1b' }}>
                  Valor: <strong>{formatCurrency(Math.abs(extratoSelecionado.valor))}</strong>
                </p>
              </div>
            </div>

            {/* Lista de lançamentos para vincular */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                Selecione o lançamento do sistema para vincular:
              </p>
              
              {lancamentosFiltradosModal.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                  Nenhum lançamento compatível encontrado
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb' }}>
                      <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', color: '#6b7280' }}>Data Venc.</th>
                      <th style={{ padding: '10px', textAlign: 'left', fontSize: '11px', color: '#6b7280' }}>Contraparte</th>
                      <th style={{ padding: '10px', textAlign: 'right', fontSize: '11px', color: '#6b7280' }}>Valor</th>
                      <th style={{ padding: '10px', textAlign: 'center', fontSize: '11px', color: '#6b7280' }}>Status</th>
                      <th style={{ padding: '10px', textAlign: 'center', fontSize: '11px', color: '#6b7280' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lancamentosFiltradosModal.map((lanc) => (
                      <tr key={lanc.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px', fontSize: '13px' }}>{formatDateBR(lanc.data_vencimento)}</td>
                        <td style={{ padding: '10px', fontSize: '13px', maxWidth: '200px' }}>{lanc.contraparte_nome}</td>
                        <td style={{ padding: '10px', fontSize: '13px', textAlign: 'right', fontWeight: '600' }}>
                          {formatCurrency(lanc.valor_liquido)}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: '600',
                            backgroundColor: lanc.status === 'PAGO_RECEBIDO' ? '#dcfce7' : '#fef3c7',
                            color: lanc.status === 'PAGO_RECEBIDO' ? '#166534' : '#92400e'
                          }}>
                            {lanc.status === 'PAGO_RECEBIDO' ? 'Liquidado' : 'Aberto'}
                          </span>
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <button
                            onClick={() => vincularManualmente(lanc)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Check size={14} />
                            Vincular
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Erro */}
      {showErrorModal && (
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
          onClick={() => setShowErrorModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              overflow: 'hidden',
              width: '90%',
              maxWidth: '500px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ height: '4px', backgroundColor: '#f59e0b' }} />
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '24px' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: '#fef3c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <AlertCircle size={28} style={{ color: '#f59e0b' }} />
                </div>
                <p style={{ fontSize: '16px', lineHeight: '1.6', color: '#374151' }}>
                  {errorMessage}
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowErrorModal(false)}
                  style={{
                    padding: '10px 24px',
                    backgroundColor: '#f59e0b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.show && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          padding: '16px 24px',
          borderRadius: '8px',
          backgroundColor: toast.type === 'success' ? '#dcfce7' : toast.type === 'error' ? '#fee2e2' : '#fef3c7',
          color: toast.type === 'success' ? '#166534' : toast.type === 'error' ? '#991b1b' : '#92400e',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          zIndex: 9999
        }}>
          {toast.type === 'success' ? <CheckCircle2 size={20} /> : 
           toast.type === 'error' ? <XCircle size={20} /> : <AlertCircle size={20} />}
          <span style={{ fontWeight: '500' }}>{toast.message}</span>
        </div>
      )}

      {/* Estilos globais para animação */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `
      }} />
    </div>
  )
}