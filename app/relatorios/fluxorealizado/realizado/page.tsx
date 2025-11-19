'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useSearchParams, useRouter } from 'next/navigation'
import { 
  Filter, Download, Calendar, TrendingUp, TrendingDown, 
  DollarSign, ArrowUpCircle, ArrowDownCircle, Receipt,
  ChevronRight, ChevronDown
} from 'lucide-react'
import { 
  BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell
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

interface ClassificacaoAgrupada {
  classificacao: string
  entradas: number
  saidas: number
  liquido: number
  itens: ItemDetalhado[]
}

interface NoHierarquico {
  nome: string
  nivel: number
  entradas: number
  saidas: number
  liquido: number
  filhos: NoHierarquico[]
  tipo: 'grupo' | 'categoria' | 'subcategoria' | 'item'
  lancamentos?: LancamentoDetalhado[]
  planoContaId?: string
  sentido?: 'Entrada' | 'Saida'
}

interface LancamentoDetalhado {
  id: string
  data_liquidacao: string
  empresa_nome: string
  projeto_nome: string
  contraparte_nome: string
  valor_liquido: number
  valor_bruto: number
  sentido: 'Entrada' | 'Saida'
  observacoes: string
  documento_numero: string
}

interface ItemDetalhado {
  data: string
  empresa: string
  projeto: string
  contraparte: string
  valor: number
  tipo: 'Entrada' | 'Saida'
  observacoes: string
}

interface DadoGrafico {
  classificacao: string
  entradas: number
  saidas: number
  liquido: number
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
  { label: '2025', ano: 2025 },
  { label: '2024', ano: 2024 },
  { label: '2023', ano: 2023 },
  { label: 'Este Ano', tipo: 'ano_atual' },
  { label: 'Últimos 12 meses', tipo: 'ultimos_12_meses' },
  { label: 'Personalizado', tipo: 'custom' }
]

export default function FluxoCaixaRealizadoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Estados
  const [loading, setLoading] = useState(true)
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [subprojetos, setSubprojetos] = useState<Projeto[]>([])
  const [bancosContas, setBancosContas] = useState<BancoConta[]>([])
  const [dadosClassificacao, setDadosClassificacao] = useState<ClassificacaoAgrupada[]>([])
  const [hierarquia, setHierarquia] = useState<NoHierarquico[]>([])
  const [nosExpandidos, setNosExpandidos] = useState<Set<string>>(new Set())
  const [lancamentosExpandidos, setLancamentosExpandidos] = useState<Set<string>>(new Set())
  
  // Filtros
  const [presetSelecionado, setPresetSelecionado] = useState<string>('ano_atual')
  const [dataInicial, setDataInicial] = useState<string>('')
  const [dataFinal, setDataFinal] = useState<string>('')
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string>('')
  const [projetoSelecionado, setProjetoSelecionado] = useState<string>('')
  const [subprojetoSelecionado, setSubprojetoSelecionado] = useState<string>('')
  const [bancoContaSelecionada, setBancoContaSelecionada] = useState<string>('')
  const [tipoAgrupamento, setTipoAgrupamento] = useState<'classificacao' | 'tipo_fluxo'>('classificacao')
  
  // KPIs
  const [saldoBancarioInicial, setSaldoBancarioInicial] = useState<number>(0)
  const [totalEntradas, setTotalEntradas] = useState<number>(0)
  const [totalSaidas, setTotalSaidas] = useState<number>(0)
  const [totalLiquido, setTotalLiquido] = useState<number>(0)
  
  // Toast
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)

  // Ref para controlar primeiro carregamento
  const primeiroCarregamento = useRef(true)

  // Inicializar datas ao carregar (ano atual)
  useEffect(() => {
    loadSaldoInicial()
    const hoje = new Date()
    const inicioAno = new Date(hoje.getFullYear(), 0, 1) // 1º de janeiro do ano atual
    
    setDataInicial(getDateString(inicioAno))
    setDataFinal(getDateString(hoje))
    
    // Carregar listas iniciais
    loadEmpresas()
    loadProjetos() // Carregar todos os projetos
  }, [])

  // Carregar dados quando as datas estiverem prontas (apenas primeiro carregamento)
  useEffect(() => {
    if (dataInicial && dataFinal && primeiroCarregamento.current) {
      primeiroCarregamento.current = false
      loadDadosRealizados()
    }
  }, [dataInicial, dataFinal])

  // Carregar filtros da URL
  useEffect(() => {
    const preset = searchParams.get('preset')
    const inicio = searchParams.get('dataInicial')
    const fim = searchParams.get('dataFinal')
    const empresa = searchParams.get('empresa')
    const projeto = searchParams.get('projeto')
    const subprojeto = searchParams.get('subprojeto')
    const banco = searchParams.get('bancoConta')
    
    if (preset) setPresetSelecionado(preset)
    if (inicio) setDataInicial(inicio)
    if (fim) setDataFinal(fim)
    if (empresa) setEmpresaSelecionada(empresa)
    if (projeto) setProjetoSelecionado(projeto)
    if (subprojeto) setSubprojetoSelecionado(subprojeto)
    if (banco) setBancoContaSelecionada(banco)
  }, [])

  useEffect(() => {
    if (empresaSelecionada) {
      loadProjetos(empresaSelecionada)
      loadBancosContas(empresaSelecionada)
    } else {
      loadProjetos() // Carregar todos os projetos
      setBancosContas([])
      setBancoContaSelecionada('')
    }
  }, [empresaSelecionada])

  useEffect(() => {
    if (projetoSelecionado) {
      loadSubprojetos(projetoSelecionado)
    } else {
      setSubprojetos([])
      setSubprojetoSelecionado('')
    }
  }, [projetoSelecionado])

  // Recarregar dados quando mudar o tipo de agrupamento
  useEffect(() => {
    if (dataInicial && dataFinal) {
      loadDadosRealizados()
    }
  }, [tipoAgrupamento])

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

  const toggleNo = (chave: string) => {
    setNosExpandidos(prev => {
      const novo = new Set(prev)
      if (novo.has(chave)) {
        novo.delete(chave)
      } else {
        novo.add(chave)
      }
      return novo
    })
  }

  const toggleLancamentos = (chave: string) => {
    setLancamentosExpandidos(prev => {
      const novo = new Set(prev)
      if (novo.has(chave)) {
        novo.delete(chave)
      } else {
        novo.add(chave)
      }
      return novo
    })
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

  const loadSaldoInicial = async () => {
    try {
      const { data, error } = await supabase
        .from('bancos_contas')
        .select('saldo_inicial')
        .eq('ativo', true)

      if (error) throw error

      const soma = (data || []).reduce((sum, conta) => sum + (conta.saldo_inicial || 0), 0)
      setSaldoBancarioInicial(soma)
    } catch (err) {
      console.error('Erro ao carregar saldo inicial:', err)
      setSaldoBancarioInicial(0)
    }
  }


  const loadProjetos = async (empresaId?: string) => {
    try {
      let query = supabase
        .from('projetos')
        .select('id, empresa_id, nome')
        .is('projeto_pai_id', null) // Apenas projetos principais
        .order('nome', { ascending: true })

      if (empresaId) {
        query = query.eq('empresa_id', empresaId)
      }

      const { data, error } = await query

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

  const loadSubprojetos = async (projetoId: string) => {
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, empresa_id, nome')
        .eq('projeto_pai_id', projetoId)
        .order('nome', { ascending: true })

      if (error) throw error
      setSubprojetos(data || [])
    } catch (err) {
      console.error('Erro ao carregar subprojetos:', err)
      showToast('Erro ao carregar subprojetos', 'error')
    }
  }

  const loadDadosRealizados = async () => {
    try {
      setLoading(true)
      
      // Carregar TODOS os lançamentos com paginação
      let todosLancamentos: any[] = []
      let inicio = 0
      const limite = 1000
      let temMais = true

      while (temMais) {
        // Query base - APENAS PAGO_RECEBIDO
        let query = supabase
          .from('lancamentos')
          .select(`
            id,
            tipo,
            sentido,
            valor_bruto,
            valor_liquido,
            data_liquidacao,
            observacoes,
            empresa_id,
            projeto_id,
            banco_conta_id,
            contraparte_id,
            plano_conta_id
          `)
          .eq('status', 'PAGO_RECEBIDO')
          .gte('data_liquidacao', dataInicial)
          .lte('data_liquidacao', dataFinal)
          .not('data_liquidacao', 'is', null)
          .range(inicio, inicio + limite - 1)

        // Filtrar por empresa
        if (empresaSelecionada) {
          query = query.eq('empresa_id', empresaSelecionada)
        }

        // Filtrar por projeto
        if (projetoSelecionado) {
          query = query.eq('projeto_id', projetoSelecionado)
        }

        // Filtrar por subprojeto
        if (subprojetoSelecionado) {
          query = query.eq('subprojeto_id', subprojetoSelecionado)
        }

        // Filtrar por banco/conta
        if (bancoContaSelecionada) {
          query = query.eq('banco_conta_id', bancoContaSelecionada)
        }

        const { data: lote, error: lancError } = await query

        if (lancError) throw lancError

        if (lote && lote.length > 0) {
          todosLancamentos = [...todosLancamentos, ...lote]
          
          // Se trouxe menos que o limite, não tem mais registros
          if (lote.length < limite) {
            temMais = false
          } else {
            inicio += limite
          }
        } else {
          temMais = false
        }
      }

      const lancamentos = todosLancamentos

      // Buscar dados relacionados
      const { data: empresasData } = await supabase.from('empresas').select('id, nome')
      const { data: projetosData } = await supabase.from('projetos').select('id, nome')
      const { data: contrapartesData } = await supabase.from('contrapartes').select('id, nome')
      const { data: planoContasData } = await supabase
        .from('plano_contas_fluxo')
        .select('id, classificacao, tipo_fluxo, grupo, categoria, subcategoria')

      // Criar estrutura hierárquica
      const raiz = new Map<string, NoHierarquico>()

      lancamentos?.forEach(lanc => {
        const planoConta = planoContasData?.find(pc => pc.id === lanc.plano_conta_id)
        if (!planoConta) return
        
        const empresa = empresasData?.find(e => e.id === lanc.empresa_id)
        const projeto = projetosData?.find(p => p.id === lanc.projeto_id)
        const contraparte = contrapartesData?.find(c => c.id === lanc.contraparte_id)
        
        const valor = lanc.valor_liquido || lanc.valor_bruto
        const isEntrada = lanc.sentido === 'Entrada'

        // Construir caminho hierárquico baseado no tipo de agrupamento
        const nivel1 = tipoAgrupamento === 'classificacao' 
          ? (planoConta.classificacao || 'Não Classificado')
          : (planoConta.tipo_fluxo || 'Não Classificado')
        const nivel2 = planoConta.grupo || ''
        const nivel3 = planoConta.categoria || ''
        const nivel4 = planoConta.subcategoria || ''

        // Nível 1 - Classificação ou Tipo Fluxo
        if (!raiz.has(nivel1)) {
          raiz.set(nivel1, {
            nome: nivel1,
            nivel: 1,
            entradas: 0,
            saidas: 0,
            liquido: 0,
            filhos: [],
            tipo: 'grupo'
          })
        }
        const no1 = raiz.get(nivel1)!

        if (isEntrada) {
          no1.entradas += valor
        } else {
          no1.saidas += valor
        }
        no1.liquido = no1.entradas - no1.saidas

        // Nível 2 - Grupo
        if (nivel2) {
          let no2 = no1.filhos.find(f => f.nome === nivel2)
          if (!no2) {
            no2 = {
              nome: nivel2,
              nivel: 2,
              entradas: 0,
              saidas: 0,
              liquido: 0,
              filhos: [],
              tipo: 'categoria'
            }
            no1.filhos.push(no2)
          }

          if (isEntrada) {
            no2.entradas += valor
          } else {
            no2.saidas += valor
          }
          no2.liquido = no2.entradas - no2.saidas

          // Nível 3 - Categoria
          if (nivel3) {
            let no3 = no2.filhos.find(f => f.nome === nivel3)
            if (!no3) {
              no3 = {
                nome: nivel3,
                nivel: 3,
                entradas: 0,
                saidas: 0,
                liquido: 0,
                filhos: [],
                tipo: 'subcategoria'
              }
              no2.filhos.push(no3)
            }

            if (isEntrada) {
              no3.entradas += valor
            } else {
              no3.saidas += valor
            }
            no3.liquido = no3.entradas - no3.saidas

            // Nível 4 - Subcategoria
            if (nivel4) {
              let no4 = no3.filhos.find(f => f.nome === nivel4)
              if (!no4) {
                no4 = {
                  nome: nivel4,
                  nivel: 4,
                  entradas: 0,
                  saidas: 0,
                  liquido: 0,
                  filhos: [],
                  tipo: 'item',
                  lancamentos: []
                }
                no3.filhos.push(no4)
              }

              if (isEntrada) {
                no4.entradas += valor
              } else {
                no4.saidas += valor
              }
              no4.liquido = no4.entradas - no4.saidas
              
              // Adicionar lançamento detalhado
              if (!no4.lancamentos) no4.lancamentos = []
              no4.lancamentos.push({
                id: lanc.id,
                data_liquidacao: lanc.data_liquidacao,
                empresa_nome: empresa?.nome || 'N/A',
                projeto_nome: projeto?.nome || 'N/A',
                contraparte_nome: contraparte?.nome || 'N/A',
                valor_liquido: lanc.valor_liquido || lanc.valor_bruto,
                valor_bruto: lanc.valor_bruto,
                sentido: lanc.sentido,
                observacoes: lanc.observacoes || '',
                documento_numero: lanc.documento_numero || ''
              })
            }
          }
        }
      })

      // Converter para array e ordenar
      const hierarquiaArray = Array.from(raiz.values())
      
      // Função recursiva para ordenar filhos
      const ordenarFilhos = (no: NoHierarquico) => {
        no.filhos.sort((a, b) => a.nome.localeCompare(b.nome))
        no.filhos.forEach(ordenarFilhos)
      }
      
      hierarquiaArray.forEach(ordenarFilhos)
      hierarquiaArray.sort((a, b) => a.nome.localeCompare(b.nome))

      setHierarquia(hierarquiaArray)

      // Calcular totais
      const entradas = hierarquiaArray.reduce((sum, d) => sum + d.entradas, 0)
      const saidas = hierarquiaArray.reduce((sum, d) => sum + d.saidas, 0)
      
      setTotalEntradas(entradas)
      setTotalSaidas(saidas)
      
      // Buscar saldo inicial para calcular resultado líquido
      const { data: contasData } = await supabase
        .from('bancos_contas')
        .select('saldo_inicial')
        .eq('ativo', true)
      
      const saldoInicial = (contasData || []).reduce((sum, conta) => sum + (conta.saldo_inicial || 0), 0)
      setTotalLiquido(saldoInicial + entradas - saidas)

    } catch (err) {
      console.error('Erro ao carregar dados realizados:', err)
      showToast('Erro ao carregar dados', 'error')
      setHierarquia([])
    } finally {
      setLoading(false)
    }
  }

  const aplicarPreset = (preset: string, ano?: number, tipo?: string) => {
    setPresetSelecionado(preset)
    
    const hoje = new Date()
    
    if (ano) {
      // Ano específico (2025, 2024, 2023)
      const inicio = new Date(ano, 0, 1) // 1º de janeiro
      const fim = new Date(ano, 11, 31) // 31 de dezembro
      setDataInicial(getDateString(inicio))
      setDataFinal(getDateString(fim))
    } else if (tipo === 'ano_atual') {
      // Este ano (do início do ano até hoje)
      const inicioAno = new Date(hoje.getFullYear(), 0, 1)
      setDataInicial(getDateString(inicioAno))
      setDataFinal(getDateString(hoje))
    } else if (tipo === 'ultimos_12_meses') {
      // Últimos 12 meses
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1)
      setDataInicial(getDateString(inicio))
      setDataFinal(getDateString(hoje))
    } else if (tipo === 'custom') {
      // Não fazer nada, usuário vai escolher
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
    params.set('preset', presetSelecionado)
    params.set('dataInicial', dataInicial)
    params.set('dataFinal', dataFinal)
    
    if (empresaSelecionada) params.set('empresa', empresaSelecionada)
    if (projetoSelecionado) params.set('projeto', projetoSelecionado)
    if (subprojetoSelecionado) params.set('subprojeto', subprojetoSelecionado)
    if (bancoContaSelecionada) params.set('bancoConta', bancoContaSelecionada)
    
    router.push(`/relatorios/fluxorealizado/realizado?${params.toString()}`)
    loadDadosRealizados()
  }

  const limparFiltros = () => {
    const hoje = new Date()
    const inicioAno = new Date(hoje.getFullYear(), 0, 1)
    
    setPresetSelecionado('ano_atual')
    setDataInicial(getDateString(inicioAno))
    setDataFinal(getDateString(hoje))
    setEmpresaSelecionada('')
    setProjetoSelecionado('')
    setSubprojetoSelecionado('')
    setBancoContaSelecionada('')
    
    router.push('/relatorios/fluxorealizado/realizado')
    loadDadosRealizados()
  }

  const exportarCSV = () => {
    try {
      const headers = ['Rótulo de Linha', 'Nível', 'Entradas', 'Saídas', 'Líquido']
      
      const achatarHierarquia = (no: NoHierarquico, rows: string[][]): void => {
        const indentacao = '  '.repeat(no.nivel - 1)
        rows.push([
          `${indentacao}${no.nome}`,
          no.nivel.toString(),
          no.entradas.toFixed(2),
          no.saidas.toFixed(2),
          no.liquido.toFixed(2)
        ])
        
        no.filhos.forEach(filho => achatarHierarquia(filho, rows))
      }

      const rows: string[][] = []
      hierarquia.forEach(no => achatarHierarquia(no, rows))

      const csv = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n')

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `FluxoCaixaRealizado_${dataInicial}_${dataFinal}.csv`
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

  // Preparar dados para o gráfico (apenas nível 1)
  const dadosGrafico: DadoGrafico[] = hierarquia.map(d => ({
    classificacao: d.nome.length > 20 ? d.nome.substring(0, 20) + '...' : d.nome,
    entradas: d.entradas,
    saidas: d.saidas,
    liquido: d.liquido
  }))

  // Tooltip customizado para mostrar entradas, saídas e líquido
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const entradas = payload.find((p: any) => p.dataKey === 'entradas')?.value || 0
      const saidas = payload.find((p: any) => p.dataKey === 'saidas')?.value || 0
      const liquido = entradas - saidas
      
      return (
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '12px',
          fontSize: '13px'
        }}>
          <p style={{ fontWeight: '600', marginBottom: '8px', color: '#374151' }}>
            {payload[0]?.payload?.classificacao}
          </p>
          <p style={{ color: '#059669', margin: '4px 0' }}>
            entradas : {formatCurrencyBRL(entradas)}
          </p>
          <p style={{ color: '#dc2626', margin: '4px 0' }}>
            saídas : {formatCurrencyBRL(saidas)}
          </p>
          <p style={{ 
            color: liquido >= 0 ? '#1555D6' : '#dc2626', 
            margin: '4px 0',
            fontWeight: '600',
            borderTop: '1px solid #e5e7eb',
            paddingTop: '8px',
            marginTop: '8px'
          }}>
            Saldo Líquido : {formatCurrencyBRL(liquido)}
          </p>
        </div>
      )
    }
    return null
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
            Fluxo de Caixa Realizado
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280' }}>
            Entradas e saídas efetivadas (Pagos/Recebidos)
          </p>
        </div>

        <button
          onClick={exportarCSV}
          disabled={hierarquia.length === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: hierarquia.length === 0 ? '#e5e7eb' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: hierarquia.length === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => hierarquia.length > 0 && (e.currentTarget.style.backgroundColor = '#059669')}
          onMouseOut={(e) => hierarquia.length > 0 && (e.currentTarget.style.backgroundColor = '#10b981')}
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

        {/* Tipo de Agrupamento */}
        <div style={{ marginBottom: '16px' }}>
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
            value={tipoAgrupamento}
            onChange={(e) => setTipoAgrupamento(e.target.value as 'classificacao' | 'tipo_fluxo')}
            style={{
              width: '250px',
              padding: '9px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
              cursor: 'pointer',
              backgroundColor: 'white'
            }}
          >
            <option value="classificacao">Por Classificação</option>
            <option value="tipo_fluxo">Por Tipo de Fluxo</option>
          </select>
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
                key={preset.label}
                onClick={() => aplicarPreset(preset.label.toLowerCase().replace(/\s/g, '_'), preset.ano, preset.tipo)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: presetSelecionado === preset.label.toLowerCase().replace(/\s/g, '_') ? '#1555D6' : 'white',
                  color: presetSelecionado === preset.label.toLowerCase().replace(/\s/g, '_') ? 'white' : '#374151',
                  border: `1px solid ${presetSelecionado === preset.label.toLowerCase().replace(/\s/g, '_') ? '#1555D6' : '#e5e7eb'}`,
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  if (presetSelecionado !== preset.label.toLowerCase().replace(/\s/g, '_')) {
                    e.currentTarget.style.backgroundColor = '#f3f4f6'
                  }
                }}
                onMouseOut={(e) => {
                  if (presetSelecionado !== preset.label.toLowerCase().replace(/\s/g, '_')) {
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
                setPresetSelecionado('personalizado')
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
                setPresetSelecionado('personalizado')
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
              onChange={(e) => {
                setProjetoSelecionado(e.target.value)
                setSubprojetoSelecionado('')
              }}
              style={{
                width: '100%',
                padding: '9px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: 'pointer',
                backgroundColor: 'white'
              }}
            >
              <option value="">Todos</option>
              {projetos.map(proj => (
                <option key={proj.id} value={proj.id}>{proj.nome}</option>
              ))}
            </select>
          </div>

          {/* Subprojeto */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Subprojeto
            </label>
            <select
              value={subprojetoSelecionado}
              onChange={(e) => setSubprojetoSelecionado(e.target.value)}
              disabled={!projetoSelecionado}
              style={{
                width: '100%',
                padding: '9px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                cursor: projetoSelecionado ? 'pointer' : 'not-allowed',
                backgroundColor: projetoSelecionado ? 'white' : '#f9fafb'
              }}
            >
              <option value="">Todos</option>
              {subprojetos.map(subproj => (
                <option key={subproj.id} value={subproj.id}>{subproj.nome}</option>
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
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '20px',
        marginBottom: '24px'
      }}>
        {/* Saldo Bancário Inicial */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '18px 16px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderTop: '4px solid #8b5cf6',
          minHeight: '130px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: 'clamp(12px, 1.5vw, 14px)', fontWeight: '500', color: '#6b7280' }}>
              Saldo Bancário Inicial
            </span>
            <DollarSign size={24} color="#8b5cf6" />
          </div>
          <div style={{ 
            fontSize: 'clamp(14px, 2.5vw, 22px)', 
            fontWeight: '700', 
            color: '#7c3aed',
            wordBreak: 'break-word',
            lineHeight: '1.3',
            minHeight: '50px',
            display: 'flex',
            alignItems: 'center'
          }}>
            {formatCurrencyBRL(saldoBancarioInicial)}
          </div>
        </div>

        {/* Total Entradas */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '18px 16px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderTop: '4px solid #10b981',
          minHeight: '130px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: 'clamp(12px, 1.5vw, 14px)', fontWeight: '500', color: '#6b7280' }}>
              Total Entradas
            </span>
            <ArrowUpCircle size={24} color="#10b981" />
          </div>
          <div style={{ 
            fontSize: 'clamp(14px, 2.5vw, 22px)', 
            fontWeight: '700', 
            color: '#059669',
            wordBreak: 'break-word',
            lineHeight: '1.3',
            minHeight: '50px',
            display: 'flex',
            alignItems: 'center'
          }}>
            {formatCurrencyBRL(totalEntradas)}
          </div>
        </div>

        {/* Total Saídas */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '18px 16px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderTop: '4px solid #ef4444',
          minHeight: '130px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: 'clamp(12px, 1.5vw, 14px)', fontWeight: '500', color: '#6b7280' }}>
              Total Saídas
            </span>
            <ArrowDownCircle size={24} color="#ef4444" />
          </div>
          <div style={{ 
            fontSize: 'clamp(14px, 2.5vw, 22px)', 
            fontWeight: '700', 
            color: '#dc2626',
            wordBreak: 'break-word',
            lineHeight: '1.3',
            minHeight: '50px',
            display: 'flex',
            alignItems: 'center'
          }}>
            {formatCurrencyBRL(totalSaidas)}
          </div>
        </div>

        {/* Total Líquido */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '18px 16px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderTop: `4px solid ${totalLiquido >= 0 ? '#1555D6' : '#ef4444'}`,
          minHeight: '130px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: 'clamp(12px, 1.5vw, 14px)', fontWeight: '500', color: '#6b7280' }}>
              Saldo Bancário Final
            </span>
            <Receipt size={24} color={totalLiquido >= 0 ? '#1555D6' : '#ef4444'} />
          </div>
          <div style={{ 
            fontSize: 'clamp(14px, 2.5vw, 22px)', 
            fontWeight: '700', 
            color: totalLiquido >= 0 ? '#1555D6' : '#dc2626',
            wordBreak: 'break-word',
            lineHeight: '1.3',
            minHeight: '50px',
            display: 'flex',
            alignItems: 'center'
          }}>
            {formatCurrencyBRL(totalLiquido)}
          </div>
        </div>
      </div>

      {/* CARD 1: Tabela - Dados por Classificação (PRIMEIRO) */}
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
          Rótulos de Linha
        </h2>

        {hierarquia.length === 0 ? (
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
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    fontWeight: '600', 
                    color: '#6b7280', 
                    borderBottom: '1px solid #e5e7eb',
                    width: '40%'
                  }}>
                    Rótulos de Linha
                  </th>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'right', 
                    fontWeight: '600', 
                    color: '#6b7280', 
                    borderBottom: '1px solid #e5e7eb',
                    width: '20%'
                  }}>
                    Entradas
                  </th>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'right', 
                    fontWeight: '600', 
                    color: '#6b7280', 
                    borderBottom: '1px solid #e5e7eb',
                    width: '20%'
                  }}>
                    Saídas
                  </th>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'right', 
                    fontWeight: '600', 
                    color: '#6b7280', 
                    borderBottom: '1px solid #e5e7eb',
                    width: '20%'
                  }}>
                    Líquido
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const renderizarNo = (no: NoHierarquico, index: number, arrayLength: number, caminhoCompleto: string = ''): React.ReactElement[] => {
                    const elementos: React.ReactElement[] = []
                    const indentacao = (no.nivel - 1) * 20
                    const chave = caminhoCompleto ? `${caminhoCompleto}>${no.nome}` : no.nome
                    const temFilhos = no.filhos && no.filhos.length > 0
                    const estaExpandido = nosExpandidos.has(chave)
                    
                    // Estilo baseado no nível
                    const estiloLinha = {
                      backgroundColor: no.nivel === 1 ? '#f0f9ff' : 'transparent',
                      fontWeight: no.nivel <= 2 ? '600' : '500',
                      borderBottom: index < arrayLength - 1 ? '1px solid #f3f4f6' : 'none'
                    }

                    elementos.push(
                      <tr key={chave} style={estiloLinha}>
                        <td style={{ 
                          padding: '12px 16px', 
                          paddingLeft: `${16 + indentacao}px`,
                          color: '#374151',
                          fontWeight: estiloLinha.fontWeight,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          {temFilhos ? (
                            <button
                              onClick={() => toggleNo(chave)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '0',
                                display: 'flex',
                                alignItems: 'center',
                                color: '#6b7280'
                              }}
                            >
                              {estaExpandido ? (
                                <ChevronDown size={16} style={{ color: '#1555D6' }} />
                              ) : (
                                <ChevronRight size={16} style={{ color: '#6b7280' }} />
                              )}
                            </button>
                          ) : (
                            <span style={{ width: '16px' }} />
                          )}
                          <span>{no.nome}</span>
                        </td>
                        <td style={{ 
                          padding: '12px 16px', 
                          textAlign: 'right', 
                          fontWeight: estiloLinha.fontWeight,
                          color: no.entradas > 0 ? '#059669' : '#9ca3af'
                        }}>
                          {no.entradas > 0 ? formatCurrencyBRL(no.entradas) : '-'}
                        </td>
                        <td style={{ 
                          padding: '12px 16px', 
                          textAlign: 'right', 
                          fontWeight: estiloLinha.fontWeight,
                          color: no.saidas > 0 ? '#dc2626' : '#9ca3af'
                        }}>
                          {no.saidas > 0 ? formatCurrencyBRL(no.saidas) : '-'}
                        </td>
                        <td style={{ 
                          padding: '12px 16px', 
                          textAlign: 'right', 
                          fontWeight: estiloLinha.fontWeight,
                          color: no.liquido >= 0 ? '#1555D6' : '#dc2626'
                        }}>
                          {formatCurrencyBRL(no.liquido)}
                        </td>
                      </tr>
                    )

                    // Renderizar filhos recursivamente apenas se expandido
                    if (temFilhos && estaExpandido) {
                      no.filhos.forEach((filho, idx) => {
                        elementos.push(...renderizarNo(filho, idx, no.filhos.length, chave))
                      })
                    }

                    // Renderizar lançamentos se não tiver filhos e tiver lançamentos
                    if (!temFilhos && no.lancamentos && no.lancamentos.length > 0) {
                      const lancamentosEstaExpandido = lancamentosExpandidos.has(chave)
                      
                      // Adicionar botão para expandir lançamentos
                      elementos.push(
                        <tr key={`${chave}-toggle`} style={{ backgroundColor: '#f9fafb' }}>
                          <td colSpan={4} style={{ padding: '8px 16px', paddingLeft: `${16 + (no.nivel) * 20}px` }}>
                            <button
                              onClick={() => toggleLancamentos(chave)}
                              style={{
                                background: 'none',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                padding: '4px 12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '12px',
                                color: '#6b7280',
                                fontWeight: '500'
                              }}
                            >
                              {lancamentosEstaExpandido ? (
                                <ChevronDown size={14} style={{ color: '#1555D6' }} />
                              ) : (
                                <ChevronRight size={14} style={{ color: '#6b7280' }} />
                              )}
                              <span>{lancamentosEstaExpandido ? 'Ocultar' : 'Ver'} {no.lancamentos.length} lançamento{no.lancamentos.length !== 1 ? 's' : ''}</span>
                            </button>
                          </td>
                        </tr>
                      )

                      // Renderizar lançamentos se expandido
                      if (lancamentosEstaExpandido) {
                        no.lancamentos.forEach((lanc, lancIdx) => {
                          elementos.push(
                            <tr 
                              key={`${chave}-lanc-${lancIdx}`} 
                              style={{ 
                                backgroundColor: '#fafafa',
                                borderBottom: lancIdx < no.lancamentos!.length - 1 ? '1px solid #f3f4f6' : 'none'
                              }}
                            >
                              <td style={{ 
                                padding: '10px 16px', 
                                paddingLeft: `${16 + (no.nivel + 1) * 20}px`,
                                fontSize: '12px',
                                color: '#6b7280'
                              }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontWeight: '500', color: '#374151' }}>
                                      {formatDateBR(lanc.data_liquidacao)}
                                    </span>
                                    {lanc.documento_numero && (
                                      <span style={{ 
                                        backgroundColor: '#e0e7ff', 
                                        color: '#4338ca',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: '500'
                                      }}>
                                        {lanc.documento_numero}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                                    <span>{lanc.empresa_nome}</span>
                                    {lanc.projeto_nome !== 'N/A' && <span> • {lanc.projeto_nome}</span>}
                                    <span> • {lanc.contraparte_nome}</span>
                                  </div>
                                  {lanc.observacoes && (
                                    <div style={{ 
                                      fontSize: '11px', 
                                      color: '#6b7280',
                                      fontStyle: 'italic',
                                      marginTop: '2px'
                                    }}>
                                      {lanc.observacoes}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td style={{ 
                                padding: '10px 16px', 
                                textAlign: 'right',
                                fontSize: '12px',
                                fontWeight: '500',
                                color: lanc.sentido === 'Entrada' ? '#059669' : '#9ca3af'
                              }}>
                                {lanc.sentido === 'Entrada' ? formatCurrencyBRL(lanc.valor_liquido) : '-'}
                              </td>
                              <td style={{ 
                                padding: '10px 16px', 
                                textAlign: 'right',
                                fontSize: '12px',
                                fontWeight: '500',
                                color: lanc.sentido === 'Saida' ? '#dc2626' : '#9ca3af'
                              }}>
                                {lanc.sentido === 'Saida' ? formatCurrencyBRL(lanc.valor_liquido) : '-'}
                              </td>
                              <td style={{ 
                                padding: '10px 16px', 
                                textAlign: 'right',
                                fontSize: '12px',
                                fontWeight: '600',
                                color: lanc.sentido === 'Entrada' ? '#1555D6' : '#dc2626'
                              }}>
                                {lanc.sentido === 'Entrada' ? '+' : '-'}{formatCurrencyBRL(Math.abs(lanc.valor_liquido))}
                              </td>
                            </tr>
                          )
                        })
                      }
                    }

                    return elementos
                  }

                  return hierarquia.flatMap((no, idx) => renderizarNo(no, idx, hierarquia.length))
                })()}
                
                {/* Linha de Total */}
                <tr style={{ 
                  backgroundColor: '#e0f2fe',
                  borderTop: '2px solid #1555D6',
                  fontWeight: '700'
                }}>
                  <td style={{ 
                    padding: '14px 16px', 
                    color: '#374151',
                    fontSize: '14px'
                  }}>
                    TOTAL GERAL
                  </td>
                  <td style={{ 
                    padding: '14px 16px', 
                    textAlign: 'right',
                    color: '#059669',
                    fontSize: '14px'
                  }}>
                    {formatCurrencyBRL(totalEntradas)}
                  </td>
                  <td style={{ 
                    padding: '14px 16px', 
                    textAlign: 'right',
                    color: '#dc2626',
                    fontSize: '14px'
                  }}>
                    {formatCurrencyBRL(totalSaidas)}
                  </td>
                  <td style={{ 
                    padding: '14px 16px', 
                    textAlign: 'right',
                    color: totalLiquido >= 0 ? '#1555D6' : '#dc2626',
                    fontSize: '15px'
                  }}>
                    {formatCurrencyBRL(totalLiquido)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CARD 2: Gráfico - Entradas e Saídas por Classificação (SEGUNDO) */}
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
          Entradas e Saídas por Classificação
        </h2>

        {dadosGrafico.length === 0 ? (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '14px'
          }}>
            Sem dados para exibir
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={500}>
            <BarChart data={dadosGrafico} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                type="number"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                tickFormatter={(value) => formatCurrencyBRL(value)}
              />
              <YAxis 
                type="category"
                dataKey="classificacao"
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                width={150}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ fontSize: '13px', paddingTop: '16px' }}
                formatter={(value) => value === 'entradas' ? 'Entradas' : 'Saídas'}
              />
              <Bar 
                dataKey="entradas" 
                fill="#10b981" 
                radius={[0, 8, 8, 0]}
                name="entradas"
              />
              <Bar 
                dataKey="saidas" 
                fill="#ef4444" 
                radius={[0, 8, 8, 0]}
                name="saidas"
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