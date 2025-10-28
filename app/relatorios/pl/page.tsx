'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSearchParams, useRouter } from 'next/navigation'
import { 
  Filter, Download, Wallet, DollarSign, ArrowUpCircle, 
  ArrowDownCircle, TrendingUp, TrendingDown, X 
} from 'lucide-react'
import { 
  PieChart, Pie, LineChart, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell 
} from 'recharts'

// Toast notification system
type ToastType = 'success' | 'warning' | 'error'

interface Toast {
  id: number
  message: string
  type: ToastType
}

// Types
interface Empresa {
  id: string
  nome: string
}

interface Projeto {
  id: string
  empresa_id: string
  nome: string
}

interface ComposicaoItem {
  chave: string
  nome: string
  valor: number
  percentual: number
}

interface EvolucaoMensal {
  mes: string
  pl: number
}

interface BreakdownItem {
  chave: string
  nome: string
  receitas_ytd: number
  despesas_ytd: number
  resultado_ytd: number
  percentual_pl: number
}

interface MovimentoRelevante {
  data: string
  tipo: string
  empresa: string
  projeto: string
  subcategoria: string
  contraparte: string
  valor: number
}

type AgrupamentoType = 'EMPRESA' | 'PROJETO' | 'SUBCATEGORIA'

// Cores do gráfico
const CHART_COLORS = [
  '#1555D6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'
]

// Função para formatar moeda BRL
const formatCurrencyBRL = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

// Função para formatar data
const formatDateBR = (dateString: string): string => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('pt-BR')
}

// Função para formatar percentual
const formatPercentBR = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 100)
}

export default function PainelPLPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Estados
  const [loading, setLoading] = useState(false)
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  
  // KPIs
  const [caixaTotal, setCaixaTotal] = useState<number>(0)
  const [receitasYTD, setReceitasYTD] = useState<number>(0)
  const [despesasYTD, setDespesasYTD] = useState<number>(0)
  const [plAproximado, setPlAproximado] = useState<number>(0)
  
  // Dados do painel
  const [composicao, setComposicao] = useState<ComposicaoItem[]>([])
  const [evolucao, setEvolucao] = useState<EvolucaoMensal[]>([])
  const [breakdown, setBreakdown] = useState<BreakdownItem[]>([])
  const [movimentos, setMovimentos] = useState<MovimentoRelevante[]>([])
  
  // Filtros
  const [anoSelecionado, setAnoSelecionado] = useState<number>(new Date().getFullYear())
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string>('')
  const [projetoSelecionado, setProjetoSelecionado] = useState<string>('')
  const [agrupamento, setAgrupamento] = useState<AgrupamentoType>('EMPRESA')
  
  // Toast
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)

  // Carregar filtros da URL
  useEffect(() => {
    const ano = searchParams.get('ano')
    const empresa = searchParams.get('empresa')
    const projeto = searchParams.get('projeto')
    const agrup = searchParams.get('agrupamento')
    
    if (ano) setAnoSelecionado(parseInt(ano))
    if (empresa) setEmpresaSelecionada(empresa)
    if (projeto) setProjetoSelecionado(projeto)
    if (agrup) setAgrupamento(agrup as AgrupamentoType)
  }, [searchParams])

  useEffect(() => {
    loadEmpresas()
  }, [])

  useEffect(() => {
    if (empresaSelecionada) {
      loadProjetos(empresaSelecionada)
    } else {
      setProjetos([])
      setProjetoSelecionado('')
    }
  }, [empresaSelecionada])

  useEffect(() => {
    if (empresas.length > 0) {
      loadPainelData()
    }
  }, [anoSelecionado, empresaSelecionada, projetoSelecionado, agrupamento, empresas])

  const showToast = (message: string, type: ToastType) => {
    const id = toastIdCounter
    setToastIdCounter(id + 1)
    const newToast: Toast = { id, message, type }
    setToasts(prev => [...prev, newToast])
    setTimeout(() => dismissToast(id), 3000)
  }

  const dismissToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const getToastStyles = (type: ToastType) => {
    const styles = {
      success: { borderColor: '#10b981', icon: DollarSign, iconColor: '#10b981' },
      error: { borderColor: '#ef4444', icon: TrendingDown, iconColor: '#ef4444' },
      warning: { borderColor: '#eab308', icon: TrendingUp, iconColor: '#eab308' }
    }
    return styles[type]
  }

  const loadEmpresas = async () => {
    try {
      console.log('Carregando empresas...')
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome')
        .order('nome', { ascending: true })

      if (error) throw error
      console.log('Empresas carregadas:', data?.length)
      setEmpresas(data || [])
    } catch (err) {
      console.error('Erro ao carregar empresas:', err)
      showToast('Erro ao carregar empresas', 'error')
    }
  }

  const loadProjetos = async (empresaId: string) => {
    try {
      console.log('Carregando projetos da empresa:', empresaId)
      const { data, error } = await supabase
        .from('projetos')
        .select('id, empresa_id, nome')
        .eq('empresa_id', empresaId)
        .order('nome', { ascending: true })

      if (error) throw error
      console.log('Projetos carregados:', data?.length)
      setProjetos(data || [])
    } catch (err) {
      console.error('Erro ao carregar projetos:', err)
      showToast('Erro ao carregar projetos', 'error')
    }
  }

  const loadPainelData = async () => {
    try {
      console.log('=== Iniciando carregamento do painel ===')
      console.log('Ano:', anoSelecionado)
      console.log('Empresa:', empresaSelecionada || 'Todas')
      console.log('Projeto:', projetoSelecionado || 'Todos')
      console.log('Agrupamento:', agrupamento)
      
      setLoading(true)
      
      // Carregar todos os dados
      await Promise.all([
        loadKPIs(),
        loadComposicao(),
        loadEvolucao(),
        loadBreakdown(),
        loadMovimentos()
      ])

      console.log('=== Carregamento concluído ===')
    } catch (err) {
      console.error('Erro geral ao carregar dados do painel:', err)
      showToast('Erro ao carregar dados do painel', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadKPIs = async () => {
    try {
      console.log('Carregando KPIs...')
      
      // Buscar lançamentos do ano para calcular receitas e despesas
      let queryLancamentos = supabase
        .from('lancamentos')
        .select('tipo, valor_liquido, valor_bruto, status')
        .eq('status', 'PAGO_RECEBIDO')
        .gte('data_liquidacao', `${anoSelecionado}-01-01`)
        .lte('data_liquidacao', `${anoSelecionado}-12-31`)

      if (empresaSelecionada) {
        queryLancamentos = queryLancamentos.eq('empresa_id', empresaSelecionada)
      }
      if (projetoSelecionado) {
        queryLancamentos = queryLancamentos.eq('projeto_id', projetoSelecionado)
      }

      const { data: lancamentos, error: lancError } = await queryLancamentos
      if (lancError) throw lancError

      console.log('Lançamentos encontrados:', lancamentos?.length)

      // Calcular receitas e despesas
      let receitas = 0
      let despesas = 0

      lancamentos?.forEach((lanc: any) => {
        const valor = lanc.valor_liquido || lanc.valor_bruto || 0
        if (lanc.tipo === 'RECEITA') {
          receitas += valor
        } else if (lanc.tipo === 'DESPESA') {
          despesas += valor
        }
      })

      // Buscar saldo em caixa (último saldo de cada conta)
      let querySaldos = supabase
        .from('saldos_diarios')
        .select('banco_conta_id, saldo_final, data')
        .order('data', { ascending: false })
        .limit(100)

      const { data: saldos, error: saldosError } = await querySaldos
      if (saldosError) {
        console.error('Erro ao buscar saldos:', saldosError)
      }

      // Pegar último saldo por conta
      const saldosPorConta = new Map<string, number>()
      saldos?.forEach((saldo: any) => {
        if (!saldosPorConta.has(saldo.banco_conta_id)) {
          saldosPorConta.set(saldo.banco_conta_id, saldo.saldo_final || 0)
        }
      })

      const caixa = Array.from(saldosPorConta.values()).reduce((sum, val) => sum + val, 0)
      const pl = caixa + receitas - despesas

      console.log('KPIs calculados:', {
        caixa,
        receitas,
        despesas,
        pl
      })

      setCaixaTotal(caixa)
      setReceitasYTD(receitas)
      setDespesasYTD(despesas)
      setPlAproximado(pl)

    } catch (err) {
      console.error('Erro ao carregar KPIs:', err)
      setCaixaTotal(0)
      setReceitasYTD(0)
      setDespesasYTD(0)
      setPlAproximado(0)
    }
  }

  const loadComposicao = async () => {
    try {
      console.log('Carregando composição...')
      
      let query = supabase
        .from('lancamentos')
        .select(`
          id,
          tipo,
          valor_liquido,
          valor_bruto,
          empresa_id,
          projeto_id,
          subcategoria_id,
          empresas:empresa_id(id, nome),
          projetos:projeto_id(id, nome),
          pc_subcategorias:subcategoria_id(id, nome)
        `)
        .eq('status', 'PAGO_RECEBIDO')
        .gte('data_liquidacao', `${anoSelecionado}-01-01`)
        .lte('data_liquidacao', `${anoSelecionado}-12-31`)

      if (empresaSelecionada) {
        query = query.eq('empresa_id', empresaSelecionada)
      }
      if (projetoSelecionado) {
        query = query.eq('projeto_id', projetoSelecionado)
      }

      const { data, error } = await query
      if (error) throw error

      console.log('Lançamentos para composição:', data?.length)

      const grupos: Record<string, { nome: string; receitas: number; despesas: number }> = {}

      data?.forEach((lanc: any) => {
        let chave = ''
        let nome = ''

        if (agrupamento === 'EMPRESA') {
          chave = lanc.empresa_id || 'sem_empresa'
          nome = lanc.empresas?.nome || 'Sem Empresa'
        } else if (agrupamento === 'PROJETO') {
          chave = lanc.projeto_id || 'sem_projeto'
          nome = lanc.projetos?.nome || 'Sem Projeto'
        } else {
          chave = lanc.subcategoria_id || 'sem_subcategoria'
          nome = lanc.pc_subcategorias?.nome || 'Sem Subcategoria'
        }

        if (!grupos[chave]) {
          grupos[chave] = { nome, receitas: 0, despesas: 0 }
        }

        const valor = lanc.valor_liquido || lanc.valor_bruto || 0
        if (lanc.tipo === 'RECEITA') {
          grupos[chave].receitas += valor
        } else {
          grupos[chave].despesas += valor
        }
      })

      const resultado: ComposicaoItem[] = Object.entries(grupos).map(([chave, dados]) => {
        const valor = dados.receitas - dados.despesas
        return { chave, nome: dados.nome, valor, percentual: 0 }
      })

      const total = resultado.reduce((sum, item) => sum + Math.abs(item.valor), 0)
      resultado.forEach(item => {
        item.percentual = total > 0 ? (Math.abs(item.valor) / total) * 100 : 0
      })

      const sorted = resultado.sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))
      const top8 = sorted.slice(0, 8)
      const outros = sorted.slice(8)

      let final = [...top8]
      if (outros.length > 0) {
        const somaOutros = outros.reduce((acc, item) => acc + item.valor, 0)
        const percOutros = total > 0 ? (Math.abs(somaOutros) / total) * 100 : 0
        final.push({ chave: 'outros', nome: 'Outros', valor: somaOutros, percentual: percOutros })
      }

      console.log('Composição calculada:', final.length, 'itens')
      setComposicao(final)

    } catch (err) {
      console.error('Erro ao carregar composição:', err)
      setComposicao([])
    }
  }

  const loadEvolucao = async () => {
    try {
      console.log('Carregando evolução...')
      
      const meses = [
        { num: 1, nome: 'Jan' }, { num: 2, nome: 'Fev' }, { num: 3, nome: 'Mar' },
        { num: 4, nome: 'Abr' }, { num: 5, nome: 'Mai' }, { num: 6, nome: 'Jun' },
        { num: 7, nome: 'Jul' }, { num: 8, nome: 'Ago' }, { num: 9, nome: 'Set' },
        { num: 10, nome: 'Out' }, { num: 11, nome: 'Nov' }, { num: 12, nome: 'Dez' }
      ]

      const resultado: EvolucaoMensal[] = []

      for (const mes of meses) {
        let query = supabase
          .from('lancamentos')
          .select('tipo, valor_liquido, valor_bruto')
          .eq('status', 'PAGO_RECEBIDO')
          .gte('data_liquidacao', `${anoSelecionado}-01-01`)
          .lte('data_liquidacao', `${anoSelecionado}-${String(mes.num).padStart(2, '0')}-31`)

        if (empresaSelecionada) {
          query = query.eq('empresa_id', empresaSelecionada)
        }
        if (projetoSelecionado) {
          query = query.eq('projeto_id', projetoSelecionado)
        }

        const { data, error } = await query
        if (error) throw error

        let receitasAcum = 0
        let despesasAcum = 0

        data?.forEach((lanc: any) => {
          const valor = lanc.valor_liquido || lanc.valor_bruto || 0
          if (lanc.tipo === 'RECEITA') {
            receitasAcum += valor
          } else {
            despesasAcum += valor
          }
        })

        const pl = caixaTotal + receitasAcum - despesasAcum

        resultado.push({ mes: mes.nome, pl })
      }

      console.log('Evolução calculada:', resultado.length, 'meses')
      setEvolucao(resultado)

    } catch (err) {
      console.error('Erro ao carregar evolução:', err)
      setEvolucao([])
    }
  }

  const loadBreakdown = async () => {
    try {
      console.log('Carregando breakdown...')
      
      let query = supabase
        .from('lancamentos')
        .select(`
          id,
          tipo,
          valor_liquido,
          valor_bruto,
          empresa_id,
          projeto_id,
          subcategoria_id,
          empresas:empresa_id(id, nome),
          projetos:projeto_id(id, nome),
          pc_subcategorias:subcategoria_id(id, nome)
        `)
        .eq('status', 'PAGO_RECEBIDO')
        .gte('data_liquidacao', `${anoSelecionado}-01-01`)
        .lte('data_liquidacao', `${anoSelecionado}-12-31`)

      if (empresaSelecionada) {
        query = query.eq('empresa_id', empresaSelecionada)
      }
      if (projetoSelecionado) {
        query = query.eq('projeto_id', projetoSelecionado)
      }

      const { data, error } = await query
      if (error) throw error

      console.log('Lançamentos para breakdown:', data?.length)

      const grupos: Record<string, {
        nome: string
        receitas_ytd: number
        despesas_ytd: number
      }> = {}

      data?.forEach((lanc: any) => {
        let chave = ''
        let nome = ''

        if (agrupamento === 'EMPRESA') {
          chave = lanc.empresa_id || 'sem_empresa'
          nome = lanc.empresas?.nome || 'Sem Empresa'
        } else if (agrupamento === 'PROJETO') {
          chave = lanc.projeto_id || 'sem_projeto'
          nome = lanc.projetos?.nome || 'Sem Projeto'
        } else {
          chave = lanc.subcategoria_id || 'sem_subcategoria'
          nome = lanc.pc_subcategorias?.nome || 'Sem Subcategoria'
        }

        if (!grupos[chave]) {
          grupos[chave] = { nome, receitas_ytd: 0, despesas_ytd: 0 }
        }

        const valor = lanc.valor_liquido || lanc.valor_bruto || 0
        if (lanc.tipo === 'RECEITA') {
          grupos[chave].receitas_ytd += valor
        } else {
          grupos[chave].despesas_ytd += valor
        }
      })

      const resultado: BreakdownItem[] = Object.entries(grupos).map(([chave, dados]) => {
        const resultado_ytd = dados.receitas_ytd - dados.despesas_ytd
        return {
          chave,
          nome: dados.nome,
          receitas_ytd: dados.receitas_ytd,
          despesas_ytd: dados.despesas_ytd,
          resultado_ytd,
          percentual_pl: 0
        }
      })

      const totalPL = plAproximado || 1
      resultado.forEach(item => {
        item.percentual_pl = (item.resultado_ytd / totalPL) * 100
      })

      resultado.sort((a, b) => Math.abs(b.resultado_ytd) - Math.abs(a.resultado_ytd))
      
      console.log('Breakdown calculado:', resultado.length, 'itens')
      setBreakdown(resultado)

    } catch (err) {
      console.error('Erro ao carregar breakdown:', err)
      setBreakdown([])
    }
  }

  const loadMovimentos = async () => {
    try {
      console.log('Carregando movimentos relevantes...')
      
      let query = supabase
        .from('lancamentos')
        .select(`
          data_liquidacao,
          tipo,
          valor_liquido,
          valor_bruto,
          empresas:empresa_id(nome),
          projetos:projeto_id(nome),
          pc_subcategorias:subcategoria_id(nome),
          contrapartes:contraparte_id(nome)
        `)
        .eq('status', 'PAGO_RECEBIDO')
        .gte('data_liquidacao', `${anoSelecionado}-01-01`)
        .lte('data_liquidacao', `${anoSelecionado}-12-31`)
        .order('valor_bruto', { ascending: false })
        .limit(20)

      if (empresaSelecionada) {
        query = query.eq('empresa_id', empresaSelecionada)
      }
      if (projetoSelecionado) {
        query = query.eq('projeto_id', projetoSelecionado)
      }

      const { data, error } = await query
      if (error) throw error

      const movs = (data || []).map((lanc: any) => ({
        data: lanc.data_liquidacao,
        tipo: lanc.tipo,
        empresa: lanc.empresas?.nome || '-',
        projeto: lanc.projetos?.nome || '-',
        subcategoria: lanc.pc_subcategorias?.nome || '-',
        contraparte: lanc.contrapartes?.nome || '-',
        valor: lanc.valor_liquido || lanc.valor_bruto || 0
      }))

      console.log('Movimentos carregados:', movs.length)
      setMovimentos(movs)

    } catch (err) {
      console.error('Erro ao carregar movimentos:', err)
      setMovimentos([])
    }
  }

  const aplicarFiltros = () => {
    const params = new URLSearchParams()
    params.set('ano', anoSelecionado.toString())
    params.set('agrupamento', agrupamento)
    
    if (empresaSelecionada) params.set('empresa', empresaSelecionada)
    if (projetoSelecionado) params.set('projeto', projetoSelecionado)
    
    router.push(`/relatorios/pl?${params.toString()}`)
  }

  const limparFiltros = () => {
    setAnoSelecionado(new Date().getFullYear())
    setEmpresaSelecionada('')
    setProjetoSelecionado('')
    setAgrupamento('EMPRESA')
    
    router.push('/relatorios/pl')
  }

  const exportarCSV = () => {
    try {
      if (breakdown.length === 0) {
        showToast('Não há dados para exportar', 'warning')
        return
      }

      const headers = ['Agrupamento', 'Nome', 'Receitas YTD', 'Despesas YTD', 'Resultado YTD', 'Percentual PL']
      const rows = breakdown.map(item => [
        agrupamento,
        item.nome,
        item.receitas_ytd.toFixed(2),
        item.despesas_ytd.toFixed(2),
        item.resultado_ytd.toFixed(2),
        item.percentual_pl.toFixed(2)
      ])

      const csv = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n')

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `PL_Breakdown_${agrupamento}_${anoSelecionado}.csv`
      link.click()

      showToast('CSV exportado com sucesso!', 'success')
    } catch (err) {
      console.error('Erro ao exportar CSV:', err)
      showToast('Erro ao exportar CSV', 'error')
    }
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '400px'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid #e5e7eb',
          borderTopColor: '#1555D6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#111827',
            marginBottom: '4px'
          }}>
            Painel de PL
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280' }}>
            Patrimônio Líquido Aproximado e Análises Consolidadas
          </p>
        </div>

        <button
          onClick={exportarCSV}
          disabled={breakdown.length === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: breakdown.length === 0 ? '#e5e7eb' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: breakdown.length === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => breakdown.length > 0 && (e.currentTarget.style.backgroundColor = '#059669')}
          onMouseOut={(e) => breakdown.length > 0 && (e.currentTarget.style.backgroundColor = '#10b981')}
        >
          <Download size={18} />
          Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '16px'
        }}>
          <Filter size={20} color="#1555D6" />
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#374151' }}>
            Filtros
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '16px'
        }}>
          {/* Ano */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Ano de Referência
            </label>
            <input
              type="number"
              min="2000"
              max="2100"
              value={anoSelecionado}
              onChange={(e) => setAnoSelecionado(parseInt(e.target.value) || new Date().getFullYear())}
              style={{
                width: '100%',
                padding: '9px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none'
              }}
            />
          </div>

          {/* Empresa */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Empresa
            </label>
            <select
              value={empresaSelecionada}
              onChange={(e) => {
                setEmpresaSelecionada(e.target.value)
                setProjetoSelecionado('')
              }}
              style={{
                width: '100%',
                padding: '9px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todas</option>
              {empresas.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.nome}</option>
              ))}
            </select>
          </div>

          {/* Projeto */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Projeto
            </label>
            <select
              value={projetoSelecionado}
              onChange={(e) => setProjetoSelecionado(e.target.value)}
              disabled={!empresaSelecionada}
              style={{
                width: '100%',
                padding: '9px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: empresaSelecionada ? 'pointer' : 'not-allowed',
                backgroundColor: empresaSelecionada ? 'white' : '#f9fafb'
              }}
            >
              <option value="">Todos</option>
              {projetos.map(proj => (
                <option key={proj.id} value={proj.id}>{proj.nome}</option>
              ))}
            </select>
          </div>

          {/* Agrupamento */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Agrupamento
            </label>
            <select
              value={agrupamento}
              onChange={(e) => setAgrupamento(e.target.value as AgrupamentoType)}
              style={{
                width: '100%',
                padding: '9px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="EMPRESA">Por Empresa</option>
              <option value="PROJETO">Por Projeto</option>
              <option value="SUBCATEGORIA">Por Subcategoria</option>
            </select>
          </div>
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={aplicarFiltros}
            style={{
              padding: '10px 24px',
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
            Aplicar Filtros
          </button>
          
          <button
            onClick={limparFiltros}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 24px',
              backgroundColor: 'white',
              color: '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
          >
            <X size={16} />
            Limpar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '20px',
        marginBottom: '24px'
      }}>
        {/* PL Aproximado */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderTop: '4px solid #1555D6'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>
              PL Aproximado
            </span>
            <Wallet size={24} color="#1555D6" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#1555D6' }}>
            {formatCurrencyBRL(plAproximado)}
          </div>
        </div>

        {/* Caixa */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderTop: '4px solid #6b7280'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>
              Caixa Consolidado
            </span>
            <DollarSign size={24} color="#6b7280" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#374151' }}>
            {formatCurrencyBRL(caixaTotal)}
          </div>
        </div>

        {/* Receitas YTD */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderTop: '4px solid #10b981'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>
              Receitas YTD
            </span>
            <ArrowUpCircle size={24} color="#10b981" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#059669' }}>
            {formatCurrencyBRL(receitasYTD)}
          </div>
        </div>

        {/* Despesas YTD */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderTop: '4px solid #ef4444'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>
              Despesas YTD
            </span>
            <ArrowDownCircle size={24} color="#ef4444" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#dc2626' }}>
            {formatCurrencyBRL(despesasYTD)}
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
        gap: '24px',
        marginBottom: '24px'
      }}>
        {/* Gráfico Donut - Composição */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: '600',
            color: '#374151',
            marginBottom: '4px'
          }}>
            Composição do PL
          </h2>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>
            Distribuição {agrupamento === 'EMPRESA' ? 'por Empresa' : agrupamento === 'PROJETO' ? 'por Projeto' : 'por Subcategoria'}
          </p>

          {composicao.length === 0 ? (
            <div style={{
              padding: '48px',
              textAlign: 'center',
              color: '#9ca3af',
              fontSize: '14px'
            }}>
              Sem dados para exibir no ano {anoSelecionado}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={composicao}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={140}
                  paddingAngle={2}
                  dataKey="valor"
                  label={({ nome, percentual }) => `${nome}: ${percentual.toFixed(1)}%`}
                >
                  {composicao.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatCurrencyBRL(value)}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '13px'
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  wrapperStyle={{ fontSize: '12px' }}
                  formatter={(value, entry: any) => `${entry.payload.nome} (${entry.payload.percentual.toFixed(1)}%)`}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Gráfico Linha - Evolução */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: '600',
            color: '#374151',
            marginBottom: '4px'
          }}>
            Evolução do PL
          </h2>
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>
            Patrimônio Líquido mensal acumulado
          </p>

          {evolucao.length === 0 ? (
            <div style={{
              padding: '48px',
              textAlign: 'center',
              color: '#9ca3af',
              fontSize: '14px'
            }}>
              Sem dados para exibir no ano {anoSelecionado}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={evolucao}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="mes" 
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                />
                <YAxis 
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                  tickFormatter={(value) => {
                    if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`
                    if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}K`
                    return formatCurrencyBRL(value)
                  }}
                />
                <Tooltip 
                  formatter={(value: number) => [formatCurrencyBRL(value), 'PL']}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '13px'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '16px' }} />
                <Line 
                  type="monotone" 
                  dataKey="pl" 
                  stroke="#1555D6" 
                  strokeWidth={3}
                  dot={{ fill: '#1555D6', r: 4 }}
                  activeDot={{ r: 6 }}
                  name="PL"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Tabela - Breakdown Consolidado */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <h2 style={{
          fontSize: '18px',
          fontWeight: '600',
          color: '#374151',
          marginBottom: '16px'
        }}>
          Breakdown Consolidado
        </h2>

        {breakdown.length === 0 ? (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '14px'
          }}>
            Sem dados para o período selecionado
          </div>
        ) : (
          <div style={{
            overflowX: 'auto',
            border: '1px solid #e5e7eb',
            borderRadius: '8px'
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px'
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    {agrupamento === 'EMPRESA' ? 'Empresa' : agrupamento === 'PROJETO' ? 'Projeto' : 'Subcategoria'}
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    Receitas YTD
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    Despesas YTD
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    Resultado YTD
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    % do PL
                  </th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((item, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>
                      {item.nome}
                    </td>
                    <td style={{ 
                      padding: '12px 16px', 
                      textAlign: 'right', 
                      fontWeight: '600',
                      color: '#059669'
                    }}>
                      {formatCurrencyBRL(item.receitas_ytd)}
                    </td>
                    <td style={{ 
                      padding: '12px 16px', 
                      textAlign: 'right', 
                      fontWeight: '600',
                      color: '#dc2626'
                    }}>
                      {formatCurrencyBRL(item.despesas_ytd)}
                    </td>
                    <td style={{ 
                      padding: '12px 16px', 
                      textAlign: 'right', 
                      fontWeight: '600',
                      color: item.resultado_ytd >= 0 ? '#059669' : '#dc2626'
                    }}>
                      {formatCurrencyBRL(item.resultado_ytd)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#374151' }}>
                      {formatPercentBR(item.percentual_pl)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                  <td style={{ padding: '12px 16px', fontWeight: '700', color: '#374151' }}>
                    TOTAL
                  </td>
                  <td style={{ 
                    padding: '12px 16px', 
                    textAlign: 'right', 
                    fontWeight: '700',
                    color: '#059669'
                  }}>
                    {formatCurrencyBRL(breakdown.reduce((sum, item) => sum + item.receitas_ytd, 0))}
                  </td>
                  <td style={{ 
                    padding: '12px 16px', 
                    textAlign: 'right', 
                    fontWeight: '700',
                    color: '#dc2626'
                  }}>
                    {formatCurrencyBRL(breakdown.reduce((sum, item) => sum + item.despesas_ytd, 0))}
                  </td>
                  <td style={{ 
                    padding: '12px 16px', 
                    textAlign: 'right', 
                    fontWeight: '700',
                    color: breakdown.reduce((sum, item) => sum + item.resultado_ytd, 0) >= 0 ? '#059669' : '#dc2626'
                  }}>
                    {formatCurrencyBRL(breakdown.reduce((sum, item) => sum + item.resultado_ytd, 0))}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: '#374151' }}>
                    {formatPercentBR(100)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Tabela - Top 20 Movimentos */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <h2 style={{
          fontSize: '18px',
          fontWeight: '600',
          color: '#374151',
          marginBottom: '16px'
        }}>
          Top 20 Maiores Movimentos
        </h2>

        {movimentos.length === 0 ? (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '14px'
          }}>
            Sem movimentos para o período selecionado
          </div>
        ) : (
          <div style={{
            overflowX: 'auto',
            border: '1px solid #e5e7eb',
            borderRadius: '8px'
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px'
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    Data
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    Tipo
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    Empresa
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    Projeto
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    Subcategoria
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    Contraparte
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody>
                {movimentos.map((mov, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>
                      {formatDateBR(mov.data)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '500',
                        backgroundColor: mov.tipo === 'RECEITA' ? '#d1fae5' : '#fee2e2',
                        color: mov.tipo === 'RECEITA' ? '#065f46' : '#991b1b'
                      }}>
                        {mov.tipo === 'RECEITA' ? 'Receita' : 'Despesa'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>
                      {mov.empresa}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>
                      {mov.projeto}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>
                      {mov.subcategoria}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>
                      {mov.contraparte}
                    </td>
                    <td style={{ 
                      padding: '12px 16px', 
                      textAlign: 'right', 
                      fontWeight: '600',
                      color: mov.tipo === 'RECEITA' ? '#059669' : '#dc2626'
                    }}>
                      {formatCurrencyBRL(mov.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                minWidth: '400px',
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