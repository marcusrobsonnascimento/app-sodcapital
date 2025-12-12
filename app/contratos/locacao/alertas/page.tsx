'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { 
  Bell,
  Search,
  RefreshCw,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  AlertTriangle,
  Filter,
  Check,
  X
} from 'lucide-react'

interface Alerta {
  id: string
  contrato_id: string
  tipo_evento: string
  descricao: string
  data_evento: string
  dias_alerta_antes: number
  recorrente: boolean
  status: string
  notificado_em: string | null
  contrato?: {
    numero_contrato: string
    contraparte: { nome: string }
  }
}

const formatDate = (date: string | null): string => {
  if (!date) return '—'
  const [year, month, day] = date.split('T')[0].split('-')
  return `${day}/${month}/${year}`
}

const getTipoEventoConfig = (tipo: string) => {
  const configs: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    'REAJUSTE': { label: 'Reajuste', color: '#2563eb', bg: '#eff6ff', icon: Calendar },
    'RENOVACAO': { label: 'Renovação', color: '#7c3aed', bg: '#f5f3ff', icon: RefreshCw },
    'VENCIMENTO_GARANTIA': { label: 'Vencimento Garantia', color: '#d97706', bg: '#fffbeb', icon: AlertTriangle },
    'NOTIFICACAO': { label: 'Notificação', color: '#0891b2', bg: '#ecfeff', icon: Bell },
    'CUSTOM': { label: 'Personalizado', color: '#6b7280', bg: '#f3f4f6', icon: Bell }
  }
  return configs[tipo] || configs['CUSTOM']
}

const getStatusConfig = (status: string) => {
  const configs: Record<string, { label: string; color: string; bg: string }> = {
    'PENDENTE': { label: 'Pendente', color: '#d97706', bg: '#fef3c7' },
    'NOTIFICADO': { label: 'Notificado', color: '#2563eb', bg: '#dbeafe' },
    'CONCLUIDO': { label: 'Concluído', color: '#16a34a', bg: '#dcfce7' },
    'CANCELADO': { label: 'Cancelado', color: '#6b7280', bg: '#f3f4f6' }
  }
  return configs[status] || configs['PENDENTE']
}

export default function AlertasLocacaoPage() {
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [tipoFilter, setTipoFilter] = useState('')

  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' }>>([])
  const [toastId, setToastId] = useState(0)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = toastId
    setToastId(prev => prev + 1)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }

  useEffect(() => {
    loadAlertas()
  }, [])

  const loadAlertas = async () => {
    try {
      setLoading(true)
      
      const { data, error } = await supabase
        .from('contratos_locacao_eventos')
        .select(`
          *,
          contrato:contratos_locacao(
            numero_contrato,
            contraparte:contrapartes(nome)
          )
        `)
        .order('data_evento', { ascending: true })

      if (error) throw error
      setAlertas(data || [])

    } catch (error) {
      console.error('Erro ao carregar alertas:', error)
      showToast('Erro ao carregar alertas', 'error')
    } finally {
      setLoading(false)
    }
  }

  const atualizarStatus = async (alerta: Alerta, novoStatus: string) => {
    try {
      const { error } = await supabase
        .from('contratos_locacao_eventos')
        .update({ 
          status: novoStatus,
          notificado_em: novoStatus === 'NOTIFICADO' ? new Date().toISOString() : alerta.notificado_em
        })
        .eq('id', alerta.id)

      if (error) throw error

      showToast('Status atualizado', 'success')
      loadAlertas()
    } catch (error) {
      console.error('Erro:', error)
      showToast('Erro ao atualizar status', 'error')
    }
  }

  // Calcular dias restantes
  const getDiasRestantes = (dataEvento: string): number => {
    const hoje = new Date()
    const evento = new Date(dataEvento)
    return Math.ceil((evento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
  }

  // Filtrar alertas
  const filteredAlertas = alertas.filter(a => {
    const matchStatus = !statusFilter || a.status === statusFilter
    const matchTipo = !tipoFilter || a.tipo_evento === tipoFilter
    return matchStatus && matchTipo
  })

  // Stats
  const hoje = new Date()
  const stats = {
    total: alertas.length,
    pendentes: alertas.filter(a => a.status === 'PENDENTE').length,
    proximos7dias: alertas.filter(a => {
      if (a.status !== 'PENDENTE') return false
      const dias = getDiasRestantes(a.data_evento)
      return dias >= 0 && dias <= 7
    }).length,
    atrasados: alertas.filter(a => {
      if (a.status !== 'PENDENTE') return false
      return getDiasRestantes(a.data_evento) < 0
    }).length
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
          <Bell size={28} strokeWidth={1.5} />
          Alertas de Contratos
        </h1>
        <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>
          Acompanhe eventos e prazos importantes dos contratos
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ padding: '20px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <p style={{ fontSize: '12px', color: '#666', margin: '0 0 8px 0', textTransform: 'uppercase' }}>Total de Alertas</p>
          <p style={{ fontSize: '28px', fontWeight: '600', color: '#1a1a1a', margin: 0 }}>{stats.total}</p>
        </div>
        <div style={{ 
          padding: '20px', 
          backgroundColor: stats.pendentes > 0 ? '#fef3c7' : '#fff', 
          borderRadius: '12px', 
          border: `1px solid ${stats.pendentes > 0 ? '#fcd34d' : '#e5e7eb'}` 
        }}>
          <p style={{ fontSize: '12px', color: '#666', margin: '0 0 8px 0', textTransform: 'uppercase' }}>Pendentes</p>
          <p style={{ fontSize: '28px', fontWeight: '600', color: stats.pendentes > 0 ? '#d97706' : '#1a1a1a', margin: 0 }}>{stats.pendentes}</p>
        </div>
        <div style={{ 
          padding: '20px', 
          backgroundColor: stats.proximos7dias > 0 ? '#eff6ff' : '#fff', 
          borderRadius: '12px', 
          border: `1px solid ${stats.proximos7dias > 0 ? '#bfdbfe' : '#e5e7eb'}` 
        }}>
          <p style={{ fontSize: '12px', color: '#666', margin: '0 0 8px 0', textTransform: 'uppercase' }}>Próximos 7 dias</p>
          <p style={{ fontSize: '28px', fontWeight: '600', color: stats.proximos7dias > 0 ? '#2563eb' : '#1a1a1a', margin: 0 }}>{stats.proximos7dias}</p>
        </div>
        <div style={{ 
          padding: '20px', 
          backgroundColor: stats.atrasados > 0 ? '#fef2f2' : '#fff', 
          borderRadius: '12px', 
          border: `1px solid ${stats.atrasados > 0 ? '#fecaca' : '#e5e7eb'}` 
        }}>
          <p style={{ fontSize: '12px', color: '#666', margin: '0 0 8px 0', textTransform: 'uppercase' }}>Atrasados</p>
          <p style={{ fontSize: '28px', fontWeight: '600', color: stats.atrasados > 0 ? '#dc2626' : '#1a1a1a', margin: 0 }}>{stats.atrasados}</p>
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
            minWidth: '150px'
          }}
        >
          <option value="">Todos os status</option>
          <option value="PENDENTE">Pendente</option>
          <option value="NOTIFICADO">Notificado</option>
          <option value="CONCLUIDO">Concluído</option>
          <option value="CANCELADO">Cancelado</option>
        </select>

        <select
          value={tipoFilter}
          onChange={(e) => setTipoFilter(e.target.value)}
          style={{
            padding: '10px 12px',
            fontSize: '14px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            outline: 'none',
            backgroundColor: '#fff',
            minWidth: '180px'
          }}
        >
          <option value="">Todos os tipos</option>
          <option value="REAJUSTE">Reajuste</option>
          <option value="RENOVACAO">Renovação</option>
          <option value="VENCIMENTO_GARANTIA">Vencimento Garantia</option>
          <option value="NOTIFICACAO">Notificação</option>
          <option value="CUSTOM">Personalizado</option>
        </select>

        <div style={{ flex: 1 }} />

        <button
          onClick={loadAlertas}
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
            <p style={{ color: '#666', marginTop: '16px' }}>Carregando alertas...</p>
          </div>
        ) : filteredAlertas.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <CheckCircle2 size={48} color="#16a34a" strokeWidth={1} />
            <p style={{ color: '#16a34a', marginTop: '16px', fontWeight: '500' }}>Tudo em dia!</p>
            <p style={{ color: '#666', fontSize: '14px' }}>Nenhum alerta encontrado.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Contrato</th>
                <th style={thStyle}>Descrição</th>
                <th style={thStyle}>Data</th>
                <th style={thStyle}>Dias</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, width: '120px' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlertas.map((alerta) => {
                const tipoConfig = getTipoEventoConfig(alerta.tipo_evento)
                const statusConfig = getStatusConfig(alerta.status)
                const TipoIcon = tipoConfig.icon
                const diasRestantes = getDiasRestantes(alerta.data_evento)
                const atrasado = diasRestantes < 0 && alerta.status === 'PENDENTE'

                return (
                  <tr key={alerta.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        backgroundColor: tipoConfig.bg,
                        color: tipoConfig.color,
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '500'
                      }}>
                        <TipoIcon size={12} />
                        {tipoConfig.label}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div>
                        <p style={{ fontSize: '14px', fontWeight: '500', color: '#1a1a1a', margin: 0 }}>
                          {alerta.contrato?.numero_contrato || '—'}
                        </p>
                        <p style={{ fontSize: '12px', color: '#666', margin: '2px 0 0 0' }}>
                          {alerta.contrato?.contraparte?.nome || '—'}
                        </p>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', color: '#374151' }}>
                        {alerta.descricao}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', color: '#374151' }}>
                        {formatDate(alerta.data_evento)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ 
                        fontSize: '13px', 
                        fontWeight: '500',
                        color: atrasado ? '#dc2626' : diasRestantes <= 7 ? '#d97706' : '#374151'
                      }}>
                        {atrasado ? `${Math.abs(diasRestantes)} dias atrás` : diasRestantes === 0 ? 'Hoje' : `${diasRestantes} dias`}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        backgroundColor: statusConfig.bg,
                        color: statusConfig.color,
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '500'
                      }}>
                        {statusConfig.label}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {alerta.status === 'PENDENTE' && (
                          <>
                            <button
                              onClick={() => atualizarStatus(alerta, 'CONCLUIDO')}
                              title="Marcar como concluído"
                              style={{
                                padding: '6px',
                                backgroundColor: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                borderRadius: '6px',
                                cursor: 'pointer'
                              }}
                            >
                              <Check size={14} color="#16a34a" />
                            </button>
                            <button
                              onClick={() => atualizarStatus(alerta, 'CANCELADO')}
                              title="Cancelar"
                              style={{
                                padding: '6px',
                                backgroundColor: '#f3f4f6',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                cursor: 'pointer'
                              }}
                            >
                              <X size={14} color="#6b7280" />
                            </button>
                          </>
                        )}
                        {alerta.status === 'CONCLUIDO' && (
                          <button
                            onClick={() => atualizarStatus(alerta, 'PENDENTE')}
                            title="Reabrir"
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#f3f4f6',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              color: '#666'
                            }}
                          >
                            Reabrir
                          </button>
                        )}
                      </div>
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