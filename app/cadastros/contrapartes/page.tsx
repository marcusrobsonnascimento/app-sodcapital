'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

const contraparteSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  tipo: z.enum(['cliente', 'fornecedor', 'ambos']),
  cpf_cnpj: z.string().optional(),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  telefone: z.string().optional(),
  ativo: z.boolean().default(true)
})

type ContraparteForm = z.infer<typeof contraparteSchema>

export default function ContrapartesPage() {
  const [contrapartes, setContrapartes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ContraparteForm>({
    resolver: zodResolver(contraparteSchema),
    defaultValues: { tipo: 'fornecedor', ativo: true }
  })

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
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data: ContraparteForm) => {
    try {
      if (editingId) {
        const { error } = await supabase
          .from('contrapartes')
          .update(data)
          .eq('id', editingId)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('contrapartes')
          .insert([data])

        if (error) throw error
      }

      loadContrapartes()
      closeModal()
    } catch (err) {
      console.error('Erro ao salvar contraparte:', err)
      alert('Erro ao salvar contraparte')
    }
  }

  const handleEdit = (contraparte: any) => {
    setEditingId(contraparte.id)
    reset(contraparte)
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta contraparte?')) return

    try {
      const { error } = await supabase
        .from('contrapartes')
        .delete()
        .eq('id', id)

      if (error) throw error
      loadContrapartes()
    } catch (err) {
      console.error('Erro ao excluir contraparte:', err)
      alert('Erro ao excluir contraparte')
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    reset({ tipo: 'fornecedor', ativo: true })
  }

  const filteredContrapartes = contrapartes.filter(c =>
    c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.cpf_cnpj && c.cpf_cnpj.includes(searchTerm))
  )

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Contrapartes</h1>
          <p className="text-gray mt-1">Gerencie clientes e fornecedores</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-primary hover:bg-primary-900 text-white px-4 py-2 rounded-lg transition">
          <Plus className="h-5 w-5" />
          Nova Contraparte
        </button>
      </div>

      <div className="bg-white rounded-lg border border-border p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray" />
          <input type="text" placeholder="Buscar por nome ou CPF/CNPJ..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 border-b border-border">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Nome</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Tipo</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">CPF/CNPJ</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">E-mail</th>
              <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredContrapartes.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray">Nenhuma contraparte encontrada</td></tr>
            ) : (
              filteredContrapartes.map((contraparte) => (
                <tr key={contraparte.id} className="border-b border-border hover:bg-gray-50 transition">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{contraparte.nome}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      contraparte.tipo === 'cliente' ? 'bg-blue-100 text-blue-700' :
                      contraparte.tipo === 'fornecedor' ? 'bg-purple-100 text-purple-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {contraparte.tipo === 'cliente' ? 'Cliente' : contraparte.tipo === 'fornecedor' ? 'Fornecedor' : 'Ambos'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray">{contraparte.cpf_cnpj || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray">{contraparte.email || '-'}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${contraparte.ativo ? 'bg-success/10 text-success' : 'bg-gray-200 text-gray-600'}`}>
                      {contraparte.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleEdit(contraparte)} className="p-2 hover:bg-gray-100 rounded-lg transition"><Pencil className="h-4 w-4 text-gray-600" /></button>
                      <button onClick={() => handleDelete(contraparte.id)} className="p-2 hover:bg-red-50 rounded-lg transition"><Trash2 className="h-4 w-4 text-red-600" /></button>
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
            <h2 className="text-xl font-bold text-gray-900 mb-4">{editingId ? 'Editar Contraparte' : 'Nova Contraparte'}</h2>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input {...register('nome')} className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Nome da contraparte" />
                {errors.nome && <p className="text-sm text-red-600 mt-1">{errors.nome.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
                <select {...register('tipo')} className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="cliente">Cliente</option>
                  <option value="fornecedor">Fornecedor</option>
                  <option value="ambos">Ambos</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CPF/CNPJ</label>
                <input {...register('cpf_cnpj')} className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring" placeholder="000.000.000-00" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input type="email" {...register('email')} className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring" placeholder="email@exemplo.com" />
                {errors.email && <p className="text-sm text-red-600 mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input {...register('telefone')} className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring" placeholder="(00) 00000-0000" />
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" {...register('ativo')} id="ativo" className="rounded" />
                <label htmlFor="ativo" className="text-sm font-medium text-gray-700">Contraparte ativa</label>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-primary hover:bg-primary-900 text-white rounded-lg transition">{editingId ? 'Atualizar' : 'Criar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
