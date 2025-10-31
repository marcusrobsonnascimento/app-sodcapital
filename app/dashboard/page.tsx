'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatCurrency } from '@/lib/utils'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  Clock,
  AlertCircle,
  RefreshCcw,
  Building2,
  Calendar,
  Briefcase
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts'

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316']

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [empresas, setEmpresas] = useState<any[]>([])
  const [projetos, setProjetos] = useState<any[]>([])
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>('todas')
  const [selectedProjeto, setSelectedProjeto] = useState<string>('todos')
  const [selectedMes, setSelectedMes] = useState<string>('atual')
  
  const [kpis, setKpis] = useState<any>(null)
  const [fluxoData, setFluxoData] = useState<any[]>([])
  const [dreData, setDreData] = useState<any[]>([])
  const [empresasData, setEmpresasData] = useState<any[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)

      const { data: emp } = await supabase.from('empresas').select('id, nome').eq('ativo', true).order('nome')
      if (emp) setEmpresas(emp)

      const { data: proj } = await supabase.from('projetos').select('id, nome, empresa_id').eq('ativo', true).order('nome')
      if (proj) setProjetos(proj)

      const { data: kp } = await supabase.from('vw_pl_painel').select('*').limit(1).single()
      if (kp) setKpis(kp)

      const { data: flux } = await supabase.from('vw_fluxo_previsto').select('*').order('data_prevista', { ascending: true }).limit(60)
      if (flux) setFluxoData(flux)

      const { data: dre } = await supabase.from('vw_dre_ytd').select('*').limit(10)
      if (dre) setDreData(dre)

      const { data: empData } = await supabase
        .from('empresas')
        .select(`id, nome, cnpj, segmento, lancamentos!inner(tipo, valor_bruto)`)
        .eq('ativo', true)

      if (empData) {
        const processed = empData.map(e => {
          const rec = e.lancamentos.filter((l: any) => l.tipo === 'RECEITA').reduce((s: number, l: any) => s + parseFloat(l.valor_bruto || 0), 0)
          const desp = e.lancamentos.filter((l: any) => l.tipo === 'DESPESA').reduce((s: number, l: any) => s + parseFloat(l.valor_bruto || 0), 0)
          return { ...e, receitas_ytd: rec, despesas_ytd: desp, resultado: rec - desp }
        })
        setEmpresasData(processed)
      }

    } catch (err) {
      console.error('Erro:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-20 w-20 border-t-4 border-b-4 border-blue-600 mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-pulse h-12 w-12 bg-blue-400 rounded-full opacity-20"></div>
            </div>
          </div>
          <p className="text-gray-700 font-semibold text-lg mt-6">Carregando dashboard...</p>
        </div>
      </div>
    )
  }

  const fluxoChart = fluxoData.map(i => ({
    data: new Date(i.data_prevista).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    valor: parseFloat(i.valor) || 0
  }))

  const dreChart = dreData.map((i, idx) => ({
    name: (i.categoria || i.subcategoria || 'Outros').substring(0, 20),
    valor: Math.abs(parseFloat(i.valor_ytd) || 0),
    fill: COLORS[idx % COLORS.length]
  })).filter(i => i.valor > 0)

  const pieChart = empresasData.map((e, idx) => ({
    name: e.nome.length > 20 ? e.nome.substring(0, 20) + '...' : e.nome,
    value: e.receitas_ytd,
    fill: COLORS[idx % COLORS.length]
  })).filter(i => i.value > 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-[1800px] mx-auto">
        
        {/* Header Premium */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 mb-2">
              Dashboard Executivo
            </h1>
            <p className="text-gray-600 font-medium">Visão geral financeira em tempo real</p>
          </div>
          <button 
            onClick={loadData} 
            className="group bg-white hover:bg-gradient-to-r hover:from-blue-600 hover:to-indigo-600 border-2 border-blue-200 hover:border-transparent px-6 py-3 rounded-xl flex items-center gap-3 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            <RefreshCcw className="h-5 w-5 text-blue-600 group-hover:text-white transition-colors" />
            <span className="font-semibold text-gray-700 group-hover:text-white transition-colors">Atualizar</span>
          </button>
        </div>

        {/* Filtros Premium */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="group">
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-3">
                <div className="p-1.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
                  <Calendar className="h-4 w-4 text-white" />
                </div>
                Período
              </label>
              <select 
                value={selectedMes} 
                onChange={e => setSelectedMes(e.target.value)} 
                className="w-full px-4 py-3 text-sm font-medium border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all bg-white hover:border-blue-300"
              >
                <option value="atual">Este Mês</option>
                <option value="ytd">YTD - Ano até agora</option>
                <option value="ultimo">Último Mês</option>
                <option value="trimestre">Último Trimestre</option>
                <option value="ano">Ano Completo</option>
              </select>
            </div>
            <div className="group">
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-3">
                <div className="p-1.5 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg">
                  <Building2 className="h-4 w-4 text-white" />
                </div>
                Empresa
              </label>
              <select 
                value={selectedEmpresa} 
                onChange={e => setSelectedEmpresa(e.target.value)} 
                className="w-full px-4 py-3 text-sm font-medium border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-purple-100 focus:border-purple-500 transition-all bg-white hover:border-purple-300"
              >
                <option value="todas">Todas as Empresas</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
            <div className="group">
              <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-3">
                <div className="p-1.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg">
                  <Briefcase className="h-4 w-4 text-white" />
                </div>
                Projeto
              </label>
              <select 
                value={selectedProjeto} 
                onChange={e => setSelectedProjeto(e.target.value)} 
                className="w-full px-4 py-3 text-sm font-medium border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 transition-all bg-white hover:border-emerald-300"
              >
                <option value="todos">Todos os Projetos</option>
                {projetos.filter(p => selectedEmpresa === 'todas' || p.empresa_id === selectedEmpresa).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* KPIs Premium */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div className="group relative bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-2xl hover:shadow-3xl transition-all duration-300 p-6 overflow-hidden transform hover:-translate-y-1">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 shadow-lg">
                  <DollarSign className="h-7 w-7 text-white" />
                </div>
                {kpis?.var_pl_d1 && kpis.var_pl_d1 !== 0 && (
                  <div className="bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    {kpis.var_pl_d1 >= 0 ? <TrendingUp className="h-4 w-4 text-white" /> : <TrendingDown className="h-4 w-4 text-white" />}
                    <span className="text-white font-bold text-sm">{Math.abs(kpis.var_pl_d1).toFixed(1)}%</span>
                  </div>
                )}
              </div>
              <h3 className="text-white/80 text-sm font-semibold mb-2">Patrimônio Líquido</h3>
              <p className="text-white text-3xl font-black mb-1">{formatCurrency(parseFloat(kpis?.pl_aproximado || 0))}</p>
              <p className="text-white/70 text-xs font-medium">vs. período anterior</p>
            </div>
          </div>

          <div className="group relative bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-2xl hover:shadow-3xl transition-all duration-300 p-6 overflow-hidden transform hover:-translate-y-1">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 shadow-lg">
                  <Wallet className="h-7 w-7 text-white" />
                </div>
                {kpis?.var_caixa_d1 && kpis.var_caixa_d1 !== 0 && (
                  <div className="bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    {kpis.var_caixa_d1 >= 0 ? <TrendingUp className="h-4 w-4 text-white" /> : <TrendingDown className="h-4 w-4 text-white" />}
                    <span className="text-white font-bold text-sm">{Math.abs(kpis.var_caixa_d1).toFixed(1)}%</span>
                  </div>
                )}
              </div>
              <h3 className="text-white/80 text-sm font-semibold mb-2">Caixa Consolidado</h3>
              <p className="text-white text-3xl font-black mb-1">{formatCurrency(parseFloat(kpis?.caixa_total || 0))}</p>
              <p className="text-white/70 text-xs font-medium">disponível agora</p>
            </div>
          </div>

          <div className="group relative bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl shadow-2xl hover:shadow-3xl transition-all duration-300 p-6 overflow-hidden transform hover:-translate-y-1">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 shadow-lg">
                  <ArrowUpCircle className="h-7 w-7 text-white" />
                </div>
                {kpis?.var_receitas_m1 && kpis.var_receitas_m1 !== 0 && (
                  <div className="bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    {kpis.var_receitas_m1 >= 0 ? <TrendingUp className="h-4 w-4 text-white" /> : <TrendingDown className="h-4 w-4 text-white" />}
                    <span className="text-white font-bold text-sm">{Math.abs(kpis.var_receitas_m1).toFixed(1)}%</span>
                  </div>
                )}
              </div>
              <h3 className="text-white/80 text-sm font-semibold mb-2">Receitas YTD</h3>
              <p className="text-white text-3xl font-black mb-1">{formatCurrency(parseFloat(kpis?.receitas_ytd || 0))}</p>
              <p className="text-white/70 text-xs font-medium">acumulado do ano</p>
            </div>
          </div>

          <div className="group relative bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl shadow-2xl hover:shadow-3xl transition-all duration-300 p-6 overflow-hidden transform hover:-translate-y-1">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 shadow-lg">
                  <ArrowDownCircle className="h-7 w-7 text-white" />
                </div>
                {kpis?.var_despesas_m1 && kpis.var_despesas_m1 !== 0 && (
                  <div className="bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    {kpis.var_despesas_m1 >= 0 ? <TrendingUp className="h-4 w-4 text-white" /> : <TrendingDown className="h-4 w-4 text-white" />}
                    <span className="text-white font-bold text-sm">{Math.abs(kpis.var_despesas_m1).toFixed(1)}%</span>
                  </div>
                )}
              </div>
              <h3 className="text-white/80 text-sm font-semibold mb-2">Despesas YTD</h3>
              <p className="text-white text-3xl font-black mb-1">{formatCurrency(Math.abs(parseFloat(kpis?.despesas_ytd || 0)))}</p>
              <p className="text-white/70 text-xs font-medium">gastos do ano</p>
            </div>
          </div>
        </div>

        {/* Dias de Caixa Premium */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8 mb-6 relative overflow-hidden group hover:shadow-2xl transition-all duration-300">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full opacity-20 -mr-32 -mt-32 group-hover:scale-110 transition-transform duration-500"></div>
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-5 shadow-2xl">
                <Clock className="h-10 w-10 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-gray-900 mb-1">Dias de Caixa</h3>
                <p className="text-sm text-gray-600 font-medium">Capacidade operacional com saldo atual</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-6xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
                {parseInt(kpis?.dias_caixa || 0)}
              </p>
              <p className="text-lg text-gray-600 font-bold">dias</p>
            </div>
          </div>
        </div>

        {/* Gráficos Premium */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6 hover:shadow-2xl transition-all duration-300">
            <div className="mb-5">
              <h3 className="text-xl font-black text-gray-900 mb-1">Curva de Liquidez</h3>
              <p className="text-sm text-gray-600 font-medium">Projeção de caixa dos próximos 60 dias</p>
            </div>
            {fluxoChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={fluxoChart}>
                  <defs>
                    <linearGradient id="colorValor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="data" fontSize={11} stroke="#6B7280" fontWeight={600} />
                  <YAxis fontSize={11} stroke="#6B7280" fontWeight={600} tickFormatter={v => `R$ ${(v/1000).toFixed(0)}k`} />
                  <Tooltip 
                    formatter={(v: any) => formatCurrency(v)} 
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                      border: 'none',
                      borderRadius: '12px',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                      padding: '12px'
                    }}
                  />
                  <Area type="monotone" dataKey="valor" stroke="#3B82F6" strokeWidth={3} fill="url(#colorValor)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6 hover:shadow-2xl transition-all duration-300">
            <div className="mb-5">
              <h3 className="text-xl font-black text-gray-900 mb-1">DRE - Top Categorias</h3>
              <p className="text-sm text-gray-600 font-medium">Maiores valores por categoria</p>
            </div>
            {dreChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dreChart.slice(0, 6)} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis type="number" fontSize={11} stroke="#6B7280" fontWeight={600} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" fontSize={11} stroke="#6B7280" fontWeight={600} width={110} />
                  <Tooltip 
                    formatter={(v: any) => formatCurrency(v)}
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                      border: 'none',
                      borderRadius: '12px',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                      padding: '12px'
                    }}
                  />
                  <Bar dataKey="valor" radius={[0, 8, 8, 0]}>
                    {dreChart.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>
        </div>

        {/* Fluxo Futuro Premium */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6 mb-6 hover:shadow-2xl transition-all duration-300">
          <div className="mb-5">
            <h3 className="text-xl font-black text-gray-900 mb-1">Fluxo de Caixa Projetado</h3>
            <p className="text-sm text-gray-600 font-medium">Entradas e saídas previstas por período</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: '30 dias', key: 'fluxo_30d', gradient: 'from-blue-500 to-cyan-500' },
              { label: '60 dias', key: 'fluxo_60d', gradient: 'from-purple-500 to-pink-500' },
              { label: '90 dias', key: 'fluxo_90d', gradient: 'from-orange-500 to-red-500' },
              { label: '180 dias', key: 'fluxo_180d', gradient: 'from-emerald-500 to-teal-500' }
            ].map(item => {
              const valor = parseFloat(kpis?.[item.key] || 0)
              const isPositive = valor >= 0
              return (
                <div key={item.key} className={`relative rounded-2xl p-6 bg-gradient-to-br ${item.gradient} overflow-hidden group hover:scale-105 transition-transform duration-300 shadow-xl cursor-pointer`}>
                  <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-12 -mt-12"></div>
                  <div className="relative z-10">
                    <p className="text-white/80 text-sm font-bold mb-3">{item.label}</p>
                    <p className={`text-white text-2xl font-black`}>
                      {formatCurrency(valor)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Grid Bottom Premium */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {pieChart.length > 0 && (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6 hover:shadow-2xl transition-all duration-300">
              <div className="mb-5">
                <h3 className="text-xl font-black text-gray-900 mb-1">Receitas por Empresa</h3>
                <p className="text-sm text-gray-600 font-medium">Distribuição percentual</p>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieChart}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => {
                      const percent = ((entry.value / pieChart.reduce((a, b) => a + b.value, 0)) * 100).toFixed(1)
                      return `${entry.name}: ${percent}%`
                    }}
                    outerRadius={100}
                    dataKey="value"
                    stroke="#fff"
                    strokeWidth={3}
                  >
                    {pieChart.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip 
                    formatter={(v: any) => formatCurrency(v)}
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                      border: 'none',
                      borderRadius: '12px',
                      boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                      padding: '12px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {empresasData.length > 0 && (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center gap-3 mb-5">
                <div className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl p-3 shadow-lg">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900">Empresas</h3>
                  <p className="text-sm text-gray-600 font-medium">Desempenho consolidado</p>
                </div>
              </div>
              <div className="overflow-auto max-h-64">
                <table className="w-full">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-3 px-3 font-black text-gray-700 text-sm">Empresa</th>
                      <th className="text-right py-3 px-3 font-black text-gray-700 text-sm">Receitas</th>
                      <th className="text-right py-3 px-3 font-black text-gray-700 text-sm">Despesas</th>
                      <th className="text-right py-3 px-3 font-black text-gray-700 text-sm">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empresasData.map(e => (
                      <tr key={e.id} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors">
                        <td className="py-3 px-3 font-bold text-gray-900 text-sm">{e.nome.substring(0, 30)}</td>
                        <td className="py-3 px-3 text-right text-emerald-600 font-bold text-sm">{formatCurrency(e.receitas_ytd)}</td>
                        <td className="py-3 px-3 text-right text-rose-600 font-bold text-sm">{formatCurrency(e.despesas_ytd)}</td>
                        <td className={`py-3 px-3 text-right font-black text-sm ${e.resultado >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {formatCurrency(e.resultado)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="h-[300px] flex items-center justify-center">
      <div className="text-center">
        <div className="bg-gray-100 rounded-full p-4 inline-block mb-3">
          <AlertCircle className="h-8 w-8 text-gray-400" />
        </div>
        <p className="text-sm text-gray-500 font-medium">Sem dados disponíveis</p>
      </div>
    </div>
  )
}