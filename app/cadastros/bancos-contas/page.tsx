'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Plus, Pencil, Trash2, Search, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

// Toast notification system
type ToastType = 'success' | 'warning' | 'error'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface BancoConta {
  id: string
  empresa_id: string
  banco_id: string
  agencia: string
  numero_conta: string
  pix_chave: string
  moeda: string
  saldo_inicial: number
  ativo: boolean
  banco_nome: string
  banco_codigo: string
  conta_contabil_codigo: string
  conta_contabil_descricao: string
  empresas?: { nome: string }
  bancos?: { nome: string, codigo: string }
}

interface Empresa {
  id: string
  nome: string
}

interface Banco {
  id: string
  codigo: string
  nome: string
}

const bancoContaSchema = z.object({
  empresa_id: z.string().min(1, 'Empresa é obrigatória'),
  banco_id: z.string().min(1, 'Banco é obrigatório'),
  agencia: z.string().optional(),
  numero_conta: z.string().optional(),
  pix_chave: z.string().optional(),
  moeda: z.string().default('BRL'),
  saldo_inicial: z.number().default(0),
  conta_contabil_codigo: z.string().optional(),
  conta_contabil_descricao: z.string().optional(),
  ativo: z.boolean().default(true)
})

type BancoContaForm = z.infer<typeof bancoContaSchema>

export default function BancosContasPage() {
  const [contas, setContas] = useState<BancoConta[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [bancos, setBancos] = useState<Banco[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)
  const [saldoInicialOriginal, setSaldoInicialOriginal] = useState<number | null>(null)

  const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<BancoContaForm>({
    resolver: zodResolver(bancoContaSchema),
    defaultValues: {
      moeda: 'BRL',
      saldo_inicial: 0,
      ativo: true
    }
  })

  const selectedBancoId = watch('banco_id')

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
    loadData()
  }, [])

  const loadData = async () => {
    try {
      await Promise.all([
        loadContas(),
        loadEmpresas(),
        loadBancos()
      ])
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadContas = async () => {
    try {
      const { data, error } = await supabase
        .from('bancos_contas')
        .select(`
          *,
          empresas (nome),
          bancos (nome, codigo)
        `)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Erro ao carregar contas:', error)
        showToast(`Erro: ${error.message}`, 'error')
        throw error
      }

      setContas(data || [])
      
    } catch (err: any) {
      console.error('Erro na função loadContas:', err)
      showToast('Erro ao carregar contas bancárias', 'error')
    }
  }

  const loadEmpresas = async () => {
    try {
      console.log('Carregando empresas...')
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome')

      if (error) {
        console.error('Erro detalhado ao carregar empresas:', error)
        showToast(`Erro ao carregar empresas: ${error.message}`, 'error')
        throw error
      }

      console.log('Empresas carregadas:', data)
      setEmpresas(data || [])
      
      if (!data || data.length === 0) {
        showToast('Nenhuma empresa ativa encontrada. Cadastre empresas primeiro.', 'warning')
      }
    } catch (err: any) {
      console.error('Erro ao carregar empresas:', err)
      showToast('Erro ao carregar lista de empresas', 'error')
    }
  }

  const loadBancos = async () => {
    try {
      console.log('Carregando bancos...')
      const { data, error } = await supabase
        .from('bancos')
        .select('id, codigo, nome')
        .eq('ativo', true)
        .order('codigo')

      if (error) {
        console.error('Erro detalhado ao carregar bancos:', error)
        showToast(`Erro ao carregar bancos: ${error.message}`, 'error')
        throw error
      }

      console.log('Bancos carregados:', data)
      setBancos(data || [])
      
      if (!data || data.length === 0) {
        showToast('Nenhum banco ativo encontrado. Cadastre bancos primeiro.', 'warning')
      }
    } catch (err: any) {
      console.error('Erro ao carregar bancos:', err)
      showToast('Erro ao carregar lista de bancos', 'error')
    }
  }

  const onSubmit = async (data: BancoContaForm) => {
    try {
      // Buscar informações do banco selecionado
      const bancoSelecionado = bancos.find(b => b.id === data.banco_id)
      
      const payload = {
        ...data,
        // Se estiver editando, usa o saldo inicial original (não permite alteração)
        saldo_inicial: editingId ? saldoInicialOriginal : data.saldo_inicial,
        banco_nome: bancoSelecionado?.nome || '',
        banco_codigo: bancoSelecionado?.codigo || ''
      }

      if (editingId) {
        const { error } = await supabase
          .from('bancos_contas')
          .update(payload)
          .eq('id', editingId)

        if (error) {
          throw new Error(`Erro ao atualizar conta: ${error.message}`)
        }
        showToast('Conta bancária atualizada com sucesso!', 'success')
      } else {
        const { error } = await supabase
          .from('bancos_contas')
          .insert([payload])

        if (error) {
          throw new Error(`Erro ao criar conta: ${error.message}`)
        }
        showToast('Conta bancária criada com sucesso!', 'success')
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
    if (errors.empresa_id) {
      showToast(errors.empresa_id.message, 'warning')
    } else if (errors.banco_id) {
      showToast(errors.banco_id.message, 'warning')
    }
  }

  const handleEdit = (conta: BancoConta) => {
    setEditingId(conta.id)
    setSaldoInicialOriginal(conta.saldo_inicial || 0)
    
    reset({
      empresa_id: conta.empresa_id,
      banco_id: conta.banco_id,
      agencia: conta.agencia || '',
      numero_conta: conta.numero_conta || '',
      pix_chave: conta.pix_chave || '',
      moeda: conta.moeda || 'BRL',
      saldo_inicial: conta.saldo_inicial || 0,
      conta_contabil_codigo: conta.conta_contabil_codigo || '',
      conta_contabil_descricao: conta.conta_contabil_descricao || '',
      ativo: conta.ativo
    })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    try {
      // Verificar se existem lançamentos vinculados a esta conta
      const { data: lancamentos, error: checkError } = await supabase
        .from('lancamentos')
        .select('id')
        .eq('banco_conta_id', id)
        .limit(1)

      if (checkError) {
        console.error('Erro ao verificar lançamentos:', checkError)
        showToast('Erro ao verificar vínculos com lançamentos', 'error')
        return
      }

      if (lancamentos && lancamentos.length > 0) {
        showToast('Não é possível excluir: existem lançamentos vinculados a esta conta', 'warning')
        return
      }

      if (!confirm('Tem certeza que deseja excluir esta conta bancária?')) return

      const { error } = await supabase
        .from('bancos_contas')
        .delete()
        .eq('id', id)

      if (error) throw error
      showToast('Conta bancária excluída com sucesso!', 'success')
      loadContas()
    } catch (err) {
      console.error('Erro ao excluir conta:', err)
      showToast('Erro ao excluir conta bancária', 'error')
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setSaldoInicialOriginal(null)
    reset({
      empresa_id: '',
      banco_id: '',
      agencia: '',
      numero_conta: '',
      pix_chave: '',
      moeda: 'BRL',
      saldo_inicial: 0,
      conta_contabil_codigo: '',
      conta_contabil_descricao: '',
      ativo: true
    })
  }

  const filteredContas = contas.filter(c => {
    const searchLower = searchTerm.toLowerCase()
    return (
      c.empresas?.nome?.toLowerCase().includes(searchLower) ||
      c.bancos?.nome?.toLowerCase().includes(searchLower) ||
      c.bancos?.codigo?.toLowerCase().includes(searchLower) ||
      c.agencia?.toLowerCase().includes(searchLower) ||
      c.numero_conta?.toLowerCase().includes(searchLower) ||
      c.pix_chave?.toLowerCase().includes(searchLower)
    )
  })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: '400px',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '3px solid #e5e7eb',
          borderTop: '3px solid #1555D6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <div style={{ fontSize: '14px', color: '#6b7280' }}>
          Carregando contas bancárias...
        </div>
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
        {/* Header with Title and Button */}
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
                Contas Bancárias
              </h1>
              <p style={{
                fontSize: '14px',
                color: '#6b7280'
              }}>
                Gerencie as contas bancárias das empresas
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

          {/* Search Bar */}
          <div style={{ position: 'relative' }}>
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
              placeholder="Buscar por empresa, banco, agência, conta ou PIX..."
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
                  Empresa
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
                  Banco
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
                  Agência / Conta
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
                  Chave PIX
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
                  Saldo Inicial
                </th>
                <th style={{
                  padding: '12px 24px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  width: '120px'
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
                  letterSpacing: '0.5px',
                  width: '120px'
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
                    {contas.length === 0 ? (
                      <div>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>💳</div>
                        <div style={{ fontWeight: '600', marginBottom: '8px' }}>Nenhuma conta cadastrada</div>
                        <div style={{ fontSize: '13px' }}>Clique em "Nova Conta" para começar</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
                        <div style={{ fontWeight: '600', marginBottom: '8px' }}>Nenhuma conta encontrada</div>
                        <div style={{ fontSize: '13px' }}>Tente buscar com outros termos</div>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredContas.map((conta) => (
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
                      fontWeight: '500',
                      color: '#111827'
                    }}>
                      {conta.empresas?.nome || '-'}
                    </td>
                    <td style={{
                      padding: '16px 24px',
                      fontSize: '14px',
                      color: '#374151'
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontWeight: '600', color: '#1555D6' }}>
                          {conta.bancos?.codigo || conta.banco_codigo}
                        </span>
                        <span style={{ fontSize: '13px', color: '#6b7280' }}>
                          {conta.bancos?.nome || conta.banco_nome}
                        </span>
                      </div>
                    </td>
                    <td style={{
                      padding: '16px 24px',
                      fontSize: '14px',
                      color: '#374151'
                    }}>
                      {conta.agencia && conta.numero_conta ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span>Ag: {conta.agencia}</span>
                          <span>Cc: {conta.numero_conta}</span>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td style={{
                      padding: '16px 24px',
                      fontSize: '13px',
                      color: '#6b7280',
                      fontFamily: 'monospace'
                    }}>
                      {conta.pix_chave || '-'}
                    </td>
                    <td style={{
                      padding: '16px 24px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#111827',
                      textAlign: 'right'
                    }}>
                      {formatCurrency(conta.saldo_inicial || 0)}
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
                          onClick={() => handleDelete(conta.id)}
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
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
              {editingId ? 'Editar Conta Bancária' : 'Nova Conta Bancária'}
            </h2>

            <form onSubmit={handleSubmit(onSubmit, onSubmitError)} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Empresa */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Empresa *
                </label>
                <select
                  {...register('empresa_id')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    cursor: 'pointer'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#1555D6'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <option value="">
                    {empresas.length === 0 ? 'Nenhuma empresa cadastrada' : 'Selecione uma empresa'}
                  </option>
                  {empresas.map(empresa => (
                    <option key={empresa.id} value={empresa.id}>
                      {empresa.nome}
                    </option>
                  ))}
                </select>
                {empresas.length === 0 && (
                  <p style={{
                    fontSize: '12px',
                    color: '#dc2626',
                    marginTop: '4px'
                  }}>
                    Cadastre empresas antes de criar uma conta bancária
                  </p>
                )}
              </div>

              {/* Banco */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Banco *
                </label>
                <select
                  {...register('banco_id')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    cursor: 'pointer'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#1555D6'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <option value="">
                    {bancos.length === 0 ? 'Nenhum banco cadastrado' : 'Selecione um banco'}
                  </option>
                  {bancos.map(banco => (
                    <option key={banco.id} value={banco.id}>
                      {banco.codigo} - {banco.nome}
                    </option>
                  ))}
                </select>
                {bancos.length === 0 && (
                  <p style={{
                    fontSize: '12px',
                    color: '#dc2626',
                    marginTop: '4px'
                  }}>
                    Cadastre bancos antes de criar uma conta bancária
                  </p>
                )}
              </div>

              {/* Agência e Conta */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Agência
                  </label>
                  <input
                    {...register('agencia')}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    placeholder="0000"
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

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Número da Conta
                  </label>
                  <input
                    {...register('numero_conta')}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    placeholder="00000-0"
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
              </div>

              {/* Chave PIX */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Chave PIX
                </label>
                <input
                  {...register('pix_chave')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  placeholder="CPF/CNPJ, E-mail, Telefone ou Chave Aleatória"
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

              {/* Moeda e Saldo Inicial */}
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '16px' }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Moeda
                  </label>
                  <select
                    {...register('moeda')}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s',
                      cursor: 'pointer'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <option value="BRL">BRL</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Saldo Inicial
                    {editingId && (
                      <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '400', marginLeft: '8px' }}>
                        (não editável)
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    {...register('saldo_inicial', { valueAsNumber: true })}
                    disabled={!!editingId}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s',
                      backgroundColor: editingId ? '#f9fafb' : 'white',
                      cursor: editingId ? 'not-allowed' : 'text',
                      color: editingId ? '#9ca3af' : '#111827'
                    }}
                    placeholder="0,00"
                    onFocus={(e) => {
                      if (!editingId) {
                        e.currentTarget.style.borderColor = '#1555D6'
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                  {editingId && (
                    <p style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginTop: '4px'
                    }}>
                      O saldo inicial não pode ser alterado após a criação da conta
                    </p>
                  )}
                </div>
              </div>

              {/* Conta Contábil */}
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '16px' }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Cód. Contábil
                  </label>
                  <input
                    {...register('conta_contabil_codigo')}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    placeholder="1.1.01.001"
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

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Descrição Contábil
                  </label>
                  <input
                    {...register('conta_contabil_descricao')}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    placeholder="Caixa e Equivalentes de Caixa"
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