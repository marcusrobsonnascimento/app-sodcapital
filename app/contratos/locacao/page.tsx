'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { usePanels } from '@/contexts/PanelContext'
import { 
  Plus, 
  Search, 
  Eye,
  Pencil,
  Trash2,
  FileText,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Home
} from 'lucide-react'

// Types
interface ContratoLocacao {
  id: string
  numero_contrato: string | null
  tipo_contrato: string
  objeto: string | null
  data_assinatura: string | null
  data_inicio_vigencia: string
  data_fim_vigencia: string | null
  prazo_meses: number | null
  total_parcelas: number | null
  valor_aluguel: number
  tipo_valor: string
  indice_reajuste: string
  status: string
  empresa_id: string
  contraparte_id: string | null
  created_at: string
  empresa?: { nome: string }
  contraparte?: { nome: string }
  parcelas_pagas?: number
  parcelas_total?: number
}

// Helpers
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

const getStatusConfig = (status: string) => {
  const configs: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    'MINUTA': { label: 'Minuta', color: '#6b7280', bg: '#f3f4f6', icon: FileText },
    'ASSINADO': { label: 'Assinado', color: '#2563eb', bg: '#eff6ff', icon: FileText },
    'VIGENTE': { label: 'Vigente', color: '#16a34a', bg: '#dcfce7', icon: CheckCircle2 },
    'ENCERRADO': { label: 'Encerrado', color: '#6b7280', bg: '#f3f4f6', icon: XCircle },
    'RESCINDIDO': { label: 'Rescindido', color: '#dc2626', bg: '#fef2f2', icon: AlertCircle }
  }
  return configs[status] || configs['MINUTA']
}

const getTipoContratoLabel = (tipo: string) => {
  const tipos: Record<string, string> = {
    'BTS': 'Built-to-Suit',
    'TIPICO': 'Típico',
    'ATIPICO': 'Atípico'
  }
  return tipos[tipo] || tipo
}

export default function ContratosLocacaoPage() {
  const { openPanel } = usePanels()
  const [contratos, setContratos] = useState<ContratoLocacao[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
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
    loadContratos()
  }, [])

  const loadContratos = async () => {
    try {
      setLoading(true)
      
      const { data, error } = await supabase
        .from('contratos_locacao')
        .select(`
          *,
          empresa:empresas(nome),
          contraparte:contrapartes(nome)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      if (data && data.length > 0) {
        const contratosWithParcelas = await Promise.all(
          data.map(async (contrato) => {
            const { data: parcelas } = await supabase
              .from('contratos_locacao_parcelas')
              .select('id, pago')
              .eq('contrato_id', contrato.id)

            return {
              ...contrato,
              parcelas_pagas: parcelas?.filter(p => p.pago).length || 0,
              parcelas_total: parcelas?.length || 0
            }
          })
        )
        setContratos(contratosWithParcelas)
      } else {
        setContratos([])
      }

    } catch (error) {
      console.error('Erro ao carregar contratos:', error)
      showToast('Erro ao carregar contratos', 'error')
    } finally {
      setLoading(false)
    }
  }

  const filteredContratos = contratos.filter(contrato => {
    const matchSearch = !searchTerm || 
      contrato.numero_contrato?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contrato.empresa?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contrato.contraparte?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contrato.objeto?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchStatus = !statusFilter || contrato.status === statusFilter
    const matchTipo = !tipoFilter || contrato.tipo_contrato === tipoFilter

    return matchSearch && matchStatus && matchTipo
  })

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este contrato?')) return

    try {
      const { error } = await supabase
        .from('contratos_locacao')
        .delete()
        .eq('id', id)

      if (error) throw error

      showToast('Contrato excluído com sucesso', 'success')
      loadContratos()
    } catch (error) {
      console.error('Erro ao excluir:', error)
      showToast('Erro ao excluir contrato', 'error')
    }
  }

  const handleNovoContrato = () => {
    openPanel('/contratos/locacao/novo', 'Novo Contrato de Locação', true)
  }

  const handleViewContrato = (id: string) => {
    openPanel(`/contratos/locacao/${id}`, 'Detalhes do Contrato', true)
  }

  const handleEditContrato = (id: string) => {
    openPanel(`/contratos/locacao/${id}/editar`, 'Editar Contrato', true)
  }

  const stats = {
    total: contratos.length,
    vigentes: contratos.filter(c => c.status === 'VIGENTE').length,
    valorMensal: contratos.filter(c => c.status === 'VIGENTE').reduce((sum, c) => sum + (c.valor_aluguel || 0), 0),
    vencendo30dias: contratos.filter(c => {
      if (!c.data_fim_vigencia) return false
      const fim = new Date(c.data_fim_vigencia)
      const hoje = new Date()
      const diff = (fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
      return diff > 0 && diff <= 30
    }).length
  }

  return (
    <div style={{ padding: '24px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <h1 style={{ 
              fontSize: '24px', 
              fontWeight: '600', 
              color: '#1e293b', 
              margin: '0 0 4px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Home size={24} color="#2563eb" />
              Contratos de Locação
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
              Gerencie seus contratos de locação imobiliária
            </p>
          </div>

          <button
            onClick={handleNovoContrato}
            style={{
              padding: '10px 20px',
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
          >
            <Plus size={18} />
            Novo Contrato
          </button>
        </div>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <div style={{ padding: '16px 20px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 6px 0', textTransform: 'uppercase', fontWeight: '500' }}>
              Total de Contratos
            </p>
            <p style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', margin: 0 }}>{stats.total}</p>
          </div>

          <div style={{ padding: '16px 20px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 6px 0', textTransform: 'uppercase', fontWeight: '500' }}>
              Contratos Vigentes
            </p>
            <p style={{ fontSize: '24px', fontWeight: '600', color: '#16a34a', margin: 0 }}>{stats.vigentes}</p>
          </div>

          <div style={{ padding: '16px 20px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 6px 0', textTransform: 'uppercase', fontWeight: '500' }}>
              Receita Mensal
            </p>
            <p style={{ fontSize: '24px', fontWeight: '600', color: '#1e293b', margin: 0 }}>{formatCurrencyBRL(stats.valorMensal)}</p>
          </div>

          <div style={{ 
            padding: '16px 20px', 
            backgroundColor: stats.vencendo30dias > 0 ? '#fffbeb' : '#fff', 
            borderRadius: '8px', 
            border: `1px solid ${stats.vencendo30dias > 0 ? '#fcd34d' : '#e2e8f0'}` 
          }}>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 6px 0', textTransform: 'uppercase', fontWeight: '500' }}>
              Vencendo em 30 dias
            </p>
            <p style={{ fontSize: '24px', fontWeight: '600', color: stats.vencendo30dias > 0 ? '#d97706' : '#1e293b', margin: 0 }}>
              {stats.vencendo30dias}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        padding: '12px 16px',
        marginBottom: '16px',
        display: 'flex',
        gap: '12px',
        alignItems: 'center'
      }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por número, empresa, locatário..."
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              fontSize: '14px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              outline: 'none'
            }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            fontSize: '14px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            outline: 'none',
            backgroundColor: '#fff',
            minWidth: '140px',
            color: '#475569'
          }}
        >
          <option value="">Todos os status</option>
          <option value="MINUTA">Minuta</option>
          <option value="ASSINADO">Assinado</option>
          <option value="VIGENTE">Vigente</option>
          <option value="ENCERRADO">Encerrado</option>
          <option value="RESCINDIDO">Rescindido</option>
        </select>

        <select
          value={tipoFilter}
          onChange={(e) => setTipoFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            fontSize: '14px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            outline: 'none',
            backgroundColor: '#fff',
            minWidth: '140px',
            color: '#475569'
          }}
        >
          <option value="">Todos os tipos</option>
          <option value="BTS">Built-to-Suit</option>
          <option value="TIPICO">Típico</option>
          <option value="ATIPICO">Atípico</option>
        </select>

        <button
          onClick={loadContratos}
          style={{
            padding: '8px 16px',
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '14px',
            color: '#475569',
            fontWeight: '500'
          }}
        >
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      {/* Table */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <RefreshCw size={28} color="#94a3b8" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#64748b', marginTop: '12px', fontSize: '14px' }}>Carregando contratos...</p>
          </div>
        ) : filteredContratos.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <Home size={40} color="#cbd5e1" strokeWidth={1.5} />
            <p style={{ color: '#64748b', marginTop: '12px', fontSize: '14px' }}>
              {contratos.length === 0 ? 'Nenhum contrato cadastrado' : 'Nenhum contrato encontrado'}
            </p>
            {contratos.length === 0 && (
              <button
                onClick={handleNovoContrato}
                style={{
                  marginTop: '12px',
                  padding: '8px 16px',
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                Cadastrar primeiro contrato
              </button>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                <th style={thStyle}>Contrato</th>
                <th style={thStyle}>Locador</th>
                <th style={thStyle}>Locatário</th>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Vigência</th>
                <th style={thStyle}>Aluguel</th>
                <th style={thStyle}>Parcelas</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, width: '100px' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredContratos.map((contrato) => {
                const statusConfig = getStatusConfig(contrato.status)
                const StatusIcon = statusConfig.icon

                return (
                  <tr 
                    key={contrato.id}
                    style={{ borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={tdStyle}>
                      <div>
                        <p style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b', margin: 0 }}>
                          {contrato.numero_contrato || '—'}
                        </p>
                        {contrato.objeto && (
                          <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0 0', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {contrato.objeto}
                          </p>
                        )}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', color: '#475569' }}>{contrato.empresa?.nome || '—'}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '13px', color: '#475569' }}>{contrato.contraparte?.nome || '—'}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        backgroundColor: '#f1f5f9',
                        borderRadius: '4px',
                        color: '#475569',
                        fontWeight: '500'
                      }}>
                        {getTipoContratoLabel(contrato.tipo_contrato)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div>
                        <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>{formatDate(contrato.data_inicio_vigencia)}</p>
                        <p style={{ fontSize: '11px', color: '#94a3b8', margin: '2px 0 0 0' }}>até {formatDate(contrato.data_fim_vigencia)}</p>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b' }}>
                        {formatCurrencyBRL(contrato.valor_aluguel)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          flex: 1,
                          height: '6px',
                          backgroundColor: '#e2e8f0',
                          borderRadius: '3px',
                          overflow: 'hidden',
                          maxWidth: '60px'
                        }}>
                          <div style={{
                            width: `${contrato.parcelas_total ? (contrato.parcelas_pagas || 0) / contrato.parcelas_total * 100 : 0}%`,
                            height: '100%',
                            backgroundColor: '#16a34a',
                            borderRadius: '3px'
                          }} />
                        </div>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          {contrato.parcelas_pagas || 0}/{contrato.parcelas_total || 0}
                        </span>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        backgroundColor: statusConfig.bg,
                        color: statusConfig.color,
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '500'
                      }}>
                        <StatusIcon size={11} />
                        {statusConfig.label}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => handleViewContrato(contrato.id)} title="Visualizar" style={actionBtnStyle}>
                          <Eye size={14} color="#2563eb" />
                        </button>
                        <button onClick={() => handleEditContrato(contrato.id)} title="Editar" style={actionBtnStyle}>
                          <Pencil size={14} color="#f59e0b" />
                        </button>
                        <button onClick={() => handleDelete(contrato.id)} title="Excluir" style={{ ...actionBtnStyle, backgroundColor: '#fef2f2' }}>
                          <Trash2 size={14} color="#dc2626" />
                        </button>
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
      <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              padding: '12px 16px',
              backgroundColor: toast.type === 'success' ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${toast.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {toast.type === 'success' ? <CheckCircle2 size={16} color="#16a34a" /> : <AlertCircle size={16} color="#dc2626" />}
            <span style={{ fontSize: '13px', color: '#374151' }}>{toast.message}</span>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: '11px',
  fontWeight: '600',
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  borderBottom: '1px solid #e2e8f0'
}

const tdStyle: React.CSSProperties = {
  padding: '12px',
  verticalAlign: 'middle'
}

const actionBtnStyle: React.CSSProperties = {
  padding: '6px',
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '4px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
}