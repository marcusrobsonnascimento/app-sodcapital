'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDate } from '@/lib/utils'
import { Search, Receipt, Filter, Calendar, Building2, CheckCircle2, XCircle, AlertCircle, Download, RefreshCw, DollarSign, X } from 'lucide-react'

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

interface Contraparte {
  id: string
  nome: string
}

interface LancamentoPendente {
  id: string
  tipo: 'Entrada' | 'Saida'
  empresa_id: string
  empresa_nome: string
  projeto_nome: string | null
  contraparte_nome: string
  valor_bruto: number
  valor_liquido: number
  data_vencimento: string
  data_previsao_pagamento: string | null
  documento_tipo: string | null
  documento_numero: string | null
  pagamento_terceiro: boolean
  empresa_pagadora_nome: string | null
  dias_atraso: number
}

export default function BaixarPagamentosPage() {
  // Estados principais
  const [lancamentosPendentes, setLancamentosPendentes] = useState<LancamentoPendente[]>([])
  const [lancamentosSelecionados, setLancamentosSelecionados] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState(false)

  // Filtros
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [contrapartes, setContrapartes] = useState<Contraparte[]>([])
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [filtroContraparte, setFiltroContraparte] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'Todos' | 'Entrada' | 'Saida'>('Saida')
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  // Modal de liquidação
  const [showLiquidarModal, setShowLiquidarModal] = useState(false)
  const [dataLiquidacao, setDataLiquidacao] = useState('')

  // Modal de erro profissional
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // Toast
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)

  // Funções de Toast
  const showToast = (message: string, type: ToastType = 'success') => {
    const id = toastIdCounter
    setToastIdCounter(prev => prev + 1)
    setToasts(prev => [...prev, { id, message, type }])
    
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }, 5000)
  }

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  // Função para mostrar erro profissional
  const showError = (message: string) => {
    setErrorMessage(message)
    setShowErrorModal(true)
  }

  // Fetch functions
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

  const fetchContrapartes = async () => {
    try {
      const { data, error } = await supabase
        .from('contrapartes')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome')
      
      if (error) throw error
      setContrapartes(data || [])
    } catch (error) {
      console.error('Erro ao carregar contrapartes:', error)
    }
  }

  const calcularDiasAtraso = (dataVencimento: string): number => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const vencimento = new Date(dataVencimento)
    vencimento.setHours(0, 0, 0, 0)
    const diffTime = hoje.getTime() - vencimento.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : 0
  }

  const fetchLancamentosPendentes = async () => {
    try {
      setLoading(true)
      
      let query = supabase
        .from('lancamentos')
        .select(`
          id,
          tipo,
          empresa_id,
          valor_bruto,
          valor_liquido,
          data_vencimento,
          data_previsao_pagamento,
          documento_tipo,
          documento_numero,
          pagamento_terceiro,
          empresas!lancamentos_empresa_id_fkey(nome),
          empresa_pagadora:empresas!lancamentos_empresa_pagadora_id_fkey(nome),
          projeto:projetos!projeto_id(nome),
          contrapartes(nome)
        `)
        .eq('status', 'ABERTO')
        .order('data_vencimento', { ascending: true })

      // Aplicar filtros
      if (filtroEmpresa) {
        query = query.eq('empresa_id', filtroEmpresa)
      }
      if (filtroContraparte) {
        query = query.eq('contraparte_id', filtroContraparte)
      }
      if (filtroTipo !== 'Todos') {
        query = query.eq('tipo', filtroTipo)
      }
      if (filtroDataInicio) {
        query = query.gte('data_vencimento', filtroDataInicio)
      }
      if (filtroDataFim) {
        query = query.lte('data_vencimento', filtroDataFim)
      }

      const { data, error } = await query

      if (error) throw error

      const formattedData = (data || []).map((item: any) => ({
        id: item.id,
        tipo: item.tipo,
        empresa_id: item.empresa_id,
        empresa_nome: Array.isArray(item.empresas) ? item.empresas[0]?.nome : item.empresas?.nome,
        projeto_nome: item.projeto?.nome || null,
        contraparte_nome: Array.isArray(item.contrapartes) ? item.contrapartes[0]?.nome : item.contrapartes?.nome,
        valor_bruto: item.valor_bruto,
        valor_liquido: item.valor_liquido,
        data_vencimento: item.data_vencimento,
        data_previsao_pagamento: item.data_previsao_pagamento,
        documento_tipo: item.documento_tipo,
        documento_numero: item.documento_numero,
        pagamento_terceiro: item.pagamento_terceiro || false,
        empresa_pagadora_nome: Array.isArray(item.empresa_pagadora) ? item.empresa_pagadora[0]?.nome : item.empresa_pagadora?.nome,
        dias_atraso: calcularDiasAtraso(item.data_vencimento)
      }))

      setLancamentosPendentes(formattedData)
    } catch (error) {
      console.error('Erro ao carregar lançamentos pendentes:', error)
      showToast('Erro ao carregar lançamentos pendentes. Verifique sua conexão', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEmpresas()
    fetchContrapartes()
    fetchLancamentosPendentes()
  }, [])

  useEffect(() => {
    fetchLancamentosPendentes()
  }, [filtroEmpresa, filtroContraparte, filtroTipo, filtroDataInicio, filtroDataFim])

  // Funções de seleção
  const toggleSelecionarTodos = () => {
    if (lancamentosSelecionados.size === lancamentosFiltrados.length) {
      setLancamentosSelecionados(new Set())
    } else {
      setLancamentosSelecionados(new Set(lancamentosFiltrados.map(l => l.id)))
    }
  }

  const toggleSelecionarLancamento = (id: string) => {
    const newSet = new Set(lancamentosSelecionados)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setLancamentosSelecionados(newSet)
  }

  // Processar baixa
  const processarBaixa = async () => {
    if (lancamentosSelecionados.size === 0) {
      showToast('Selecione ao menos um lançamento', 'warning')
      return
    }

    if (!dataLiquidacao) {
      showToast('Informe a data de liquidação', 'warning')
      return
    }

    setProcessando(true)

    try {

      // 1. VALIDAR FECHAMENTO BANCÁRIO
      // Buscar todos os lançamentos selecionados com suas contas bancárias
      const lancamentosSelecionadosArray = Array.from(lancamentosSelecionados)
      const { data: lancamentosDataRaw, error: lancamentosError } = await supabase
        .from('lancamentos')
        .select(`
          id,
          tipo,
          empresa_id,
          banco_conta_id,
          contraparte_id,
          projeto_id,
          subprojeto_id,
          plano_conta_id,
          valor_liquido,
          pagamento_terceiro,
          empresa_pagadora_id,
          contrapartes(nome),
          projeto:projetos!projeto_id(nome),
          subprojeto:projetos!subprojeto_id(nome)
        `)
        .in('id', lancamentosSelecionadosArray)

      if (lancamentosError) {
        console.error('Erro ao buscar lançamentos:', lancamentosError)
        showError('Erro ao buscar dados dos lançamentos. Verifique sua conexão e tente novamente')
        return
      }

      if (!lancamentosDataRaw || lancamentosDataRaw.length === 0) {
        showToast('Nenhum lançamento encontrado para processar.', 'warning')
        return
      }

      // Forçar tipo any para evitar problemas de tipagem com relacionamentos Supabase
      const lancamentosData = lancamentosDataRaw as any[]

      // Buscar empresas beneficiárias e pagadoras (quando pagamento_terceiro = true)
      const empresasIdsSet = new Set<string>()
      lancamentosData.forEach((l: any) => {
        // Sempre adicionar empresa_id (empresa beneficiária quando pagamento_terceiro=true)
        if (l.empresa_id) {
          empresasIdsSet.add(l.empresa_id)
        }
        // Adicionar empresa_pagadora_id quando for pagamento por terceiro
        if (l.pagamento_terceiro && l.empresa_pagadora_id) {
          empresasIdsSet.add(l.empresa_pagadora_id)
        }
      })
      const empresasIds = Array.from(empresasIdsSet)
      
      const empresasMap = new Map<string, string>()
      if (empresasIds.length > 0) {
        const { data: empresasData } = await supabase
          .from('empresas')
          .select('id, nome')
          .in('id', empresasIds)
        
        empresasData?.forEach((e: any) => {
          empresasMap.set(e.id, e.nome)
        })
      }

      // Buscar planos de contas
      const planosContasSet = new Set<string>()
      lancamentosData.forEach((l: any) => {
        if (l.plano_conta_id) {
          planosContasSet.add(l.plano_conta_id)
        }
      })
      const planosContasIds = Array.from(planosContasSet)
      
      const planosContasMap = new Map<string, any>()
      if (planosContasIds.length > 0) {
        const { data: planosData } = await supabase
          .from('plano_contas_fluxo')
          .select('id, categoria, subcategoria')
          .in('id', planosContasIds)
        
        planosData?.forEach((p: any) => {
          planosContasMap.set(p.id, p)
        })
      }

      // Verificar fechamento para cada conta bancária única
      const contasBancariasSet = new Set<string>()
      lancamentosData?.forEach((l: any) => {
        if (l.banco_conta_id) {
          contasBancariasSet.add(l.banco_conta_id)
        }
      })
      const contasBancarias = Array.from(contasBancariasSet)
      
      for (const contaId of contasBancarias) {
        const { data: fechamentos, error: fechamentoError } = await supabase
          .from('fechamento_bancarios')
          .select('data_fechamento')
          .eq('banco_conta_id', contaId)
          .order('data_fechamento', { ascending: false })
          .limit(1)

        if (fechamentoError) {
          console.error('Erro ao verificar fechamento:', fechamentoError)
          continue
        }

        if (fechamentos && fechamentos.length > 0) {
          const dataFechamento = fechamentos[0].data_fechamento
          
          // Comparar datas
          if (dataLiquidacao <= dataFechamento) {
            const [ano, mes, dia] = dataFechamento.split('-')
            showError(
              `Não é possível baixar lançamentos na data informada. O período está fechado até ${dia}/${mes}/${ano}`
            )
            return
          }
        }
      }

      // 2. PROCESSAR BAIXA E CRIAR MOVIMENTOS
      const movimentos = []

      for (const lancamento of lancamentosData || []) {
        // Buscar plano de contas do Map
        const planoContas = planosContasMap.get(lancamento.plano_conta_id)

        // Construir histórico
        const tipoTexto = lancamento.tipo === 'Saida' ? 'Pagamento' : 'Recebimento'
        let historico = `${tipoTexto} --> `
        
        // Se for pagamento por conta e ordem, adicionar "Por conta e ordem da [empresa beneficiária]"
        if (lancamento.pagamento_terceiro && lancamento.empresa_id) {
          const empresaBeneficiariaNome = empresasMap.get(lancamento.empresa_id)
          if (empresaBeneficiariaNome) {
            historico += `Por conta e ordem da ${empresaBeneficiariaNome}`
          }
        }

        // Adicionar projeto se existir
        if (lancamento.projeto?.nome) {
          if (!historico.endsWith(' --> ')) historico += ' - '
          historico += lancamento.projeto.nome
        }

        // Adicionar subprojeto se existir
        if (lancamento.subprojeto?.nome) {
          if (!historico.endsWith(' --> ')) historico += ' - '
          historico += lancamento.subprojeto.nome
        }

        // Adicionar categoria (não temos mais grupo)
        if (planoContas?.categoria) {
          if (!historico.endsWith(' --> ')) historico += ' - '
          historico += planoContas.categoria
        }

        // Adicionar subcategoria
        if (planoContas?.subcategoria) {
          if (!historico.endsWith(' --> ')) historico += ' - '
          historico += planoContas.subcategoria
        }

        // Adicionar contraparte
        const contraparteNome = Array.isArray(lancamento.contrapartes) 
          ? lancamento.contrapartes[0]?.nome 
          : lancamento.contrapartes?.nome
        if (contraparteNome) {
          if (!historico.endsWith(' --> ')) historico += ' - '
          historico += contraparteNome
        }

        // Validar dados antes de adicionar ao array
        if (!lancamento.banco_conta_id) {
          console.warn(`Lançamento ${lancamento.id} não possui banco_conta_id`)
          continue
        }

        if (!lancamento.valor_liquido || lancamento.valor_liquido <= 0) {
          console.warn(`Lançamento ${lancamento.id} possui valor inválido`)
          continue
        }

        movimentos.push({
          tipo_movimento: lancamento.tipo === 'Saida' ? 'SAIDA' : 'ENTRADA',
          lancamento_id: lancamento.id,
          banco_conta_id: lancamento.banco_conta_id,
          data_movimento: dataLiquidacao,
          valor: lancamento.valor_liquido,
          historico: historico
        })
      }

      // Verificar se há movimentos para inserir
      if (movimentos.length === 0) {
        showToast('Nenhum movimento válido para registrar. Verifique se os lançamentos possuem conta bancária' 
        , 'error')
        return
      }

      // 3. INSERIR MOVIMENTOS BANCÁRIOS PRIMEIRO
      const { error: movimentosError } = await supabase
        .from('movimentos_bancarios')
        .insert(movimentos)

      if (movimentosError) {
        console.error('Erro ao inserir movimentos:', movimentosError)

        const mensagemErroBruta = movimentosError.message || ''
        const mensagemComDataBR = mensagemErroBruta.replace(
          /(\d{4})-(\d{2})-(\d{2})/g,
          (_, ano, mes, dia) => `${dia}/${mes}/${ano}`
        )
        const mensagemNormalizada = mensagemErroBruta
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()

        // Verificar tipos espec?ficos de erro
        if (movimentosError.message?.includes('column') || movimentosError.code === '42703') {
          showError('Estrutura da tabela movimentos_bancarios est? incorreta. Verifique se todas as colunas necess?rias existem (tipo_movimento, lancamento_id, banco_conta_id, data_movimento, valor, historico)')
        } else if (movimentosError.code === '23503') {
          showError('Refer?ncia inv?lida. Verifique se o banco_conta_id est? correto')
        } else if (movimentosError.code === '23505') {
          showError('Movimento banc?rio j? existe para este lan?amento')
        } else if (mensagemNormalizada.includes('ultimo fechamento')) {
          showError(mensagemComDataBR)
        } else {
          showError(`Erro ao registrar movimentos banc?rios: ${mensagemComDataBR || 'Verifique os dados e tente novamente'}`)
        }
        return
      }


      // 4. ATUALIZAR LANÇAMENTOS (só se os movimentos foram inseridos com sucesso)
      const updatePromises = lancamentosSelecionadosArray.map(id => 
        supabase
          .from('lancamentos')
          .update({
            status: 'PAGO_RECEBIDO',
            data_liquidacao: dataLiquidacao
          })
          .eq('id', id)
      )

      const updateResults = await Promise.all(updatePromises)
      
      const updateErrors = updateResults.filter(r => r.error)
      if (updateErrors.length > 0) {
        console.error('Erros ao atualizar lançamentos:', updateErrors)
        showError(`Erro ao atualizar ${updateErrors.length} lançamento(s). Os movimentos foram registrados mas o status não foi atualizado. Verifique as permissões`)
        return
      }

      showToast(`${lancamentosSelecionados.size} lançamento(s) baixado(s) com sucesso!`, 'success')
      setLancamentosSelecionados(new Set())
      setShowLiquidarModal(false)
      setDataLiquidacao('')
      fetchLancamentosPendentes()
    } catch (error: any) {
      console.error('Erro ao processar baixa:', error)
      showError(`Falha ao processar baixa de pagamentos: ${error?.message || 'Erro desconhecido'}. Por favor, tente novamente`)
    } finally {
      setProcessando(false)
    }
  }

  // Filtro de busca
  const lancamentosFiltrados = lancamentosPendentes.filter(lanc => {
    if (!searchTerm) return true
    const termo = searchTerm.toLowerCase()
    return (
      lanc.empresa_nome?.toLowerCase().includes(termo) ||
      lanc.contraparte_nome?.toLowerCase().includes(termo) ||
      lanc.projeto_nome?.toLowerCase().includes(termo) ||
      lanc.documento_numero?.toLowerCase().includes(termo)
    )
  })

  // Cálculos
  const totalSelecionado = Array.from(lancamentosSelecionados)
    .reduce((sum, id) => {
      const lanc = lancamentosPendentes.find(l => l.id === id)
      return sum + (lanc?.valor_liquido || 0)
    }, 0)

  const totalGeral = lancamentosFiltrados.reduce((sum, l) => sum + l.valor_liquido, 0)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  const formatDateBR = (dateString: string | null) => {
    if (!dateString) return '-'
    const [year, month, day] = dateString.split('-')
    return `${day}/${month}/${year}`
  }

  const getStatusAtraso = (diasAtraso: number) => {
    if (diasAtraso === 0) return { bg: '#dcfce7', text: '#166534', label: 'No prazo' }
    if (diasAtraso <= 7) return { bg: '#fef3c7', text: '#92400e', label: `${diasAtraso}d atraso` }
    return { bg: '#fee2e2', text: '#991b1b', label: `${diasAtraso}d atraso` }
  }

  return (
    <div style={{ 
      padding: '24px',
      backgroundColor: '#f9fafb',
      minHeight: '100vh'
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
            fontSize: '28px',
            fontWeight: '700',
            color: '#111827',
            marginBottom: '8px'
          }}>
            Baixar Pagamentos
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#6b7280'
          }}>
            Gerencie e processe baixas de pagamentos e recebimentos em lote
          </p>
        </div>
        
        <button
          onClick={fetchLancamentosPendentes}
          disabled={loading}
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
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }}
        >
          <RefreshCw size={18} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Atualizar
        </button>
      </div>

      {/* Cards de Resumo */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Total Pendente</span>
            <Receipt size={20} style={{ color: '#1555D6' }} />
          </div>
          <p style={{ fontSize: '24px', fontWeight: '700', color: '#111827' }}>
            {lancamentosFiltrados.length}
          </p>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
            lançamentos
          </p>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Valor Total</span>
            <DollarSign size={20} style={{ color: '#059669' }} />
          </div>
          <p style={{ fontSize: '24px', fontWeight: '700', color: '#111827' }}>
            {formatCurrency(totalGeral)}
          </p>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
            a liquidar
          </p>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Selecionados</span>
            <CheckCircle2 size={20} style={{ color: '#0284c7' }} />
          </div>
          <p style={{ fontSize: '24px', fontWeight: '700', color: '#111827' }}>
            {lancamentosSelecionados.size}
          </p>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
            lançamentos
          </p>
        </div>

        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>Valor Selecionado</span>
            <DollarSign size={20} style={{ color: '#7c3aed' }} />
          </div>
          <p style={{ fontSize: '24px', fontWeight: '700', color: '#111827' }}>
            {formatCurrency(totalSelecionado)}
          </p>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
            para baixar
          </p>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        marginBottom: '16px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: '12px',
          marginBottom: '16px'
        }}>
          {/* Tipo */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Tipo
            </label>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value as any)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="Todos">Todos</option>
              <option value="Saida">Pagamentos</option>
              <option value="Entrada">Recebimentos</option>
            </select>
          </div>

          {/* Empresa */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Empresa
            </label>
            <select
              value={filtroEmpresa}
              onChange={(e) => setFiltroEmpresa(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todas</option>
              {empresas.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.nome}</option>
              ))}
            </select>
          </div>

          {/* Contraparte */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Contraparte
            </label>
            <select
              value={filtroContraparte}
              onChange={(e) => setFiltroContraparte(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todas</option>
              {contrapartes.map(cp => (
                <option key={cp.id} value={cp.id}>{cp.nome}</option>
              ))}
            </select>
          </div>

          {/* Data Início */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Venc. Início
            </label>
            <input
              type="date"
              value={filtroDataInicio}
              onChange={(e) => setFiltroDataInicio(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>

          {/* Data Fim */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '600',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Venc. Fim
            </label>
            <input
              type="date"
              value={filtroDataFim}
              onChange={(e) => setFiltroDataFim(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>

          {/* Busca */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '600',
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
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 36px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>
          </div>
        </div>

        {/* Botão de Baixar */}
        {lancamentosSelecionados.size > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            paddingTop: '16px',
            borderTop: '1px solid #e5e7eb'
          }}>
            <button
              onClick={() => setShowLiquidarModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                backgroundColor: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#047857'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#059669'}
            >
              <CheckCircle2 size={18} />
              Baixar {lancamentosSelecionados.size} Lançamento(s)
            </button>
          </div>
        )}
      </div>

      {/* Tabela */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        {loading ? (
          <div style={{
            padding: '60px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            Carregando lançamentos pendentes...
          </div>
        ) : lancamentosFiltrados.length === 0 ? (
          <div style={{
            padding: '60px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <Receipt size={48} style={{ color: '#d1d5db', margin: '0 auto 16px' }} />
            <p style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
              Nenhum lançamento pendente
            </p>
            <p style={{ fontSize: '14px' }}>
              Não há pagamentos ou recebimentos pendentes no momento
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px'
            }}>
              <thead>
                <tr style={{
                  backgroundColor: '#f9fafb',
                  borderBottom: '2px solid #e5e7eb'
                }}>
                  <th style={{
                    padding: '12px',
                    textAlign: 'center',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    width: '50px'
                  }}>
                    <input
                      type="checkbox"
                      checked={lancamentosSelecionados.size === lancamentosFiltrados.length && lancamentosFiltrados.length > 0}
                      onChange={toggleSelecionarTodos}
                      style={{
                        width: '16px',
                        height: '16px',
                        cursor: 'pointer'
                      }}
                    />
                  </th>
                  <th style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    TIPO
                  </th>
                  <th style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    EMPRESA
                  </th>
                  <th style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    CONTRAPARTE
                  </th>
                  <th style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    PROJETO
                  </th>
                  <th style={{
                    padding: '12px',
                    textAlign: 'center',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    VENCIMENTO
                  </th>
                  <th style={{
                    padding: '12px',
                    textAlign: 'center',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    STATUS
                  </th>
                  <th style={{
                    padding: '12px',
                    textAlign: 'right',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    VALOR LÍQUIDO
                  </th>
                  <th style={{
                    padding: '12px',
                    textAlign: 'center',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    PGTO TERC
                  </th>
                  <th style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    DOCUMENTO
                  </th>
                </tr>
              </thead>
              <tbody>
                {lancamentosFiltrados.map((lancamento) => {
                  const statusAtraso = getStatusAtraso(lancamento.dias_atraso)
                  const isSelecionado = lancamentosSelecionados.has(lancamento.id)

                  return (
                    <tr
                      key={lancamento.id}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        backgroundColor: isSelecionado ? '#eff6ff' : 'white',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseOver={(e) => {
                        if (!isSelecionado) e.currentTarget.style.backgroundColor = '#f9fafb'
                      }}
                      onMouseOut={(e) => {
                        if (!isSelecionado) e.currentTarget.style.backgroundColor = 'white'
                      }}
                    >
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelecionado}
                          onChange={() => toggleSelecionarLancamento(lancamento.id)}
                          style={{
                            width: '16px',
                            height: '16px',
                            cursor: 'pointer'
                          }}
                        />
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '600',
                          backgroundColor: lancamento.tipo === 'Entrada' ? '#d1fae5' : '#fee2e2',
                          color: lancamento.tipo === 'Entrada' ? '#065f46' : '#991b1b'
                        }}>
                          {lancamento.tipo === 'Entrada' ? 'Recebimento' : 'Pagamento'}
                        </span>
                      </td>
                      <td style={{
                        padding: '12px',
                        fontSize: '13px',
                        color: '#1f2937',
                        fontWeight: '500'
                      }}>
                        {lancamento.empresa_nome}
                      </td>
                      <td style={{
                        padding: '12px',
                        fontSize: '13px',
                        color: '#4b5563'
                      }}>
                        {lancamento.contraparte_nome}
                      </td>
                      <td style={{
                        padding: '12px',
                        fontSize: '13px',
                        color: '#6b7280'
                      }}>
                        {lancamento.projeto_nome || '-'}
                      </td>
                      <td style={{
                        padding: '12px',
                        textAlign: 'center',
                        fontSize: '13px',
                        color: '#374151',
                        fontWeight: '500'
                      }}>
                        {formatDateBR(lancamento.data_vencimento)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '600',
                          backgroundColor: statusAtraso.bg,
                          color: statusAtraso.text
                        }}>
                          {statusAtraso.label}
                        </span>
                      </td>
                      <td style={{
                        padding: '12px',
                        textAlign: 'right',
                        fontSize: '14px',
                        color: '#111827',
                        fontWeight: '600'
                      }}>
                        {formatCurrency(lancamento.valor_liquido)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {lancamento.pagamento_terceiro ? (
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <span
                              title={`Pago por: ${lancamento.empresa_pagadora_nome || 'N/A'}`}
                              style={{
                                display: 'inline-block',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '600',
                                backgroundColor: '#dbeafe',
                                color: '#1e40af',
                                cursor: 'help'
                              }}
                            >
                              SIM
                            </span>
                          </div>
                        ) : (
                          <span style={{
                            fontSize: '11px',
                            color: '#9ca3af',
                            fontWeight: '500'
                          }}>
                            NÃO
                          </span>
                        )}
                      </td>
                      <td style={{
                        padding: '12px',
                        fontSize: '13px',
                        color: '#6b7280'
                      }}>
                        {lancamento.documento_numero ? (
                          <>
                            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px' }}>
                              {lancamento.documento_tipo || 'Doc'}
                            </div>
                            {lancamento.documento_numero}
                          </>
                        ) : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Liquidação */}
      {showLiquidarModal && (
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
          onClick={() => setShowLiquidarModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              padding: '24px',
              width: '90%',
              maxWidth: '500px',
              margin: '16px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '20px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#dcfce7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <CheckCircle2 size={24} style={{ color: '#059669' }} />
              </div>
              <div>
                <h2 style={{
                  fontSize: '18px',
                  fontWeight: '700',
                  color: '#111827',
                  marginBottom: '4px'
                }}>
                  Confirmar Baixa de Pagamentos
                </h2>
                <p style={{
                  fontSize: '14px',
                  color: '#6b7280'
                }}>
                  {lancamentosSelecionados.size} lançamento(s) selecionado(s)
                </p>
              </div>
            </div>

            <div style={{
              backgroundColor: '#f9fafb',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '8px'
              }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>
                  Quantidade:
                </span>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                  {lancamentosSelecionados.size} lançamento(s)
                </span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between'
              }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>
                  Valor Total:
                </span>
                <span style={{ fontSize: '16px', fontWeight: '700', color: '#059669' }}>
                  {formatCurrency(totalSelecionado)}
                </span>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
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
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
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
                onClick={() => setShowLiquidarModal(false)}
                disabled={processando}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: processando ? 'not-allowed' : 'pointer',
                  opacity: processando ? 0.6 : 1
                }}
              >
                Cancelar
              </button>
              <button
                onClick={processarBaixa}
                disabled={processando || !dataLiquidacao}
                style={{
                  padding: '10px 20px',
                  backgroundColor: processando || !dataLiquidacao ? '#9ca3af' : '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: processando || !dataLiquidacao ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {processando ? (
                  <>
                    <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Processando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    Confirmar Baixa
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Erro Profissional */}
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
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              padding: '0',
              width: '90%',
              maxWidth: '540px',
              margin: '16px',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Barra superior amarela */}
            <div style={{
              height: '4px',
              backgroundColor: '#f59e0b',
              width: '100%'
            }} />

            <div style={{ padding: '24px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '16px',
                marginBottom: '24px'
              }}>
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
                <div style={{ flex: 1 }}>
                  <p style={{
                    fontSize: '16px',
                    lineHeight: '1.6',
                    color: '#374151',
                    margin: 0
                  }}>
                    {errorMessage}
                  </p>
                </div>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'flex-end'
              }}>
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

      {/* Toast Notifications */}
      <div style={{
        position: 'fixed',
        top: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        pointerEvents: 'none'
      }}>
        {toasts.map((toast) => {
          const styles = {
            success: { bg: '#dcfce7', border: '#86efac', icon: CheckCircle2, iconColor: '#059669' },
            warning: { bg: '#fef3c7', border: '#fcd34d', icon: AlertCircle, iconColor: '#d97706' },
            error: { bg: '#fee2e2', border: '#fca5a5', icon: XCircle, iconColor: '#dc2626' }
          }[toast.type]

          const Icon = styles.icon

          return (
            <div
              key={toast.id}
              style={{
                backgroundColor: styles.bg,
                border: `1px solid ${styles.border}`,
                borderRadius: '8px',
                padding: '12px 16px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                minWidth: '320px',
                maxWidth: '480px',
                pointerEvents: 'auto',
                animation: 'slideIn 0.3s ease-out'
              }}
            >
              <Icon size={20} style={{ color: styles.iconColor, flexShrink: 0 }} />
              <p style={{
                fontSize: '14px',
                color: '#1f2937',
                fontWeight: '500',
                flex: 1
              }}>
                {toast.message}
              </p>
              <button
                onClick={() => removeToast(toast.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={16} style={{ color: '#6b7280' }} />
              </button>
            </div>
          )
        })}
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}