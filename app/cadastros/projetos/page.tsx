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

  // Novos estados para os filtros
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('')
  const [filtroProjeto, setFiltroProjeto] = useState<string>('')
  const [filtroSubprojeto, setFiltroSubprojeto] = useState<string>('')

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
      if (editingId && data.projeto_pai_id === editingId) {
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

        showToast('Projeto atualizado com sucesso', 'success')
      } else {
        const { error } = await supabase
          .from('projetos')
          .insert([dataToSave])

        if (error) {
          console.error('Erro detalhado ao inserir:', error)
          
          if (error.code === '23505' && error.message.includes('projetos_org_id_empresa_id_nome_key')) {
            showToast('Já existe projeto cadastrado para essa empresa', 'warning')
            return
          }
          
          throw new Error(`Erro ao criar projeto: ${error.message}`)
        }

        showToast('Projeto criado com sucesso', 'success')
      }

      closeModal()
      loadData()
    } catch (err: any) {
      console.error('Erro ao salvar:', err)
      showToast(err.message || 'Erro ao salvar projeto', 'error')
    }
  }

  const handleEdit = (projeto: ProjetoHierarquico) => {
    setEditingId(projeto.id)
    setEmpresaSelecionadaModal(projeto.empresa_id)
    setValue('nome', projeto.nome)
    setValue('empresa_id', projeto.empresa_id)
    setValue('projeto_pai_id', projeto.projeto_pai_id)
    setValue('descricao', projeto.descricao || '')
    setValue('ativo', projeto.ativo)
    setNomeValue(projeto.nome)
    setDescricaoValue(projeto.descricao || '')
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    const projeto = projetos.find(p => p.id === id)
    setDeletingProjeto(projeto || null)
    setDeleteId(id)
    setCheckingDependencies(true)
    setShowDeleteModal(true)

    try {
      const { temVinculo, mensagem } = await verificarVinculos(id)
      
      if (temVinculo) {
        showToast(mensagem, 'warning')
        setShowDeleteModal(false)
        setDeleteId(null)
        setDeletingProjeto(null)
      }
    } catch (error) {
      console.error('Erro ao verificar vínculos:', error)
      showToast('Erro ao verificar vínculos do projeto', 'error')
      setShowDeleteModal(false)
      setDeleteId(null)
      setDeletingProjeto(null)
    } finally {
      setCheckingDependencies(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteId) return

    try {
      const { error } = await supabase
        .from('projetos')
        .delete()
        .eq('id', deleteId)

      if (error) throw error

      showToast('Projeto excluído com sucesso', 'success')
      loadData()
    } catch (err) {
      console.error('Erro ao excluir:', err)
      showToast('Erro ao excluir projeto', 'error')
    } finally {
      setShowDeleteModal(false)
      setDeleteId(null)
      setDeletingProjeto(null)
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setEmpresaSelecionadaModal('')
    reset()
    setNomeValue('')
    setDescricaoValue('')
  }

  const closeDeleteModal = () => {
    setShowDeleteModal(false)
    setDeleteId(null)
    setDeletingProjeto(null)
  }

  const openNewProjetoModal = () => {
    setEditingId(null)
    setEmpresaSelecionadaModal('')
    reset({
      ativo: true,
      projeto_pai_id: null
    })
    setNomeValue('')
    setDescricaoValue('')
    setShowModal(true)
  }

  // Obter projetos pai (nível 0) para o filtro - filtrados por empresa se selecionada
  const projetosPai = projetos.filter(p => {
    const isProjetoPai = !p.projeto_pai_id
    const matchEmpresa = !filtroEmpresa || p.empresa_id === filtroEmpresa
    return isProjetoPai && matchEmpresa
  })

  // Obter subprojetos baseados no projeto pai selecionado e empresa
  const subprojetosDisponiveis = projetos.filter(p => {
    const isSubprojeto = p.projeto_pai_id !== null
    const matchEmpresa = !filtroEmpresa || p.empresa_id === filtroEmpresa
    const matchProjetoPai = !filtroProjeto || p.projeto_pai_id === filtroProjeto
    return isSubprojeto && matchEmpresa && matchProjetoPai
  })

  // Função de filtro combinada
  const projetosFiltrados = projetos.filter(projeto => {
    // Filtro de busca por texto
    const matchSearch = searchTerm === '' || 
      projeto.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      projeto.empresas?.nome.toLowerCase().includes(searchTerm.toLowerCase())

    // Filtro por empresa
    const matchEmpresa = !filtroEmpresa || projeto.empresa_id === filtroEmpresa

    // Filtro por projeto pai
    const matchProjeto = !filtroProjeto || projeto.id === filtroProjeto || projeto.projeto_pai_id === filtroProjeto

    // Filtro por subprojeto
    const matchSubprojeto = !filtroSubprojeto || projeto.id === filtroSubprojeto

    return matchSearch && matchEmpresa && matchProjeto && matchSubprojeto
  })

  const projetosParaMostrar = mostrarHierarquia ? projetosFiltrados : projetosFiltrados

  const projetosPaiParaModal = projetos.filter(p => {
    if (!empresaSelecionadaModal) return false
    if (editingId && p.id === editingId) return false
    return p.empresa_id === empresaSelecionadaModal && !p.projeto_pai_id
  })

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '32px 24px'
      }}>
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
            onClick={openNewProjetoModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              backgroundColor: '#1555D6',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 6px rgba(21, 85, 214, 0.2)'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1044b5'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1555D6'}
          >
            <Plus style={{ width: '18px', height: '18px' }} />
            Novo Projeto
          </button>
        </div>

        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '24px',
            borderBottom: '1px solid #e5e7eb'
          }}>
            {/* Linha 1: Busca + Empresa */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr',
              gap: '12px',
              marginBottom: '12px'
            }}>
              {/* Campo de Busca */}
              <div style={{ position: 'relative' }}>
                <Search style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '18px',
                  height: '18px',
                  color: '#9ca3af'
                }} />
                <input
                  type="text"
                  placeholder="Buscar por nome do projeto ou empresa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 40px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#1555D6'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                />
              </div>

              {/* Filtro por Empresa */}
              <select
                value={filtroEmpresa}
                onChange={(e) => {
                  setFiltroEmpresa(e.target.value)
                  setFiltroProjeto('') // Limpa projeto ao trocar empresa
                  setFiltroSubprojeto('') // Limpa subprojeto ao trocar empresa
                }}
                style={{
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  cursor: 'pointer',
                  backgroundColor: 'white',
                  color: filtroEmpresa ? '#111827' : '#9ca3af'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#1555D6'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
              >
                <option value="">Todas Empresas</option>
                {empresas.map(empresa => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Linha 2: Projeto + Subprojeto + Hierarquia */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr auto',
              gap: '12px',
              alignItems: 'center'
            }}>
              {/* Filtro por Projeto (Projeto Pai) */}
              <select
                value={filtroProjeto}
                onChange={(e) => {
                  setFiltroProjeto(e.target.value)
                  setFiltroSubprojeto('') // Limpa subprojeto ao trocar projeto
                }}
                disabled={projetosPai.length === 0}
                style={{
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  cursor: projetosPai.length === 0 ? 'not-allowed' : 'pointer',
                  backgroundColor: projetosPai.length === 0 ? '#f9fafb' : 'white',
                  color: filtroProjeto ? '#111827' : '#9ca3af',
                  opacity: projetosPai.length === 0 ? 0.6 : 1
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#1555D6'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
              >
                <option value="">Todos Projetos</option>
                {projetosPai.map(projeto => (
                  <option key={projeto.id} value={projeto.id}>
                    {projeto.nome}
                  </option>
                ))}
              </select>

              {/* Filtro por Subprojeto */}
              <select
                value={filtroSubprojeto}
                onChange={(e) => setFiltroSubprojeto(e.target.value)}
                disabled={subprojetosDisponiveis.length === 0}
                style={{
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  cursor: subprojetosDisponiveis.length === 0 ? 'not-allowed' : 'pointer',
                  backgroundColor: subprojetosDisponiveis.length === 0 ? '#f9fafb' : 'white',
                  color: filtroSubprojeto ? '#111827' : '#9ca3af',
                  opacity: subprojetosDisponiveis.length === 0 ? 0.6 : 1
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#1555D6'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
              >
                <option value="">Todos Subprojetos</option>
                {subprojetosDisponiveis.map(subprojeto => (
                  <option key={subprojeto.id} value={subprojeto.id}>
                    {subprojeto.nome}
                  </option>
                ))}
              </select>

              {/* Botão Toggle Hierarquia */}
              <button
                onClick={() => setMostrarHierarquia(!mostrarHierarquia)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  backgroundColor: mostrarHierarquia ? '#1555D6' : 'white',
                  color: mostrarHierarquia ? 'white' : '#374151',
                  border: '1px solid',
                  borderColor: mostrarHierarquia ? '#1555D6' : '#e5e7eb',
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
                <FolderTree style={{ width: '16px', height: '16px' }} />
                Hierarquia {mostrarHierarquia ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '80px 20px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                border: '4px solid #f3f4f6',
                borderTop: '4px solid #1555D6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
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
                      padding: '16px 24px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      NOME
                    </th>
                    <th style={{
                      padding: '16px 24px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      EMPRESA
                    </th>
                    <th style={{
                      padding: '16px 24px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      DESCRIÇÃO
                    </th>
                    <th style={{
                      padding: '16px 24px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      STATUS
                    </th>
                    <th style={{
                      padding: '16px 24px',
                      textAlign: 'right',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#6b7280',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      AÇÕES
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projetosParaMostrar.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{
                        padding: '40px',
                        textAlign: 'center',
                        color: '#9ca3af',
                        fontSize: '14px'
                      }}>
                        Nenhum projeto encontrado
                      </td>
                    </tr>
                  ) : (
                    projetosParaMostrar.map((projeto) => (
                      <tr
                        key={projeto.id}
                        style={{
                          borderBottom: '1px solid #f3f4f6',
                          transition: 'background-color 0.15s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                      >
                        <td style={{
                          padding: '16px 24px',
                          fontSize: '14px',
                          color: '#111827',
                          fontWeight: '500'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {mostrarHierarquia && projeto.nivel > 0 && (
                              <span style={{ 
                                color: '#9ca3af',
                                fontSize: '12px',
                                fontFamily: 'monospace'
                              }}>
                                {'└─ '.repeat(projeto.nivel)}
                              </span>
                            )}
                            <span>{projeto.nome}</span>
                          </div>
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
                        <td style={{
                          padding: '16px 24px'
                        }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '4px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600',
                            backgroundColor: projeto.ativo ? '#dcfce7' : '#fee2e2',
                            color: projeto.ativo ? '#166534' : '#991b1b'
                          }}>
                            {projeto.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td style={{
                          padding: '16px 24px',
                          textAlign: 'right'
                        }}>
                          <div style={{
                            display: 'flex',
                            gap: '8px',
                            justifyContent: 'flex-end'
                          }}>
                            <button
                              onClick={() => handleEdit(projeto)}
                              style={{
                                padding: '8px',
                                backgroundColor: 'transparent',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#dbeafe'
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent'
                              }}
                            >
                              <Pencil style={{ width: '16px', height: '16px', color: '#1555D6' }} />
                            </button>
                            <button
                              onClick={() => handleDelete(projeto.id)}
                              style={{
                                padding: '8px',
                                backgroundColor: 'transparent',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#fee2e2'
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent'
                              }}
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
          )}
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
              maxWidth: '600px',
              margin: '16px',
              maxHeight: '90vh',
              overflowY: 'auto',
              animation: 'scaleIn 0.2s ease-out'
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

            <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
                  onChange={(e) => {
                    setValue('empresa_id', e.target.value)
                    setEmpresaSelecionadaModal(e.target.value)
                    setValue('projeto_pai_id', null)
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: errors.empresa_id ? '1px solid #ef4444' : '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#1555D6'}
                  onBlur={(e) => e.currentTarget.style.borderColor = errors.empresa_id ? '#ef4444' : '#e5e7eb'}
                >
                  <option value="">Selecione uma empresa</option>
                  {empresas.map(empresa => (
                    <option key={empresa.id} value={empresa.id}>
                      {empresa.nome}
                    </option>
                  ))}
                </select>
                {errors.empresa_id && (
                  <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
                    {errors.empresa_id.message}
                  </p>
                )}
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Nome do Projeto *
                </label>
                <input
                  {...register('nome')}
                  value={nomeValue}
                  onChange={(e) => {
                    const upper = e.target.value.toUpperCase()
                    setNomeValue(upper)
                    setValue('nome', upper)
                  }}
                  type="text"
                  placeholder="Digite o nome do projeto"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: errors.nome ? '1px solid #ef4444' : '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#1555D6'}
                  onBlur={(e) => e.currentTarget.style.borderColor = errors.nome ? '#ef4444' : '#e5e7eb'}
                />
                {errors.nome && (
                  <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
                    {errors.nome.message}
                  </p>
                )}
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Projeto Pai (opcional)
                </label>
                <select
                  {...register('projeto_pai_id')}
                  disabled={!empresaSelecionadaModal}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    backgroundColor: !empresaSelecionadaModal ? '#f9fafb' : 'white',
                    cursor: !empresaSelecionadaModal ? 'not-allowed' : 'pointer'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#1555D6'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                >
                  <option value="">Nenhum (Projeto principal)</option>
                  {projetosPaiParaModal.map(projeto => (
                    <option key={projeto.id} value={projeto.id}>
                      {projeto.nome}
                    </option>
                  ))}
                </select>
                {!empresaSelecionadaModal && (
                  <p style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px' }}>
                    Selecione uma empresa primeiro
                  </p>
                )}
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Descrição
                </label>
                <textarea
                  {...register('descricao')}
                  value={descricaoValue}
                  onChange={(e) => {
                    setDescricaoValue(e.target.value)
                    setValue('descricao', e.target.value)
                  }}
                  placeholder="Descrição do projeto (opcional)"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: errors.descricao ? '1px solid #ef4444' : '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#1555D6'}
                  onBlur={(e) => e.currentTarget.style.borderColor = errors.descricao ? '#ef4444' : '#e5e7eb'}
                />
                {errors.descricao && (
                  <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
                    {errors.descricao.message}
                  </p>
                )}
              </div>

              <div>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}>
                  <input
                    type="checkbox"
                    {...register('ativo')}
                    style={{
                      width: '16px',
                      height: '16px',
                      cursor: 'pointer'
                    }}
                  />
                  <span style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    Projeto ativo
                  </span>
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