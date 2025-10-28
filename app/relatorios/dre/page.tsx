'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSearchParams, useRouter } from 'next/navigation'
import { Filter, Download, ChevronRight, ChevronDown, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

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

interface DRERow {
  tipo: string
  grupo: string
  categoria: string
  subcategoria: string
  valor_ytd: number
  percentual_tipo: number
  yoy_percent: number | null
}

interface DRENode {
  nome: string
  valor: number
  percentual: number
  yoy: number | null
  children?: DRENode[]
  level: 'tipo' | 'grupo' | 'categoria' | 'subcategoria'
  expanded?: boolean
}

interface MensalData {
  mes: number
  receitas: number
  despesas: number
}

// Função para formatar moeda BRL
const formatCurrencyBRL = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

// Função para formatar percentual
const formatPercent = (value: number | null): string => {
  if (value === null) return '-'
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 100)
}

// Função para formatar data para exibição (DD/MM/YYYY)
const formatDateBR = (dateString: string): string => {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('pt-BR')
}

// Função para obter anos disponíveis
const getAvailableYears = (): number[] => {
  const currentYear = new Date().getFullYear()
  const years = []
  for (let i = 0; i < 5; i++) {
    years.push(currentYear - i)
  }
  return years
}

// Meses em português
const MESES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
]

export default function DREPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Estados
  const [loading, setLoading] = useState(true)
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [dreData, setDreData] = useState<DRERow[]>([])
  const [dreTree, setDreTree] = useState<DRENode[]>([])
  const [mensalData, setMensalData] = useState<MensalData[]>([])
  
  // Filtros
  const [tipoPeriodo, setTipoPeriodo] = useState<'ano' | 'intervalo'>('ano')
  const [anoSelecionado, setAnoSelecionado] = useState<number>(new Date().getFullYear())
  const [dataInicial, setDataInicial] = useState<string>('')
  const [dataFinal, setDataFinal] = useState<string>('')
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string>('')
  const [projetoSelecionado, setProjetoSelecionado] = useState<string>('')
  
  // KPIs
  const [receitasYTD, setReceitasYTD] = useState<number>(0)
  const [despesasYTD, setDespesasYTD] = useState<number>(0)
  const [resultadoYTD, setResultadoYTD] = useState<number>(0)
  
  // Toast
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)

  // Carregar filtros da URL
  useEffect(() => {
    const tipoPeriodoParam = searchParams.get('tipoPeriodo')
    const ano = searchParams.get('ano')
    const dataInicialParam = searchParams.get('dataInicial')
    const dataFinalParam = searchParams.get('dataFinal')
    const empresa = searchParams.get('empresa')
    const projeto = searchParams.get('projeto')
    
    if (tipoPeriodoParam) setTipoPeriodo(tipoPeriodoParam as 'ano' | 'intervalo')
    if (ano) setAnoSelecionado(parseInt(ano))
    if (dataInicialParam) setDataInicial(dataInicialParam)
    if (dataFinalParam) setDataFinal(dataFinalParam)
    if (empresa) setEmpresaSelecionada(empresa)
    if (projeto) setProjetoSelecionado(projeto)
  }, [])

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
    loadDREData()
  }, [tipoPeriodo, anoSelecionado, dataInicial, dataFinal, empresaSelecionada, projetoSelecionado])

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
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome')
        .order('nome', { ascending: true })

      if (error) throw error
      setEmpresas(data || [])
    } catch (err) {
      console.error('Erro ao carregar empresas:', err)
      showToast('Erro ao carregar empresas', 'error')
    }
  }

  const loadProjetos = async (empresaId: string) => {
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, empresa_id, nome')
        .eq('empresa_id', empresaId)
        .order('nome', { ascending: true })

      if (error) throw error
      setProjetos(data || [])
    } catch (err) {
      console.error('Erro ao carregar projetos:', err)
      showToast('Erro ao carregar projetos', 'error')
    }
  }

  const loadDREData = async () => {
    try {
      setLoading(true)
      
      // Query base para YTD do ano selecionado
      let query = supabase
        .from('lancamentos')
        .select(`
          id,
          tipo,
          valor_bruto,
          valor_liquido,
          status,
          data_liquidacao,
          data_vencimento,
          empresa_id,
          projeto_id,
          subcategoria_id
        `)
        .eq('status', 'PAGO_RECEBIDO')

      // Filtrar por ano usando data_liquidacao ou data_vencimento
      const startDate = `${anoSelecionado}-01-01`
      const endDate = `${anoSelecionado}-12-31`
      
      if (empresaSelecionada) {
        query = query.eq('empresa_id', empresaSelecionada)
      }
      
      if (projetoSelecionado) {
        query = query.eq('projeto_id', projetoSelecionado)
      }

      const { data: lancamentos, error: lancError } = await query

      if (lancError) throw lancError

      // Buscar hierarquia do plano de contas
      const { data: subcategorias, error: subError } = await supabase
        .from('pc_subcategorias')
        .select('id, nome, categoria_id')

      if (subError) throw subError

      const { data: categorias, error: catError } = await supabase
        .from('pc_categorias')
        .select('id, nome, grupo_id')

      if (catError) throw catError

      const { data: grupos, error: grupoError } = await supabase
        .from('pc_grupos')
        .select('id, nome, tipo_id')

      if (grupoError) throw grupoError

      const { data: tipos, error: tipoError } = await supabase
        .from('pc_tipos')
        .select('id, nome')

      if (tipoError) throw tipoError

      // Filtrar lançamentos pelo período
      const lancamentosPeriodo = (lancamentos || []).filter(l => {
        const dataRef = l.data_liquidacao || l.data_vencimento
        if (!dataRef) return false
        
        const data = new Date(dataRef)
        
        if (tipoPeriodo === 'ano') {
          const year = data.getFullYear()
          return year === anoSelecionado
        } else {
          // Intervalo de datas
          if (!dataInicial || !dataFinal) return false
          
          const inicio = new Date(dataInicial)
          const fim = new Date(dataFinal)
          
          // Ajustar fim para incluir o dia completo
          fim.setHours(23, 59, 59, 999)
          
          return data >= inicio && data <= fim
        }
      })

      // Construir DRE agrupado
      const dreMap = new Map<string, DRERow>()

      lancamentosPeriodo.forEach(lanc => {
        const sub = subcategorias?.find(s => s.id === lanc.subcategoria_id)
        if (!sub) return

        const cat = categorias?.find(c => c.id === sub.categoria_id)
        if (!cat) return

        const grupo = grupos?.find(g => g.id === cat.grupo_id)
        if (!grupo) return

        const tipo = tipos?.find(t => t.id === grupo.tipo_id)
        if (!tipo) return

        const key = `${tipo.nome}|${grupo.nome}|${cat.nome}|${sub.nome}`
        const valor = lanc.valor_liquido || lanc.valor_bruto

        if (dreMap.has(key)) {
          const existing = dreMap.get(key)!
          existing.valor_ytd += valor
        } else {
          dreMap.set(key, {
            tipo: tipo.nome,
            grupo: grupo.nome,
            categoria: cat.nome,
            subcategoria: sub.nome,
            valor_ytd: valor,
            percentual_tipo: 0,
            yoy_percent: null
          })
        }
      })

      const dreArray = Array.from(dreMap.values())

      // Calcular percentuais por tipo
      const totalPorTipo = new Map<string, number>()
      dreArray.forEach(row => {
        const current = totalPorTipo.get(row.tipo) || 0
        totalPorTipo.set(row.tipo, current + row.valor_ytd)
      })

      dreArray.forEach(row => {
        const total = totalPorTipo.get(row.tipo) || 1
        row.percentual_tipo = (row.valor_ytd / total) * 100
      })

      // Calcular YoY (comparar com ano anterior)
      const anoAnterior = anoSelecionado - 1
      const { data: lancamentosAnoAnterior } = await supabase
        .from('lancamentos')
        .select('id, tipo, valor_bruto, valor_liquido, status, data_liquidacao, data_vencimento, subcategoria_id')
        .eq('status', 'PAGO_RECEBIDO')

      const lancamentosAnoAnt = (lancamentosAnoAnterior || []).filter(l => {
        const dataRef = l.data_liquidacao || l.data_vencimento
        if (!dataRef) return false
        const year = new Date(dataRef).getFullYear()
        return year === anoAnterior
      })

      const dreMapAnoAnt = new Map<string, number>()
      lancamentosAnoAnt.forEach(lanc => {
        const sub = subcategorias?.find(s => s.id === lanc.subcategoria_id)
        if (!sub) return

        const cat = categorias?.find(c => c.id === sub.categoria_id)
        if (!cat) return

        const grupo = grupos?.find(g => g.id === cat.grupo_id)
        if (!grupo) return

        const tipo = tipos?.find(t => t.id === grupo.tipo_id)
        if (!tipo) return

        const key = `${tipo.nome}|${grupo.nome}|${cat.nome}|${sub.nome}`
        const valor = lanc.valor_liquido || lanc.valor_bruto

        const current = dreMapAnoAnt.get(key) || 0
        dreMapAnoAnt.set(key, current + valor)
      })

      dreArray.forEach(row => {
        const key = `${row.tipo}|${row.grupo}|${row.categoria}|${row.subcategoria}`
        const valorAnoAnt = dreMapAnoAnt.get(key) || 0
        
        if (valorAnoAnt !== 0) {
          row.yoy_percent = ((row.valor_ytd - valorAnoAnt) / Math.abs(valorAnoAnt)) * 100
        }
      })

      setDreData(dreArray)

      // Construir árvore hierárquica
      const tree = buildDRETree(dreArray)
      setDreTree(tree)

      // Calcular KPIs
      const receitas = dreArray
        .filter(r => r.tipo.toLowerCase().includes('receita'))
        .reduce((sum, r) => sum + r.valor_ytd, 0)
      
      const despesas = dreArray
        .filter(r => r.tipo.toLowerCase().includes('despesa'))
        .reduce((sum, r) => sum + r.valor_ytd, 0)

      setReceitasYTD(receitas)
      setDespesasYTD(despesas)
      setResultadoYTD(receitas - despesas)

      // Carregar dados mensais para gráfico
      await loadMensalData(lancamentosPeriodo, subcategorias, categorias, grupos, tipos)

    } catch (err) {
      console.error('Erro ao carregar DRE:', err)
      showToast('Erro ao carregar dados da DRE', 'error')
    } finally {
      setLoading(false)
    }
  }

  const buildDRETree = (data: DRERow[]): DRENode[] => {
    const tipoMap = new Map<string, DRENode>()

    data.forEach(row => {
      // Criar/atualizar nó do Tipo
      if (!tipoMap.has(row.tipo)) {
        tipoMap.set(row.tipo, {
          nome: row.tipo,
          valor: 0,
          percentual: 0,
          yoy: null,
          children: [],
          level: 'tipo',
          expanded: false
        })
      }
      const tipoNode = tipoMap.get(row.tipo)!
      tipoNode.valor += row.valor_ytd

      // Criar/atualizar nó do Grupo
      let grupoNode = tipoNode.children!.find(g => g.nome === row.grupo)
      if (!grupoNode) {
        grupoNode = {
          nome: row.grupo,
          valor: 0,
          percentual: 0,
          yoy: null,
          children: [],
          level: 'grupo',
          expanded: false
        }
        tipoNode.children!.push(grupoNode)
      }
      grupoNode.valor += row.valor_ytd

      // Criar/atualizar nó da Categoria
      let catNode = grupoNode.children!.find(c => c.nome === row.categoria)
      if (!catNode) {
        catNode = {
          nome: row.categoria,
          valor: 0,
          percentual: 0,
          yoy: null,
          children: [],
          level: 'categoria',
          expanded: false
        }
        grupoNode.children!.push(catNode)
      }
      catNode.valor += row.valor_ytd

      // Criar nó da Subcategoria
      const subNode: DRENode = {
        nome: row.subcategoria,
        valor: row.valor_ytd,
        percentual: row.percentual_tipo,
        yoy: row.yoy_percent,
        level: 'subcategoria'
      }
      catNode.children!.push(subNode)
    })

    // Calcular percentuais e YoY agregados
    const tree = Array.from(tipoMap.values())
    tree.forEach(tipoNode => {
      tipoNode.children!.forEach(grupoNode => {
        grupoNode.percentual = (grupoNode.valor / tipoNode.valor) * 100
        
        grupoNode.children!.forEach(catNode => {
          catNode.percentual = (catNode.valor / tipoNode.valor) * 100
        })
      })
    })

    // Ordenar: Receitas desc, Despesas desc
    tree.sort((a, b) => {
      if (a.nome.toLowerCase().includes('receita')) return -1
      if (b.nome.toLowerCase().includes('receita')) return 1
      return b.valor - a.valor
    })

    tree.forEach(t => {
      t.children!.sort((a, b) => b.valor - a.valor)
      t.children!.forEach(g => {
        g.children!.sort((a, b) => b.valor - a.valor)
        g.children!.forEach(c => {
          c.children!.sort((a, b) => b.valor - a.valor)
        })
      })
    })

    return tree
  }

  const loadMensalData = async (
    lancamentos: any[],
    subcategorias: any[],
    categorias: any[],
    grupos: any[],
    tipos: any[]
  ) => {
    const mensalMap = new Map<number, { receitas: number; despesas: number }>()

    // Inicializar todos os meses
    for (let i = 1; i <= 12; i++) {
      mensalMap.set(i, { receitas: 0, despesas: 0 })
    }

    lancamentos.forEach(lanc => {
      const dataRef = lanc.data_liquidacao || lanc.data_vencimento
      if (!dataRef) return

      const mes = new Date(dataRef).getMonth() + 1
      const valor = lanc.valor_liquido || lanc.valor_bruto

      const sub = subcategorias?.find(s => s.id === lanc.subcategoria_id)
      if (!sub) return

      const cat = categorias?.find(c => c.id === sub.categoria_id)
      if (!cat) return

      const grupo = grupos?.find(g => g.id === cat.grupo_id)
      if (!grupo) return

      const tipo = tipos?.find(t => t.id === grupo.tipo_id)
      if (!tipo) return

      const mesData = mensalMap.get(mes)!
      
      if (tipo.nome.toLowerCase().includes('receita')) {
        mesData.receitas += valor
      } else {
        mesData.despesas += valor
      }
    })

    const mensalArray: MensalData[] = []
    for (let i = 1; i <= 12; i++) {
      const data = mensalMap.get(i)!
      mensalArray.push({
        mes: i,
        receitas: data.receitas,
        despesas: data.despesas
      })
    }

    setMensalData(mensalArray)
  }

  const aplicarFiltros = () => {
    // Validar datas se for intervalo
    if (tipoPeriodo === 'intervalo' && (!dataInicial || !dataFinal)) {
      showToast('Informe a data inicial e final', 'warning')
      return
    }

    // Validar data final >= data inicial
    if (tipoPeriodo === 'intervalo' && new Date(dataFinal) < new Date(dataInicial)) {
      showToast('Data final deve ser maior ou igual à data inicial', 'warning')
      return
    }
    
    const params = new URLSearchParams()
    params.set('tipoPeriodo', tipoPeriodo)
    
    if (tipoPeriodo === 'ano') {
      params.set('ano', anoSelecionado.toString())
    } else {
      if (dataInicial) params.set('dataInicial', dataInicial)
      if (dataFinal) params.set('dataFinal', dataFinal)
    }
    
    if (empresaSelecionada) params.set('empresa', empresaSelecionada)
    if (projetoSelecionado) params.set('projeto', projetoSelecionado)
    
    router.push(`/relatorios/dre?${params.toString()}`)
    loadDREData()
  }

  const limparFiltros = () => {
    setTipoPeriodo('ano')
    setAnoSelecionado(new Date().getFullYear())
    setDataInicial('')
    setDataFinal('')
    setEmpresaSelecionada('')
    setProjetoSelecionado('')
    router.push('/relatorios/dre')
    loadDREData()
  }

  const toggleNode = (path: number[]) => {
    const newTree = [...dreTree]
    let current: DRENode[] = newTree
    
    path.forEach((index, level) => {
      if (level === path.length - 1) {
        current[index].expanded = !current[index].expanded
      } else {
        current = current[index].children!
      }
    })
    
    setDreTree(newTree)
  }

  const exportarCSV = () => {
    try {
      const headers = ['Tipo', 'Grupo', 'Categoria', 'Subcategoria', 'Valor YTD', '% do Tipo', 'YoY %']
      const rows = dreData.map(row => [
        row.tipo,
        row.grupo,
        row.categoria,
        row.subcategoria,
        row.valor_ytd.toFixed(2),
        row.percentual_tipo.toFixed(2),
        row.yoy_percent !== null ? row.yoy_percent.toFixed(2) : ''
      ])

      const csv = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n')

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `DRE_${anoSelecionado}.csv`
      link.click()

      showToast('CSV exportado com sucesso!', 'success')
    } catch (err) {
      console.error('Erro ao exportar CSV:', err)
      showToast('Erro ao exportar CSV', 'error')
    }
  }

  const renderTreeNode = (node: DRENode, path: number[], depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0
    const indent = depth * 24

    return (
      <div key={path.join('-')}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            paddingLeft: `${indent + 16}px`,
            borderBottom: '1px solid #f3f4f6',
            cursor: hasChildren ? 'pointer' : 'default',
            backgroundColor: depth === 0 ? '#f9fafb' : 'white',
            transition: 'background-color 0.2s'
          }}
          onClick={() => hasChildren && toggleNode(path)}
          onMouseOver={(e) => hasChildren && (e.currentTarget.style.backgroundColor = '#f3f4f6')}
          onMouseOut={(e) => hasChildren && (e.currentTarget.style.backgroundColor = depth === 0 ? '#f9fafb' : 'white')}
        >
          <div style={{ width: '24px', marginRight: '8px' }}>
            {hasChildren && (
              node.expanded ? 
                <ChevronDown size={18} color="#6b7280" /> : 
                <ChevronRight size={18} color="#6b7280" />
            )}
          </div>
          
          <div style={{ flex: 1, fontWeight: depth === 0 ? '600' : '500', fontSize: '14px', color: '#374151' }}>
            {node.nome}
          </div>
          
          <div style={{ width: '150px', textAlign: 'right', fontWeight: '600', fontSize: '14px', color: node.valor >= 0 ? '#059669' : '#ef4444' }}>
            {formatCurrencyBRL(node.valor)}
          </div>
          
          <div style={{ width: '100px', textAlign: 'right', fontSize: '13px', color: '#6b7280' }}>
            {formatPercent(node.percentual)}
          </div>
          
          <div style={{ 
            width: '100px', 
            textAlign: 'right', 
            fontSize: '13px', 
            color: node.yoy !== null && node.yoy > 0 ? '#059669' : node.yoy !== null && node.yoy < 0 ? '#ef4444' : '#6b7280',
            fontWeight: node.yoy !== null ? '500' : '400'
          }}>
            {node.yoy !== null ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                {node.yoy > 0 ? <TrendingUp size={14} /> : node.yoy < 0 ? <TrendingDown size={14} /> : null}
                {formatPercent(node.yoy)}
              </span>
            ) : (
              '-'
            )}
          </div>
        </div>

        {hasChildren && node.expanded && node.children!.map((child, index) => 
          renderTreeNode(child, [...path, index], depth + 1)
        )}
      </div>
    )
  }

  // Determinar label do período
  const periodoLabel = tipoPeriodo === 'ano' 
    ? `YTD ${anoSelecionado}`
    : dataInicial && dataFinal
      ? `Período ${formatDateBR(dataInicial)} - ${formatDateBR(dataFinal)}`
      : 'Período'

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
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: '700',
          color: '#111827'
        }}>
          DRE - Demonstração do Resultado do Exercício
        </h1>

        <button
          onClick={exportarCSV}
          disabled={dreData.length === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: dreData.length === 0 ? '#e5e7eb' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: dreData.length === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => dreData.length > 0 && (e.currentTarget.style.backgroundColor = '#059669')}
          onMouseOut={(e) => dreData.length > 0 && (e.currentTarget.style.backgroundColor = '#10b981')}
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

        {/* Tipo de Período */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '10px'
          }}>
            Período
          </label>
          <div style={{ display: 'flex', gap: '24px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#374151'
            }}>
              <input
                type="radio"
                name="tipoPeriodo"
                value="ano"
                checked={tipoPeriodo === 'ano'}
                onChange={(e) => setTipoPeriodo(e.target.value as 'ano' | 'intervalo')}
                style={{ cursor: 'pointer' }}
              />
              Ano
            </label>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#374151'
            }}>
              <input
                type="radio"
                name="tipoPeriodo"
                value="intervalo"
                checked={tipoPeriodo === 'intervalo'}
                onChange={(e) => setTipoPeriodo(e.target.value as 'ano' | 'intervalo')}
                style={{ cursor: 'pointer' }}
              />
              Intervalo de Datas
            </label>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '16px'
        }}>
          {/* Ano (condicional) */}
          {tipoPeriodo === 'ano' && (
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '6px'
              }}>
                Ano
              </label>
              <select
                value={anoSelecionado}
                onChange={(e) => setAnoSelecionado(parseInt(e.target.value))}
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
                {getAvailableYears().map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          )}

          {/* Data Inicial (condicional) */}
          {tipoPeriodo === 'intervalo' && (
            <>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Data Inicial *
                </label>
                <input
                  type="date"
                  value={dataInicial}
                  onChange={(e) => setDataInicial(e.target.value)}
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

              {/* Data Final (condicional) */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Data Final *
                </label>
                <input
                  type="date"
                  value={dataFinal}
                  onChange={(e) => setDataFinal(e.target.value)}
                  min={dataInicial}
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
            </>
          )}

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
            Aplicar
          </button>
          
          <button
            onClick={limparFiltros}
            style={{
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
        {/* Receitas */}
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
              Receitas {periodoLabel}
            </span>
            <TrendingUp size={24} color="#10b981" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#059669' }}>
            {formatCurrencyBRL(receitasYTD)}
          </div>
        </div>

        {/* Despesas */}
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
              Despesas {periodoLabel}
            </span>
            <TrendingDown size={24} color="#ef4444" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#dc2626' }}>
            {formatCurrencyBRL(despesasYTD)}
          </div>
        </div>

        {/* Resultado */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderTop: `4px solid ${resultadoYTD >= 0 ? '#1555D6' : '#ef4444'}`
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>
              Resultado {periodoLabel}
            </span>
            <DollarSign size={24} color={resultadoYTD >= 0 ? '#1555D6' : '#ef4444'} />
          </div>
          <div style={{ 
            fontSize: '32px', 
            fontWeight: '700', 
            color: resultadoYTD >= 0 ? '#1555D6' : '#dc2626'
          }}>
            {formatCurrencyBRL(resultadoYTD)}
          </div>
        </div>
      </div>

      {/* Tabela DRE Hierárquica */}
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
          Análise Hierárquica
        </h2>

        {dreTree.length === 0 ? (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '14px'
          }}>
            Sem dados para os filtros selecionados
          </div>
        ) : (
          <div style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              backgroundColor: '#f9fafb',
              borderBottom: '1px solid #e5e7eb',
              fontWeight: '600',
              fontSize: '13px',
              color: '#6b7280'
            }}>
              <div style={{ width: '24px', marginRight: '8px' }} />
              <div style={{ flex: 1 }}>Nome</div>
              <div style={{ width: '150px', textAlign: 'right' }}>Valor YTD</div>
              <div style={{ width: '100px', textAlign: 'right' }}>% do Tipo</div>
              <div style={{ width: '100px', textAlign: 'right' }}>YoY</div>
            </div>

            {/* Body */}
            {dreTree.map((node, index) => renderTreeNode(node, [index]))}
          </div>
        )}
      </div>

      {/* Gráfico Mensal */}
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
          marginBottom: '24px'
        }}>
          {tipoPeriodo === 'ano' ? `Evolução Mensal ${anoSelecionado}` : `Evolução - ${periodoLabel}`}
        </h2>

        {mensalData.every(m => m.receitas === 0 && m.despesas === 0) ? (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '14px'
          }}>
            Sem dados mensais para exibir
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={mensalData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="mes" 
                tickFormatter={(mes) => MESES[mes - 1]}
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => formatCurrencyBRL(value)}
              />
              <Tooltip 
                formatter={(value: number) => formatCurrencyBRL(value)}
                labelFormatter={(mes: number) => MESES[mes - 1]}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px'
                }}
              />
              <Legend 
                wrapperStyle={{ fontSize: '13px', paddingTop: '16px' }}
                formatter={(value) => value === 'receitas' ? 'Receitas' : 'Despesas'}
              />
              <Bar 
                dataKey="receitas" 
                fill="#10b981" 
                radius={[8, 8, 0, 0]}
                name="receitas"
              />
              <Bar 
                dataKey="despesas" 
                fill="#ef4444" 
                radius={[8, 8, 0, 0]}
                name="despesas"
              />
            </BarChart>
          </ResponsiveContainer>
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