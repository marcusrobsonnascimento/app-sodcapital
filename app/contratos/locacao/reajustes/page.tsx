'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { 
  Percent,
  Search,
  RefreshCw,
  TrendingUp,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Play,
  FileText
} from 'lucide-react'

interface ContratoParaReajuste {
  id: string
  numero_contrato: string | null
  valor_aluguel: number
  indice_reajuste: string
  data_base_reajuste: string | null
  periodicidade_reajuste: number
  data_inicio_vigencia: string
  empresa?: { nome: string }
  contraparte?: { nome: string }
  ultimo_reajuste?: {
    data_aplicacao: string
    valor_novo: number
    fator_aplicado: number
  }
}

interface ReajusteHistorico {
  id: string
  contrato_id: string
  data_aplicacao: string
  indice_utilizado: string
  competencia_inicio: string
  competencia_fim: string
  percentual_periodo: number
  valor_anterior: number
  valor_novo: number
  fator_aplicado: number
  parcelas_atualizadas: number
  contrato?: {
    numero_contrato: string
    contraparte: { nome: string }
  }
}

const formatCurrencyBRL = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

const formatDate = (date: string | null): string => {
  if (!date) return '—'
  const [year, month, day] = date.split('T')[0].split('-')
  return `${day}/${month}/${year}`
}

const formatPercent = (value: number): string => {
  return `${value.toFixed(2)}%`
}

export default function ReajustesLocacaoPage() {
  const [contratos, setContratos] = useState<ContratoParaReajuste[]>([])
  const [historico, setHistorico] = useState<ReajusteHistorico[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'pendentes' | 'historico'>('pendentes')
  const [aplicandoReajuste, setAplicandoReajuste] = useState<string | null>(null)

  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' }>>([])
  const [toastId, setToastId] = useState(0)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = toastId
    setToastId(prev => prev + 1)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // Carregar contratos vigentes
      const { data: contratosData, error: contratosError } = await supabase
        .from('contratos_locacao')
        .select(`
          id,
          numero_contrato,
          valor_aluguel,
          indice_reajuste,
          data_base_reajuste,
          periodicidade_reajuste,
          data_inicio_vigencia,
          empresa:empresas(nome),
          contraparte:contrapartes(nome)
        `)
        .eq('status', 'VIGENTE')
        .order('data_base_reajuste', { ascending: true })

      if (contratosError) throw contratosError

      // Carregar histórico de reajustes
      const { data: historicoData, error: historicoError } = await supabase
        .from('contratos_locacao_reajustes')
        .select(`
          *,
          contrato:contratos_locacao(
            numero_contrato,
            contraparte:contrapartes(nome)
          )
        `)
        .order('data_aplicacao', { ascending: false })
        .limit(100)

      if (historicoError) throw historicoError

      setContratos(contratosData || [])
      setHistorico(historicoData || [])

    } catch (error) {
      console.error('Erro ao carregar dados:', error)
      showToast('Erro ao carregar dados', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Verificar se contrato precisa de reajuste
  const verificarReajustePendente = (contrato: ContratoParaReajuste): boolean => {
    if (!contrato.data_base_reajuste) return false
    
    const dataBase = new Date(contrato.data_base_reajuste)
    const hoje = new Date()
    const diffMeses = (hoje.getFullYear() - dataBase.getFullYear()) * 12 + (hoje.getMonth() - dataBase.getMonth())
    
    return diffMeses >= contrato.periodicidade_reajuste
  }

  const contratosPendentes = contratos.filter(verificarReajustePendente)

  // Aplicar reajuste (simulação - precisa integrar com índices)
  const aplicarReajuste = async (contrato: ContratoParaReajuste) => {
    setAplicandoReajuste(contrato.id)
    
    try {
      // TODO: Buscar índice real da tabela indices_economicos
      // Por enquanto, usar um valor simulado
      const percentualReajuste = 4.5 // Simular 4.5%
      const fator = 1 + (percentualReajuste / 100)
      const novoValor = contrato.valor_aluguel * fator

      // Registrar reajuste
      const { error: reajusteError } = await supabase
        .from('contratos_locacao_reajustes')
        .insert({
          contrato_id: contrato.id,
          data_aplicacao: new Date().toISOString().split('T')[0],
          indice_utilizado: contrato.indice_reajuste,
          competencia_inicio: '2024-01', // TODO: calcular dinamicamente
          competencia_fim: '2024-12',
          percentual_periodo: percentualReajuste,
          valor_anterior: contrato.valor_aluguel,
          valor_novo: novoValor,
          fator_aplicado: fator,
          parcelas_atualizadas: 0 // TODO: contar parcelas atualizadas
        })

      if (reajusteError) throw reajusteError

      // Atualizar valor do contrato
      const { error: contratoError } = await supabase
        .from('contratos_locacao')
        .update({ 
          valor_aluguel: novoValor,
          data_base_reajuste: new Date().toISOString().split('T')[0]
        })
        .eq('id', contrato.id)

      if (contratoError) throw contratoError

      // Atualizar parcelas futuras
      const { error: parcelasError } = await supabase
        .from('contratos_locacao_parcelas')
        .update({ 
          valor_reajustado: novoValor,
          indice_aplicado: contrato.indice_reajuste,
          fator_acumulado: fator
        })
        .eq('contrato_id', contrato.id)
        .eq('pago', false)

      if (parcelasError) throw parcelasError

      showToast('Reajuste aplicado com sucesso!', 'success')
      loadData()

    } catch (error) {
      console.error('Erro ao aplicar reajuste:', error)
      showToast('Erro ao aplicar reajuste', 'error')
    } finally {
      setAplicandoReajuste(null)
    }
  }

  return (
    <div style={{ padding: '32px', backgroundColor: '#fafafa', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ 
          fontSize: '28px', 
          fontWeight: '300', 
          color: '#1a1a1a', 
          margin: '0 0 8px 0',
          letterSpacing: '-0.5px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <Percent size={28} strokeWidth={1.5} />
          Reajustes de Locação
        </h1>
        <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
          Aplique reajustes de aluguel baseados nos índices econômicos
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ padding: '20px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '12px', color: '#666', margin: '0 0 8px 0', textTransform: 'uppercase' }}>Contratos Vigentes</p>
          <p style={{ fontSize: '28px', fontWeight: '600', color: '#1a1a1a', margin: 0 }}>{contratos.length}</p>
        </div>
        <div style={{ 
          padding: '20px', 
          backgroundColor: contratosPendentes.length > 0 ? '#fef3c7' : '#fff', 
          borderRadius: '12px', 
          border: `1px solid ${contratosPendentes.length > 0 ? '#fcd34d' : '#e5e7eb'}` 
        }}>
          <p style={{ fontSize: '12px', color: '#666', margin: '0 0 8px 0', textTransform: 'uppercase' }}>Reajustes Pendentes</p>
          <p style={{ fontSize: '28px', fontWeight: '600', color: contratosPendentes.length > 0 ? '#d97706' : '#1a1a1a', margin: 0 }}>
            {contratosPendentes.length}
          </p>
        </div>
        <div style={{ padding: '20px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '12px', color: '#666', margin: '0 0 8px 0', textTransform: 'uppercase' }}>Reajustes Aplicados</p>
          <p style={{ fontSize: '28px', fontWeight: '600', color: '#1a1a1a', margin: 0 }}>{historico.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => setActiveTab('pendentes')}
          style={{
            padding: '10px 20px',
            backgroundColor: activeTab === 'pendentes' ? '#1a1a1a' : '#fff',
            color: activeTab === 'pendentes' ? '#fff' : '#374151',
            border: activeTab === 'pendentes' ? 'none' : '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          Pendentes ({contratosPendentes.length})
        </button>
        <button
          onClick={() => setActiveTab('historico')}
          style={{
            padding: '10px 20px',
            backgroundColor: activeTab === 'historico' ? '#1a1a1a' : '#fff',
            color: activeTab === 'historico' ? '#fff' : '#374151',
            border: activeTab === 'historico' ? 'none' : '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          Histórico
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={loadData}
          style={{
            padding: '10px',
            backgroundColor: '#f5f5f5',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          <RefreshCw size={18} color="#666" />
        </button>
      </div>

      {/* Content */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <RefreshCw size={32} color="#999" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#666', marginTop: '16px' }}>Carregando...</p>
          </div>
        ) : activeTab === 'pendentes' ? (
          contratosPendentes.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <CheckCircle2 size={48} color="#16a34a" strokeWidth={1} />
              <p style={{ color: '#16a34a', marginTop: '16px', fontWeight: '500' }}>Todos os contratos estão em dia!</p>
              <p style={{ color: '#666', fontSize: '14px' }}>Não há reajustes pendentes no momento.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={thStyle}>Contrato</th>
                  <th style={thStyle}>Locatário</th>
                  <th style={thStyle}>Valor Atual</th>
                  <th style={thStyle}>Índice</th>
                  <th style={thStyle}>Data Base</th>
                  <th style={{ ...thStyle, width: '120px' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {contratosPendentes.map((contrato) => (
                  <tr key={contrato.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#1a1a1a' }}>
                        {contrato.numero_contrato || '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', color: '#374151' }}>
                        {contrato.contraparte?.nome || '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#1a1a1a' }}>
                        {formatCurrencyBRL(contrato.valor_aluguel)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '4px 8px',
                        backgroundColor: '#f3f4f6',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500'
                      }}>
                        {contrato.indice_reajuste}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', color: '#374151' }}>
                        {formatDate(contrato.data_base_reajuste)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => aplicarReajuste(contrato)}
                        disabled={aplicandoReajuste === contrato.id}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#1a1a1a',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: aplicandoReajuste === contrato.id ? 'default' : 'pointer',
                          opacity: aplicandoReajuste === contrato.id ? 0.7 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        {aplicandoReajuste === contrato.id ? (
                          <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                          <Play size={12} />
                        )}
                        Aplicar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          historico.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <FileText size={48} color="#ccc" strokeWidth={1} />
              <p style={{ color: '#666', marginTop: '16px' }}>Nenhum reajuste aplicado ainda</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={thStyle}>Data</th>
                  <th style={thStyle}>Contrato</th>
                  <th style={thStyle}>Locatário</th>
                  <th style={thStyle}>Índice</th>
                  <th style={thStyle}>Percentual</th>
                  <th style={thStyle}>Valor Anterior</th>
                  <th style={thStyle}>Valor Novo</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((reajuste) => (
                  <tr key={reajuste.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', color: '#374151' }}>
                        {formatDate(reajuste.data_aplicacao)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#1a1a1a' }}>
                        {reajuste.contrato?.numero_contrato || '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', color: '#374151' }}>
                        {reajuste.contrato?.contraparte?.nome || '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '4px 8px',
                        backgroundColor: '#f3f4f6',
                        borderRadius: '4px',
                        fontSize: '12px'
                      }}>
                        {reajuste.indice_utilizado}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ 
                        fontSize: '13px', 
                        color: reajuste.percentual_periodo > 0 ? '#16a34a' : '#dc2626',
                        fontWeight: '500'
                      }}>
                        {reajuste.percentual_periodo > 0 ? '+' : ''}{formatPercent(reajuste.percentual_periodo)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', color: '#666' }}>
                        {formatCurrencyBRL(reajuste.valor_anterior)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#1a1a1a' }}>
                        {formatCurrencyBRL(reajuste.valor_novo)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* Toasts */}
      <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              padding: '12px 16px',
              backgroundColor: toast.type === 'success' ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${toast.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
          >
            <span style={{ fontSize: '13px', color: '#374151' }}>{toast.message}</span>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: '600',
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderBottom: '1px solid #e5e7eb'
}

const tdStyle: React.CSSProperties = {
  padding: '14px 16px',
  verticalAlign: 'middle'
}