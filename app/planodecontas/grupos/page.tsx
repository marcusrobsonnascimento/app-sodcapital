'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, Search, CheckCircle, AlertTriangle, XCircle, Filter } from 'lucide-react'
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

// Types
interface Tipo {
  id: string
  nome: string
  ordem: number
}

interface Grupo {
  id: string
  tipo_id: string
  nome: string
  slug: string
  ordem: number
  created_at: string
  tipo_nome?: string
}

// Função para gerar slug
const generateSlug = (text: string): string => {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // Substitui caracteres especiais por hífen
    .replace(/^-+|-+$/g, '') // Remove hífens no início/fim
}

const grupoSchema = z.object({
  tipo_id: z.string().min(1, 'Tipo é obrigatório'),
  nome: z.string()
    .min(1, 'Nome é obrigatório')
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .transform(val => val.trim()),
  ordem: z.coerce.number()
    .int('Ordem deve ser um número inteiro')
    .min(0, 'Ordem deve ser maior ou igual a 0')
    .max(999, 'Ordem deve ser menor que 1000')
    .default(0)
})

type GrupoForm = z.infer<typeof grupoSchema>

export default function GruposPage() {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [tipos, setTipos] = useState<Tipo[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTipoFilter, setSelectedTipoFilter] = useState<string>('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)
  const [nomeValue, setNomeValue] = useState('')

  const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<GrupoForm>({
    resolver: zodResolver(grupoSchema),
    defaultValues: {
      tipo_id: '',
      nome: '',
      ordem: 0
    }
  })

  const selectedTipoId = watch('tipo_id')

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
    loadTipos()
    loadGrupos()
  }, [])

  const loadTipos = async () => {
    try {
      const { data, error } = await supabase
        .from('pc_tipos')
        .select('id, nome, ordem')
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true })

      if (error) throw error
      setTipos(data || [])
    } catch (err) {
      console.error('Erro ao carregar tipos:', err)
      showToast('Erro ao carregar tipos', 'error')
    }
  }

  const loadGrupos = async () => {
    setLoading(true)
    try {
      // Garantir que tipos estejam carregados
      let tiposParaUsar = tipos
      if (tipos.length === 0) {
        const { data: tiposData } = await supabase
          .from('pc_tipos')
          .select('id, nome, ordem')
          .order('ordem', { ascending: true })
          .order('nome', { ascending: true })
        tiposParaUsar = tiposData || []
        setTipos(tiposParaUsar)
      }

      // Carregar grupos
      const { data: gruposData, error: gruposError } = await supabase
        .from('pc_grupos')
        .select('*')
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true })

      if (gruposError) throw gruposError

      // Adicionar o nome do tipo manualmente
      const gruposComTipo = (gruposData || []).map((grupo: any) => {
        const tipo = tiposParaUsar.find(t => t.id === grupo.tipo_id)
        return {
          ...grupo,
          tipo_nome: tipo?.nome || 'Sem tipo'
        }
      })

      setGrupos(gruposComTipo)
    } catch (err) {
      console.error('Erro ao carregar grupos:', err)
      showToast('Erro ao carregar grupos', 'error')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data: GrupoForm) => {
    try {
      const slug = generateSlug(data.nome)

      // Verificar duplicidade de slug para o mesmo tipo (exceto o próprio registro ao editar)
      const { data: existingGrupo } = await supabase
        .from('pc_grupos')
        .select('id')
        .eq('tipo_id', data.tipo_id)
        .eq('slug', slug)
        .neq('id', editingId || '00000000-0000-0000-0000-000000000000')
        .single()

      if (existingGrupo) {
        showToast('Já existe um grupo com este nome para o tipo selecionado', 'warning')
        return
      }

      if (editingId) {
        const { error } = await supabase
          .from('pc_grupos')
          .update({
            tipo_id: data.tipo_id,
            nome: data.nome,
            slug,
            ordem: data.ordem
          })
          .eq('id', editingId)

        if (error) {
          console.error('Erro detalhado ao atualizar:', error)
          throw new Error(`Erro ao atualizar grupo: ${error.message}`)
        }
        showToast('Grupo atualizado com sucesso!', 'success')
      } else {
        const { error } = await supabase
          .from('pc_grupos')
          .insert([{
            tipo_id: data.tipo_id,
            nome: data.nome,
            slug,
            ordem: data.ordem
          }])

        if (error) {
          console.error('Erro detalhado ao criar:', error)
          throw new Error(`Erro ao criar grupo: ${error.message}`)
        }
        showToast('Grupo criado com sucesso!', 'success')
      }

      loadGrupos()
      closeModal()
    } catch (err: any) {
      console.error('Erro ao salvar grupo:', err)
      const errorMessage = err.message || 'Erro desconhecido ao salvar grupo'
      showToast(errorMessage, 'error')
    }
  }

  const onSubmitError = (errors: any) => {
    if (errors.tipo_id) {
      showToast(errors.tipo_id.message, 'warning')
    } else if (errors.nome) {
      showToast(errors.nome.message, 'warning')
    } else if (errors.ordem) {
      showToast(errors.ordem.message, 'warning')
    }
  }

  const handleEdit = (grupo: Grupo) => {
    setEditingId(grupo.id)
    const nome = grupo.nome || ''
    
    setNomeValue(nome)
    
    reset({
      tipo_id: grupo.tipo_id,
      nome: nome,
      ordem: grupo.ordem || 0
    })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este grupo?')) return

    try {
      const { error } = await supabase
        .from('pc_grupos')
        .delete()
        .eq('id', id)

      if (error) {
        // Verificar se é erro de FK (foreign key constraint)
        if (error.code === '23503') {
          showToast('Não é possível excluir: existem Categorias vinculadas a este Grupo', 'error')
          return
        }
        throw error
      }
      
      showToast('Grupo excluído com sucesso!', 'success')
      loadGrupos()
    } catch (err) {
      console.error('Erro ao excluir grupo:', err)
      showToast('Erro ao excluir grupo', 'error')
    }
  }

  const openModal = () => {
    setEditingId(null)
    setNomeValue('')
    reset({
      tipo_id: '',
      nome: '',
      ordem: 0
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setNomeValue('')
    reset({
      tipo_id: '',
      nome: '',
      ordem: 0
    })
  }

  // Filtrar grupos por tipo selecionado e termo de busca
  const filteredGrupos = grupos.filter(grupo => {
    const matchTipo = !selectedTipoFilter || grupo.tipo_id === selectedTipoFilter
    const matchSearch = !searchTerm || 
      grupo.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      grupo.slug?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchTipo && matchSearch
  })

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: '600',
          color: '#111827',
          marginBottom: '8px'
        }}>
          Grupos do Plano de Contas
        </h1>
        <p style={{
          fontSize: '14px',
          color: '#6b7280'
        }}>
          Gerencie os grupos que organizam as categorias por tipo
        </p>
      </div>

      {/* Filters and Actions Bar */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        {/* Filtro por Tipo */}
        <div style={{ position: 'relative', minWidth: '200px' }}>
          <Filter style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#9ca3af',
            width: '20px',
            height: '20px',
            pointerEvents: 'none'
          }} />
          <select
            value={selectedTipoFilter}
            onChange={(e) => setSelectedTipoFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px 12px 44px',
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
            <option value="">Todos os tipos</option>
            {tipos.map(tipo => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.nome}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
          <Search style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#9ca3af',
            width: '20px',
            height: '20px'
          }} />
          <input
            type="text"
            placeholder="Buscar por nome do grupo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px 12px 44px',
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

        {/* New Button */}
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
            transition: 'all 0.2s',
            whiteSpace: 'nowrap'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1044b5'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1555D6'}
        >
          <Plus style={{ width: '20px', height: '20px' }} />
          Novo Grupo
        </button>
      </div>

      {/* Table */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <div style={{
              display: 'inline-block',
              width: '40px',
              height: '40px',
              border: '4px solid #e5e7eb',
              borderTopColor: '#1555D6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
          </div>
        ) : filteredGrupos.length === 0 ? (
          <div style={{
            padding: '48px',
            textAlign: 'center'
          }}>
            <p style={{
              color: '#6b7280',
              fontSize: '14px',
              margin: 0
            }}>
              {searchTerm || selectedTipoFilter 
                ? 'Nenhum grupo encontrado com os filtros aplicados.' 
                : 'Nenhum grupo cadastrado.'}
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Tipo
                </th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Nome do Grupo
                </th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'center',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  width: '100px'
                }}>
                  Ordem
                </th>
                <th style={{
                  padding: '12px 16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  width: '180px'
                }}>
                  Criado em
                </th>
                <th style={{
                  padding: '12px 16px',
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
              {filteredGrupos.map((grupo, index) => (
                <tr
                  key={grupo.id}
                  style={{
                    borderTop: index > 0 ? '1px solid #e5e7eb' : 'none',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td style={{
                    padding: '16px',
                    fontSize: '13px',
                    color: '#6b7280',
                    fontWeight: '500'
                  }}>
                    {grupo.tipo_nome}
                  </td>
                  <td style={{
                    padding: '16px',
                    fontSize: '14px',
                    color: '#111827',
                    fontWeight: '500'
                  }}>
                    {grupo.nome}
                  </td>
                  <td style={{
                    padding: '16px',
                    textAlign: 'center'
                  }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      backgroundColor: '#f3f4f6',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#374151'
                    }}>
                      {grupo.ordem}
                    </span>
                  </td>
                  <td style={{
                    padding: '16px',
                    fontSize: '13px',
                    color: '#6b7280'
                  }}>
                    {formatDate(grupo.created_at)}
                  </td>
                  <td style={{
                    padding: '16px',
                    textAlign: 'right'
                  }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => handleEdit(grupo)}
                        style={{
                          padding: '8px',
                          backgroundColor: '#f3f4f6',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                        title="Editar"
                      >
                        <Pencil style={{ width: '16px', height: '16px', color: '#1555D6' }} />
                      </button>
                      <button
                        onClick={() => handleDelete(grupo.id)}
                        style={{
                          padding: '8px',
                          backgroundColor: '#fef2f2',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                        title="Excluir"
                      >
                        <Trash2 style={{ width: '16px', height: '16px', color: '#ef4444' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Results Counter */}
      <div style={{
        marginTop: '16px',
        textAlign: 'center'
      }}>
        <p style={{
          margin: 0,
          fontSize: '13px',
          color: '#6b7280'
        }}>
          {filteredGrupos.length === grupos.length
            ? `Total: ${grupos.length} grupo${grupos.length !== 1 ? 's' : ''}`
            : `Mostrando ${filteredGrupos.length} de ${grupos.length} grupo${grupos.length !== 1 ? 's' : ''}`}
        </p>
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
          zIndex: 50,
          padding: '16px'
        }}
        onClick={closeModal}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '500px',
              maxHeight: '90vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '24px' }}>
              <h2 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#111827',
                marginBottom: '8px'
              }}>
                {editingId ? 'Editar Grupo' : 'Novo Grupo'}
              </h2>
              <p style={{
                fontSize: '14px',
                color: '#6b7280',
                marginBottom: '24px'
              }}>
                {editingId
                  ? 'Atualize as informações do grupo'
                  : 'Adicione um novo grupo ao plano de contas'}
              </p>

              <form onSubmit={handleSubmit(onSubmit, onSubmitError)}>
                {/* Tipo */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Tipo *
                  </label>
                  <select
                    {...register('tipo_id')}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: errors.tipo_id ? '1px solid #ef4444' : '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s',
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                    onFocus={(e) => {
                      if (!errors.tipo_id) {
                        e.currentTarget.style.borderColor = '#1555D6'
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = errors.tipo_id ? '#ef4444' : '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <option value="">Selecione um tipo...</option>
                    {tipos.map(tipo => (
                      <option key={tipo.id} value={tipo.id}>
                        {tipo.nome}
                      </option>
                    ))}
                  </select>
                  {errors.tipo_id && (
                    <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
                      {errors.tipo_id.message}
                    </span>
                  )}
                </div>

                {/* Nome */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Nome *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      {...register('nome')}
                      value={nomeValue}
                      style={{
                        width: '100%',
                        padding: '12px 40px 12px 16px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'all 0.2s'
                      }}
                      placeholder="Ex: Receitas Operacionais, Custos Diretos..."
                      maxLength={100}
                      onChange={(e) => {
                        const value = e.target.value
                        setNomeValue(value)
                        setValue('nome', value)
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
                    {nomeValue && (
                      <button
                        type="button"
                        onClick={() => {
                          setNomeValue('')
                          setValue('nome', '')
                        }}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#9ca3af',
                          fontSize: '18px',
                          lineHeight: 1
                        }}
                        onMouseOver={(e) => e.currentTarget.style.color = '#6b7280'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#9ca3af'}
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    marginTop: '4px',
                    fontSize: '12px',
                    color: nomeValue.length >= 100 ? '#ef4444' : '#9ca3af'
                  }}>
                    {nomeValue.length}/100
                  </div>
                </div>

                {/* Ordem */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '8px'
                  }}>
                    Ordem
                  </label>
                  <input
                    {...register('ordem')}
                    type="number"
                    min="0"
                    max="999"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    placeholder="0"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                  <p style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    marginTop: '4px',
                    margin: 0
                  }}>
                    Define a ordem de exibição dentro do tipo (0-999)
                  </p>
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