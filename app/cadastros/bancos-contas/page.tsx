'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatCurrency } from '@/lib/utils'
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

const contaSchema = z.object({
  banco_id: z.string().min(1, 'Banco é obrigatório'),
  agencia: z.string()
    .max(10, 'Agência deve ter no máximo 10 caracteres')
    .optional(),
  numero_conta: z.string()
    .min(1, 'Conta é obrigatória')
    .max(20, 'Conta deve ter no máximo 20 caracteres'),
  pix_chave: z.string()
    .max(50, 'Chave PIX deve ter no máximo 50 caracteres')
    .optional(),
  empresa_id: z.string().min(1, 'Empresa é obrigatória'),
  saldo_inicial: z.number().default(0),
  moeda: z.string().default('BRL'),
  ativo: z.boolean().default(true)
})

type ContaForm = z.infer<typeof contaSchema>

export default function BancosContasPage() {
  const [contas, setContas] = useState<any[]>([])
  const [empresas, setEmpresas] = useState<any[]>([])
  const [bancos, setBancos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)
  const [agenciaValue, setAgenciaValue] = useState('')
  const [contaValue, setContaValue] = useState('')
  const [pixValue, setPixValue] = useState('')
  const [bancoSearchTerm, setBancoSearchTerm] = useState('')
  const [showBancoDropdown, setShowBancoDropdown] = useState(false)
  const [selectedBancoId, setSelectedBancoId] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [contaToDelete, setContaToDelete] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<ContaForm>({
    resolver: zodResolver(contaSchema),
    defaultValues: {
      saldo_inicial: 0,
      moeda: 'BRL',
      ativo: true
    }
  })

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

  // Filter bancos based on search term
  const filteredBancos = bancos.filter(banco =>
    banco.nome.toLowerCase().includes(bancoSearchTerm.toLowerCase()) ||
    banco.codigo.includes(bancoSearchTerm)
  )

  const handleBancoSelect = (banco: any) => {
    setSelectedBancoId(banco.id)
    setBancoSearchTerm(`${banco.codigo} - ${banco.nome}`)
    setValue('banco_id', banco.id)
    setShowBancoDropdown(false)
  }

  const handleBancoInputChange = (value: string) => {
    setBancoSearchTerm(value)
    setShowBancoDropdown(true)
    if (!value) {
      setSelectedBancoId('')
      setValue('banco_id', '')
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      // Load empresas
      const { data: empresasData } = await supabase
        .from('empresas')
        .select('*')
        .eq('ativo', true)
        .order('nome')

      setEmpresas(empresasData || [])

      // Load bancos
      const { data: bancosData } = await supabase
        .from('bancos')
        .select('*')
        .eq('ativo', true)
        .order('nome', { ascending: true })

      setBancos(bancosData || [])

      // Load contas with banco and empresa names
      const { data: contasData, error } = await supabase
        .from('bancos_contas')
        .select('*, empresas(nome), bancos(codigo, nome)')
        .order('created_at', { ascending: false })

      if (error) throw error
      
      // Debug: verificar dados retornados
      console.log('Contas carregadas:', contasData)
      
      setContas(contasData || [])
    } catch (err) {
      console.error('Erro ao carregar contas:', err)
      showToast('Erro ao carregar contas bancárias', 'error')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data: ContaForm) => {
    try {
      // Buscar o nome do banco selecionado
      const bancoSelecionado = bancos.find(b => b.id === data.banco_id)
      
      // Debug
      console.log('Banco selecionado:', bancoSelecionado)
      console.log('banco_id:', data.banco_id)
      
      const dataComBancoNome = {
        ...data,
        banco_nome: bancoSelecionado?.nome || '',
        banco_codigo: bancoSelecionado?.codigo || ''
      }
      
      console.log('Dados a serem salvos:', dataComBancoNome)

      if (editingId) {
        const { error } = await supabase
          .from('bancos_contas')
          .update(dataComBancoNome)
          .eq('id', editingId)

        if (error) {
          console.error('Erro detalhado ao atualizar:', error)
          throw new Error(`Erro ao atualizar conta: ${error.message}`)
        }
        showToast('Conta bancária atualizada com sucesso!', 'success')
      } else {
        const { error } = await supabase
          .from('bancos_contas')
          .insert([dataComBancoNome])

        if (error) {
          console.error('Erro detalhado ao criar:', error)
          throw new Error(`Erro ao criar conta: ${error.message}`)
        }
        showToast('Conta bancária criada com sucesso!', 'success')
      }

      loadData()
      closeModal()
    } catch (err: any) {
      console.error('Erro ao salvar conta:', err)
      const errorMessage = err.message || 'Erro desconhecido ao salvar conta'
      showToast(errorMessage, 'error')
    }
  }

  const onSubmitError = (errors: any) => {
    if (errors.banco_id) {
      showToast(errors.banco_id.message, 'warning')
    } else if (errors.agencia) {
      showToast(errors.agencia.message, 'warning')
    } else if (errors.numero_conta) {
      showToast(errors.numero_conta.message, 'warning')
    } else if (errors.pix_chave) {
      showToast(errors.pix_chave.message, 'warning')
    } else if (errors.empresa_id) {
      showToast(errors.empresa_id.message, 'warning')
    }
  }

  const handleEdit = (conta: any) => {
    setEditingId(conta.id)
    const agencia = conta.agencia || ''
    const numeroConta = conta.numero_conta || ''
    const pix = conta.pix_chave || ''
    
    setAgenciaValue(agencia)
    setContaValue(numeroConta)
    setPixValue(pix)
    
    // Set banco search term and selected id
    if (conta.banco_id && conta.bancos) {
      setSelectedBancoId(conta.banco_id)
      setBancoSearchTerm(`${conta.bancos.codigo} - ${conta.bancos.nome}`)
    } else {
      setSelectedBancoId('')
      setBancoSearchTerm('')
    }
    
    reset({
      banco_id: conta.banco_id,
      agencia: agencia,
      numero_conta: numeroConta,
      pix_chave: pix,
      empresa_id: conta.empresa_id,
      saldo_inicial: conta.saldo_inicial || 0,
      moeda: conta.moeda || 'BRL',
      ativo: conta.ativo ?? true
    })
    setShowModal(true)
  }

  const handleDelete = (id: string) => {
    setContaToDelete(id)
    setShowDeleteModal(true)
  }

  const confirmDelete = async () => {
    if (!contaToDelete) return

    try {
      const { error } = await supabase
        .from('bancos_contas')
        .delete()
        .eq('id', contaToDelete)

      if (error) throw error
      
      showToast('Conta bancária excluída com sucesso!', 'success')
      loadData()
    } catch (err) {
      console.error('Erro ao excluir conta:', err)
      showToast('Erro ao excluir conta bancária', 'error')
    } finally {
      setShowDeleteModal(false)
      setContaToDelete(null)
    }
  }

  const cancelDelete = () => {
    setShowDeleteModal(false)
    setContaToDelete(null)
  }

  const openModal = () => {
    setEditingId(null)
    setAgenciaValue('')
    setContaValue('')
    setPixValue('')
    setBancoSearchTerm('')
    setSelectedBancoId('')
    reset({
      banco_id: '',
      agencia: '',
      numero_conta: '',
      pix_chave: '',
      empresa_id: '',
      saldo_inicial: 0,
      moeda: 'BRL',
      ativo: true
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setAgenciaValue('')
    setContaValue('')
    setPixValue('')
    setBancoSearchTerm('')
    setSelectedBancoId('')
    setShowBancoDropdown(false)
  }

  const filteredContas = contas.filter(conta => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      conta.numero_conta.toLowerCase().includes(search) ||
      conta.agencia?.toLowerCase().includes(search) ||
      conta.bancos?.nome.toLowerCase().includes(search) ||
      conta.bancos?.codigo.includes(search) ||
      conta.empresas?.nome.toLowerCase().includes(search)
    )
  })

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '400px'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid #e5e7eb',
          borderTop: '4px solid #1555D6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
      </div>
    )
  }

  return (
    <div style={{
      padding: '32px',
      maxWidth: '1400px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '32px'
      }}>
        <div>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#111827',
            marginBottom: '8px'
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
          onClick={openModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 24px',
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

      {/* Search */}
      <div style={{
        marginBottom: '24px',
        position: 'relative'
      }}>
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
          placeholder="Buscar por conta, banco ou empresa..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px 12px 48px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px',
            outline: 'none',
            transition: 'all 0.2s',
            backgroundColor: 'white'
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

      {/* Table */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden'
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse'
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb' }}>
              <th style={{
                padding: '16px',
                textAlign: 'left',
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Banco
              </th>
              <th style={{
                padding: '16px',
                textAlign: 'left',
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Agência
              </th>
              <th style={{
                padding: '16px',
                textAlign: 'left',
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Conta
              </th>
              <th style={{
                padding: '16px',
                textAlign: 'left',
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Chave PIX
              </th>
              <th style={{
                padding: '16px',
                textAlign: 'left',
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Empresa
              </th>
              <th style={{
                padding: '16px',
                textAlign: 'left',
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Saldo Inicial
              </th>
              <th style={{
                padding: '16px',
                textAlign: 'center',
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Status
              </th>
              <th style={{
                padding: '16px',
                textAlign: 'right',
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredContas.length === 0 ? (
              <tr>
                <td colSpan={8} style={{
                  padding: '48px 16px',
                  textAlign: 'center',
                  color: '#9ca3af',
                  fontSize: '14px'
                }}>
                  {searchTerm ? 'Nenhuma conta encontrada' : 'Nenhuma conta cadastrada'}
                </td>
              </tr>
            ) : (
              filteredContas.map((conta) => (
                <tr key={conta.id} style={{
                  borderTop: '1px solid #f3f4f6',
                  transition: 'background-color 0.2s'
                }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{
                    padding: '16px',
                    fontSize: '14px',
                    color: '#374151'
                  }}>
                    <div>
                      <div style={{ fontWeight: '500', marginBottom: '2px' }}>
                        {conta.bancos?.nome || conta.banco_nome || '-'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                        Código: {conta.bancos?.codigo || conta.banco_codigo || '-'}
                      </div>
                    </div>
                  </td>
                  <td style={{
                    padding: '16px',
                    fontSize: '14px',
                    color: '#374151'
                  }}>
                    {conta.agencia || '-'}
                  </td>
                  <td style={{
                    padding: '16px',
                    fontSize: '14px',
                    color: '#374151',
                    fontWeight: '500'
                  }}>
                    {conta.numero_conta}
                  </td>
                  <td style={{
                    padding: '16px',
                    fontSize: '14px',
                    color: '#374151'
                  }}>
                    {conta.pix_chave || '-'}
                  </td>
                  <td style={{
                    padding: '16px',
                    fontSize: '14px',
                    color: '#374151'
                  }}>
                    {conta.empresas?.nome || '-'}
                  </td>
                  <td style={{
                    padding: '16px',
                    fontSize: '14px',
                    color: '#374151',
                    fontWeight: '500'
                  }}>
                    {formatCurrency(conta.saldo_inicial || 0)}
                  </td>
                  <td style={{
                    padding: '16px',
                    textAlign: 'center'
                  }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '500',
                      backgroundColor: conta.ativo ? '#d1fae5' : '#fee2e2',
                      color: conta.ativo ? '#065f46' : '#991b1b'
                    }}>
                      {conta.ativo ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td style={{
                    padding: '16px',
                    textAlign: 'right'
                  }}>
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      justifyContent: 'flex-end'
                    }}>
                      <button
                        onClick={() => handleEdit(conta)}
                        style={{
                          padding: '8px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          color: '#1555D6',
                          transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#eff6ff'
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }}
                        title="Editar"
                      >
                        <Pencil style={{ width: '18px', height: '18px' }} />
                      </button>
                      <button
                        onClick={() => handleDelete(conta.id)}
                        style={{
                          padding: '8px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          color: '#ef4444',
                          transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = '#fef2f2'
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }}
                        title="Excluir"
                      >
                        <Trash2 style={{ width: '18px', height: '18px' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '20px',
            width: '100%',
            maxWidth: '600px',
            maxHeight: '85vh',
            overflow: 'auto'
          }}>
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '16px'
            }}>
              {editingId ? 'Editar Conta Bancária' : 'Nova Conta Bancária'}
            </h2>

            <form onSubmit={handleSubmit(onSubmit, onSubmitError)} style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {/* Banco com busca em tempo real */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Banco *
                </label>
                {/* Hidden input for react-hook-form */}
                <input type="hidden" {...register('banco_id')} value={selectedBancoId} />
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={bancoSearchTerm}
                    onChange={(e) => handleBancoInputChange(e.target.value)}
                    placeholder="Digite para buscar o banco..."
                    style={{
                      width: '100%',
                      padding: '12px 40px 12px 16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s',
                      backgroundColor: 'white'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                      setShowBancoDropdown(true)
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                      // Delay to allow click on dropdown item
                      setTimeout(() => setShowBancoDropdown(false), 200)
                    }}
                  />
                  {bancoSearchTerm && (
                    <button
                      type="button"
                      onClick={() => {
                        setBancoSearchTerm('')
                        setSelectedBancoId('')
                        setValue('banco_id', '')
                        setShowBancoDropdown(false)
                      }}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#9ca3af',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '4px',
                        transition: 'color 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
                      onMouseOut={(e) => e.currentTarget.style.color = '#9ca3af'}
                    >
                      <XCircle style={{ width: '20px', height: '20px' }} />
                    </button>
                  )}
                  {showBancoDropdown && filteredBancos.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: '4px',
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                      maxHeight: '240px',
                      overflowY: 'auto',
                      zIndex: 10
                    }}>
                      {filteredBancos.map((banco) => (
                        <div
                          key={banco.id}
                          onClick={() => handleBancoSelect(banco)}
                          style={{
                            padding: '12px 16px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            color: '#374151',
                            borderBottom: '1px solid #f3f4f6',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                        >
                          <div style={{ fontWeight: '500', marginBottom: '2px' }}>
                            {banco.codigo} - {banco.nome}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Agência e Número da Conta - Lado a lado */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {/* Agência */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Agência
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      {...register('agencia')}
                      value={agenciaValue}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase().slice(0, 10)
                        setAgenciaValue(value)
                        setValue('agencia', value)
                      }}
                      style={{
                        width: '100%',
                        padding: '12px 40px 12px 16px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'all 0.2s'
                      }}
                      placeholder="Digite a agência"
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#1555D6'
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    />
                    {agenciaValue && (
                      <button
                        type="button"
                        onClick={() => {
                          setAgenciaValue('')
                          setValue('agencia', '')
                        }}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#9ca3af',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '4px',
                          transition: 'color 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#9ca3af'}
                      >
                        <XCircle style={{ width: '20px', height: '20px' }} />
                      </button>
                    )}
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    marginTop: '2px',
                    fontSize: '12px',
                    color: agenciaValue.length >= 10 ? '#ef4444' : '#9ca3af'
                  }}>
                    {agenciaValue.length}/10
                  </div>
                </div>

                {/* Número da Conta */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Número da Conta *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      {...register('numero_conta')}
                      value={contaValue}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase().slice(0, 20)
                        setContaValue(value)
                        setValue('numero_conta', value)
                      }}
                      style={{
                        width: '100%',
                        padding: '12px 40px 12px 16px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'all 0.2s'
                      }}
                      placeholder="Digite conta e dígito"
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = '#1555D6'
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    />
                    {contaValue && (
                      <button
                        type="button"
                        onClick={() => {
                          setContaValue('')
                          setValue('numero_conta', '')
                        }}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#9ca3af',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '4px',
                          transition: 'color 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#9ca3af'}
                      >
                        <XCircle style={{ width: '20px', height: '20px' }} />
                      </button>
                    )}
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    marginTop: '2px',
                    fontSize: '12px',
                    color: contaValue.length >= 20 ? '#ef4444' : '#9ca3af'
                  }}>
                    {contaValue.length}/20
                  </div>
                </div>
              </div>

              {/* Chave PIX */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Chave PIX
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    {...register('pix_chave')}
                    value={pixValue}
                    onChange={(e) => {
                      const value = e.target.value.slice(0, 50)
                      setPixValue(value)
                      setValue('pix_chave', value)
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 40px 12px 16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    placeholder="Informe chave pix cnpj, e-mail, telefone ou chave aleatória"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                  {pixValue && (
                    <button
                      type="button"
                      onClick={() => {
                        setPixValue('')
                        setValue('pix_chave', '')
                      }}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#9ca3af',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '4px',
                        transition: 'color 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
                      onMouseOut={(e) => e.currentTarget.style.color = '#9ca3af'}
                    >
                      <XCircle style={{ width: '20px', height: '20px' }} />
                    </button>
                  )}
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: '2px',
                  fontSize: '12px',
                  color: pixValue.length >= 50 ? '#ef4444' : '#9ca3af'
                }}>
                  {pixValue.length}/50
                </div>
              </div>

              {/* Empresa */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
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
                    backgroundColor: 'white',
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
                  <option value="">Selecione uma empresa</option>
                  {empresas.map(e => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
              </div>

              {/* Saldo Inicial */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Saldo Inicial {editingId && <span style={{ fontSize: '12px', color: '#9ca3af' }}>(não editável)</span>}
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
                    opacity: editingId ? 0.6 : 1
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
              </div>

              {/* Conta Ativa */}
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
                paddingTop: '4px'
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
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '400px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            {/* Ícone de Alerta */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '16px'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertTriangle style={{ 
                  width: '24px', 
                  height: '24px', 
                  color: '#ef4444' 
                }} />
              </div>
            </div>

            {/* Título */}
            <h2 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#111827',
              textAlign: 'center',
              marginBottom: '8px'
            }}>
              Excluir Conta Bancária
            </h2>

            {/* Mensagem */}
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              textAlign: 'center',
              marginBottom: '24px',
              lineHeight: '1.5'
            }}>
              Tem certeza que deseja excluir esta conta? Esta ação não pode ser desfeita.
            </p>

            {/* Botões */}
            <div style={{
              display: 'flex',
              gap: '12px'
            }}>
              <button
                type="button"
                onClick={cancelDelete}
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
                type="button"
                onClick={confirmDelete}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  backgroundColor: '#ef4444',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
              >
                Excluir
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
        /* Custom scrollbar for banco dropdown */
        div[style*="maxHeight: 240px"] {
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 #f3f4f6;
        }
        div[style*="maxHeight: 240px"]::-webkit-scrollbar {
          width: 8px;
        }
        div[style*="maxHeight: 240px"]::-webkit-scrollbar-track {
          background: #f3f4f6;
          border-radius: 4px;
        }
        div[style*="maxHeight: 240px"]::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        div[style*="maxHeight: 240px"]::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  )
}