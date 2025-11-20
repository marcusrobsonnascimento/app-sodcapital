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
  const [contrapartes, setContrapartes] = useState<Array<{ id: string, nome: string }>>([])
  const [dadosClassificacao, setDadosClassificacao] = useState<ClassificacaoAgrupada[]>([])
  const [hierarquia, setHierarquia] = useState<NoHierarquico[]>([])
  const [nosExpandidos, setNosExpandidos] = useState<Set<string>>(new Set())
  const [lancamentosExpandidos, setLancamentosExpandidos] = useState<Set<string>>(new Set())
  
  // Estado para controlar tooltip do gráfico
  const [barraAtiva, setBarraAtiva] = useState<'entradas' | 'saidas' | null>(null)
  
  // Filtros
  const [presetSelecionado, setPresetSelecionado] = useState<string>('ano_atual')
  const [dataInicial, setDataInicial] = useState<string>('')
  const [dataFinal, setDataFinal] = useState<string>('')
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string>('')
  const [projetoSelecionado, setProjetoSelecionado] = useState<string>('')
  const [subprojetoSelecionado, setSubprojetoSelecionado] = useState<string>('')
  const [bancoContaSelecionada, setBancoContaSelecionada] = useState<string>('')
  const [contraparteSelecionada, setContraparteSelecionada] = useState<string>('')
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
    const contraparte = searchParams.get('contraparte')
    
    if (preset) setPresetSelecionado(preset)
    if (inicio) setDataInicial(inicio)
    if (fim) setDataFinal(fim)
    if (empresa) setEmpresaSelecionada(empresa)
    if (projeto) setProjetoSelecionado(projeto)
    if (subprojeto) setSubprojetoSelecionado(subprojeto)
    if (banco) setBancoContaSelecionada(banco)
    if (contraparte) setContraparteSelecionada(contraparte)
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
            plano_conta_id,
            documento_numero
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

        // Filtrar por contraparte
        if (contraparteSelecionada) {
          query = query.eq('contraparte_id', contraparteSelecionada)
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
      
      // Extrair IDs únicos de contrapartes dos lançamentos
      const contrapartesIdsUnicos = Array.from(new Set(
        lancamentos
          .map(l => l.contraparte_id)
          .filter(id => id != null)
      ))
      
      // Buscar apenas as contrapartes que aparecem nos lançamentos
      let contrapartesFiltradas: Array<{ id: string, nome: string }> = []
      if (contrapartesIdsUnicos.length > 0) {
        const { data: contrapartesData } = await supabase
          .from('contrapartes')
          .select('id, nome')
          .in('id', contrapartesIdsUnicos)
          .order('nome', { ascending: true })
        
        contrapartesFiltradas = contrapartesData || []
      }
      
      setContrapartes(contrapartesFiltradas)
      
      // Buscar todas as contrapartes para uso na hierarquia
      const { data: todasContrapartes } = await supabase.from('contrapartes').select('id, nome')
      
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
        const contraparte = todasContrapartes?.find(c => c.id === lanc.contraparte_id)
        
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
      
      // Calcular líquido baseado em se há projeto selecionado
      if (projetoSelecionado) {
        // Se projeto selecionado: apenas Entradas - Saídas  
        setTotalLiquido(entradas - saidas)
      } else {
        // Sem projeto: Saldo Inicial + Entradas - Saídas
        setTotalLiquido(saldoInicial + entradas - saidas)
      }

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

  const aplicarFiltros = async () => {
    // Validar datas
    if (!dataInicial || !dataFinal) {
      showToast('Informe a data inicial e final', 'warning')
      return
    }

    if (new Date(dataFinal) < new Date(dataInicial)) {
      showToast('Data final deve ser maior ou igual à data inicial', 'warning')
      return
    }
    
    // Evitar múltiplos cliques
    if (loading) return
    
    // Apenas carregar dados sem alterar URL ou causar navegação
    await loadDadosRealizados()
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
    setContraparteSelecionada('')
    
    router.push('/relatorios/fluxorealizado/realizado')
    loadDadosRealizados()
  }

  const formatarNumeroBR = (valor: number): string => {
    return valor.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  const exportarXLSX = () => {
    try {
      const achatarHierarquia = (no: NoHierarquico, rows: string[][]): void => {
        const indentacao = '  '.repeat(no.nivel - 1)
        rows.push([
          `${indentacao}${no.nome}`,
          no.nivel.toString(),
          formatarNumeroBR(no.entradas),
          formatarNumeroBR(no.saidas),
          formatarNumeroBR(no.liquido)
        ])
        
        no.filhos.forEach(filho => achatarHierarquia(filho, rows))
      }

      const rows: string[][] = []
      hierarquia.forEach(no => achatarHierarquia(no, rows))

      // Criar HTML table para Excel com encoding UTF-8
      let htmlTable = '<html xmlns:x="urn:schemas-microsoft-com:office:excel">'
      htmlTable += '<head>'
      htmlTable += '<meta charset="UTF-8">'
      htmlTable += '<xml>'
      htmlTable += '<x:ExcelWorkbook>'
      htmlTable += '<x:ExcelWorksheets>'
      htmlTable += '<x:ExcelWorksheet>'
      htmlTable += '<x:Name>Fluxo de Caixa</x:Name>'
      htmlTable += '<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>'
      htmlTable += '</x:ExcelWorksheet>'
      htmlTable += '</x:ExcelWorksheets>'
      htmlTable += '</x:ExcelWorkbook>'
      htmlTable += '</xml>'
      htmlTable += '</head>'
      htmlTable += '<body>'
      htmlTable += '<table border="1">'
      
      // Header
      htmlTable += '<thead><tr style="background-color: #f0f0f0; font-weight: bold;">'
      htmlTable += '<th style="text-align: left; padding: 8px;">Rótulo de Linha</th>'
      htmlTable += '<th style="text-align: center; padding: 8px;">Nível</th>'
      htmlTable += '<th style="text-align: right; padding: 8px;">Entradas</th>'
      htmlTable += '<th style="text-align: right; padding: 8px;">Saídas</th>'
      htmlTable += '<th style="text-align: right; padding: 8px;">Líquido</th>'
      htmlTable += '</tr></thead>'
      
      // Body
      htmlTable += '<tbody>'
      rows.forEach(row => {
        htmlTable += '<tr>'
        htmlTable += `<td style="text-align: left; padding: 5px;">${row[0]}</td>`
        htmlTable += `<td style="text-align: center; padding: 5px;">${row[1]}</td>`
        htmlTable += `<td style="text-align: right; padding: 5px;">${row[2]}</td>`
        htmlTable += `<td style="text-align: right; padding: 5px;">${row[3]}</td>`
        htmlTable += `<td style="text-align: right; padding: 5px;">${row[4]}</td>`
        htmlTable += '</tr>'
      })
      htmlTable += '</tbody></table>'
      htmlTable += '</body></html>'

      // Criar blob com BOM para UTF-8
      const BOM = '\uFEFF'
      const blob = new Blob([BOM + htmlTable], { 
        type: 'application/vnd.ms-excel;charset=utf-8' 
      })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `FluxoCaixaRealizado_${dataInicial}_${dataFinal}.xls`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(link.href)

      showToast('Excel exportado com sucesso!', 'success')
    } catch (err) {
      console.error('Erro ao exportar Excel:', err)
      showToast('Erro ao exportar Excel', 'error')
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

  // Tooltip customizado para mostrar informações diferentes por barra
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) {
      return null
    }
    
    const data = payload[0].payload
    const classificacao = data.classificacao
    const entradas = data.entradas || 0
    const saidas = data.saidas || 0
    const liquido = entradas - saidas
    
    // Mouse sobre a barra VERDE (entradas)
    if (barraAtiva === 'entradas') {
      return (
        <div style={{
          backgroundColor: 'white',
          border: '3px solid #10b981',
          borderRadius: '8px',
          padding: '12px 16px',
          fontSize: '13px',
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
        }}>
          <p style={{ fontWeight: '700', marginBottom: '6px', color: '#374151', fontSize: '12px' }}>
            {classificacao}
          </p>
          <p style={{ color: '#10b981', margin: '0', fontWeight: '700', fontSize: '15px' }}>
            Entradas: {formatCurrencyBRL(entradas)}
          </p>
        </div>
      )
    }
    
    // Mouse sobre a barra VERMELHA (saídas)
    if (barraAtiva === 'saidas') {
      return (
        <div style={{
          backgroundColor: 'white',
          border: '3px solid #ef4444',
          borderRadius: '8px',
          padding: '12px 16px',
          fontSize: '13px',
          boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
        }}>
          <p style={{ fontWeight: '700', marginBottom: '6px', color: '#374151', fontSize: '12px' }}>
            {classificacao}
          </p>
          <p style={{ color: '#ef4444', margin: '0', fontWeight: '700', fontSize: '15px' }}>
            Saídas: {formatCurrencyBRL(saidas)}
          </p>
        </div>
      )
    }
    
    // Mouse na área CINZA ou sem barra específica - mostrar TUDO
    return (
      <div style={{
        backgroundColor: 'white',
        border: '3px solid #9ca3af',
        borderRadius: '8px',
        padding: '12px 16px',
        fontSize: '13px',
        boxShadow: '0 4px 12px rgba(156, 163, 175, 0.3)'
      }}>
        <p style={{ fontWeight: '700', marginBottom: '10px', color: '#374151', fontSize: '13px' }}>
          {classificacao}
        </p>
        <p style={{ color: '#10b981', margin: '0 0 6px 0', fontSize: '13px', fontWeight: '600' }}>
          Entradas: {formatCurrencyBRL(entradas)}
        </p>
        <p style={{ color: '#ef4444', margin: '0 0 8px 0', fontSize: '13px', fontWeight: '600' }}>
          Saídas: {formatCurrencyBRL(saidas)}
        </p>
        <p style={{ 
          color: liquido >= 0 ? '#1555D6' : '#ef4444', 
          margin: '0',
          fontWeight: '700',
          borderTop: '2px solid #e5e7eb',
          paddingTop: '8px',
          fontSize: '14px'
        }}>
          Resultado Líquido: {formatCurrencyBRL(liquido)}
        </p>
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
            Fluxo de Caixa Realizado
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280' }}>
            Entradas e saídas efetivadas (Pagos/Recebidos)
          </p>
        </div>

        <button
          type="button"
          onClick={exportarXLSX}
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
          onMouseEnter={(e) => hierarquia.length > 0 && (e.currentTarget.style.backgroundColor = '#059669')}
          onMouseLeave={(e) => hierarquia.length > 0 && (e.currentTarget.style.backgroundColor = '#10b981')}
        >
          <Download size={18} />
          Exportar Excel
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
                type="button"
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
                onMouseEnter={(e) => {
                  if (presetSelecionado !== preset.label.toLowerCase().replace(/\s/g, '_')) {
                    e.currentTarget.style.backgroundColor = '#f3f4f6'
                  }
                }}
                onMouseLeave={(e) => {
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

          {/* Contraparte */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Contraparte
            </label>
            <select
              value={contraparteSelecionada}
              onChange={(e) => setContraparteSelecionada(e.target.value)}
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
              <option value="">Todas</option>
              {contrapartes.map(cp => (
                <option key={cp.id} value={cp.id}>
                  {cp.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!loading) {
                aplicarFiltros()
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (!loading) {
                  aplicarFiltros()
                }
              }
            }}
            style={{
              padding: '10px 24px',
              backgroundColor: loading ? '#9ca3af' : '#1555D6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: loading ? 0.6 : 1,
              userSelect: 'none',
              pointerEvents: loading ? 'none' : 'auto'
            }}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#1044b5')}
            onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#1555D6')}
          >
            {loading ? 'Carregando...' : 'Aplicar'}
          </div>
          
          <button
            type="button"
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
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
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
        {!projetoSelecionado && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            borderTop: '4px solid #6366f1'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: '500', color: '#6b7280' }}>
                Saldo Bancário Inicial
              </span>
              <DollarSign size={20} color="#6366f1" />
            </div>
            <p style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: '8px 0' }}>
              {formatCurrencyBRL(saldoBancarioInicial)}
            </p>
          </div>
        )}

        {/* Total Entradas */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderTop: '4px solid #10b981'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '500', color: '#6b7280' }}>
              Total de Entradas
            </span>
            <ArrowUpCircle size={20} color="#10b981" />
          </div>
          <p style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: '8px 0' }}>
            {formatCurrencyBRL(totalEntradas)}
          </p>
        </div>

        {/* Total Saídas */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderTop: '4px solid #ef4444'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '500', color: '#6b7280' }}>
              Total de Saídas
            </span>
            <ArrowDownCircle size={20} color="#ef4444" />
          </div>
          <p style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: '8px 0' }}>
            {formatCurrencyBRL(totalSaidas)}
          </p>
        </div>

        {/* Resultado Líquido */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          borderTop: `4px solid ${totalLiquido >= 0 ? '#1555D6' : '#ef4444'}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '500', color: '#6b7280' }}>
              {projetoSelecionado ? 'Resultado Líquido' : 'Saldo Final'}
            </span>
            <Receipt size={20} color={totalLiquido >= 0 ? '#1555D6' : '#ef4444'} />
          </div>
          <p style={{ 
            fontSize: '24px', 
            fontWeight: '700', 
            color: totalLiquido >= 0 ? '#1555D6' : '#ef4444',
            margin: '8px 0' 
          }}>
            {formatCurrencyBRL(totalLiquido)}
          </p>
          {!projetoSelecionado && (
            <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
              Saldo Inicial + Entradas - Saídas
            </p>
          )}
        </div>
      </div>

      {/* CARD 1: Tabela Hierárquica (PRIMEIRO) */}
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
          Detalhamento por {tipoAgrupamento === 'classificacao' ? 'Classificação' : 'Tipo de Fluxo'}
        </h2>

        {hierarquia.length === 0 ? (
          <div style={{
            padding: '48px',
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '14px'
          }}>
            Nenhum dado encontrado para o período selecionado
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px'
            }}>
              <thead>
                <tr style={{ 
                  backgroundColor: '#f9fafb',
                  borderBottom: '2px solid #e5e7eb'
                }}>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left',
                    fontWeight: '600',
                    color: '#374151'
                  }}>
                    Rótulo de Linha
                  </th>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'right',
                    fontWeight: '600',
                    color: '#374151'
                  }}>
                    Entradas
                  </th>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'right',
                    fontWeight: '600',
                    color: '#374151'
                  }}>
                    Saídas
                  </th>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'right',
                    fontWeight: '600',
                    color: '#374151'
                  }}>
                    Líquido
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const renderizarNo = (no: NoHierarquico, idx: number, totalNos: number): React.ReactElement[] => {
                    const chave = `${no.nome}-${no.nivel}`
                    const expandido = nosExpandidos.has(chave)
                    const temFilhos = no.filhos.length > 0
                    const temLancamentos = no.lancamentos && no.lancamentos.length > 0
                    const lancamentosVisiveis = lancamentosExpandidos.has(chave)
                    
                    // Cores por nível
                    const coresNivel = {
                      1: { bg: '#f0f9ff', text: '#1e40af', border: '#bfdbfe' },
                      2: { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
                      3: { bg: '#fce7f3', text: '#831843', border: '#fbcfe8' },
                      4: { bg: '#f3e8ff', text: '#6b21a8', border: '#e9d5ff' }
                    }
                    
                    const cor = coresNivel[no.nivel as keyof typeof coresNivel] || coresNivel[1]
                    const indentacao = no.nivel * 20
                    
                    const elementos: React.ReactElement[] = []
                    
                    // Linha principal do nó
                    elementos.push(
                      <tr 
                        key={chave}
                        style={{ 
                          backgroundColor: cor.bg,
                          borderLeft: `4px solid ${cor.border}`,
                          borderBottom: idx === totalNos - 1 && !expandido ? 'none' : '1px solid #f3f4f6',
                          cursor: temFilhos || temLancamentos ? 'pointer' : 'default'
                        }}
                        onClick={() => {
                          if (temFilhos) toggleNo(chave)
                          else if (temLancamentos) toggleLancamentos(chave)
                        }}
                      >
                        <td style={{ 
                          padding: '12px 16px', 
                          paddingLeft: `${16 + indentacao}px`,
                          fontWeight: no.nivel === 1 ? '700' : no.nivel === 2 ? '600' : '500',
                          color: cor.text,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          {(temFilhos || temLancamentos) && (
                            expandido || lancamentosVisiveis ? 
                              <ChevronDown size={16} color={cor.text} /> : 
                              <ChevronRight size={16} color={cor.text} />
                          )}
                          {no.nome}
                          {temLancamentos && (
                            <span style={{
                              backgroundColor: '#e0e7ff',
                              color: '#4338ca',
                              padding: '2px 6px',
                              borderRadius: '10px',
                              fontSize: '11px',
                              fontWeight: '500',
                              marginLeft: '6px'
                            }}>
                              {no.lancamentos?.length}
                            </span>
                          )}
                        </td>
                        <td style={{ 
                          padding: '12px 16px', 
                          textAlign: 'right',
                          color: '#059669',
                          fontWeight: no.nivel <= 2 ? '600' : '500'
                        }}>
                          {formatCurrencyBRL(no.entradas)}
                        </td>
                        <td style={{ 
                          padding: '12px 16px', 
                          textAlign: 'right',
                          color: '#dc2626',
                          fontWeight: no.nivel <= 2 ? '600' : '500'
                        }}>
                          {formatCurrencyBRL(no.saidas)}
                        </td>
                        <td style={{ 
                          padding: '12px 16px', 
                          textAlign: 'right',
                          color: no.liquido >= 0 ? '#1555D6' : '#dc2626',
                          fontWeight: no.nivel <= 2 ? '700' : '600'
                        }}>
                          {formatCurrencyBRL(no.liquido)}
                        </td>
                      </tr>
                    )
                    
                    // Renderizar filhos se expandido
                    if (expandido && temFilhos) {
                      no.filhos.forEach((filho, filhoIdx) => {
                        elementos.push(...renderizarNo(filho, filhoIdx, no.filhos.length))
                      })
                    }
                    
                    // Renderizar lançamentos se visível
                    if (lancamentosVisiveis && temLancamentos && no.lancamentos) {
                      // Ordenar lançamentos por data
                      const lancamentosOrdenados = [...no.lancamentos].sort((a, b) => {
                        return new Date(b.data_liquidacao).getTime() - new Date(a.data_liquidacao).getTime()
                      })
                      
                      lancamentosOrdenados.forEach((lanc, lancIdx) => {
                        elementos.push(
                          <tr 
                            key={`${chave}-lanc-${lancIdx}`}
                            style={{ 
                              backgroundColor: '#fafafa',
                              borderLeft: '4px solid #e5e7eb'
                            }}
                          >
                            <td style={{ 
                              padding: '10px 16px', 
                              paddingLeft: `${36 + indentacao}px`,
                              borderBottom: '1px solid #f3f4f6'
                            }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '8px',
                                  fontSize: '12px',
                                  fontWeight: '500',
                                  color: '#374151'
                                }}>
                                  <span>{formatDateBR(lanc.data_liquidacao)}</span>
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
            <BarChart 
              data={dadosGrafico} 
              layout="vertical"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              barGap={8}
              barCategoryGap="15%"
            >
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
              <Tooltip 
                content={<CustomTooltip />}
                cursor={false}
                isAnimationActive={false}
                allowEscapeViewBox={{ x: true, y: true }}
              />
              <Legend 
                wrapperStyle={{ fontSize: '13px', paddingTop: '16px' }}
                formatter={(value) => value === 'entradas' ? 'Entradas' : 'Saídas'}
              />
              <Bar 
                dataKey="entradas" 
                fill="#10b981" 
                radius={[0, 8, 8, 0]}
                name="entradas"
                barSize={20}
                onMouseEnter={() => setBarraAtiva('entradas')}
                onMouseLeave={() => setBarraAtiva(null)}
              />
              <Bar 
                dataKey="saidas" 
                fill="#ef4444" 
                radius={[0, 8, 8, 0]}
                name="saidas"
                barSize={20}
                onMouseEnter={() => setBarraAtiva('saidas')}
                onMouseLeave={() => setBarraAtiva(null)}
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