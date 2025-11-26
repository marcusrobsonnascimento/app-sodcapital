'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useForm } from 'react-hook-form'
import { Calendar, Lock, Unlock, CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react'

type BancoConta = {
  id: string
  banco_nome: string
  banco_codigo: string
  agencia: string
  numero_conta: string
  tipo_conta: string
  saldo_inicial: number
  empresa_id: string
  empresas: {
    nome: string
  }
}

type FechamentoBancario = {
  id: string
  banco_conta_id: string
  data_fechamento: string
  saldo_anterior: number
  total_entradas: number
  total_saidas: number
  saldo_final: number
  fechado: boolean
  usuario_fechamento: string
  observacoes: string
}

type ToastType = 'success' | 'error' | 'warning'

type FechamentoForm = {
  data_fechamento: string
}

type ReaberturaForm = {
  data_reabertura: string
}

export default function FechamentoDiarioPage() {
  
  const [loading, setLoading] = useState(false)
  const [progresso, setProgresso] = useState({ atual: 0, total: 0, mensagem: '' })
  const [showModalFechamento, setShowModalFechamento] = useState(false)
  const [showModalReabertura, setShowModalReabertura] = useState(false)
  const [showMessageBox, setShowMessageBox] = useState(false)
  const [messageBoxContent, setMessageBoxContent] = useState({ title: '', message: '', type: 'warning' as ToastType })
  
  const [toast, setToast] = useState<{ show: boolean; message: string; type: ToastType }>({
    show: false,
    message: '',
    type: 'success'
  })

  const [userName, setUserName] = useState('')
  const [userId, setUserId] = useState('')
  const [fechamentos, setFechamentos] = useState<any[]>([])
  const [empresas, setEmpresas] = useState<any[]>([])
  const [filtros, setFiltros] = useState({
    data: '',
    empresa_id: '',
    tipo_conta: ''
  })

  const { register: registerFechamento, handleSubmit: handleSubmitFechamento, reset: resetFechamento, formState: { errors: errorsFechamento } } = useForm<FechamentoForm>()
  const { register: registerReabertura, handleSubmit: handleSubmitReabertura, reset: resetReabertura, formState: { errors: errorsReabertura } } = useForm<ReaberturaForm>()

  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = async () => {
    try {
      // Buscar dados do usuário autenticado
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        // Usar email ou metadata para nome do usuário (sem tabela profiles)
        const nome = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário'
        setUserName(nome)
      }

      // Buscar empresas para o filtro
      const { data: empresasData } = await supabase
        .from('empresas')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome')

      setEmpresas(empresasData || [])

      // Não buscar fechamentos automaticamente
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    }
  }

  const buscarFechamentos = async () => {
    try {
      let query = supabase
        .from('fechamentos_bancarios')
        .select(`
          *,
          bancos_contas (
            banco_nome,
            banco_codigo,
            numero_conta,
            agencia,
            tipo_conta,
            empresa_id,
            empresas (nome),
            bancos (nome)
          )
        `)
        .eq('fechado', true)

      // Aplicar filtros
      if (filtros.data) {
        query = query.eq('data_fechamento', filtros.data)
      }

      if (filtros.empresa_id) {
        query = query.eq('bancos_contas.empresa_id', filtros.empresa_id)
      }

      if (filtros.tipo_conta) {
        query = query.eq('bancos_contas.tipo_conta', filtros.tipo_conta)
      }

      // Se não tem filtro de data, buscar a data mais recente
      if (!filtros.data) {
        const { data: dataMaxima, error: erroMax } = await supabase
          .from('fechamentos_bancarios')
          .select('data_fechamento')
          .eq('fechado', true)
          .order('data_fechamento', { ascending: false })
          .limit(1)
          .single()

        if (erroMax && erroMax.code !== 'PGRST116') throw erroMax

        if (dataMaxima) {
          query = query.eq('data_fechamento', dataMaxima.data_fechamento)
        }
      }

      const { data, error } = await query.neq('saldo_final', 0)

      if (error) throw error

      // Filtrar por empresa_id manualmente se necessário (fallback)
      let dadosFiltrados = data || []
      if (filtros.empresa_id) {
        dadosFiltrados = dadosFiltrados.filter(f => f.bancos_contas?.empresa_id === filtros.empresa_id)
      }

      // Ordenar por nome da empresa
      const dadosOrdenados = dadosFiltrados.sort((a, b) => {
        const nomeA = a.bancos_contas?.empresas?.nome || ''
        const nomeB = b.bancos_contas?.empresas?.nome || ''
        return nomeA.localeCompare(nomeB)
      })

      // Adicionar placeholder para nome do usuário (sem tabela profiles)
      setFechamentos(dadosOrdenados.map(f => ({ ...f, usuario_nome: '-' })))
    } catch (error) {
      console.error('Erro ao buscar fechamentos:', error)
      setFechamentos([])
    }
  }

  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const showMessage = (title: string, message: string, type: ToastType = 'warning') => {
    setMessageBoxContent({ title, message, type })
    setShowMessageBox(true)
  }

  const onSubmitFechamento = async (formData: FechamentoForm) => {
    try {
      setLoading(true)
      setProgresso({ atual: 0, total: 0, mensagem: 'Iniciando...' })

      const dataFechamento = formData.data_fechamento

      // Validar data (deve estar nos últimos 3 dias)
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const dataLimite = new Date(hoje)
      dataLimite.setDate(dataLimite.getDate() - 3)
      const dataSelecionada = new Date(dataFechamento + 'T00:00:00')

      if (dataSelecionada < dataLimite) {
        showMessage('Data Inválida', 'Permitido fechar apenas os últimos 3 dias.', 'warning')
        setLoading(false)
        return
      }

      if (dataSelecionada > hoje) {
        showMessage('Data Inválida', 'Não é possível fechar datas futuras.', 'warning')
        setLoading(false)
        return
      }

      setProgresso({ atual: 0, total: 0, mensagem: 'Validando data...' })

      // Verificar se existe fechamento mais recente que a data solicitada
      const { data: fechamentoMaisRecente, error: erroRecente } = await supabase
        .from('fechamentos_bancarios')
        .select('data_fechamento')
        .eq('fechado', true)
        .gt('data_fechamento', dataFechamento)
        .limit(1)

      if (erroRecente) throw erroRecente

      if (fechamentoMaisRecente && fechamentoMaisRecente.length > 0) {
        showMessage('Data Inválida', 'Já existe um fechamento mais recente que a data selecionada. Feche as datas em ordem cronológica.', 'warning')
        setLoading(false)
        return
      }

      // Verificar se já existe fechamento para esta data
      const { data: fechamentosExistentes, error: erroConsulta } = await supabase
        .from('fechamentos_bancarios')
        .select('id')
        .eq('data_fechamento', dataFechamento)
        .eq('fechado', true)
        .limit(1)

      if (erroConsulta) throw erroConsulta

      if (fechamentosExistentes && fechamentosExistentes.length > 0) {
        showMessage('Data já Fechada', 'Esta data já possui fechamento realizado.', 'warning')
        setLoading(false)
        return
      }

      setProgresso({ atual: 0, total: 0, mensagem: 'Carregando contas bancárias...' })

      // Buscar todas as contas bancárias ativas
      const { data: contas, error: erroContas } = await supabase
        .from('bancos_contas')
        .select('id, saldo_inicial')
        .eq('ativo', true)

      if (erroContas) throw erroContas

      if (!contas || contas.length === 0) {
        showMessage('Sem Contas', 'Não há contas bancárias ativas para fechar.', 'warning')
        setLoading(false)
        return
      }

      setProgresso({ atual: 0, total: contas.length, mensagem: 'Processando fechamentos...' })

      // Processar fechamento de cada conta
      const fechamentosParaInserir: any[] = []

      for (let i = 0; i < contas.length; i++) {
        const conta = contas[i]
        
        setProgresso({ 
          atual: i + 1, 
          total: contas.length, 
          mensagem: `Processando conta ${i + 1} de ${contas.length}...` 
        })

        // Buscar último fechamento desta conta anterior à data
        const { data: fechamentosAnteriores, error: erroFechamentos } = await supabase
          .from('fechamentos_bancarios')
          .select('saldo_final, data_fechamento')
          .eq('banco_conta_id', conta.id)
          .eq('fechado', true)
          .lt('data_fechamento', dataFechamento)
          .order('data_fechamento', { ascending: false })
          .limit(1)

        if (erroFechamentos) {
          console.error('Erro ao buscar fechamento anterior:', erroFechamentos)
        }

        let saldoAnterior = 0
        let dataInicioMovimentos = '1900-01-01'

        if (fechamentosAnteriores && fechamentosAnteriores.length > 0) {
          // Tem fechamento anterior - usar saldo final dele
          saldoAnterior = Number(fechamentosAnteriores[0].saldo_final) || 0
          dataInicioMovimentos = fechamentosAnteriores[0].data_fechamento
        } else {
          // Não tem fechamento anterior - usar saldo_inicial da conta
          saldoAnterior = Number(conta.saldo_inicial) || 0
        }

        // Buscar movimentos desta conta APENAS na data de fechamento
        const { data: movimentos, error: erroMovimentos } = await supabase
          .from('movimentos_bancarios')
          .select('tipo_movimento, valor')
          .eq('banco_conta_id', conta.id)
          .eq('data_movimento', dataFechamento)

        if (erroMovimentos) {
          console.error('Erro ao buscar movimentos:', erroMovimentos)
        }

        let totalEntradas = 0
        let totalSaidas = 0

        if (movimentos && movimentos.length > 0) {
          movimentos.forEach(mov => {
            const valor = Number(mov.valor) || 0
            if (mov.tipo_movimento === 'ENTRADA' || mov.tipo_movimento === 'TRANSFERENCIA_RECEBIDA') {
              totalEntradas += valor
            } else if (mov.tipo_movimento === 'SAIDA' || mov.tipo_movimento === 'TRANSFERENCIA_ENVIADA') {
              totalSaidas += valor
            }
          })
        }

        const saldoFinal = saldoAnterior + totalEntradas - totalSaidas

        fechamentosParaInserir.push({
          banco_conta_id: conta.id,
          data_fechamento: dataFechamento,
          saldo_anterior: saldoAnterior,
          total_entradas: totalEntradas,
          total_saidas: totalSaidas,
          saldo_final: saldoFinal,
          fechado: true,
          usuario_fechamento: userId || null,
          observacoes: null
        })
      }

      setProgresso({ atual: contas.length, total: contas.length, mensagem: 'Salvando fechamentos...' })

      // Inserir todos os fechamentos
      const { error: erroInsert } = await supabase
        .from('fechamentos_bancarios')
        .insert(fechamentosParaInserir)

      if (erroInsert) {
        console.error('Erro ao inserir fechamentos:', erroInsert)
        throw erroInsert
      }

      showToast(`Fechamento realizado com sucesso para ${fechamentosParaInserir.length} contas!`, 'success')
      setShowModalFechamento(false)
      resetFechamento()
      setProgresso({ atual: 0, total: 0, mensagem: '' })
      await buscarFechamentos()

    } catch (error: any) {
      console.error('Erro ao realizar fechamento:', error)
      showToast(error?.message || 'Erro ao realizar fechamento', 'error')
    } finally {
      setLoading(false)
      setProgresso({ atual: 0, total: 0, mensagem: '' })
    }
  }

  const onSubmitReabertura = async (formData: ReaberturaForm) => {
    try {
      setLoading(true)

      const dataReabertura = formData.data_reabertura

      // Verificar se existe fechamento para esta data
      const { data: fechamentosData, error: erroConsulta } = await supabase
        .from('fechamentos_bancarios')
        .select('id, banco_conta_id')
        .eq('data_fechamento', dataReabertura)
        .eq('fechado', true)

      if (erroConsulta) throw erroConsulta

      if (!fechamentosData || fechamentosData.length === 0) {
        showMessage('Data não Fechada', 'Esta data não possui fechamento para reabrir.', 'warning')
        setLoading(false)
        return
      }

      // Marcar como não fechado (fechado = false)
      const { error: erroUpdate } = await supabase
        .from('fechamentos_bancarios')
        .update({ fechado: false })
        .eq('data_fechamento', dataReabertura)
        .eq('fechado', true)

      if (erroUpdate) throw erroUpdate

      showToast(`Período ${dataReabertura} reaberto com sucesso!`, 'success')
      setShowModalReabertura(false)
      resetReabertura()
      await buscarFechamentos()

    } catch (error) {
      console.error('Erro ao reabrir período:', error)
      showToast('Erro ao reabrir período', 'error')
    } finally {
      setLoading(false)
    }
  }

  const recalcularFechamentosPosteriores = async (dataInicio: string) => {
    try {
      // Buscar todas as datas fechadas posteriores à data de início
      const { data: datasPosteriores, error: erroConsulta } = await supabase
        .from('fechamentos_bancarios')
        .select('data_fechamento')
        .eq('fechado', true)
        .gt('data_fechamento', dataInicio)
        .order('data_fechamento', { ascending: true })

      if (erroConsulta) throw erroConsulta

      if (!datasPosteriores || datasPosteriores.length === 0) {
        return
      }

      // Extrair datas únicas
      const datas = Array.from(new Set(datasPosteriores.map(f => f.data_fechamento))).sort()

      // Buscar todas as contas
      const { data: contas, error: erroContas } = await supabase
        .from('bancos_contas')
        .select('id')
        .eq('ativo', true)

      if (erroContas) throw erroContas

      // Para cada data, recalcular os fechamentos
      for (const data of datas) {
        for (const conta of contas || []) {
          // Buscar último fechamento anterior
          const { data: ultimoFechamento } = await supabase
            .from('fechamentos_bancarios')
            .select('*')
            .eq('banco_conta_id', conta.id)
            .eq('fechado', true)
            .lt('data_fechamento', data)
            .order('data_fechamento', { ascending: false })
            .limit(1)
            .single()

          let saldoAnterior = 0

          if (ultimoFechamento) {
            saldoAnterior = ultimoFechamento.saldo_final
          } else {
            // Buscar saldo inicial
            const { data: contaData } = await supabase
              .from('bancos_contas')
              .select('saldo_inicial')
              .eq('id', conta.id)
              .single()

            saldoAnterior = contaData?.saldo_inicial || 0
          }

          // Buscar movimentos
          const { data: movimentos } = await supabase
            .from('movimentos_bancarios')
            .select('tipo_movimento, valor')
            .eq('banco_conta_id', conta.id)
            .lte('data_movimento', data)
            .gt('data_movimento', ultimoFechamento?.data_fechamento || '1900-01-01')

          let totalEntradas = 0
          let totalSaidas = 0

          if (movimentos) {
            movimentos.forEach(mov => {
              if (mov.tipo_movimento === 'ENTRADA' || mov.tipo_movimento === 'TRANSFERENCIA_RECEBIDA') {
                totalEntradas += Number(mov.valor)
              } else if (mov.tipo_movimento === 'SAIDA' || mov.tipo_movimento === 'TRANSFERENCIA_ENVIADA') {
                totalSaidas += Number(mov.valor)
              }
            })
          }

          const saldoFinal = saldoAnterior + totalEntradas - totalSaidas

          // Atualizar fechamento
          await supabase
            .from('fechamentos_bancarios')
            .update({
              saldo_anterior: saldoAnterior,
              total_entradas: totalEntradas,
              total_saidas: totalSaidas,
              saldo_final: saldoFinal
            })
            .eq('banco_conta_id', conta.id)
            .eq('data_fechamento', data)
            .eq('fechado', true)
        }
      }

      showToast('Fechamentos posteriores recalculados com sucesso!', 'success')
      await buscarFechamentos()

    } catch (error) {
      console.error('Erro ao recalcular fechamentos:', error)
      showToast('Erro ao recalcular fechamentos', 'error')
    }
  }

  const formatarValor = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valor)
  }

  const formatarData = (data: string) => {
    return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR')
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Toast */}
      {toast.show && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: toast.type === 'success' ? '#10b981' : toast.type === 'error' ? '#ef4444' : '#f59e0b',
          color: 'white',
          padding: '16px 24px',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          minWidth: '300px'
        }}>
          {toast.type === 'success' && <CheckCircle size={24} />}
          {toast.type === 'error' && <XCircle size={24} />}
          {toast.type === 'warning' && <AlertTriangle size={24} />}
          <span style={{ fontSize: '15px', fontWeight: '500' }}>{toast.message}</span>
        </div>
      )}

      {/* MessageBox Modal */}
      {showMessageBox && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              {messageBoxContent.type === 'success' && <CheckCircle size={24} color="#10b981" />}
              {messageBoxContent.type === 'error' && <XCircle size={24} color="#ef4444" />}
              {messageBoxContent.type === 'warning' && <AlertTriangle size={24} color="#f59e0b" />}
              <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>{messageBoxContent.title}</h3>
            </div>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px', lineHeight: '1.5' }}>
              {messageBoxContent.message}
            </p>
            <button
              onClick={() => setShowMessageBox(false)}
              style={{
                width: '100%',
                padding: '10px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
          Fechamento Diário de Bancos
        </h1>
        <p style={{ fontSize: '14px', color: '#6b7280' }}>
          Gerencie o fechamento e reabertura de períodos bancários
        </p>
      </div>

      {/* Botões de Ação */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <button
          onClick={() => setShowModalFechamento(true)}
          style={{
            padding: '10px 20px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Lock size={18} />
          Realizar Fechamento
        </button>

        <button
          onClick={() => setShowModalReabertura(true)}
          style={{
            padding: '10px 20px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Unlock size={18} />
          Reabrir Período
        </button>
      </div>

      {/* Filtros */}
      <div style={{ 
        background: 'white', 
        padding: '20px', 
        borderRadius: '8px', 
        border: '1px solid #e5e7eb',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
              Data
            </label>
            <input
              type="date"
              value={filtros.data}
              onChange={(e) => setFiltros({ ...filtros, data: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
              Empresa
            </label>
            <select
              value={filtros.empresa_id}
              onChange={(e) => setFiltros({ ...filtros, empresa_id: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            >
              <option value="">Todas</option>
              {empresas.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
              Tipo Conta
            </label>
            <select
              value={filtros.tipo_conta}
              onChange={(e) => setFiltros({ ...filtros, tipo_conta: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            >
              <option value="">Todos</option>
              <option value="CC">CC</option>
              <option value="CP">CP</option>
              <option value="POUPANCA">POUPANÇA</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              onClick={buscarFechamentos}
              style={{
                width: '100%',
                padding: '8px 16px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* Tabela de Fechamentos */}
      <div style={{
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#374151' }}>Data</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#374151' }}>Banco</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#374151' }}>Conta</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#374151' }}>Tipo Conta</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#374151' }}>Empresa</th>
                <th style={{ padding: '10px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#374151' }}>Saldo Anterior</th>
                <th style={{ padding: '10px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#374151' }}>Entradas</th>
                <th style={{ padding: '10px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#374151' }}>Saídas</th>
                <th style={{ padding: '10px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#374151' }}>Saldo Final</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#374151' }}>Usuário</th>
              </tr>
            </thead>
            <tbody>
              {fechamentos.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                    Nenhum fechamento encontrado
                  </td>
                </tr>
              ) : (
                fechamentos.map((fechamento) => (
                  <tr key={fechamento.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '10px', fontSize: '12px', color: '#374151' }}>
                      {formatarData(fechamento.data_fechamento)}
                    </td>
                    <td style={{ padding: '10px', fontSize: '12px', color: '#374151' }}>
                      {fechamento.bancos_contas?.banco_nome || fechamento.bancos_contas?.bancos?.nome || '-'}
                    </td>
                    <td style={{ padding: '10px', fontSize: '12px', color: '#374151' }}>
                      Ag: {fechamento.bancos_contas?.agencia} - Conta: {fechamento.bancos_contas?.numero_conta}
                    </td>
                    <td style={{ padding: '10px', fontSize: '12px', color: '#374151' }}>
                      {fechamento.bancos_contas?.tipo_conta || '-'}
                    </td>
                    <td style={{ padding: '10px', fontSize: '12px', color: '#374151' }}>
                      {fechamento.bancos_contas?.empresas?.nome || '-'}
                    </td>
                    <td style={{ padding: '10px', fontSize: '12px', color: '#374151', textAlign: 'right' }}>
                      {formatarValor(fechamento.saldo_anterior)}
                    </td>
                    <td style={{ padding: '10px', fontSize: '12px', color: '#10b981', textAlign: 'right', fontWeight: '500' }}>
                      {formatarValor(fechamento.total_entradas)}
                    </td>
                    <td style={{ padding: '10px', fontSize: '12px', color: '#ef4444', textAlign: 'right', fontWeight: '500' }}>
                      {formatarValor(fechamento.total_saidas)}
                    </td>
                    <td style={{ padding: '10px', fontSize: '12px', color: '#374151', textAlign: 'right', fontWeight: '600' }}>
                      {formatarValor(fechamento.saldo_final)}
                    </td>
                    <td style={{ padding: '10px', fontSize: '12px', color: '#374151' }}>
                      {fechamento.usuario_nome || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Fechamento */}
      {showModalFechamento && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', margin: 0 }}>
                Realizar Fechamento
              </h2>
              <button
                onClick={() => {
                  setShowModalFechamento(false)
                  resetFechamento()
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmitFechamento(onSubmitFechamento)} style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Data de Fechamento *
                </label>
                <input
                  type="date"
                  {...registerFechamento('data_fechamento', { required: true })}
                  min={(() => {
                    const hoje = new Date()
                    hoje.setDate(hoje.getDate() - 3)
                    const ano = hoje.getFullYear()
                    const mes = String(hoje.getMonth() + 1).padStart(2, '0')
                    const dia = String(hoje.getDate()).padStart(2, '0')
                    return `${ano}-${mes}-${dia}`
                  })()}
                  max={(() => {
                    const hoje = new Date()
                    const ano = hoje.getFullYear()
                    const mes = String(hoje.getMonth() + 1).padStart(2, '0')
                    const dia = String(hoje.getDate()).padStart(2, '0')
                    return `${ano}-${mes}-${dia}`
                  })()}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  Permitido fechar datas até 3 dias atrás
                </p>
              </div>

              <div style={{
                padding: '12px',
                background: '#fef3c7',
                border: '1px solid #fbbf24',
                borderRadius: '6px',
                marginBottom: '16px'
              }}>
                <p style={{ fontSize: '13px', color: '#92400e', margin: 0 }}>
                  <strong>Atenção:</strong> Todas as contas bancárias ativas serão fechadas nesta data.
                </p>
              </div>

              {/* Barra de Progresso */}
              {loading && progresso.total > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#374151', 
                    marginBottom: '6px',
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}>
                    <span>{progresso.mensagem}</span>
                    <span>{progresso.atual} / {progresso.total}</span>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '8px',
                    background: '#e5e7eb',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${(progresso.atual / progresso.total) * 100}%`,
                      height: '100%',
                      background: '#3b82f6',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              )}

              {/* Botões */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowModalFechamento(false)
                    resetFechamento()
                  }}
                  style={{
                    padding: '8px 16px',
                    background: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '8px 16px',
                    background: loading ? '#93c5fd' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? 'Processando...' : 'Confirmar Fechamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Reabertura */}
      {showModalReabertura && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', margin: 0 }}>
                Reabrir Período
              </h2>
              <button
                onClick={() => {
                  setShowModalReabertura(false)
                  resetReabertura()
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmitReabertura(onSubmitReabertura)} style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Data para Reabrir *
                </label>
                <input
                  type="date"
                  {...registerReabertura('data_reabertura', { required: true })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{
                padding: '12px',
                background: '#fef3c7',
                border: '1px solid #fbbf24',
                borderRadius: '6px',
                marginBottom: '16px'
              }}>
                <p style={{ fontSize: '13px', color: '#92400e', margin: 0, marginBottom: '8px' }}>
                  <strong>Importante:</strong>
                </p>
                <ul style={{ fontSize: '13px', color: '#92400e', margin: 0, paddingLeft: '20px' }}>
                  <li>Esta data será marcada como não fechada</li>
                  <li>Ao fechar novamente, todos os períodos posteriores serão recalculados automaticamente</li>
                </ul>
              </div>

              {/* Botões */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowModalReabertura(false)
                    resetReabertura()
                  }}
                  style={{
                    padding: '8px 16px',
                    background: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '8px 16px',
                    background: loading ? '#6ee7b7' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? 'Processando...' : 'Confirmar Reabertura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}