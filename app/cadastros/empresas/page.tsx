'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, Search, Calendar, Building2, FolderKanban } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

// Função para validar CNPJ
const validarCNPJ = (cnpj: string): boolean => {
  cnpj = cnpj.replace(/[^\d]+/g, '')

  if (cnpj.length !== 14) return false
  if (/^(\d)\1+$/.test(cnpj)) return false

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
  if (resultado !== parseInt(digitos.charAt(1))) return false

  return true
}

const empresaSchema = z.object({
  cnpj: z.string()
    .min(1, 'CNPJ é obrigatório')
    .refine(
      (val) => validarCNPJ(val),
      { message: 'CNPJ inválido' }
    ),
  razao_social: z.string()
    .min(1, 'Razão Social é obrigatória')
    .max(40, 'Razão Social deve ter no máximo 40 caracteres')
    .transform(val => val.toUpperCase()),
  nome: z.string()
    .min(1, 'Apelido é obrigatório')
    .max(20, 'Apelido deve ter no máximo 20 caracteres')
    .transform(val => val.toUpperCase()),
  ativo: z.boolean().default(true)
})

type EmpresaForm = z.infer<typeof empresaSchema>

export default function EmpresasPage() {
  const [empresas, setEmpresas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<EmpresaForm>({
    resolver: zodResolver(empresaSchema),
    defaultValues: {
      ativo: true
    }
  })

  useEffect(() => {
    loadEmpresas()
  }, [])

  const loadEmpresas = async () => {
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select('*')
        .order('nome', { ascending: true })

      if (error) throw error
      setEmpresas(data || [])
    } catch (err) {
      console.error('Erro ao carregar empresas:', err)
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data: EmpresaForm) => {
    try {
      if (editingId) {
        const { error } = await supabase
          .from('empresas')
          .update(data)
          .eq('id', editingId)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('empresas')
          .insert([data])

        if (error) throw error
      }

      loadEmpresas()
      closeModal()
    } catch (err) {
      console.error('Erro ao salvar empresa:', err)
      alert('Erro ao salvar empresa')
    }
  }

  const handleEdit = (empresa: any) => {
    setEditingId(empresa.id)
    reset({
      cnpj: empresa.cnpj || '',
      razao_social: empresa.razao_social || '',
      nome: empresa.nome || '',
      ativo: empresa.ativo
    })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta empresa?')) return

    try {
      const { error } = await supabase
        .from('empresas')
        .delete()
        .eq('id', id)

      if (error) throw error
      loadEmpresas()
    } catch (err) {
      console.error('Erro ao excluir empresa:', err)
      alert('Erro ao excluir empresa')
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    reset({
      cnpj: '',
      razao_social: '',
      nome: '',
      ativo: true
    })
  }

  const filteredEmpresas = empresas.filter(e =>
    e.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (e.cnpj && e.cnpj.includes(searchTerm))
  )

  // Formatar CNPJ enquanto digita
  const formatCNPJ = (value: string) => {
    const cleaned = value.replace(/\D/g, '')
    const match = cleaned.match(/^(\d{0,2})(\d{0,3})(\d{0,3})(\d{0,4})(\d{0,2})/)
    
    if (!match) return value
    
    let formatted = match[1]
    if (match[2]) formatted += '.' + match[2]
    if (match[3]) formatted += '.' + match[3]
    if (match[4]) formatted += '/' + match[4]
    if (match[5]) formatted += '-' + match[5]
    
    return formatted
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
      {/* Top Filters Bar */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '32px',
        alignItems: 'center'
      }}>
        <button style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          fontSize: '14px',
          color: '#374151',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}>
          <Calendar style={{ width: '18px', height: '18px' }} />
          Este Mês
        </button>

        <button style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          fontSize: '14px',
          color: '#374151',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}>
          <Building2 style={{ width: '18px', height: '18px' }} />
          Todas as Empresas
        </button>

        <button style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          fontSize: '14px',
          color: '#374151',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}>
          <FolderKanban style={{ width: '18px', height: '18px' }} />
          Todos os Projetos
        </button>
      </div>

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
                Empresas
              </h1>
              <p style={{
                fontSize: '14px',
                color: '#6b7280'
              }}>
                Gerencie as empresas do grupo
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
              Nova Empresa
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
              placeholder="Buscar por apelido ou CNPJ..."
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
                  Apelido
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
                  CNPJ
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
                  Razão Social
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
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Criado em
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
              {filteredEmpresas.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{
                    padding: '48px 24px',
                    textAlign: 'center',
                    color: '#9ca3af',
                    fontSize: '14px'
                  }}>
                    Nenhuma empresa encontrada
                  </td>
                </tr>
              ) : (
                filteredEmpresas.map((empresa) => (
                  <tr
                    key={empresa.id}
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
                      {empresa.nome}
                    </td>
                    <td style={{
                      padding: '16px 24px',
                      fontSize: '14px',
                      color: '#6b7280'
                    }}>
                      {empresa.cnpj || '-'}
                    </td>
                    <td style={{
                      padding: '16px 24px',
                      fontSize: '14px',
                      color: '#6b7280'
                    }}>
                      {empresa.razao_social || '-'}
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        borderRadius: '12px',
                        backgroundColor: empresa.ativo ? '#dcfce7' : '#f3f4f6',
                        color: empresa.ativo ? '#16a34a' : '#6b7280'
                      }}>
                        {empresa.ativo ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td style={{
                      padding: '16px 24px',
                      fontSize: '14px',
                      color: '#6b7280'
                    }}>
                      {formatDate(empresa.created_at)}
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: '8px'
                      }}>
                        <button
                          onClick={() => handleEdit(empresa)}
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
                          onClick={() => handleDelete(empresa.id)}
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
              maxWidth: '500px',
              margin: '16px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '24px'
            }}>
              {editingId ? 'Editar Empresa' : 'Nova Empresa'}
            </h2>

            <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* CNPJ */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  CNPJ *
                </label>
                <input
                  {...register('cnpj')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: errors.cnpj ? '1px solid #dc2626' : '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                  onChange={(e) => {
                    const formatted = formatCNPJ(e.target.value)
                    e.target.value = formatted
                    setValue('cnpj', formatted)
                  }}
                  onFocus={(e) => {
                    if (!errors.cnpj) {
                      e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = errors.cnpj ? '#dc2626' : '#e5e7eb'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                {errors.cnpj && (
                  <p style={{
                    fontSize: '13px',
                    color: '#dc2626',
                    marginTop: '6px'
                  }}>
                    {errors.cnpj.message}
                  </p>
                )}
              </div>

              {/* Razão Social */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Razão Social *
                </label>
                <input
                  {...register('razao_social')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: errors.razao_social ? '1px solid #dc2626' : '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    textTransform: 'uppercase'
                  }}
                  placeholder="RAZÃO SOCIAL DA EMPRESA"
                  maxLength={40}
                  onChange={(e) => {
                    e.target.value = e.target.value.toUpperCase()
                  }}
                  onFocus={(e) => {
                    if (!errors.razao_social) {
                      e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = errors.razao_social ? '#dc2626' : '#e5e7eb'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                {errors.razao_social && (
                  <p style={{
                    fontSize: '13px',
                    color: '#dc2626',
                    marginTop: '6px'
                  }}>
                    {errors.razao_social.message}
                  </p>
                )}
              </div>

              {/* Apelido (Nome) */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Apelido *
                </label>
                <input
                  {...register('nome')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: errors.nome ? '1px solid #dc2626' : '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    textTransform: 'uppercase'
                  }}
                  placeholder="APELIDO"
                  maxLength={20}
                  onChange={(e) => {
                    e.target.value = e.target.value.toUpperCase()
                  }}
                  onFocus={(e) => {
                    if (!errors.nome) {
                      e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = errors.nome ? '#dc2626' : '#e5e7eb'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                {errors.nome && (
                  <p style={{
                    fontSize: '13px',
                    color: '#dc2626',
                    marginTop: '6px'
                  }}>
                    {errors.nome.message}
                  </p>
                )}
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
                  Empresa ativa
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

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}