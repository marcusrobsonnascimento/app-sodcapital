'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  ArrowUpCircle,
  ArrowDownCircle,
  Clock,
  AlertCircle
} from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [plData, setPlData] = useState<any>(null)
  const [fluxoData, setFluxoData] = useState<any[]>([])
  const [dreData, setDreData] = useState<any[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      // Buscar dados do painel de PL
      const { data: plInfo, error: plError } = await supabase
        .from('vw_pl_painel')
        .select('*')
        .limit(1)
        .single()

      if (plError && plError.code !== 'PGRST116') {
        console.error('Erro PL:', plError)
      }

      setPlData(plInfo || {})

      // Buscar fluxo previsto (últimos 180 dias)
      const { data: fluxo, error: fluxoError } = await supabase
        .from('vw_fluxo_previsto')
        .select('*')
        .order('data_prevista', { ascending: true })
        .limit(180)

      if (fluxoError) {
        console.error('Erro Fluxo:', fluxoError)
      }

      setFluxoData(fluxo || [])

      // Buscar DRE YTD
      const { data: dre, error: dreError } = await supabase
        .from('vw_dre_ytd')
        .select('*')
        .order('tipo', { ascending: true })

      if (dreError) {
        console.error('Erro DRE:', dreError)
      }

      setDreData(dre || [])

    } catch (err: any) {
      console.error('Erro ao carregar dashboard:', err)
      setError('Erro ao carregar dados do dashboard')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-center gap-3">
          <AlertCircle className="h-6 w-6 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Erro ao carregar dashboard</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  // Preparar dados para gráficos
  const fluxoChartData = fluxoData.slice(0, 180).map(item => ({
    data: formatDate(item.data_prevista),
    valor: item.valor || 0,
    tipo: item.tipo
  }))

  const dreChartData = dreData.slice(0, 10).map(item => ({
    categoria: item.categoria || item.grupo || item.tipo || 'Outros',
    valor: Math.abs(item.valor_ytd || 0)
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard Executivo</h1>
        <p className="text-gray mt-1">Visão geral dos indicadores financeiros</p>
      </div>

      {/* KPIs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* PL Aproximado */}
        <KPICard
          title="PL Aproximado"
          value={plData?.pl_aproximado || 0}
          icon={DollarSign}
          iconBg="bg-primary"
          change={plData?.var_pl_d1 || 0}
          changeLabel="vs. D-1"
        />

        {/* Caixa Consolidado */}
        <KPICard
          title="Caixa Consolidado"
          value={plData?.caixa_total || 0}
          icon={Wallet}
          iconBg="bg-success"
          change={plData?.var_caixa_d1 || 0}
          changeLabel="vs. D-1"
        />

        {/* Receitas YTD */}
        <KPICard
          title="Receitas YTD"
          value={plData?.receitas_ytd || 0}
          icon={ArrowUpCircle}
          iconBg="bg-info"
          change={plData?.var_receitas_m1 || 0}
          changeLabel="vs. M-1"
        />

        {/* Despesas YTD */}
        <KPICard
          title="Despesas YTD"
          value={Math.abs(plData?.despesas_ytd || 0)}
          icon={ArrowDownCircle}
          iconBg="bg-warning"
          change={plData?.var_despesas_m1 || 0}
          changeLabel="vs. M-1"
        />
      </div>

      {/* Dias de Caixa */}
      <div className="bg-white rounded-2xl shadow-sm p-6 border border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Dias de Caixa</h3>
            <p className="text-sm text-gray mt-1">Média de saídas dos últimos 90 dias</p>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="h-8 w-8 text-primary" />
            <div className="text-right">
              <p className="text-3xl font-bold text-gray-900">
                {plData?.dias_caixa || 0}
              </p>
              <p className="text-sm text-gray">dias</p>
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Curva de Liquidez */}
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Curva de Liquidez (180 dias)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={fluxoChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="data" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
              <Legend />
              <Line type="monotone" dataKey="valor" stroke="#1555D6" strokeWidth={2} name="Saldo Projetado" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* DRE YTD */}
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">DRE YTD - Top 10 Categorias</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dreChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="categoria" fontSize={12} angle={-45} textAnchor="end" height={80} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
              <Bar dataKey="valor" fill="#1555D6" name="Valor YTD" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fluxo Previsto */}
      <div className="bg-white rounded-2xl shadow-sm p-6 border border-border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Fluxo Previsto</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <FluxoCard periodo="30 dias" valor={plData?.fluxo_30d || 0} />
          <FluxoCard periodo="60 dias" valor={plData?.fluxo_60d || 0} />
          <FluxoCard periodo="90 dias" valor={plData?.fluxo_90d || 0} />
          <FluxoCard periodo="180 dias" valor={plData?.fluxo_180d || 0} />
        </div>
      </div>
    </div>
  )
}

function KPICard({
  title,
  value,
  icon: Icon,
  iconBg,
  change,
  changeLabel
}: {
  title: string
  value: number
  icon: any
  iconBg: string
  change: number
  changeLabel: string
}) {
  const isPositive = change >= 0

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 border border-border">
      <div className="flex items-start justify-between mb-4">
        <div className={`${iconBg} rounded-lg p-3`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        {change !== 0 && (
          <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-success' : 'text-danger'}`}>
            {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            <span>{formatPercent(Math.abs(change), 1)}</span>
          </div>
        )}
      </div>
      <h3 className="text-sm font-medium text-gray mb-1">{title}</h3>
      <p className="text-2xl font-bold text-gray-900">{formatCurrency(value)}</p>
      <p className="text-xs text-gray mt-1">{changeLabel}</p>
    </div>
  )
}

function FluxoCard({ periodo, valor }: { periodo: string; valor: number }) {
  return (
    <div className="bg-gray-100 rounded-lg p-4">
      <p className="text-sm font-medium text-gray mb-2">{periodo}</p>
      <p className={`text-xl font-bold ${valor >= 0 ? 'text-success' : 'text-danger'}`}>
        {formatCurrency(valor)}
      </p>
    </div>
  )
}
