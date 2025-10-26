'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatCurrency } from '@/lib/utils'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

const contaSchema = z.object({
  banco: z.string().min(1, 'Banco é obrigatório'),
  agencia: z.string().optional(),
  conta: z.string().min(1, 'Conta é obrigatória'),
  empresa_id: z.string().min(1, 'Empresa é obrigatória'),
  saldo_inicial: z.number().default(0),
  ativo: z.boolean().default(true)
})

type ContaForm = z.infer<typeof contaSchema>

export default function BancosContasPage() {
  const [contas, setContas] = useState<any[]>([])
  const [empresas, setEmpresas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<ContaForm>({
    resolver: zodResolver(contaSchema),
    defaultValues: { saldo_inicial: 0, ativo: true }
  })

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

      const { data: contasData, error } = await supabase
        .from('bancos_contas')
        .select('*, empresas(nome)')
        .order('banco', { ascending: true })

      if (error) throw error
      setContas(contasData || [])
    } catch (err) {
      console.error('Erro ao carregar contas:', err)
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data: ContaForm) => {
    try {
      if (editingId) {
        const { error } = await supabase
          .from('bancos_contas')
          .update(data)
          .eq('id', editingId)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('bancos_contas')
          .insert([data])

        if (error) throw error
      }

      loadData()
      closeModal()
    } catch (err) {
      console.error('Erro ao salvar conta:', err)
      alert('Erro ao salvar conta bancária')
    }
  }

  const handleEdit = (conta: any) => {
    setEditingId(conta.id)
    reset(conta)
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta conta?')) return

    try {
      const { error } = await supabase
        .from('bancos_contas')
        .delete()
        .eq('id', id)

      if (error) throw error
      loadData()
    } catch (err) {
      console.error('Erro ao excluir conta:', err)
      alert('Erro ao excluir conta')
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    reset({ saldo_inicial: 0, ativo: true })
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Contas Bancárias</h1>
          <p className="text-gray mt-1">Gerencie as contas bancárias das empresas</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-primary hover:bg-primary-900 text-white px-4 py-2 rounded-lg transition"
        >
          <Plus className="h-5 w-5" />
          Nova Conta
        </button>
      </div>

      <div className="bg-white rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 border-b border-border">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Banco</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Agência/Conta</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Empresa</th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Saldo Inicial</th>
              <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Ações</th>
            </tr>
          </thead>
          <tbody>
            {contas.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray">Nenhuma conta encontrada</td></tr>
            ) : (
              contas.map((conta) => (
                <tr key={conta.id} className="border-b border-border hover:bg-gray-50 transition">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{conta.banco}</td>
                  <td className="px-6 py-4 text-sm text-gray">{conta.agencia || '-'} / {conta.conta}</td>
                  <td className="px-6 py-4 text-sm text-gray">{conta.empresas?.nome || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray text-right">{formatCurrency(conta.saldo_inicial || 0)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      conta.ativo ? 'bg-success/10 text-success' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {conta.ativo ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleEdit(conta)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                        <Pencil className="h-4 w-4 text-gray-600" />
                      </button>
                      <button onClick={() => handleDelete(conta.id)} className="p-2 hover:bg-red-50 rounded-lg transition">
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
              {editingId ? 'Editar Conta' : 'Nova Conta'}
            </h2>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Banco *</label>
                <input {...register('banco')} className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Nome do banco" />
                {errors.banco && <p className="text-sm text-red-600 mt-1">{errors.banco.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Agência</label>
                  <input {...register('agencia')} className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0000" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Conta *</label>
                  <input {...register('conta')} className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring" placeholder="00000-0" />
                  {errors.conta && <p className="text-sm text-red-600 mt-1">{errors.conta.message}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Empresa *</label>
                <select {...register('empresa_id')} className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">Selecione uma empresa</option>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
                {errors.empresa_id && <p className="text-sm text-red-600 mt-1">{errors.empresa_id.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Saldo Inicial</label>
                <input type="number" step="0.01" {...register('saldo_inicial', { valueAsNumber: true })} className="w-full px-3 py-2 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0,00" />
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" {...register('ativo')} id="ativo" className="rounded" />
                <label htmlFor="ativo" className="text-sm font-medium text-gray-700">Conta ativa</label>
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
