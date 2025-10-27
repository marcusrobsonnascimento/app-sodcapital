'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Plus, Pencil, Trash2, Search, CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react'
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

const contraparteSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(40, 'Nome deve ter no máximo 40 caracteres'),
  apelido: z.string().max(20, 'Apelido deve ter no máximo 20 caracteres').optional().or(z.literal('')),
  documento: z.string().max(18, 'Documento deve ter no máximo 18 caracteres').optional().or(z.literal('')),
  pessoa: z.enum(['PF', 'PJ']),
  relacao: z.enum(['CLIENTE', 'FORNECEDOR', 'AMBOS']),
  email: z.string().email('E-mail inválido').max(100, 'E-mail deve ter no máximo 100 caracteres').optional().or(z.literal('')),
  telefone: z.string().max(15, 'Telefone deve ter no máximo 15 caracteres').optional().or(z.literal('')),
  endereco: z.string().max(200, 'Endereço deve ter no máximo 200 caracteres').optional().or(z.literal('')),
  ativo: z.boolean().default(true)
})

type ContraparteForm = z.infer<typeof contraparteSchema>

// Função para validar CPF
const validarCPF = (cpf: string): boolean => {
  cpf = cpf.replace(/[^\d]/g, '')
  
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  let soma = 0
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpf.charAt(i)) * (10 - i)
  }
  let resto = 11 - (soma % 11)
  let digito1 = resto >= 10 ? 0 : resto

  soma = 0
  for (let i = 0; i < 10; i++) {
    soma += parseInt(cpf.charAt(i)) * (11 - i)
  }
  resto = 11 - (soma % 11)
  let digito2 = resto >= 10 ? 0 : resto

  return parseInt(cpf.charAt(9)) === digito1 && parseInt(cpf.charAt(10)) === digito2
}

// Função para validar CNPJ
const validarCNPJ = (cnpj: string): boolean => {
  cnpj = cnpj.replace(/[^\d]/g, '')
  
  if (cnpj.length !== 14) return false
  if (/^(\d)\1{13}$/.test(cnpj)) return false

  let tamanho = cnpj.length - 2
  let numeros = cnpj.substring(0, tamanho)
  let digitos = cnpj.substring(tamanho)
  let soma = 0
  let pos = tamanho - 7

  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i)) * pos--
    if (pos < 2) pos = 9
  }

  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11)
  if (resultado !== parseInt(digitos.charAt(0))) return false

  tamanho = tamanho + 1
  numeros = cnpj.substring(0, tamanho)
  soma = 0
  pos = tamanho - 7

  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i)) * pos--
    if (pos < 2) pos = 9
  }

  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11)
  return resultado === parseInt(digitos.charAt(1))
}

// Função para formatar CPF/CNPJ
const formatarDocumento = (valor: string): string => {
  const numeros = valor.replace(/[^\d]/g, '')
  
  if (numeros.length <= 11) {
    // CPF: 000.000.000-00
    return numeros
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  } else {
    // CNPJ: 00.000.000/0000-00
    return numeros
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
  }
}

// Função para validar e-mail
const validarEmail = (email: string): boolean => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return regex.test(email)
}

// Função para formatar telefone
const formatarTelefone = (valor: string): string => {
  const numeros = valor.replace(/[^\d]/g, '')
  
  if (numeros.length <= 10) {
    // Telefone fixo: (99) 9999-9999
    return numeros
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  } else {
    // Celular: (99) 99999-9999
    return numeros
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .slice(0, 15) // Limita ao formato completo
  }
}

export default function ContrapartesPage() {
  const [contrapartes, setContrapartes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)
  const [nomeValue, setNomeValue] = useState('')
  const [apelidoValue, setApelidoValue] = useState('')
  const [documentoValue, setDocumentoValue] = useState('')
  const [emailValue, setEmailValue] = useState('')
  const [telefoneValue, setTelefoneValue] = useState('')
  const [enderecoValue, setEnderecoValue] = useState('')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [contraparteToDelete, setContraparteToDelete] = useState<string | null>(null)

  const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<ContraparteForm>({
    resolver: zodResolver(contraparteSchema),
    defaultValues: { pessoa: 'PJ', relacao: 'AMBOS', ativo: true }
  })

  const pessoaSelecionada = watch('pessoa')

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
    loadContrapartes()
  }, [])

  const loadContrapartes = async () => {
    try {
      const { data, error } = await supabase
        .from('contrapartes')
        .select('*')
        .order('nome', { ascending: true })

      if (error) throw error
      setContrapartes(data || [])
    } catch (err) {
      console.error('Erro ao carregar contrapartes:', err)
      showToast('Erro ao carregar contrapartes', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Verificar duplicidade de documento
  const verificarDocumentoDuplicado = async (documento: string, idAtual?: string): Promise<boolean> => {
    if (!documento) return false
    
    const documentoLimpo = documento.replace(/[^\d]/g, '')
    if (documentoLimpo.length === 0) return false

    try {
      let query = supabase
        .from('contrapartes')
        .select('id, nome')
        .eq('documento', documento)

      // Se estiver editando, excluir o ID atual da busca
      if (idAtual) {
        query = query.neq('id', idAtual)
      }

      const { data, error } = await query

      if (error) throw error
      
      if (data && data.length > 0) {
        showToast(`Documento já cadastrado para: ${data[0].nome}`, 'warning')
        return true
      }

      return false
    } catch (err) {
      console.error('Erro ao verificar duplicidade:', err)
      return false
    }
  }

  const onSubmit = async (data: ContraparteForm) => {
    try {
      // Verificar duplicidade de documento antes de salvar
      if (data.documento) {
        const isDuplicado = await verificarDocumentoDuplicado(data.documento, editingId || undefined)
        if (isDuplicado) {
          return // Não prosseguir se houver duplicidade
        }
      }

      // Limpar campos vazios antes de enviar
      const cleanedData = {
        ...data,
        apelido: data.apelido || null,
        documento: data.documento || null,
        email: data.email || null,
        telefone: data.telefone || null,
        endereco: data.endereco || null
      }

      if (editingId) {
        const { error } = await supabase
          .from('contrapartes')
          .update(cleanedData)
          .eq('id', editingId)

        if (error) throw error
        showToast('Contraparte atualizada com sucesso!', 'success')
      } else {
        const { error } = await supabase
          .from('contrapartes')
          .insert([cleanedData])

        if (error) throw error
        showToast('Contraparte criada com sucesso!', 'success')
      }

      loadContrapartes()
      closeModal()
    } catch (err: any) {
      console.error('Erro ao salvar contraparte:', err)
      showToast(err.message || 'Erro ao salvar contraparte', 'error')
    }
  }

  const onSubmitError = (errors: any) => {
    if (errors.nome) {
      showToast(errors.nome.message, 'warning')
    } else if (errors.email) {
      showToast(errors.email.message, 'warning')
    } else if (errors.documento) {
      showToast(errors.documento.message, 'warning')
    } else if (errors.telefone) {
      showToast(errors.telefone.message, 'warning')
    }
  }

  const handleEdit = (contraparte: any) => {
    setEditingId(contraparte.id)
    setNomeValue(contraparte.nome || '')
    setApelidoValue(contraparte.apelido || '')
    setDocumentoValue(contraparte.documento || '')
    setEmailValue(contraparte.email || '')
    setTelefoneValue(contraparte.telefone || '')
    setEnderecoValue(contraparte.endereco || '')
    
    setValue('nome', contraparte.nome || '')
    setValue('apelido', contraparte.apelido || '')
    setValue('documento', contraparte.documento || '')
    setValue('pessoa', contraparte.pessoa || 'PJ')
    setValue('relacao', contraparte.relacao || 'AMBOS')
    setValue('email', contraparte.email || '')
    setValue('telefone', contraparte.telefone || '')
    setValue('endereco', contraparte.endereco || '')
    setValue('ativo', contraparte.ativo ?? true)
    
    setShowModal(true)
  }

  const handleDeleteClick = (id: string) => {
    setContraparteToDelete(id)
    setShowDeleteModal(true)
  }

  const confirmDelete = async () => {
    if (!contraparteToDelete) return

    try {
      const { error } = await supabase
        .from('contrapartes')
        .delete()
        .eq('id', contraparteToDelete)

      if (error) throw error

      showToast('Contraparte excluída com sucesso!', 'success')
      loadContrapartes()
    } catch (err: any) {
      console.error('Erro ao excluir contraparte:', err)
      showToast(err.message || 'Erro ao excluir contraparte', 'error')
    } finally {
      setShowDeleteModal(false)
      setContraparteToDelete(null)
    }
  }

  const cancelDelete = () => {
    setShowDeleteModal(false)
    setContraparteToDelete(null)
  }

  const openModal = () => {
    setEditingId(null)
    setNomeValue('')
    setApelidoValue('')
    setDocumentoValue('')
    setEmailValue('')
    setTelefoneValue('')
    setEnderecoValue('')
    reset({ pessoa: 'PJ', relacao: 'AMBOS', ativo: true })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setNomeValue('')
    setApelidoValue('')
    setDocumentoValue('')
    setEmailValue('')
    setTelefoneValue('')
    setEnderecoValue('')
    reset()
  }

  const handleDocumentoBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const valor = e.target.value.replace(/[^\d]/g, '')
    
    if (valor.length === 0) return
    
    if (pessoaSelecionada === 'PF') {
      if (valor.length !== 11) {
        showToast('CPF deve ter 11 dígitos', 'warning')
      } else if (!validarCPF(valor)) {
        showToast('CPF inválido', 'warning')
      }
    } else {
      if (valor.length !== 14) {
        showToast('CNPJ deve ter 14 dígitos', 'warning')
      } else if (!validarCNPJ(valor)) {
        showToast('CNPJ inválido', 'warning')
      }
    }
  }

  const handleEmailBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const valor = e.target.value.trim()
    
    if (valor.length === 0) return
    
    if (!validarEmail(valor)) {
      showToast('E-mail inválido', 'warning')
    }
  }

  const filteredContrapartes = contrapartes.filter(cp =>
    cp.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cp.documento?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cp.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getRelacaoBadgeColor = (relacao: string) => {
    switch (relacao) {
      case 'CLIENTE':
        return { bg: '#dbeafe', text: '#1e40af' }
      case 'FORNECEDOR':
        return { bg: '#fef3c7', text: '#92400e' }
      case 'AMBOS':
        return { bg: '#d1fae5', text: '#065f46' }
      default:
        return { bg: '#f3f4f6', text: '#374151' }
    }
  }

  return (
    <div style={{
      padding: '24px',
      maxWidth: '1400px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#111827',
            marginBottom: '4px'
          }}>
            Contrapartes
          </h1>
          <p style={{
            fontSize: '14px',
            color: '#6b7280'
          }}>
            Gerencie clientes e fornecedores
          </p>
        </div>
        <button
          onClick={openModal}
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
          <Plus style={{ width: '18px', height: '18px' }} />
          Nova Contraparte
        </button>
      </div>

      {/* Search */}
      <div style={{
        marginBottom: '20px',
        position: 'relative'
      }}>
        <Search style={{
          position: 'absolute',
          left: '14px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '18px',
          height: '18px',
          color: '#9ca3af'
        }} />
        <input
          type="text"
          placeholder="Buscar por nome, documento ou e-mail..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 12px 12px 44px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '14px',
            outline: 'none',
            transition: 'border-color 0.2s'
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = '#1555D6'}
          onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
        />
      </div>

      {/* Table Card */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid #f3f4f6',
              borderTop: '3px solid #1555D6',
              borderRadius: '50%',
              margin: '0 auto 16px',
              animation: 'spin 1s linear infinite'
            }} />
            Carregando...
          </div>
        ) : filteredContrapartes.length === 0 ? (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            {searchTerm ? 'Nenhuma contraparte encontrada' : 'Nenhuma contraparte cadastrada'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse'
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{
                    padding: '14px 16px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderBottom: '1px solid #e5e7eb'
                  }}>
                    Nome
                  </th>
                  <th style={{
                    padding: '14px 16px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderBottom: '1px solid #e5e7eb'
                  }}>
                    Relação
                  </th>
                  <th style={{
                    padding: '14px 16px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderBottom: '1px solid #e5e7eb'
                  }}>
                    Documento
                  </th>
                  <th style={{
                    padding: '14px 16px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderBottom: '1px solid #e5e7eb'
                  }}>
                    E-mail
                  </th>
                  <th style={{
                    padding: '14px 16px',
                    textAlign: 'center',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderBottom: '1px solid #e5e7eb'
                  }}>
                    Status
                  </th>
                  <th style={{
                    padding: '14px 16px',
                    textAlign: 'center',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    borderBottom: '1px solid #e5e7eb',
                    width: '100px'
                  }}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredContrapartes.map((contraparte) => {
                  const badgeColor = getRelacaoBadgeColor(contraparte.relacao)
                  return (
                    <tr
                      key={contraparte.id}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                    >
                      <td style={{
                        padding: '16px',
                        fontSize: '14px',
                        color: '#111827',
                        fontWeight: '500'
                      }}>
                        {contraparte.nome}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 12px',
                          backgroundColor: badgeColor.bg,
                          color: badgeColor.text,
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}>
                          {contraparte.relacao}
                        </span>
                      </td>
                      <td style={{
                        padding: '16px',
                        fontSize: '14px',
                        color: '#6b7280'
                      }}>
                        {contraparte.documento || '-'}
                      </td>
                      <td style={{
                        padding: '16px',
                        fontSize: '14px',
                        color: '#6b7280'
                      }}>
                        {contraparte.email || '-'}
                      </td>
                      <td style={{
                        padding: '16px',
                        textAlign: 'center'
                      }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 12px',
                          backgroundColor: contraparte.ativo ? '#d1fae5' : '#fee2e2',
                          color: contraparte.ativo ? '#065f46' : '#991b1b',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}>
                          {contraparte.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td style={{
                        padding: '16px',
                        textAlign: 'center'
                      }}>
                        <div style={{
                          display: 'flex',
                          gap: '8px',
                          justifyContent: 'center'
                        }}>
                          <button
                            onClick={() => handleEdit(contraparte)}
                            style={{
                              padding: '8px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: '#6b7280',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = '#f3f4f6'
                              e.currentTarget.style.color = '#1555D6'
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.style.color = '#6b7280'
                            }}
                          >
                            <Pencil style={{ width: '16px', height: '16px' }} />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(contraparte.id)}
                            style={{
                              padding: '8px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: '#6b7280',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = '#fee2e2'
                              e.currentTarget.style.color = '#dc2626'
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.style.color = '#6b7280'
                            }}
                          >
                            <Trash2 style={{ width: '16px', height: '16px' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
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
            padding: '28px',
            width: '100%',
            maxWidth: '700px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h2 style={{
              fontSize: '22px',
              fontWeight: '600',
              color: '#111827',
              marginBottom: '20px'
            }}>
              {editingId ? 'Editar Contraparte' : 'Nova Contraparte'}
            </h2>

            <form onSubmit={handleSubmit(onSubmit, onSubmitError)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Nome e Apelido - Lado a lado (Nome mais largo) */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                {/* Nome */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '4px'
                  }}>
                    Nome *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      {...register('nome')}
                      value={nomeValue}
                      onChange={(e) => {
                        const valor = e.target.value.toUpperCase().slice(0, 40)
                        setNomeValue(valor)
                        setValue('nome', valor)
                      }}
                      placeholder="Nome completo"
                      maxLength={40}
                      style={{
                        width: '100%',
                        padding: '10px 32px 10px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                        textTransform: 'uppercase'
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = '#1555D6'}
                      onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                    />
                    {nomeValue && (
                      <button
                        type="button"
                        onClick={() => {
                          setNomeValue('')
                          setValue('nome', '')
                        }}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#9ca3af',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <X style={{ width: '16px', height: '16px' }} />
                      </button>
                    )}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: nomeValue.length >= 40 ? '#ef4444' : '#9ca3af',
                    textAlign: 'right',
                    marginTop: '2px'
                  }}>
                    {nomeValue.length}/40
                  </div>
                </div>

                {/* Apelido */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '4px'
                  }}>
                    Apelido
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      {...register('apelido')}
                      value={apelidoValue}
                      onChange={(e) => {
                        const valor = e.target.value.toUpperCase().slice(0, 20)
                        setApelidoValue(valor)
                        setValue('apelido', valor)
                      }}
                      placeholder="Apelido"
                      maxLength={20}
                      style={{
                        width: '100%',
                        padding: '10px 32px 10px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                        textTransform: 'uppercase'
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = '#1555D6'}
                      onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                    />
                    {apelidoValue && (
                      <button
                        type="button"
                        onClick={() => {
                          setApelidoValue('')
                          setValue('apelido', '')
                        }}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#9ca3af',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <X style={{ width: '16px', height: '16px' }} />
                      </button>
                    )}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: apelidoValue.length >= 20 ? '#ef4444' : '#9ca3af',
                    textAlign: 'right',
                    marginTop: '2px'
                  }}>
                    {apelidoValue.length}/20
                  </div>
                </div>
              </div>

              {/* Pessoa e Relação - Lado a lado */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {/* Pessoa */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '4px'
                  }}>
                    Pessoa *
                  </label>
                  <select
                    {...register('pessoa')}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      cursor: 'pointer',
                      backgroundColor: 'white',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#1555D6'}
                    onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                  >
                    <option value="PF">Pessoa Física</option>
                    <option value="PJ">Pessoa Jurídica</option>
                  </select>
                </div>

                {/* Relação */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '4px'
                  }}>
                    Relação *
                  </label>
                  <select
                    {...register('relacao')}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      cursor: 'pointer',
                      backgroundColor: 'white',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#1555D6'}
                    onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                  >
                    <option value="CLIENTE">Cliente</option>
                    <option value="FORNECEDOR">Fornecedor</option>
                    <option value="AMBOS">Ambos</option>
                  </select>
                </div>
              </div>

              {/* Documento e Telefone - Lado a lado */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {/* Documento */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '4px'
                  }}>
                    {pessoaSelecionada === 'PF' ? 'CPF' : 'CNPJ'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      {...register('documento')}
                      value={documentoValue}
                      onChange={(e) => {
                        const valorFormatado = formatarDocumento(e.target.value)
                        setDocumentoValue(valorFormatado)
                        setValue('documento', valorFormatado)
                      }}
                      onBlur={handleDocumentoBlur}
                      placeholder={pessoaSelecionada === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                      maxLength={18}
                      style={{
                        width: '100%',
                        padding: '10px 32px 10px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = '#1555D6'}
                    />
                    {documentoValue && (
                      <button
                        type="button"
                        onClick={() => {
                          setDocumentoValue('')
                          setValue('documento', '')
                        }}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#9ca3af',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <X style={{ width: '16px', height: '16px' }} />
                      </button>
                    )}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: documentoValue.length >= 18 ? '#ef4444' : '#9ca3af',
                    textAlign: 'right',
                    marginTop: '2px'
                  }}>
                    {documentoValue.length}/18
                  </div>
                </div>

                {/* Telefone */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '4px'
                  }}>
                    Telefone
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      {...register('telefone')}
                      value={telefoneValue}
                      onChange={(e) => {
                        const valorFormatado = formatarTelefone(e.target.value)
                        setTelefoneValue(valorFormatado)
                        setValue('telefone', valorFormatado)
                      }}
                      placeholder="(99) 99999-9999"
                      maxLength={15}
                      style={{
                        width: '100%',
                        padding: '10px 32px 10px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = '#1555D6'}
                      onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                    />
                    {telefoneValue && (
                      <button
                        type="button"
                        onClick={() => {
                          setTelefoneValue('')
                          setValue('telefone', '')
                        }}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#9ca3af',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <X style={{ width: '16px', height: '16px' }} />
                      </button>
                    )}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: telefoneValue.length >= 15 ? '#ef4444' : '#9ca3af',
                    textAlign: 'right',
                    marginTop: '2px'
                  }}>
                    {telefoneValue.length}/15
                  </div>
                </div>
              </div>

              {/* E-mail */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '4px'
                }}>
                  E-mail
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    {...register('email')}
                    value={emailValue}
                    onChange={(e) => {
                      const valor = e.target.value.slice(0, 100)
                      setEmailValue(valor)
                      setValue('email', valor)
                    }}
                    onBlur={handleEmailBlur}
                    placeholder="email@exemplo.com"
                    maxLength={100}
                    style={{
                      width: '100%',
                      padding: '10px 32px 10px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#1555D6'}
                  />
                  {emailValue && (
                    <button
                      type="button"
                      onClick={() => {
                        setEmailValue('')
                        setValue('email', '')
                      }}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#9ca3af',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <X style={{ width: '16px', height: '16px' }} />
                    </button>
                  )}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: emailValue.length >= 100 ? '#ef4444' : '#9ca3af',
                  textAlign: 'right',
                  marginTop: '2px'
                }}>
                  {emailValue.length}/100
                </div>
              </div>

              {/* Endereço */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '4px'
                }}>
                  Endereço
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    {...register('endereco')}
                    value={enderecoValue}
                    onChange={(e) => {
                      const valor = e.target.value.toUpperCase().slice(0, 200)
                      setEnderecoValue(valor)
                      setValue('endereco', valor)
                    }}
                    placeholder="Rua, número, bairro, cidade - UF"
                    maxLength={200}
                    style={{
                      width: '100%',
                      padding: '10px 32px 10px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      textTransform: 'uppercase'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#1555D6'}
                    onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                  />
                  {enderecoValue && (
                    <button
                      type="button"
                      onClick={() => {
                        setEnderecoValue('')
                        setValue('endereco', '')
                      }}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#9ca3af',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <X style={{ width: '16px', height: '16px' }} />
                    </button>
                  )}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: enderecoValue.length >= 200 ? '#ef4444' : '#9ca3af',
                  textAlign: 'right',
                  marginTop: '2px'
                }}>
                  {enderecoValue.length}/200
                </div>
              </div>

              {/* Checkbox Ativo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
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
                  Contraparte ativa
                </label>
              </div>

              {/* Buttons */}
              <div style={{
                display: 'flex',
                gap: '12px',
                marginTop: '8px'
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
              Excluir Contraparte
            </h2>

            {/* Mensagem */}
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              textAlign: 'center',
              marginBottom: '24px',
              lineHeight: '1.5'
            }}>
              Tem certeza que deseja excluir esta contraparte? Esta ação não pode ser desfeita.
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
      `}</style>
    </div>
  )
}