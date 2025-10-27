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
  ordem: number
}

interface Categoria {
  id: string
  grupo_id: string
  nome: string
  ordem: number
}

interface Subcategoria {
  id: string
  categoria_id: string
  nome: string
  slug: string
  ordem: number
  mostrar_em_dre: boolean
  mostrar_em_fluxo: boolean
  created_at: string
  tipo_nome?: string
  grupo_nome?: string
  categoria_nome?: string
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

const subcategoriaSchema = z.object({
  tipo_id: z.string().min(1, 'Tipo é obrigatório'),
  grupo_id: z.string().min(1, 'Grupo é obrigatório'),
  categoria_id: z.string().min(1, 'Categoria é obrigatória'),
  nome: z.string()
    .min(1, 'Nome é obrigatório')
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .transform(val => val.trim()),
  ordem: z.coerce.number()
    .int('Ordem deve ser um número inteiro')
    .min(0, 'Ordem deve ser maior ou igual a 0')
    .max(999, 'Ordem deve ser menor que 1000')
    .default(0),
  mostrar_em_dre: z.boolean().default(true),
  mostrar_em_fluxo: z.boolean().default(true)
})

type SubcategoriaForm = z.infer<typeof subcategoriaSchema>

export default function SubcategoriasPage() {
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [tipos, setTipos] = useState<Tipo[]>([])
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTipoFilter, setSelectedTipoFilter] = useState<string>('')
  const [selectedGrupoFilter, setSelectedGrupoFilter] = useState<string>('')
  const [selectedCategoriaFilter, setSelectedCategoriaFilter] = useState<string>('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)
  const [nomeValue, setNomeValue] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({ 
    show: false, 
    id: null 
  })
  const [isEditing, setIsEditing] = useState(false)

  const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<SubcategoriaForm>({
    resolver: zodResolver(subcategoriaSchema),
    defaultValues: {
      tipo_id: '',
      grupo_id: '',
      categoria_id: '',
      nome: '',
      ordem: 0,
      mostrar_em_dre: true,
      mostrar_em_fluxo: true
    }
  })

  const selectedTipoId = watch('tipo_id')
  const selectedGrupoId = watch('grupo_id')
  const selectedCategoriaId = watch('categoria_id')

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
    loadSubcategorias()
  }, [])

  useEffect(() => {
    if (selectedTipoFilter) {
      loadGrupos(selectedTipoFilter)
      setSelectedGrupoFilter('')
      setSelectedCategoriaFilter('')
    } else {
      setGrupos([])
      setSelectedGrupoFilter('')
      setSelectedCategoriaFilter('')
    }
  }, [selectedTipoFilter])

  useEffect(() => {
    if (selectedGrupoFilter) {
      loadCategorias(selectedGrupoFilter)
      setSelectedCategoriaFilter('')
    } else {
      setCategorias([])
      setSelectedCategoriaFilter('')
    }
  }, [selectedGrupoFilter])

  // No formulário, quando mudar o tipo
  useEffect(() => {
    if (selectedTipoId && !isEditing) {
      loadGrupos(selectedTipoId)
      setValue('grupo_id', '')
      setValue('categoria_id', '')
    }
  }, [selectedTipoId])

  // No formulário, quando mudar o grupo
  useEffect(() => {
    if (selectedGrupoId && !isEditing) {
      loadCategorias(selectedGrupoId)
      setValue('categoria_id', '')
    }
  }, [selectedGrupoId])

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

  const loadGrupos = async (tipoId: string) => {
    try {
      const { data, error } = await supabase
        .from('pc_grupos')
        .select('id, tipo_id, nome, ordem')
        .eq('tipo_id', tipoId)
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true })

      if (error) throw error
      setGrupos(data || [])
    } catch (err) {
      console.error('Erro ao carregar grupos:', err)
      showToast('Erro ao carregar grupos', 'error')
    }
  }

  const loadCategorias = async (grupoId: string) => {
    try {
      const { data, error } = await supabase
        .from('pc_categorias')
        .select('id, grupo_id, nome, ordem')
        .eq('grupo_id', grupoId)
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true })

      if (error) throw error
      setCategorias(data || [])
    } catch (err) {
      console.error('Erro ao carregar categorias:', err)
      showToast('Erro ao carregar categorias', 'error')
    }
  }

  const loadSubcategorias = async () => {
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

      // Carregar todos os grupos
      const { data: todosGrupos } = await supabase
        .from('pc_grupos')
        .select('id, tipo_id, nome')

      // Carregar todas as categorias
      const { data: todasCategorias } = await supabase
        .from('pc_categorias')
        .select('id, grupo_id, nome')

      // Carregar subcategorias
      const { data: subcategoriasData, error: subcategoriasError } = await supabase
        .from('pc_subcategorias')
        .select('*')
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true })

      if (subcategoriasError) throw subcategoriasError

      // Adicionar nomes manualmente (join manual no JavaScript)
      const subcategoriasCompletas = (subcategoriasData || []).map((sub: any) => {
        const categoria = todasCategorias?.find(c => c.id === sub.categoria_id)
        const grupo = todosGrupos?.find(g => g.id === categoria?.grupo_id)
        const tipo = tiposParaUsar.find(t => t.id === grupo?.tipo_id)
        
        return {
          ...sub,
          categoria_nome: categoria?.nome || 'Sem categoria',
          grupo_nome: grupo?.nome || 'Sem grupo',
          tipo_nome: tipo?.nome || 'Sem tipo'
        }
      })

      setSubcategorias(subcategoriasCompletas)
    } catch (err) {
      console.error('Erro ao carregar subcategorias:', err)
      showToast('Erro ao carregar subcategorias', 'error')
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data: SubcategoriaForm) => {
    try {
      const slug = generateSlug(data.nome)

      // Verificar duplicidade de slug para a mesma categoria (exceto o próprio registro ao editar)
      const { data: existingSubcategoria } = await supabase
        .from('pc_subcategorias')
        .select('id')
        .eq('categoria_id', data.categoria_id)
        .eq('slug', slug)
        .neq('id', editingId || '00000000-0000-0000-0000-000000000000')
        .single()

      if (existingSubcategoria) {
        showToast('Já existe uma subcategoria com este nome para a categoria selecionada', 'warning')
        return
      }

      if (editingId) {
        const { error } = await supabase
          .from('pc_subcategorias')
          .update({
            categoria_id: data.categoria_id,
            nome: data.nome,
            slug,
            ordem: data.ordem,
            mostrar_em_dre: data.mostrar_em_dre,
            mostrar_em_fluxo: data.mostrar_em_fluxo
          })
          .eq('id', editingId)

        if (error) {
          console.error('Erro detalhado ao atualizar:', error)
          throw new Error(`Erro ao atualizar subcategoria: ${error.message}`)
        }
        showToast('Subcategoria atualizada com sucesso!', 'success')
      } else {
        const { error } = await supabase
          .from('pc_subcategorias')
          .insert([{
            categoria_id: data.categoria_id,
            nome: data.nome,
            slug,
            ordem: data.ordem,
            mostrar_em_dre: data.mostrar_em_dre,
            mostrar_em_fluxo: data.mostrar_em_fluxo
          }])

        if (error) {
          console.error('Erro detalhado ao criar:', error)
          throw new Error(`Erro ao criar subcategoria: ${error.message}`)
        }
        showToast('Subcategoria criada com sucesso!', 'success')
      }

      loadSubcategorias()
      closeModal()
    } catch (err: any) {
      console.error('Erro ao salvar subcategoria:', err)
      const errorMessage = err.message || 'Erro desconhecido ao salvar subcategoria'
      showToast(errorMessage, 'error')
    }
  }

  const handleEdit = async (subcategoria: Subcategoria) => {
    try {
      setIsEditing(true) // Ativar modo edição
      setEditingId(subcategoria.id)
      setNomeValue(subcategoria.nome)
      
      // Buscar categoria para pegar o grupo_id
      const { data: categoria } = await supabase
        .from('pc_categorias')
        .select('id, grupo_id')
        .eq('id', subcategoria.categoria_id)
        .single()

      if (!categoria) {
        showToast('Erro ao carregar dados da categoria', 'error')
        setIsEditing(false)
        return
      }

      // Buscar grupo para pegar o tipo_id
      const { data: grupo } = await supabase
        .from('pc_grupos')
        .select('id, tipo_id')
        .eq('id', categoria.grupo_id)
        .single()

      if (!grupo) {
        showToast('Erro ao carregar dados do grupo', 'error')
        setIsEditing(false)
        return
      }

      // Carregar grupos deste tipo
      await loadGrupos(grupo.tipo_id)
      
      // Carregar categorias deste grupo
      await loadCategorias(categoria.grupo_id)

      // Setar valores no formulário
      setValue('tipo_id', grupo.tipo_id)
      setValue('grupo_id', categoria.grupo_id)
      setValue('categoria_id', subcategoria.categoria_id)
      setValue('nome', subcategoria.nome)
      setValue('ordem', subcategoria.ordem)
      setValue('mostrar_em_dre', subcategoria.mostrar_em_dre)
      setValue('mostrar_em_fluxo', subcategoria.mostrar_em_fluxo)

      // Aguardar um pouco para garantir que os estados foram atualizados
      await new Promise(resolve => setTimeout(resolve, 50))

      // Abrir modal
      setShowModal(true)
      
      // Desativar modo edição após um pequeno delay
      setTimeout(() => setIsEditing(false), 100)
    } catch (error) {
      console.error('Erro ao editar subcategoria:', error)
      showToast('Erro ao carregar dados para edição', 'error')
      setIsEditing(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('pc_subcategorias')
        .delete()
        .eq('id', id)

      if (error) {
        // Verificar se é erro de foreign key
        if (error.code === '23503') {
          // Tentar identificar qual tabela está causando o problema
          if (error.message.includes('lancamentos')) {
            showToast('Não foi possível excluir: existem lançamentos vinculados a esta subcategoria', 'error')
          } else if (error.message.includes('modelos')) {
            showToast('Não foi possível excluir: existem modelos de lançamento vinculados a esta subcategoria', 'error')
          } else {
            showToast('Não foi possível excluir: existem registros vinculados a esta subcategoria', 'error')
          }
          return
        }
        throw error
      }

      showToast('Subcategoria excluída com sucesso!', 'success')
      loadSubcategorias()
      setDeleteConfirm({ show: false, id: null })
    } catch (err) {
      console.error('Erro ao excluir subcategoria:', err)
      showToast('Erro ao excluir subcategoria', 'error')
    }
  }

  const openNewModal = () => {
    setEditingId(null)
    setNomeValue('')
    setIsEditing(false)
    reset({
      tipo_id: '',
      grupo_id: '',
      categoria_id: '',
      nome: '',
      ordem: 0,
      mostrar_em_dre: true,
      mostrar_em_fluxo: true
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setNomeValue('')
    setIsEditing(false)
    reset()
  }

  // Filtrar subcategorias
  const filteredSubcategorias = subcategorias.filter(sub => {
    const matchesSearch = sub.nome.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesTipo = !selectedTipoFilter || sub.tipo_nome === tipos.find(t => t.id === selectedTipoFilter)?.nome
    const matchesGrupo = !selectedGrupoFilter || sub.grupo_nome === grupos.find(g => g.id === selectedGrupoFilter)?.nome
    const matchesCategoria = !selectedCategoriaFilter || sub.categoria_nome === categorias.find(c => c.id === selectedCategoriaFilter)?.nome
    
    return matchesSearch && matchesTipo && matchesGrupo && matchesCategoria
  })

  // Carregar grupos para o filtro quando selecionar tipo
  const gruposParaFiltro = grupos

  // Carregar categorias para o filtro quando selecionar grupo
  const categoriasParaFiltro = categorias

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header Card */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          <h1 style={{
            fontSize: '24px',
            fontWeight: '600',
            color: '#1f2937',
            margin: 0
          }}>
            Subcategorias
          </h1>
          <button
            onClick={openNewModal}
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
            <Plus size={18} />
            Nova Subcategoria
          </button>
        </div>

        {/* Filtros */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px'
        }}>
          {/* Filtro Tipo */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px'
            }}>
              Tipo
            </label>
            <select
              value={selectedTipoFilter}
              onChange={(e) => setSelectedTipoFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: 'pointer',
                backgroundColor: 'white'
              }}
            >
              <option value="">Todos os tipos</option>
              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Grupo */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px'
            }}>
              Grupo
            </label>
            <select
              value={selectedGrupoFilter}
              onChange={(e) => setSelectedGrupoFilter(e.target.value)}
              disabled={!selectedTipoFilter}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: selectedTipoFilter ? 'pointer' : 'not-allowed',
                backgroundColor: selectedTipoFilter ? 'white' : '#f9fafb',
                opacity: selectedTipoFilter ? 1 : 0.6
              }}
            >
              <option value="">Todos os grupos</option>
              {gruposParaFiltro.map((grupo) => (
                <option key={grupo.id} value={grupo.id}>
                  {grupo.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Categoria */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px'
            }}>
              Categoria
            </label>
            <select
              value={selectedCategoriaFilter}
              onChange={(e) => setSelectedCategoriaFilter(e.target.value)}
              disabled={!selectedGrupoFilter}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: selectedGrupoFilter ? 'pointer' : 'not-allowed',
                backgroundColor: selectedGrupoFilter ? 'white' : '#f9fafb',
                opacity: selectedGrupoFilter ? 1 : 0.6
              }}
            >
              <option value="">Todas as categorias</option>
              {categoriasParaFiltro.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Busca */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px'
            }}>
              Buscar
            </label>
            <div style={{ position: 'relative' }}>
              <Search
                size={18}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#9ca3af'
                }}
              />
              <input
                type="text"
                placeholder="Buscar por nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 40px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>
          </div>
        </div>
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
              display: 'inline-block',
              width: '32px',
              height: '32px',
              border: '3px solid #e5e7eb',
              borderTopColor: '#1555D6',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }} />
            <p style={{ marginTop: '16px', fontSize: '14px' }}>Carregando subcategorias...</p>
          </div>
        ) : filteredSubcategorias.length === 0 ? (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: '#6b7280'
          }}>
            <p style={{ fontSize: '14px' }}>
              {searchTerm || selectedTipoFilter || selectedGrupoFilter || selectedCategoriaFilter
                ? 'Nenhuma subcategoria encontrada com os filtros aplicados'
                : 'Nenhuma subcategoria cadastrada'}
            </p>
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
                    Grupo
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
                    Categoria
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
                    Subcategoria
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'center',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    width: '80px'
                  }}>
                    Ordem
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
                    DRE
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
                    Fluxo
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    width: '160px'
                  }}>
                    Criado em
                  </th>
                  <th style={{
                    padding: '12px 16px',
                    textAlign: 'center',
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
                {filteredSubcategorias.map((subcategoria, index) => (
                  <tr
                    key={subcategoria.id}
                    style={{
                      borderTop: '1px solid #e5e7eb',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{
                      padding: '16px',
                      fontSize: '14px',
                      color: '#6b7280'
                    }}>
                      {subcategoria.tipo_nome}
                    </td>
                    <td style={{
                      padding: '16px',
                      fontSize: '14px',
                      color: '#6b7280'
                    }}>
                      {subcategoria.grupo_nome}
                    </td>
                    <td style={{
                      padding: '16px',
                      fontSize: '14px',
                      color: '#6b7280'
                    }}>
                      {subcategoria.categoria_nome}
                    </td>
                    <td style={{
                      padding: '16px',
                      fontSize: '14px',
                      color: '#1f2937',
                      fontWeight: '500'
                    }}>
                      {subcategoria.nome}
                    </td>
                    <td style={{
                      padding: '16px',
                      fontSize: '14px',
                      color: '#6b7280',
                      textAlign: 'center'
                    }}>
                      {subcategoria.ordem}
                    </td>
                    <td style={{
                      padding: '16px',
                      textAlign: 'center'
                    }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        borderRadius: '12px',
                        backgroundColor: subcategoria.mostrar_em_dre ? '#d1fae5' : '#fee2e2',
                        color: subcategoria.mostrar_em_dre ? '#065f46' : '#991b1b'
                      }}>
                        {subcategoria.mostrar_em_dre ? 'Sim' : 'Não'}
                      </span>
                    </td>
                    <td style={{
                      padding: '16px',
                      textAlign: 'center'
                    }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        borderRadius: '12px',
                        backgroundColor: subcategoria.mostrar_em_fluxo ? '#dbeafe' : '#fee2e2',
                        color: subcategoria.mostrar_em_fluxo ? '#1e40af' : '#991b1b'
                      }}>
                        {subcategoria.mostrar_em_fluxo ? 'Sim' : 'Não'}
                      </span>
                    </td>
                    <td style={{
                      padding: '16px',
                      fontSize: '14px',
                      color: '#6b7280'
                    }}>
                      {formatDate(subcategoria.created_at)}
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
                          onClick={() => handleEdit(subcategoria)}
                          style={{
                            padding: '8px',
                            backgroundColor: 'transparent',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = '#f3f4f6'
                            e.currentTarget.style.borderColor = '#d1d5db'
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                            e.currentTarget.style.borderColor = '#e5e7eb'
                          }}
                        >
                          <Pencil size={16} color="#6b7280" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ show: true, id: subcategoria.id })}
                          style={{
                            padding: '8px',
                            backgroundColor: 'transparent',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = '#fef2f2'
                            e.currentTarget.style.borderColor = '#fecaca'
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                            e.currentTarget.style.borderColor = '#e5e7eb'
                          }}
                        >
                          <Trash2 size={16} color="#ef4444" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setDeleteConfirm({ show: false, id: null })}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#1f2937',
              marginTop: 0,
              marginBottom: '12px'
            }}>
              Confirmar exclusão
            </h3>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              marginBottom: '24px'
            }}>
              Tem certeza que deseja excluir esta subcategoria? Esta ação não pode ser desfeita.
            </p>
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setDeleteConfirm({ show: false, id: null })}
                style={{
                  padding: '10px 20px',
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
                onClick={() => deleteConfirm.id && handleDelete(deleteConfirm.id)}
                style={{
                  padding: '10px 20px',
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

      {/* Create/Edit Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={closeModal}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '600px',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              position: 'sticky',
              top: 0,
              backgroundColor: 'white',
              borderBottom: '1px solid #e5e7eb',
              padding: '16px 20px',
              borderTopLeftRadius: '12px',
              borderTopRightRadius: '12px',
              zIndex: 10
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <h2 style={{
                  fontSize: '20px',
                  fontWeight: '600',
                  color: '#1f2937',
                  margin: 0
                }}>
                  {editingId ? 'Editar Subcategoria' : 'Nova Subcategoria'}
                </h2>
                <button
                  onClick={closeModal}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    padding: '0',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6'
                    e.currentTarget.style.color = '#6b7280'
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = '#9ca3af'
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{ padding: '18px' }}>
              <form onSubmit={handleSubmit(onSubmit)}>
                {/* Tipo */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Tipo *
                  </label>
                  <select
                    {...register('tipo_id')}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: `1px solid ${errors.tipo_id ? '#ef4444' : '#e5e7eb'}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      backgroundColor: 'white'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = errors.tipo_id ? '#ef4444' : '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <option value="">Selecione um tipo</option>
                    {tipos.map((tipo) => (
                      <option key={tipo.id} value={tipo.id}>
                        {tipo.nome}
                      </option>
                    ))}
                  </select>
                  {errors.tipo_id && (
                    <span style={{
                      fontSize: '12px',
                      color: '#ef4444',
                      marginTop: '4px',
                      display: 'block'
                    }}>
                      {errors.tipo_id.message}
                    </span>
                  )}
                </div>

                {/* Grupo */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Grupo *
                  </label>
                  <select
                    {...register('grupo_id')}
                    disabled={!selectedTipoId}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: `1px solid ${errors.grupo_id ? '#ef4444' : '#e5e7eb'}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      cursor: selectedTipoId ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s',
                      backgroundColor: selectedTipoId ? 'white' : '#f9fafb',
                      opacity: selectedTipoId ? 1 : 0.6
                    }}
                    onFocus={(e) => {
                      if (selectedTipoId) {
                        e.currentTarget.style.borderColor = '#1555D6'
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = errors.grupo_id ? '#ef4444' : '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <option value="">Selecione um grupo</option>
                    {grupos.map((grupo) => (
                      <option key={grupo.id} value={grupo.id}>
                        {grupo.nome}
                      </option>
                    ))}
                  </select>
                  {errors.grupo_id && (
                    <span style={{
                      fontSize: '12px',
                      color: '#ef4444',
                      marginTop: '4px',
                      display: 'block'
                    }}>
                      {errors.grupo_id.message}
                    </span>
                  )}
                  {!selectedTipoId && (
                    <p style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginTop: '4px',
                      margin: 0
                    }}>
                      Selecione um tipo primeiro
                    </p>
                  )}
                </div>

                {/* Categoria */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Categoria *
                  </label>
                  <select
                    {...register('categoria_id')}
                    disabled={!selectedGrupoId}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: `1px solid ${errors.categoria_id ? '#ef4444' : '#e5e7eb'}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      cursor: selectedGrupoId ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s',
                      backgroundColor: selectedGrupoId ? 'white' : '#f9fafb',
                      opacity: selectedGrupoId ? 1 : 0.6
                    }}
                    onFocus={(e) => {
                      if (selectedGrupoId) {
                        e.currentTarget.style.borderColor = '#1555D6'
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = errors.categoria_id ? '#ef4444' : '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <option value="">Selecione uma categoria</option>
                    {categorias.map((categoria) => (
                      <option key={categoria.id} value={categoria.id}>
                        {categoria.nome}
                      </option>
                    ))}
                  </select>
                  {errors.categoria_id && (
                    <span style={{
                      fontSize: '12px',
                      color: '#ef4444',
                      marginTop: '4px',
                      display: 'block'
                    }}>
                      {errors.categoria_id.message}
                    </span>
                  )}
                  {!selectedGrupoId && (
                    <p style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginTop: '4px',
                      margin: 0
                    }}>
                      Selecione um grupo primeiro
                    </p>
                  )}
                </div>

                {/* Nome */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
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
                      placeholder="Ex: Produtos, Serviços, Consultorias..."
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
                  {errors.nome && (
                    <span style={{
                      fontSize: '12px',
                      color: '#ef4444',
                      marginTop: '4px',
                      display: 'block'
                    }}>
                      {errors.nome.message}
                    </span>
                  )}
                </div>

                {/* Ordem */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
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
                    Define a ordem de exibição dentro da categoria (0-999)
                  </p>
                </div>

                {/* Checkboxes */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  marginBottom: '16px'
                }}>
                  {/* Mostrar em DRE */}
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer'
                    }}>
                      <input
                        {...register('mostrar_em_dre')}
                        type="checkbox"
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: 'pointer',
                          accentColor: '#1555D6'
                        }}
                      />
                      <div>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '500',
                          color: '#374151'
                        }}>
                          Exibir na DRE
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: '#6b7280',
                          marginTop: '2px'
                        }}>
                          Aparece no relatório DRE
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Mostrar em Fluxo */}
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer'
                    }}>
                      <input
                        {...register('mostrar_em_fluxo')}
                        type="checkbox"
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: 'pointer',
                          accentColor: '#1555D6'
                        }}
                      />
                      <div>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '500',
                          color: '#374151'
                        }}>
                          Exibir no Fluxo
                        </div>
                        <div style={{
                          fontSize: '12px',
                          color: '#6b7280',
                          marginTop: '2px'
                        }}>
                          Aparece no fluxo de caixa
                        </div>
                      </div>
                    </label>
                  </div>
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