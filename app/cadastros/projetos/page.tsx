'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

const projetoSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  empresa_id: z.string().min(1, 'Empresa é obrigatória'),
  descricao: z.string().optional(),
  ativo: z.boolean().default(true)
})

type ProjetoForm = z.infer<typeof projetoSchema>

export default function ProjetosPage() {
  const [projetos, setProjetos] = useState<any[]>([])
  const [empresas, setEmpresas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProjetoForm>({
    resolver: zodResolver(projetoSchema)
  })

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

      // Load projetos
      const { data: projetosData, error } = await supabase
        .from('projetos')
        .select('*, empresas(nome)')
        .order('nome', { ascending: true })

      if (error) throw error
      setProjetos(projetosData || [])
    } catch (err) {
      console.error('Erro ao carregar projetos:', err)
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data: ProjetoForm) => {
    try {
      if (editingId) {
        const { error } = await supabase
          .from('projetos')
          .update(data)
          .eq('id', editingId)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('projetos')
          .insert([data])

        if (error) throw error
      }

      loadData()
      closeModal()
    } catch (err) {
      console.error('Erro ao salvar projeto:', err)
      alert('Erro ao salvar projeto')
    }
  }

  const handleEdit = (projeto: any) => {
    setEditingId(projeto.id)
    reset({
      nome: projeto.nome,
      empresa_id: projeto.empresa_id,
      descricao: projeto.descricao || '',
      ativo: projeto.ativo
    })
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este projeto?')) return

    try {
      const { error } = await supabase
        .from('projetos')
        .delete()
        .eq('id', id)

      if (error) throw error
      loadData()
    } catch (err) {
      console.error('Erro ao excluir projeto:', err)
      alert('Erro ao excluir projeto')
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    reset()
  }

  const filteredProjetos = projetos.filter(p =>
    p.nome.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Projetos</h1>
          <p className="text-gray mt-1">Gerencie os projetos das empresas</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary hover:bg-primary-900 text-white px-4 py-2 rounded-lg transition"
        >
          <Plus className="h-5 w-5" />
          Novo Projeto
        </button>
      </div>

      <div className="bg-white rounded-lg border border-border p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray" />
          <input
            type="text"
            placeholder="Buscar projetos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 border-b border-border">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nome</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Empresa</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Descrição</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredProjetos.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray">
                  Nenhum projeto encontrado
                </td>
              </tr>
            ) : (
              filteredProjetos.map((projeto) => (
                <tr key={projeto.id} className="border-b border-border hover:bg-gray-50 transition">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{projeto.nome}</td>
                  <td className="px-6 py-4 text-sm text-gray">{projeto.empresas?.nome || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray">{projeto.descricao || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      projeto.ativo
                        ? 'bg-success/10 text-success'
                        : 'bg-gray-200 text-gray-600'
                    }`}>
                      {projeto.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(projeto)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition"
                      >
                        <Pencil className="h-4 w-4 text-gray-600" />
                      </button>
                      <button
                        onClick={() => handleDelete(projeto.id)}
                        className="p-2 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingId ? 'Editar Projeto' : 'Novo Projeto'}
            </h2>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  {...register('nome')}
                  className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Nome do projeto"
                />
                {errors.nome && (
                  <p className="text-sm text-red-600 mt-1">{errors.nome.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Empresa *</label>
                <select
                  {...register('empresa_id')}
                  className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Selecione uma empresa</option>
                  {empresas.map(e => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
                {errors.empresa_id && (
                  <p className="text-sm text-red-600 mt-1">{errors.empresa_id.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea
                  {...register('descricao')}
                  className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                  placeholder="Descrição do projeto"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  {...register('ativo')}
                  id="ativo"
                  className="rounded"
                />
                <label htmlFor="ativo" className="text-sm font-medium text-gray-700">
                  Projeto ativo
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary hover:bg-primary-900 text-white rounded-lg transition"
                >
                  {editingId ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
