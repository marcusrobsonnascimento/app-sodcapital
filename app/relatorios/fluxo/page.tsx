'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSearchParams, useRouter } from 'next/navigation'
import { 
  Filter, Download, Calendar, TrendingUp, TrendingDown, 
  DollarSign, ArrowUpCircle, ArrowDownCircle, Wallet 
} from 'lucide-react'
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, ResponsiveContainer 
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

interface BancoConta {
  id: string
  empresa_id: string
  banco_nome: string
  numero_conta: string
}

interface Contraparte {
  id: string
  nome: string
}

interface Subcategoria {
  id: string
  nome: string
}

interface AgendaItem {
  data: string
  tipo: 'RECEITA' | 'DESPESA'
  empresa: string
  projeto: string
  subcategoria: string
  contraparte: string
  valor: number
  status: string
}

interface SaldoDiario {
  data: string
  saldo: number
  entradas: number
  saidas: number
}

interface BreakdownItem {
  nome: string
  valor: number
  percentual: number
}

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

// Função para obter data no formato YYYY-MM-DD
const getDateString = (date: Date): string => {
  return date.toISOString().split('T')[0]
}

// Função para adicionar dias a uma data
const addDays = (date: Date, days: number): Date => {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

// Presets de período
const PRESETS_PERIODO = [
  { label: 'Próx. 7 dias', dias: 7 },
  { label: 'Próx. 30 dias', dias: 30 },
  { label: 'Próx. 60 dias', dias: 60 },
  { label: 'Próx. 90 dias', dias: 90 },
  { label: 'Próx. 180 dias', dias: 180 },
  { label: 'Personalizado', dias: 0 }
]

export default function FluxoCaixaPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Estados
  const [loading, setLoading] = useState(true)
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [bancosContas, setBancosContas] = useState<BancoConta[]>([])
  const [agenda, setAgenda] = useState<AgendaItem[]>([])
  const [saldosDiarios, setSaldosDiarios] = useState<SaldoDiario[]>([])
  const [breakdownSubcategorias, setBreakdownSubcategorias] = useState<BreakdownItem[]>([])
  const [breakdownContrapartes, setBreakdownContrapartes] = useState<BreakdownItem[]>([])
  
  // Filtros
  const [presetSelecionado, setPresetSelecionado] = useState<number>(30)
  const [dataInicial, setDataInicial] = useState<string>('')
  const [dataFinal, setDataFinal] = useState<string>('')
  const [natureza, setNatureza] = useState<'AMBOS' | 'RECEITA' | 'DESPESA'>('AMBOS')
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string>('')
  const [projetoSelecionado, setProjetoSelecionado] = useState<string>('')
  const [bancoContaSelecionada, setBancoContaSelecionada] = useState<string>('')
  const [somenteAbertos, setSomenteAbertos] = useState<boolean>(true)
  
  // KPIs
  const [saldoInicial, setSaldoInicial] = useState<number>(0)
  const [entradasPeriodo, setEntradasPeriodo] = useState<number>(0)
  const [saidasPeriodo, setSaidasPeriodo] = useState<number>(0)
  const [saldoProjetado, setSaldoProjetado] = useState<number>(0)
  
  // Horizontes
  const [horizontes, setHorizontes] = useState<{[key: number]: { entradas: number, saidas: number, liquido: number }}>({})
  
  // Toast
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)

  // Inicializar datas ao carregar
  useEffect(() => {
    const hoje = new Date()
    const fim = addDays(hoje, 30)
    
    setDataInicial(getDateString(hoje))
    setDataFinal(getDateString(fim))
  }, [])

  // Carregar filtros da URL
  useEffect(() => {
    const preset = searchParams.get('preset')
    const inicio = searchParams.get('dataInicial')
    const fim = searchParams.get('dataFinal')
    const nat = searchParams.get('natureza')
    const empresa = searchParams.get('empresa')
    const projeto = searchParams.get('projeto')
    const banco = searchParams.get('bancoConta')
    const abertos = searchParams.get('somenteAbertos')
    
    if (preset) setPresetSelecionado(parseInt(preset))
    if (inicio) setDataInicial(inicio)
    if (fim) setDataFinal(fim)
    if (nat) setNatureza(nat as 'AMBOS' | 'RECEITA' | 'DESPESA')
    if (empresa) setEmpresaSelecionada(empresa)
    if (projeto) setProjetoSelecionado(projeto)
    if (banco) setBancoContaSelecionada(banco)
    if (abertos !== null) setSomenteAbertos(abertos === 'true')
  }, [])

  useEffect(() => {
    loadEmpresas()
  }, [])

  useEffect(() => {
    if (empresaSelecionada) {
      loadProjetos(empresaSelecionada)
      loadBancosContas(empresaSelecionada)
    } else {
      setProjetos([])
      setBancosContas([])
      setProjetoSelecionado('')
      setBancoContaSelecionada('')
    }
  }, [empresaSelecionada])

  useEffect(() => {
    if (dataInicial && dataFinal) {
      loadFluxoData()
    }
  }, [dataInicial, dataFinal, natureza, empresaSelecionada, projetoSelecionado, bancoContaSelecionada, somenteAbertos])

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

  const loadBancosContas = async (empresaId: string) => {
    try {
      const { data, error } = await supabase
        .from('bancos_contas')
        .select('id, empresa_id, banco_nome, numero_conta')
        .eq('empresa_id', empresaId)
        .order('banco_nome', { ascending: true })

      if (error) throw error
      setBancosContas(data || [])
    } catch (err) {
      console.error('Erro ao carregar contas bancárias:', err)
      showToast('Erro ao carregar contas bancárias', 'error')
    }
  }

  const loadFluxoData = async () => {
    try {
      setLoading(true)
      
      // 1. Carregar saldo inicial
      await loadSaldoInicial()
      
      // 2. Carregar lançamentos do período e retornar dados
      const agendaData = await loadAgenda()
      
      // 3. Calcular horizontes COM OS DADOS RETORNADOS
      calcularHorizontes(agendaData)

    } catch (err) {
      console.error('Erro ao carregar fluxo de caixa:', err)
      showToast('Erro ao carregar dados do fluxo', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadSaldoInicial = async () => {
    try {
      // Buscar último saldo por conta bancária até a data inicial
      let query = supabase
        .from('saldos_diarios')
        .select('banco_conta_id, saldo_final, data')
        .lte('data', dataInicial)
        .order('data', { ascending: false })

      if (bancoContaSelecionada) {
        query = query.eq('banco_conta_id', bancoContaSelecionada)
      }

      const { data, error } = await query

      if (error) throw error

      // Pegar último saldo por conta
      const saldosPorConta = new Map<string, number>()
      
      data?.forEach(saldo => {
        if (!saldosPorConta.has(saldo.banco_conta_id)) {
          saldosPorConta.set(saldo.banco_conta_id, saldo.saldo_final)
        }
      })

      const saldoTotal = Array.from(saldosPorConta.values()).reduce((sum, val) => sum + val, 0)
      setSaldoInicial(saldoTotal)

    } catch (err) {
      console.error('Erro ao carregar saldo inicial:', err)
      setSaldoInicial(0)
    }
  }

  // ✅ CORRIGIDO: Agora retorna Promise<AgendaItem[]>
  const loadAgenda = async (): Promise<AgendaItem[]> => {
    try {
      // Query base
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
          banco_conta_id,
          contraparte_id,
          subcategoria_id
        `)

      // Filtrar por status
      if (somenteAbertos) {
        query = query.eq('status', 'ABERTO')
      } else {
        query = query.in('status', ['ABERTO', 'PAGO_RECEBIDO'])
      }

      // Filtrar por natureza
      if (natureza !== 'AMBOS') {
        query = query.eq('tipo', natureza)
      }

      // Filtrar por empresa
      if (empresaSelecionada) {
        query = query.eq('empresa_id', empresaSelecionada)
      }

      // Filtrar por projeto
      if (projetoSelecionado) {
        query = query.eq('projeto_id', projetoSelecionado)
      }

      // Filtrar por banco/conta
      if (bancoContaSelecionada) {
        query = query.eq('banco_conta_id', bancoContaSelecionada)
      }

      const { data: lancamentos, error: lancError } = await query

      if (lancError) throw lancError

      // Buscar dados relacionados
      const { data: empresasData } = await supabase.from('empresas').select('id, nome')
      const { data: projetosData } = await supabase.from('projetos').select('id, nome')
      const { data: contrapartesData } = await supabase.from('contrapartes').select('id, nome')
      const { data: subcategoriasData } = await supabase.from('pc_subcategorias').select('id, nome')

      // Filtrar lançamentos pelo período
      const agendaItems: AgendaItem[] = []
      const saldosDiariosMap = new Map<string, { entradas: number, saidas: number }>()
      const breakdownSubcategoriasTemp: BreakdownItem[] = []
      const breakdownContrapartesTemp: BreakdownItem[] = []

      lancamentos?.forEach(lanc => {
        // Determinar data de referência
        let dataRef: string
        if (somenteAbertos || lanc.status === 'ABERTO') {
          dataRef = lanc.data_vencimento
        } else {
          dataRef = lanc.data_liquidacao || lanc.data_vencimento
        }

        if (!dataRef) return

        // Verificar se está no período
        if (dataRef < dataInicial || dataRef > dataFinal) return

        const empresa = empresasData?.find(e => e.id === lanc.empresa_id)
        const projeto = projetosData?.find(p => p.id === lanc.projeto_id)
        const contraparte = contrapartesData?.find(c => c.id === lanc.contraparte_id)
        const subcategoria = subcategoriasData?.find(s => s.id === lanc.subcategoria_id)

        const valor = lanc.valor_liquido || lanc.valor_bruto

        agendaItems.push({
          data: dataRef,
          tipo: lanc.tipo,
          empresa: empresa?.nome || '-',
          projeto: projeto?.nome || '-',
          subcategoria: subcategoria?.nome || '-',
          contraparte: contraparte?.nome || '-',
          valor: valor,
          status: lanc.status
        })

        // Acumular para saldos diários
        if (!saldosDiariosMap.has(dataRef)) {
          saldosDiariosMap.set(dataRef, { entradas: 0, saidas: 0 })
        }

        const dia = saldosDiariosMap.get(dataRef)!
        if (lanc.tipo === 'RECEITA') {
          dia.entradas += valor
        } else {
          dia.saidas += valor
        }

        // Breakdown por subcategoria
        const subNome = subcategoria?.nome || 'Não classificado'
        const subIndex = breakdownSubcategoriasTemp.findIndex(b => b.nome === subNome)
        if (subIndex >= 0) {
          breakdownSubcategoriasTemp[subIndex].valor += Math.abs(valor)
        } else {
          breakdownSubcategoriasTemp.push({ nome: subNome, valor: Math.abs(valor), percentual: 0 })
        }

        // Breakdown por contraparte
        const contraparteNome = contraparte?.nome || 'Não informado'
        const contraparteIndex = breakdownContrapartesTemp.findIndex(b => b.nome === contraparteNome)
        if (contraparteIndex >= 0) {
          breakdownContrapartesTemp[contraparteIndex].valor += Math.abs(valor)
        } else {
          breakdownContrapartesTemp.push({ nome: contraparteNome, valor: Math.abs(valor), percentual: 0 })
        }
      })

      // Ordenar agenda por data
      agendaItems.sort((a, b) => a.data.localeCompare(b.data))
      setAgenda(agendaItems)

      // Construir série de saldos diários
      const saldosDiariosArray: SaldoDiario[] = []
      let saldoAcumulado = saldoInicial

      // Gerar todas as datas do período
      const inicio = new Date(dataInicial)
      const fim = new Date(dataFinal)
      
      for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
        const dataStr = getDateString(d)
        const dia = saldosDiariosMap.get(dataStr) || { entradas: 0, saidas: 0 }
        
        saldoAcumulado += (dia.entradas - dia.saidas)
        
        saldosDiariosArray.push({
          data: dataStr,
          saldo: saldoAcumulado,
          entradas: dia.entradas,
          saidas: dia.saidas
        })
      }

      setSaldosDiarios(saldosDiariosArray)

      // Calcular KPIs
      const totalEntradas = agendaItems
        .filter(a => a.tipo === 'RECEITA')
        .reduce((sum, a) => sum + a.valor, 0)
      
      const totalSaidas = agendaItems
        .filter(a => a.tipo === 'DESPESA')
        .reduce((sum, a) => sum + a.valor, 0)

      setEntradasPeriodo(totalEntradas)
      setSaidasPeriodo(totalSaidas)
      setSaldoProjetado(saldoInicial + totalEntradas - totalSaidas)

      // Calcular percentuais dos breakdowns
      const totalBreakdown = breakdownSubcategoriasTemp.reduce((sum, b) => sum + b.valor, 0)
      breakdownSubcategoriasTemp.forEach(b => {
        b.percentual = totalBreakdown > 0 ? (b.valor / totalBreakdown) * 100 : 0
      })
      breakdownSubcategoriasTemp.sort((a, b) => b.valor - a.valor)
      setBreakdownSubcategorias([...breakdownSubcategoriasTemp.slice(0, 10)])

      const totalContrapartes = breakdownContrapartesTemp.reduce((sum, b) => sum + b.valor, 0)
      breakdownContrapartesTemp.forEach(b => {
        b.percentual = totalContrapartes > 0 ? (b.valor / totalContrapartes) * 100 : 0
      })
      breakdownContrapartesTemp.sort((a, b) => b.valor - a.valor)
      setBreakdownContrapartes([...breakdownContrapartesTemp.slice(0, 10)])

      // ✅ RETORNAR os dados calculados
      return agendaItems

    } catch (err) {
      console.error('Erro ao carregar agenda:', err)
      setAgenda([])
      setSaldosDiarios([])
      return []
    }
  }

  // ✅ CORRIGIDO: Agora recebe agendaData como parâmetro
  const calcularHorizontes = (agendaData: AgendaItem[]) => {
    const hoje = new Date()
    const horizontesDias = [7, 30, 60, 90, 180]
    const horiz: {[key: number]: { entradas: number, saidas: number, liquido: number }} = {}

    for (const dias of horizontesDias) {
      const fimHorizonte = getDateString(addDays(hoje, dias))
      
      // ✅ USAR agendaData passado como parâmetro, não o estado
      const lancamentosHorizonte = agendaData.filter(a => {
        return a.data >= getDateString(hoje) && a.data <= fimHorizonte
      })

      const entradas = lancamentosHorizonte
        .filter(l => l.tipo === 'RECEITA')
        .reduce((sum, l) => sum + l.valor, 0)
      
      const saidas = lancamentosHorizonte
        .filter(l => l.tipo === 'DESPESA')
        .reduce((sum, l) => sum + l.valor, 0)

      horiz[dias] = {
        entradas,
        saidas,
        liquido: entradas - saidas
      }
    }

    setHorizontes(horiz)
  }

  const aplicarPreset = (dias: number) => {
    setPresetSelecionado(dias)
    
    if (dias > 0) {
      const hoje = new Date()
      const fim = addDays(hoje, dias)
      
      setDataInicial(getDateString(hoje))
      setDataFinal(getDateString(fim))
    }
  }

  const aplicarFiltros = () => {
    // Validar datas
    if (!dataInicial || !dataFinal) {
      showToast('Informe a data inicial e final', 'warning')
      return
    }

    if (new Date(dataFinal) < new Date(dataInicial)) {
      showToast('Data final deve ser maior ou igual à data inicial', 'warning')
      return
    }
    
    const params = new URLSearchParams()
    params.set('preset', presetSelecionado.toString())
    params.set('dataInicial', dataInicial)
    params.set('dataFinal', dataFinal)
    params.set('natureza', natureza)
    params.set('somenteAbertos', somenteAbertos.toString())
    
    if (empresaSelecionada) params.set('empresa', empresaSelecionada)
    if (projetoSelecionado) params.set('projeto', projetoSelecionado)
    if (bancoContaSelecionada) params.set('bancoConta', bancoContaSelecionada)
    
    router.push(`/relatorios/fluxo?${params.toString()}`)
    loadFluxoData()
  }

  const limparFiltros = () => {
    const hoje = new Date()
    const fim = addDays(hoje, 30)
    
    setPresetSelecionado(30)
    setDataInicial(getDateString(hoje))
    setDataFinal(getDateString(fim))
    setNatureza('AMBOS')
    setEmpresaSelecionada('')
    setProjetoSelecionado('')
    setBancoContaSelecionada('')
    setSomenteAbertos(true)
    
    router.push('/relatorios/fluxo')
    loadFluxoData()
  }

  const exportarCSV = () => {
    try {
      const headers = ['Data', 'Tipo', 'Empresa', 'Projeto', 'Subcategoria', 'Contraparte', 'Valor', 'Status']
      const rows = agenda.map(item => [
        formatDateBR(item.data),
        item.tipo === 'RECEITA' ? 'Receita' : 'Despesa',
        item.empresa,
        item.projeto,
        item.subcategoria,
        item.contraparte,
        item.valor.toFixed(2),
        item.status
      ])

      const csv = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n')

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `FluxoCaixa_${dataInicial}_${dataFinal}.csv`
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
            Fluxo de Caixa
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280' }}>
            Projeção e análise de entradas e saídas
          </p>
        </div>

        <button
          onClick={exportarCSV}
          disabled={agenda.length === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: agenda.length === 0 ? '#e5e7eb' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: agenda.length === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => agenda.length > 0 && (e.currentTarget.style.backgroundColor = '#059669')}
          onMouseOut={(e) => agenda.length > 0 && (e.currentTarget.style.backgroundColor = '#10b981')}
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

        {/* Presets de Período */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '8px'
          }}>
            Período
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {PRESETS_PERIODO.map(preset => (
              <button
                key={preset.dias}
                onClick={() => aplicarPreset(preset.dias)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: presetSelecionado === preset.dias ? '#1555D6' : 'white',
                  color: presetSelecionado === preset.dias ? 'white' : '#374151',
                  border: `1px solid ${presetSelecionado === preset.dias ? '#1555D6' : '#e5e7eb'}`,
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  if (presetSelecionado !== preset.dias) {
                    e.currentTarget.style.backgroundColor = '#f3f4f6'
                  }
                }}
                onMouseOut={(e) => {
                  if (presetSelecionado !== preset.dias) {
                    e.currentTarget.style.backgroundColor = 'white'
                  }
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '16px'
        }}>
          {/* Data Inicial */}
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
              onChange={(e) => {
                setDataInicial(e.target.value)
                setPresetSelecionado(0)
              }}
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

          {/* Data Final */}
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
              onChange={(e) => {
                setDataFinal(e.target.value)
                setPresetSelecionado(0)
              }}
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

          {/* Natureza */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Natureza
            </label>
            <select
              value={natureza}
              onChange={(e) => setNatureza(e.target.value as 'AMBOS' | 'RECEITA' | 'DESPESA')}
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
              <option value="AMBOS">Ambos</option>
              <option value="RECEITA">Receitas</option>
              <option value="DESPESA">Despesas</option>
            </select>
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
                setBancoContaSelecionada('')
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

          {/* Conta Bancária */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Conta Bancária
            </label>
            <select
              value={bancoContaSelecionada}
              onChange={(e) => setBancoContaSelecionada(e.target.value)}
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
              <option value="">Todas</option>
              {bancosContas.map(bc => (
                <option key={bc.id} value={bc.id}>
                  {bc.banco_nome} - {bc.numero_conta}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Checkbox Somente Abertos */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#374151'
          }}>
            <input
              type="checkbox"
              checked={somenteAbertos}
              onChange={(e) => setSomenteAbertos(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Somente títulos em aberto
          </label>
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
        {/* Saldo Inicial */}
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
              Saldo Inicial
            </span>
            <Wallet size={24} color="#6b7280" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#374151' }}>
            {formatCurrencyBRL(saldoInicial)}
          </div>
        </div>

        {/* Entradas */}
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
              Entradas (Período)
            </span>
            <ArrowUpCircle size={24} color="#10b981" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#059669' }}>
            {formatCurrencyBRL(entradasPeriodo)}
          </div>
        </div>

        {/* Saídas */}
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
              Saídas (Período)
            </span>
            <ArrowDownCircle size={24} color="#ef4444" />
          </div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#dc2626' }}>
            {formatCurrencyBRL(saidasPeriodo)}
          </div>
        </div>

        {/* Saldo Projetado */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderTop: `4px solid ${saldoProjetado >= 0 ? '#1555D6' : '#ef4444'}`
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>
              Saldo Projetado
            </span>
            <DollarSign size={24} color={saldoProjetado >= 0 ? '#1555D6' : '#ef4444'} />
          </div>
          <div style={{ 
            fontSize: '32px', 
            fontWeight: '700', 
            color: saldoProjetado >= 0 ? '#1555D6' : '#dc2626'
          }}>
            {formatCurrencyBRL(saldoProjetado)}
          </div>
        </div>
      </div>

      {/* Gráfico - Curva de Saldo Projetado */}
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
          marginBottom: '24px'
        }}>
          Evolução do Saldo
        </h2>

        {saldosDiarios.length === 0 ? (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '14px'
          }}>
            Sem dados para exibir
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={saldosDiarios}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="data" 
                tickFormatter={(data) => formatDateBR(data)}
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => formatCurrencyBRL(value)}
              />
              <Tooltip 
                formatter={(value: number, name: string) => {
                  const labels: {[key: string]: string} = {
                    saldo: 'Saldo',
                    entradas: 'Entradas',
                    saidas: 'Saídas'
                  }
                  return [formatCurrencyBRL(value), labels[name] || name]
                }}
                labelFormatter={(data: string) => formatDateBR(data)}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px'
                }}
              />
              <Legend 
                wrapperStyle={{ fontSize: '13px', paddingTop: '16px' }}
                formatter={(value) => {
                  const labels: {[key: string]: string} = {
                    saldo: 'Saldo',
                    entradas: 'Entradas',
                    saidas: 'Saídas'
                  }
                  return labels[value] || value
                }}
              />
              <Line 
                type="monotone" 
                dataKey="saldo" 
                stroke="#1555D6" 
                strokeWidth={3}
                dot={{ fill: '#1555D6', r: 4 }}
                activeDot={{ r: 6 }}
                name="saldo"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Gráfico - Barras de Entradas e Saídas */}
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
          marginBottom: '24px'
        }}>
          Entradas e Saídas Diárias
        </h2>

        {saldosDiarios.length === 0 ? (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '14px'
          }}>
            Sem dados para exibir
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={saldosDiarios}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="data" 
                tickFormatter={(data) => formatDateBR(data)}
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
                labelFormatter={(data: string) => formatDateBR(data)}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px'
                }}
              />
              <Legend 
                wrapperStyle={{ fontSize: '13px', paddingTop: '16px' }}
                formatter={(value) => value === 'entradas' ? 'Entradas' : 'Saídas'}
              />
              <Bar 
                dataKey="entradas" 
                fill="#10b981" 
                radius={[8, 8, 0, 0]}
                name="entradas"
              />
              <Bar 
                dataKey="saidas" 
                fill="#ef4444" 
                radius={[8, 8, 0, 0]}
                name="saidas"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Cards de Horizontes */}
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
          marginBottom: '20px'
        }}>
          Horizontes de Planejamento
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px'
        }}>
          {[7, 30, 60, 90, 180].map(dias => {
            const horiz = horizontes[dias] || { entradas: 0, saidas: 0, liquido: 0 }
            return (
              <div
                key={dias}
                style={{
                  padding: '16px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  backgroundColor: '#fafafa'
                }}
              >
                <div style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6b7280',
                  marginBottom: '12px'
                }}>
                  Próximos {dias} dias
                </div>
                
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>
                    Entradas
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#059669' }}>
                    {formatCurrencyBRL(horiz.entradas)}
                  </div>
                </div>

                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>
                    Saídas
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#dc2626' }}>
                    {formatCurrencyBRL(horiz.saidas)}
                  </div>
                </div>

                <div style={{
                  paddingTop: '8px',
                  borderTop: '1px solid #e5e7eb'
                }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>
                    Líquido
                  </div>
                  <div style={{ 
                    fontSize: '18px', 
                    fontWeight: '700', 
                    color: horiz.liquido >= 0 ? '#1555D6' : '#dc2626'
                  }}>
                    {formatCurrencyBRL(horiz.liquido)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tabela - Agenda Diária */}
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
          Agenda Diária
        </h2>

        {agenda.length === 0 ? (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '14px'
          }}>
            Sem lançamentos para o período selecionado
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
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {agenda.slice(0, 50).map((item, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>
                      {formatDateBR(item.data)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '500',
                        backgroundColor: item.tipo === 'RECEITA' ? '#d1fae5' : '#fee2e2',
                        color: item.tipo === 'RECEITA' ? '#065f46' : '#991b1b'
                      }}>
                        {item.tipo === 'RECEITA' ? 'Receita' : 'Despesa'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>
                      {item.empresa}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>
                      {item.projeto}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>
                      {item.subcategoria}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#374151' }}>
                      {item.contraparte}
                    </td>
                    <td style={{ 
                      padding: '12px 16px', 
                      textAlign: 'right', 
                      fontWeight: '600',
                      color: item.tipo === 'RECEITA' ? '#059669' : '#dc2626'
                    }}>
                      {formatCurrencyBRL(item.valor)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '500',
                        backgroundColor: item.status === 'ABERTO' ? '#fef3c7' : '#d1fae5',
                        color: item.status === 'ABERTO' ? '#92400e' : '#065f46'
                      }}>
                        {item.status === 'ABERTO' ? 'Aberto' : 'Pago/Recebido'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {agenda.length > 50 && (
              <div style={{
                padding: '12px 16px',
                textAlign: 'center',
                fontSize: '13px',
                color: '#6b7280',
                backgroundColor: '#f9fafb',
                borderTop: '1px solid #e5e7eb'
              }}>
                Mostrando 50 de {agenda.length} registros. Use o CSV para ver todos.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Breakdowns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '24px'
      }}>
        {/* Breakdown por Subcategoria */}
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
            Top 10 Subcategorias
          </h2>

          {breakdownSubcategorias.length === 0 ? (
            <div style={{
              padding: '24px',
              textAlign: 'center',
              color: '#9ca3af',
              fontSize: '13px'
            }}>
              Sem dados
            </div>
          ) : (
            <div>
              {breakdownSubcategorias.map((item, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: index < breakdownSubcategorias.length - 1 ? '1px solid #f3f4f6' : 'none'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', color: '#374151', marginBottom: '2px' }}>
                      {item.nome}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      {item.percentual.toFixed(2)}%
                    </div>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#374151' }}>
                    {formatCurrencyBRL(item.valor)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Breakdown por Contraparte */}
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
            Top 10 Contrapartes
          </h2>

          {breakdownContrapartes.length === 0 ? (
            <div style={{
              padding: '24px',
              textAlign: 'center',
              color: '#9ca3af',
              fontSize: '13px'
            }}>
              Sem dados
            </div>
          ) : (
            <div>
              {breakdownContrapartes.map((item, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: index < breakdownContrapartes.length - 1 ? '1px solid #f3f4f6' : 'none'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', color: '#374151', marginBottom: '2px' }}>
                      {item.nome}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      {item.percentual.toFixed(2)}%
                    </div>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#374151' }}>
                    {formatCurrencyBRL(item.valor)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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