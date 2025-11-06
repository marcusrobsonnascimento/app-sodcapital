'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, Search, CheckCircle, AlertTriangle, XCircle, FolderTree } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

type ToastType = 'success' | 'warning' | 'error'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface Projeto {
  id: string
  nome: string
  empresa_id: string
  projeto_pai_id: string | null
  descricao?: string
  ativo: boolean
  empresas?: { nome: string }
}

interface ProjetoHierarquico extends Projeto {
  nivel: number
  caminho_completo: string
  nome_indentado: string
  filhos?: ProjetoHierarquico[]
}

const projetoSchema = z.object({
  nome: z.string()
    .min(1, 'Nome é obrigatório')
    .max(50, 'Nome deve ter no máximo 50 caracteres')
    .transform(val => val.toUpperCase()),
  empresa_id: z.string().min(1, 'Empresa é obrigatória'),
  projeto_pai_id: z.string().nullable().optional(),
  descricao: z.string()
    .max(200, 'Descrição deve ter no máximo 200 caracteres')
    .optional(),
  ativo: z.boolean().default(true)
})

type ProjetoForm = z.infer<typeof projetoSchema>

export default function ProjetosPage() {
  const [projetos, setProjetos] = useState<ProjetoHierarquico[]>([])
  const [empresas, setEmpresas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deletingProjeto, setDeletingProjeto] = useState<ProjetoHierarquico | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)
  const [nomeValue, setNomeValue] = useState('')
  const [descricaoValue, setDescricaoValue] = useState('')
  const [mostrarHierarquia, setMostrarHierarquia] = useState(true)
  const [empresaSelecionadaModal, setEmpresaSelecionadaModal] = useState<string>('')
  const [checkingDependencies, setCheckingDependencies] = useState(false)

  const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<ProjetoForm>({
    resolver: zodResolver(projetoSchema),
    defaultValues: {
      ativo: true,
      projeto_pai_id: null
    }
  })

  const empresaIdWatch = watch('empresa_id')

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
      const { data: empresasData } = await supabase
        .from('empresas')
        .select('*')
        .eq('ativo', true)
        .order('nome')

      setEmpresas(empresasData || [])

      const { data: projetosData, error } = await supabase
        .from('projetos')
        .select('*, empresas(nome)')
        .order('nome', { ascending: true })

      if (error) throw error
      
      const hierarquia = construirHierarquia(projetosData || [])
      setProjetos(hierarquia)
    } catch (err) {
      console.error('Erro ao carregar projetos:', err)
      showToast('Erro ao carregar projetos', 'error')
    } finally {
      setLoading(false)
    }
  }

  const construirHierarquia = (projetos: Projeto[]): ProjetoHierarquico[] => {
    const map = new Map<string, ProjetoHierarquico>()

    projetos.forEach((projeto) => {
      map.set(projeto.id, {
        ...projeto,
        nivel: 0,
        caminho_completo: projeto.nome,
        nome_indentado: projeto.nome,
        filhos: []
      })
    })

    const raizes: ProjetoHierarquico[] = []

    projetos.forEach((projeto) => {
      const node = map.get(projeto.id)!

      if (!projeto.projeto_pai_id) {
        raizes.push(node)
      } else {
        const pai = map.get(projeto.projeto_pai_id)
        if (pai) {
          node.nivel = pai.nivel + 1
          node.caminho_completo = `${pai.caminho_completo} > ${projeto.nome}`
          node.nome_indentado = '└─ '.repeat(node.nivel) + projeto.nome
          pai.filhos = pai.filhos || []
          pai.filhos.push(node)
        } else {
          raizes.push(node)
        }
      }
    })

    return achatarHierarquia(raizes)
  }

  const achatarHierarquia = (projetos: ProjetoHierarquico[]): ProjetoHierarquico[] => {
    const resultado: ProjetoHierarquico[] = []

    const processar = (projeto: ProjetoHierarquico) => {
      resultado.push(projeto)
      if (projeto.filhos && projeto.filhos.length > 0) {
        projeto.filhos.forEach(processar)
      }
    }

    projetos.forEach(processar)
    return resultado
  }

  const verificarVinculos = async (projetoId: string): Promise<{ temVinculo: boolean; mensagem: string }> => {
    try {
      const temFilhos = projetos.some(p => p.projeto_pai_id === projetoId)
      
      if (temFilhos) {
        return {
          temVinculo: true,
          mensagem: 'Não é possível excluir projeto com subprojetos'
        }
      }

      const { count, error } = await supabase
        .from('lancamentos')
        .select('*', { count: 'exact', head: true })
        .eq('projeto_id', projetoId)

      if (error) throw error

      if (count && count > 0) {
        return {
          temVinculo: true,
          mensagem: `Não é possível excluir. Existem ${count} lançamento(s) vinculado(s) a este projeto`
        }
      }

      return { temVinculo: false, mensagem: '' }
    } catch (error) {
      console.error('Erro ao verificar vínculos:', error)
      throw error
    }
  }

  const onSubmit = async (data: ProjetoForm) => {
    try {
      if (data.projeto_pai_id === editingId) {
        showToast('Projeto não pode ser pai de si mesmo', 'warning')
        return
      }

      const dataToSave = {
        ...data,
        projeto_pai_id: data.projeto_pai_id || null
      }

      if (editingId) {
        const { error } = await supabase
          .from('projetos')
          .update(dataToSave)
          .eq('id', editingId)

        if (error) {
          console.error('Erro detalhado ao atualizar:', error)
          
          if (error.code === '23505' && error.message.includes('projetos_org_id_empresa_id_nome_key')) {
            showToast('Já existe projeto cadastrado para essa empresa', 'warning')
            return
          }
          
          throw new Error(`Erro ao atualizar projeto: ${error.message}`)
        }
        showToast('Projeto atualizado com sucesso!', 'success')
      } else {
        const { error } = await supabase
          .from('projetos')
          .insert([dataToSave])

        if (error) {
          console.error('Erro detalhado ao criar:', error)
          
          if (error.code === '23505' && error.message.includes('projetos_org_id_empresa_id_nome_key')) {
            showToast('Já existe projeto cadastrado para essa empresa', 'warning')
            return
          }
          
          throw new Error(`Erro ao criar projeto: ${error.message}`)
        }
        showToast('Projeto criado com sucesso!', 'success')
      }

      loadData()
      closeModal()
    } catch (err: any) {
      console.error('Erro ao salvar projeto:', err)
      const errorMessage = err.message || 'Erro desconhecido ao salvar projeto'
      showToast(errorMessage, 'error')
    }
  }

  const onSubmitError = (errors: any) => {
    if (errors.nome) {
      showToast(errors.nome.message, 'warning')
    } else if (errors.empresa_id) {
      showToast(errors.empresa_id.message, 'warning')
    } else if (errors.descricao) {
      showToast(errors.descricao.message, 'warning')
    }
  }

  const handleEdit = (projeto: any) => {
    setEditingId(projeto.id)
    const nome = projeto.nome || ''
    const descricao = projeto.descricao || ''
    
    setNomeValue(nome)
    setDescricaoValue(descricao)
    setEmpresaSelecionadaModal(projeto.empresa_id)
    
    reset({
      nome: nome,
      empresa_id: projeto.empresa_id,
      projeto_pai_id: projeto.projeto_pai_id || null,
      descricao: descricao,
      ativo: projeto.ativo
    })
    setShowModal(true)
  }

  const openDeleteModal = async (projeto: ProjetoHierarquico) => {
    setCheckingDependencies(true)
    
    try {
      const { temVinculo, mensagem } = await verificarVinculos(projeto.id)
      
      if (temVinculo) {
        showToast(mensagem, 'warning')
        setCheckingDependencies(false)
        return
      }

      setDeleteId(projeto.id)
      setDeletingProjeto(projeto)
      setShowDeleteModal(true)
    } catch (error) {
      showToast('Erro ao verificar dependências do projeto', 'error')
    } finally {
      setCheckingDependencies(false)
    }
  }

  const closeDeleteModal = () => {
    setShowDeleteModal(false)
    setDeleteId(null)
    setDeletingProjeto(null)
  }

  const confirmDelete = async () => {
    if (!deleteId) return

    try {
      const { error } = await supabase
        .from('projetos')
        .delete()
        .eq('id', deleteId)

      if (error) throw error
      showToast('Projeto excluído com sucesso!', 'success')
      loadData()
      closeDeleteModal()
    } catch (err) {
      console.error('Erro ao excluir projeto:', err)
      showToast('Erro ao excluir projeto', 'error')
      closeDeleteModal()
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setNomeValue('')
    setDescricaoValue('')
    setEmpresaSelecionadaModal('')
    reset({
      nome: '',
      empresa_id: '',
      projeto_pai_id: null,
      descricao: '',
      ativo: true
    })
  }

  const filteredProjetos = projetos.filter(p =>
    p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.empresas?.nome && p.empresas.nome.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const projetosPai = projetos.filter(p => 
    p.empresa_id === empresaIdWatch && 
    p.id !== editingId &&
    p.nivel === 0
  )

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
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
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
                Projetos
              </h1>
              <p style={{
                fontSize: '14px',
                color: '#6b7280'
              }}>
                Gerencie os projetos e subprojetos das empresas
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
              Novo Projeto
            </button>
          </div>

          <div style={{ 
            display: 'flex', 
            gap: '12px',
            marginBottom: '16px'
          }}>
            <div style={{ position: 'relative', flex: 1 }}>
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
                placeholder="Buscar por nome do projeto ou empresa..."
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

            <button
              onClick={() => setMostrarHierarquia(!mostrarHierarquia)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 20px',
                backgroundColor: mostrarHierarquia ? '#1555D6' : 'white',
                color: mostrarHierarquia ? 'white' : '#374151',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap'
              }}
              onMouseOver={(e) => {
                if (mostrarHierarquia) {
                  e.currentTarget.style.backgroundColor = '#1044b5'
                } else {
                  e.currentTarget.style.backgroundColor = '#f9fafb'
                }
              }}
              onMouseOut={(e) => {
                if (mostrarHierarquia) {
                  e.currentTarget.style.backgroundColor = '#1555D6'
                } else {
                  e.currentTarget.style.backgroundColor = 'white'
                }
              }}
            >
              <FolderTree style={{ width: '20px', height: '20px' }} />
              {mostrarHierarquia ? 'Hierarquia ON' : 'Hierarquia OFF'}
            </button>
          </div>
        </div>

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
                  Nome
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
                  Descrição
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
              {filteredProjetos.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{
                    padding: '48px 24px',
                    textAlign: 'center',
                    color: '#9ca3af',
                    fontSize: '14px'
                  }}>
                    Nenhum projeto encontrado
                  </td>
                </tr>
              ) : (
                filteredProjetos.map((projeto) => (
                  <tr
                    key={projeto.id}
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
                      color: '#111827',
                      fontFamily: 'monospace'
                    }}>
                      {mostrarHierarquia ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {projeto.nivel === 0 ? (
                            <FolderTree style={{ width: '16px', height: '16px', color: '#1555D6', flexShrink: 0 }} />
                          ) : null}
                          <span>{projeto.nome_indentado}</span>
                        </div>
                      ) : (
                        projeto.nome
                      )}
                    </td>
                    <td style={{
                      padding: '16px 24px',
                      fontSize: '14px',
                      color: '#6b7280'
                    }}>
                      {projeto.empresas?.nome || '-'}
                    </td>
                    <td style={{
                      padding: '16px 24px',
                      fontSize: '14px',
                      color: '#6b7280'
                    }}>
                      {projeto.descricao || '-'}
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        borderRadius: '12px',
                        backgroundColor: projeto.ativo ? '#dcfce7' : '#f3f4f6',
                        color: projeto.ativo ? '#16a34a' : '#6b7280'
                      }}>
                        {projeto.ativo ? 'Ativo' : 'Inativo'}
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
                          onClick={() => handleEdit(projeto)}
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
                          onClick={() => openDeleteModal(projeto)}
                          disabled={checkingDependencies}
                          style={{
                            padding: '8px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: checkingDependencies ? 'wait' : 'pointer',
                            transition: 'background-color 0.2s',
                            opacity: checkingDependencies ? 0.5 : 1
                          }}
                          onMouseOver={(e) => {
                            if (!checkingDependencies) {
                              e.currentTarget.style.backgroundColor = '#fee2e2'
                            }
                          }}
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
              maxWidth: '500px',
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
              {editingId ? 'Editar Projeto' : 'Novo Projeto'}
            </h2>

            <form onSubmit={handleSubmit(onSubmit, onSubmitError)} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
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
                      transition: 'all 0.2s',
                      textTransform: 'uppercase'
                    }}
                    placeholder="NOME DO PROJETO"
                    maxLength={50}
                    onChange={(e) => {
                      const upperValue = e.target.value.toUpperCase()
                      setNomeValue(upperValue)
                      setValue('nome', upperValue)
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
                  color: nomeValue.length >= 50 ? '#ef4444' : '#9ca3af'
                }}>
                  {nomeValue.length}/50
                </div>
              </div>

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
                  onChange={(e) => {
                    setValue('empresa_id', e.target.value)
                    setEmpresaSelecionadaModal(e.target.value)
                    setValue('projeto_pai_id', null)
                  }}
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

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Subprojeto de... (opcional)
                </label>
                <select
                  {...register('projeto_pai_id')}
                  disabled={!empresaIdWatch}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    backgroundColor: empresaIdWatch ? 'white' : '#f9fafb',
                    cursor: empresaIdWatch ? 'pointer' : 'not-allowed',
                    opacity: empresaIdWatch ? 1 : 0.6
                  }}
                  onFocus={(e) => {
                    if (empresaIdWatch) {
                      e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <option value="">Nenhum (projeto raiz)</option>
                  {projetosPai.map(p => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
                <p style={{
                  marginTop: '4px',
                  fontSize: '12px',
                  color: '#6b7280'
                }}>
                  {!empresaIdWatch 
                    ? 'Selecione uma empresa primeiro'
                    : projetosPai.length === 0
                    ? 'Nenhum projeto disponível para ser pai'
                    : 'Deixe vazio para criar um projeto raiz'}
                </p>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Descrição
                </label>
                <div style={{ position: 'relative' }}>
                  <textarea
                    {...register('descricao')}
                    value={descricaoValue}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s',
                      resize: 'vertical',
                      minHeight: '80px'
                    }}
                    placeholder="Descrição do projeto"
                    maxLength={200}
                    onChange={(e) => {
                      setDescricaoValue(e.target.value)
                      setValue('descricao', e.target.value)
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
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: '4px',
                  fontSize: '12px',
                  color: descricaoValue.length >= 200 ? '#ef4444' : '#9ca3af'
                }}>
                  {descricaoValue.length}/200
                </div>
              </div>

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
                  Projeto ativo
                </label>
              </div>

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
              Excluir Projeto
            </h2>

            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              textAlign: 'center',
              marginBottom: '8px',
              lineHeight: '1.5'
            }}>
              Tem certeza que deseja excluir o projeto
            </p>
            
            {deletingProjeto && (
              <>
                <p style={{
                  fontSize: '18px',
                  fontWeight: '700',
                  color: '#111827',
                  textAlign: 'center',
                  marginBottom: '4px'
                }}>
                  {deletingProjeto.nome}
                </p>
                <p style={{
                  fontSize: '14px',
                  color: '#6b7280',
                  textAlign: 'center',
                  marginBottom: '24px'
                }}>
                  {deletingProjeto.empresas?.nome}?
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