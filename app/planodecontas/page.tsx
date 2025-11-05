'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, Search, CheckCircle, AlertTriangle, XCircle, Filter } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { 
  PlanoContaFluxo, 
  PlanoContaFluxoForm, 
  TipoFluxo, 
  Sentido,
  derivarSentidoDoCodigo,
  validarCodigoConta 
} from '../types/plano-contas'

// Toast notification system
type ToastType = 'success' | 'warning' | 'error'

interface Toast {
  id: number
  message: string
  type: ToastType
}

const planoContaSchema = z.object({
  codigo_conta: z.string()
    .min(1, 'Código é obrigatório')
    .refine(
      (val) => validarCodigoConta(val),
      { message: 'Formato inválido. Use: 1.01.01 ou 1.01.01.01' }
    ),
  tipo_fluxo: z.enum(['Operacional', 'Investimento', 'Financiamento'], {
    errorMap: () => ({ message: 'Selecione um tipo de fluxo' })
  }),
  grupo: z.string().optional(),
  categoria: z.string()
    .min(1, 'Categoria é obrigatória')
    .max(100, 'Categoria deve ter no máximo 100 caracteres')
    .transform(val => val.toUpperCase()),
  subcategoria: z.string()
    .min(1, 'Subcategoria é obrigatória')
    .max(100, 'Subcategoria deve ter no máximo 100 caracteres')
    .transform(val => val.toUpperCase()),
  dre_grupo: z.string().optional(),
  ativo: z.boolean().default(true)
})

type PlanoContaFormData = z.infer<typeof planoContaSchema>

export default function PlanoContasPage() {
  const [contas, setContas] = useState<PlanoContaFluxo[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deletingConta, setDeletingConta] = useState<PlanoContaFluxo | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [tipoFluxoFilter, setTipoFluxoFilter] = useState<TipoFluxo | 'TODOS'>('TODOS')
  const [sentidoFilter, setSentidoFilter] = useState<Sentido | 'TODOS'>('TODOS')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)

  const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<PlanoContaFormData>({
    resolver: zodResolver(planoContaSchema),
    defaultValues: {
      ativo: true
    }
  })

  const codigoValue = watch('codigo_conta')

  // Toast functions
  const showToast = (message: string, type: ToastType) => {
    const id = toastIdCounter
    setToastIdCounter(prev => prev + 1)
    
    const newToast: Toast = { id, message, type }
    setToasts(prev => [...prev, newToast])
    
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }, 3000)
  }

  const getToastStyles = (type: ToastType) => {
    switch (type) {
      case 'success':
        return {
          borderColor: '#10b981',
          icon: CheckCircle,
          iconColor: '#10b981'
        }
      case 'warning':
        return {
          borderColor: '#eab308',
          icon: AlertTriangle,
          iconColor: '#eab308'
        }
      case 'error':
        return {
          borderColor: '#ef4444',
          icon: XCircle,
          iconColor: '#ef4444'
        }
    }
  }

  useEffect(() => {
    loadContas()
  }, [])

  const loadContas = async () => {
    try {
      const { data, error } = await supabase
        .from('plano_contas_fluxo')
        .select('*')
        .order('codigo_conta', { ascending: true })

      if (error) throw error
      setContas(data || [])
    } catch (err) {
      console.error('Erro ao carregar plano de contas:', err)
      showToast('Erro ao carregar plano de contas', 'error')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data: PlanoContaFormData) => {
    try {
      // Derivar sentido do código
      const sentido = derivarSentidoDoCodigo(data.codigo_conta)
      
      const payload = {
        ...data,
        sentido,
        updated_at: new Date().toISOString()
      }

      if (editingId) {
        const { error } = await supabase
          .from('plano_contas_fluxo')
          .update(payload)
          .eq('id', editingId)

        if (error) {
          console.error('Erro detalhado ao atualizar:', error)
          
          if (error.code === '23505') {
            throw new Error('Já existe uma conta com esse código')
          }
          
          throw new Error(`Erro ao atualizar conta: ${error.message}`)
        }
        showToast('Conta atualizada com sucesso!', 'success')
      } else {
        const { error } = await supabase
          .from('plano_contas_fluxo')
          .insert([payload])

        if (error) {
          console.error('Erro detalhado ao criar:', error)
          
          if (error.code === '23505') {
            throw new Error('Já existe uma conta com esse código')
          }
          
          throw new Error(`Erro ao criar conta: ${error.message}`)
        }
        showToast('Conta criada com sucesso!', 'success')
      }

      loadContas()
      closeModal()
    } catch (err: any) {
      console.error('Erro ao salvar conta:', err)
      const errorMessage = err.message || 'Erro desconhecido ao salvar conta'
      showToast(errorMessage, 'error')
    }
  }

  const onSubmitError = (errors: any) => {
    if (errors.codigo_conta) {
      showToast(errors.codigo_conta.message, 'warning')
    } else if (errors.tipo_fluxo) {
      showToast(errors.tipo_fluxo.message, 'warning')
    } else if (errors.categoria) {
      showToast(errors.categoria.message, 'warning')
    } else if (errors.subcategoria) {
      showToast(errors.subcategoria.message, 'warning')
    }
  }

  const handleEdit = (conta: PlanoContaFluxo) => {
    setEditingId(conta.id)
    reset({
      codigo_conta: conta.codigo_conta,
      tipo_fluxo: conta.tipo_fluxo,
      grupo: conta.grupo || '',
      categoria: conta.categoria,
      subcategoria: conta.subcategoria,
      dre_grupo: conta.dre_grupo || '',
      ativo: conta.ativo
    })
    setShowModal(true)
  }

  const openDeleteModal = (conta: PlanoContaFluxo) => {
    setDeleteId(conta.id)
    setDeletingConta(conta)
    setShowDeleteModal(true)
  }

  const closeDeleteModal = () => {
    setShowDeleteModal(false)
    setDeleteId(null)
    setDeletingConta(null)
  }

  const confirmDelete = async () => {
    if (!deleteId) return

    try {
      const { error } = await supabase
        .from('plano_contas_fluxo')
        .delete()
        .eq('id', deleteId)

      if (error) throw error
      showToast('Conta excluída com sucesso!', 'success')
      loadContas()
      closeDeleteModal()
    } catch (err) {
      console.error('Erro ao excluir conta:', err)
      showToast('Erro ao excluir conta', 'error')
      closeDeleteModal()
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    reset({
      codigo_conta: '',
      tipo_fluxo: 'Operacional',
      grupo: '',
      categoria: '',
      subcategoria: '',
      dre_grupo: '',
      ativo: true
    })
  }

  const filteredContas = contas.filter(c => {
    const matchesSearch = 
      c.codigo_conta.includes(searchTerm) ||
      c.categoria.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.subcategoria.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.grupo && c.grupo.toLowerCase().includes(searchTerm.toLowerCase()))
    
    const matchesTipoFluxo = tipoFluxoFilter === 'TODOS' || c.tipo_fluxo === tipoFluxoFilter
    const matchesSentido = sentidoFilter === 'TODOS' || c.sentido === sentidoFilter

    return matchesSearch && matchesTipoFluxo && matchesSentido
  })

  const getSentidoBadgeColor = (sentido: Sentido | null) => {
    if (sentido === 'Entrada') return { bg: '#dcfce7', color: '#16a34a' }
    if (sentido === 'Saida') return { bg: '#fee2e2', color: '#dc2626' }
    return { bg: '#f3f4f6', color: '#6b7280' }
  }

  const getTipoFluxoBadgeColor = (tipo: TipoFluxo) => {
    switch (tipo) {
      case 'Operacional': return { bg: '#dbeafe', color: '#1d4ed8' }
      case 'Investimento': return { bg: '#fef3c7', color: '#b45309' }
      case 'Financiamento': return { bg: '#e0e7ff', color: '#6366f1' }
    }
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: '400px'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '3px solid #e5e7eb',
          borderTop: '3px solid #1555D6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      {/* Main Content */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '32px',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '24px'
          }}>
            <div>
              <h1 style={{
                fontSize: '28px',
                fontWeight: '700',
                color: '#111827',
                marginBottom: '4px'
              }}>
                Plano de Contas (Fluxo)
              </h1>
              <p style={{
                fontSize: '14px',
                color: '#6b7280'
              }}>
                Gerencie o plano de contas unificado para fluxo de caixa
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
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
              Nova Conta
            </button>
          </div>

          {/* Search and Filters */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {/* Search Bar */}
            <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
              <Search style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '20px',
                height: '20px',
                color: '#9ca3af'
              }} />
              <input
                type="text"
                placeholder="Buscar por código, categoria ou subcategoria..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px 12px 48px',
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

            {/* Tipo Fluxo Filter */}
            <select
              value={tipoFluxoFilter}
              onChange={(e) => setTipoFluxoFilter(e.target.value as TipoFluxo | 'TODOS')}
              style={{
                padding: '12px 16px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: 'pointer',
                backgroundColor: 'white'
              }}
            >
              <option value="TODOS">Todos os Tipos</option>
              <option value="Operacional">Operacional</option>
              <option value="Investimento">Investimento</option>
              <option value="Financiamento">Financiamento</option>
            </select>

            {/* Sentido Filter */}
            <select
              value={sentidoFilter}
              onChange={(e) => setSentidoFilter(e.target.value as Sentido | 'TODOS')}
              style={{
                padding: '12px 16px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: 'pointer',
                backgroundColor: 'white'
              }}
            >
              <option value="TODOS">Todos os Sentidos</option>
              <option value="Entrada">Entrada</option>
              <option value="Saida">Saída</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{
                  padding: '12px 24px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Código
                </th>
                <th style={{
                  padding: '12px 24px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Categoria
                </th>
                <th style={{
                  padding: '12px 24px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Subcategoria
                </th>
                <th style={{
                  padding: '12px 24px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Tipo Fluxo
                </th>
                <th style={{
                  padding: '12px 24px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Sentido
                </th>
                <th style={{
                  padding: '12px 24px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Status
                </th>
                <th style={{
                  padding: '12px 24px',
                  textAlign: 'right',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredContas.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{
                    padding: '48px 24px',
                    textAlign: 'center',
                    color: '#9ca3af',
                    fontSize: '14px'
                  }}>
                    Nenhuma conta encontrada
                  </td>
                </tr>
              ) : (
                filteredContas.map((conta) => {
                  const sentidoColors = getSentidoBadgeColor(conta.sentido)
                  const tipoColors = getTipoFluxoBadgeColor(conta.tipo_fluxo)
                  
                  return (
                    <tr
                      key={conta.id}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{
                        padding: '16px 24px',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#111827',
                        fontFamily: 'monospace'
                      }}>
                        {conta.codigo_conta}
                      </td>
                      <td style={{
                        padding: '16px 24px',
                        fontSize: '14px',
                        color: '#111827'
                      }}>
                        {conta.categoria}
                      </td>
                      <td style={{
                        padding: '16px 24px',
                        fontSize: '14px',
                        color: '#6b7280'
                      }}>
                        {conta.subcategoria}
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          borderRadius: '12px',
                          backgroundColor: tipoColors.bg,
                          color: tipoColors.color
                        }}>
                          {conta.tipo_fluxo}
                        </span>
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          borderRadius: '12px',
                          backgroundColor: sentidoColors.bg,
                          color: sentidoColors.color
                        }}>
                          {conta.sentido || '-'}
                        </span>
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          borderRadius: '12px',
                          backgroundColor: conta.ativo ? '#dcfce7' : '#f3f4f6',
                          color: conta.ativo ? '#16a34a' : '#6b7280'
                        }}>
                          {conta.ativo ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td style={{ padding: '16px 24px' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '8px'
                        }}>
                          <button
                            onClick={() => handleEdit(conta)}
                            style={{
                              padding: '8px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'background-color 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <Pencil style={{ width: '16px', height: '16px', color: '#6b7280' }} />
                          </button>
                          <button
                            onClick={() => openDeleteModal(conta)}
                            style={{
                              padding: '8px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'background-color 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <Trash2 style={{ width: '16px', height: '16px', color: '#dc2626' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Edição/Criação */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            backdropFilter: 'blur(4px)'
          }}
          onClick={closeModal}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              padding: '32px',
              width: '100%',
              maxWidth: '600px',
              margin: '16px',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '24px'
            }}>
              {editingId ? 'Editar Conta' : 'Nova Conta'}
            </h2>

            <form onSubmit={handleSubmit(onSubmit, onSubmitError)} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Código da Conta */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Código da Conta *
                </label>
                <input
                  {...register('codigo_conta')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    fontFamily: 'monospace'
                  }}
                  placeholder="1.01.01.01"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#1555D6'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                {codigoValue && (
                  <p style={{
                    marginTop: '4px',
                    fontSize: '12px',
                    color: '#6b7280'
                  }}>
                    Sentido derivado: <strong>{derivarSentidoDoCodigo(codigoValue) || 'Nenhum'}</strong>
                  </p>
                )}
              </div>

              {/* Tipo de Fluxo */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Tipo de Fluxo *
                </label>
                <select
                  {...register('tipo_fluxo')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="Operacional">Operacional</option>
                  <option value="Investimento">Investimento</option>
                  <option value="Financiamento">Financiamento</option>
                </select>
              </div>

              {/* Grupo (opcional) */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Grupo (opcional)
                </label>
                <input
                  {...register('grupo')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    textTransform: 'uppercase'
                  }}
                  placeholder="GRUPO"
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

              {/* Categoria */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Categoria *
                </label>
                <input
                  {...register('categoria')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    textTransform: 'uppercase'
                  }}
                  placeholder="CATEGORIA"
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

              {/* Subcategoria */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Subcategoria *
                </label>
                <input
                  {...register('subcategoria')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    textTransform: 'uppercase'
                  }}
                  placeholder="SUBCATEGORIA"
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

              {/* DRE Grupo (opcional) */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  DRE Grupo (opcional)
                </label>
                <input
                  {...register('dre_grupo')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    textTransform: 'uppercase'
                  }}
                  placeholder="DRE GRUPO"
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

              {/* Ativo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  {...register('ativo')}
                  id="ativo"
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                    accentColor: '#1555D6'
                  }}
                />
                <label
                  htmlFor="ativo"
                  style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    cursor: 'pointer'
                  }}
                >
                  Conta ativa
                </label>
              </div>

              {/* Buttons */}
              <div style={{
                display: 'flex',
                gap: '12px',
                paddingTop: '8px'
              }}>
                <button
                  type="button"
                  onClick={closeModal}
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
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '12px 24px',
                    backgroundColor: '#1555D6',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1044b5'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1555D6'}
                >
                  {editingId ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {showDeleteModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            backdropFilter: 'blur(4px)'
          }}
          onClick={closeDeleteModal}
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
              <AlertTriangle style={{ width: '28px', height: '28px', color: '#dc2626' }} />
            </div>

            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '12px',
              textAlign: 'center'
            }}>
              Excluir Conta
            </h2>

            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              textAlign: 'center',
              marginBottom: '8px',
              lineHeight: '1.5'
            }}>
              Tem certeza que deseja excluir a conta
            </p>
            
            {deletingConta && (
              <>
                <p style={{
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#111827',
                  textAlign: 'center',
                  marginBottom: '4px',
                  fontFamily: 'monospace'
                }}>
                  {deletingConta.codigo_conta}
                </p>
                <p style={{
                  fontSize: '14px',
                  color: '#6b7280',
                  textAlign: 'center',
                  marginBottom: '24px'
                }}>
                  {deletingConta.categoria} - {deletingConta.subcategoria}?
                </p>
              </>
            )}

            <p style={{
              fontSize: '13px',
              color: '#ef4444',
              textAlign: 'center',
              marginBottom: '24px',
              fontWeight: '500'
            }}>
              Esta ação não pode ser desfeita.
            </p>

            <div style={{
              display: 'flex',
              gap: '12px'
            }}>
              <button
                onClick={closeDeleteModal}
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
                onClick={confirmDelete}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  backgroundColor: '#dc2626',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#b91c1c'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
              >
                Sim, Excluir
              </button>
            </div>
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
                minWidth: '300px',
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