'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { 
  Calendar,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  DollarSign,
  FileText,
  ChevronDown,
  Eye
} from 'lucide-react'

interface Parcela {
  id: string
  contrato_id: string
  num_parcela: number
  competencia: string
  valor_original: number
  valor_reajustado: number
  data_vencimento: string
  pago: boolean
  data_pagamento: string | null
  fator_acumulado: number
  indice_aplicado: string | null
  contrato?: {
    numero_contrato: string
    empresa: { nome: string }
    contraparte: { nome: string }
    total_parcelas: number
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

const formatCompetencia = (comp: string): string => {
  const [year, month] = comp.split('-')
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${meses[parseInt(month) - 1]}/${year}`
}

export default function ParcelasLocacaoPage() {
  const [parcelas, setParcelas] = useState<Parcela[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [mesFilter, setMesFilter] = useState('')

  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' }>>([])
  const [toastId, setToastId] = useState(0)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = toastId
    setToastId(prev => prev + 1)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }

  useEffect(() => {
    loadParcelas()
  }, [])

  const loadParcelas = async () => {
    try {
      setLoading(true)
      
      const { data, error } = await supabase
        .from('contratos_locacao_parcelas')
        .select(`
          *,
          contrato:contratos_locacao(
            numero_contrato,
            total_parcelas,
            empresa:empresas(nome),
            contraparte:contrapartes(nome)
          )
        `)
        .order('data_vencimento', { ascending: true })
        .limit(500)

      if (error) throw error
      setParcelas(data || [])

    } catch (error) {
      console.error('Erro ao carregar parcelas:', error)
      showToast('Erro ao carregar parcelas', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleMarcarPago = async (parcela: Parcela) => {
    try {
      const { error } = await supabase
        .from('contratos_locacao_parcelas')
        .update({ 
          pago: !parcela.pago,
          data_pagamento: !parcela.pago ? new Date().toISOString().split('T')[0] : null
        })
        .eq('id', parcela.id)

      if (error) throw error

      showToast(parcela.pago ? 'Parcela desmarcada' : 'Parcela marcada como paga', 'success')
      loadParcelas()
    } catch (error) {
      console.error('Erro:', error)
      showToast('Erro ao atualizar parcela', 'error')
    }
  }

  // Filtrar parcelas
  const hoje = new Date()
  const filteredParcelas = parcelas.filter(p => {
    const matchSearch = !searchTerm || 
      p.contrato?.numero_contrato?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.contrato?.empresa?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.contrato?.contraparte?.nome?.toLowerCase().includes(searchTerm.toLowerCase())

    let matchStatus = true
    if (statusFilter === 'PAGO') matchStatus = p.pago
    if (statusFilter === 'PENDENTE') matchStatus = !p.pago && new Date(p.data_vencimento) >= hoje
    if (statusFilter === 'VENCIDO') matchStatus = !p.pago && new Date(p.data_vencimento) < hoje

    const matchMes = !mesFilter || p.competencia === mesFilter

    return matchSearch && matchStatus && matchMes
  })

  // Stats
  const stats = {
    total: parcelas.length,
    pagas: parcelas.filter(p => p.pago).length,
    pendentes: parcelas.filter(p => !p.pago && new Date(p.data_vencimento) >= hoje).length,
    vencidas: parcelas.filter(p => !p.pago && new Date(p.data_vencimento) < hoje).length,
    valorPendente: parcelas
      .filter(p => !p.pago)
      .reduce((sum, p) => sum + p.valor_reajustado, 0)
  }

  // Meses disponíveis para filtro
  const mesesDisponiveis = [...new Set(parcelas.map(p => p.competencia))].sort()

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
          <Calendar size={28} strokeWidth={1.5} />
          Parcelas de Locação
        </h1>
        <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
          Acompanhe o recebimento das parcelas de aluguel
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ padding: '20px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '12px', color: '#666', margin: '0 0 8px 0', textTransform: 'uppercase' }}>Total</p>
          <p style={{ fontSize: '24px', fontWeight: '600', color: '#1a1a1a', margin: 0 }}>{stats.total}</p>
        </div>
        <div style={{ padding: '20px', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
          <p style={{ fontSize: '12px', color: '#166534', margin: '0 0 8px 0', textTransform: 'uppercase' }}>Pagas</p>
          <p style={{ fontSize: '24px', fontWeight: '600', color: '#16a34a', margin: 0 }}>{stats.pagas}</p>
        </div>
        <div style={{ padding: '20px', backgroundColor: '#eff6ff', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
          <p style={{ fontSize: '12px', color: '#1e40af', margin: '0 0 8px 0', textTransform: 'uppercase' }}>Pendentes</p>
          <p style={{ fontSize: '24px', fontWeight: '600', color: '#2563eb', margin: 0 }}>{stats.pendentes}</p>
        </div>
        <div style={{ padding: '20px', backgroundColor: '#fef2f2', borderRadius: '12px', border: '1px solid #fecaca' }}>
          <p style={{ fontSize: '12px', color: '#991b1b', margin: '0 0 8px 0', textTransform: 'uppercase' }}>Vencidas</p>
          <p style={{ fontSize: '24px', fontWeight: '600', color: '#dc2626', margin: 0 }}>{stats.vencidas}</p>
        </div>
        <div style={{ padding: '20px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '12px', color: '#666', margin: '0 0 8px 0', textTransform: 'uppercase' }}>A Receber</p>
          <p style={{ fontSize: '20px', fontWeight: '600', color: '#1a1a1a', margin: 0 }}>{formatCurrencyBRL(stats.valorPendente)}</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        padding: '16px 20px',
        marginBottom: '16px',
        display: 'flex',
        gap: '12px',
        alignItems: 'center'
      }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={18} color="#999" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por contrato, empresa, locatário..."
            style={{
              width: '100%',
              padding: '10px 12px 10px 40px',
              fontSize: '14px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              outline: 'none'
            }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '10px 12px',
            fontSize: '14px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            outline: 'none',
            backgroundColor: '#fff',
            minWidth: '140px'
          }}
        >
          <option value="">Todos status</option>
          <option value="PAGO">Pagas</option>
          <option value="PENDENTE">Pendentes</option>
          <option value="VENCIDO">Vencidas</option>
        </select>

        <select
          value={mesFilter}
          onChange={(e) => setMesFilter(e.target.value)}
          style={{
            padding: '10px 12px',
            fontSize: '14px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            outline: 'none',
            backgroundColor: '#fff',
            minWidth: '140px'
          }}
        >
          <option value="">Todas competências</option>
          {mesesDisponiveis.map(mes => (
            <option key={mes} value={mes}>{formatCompetencia(mes)}</option>
          ))}
        </select>

        <button
          onClick={loadParcelas}
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

      {/* Table */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <RefreshCw size={32} color="#999" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#666', marginTop: '16px' }}>Carregando parcelas...</p>
          </div>
        ) : filteredParcelas.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <Calendar size={48} color="#ccc" strokeWidth={1} />
            <p style={{ color: '#666', marginTop: '16px' }}>Nenhuma parcela encontrada</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th style={thStyle}>Contrato</th>
                <th style={thStyle}>Locatário</th>
                <th style={thStyle}>Parcela</th>
                <th style={thStyle}>Competência</th>
                <th style={thStyle}>Vencimento</th>
                <th style={thStyle}>Valor</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, width: '100px' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredParcelas.map((parcela) => {
                const vencida = !parcela.pago && new Date(parcela.data_vencimento) < hoje
                
                return (
                  <tr 
                    key={parcela.id}
                    style={{ borderBottom: '1px solid #f3f4f6' }}
                  >
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: '#1a1a1a' }}>
                        {parcela.contrato?.numero_contrato || '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', color: '#374151' }}>
                        {parcela.contrato?.contraparte?.nome || '—'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', color: '#374151' }}>
                        {parcela.num_parcela}/{parcela.contrato?.total_parcelas || '?'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', color: '#374151' }}>
                        {formatCompetencia(parcela.competencia)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ 
                        fontSize: '13px', 
                        color: vencida ? '#dc2626' : '#374151',
                        fontWeight: vencida ? '500' : '400'
                      }}>
                        {formatDate(parcela.data_vencimento)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div>
                        <span style={{ fontSize: '14px', fontWeight: '500', color: '#1a1a1a' }}>
                          {formatCurrencyBRL(parcela.valor_reajustado)}
                        </span>
                        {parcela.valor_reajustado !== parcela.valor_original && (
                          <p style={{ fontSize: '11px', color: '#999', margin: '2px 0 0 0' }}>
                            Original: {formatCurrencyBRL(parcela.valor_original)}
                          </p>
                        )}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      {parcela.pago ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          backgroundColor: '#f0fdf4',
                          color: '#16a34a',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '500'
                        }}>
                          <CheckCircle2 size={12} />
                          Pago
                        </span>
                      ) : vencida ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          backgroundColor: '#fef2f2',
                          color: '#dc2626',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '500'
                        }}>
                          <AlertCircle size={12} />
                          Vencida
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          backgroundColor: '#eff6ff',
                          color: '#2563eb',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '500'
                        }}>
                          <Clock size={12} />
                          Pendente
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => handleMarcarPago(parcela)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: parcela.pago ? '#f5f5f5' : '#f0fdf4',
                          color: parcela.pago ? '#666' : '#16a34a',
                          border: `1px solid ${parcela.pago ? '#e5e7eb' : '#bbf7d0'}`,
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          fontWeight: '500'
                        }}
                      >
                        {parcela.pago ? 'Desmarcar' : 'Marcar Pago'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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