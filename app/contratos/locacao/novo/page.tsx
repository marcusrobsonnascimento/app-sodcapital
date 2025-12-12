'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { usePanels } from '@/contexts/PanelContext'
import { 
  Upload, 
  FileText, 
  Building2, 
  Users, 
  MapPin, 
  Shield, 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft, 
  X, 
  Loader2, 
  Calendar,
  DollarSign,
  Percent,
  Clock,
  AlertCircle,
  Plus,
  Trash2,
  Search,
  FileSearch,
  BrainCircuit,
  Zap,
  Eye,
  Printer,
  ChevronDown
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface Empresa {
  id: string
  nome: string
  cnpj: string | null
}

interface Contraparte {
  id: string
  nome: string
  apelido: string | null
  documento: string | null
  pessoa: 'PF' | 'PJ'
}

interface Projeto {
  id: string
  nome: string
  empresa_id: string
  projeto_pai_id?: string
}

interface Subprojeto {
  id: string
  nome: string
  empresa_id: string
  projeto_pai_id: string
}

interface BancoConta {
  id: string
  empresa_id: string
  banco_codigo: string
  banco_nome: string
  agencia: string
  numero_conta: string
  tipo_conta: string
}

interface PlanoContas {
  id: string
  codigo_conta: string
  tipo_fluxo: string
  grupo: string
  categoria: string
  subcategoria: string
  sentido: 'Entrada' | 'Saida'
  classificacao?: string
}

interface ContratoFormData {
  // Dados Gerais
  numero_contrato: string
  tipo_contrato: 'BTS' | 'TIPICO' | 'ATIPICO'
  objeto: string
  data_assinatura: string
  data_inicio_vigencia: string
  data_fim_vigencia: string
  prazo_meses: number
  total_parcelas: number
  
  // Renovação
  renovacao_automatica: boolean
  prazo_renovacao_meses: number
  prazo_notificacao_dias: number
  
  // Valores
  valor_aluguel: number
  tipo_valor: 'FIXO' | 'PERCENTUAL' | 'MAIOR_ENTRE'
  percentual_faturamento: number
  
  // Reajuste
  indice_reajuste: 'IPCA' | 'IGPM' | 'INCC'
  periodicidade_reajuste: number
  data_base_reajuste: string
  
  // Pagamento
  dia_vencimento: number
  dia_util: boolean
  
  // Vínculos
  empresa_id: string
  contraparte_id: string
  projeto_id: string
  
  // Contábil e Projeto (NOVO)
  subprojeto_id: string
  banco_conta_id: string
  plano_conta_id: string
  forma_recebimento: 'BOLETO' | 'PIX' | 'DEPOSITO_CONTA'
  
  // Status
  status: 'MINUTA' | 'ASSINADO' | 'VIGENTE' | 'ENCERRADO' | 'RESCINDIDO'
  observacoes: string
}

interface Parte {
  id: string
  tipo_parte: 'LOCADOR' | 'LOCATARIO' | 'FIADOR' | 'INTERVENIENTE'
  empresa_id: string | null
  contraparte_id: string | null
  nome: string
  documento: string
  quota_percentual: number
  representante_nome: string
  representante_cpf: string
  representante_email: string
  principal: boolean
}

interface Imovel {
  endereco_completo: string
  municipio: string
  uf: string
  cep: string
  area_terreno_m2: number
  area_construida_m2: number
  matricula_ri: string
  cartorio: string
  inscricao_iptu: string
  descricao: string
}

interface Garantia {
  id: string
  tipo_garantia: 'FIANCA' | 'CAUCAO' | 'ALIENACAO_FIDUCIARIA' | 'SEGURO_FIANCA' | 'CONTA_CUSTODIA'
  valor: number
  data_inicio: string
  data_fim: string
  fiador_nome: string
  descricao: string
}

interface AnaliseIA {
  tipo_contrato: string
  numero_contrato: string | null
  data_assinatura: string | null
  data_inicio_vigencia: string | null
  data_fim_vigencia: string | null
  prazo_meses: number | null
  valor_aluguel: number | null
  tipo_valor: string
  percentual_faturamento: number | null
  indice_reajuste: string
  periodicidade_reajuste: number
  dia_vencimento: number
  renovacao_automatica: boolean
  prazo_renovacao_meses: number | null
  prazo_notificacao_dias: number | null
  partes: Array<{
    tipo: string
    nome: string
    documento: string
    quota_percentual: number
    representante_nome: string | null
    representante_cpf: string | null
  }>
  imovel: {
    endereco_completo: string | null
    municipio: string | null
    uf: string | null
    area_terreno_m2: number | null
    area_construida_m2: number | null
    matricula_ri: string | null
  }
  garantias: Array<{
    tipo: string
    valor: number
    descricao: string
  }>
  objeto: string | null
}

// Interface para o job de análise
interface AnaliseJob {
  id: string
  status: 'UPLOAD_RECEBIDO' | 'EXTRAINDO_TEXTO' | 'TEXTO_EXTRAIDO' | 'ANALISANDO_IA' | 'CONCLUIDO' | 'ERRO'
  etapa_atual: number
  total_etapas: number
  mensagem: string | null
  dados_extraidos: AnaliseIA | null
  confianca_analise: number | null
  erro_mensagem: string | null
}

// ============================================================================
// HELPERS
// ============================================================================

const formatCurrencyBRL = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

const formatCurrencyInput = (value: string): string => {
  const numbers = value.replace(/\D/g, '')
  if (!numbers) return ''
  const amount = parseInt(numbers, 10) / 100
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

const parseCurrencyInput = (value: string): number => {
  if (!value) return 0
  const cleaned = value.replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

const formatDateForInput = (date: string | null): string => {
  if (!date) return ''
  // Tenta converter formatos como "09/06/2021" para "2021-06-09"
  if (date.includes('/')) {
    const parts = date.split('/')
    if (parts.length === 3) {
      const [day, month, year] = parts
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }
  }
  return date.split('T')[0]
}

const generateId = () => Math.random().toString(36).substr(2, 9)

// Converter valor string para número (ex: "155.000,00" -> 155000)
const parseValorBrasileiro = (valor: string | number | null): number => {
  if (!valor) return 0
  if (typeof valor === 'number') return valor
  // Remove pontos de milhar e troca vírgula por ponto
  const cleaned = valor.replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TIPOS_CONTRATO = [
  { value: 'BTS', label: 'Built-to-Suit (BTS)', desc: 'Construção sob medida para o locatário' },
  { value: 'TIPICO', label: 'Locação Típica', desc: 'Contrato padrão Lei 8.245/91' },
  { value: 'ATIPICO', label: 'Locação Atípica', desc: 'Contrato com cláusulas especiais' }
]

const TIPOS_VALOR = [
  { value: 'FIXO', label: 'Valor Fixo', desc: 'Aluguel mensal fixo' },
  { value: 'PERCENTUAL', label: 'Percentual', desc: 'Baseado no faturamento' },
  { value: 'MAIOR_ENTRE', label: 'Maior Entre', desc: 'Mínimo garantido ou % faturamento' }
]

const INDICES_REAJUSTE = [
  { value: 'IPCA', label: 'IPCA', desc: 'Índice de Preços ao Consumidor Amplo' },
  { value: 'IGPM', label: 'IGP-M', desc: 'Índice Geral de Preços do Mercado' },
  { value: 'INCC', label: 'INCC', desc: 'Índice Nacional de Custo da Construção' }
]

const TIPOS_PARTE = [
  { value: 'LOCADOR', label: 'Locador', color: '#3b82f6' },
  { value: 'LOCATARIO', label: 'Locatário', color: '#10b981' },
  { value: 'FIADOR', label: 'Fiador', color: '#f59e0b' },
  { value: 'INTERVENIENTE', label: 'Interveniente', color: '#8b5cf6' }
]

const TIPOS_GARANTIA = [
  { value: 'FIANCA', label: 'Fiança', icon: '🤝' },
  { value: 'CAUCAO', label: 'Caução', icon: '💰' },
  { value: 'ALIENACAO_FIDUCIARIA', label: 'Alienação Fiduciária', icon: '🏠' },
  { value: 'SEGURO_FIANCA', label: 'Seguro Fiança', icon: '🛡️' },
  { value: 'CONTA_CUSTODIA', label: 'Conta Custódia', icon: '🏦' }
]

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

const WIZARD_STEPS = [
  { id: 1, title: 'Upload', subtitle: 'Contrato PDF', icon: Upload },
  { id: 2, title: 'Dados Gerais', subtitle: 'Informações básicas', icon: FileText },
  { id: 3, title: 'Partes', subtitle: 'Locadores e locatários', icon: Users },
  { id: 4, title: 'Imóvel', subtitle: 'Localização e garantias', icon: MapPin },
  { id: 5, title: 'Contábil', subtitle: 'Projeto e categorias', icon: DollarSign },
  { id: 6, title: 'Revisão', subtitle: 'Confirmar e salvar', icon: CheckCircle2 }
]

// Etapas da análise para exibição no modal
const ANALYSIS_STEPS = [
  { id: 1, status: 'UPLOAD_RECEBIDO', label: 'Upload recebido', icon: Upload },
  { id: 2, status: 'EXTRAINDO_TEXTO', label: 'Extraindo texto do PDF', icon: FileSearch },
  { id: 3, status: 'TEXTO_EXTRAIDO', label: 'Texto extraído', icon: FileText },
  { id: 4, status: 'ANALISANDO_IA', label: 'Analisando com IA', icon: BrainCircuit },
  { id: 5, status: 'CONCLUIDO', label: 'Análise concluída', icon: CheckCircle2 }
]

// ============================================================================
// COMPONENT
// ============================================================================

export default function NovoContratoLocacaoPage() {
  const { openPanel } = usePanels()
  
  // Wizard State
  const [currentStep, setCurrentStep] = useState(1)
  const [isTransitioning, setIsTransitioning] = useState(false)
  
  // Data States
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [contrapartes, setContrapartes] = useState<Contraparte[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Upload State
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisComplete, setAnalysisComplete] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Job Polling State - NOVO
  const [currentJob, setCurrentJob] = useState<AnaliseJob | null>(null)
  const [showProgressModal, setShowProgressModal] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // Form Data
  const [formData, setFormData] = useState<ContratoFormData>({
    numero_contrato: '',
    tipo_contrato: 'TIPICO',
    objeto: '',
    data_assinatura: '',
    data_inicio_vigencia: '',
    data_fim_vigencia: '',
    prazo_meses: 12,
    total_parcelas: 12,
    renovacao_automatica: false,
    prazo_renovacao_meses: 12,
    prazo_notificacao_dias: 90,
    valor_aluguel: 0,
    tipo_valor: 'FIXO',
    percentual_faturamento: 0,
    indice_reajuste: 'IPCA',
    periodicidade_reajuste: 12,
    data_base_reajuste: '',
    dia_vencimento: 10,
    dia_util: true,
    empresa_id: '',
    contraparte_id: '',
    projeto_id: '',
    subprojeto_id: '',
    banco_conta_id: '',
    plano_conta_id: '',
    forma_recebimento: 'BOLETO',
    status: 'VIGENTE',
    observacoes: ''
  })
  
  const [valorAluguelFormatado, setValorAluguelFormatado] = useState('')
  const [partes, setPartes] = useState<Parte[]>([])
  const [imovel, setImovel] = useState<Imovel>({
    endereco_completo: '',
    municipio: '',
    uf: '',
    cep: '',
    area_terreno_m2: 0,
    area_construida_m2: 0,
    matricula_ri: '',
    cartorio: '',
    inscricao_iptu: '',
    descricao: ''
  })
  const [garantias, setGarantias] = useState<Garantia[]>([])
  
  // Toast State
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error' | 'warning' }>>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)
  
  // Search states for dropdowns
  const [searchEmpresa, setSearchEmpresa] = useState('')
  const [searchContraparte, setSearchContraparte] = useState('')
  const [showEmpresaDropdown, setShowEmpresaDropdown] = useState(false)
  const [showContraparteDropdown, setShowContraparteDropdown] = useState(false)
  
  // Ficha/Preview Modal
  const [showFichaModal, setShowFichaModal] = useState(false)
  const fichaRef = useRef<HTMLDivElement>(null)
  
  // Loading states para dados grandes
  const [loadingEmpresas, setLoadingEmpresas] = useState(false)
  const [loadingContrapartes, setLoadingContrapartes] = useState(false)
  
  // Estados para aba Contábil e Projeto
  const [subprojetos, setSubprojetos] = useState<Subprojeto[]>([])
  const [bancosContas, setBancosContas] = useState<BancoConta[]>([])
  const [planoContas, setPlanoContas] = useState<PlanoContas[]>([])
  const [gruposUnicos, setGruposUnicos] = useState<string[]>([])
  const [categoriasDisponiveis, setCategoriasDisponiveis] = useState<string[]>([])
  const [subcategoriasDisponiveis, setSubcategoriasDisponiveis] = useState<string[]>([])
  const [selectedGrupo, setSelectedGrupo] = useState('')
  const [selectedCategoria, setSelectedCategoria] = useState('')
  const [selectedSubcategoria, setSelectedSubcategoria] = useState('')

  // ============================================================================
  // EFFECTS
  // ============================================================================
  
  useEffect(() => {
    loadInitialData()
    
    // Cleanup polling on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [])
  
  useEffect(() => {
    // Auto-calculate total_parcelas based on prazo_meses
    setFormData(prev => ({
      ...prev,
      total_parcelas: prev.prazo_meses
    }))
  }, [formData.prazo_meses])

  // ============================================================================
  // DATA LOADING
  // ============================================================================
  
  // Função para buscar todos os registros com paginação
  const fetchAllRecords = async (
    table: string, 
    selectFields: string, 
    filters: { column: string; value: any }[] = [],
    orderBy: string = 'nome'
  ) => {
    const PAGE_SIZE = 1000
    let allData: any[] = []
    let page = 0
    let hasMore = true
    
    while (hasMore) {
      let query = supabase
        .from(table)
        .select(selectFields)
        .order(orderBy)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      
      // Aplicar filtros
      filters.forEach(filter => {
        query = query.eq(filter.column, filter.value)
      })
      
      const { data, error } = await query
      
      if (error) throw error
      
      if (data && data.length > 0) {
        allData = [...allData, ...data]
        hasMore = data.length === PAGE_SIZE
        page++
      } else {
        hasMore = false
      }
    }
    
    return allData
  }
  
  const loadInitialData = async () => {
    try {
      setLoading(true)
      setLoadingEmpresas(true)
      setLoadingContrapartes(true)
      
      // Carregar empresas
      const empresasData = await fetchAllRecords(
        'empresas', 
        'id, nome, cnpj',
        [{ column: 'ativo', value: true }]
      )
      setEmpresas(empresasData)
      setLoadingEmpresas(false)
      
      // Carregar contrapartes
      const contrapartesData = await fetchAllRecords(
        'contrapartes',
        'id, nome, apelido, documento, pessoa',
        [{ column: 'ativo', value: true }]
      )
      setContrapartes(contrapartesData)
      setLoadingContrapartes(false)
      
      // Carregar projetos
      const projetosData = await fetchAllRecords(
        'projetos',
        'id, nome, empresa_id, projeto_pai_id',
        [{ column: 'ativo', value: true }]
      )
      setProjetos(projetosData.filter((p: Projeto) => !p.projeto_pai_id))
      setSubprojetos(projetosData.filter((p: Projeto) => p.projeto_pai_id))
      
      // Carregar contas bancárias (apenas tipo CC) com dados do banco
      const bancosContasData = await fetchAllRecords(
        'bancos_contas',
        'id, empresa_id, agencia, numero_conta, tipo_conta, bancos(codigo, nome)',
        [{ column: 'ativo', value: true }, { column: 'tipo_conta', value: 'CC' }],
        'agencia'
      )
      // Mapear para formato esperado
      const contasMapeadas = bancosContasData.map((c: any) => ({
        id: c.id,
        empresa_id: c.empresa_id,
        banco_codigo: c.bancos?.codigo || c.banco_codigo || '---',
        banco_nome: c.bancos?.nome || c.banco_nome || 'Banco',
        agencia: c.agencia,
        numero_conta: c.numero_conta,
        tipo_conta: c.tipo_conta
      }))
      setBancosContas(contasMapeadas)
      
      // Carregar plano de contas (apenas Entradas)
      const planoContasData = await fetchAllRecords(
        'plano_contas_fluxo',
        'id, codigo_conta, tipo_fluxo, grupo, categoria, subcategoria, sentido, classificacao',
        [{ column: 'ativo', value: true }, { column: 'sentido', value: 'Entrada' }],
        'grupo'
      )
      setPlanoContas(planoContasData)
      
      const grupos = Array.from(new Set(planoContasData.map((p: PlanoContas) => p.grupo))).sort()
      setGruposUnicos(grupos)
      
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
      showToast('Erro ao carregar dados iniciais', 'error')
    } finally {
      setLoading(false)
      setLoadingEmpresas(false)
      setLoadingContrapartes(false)
    }
  }

  // ============================================================================
  // TOAST
  // ============================================================================
  
  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    const id = toastIdCounter
    setToastIdCounter(prev => prev + 1)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }

  // ============================================================================
  // FILE UPLOAD
  // ============================================================================
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (file.type === 'application/pdf') {
        setUploadedFile(file)
        setAnalysisComplete(false)
        setAnalysisError(null)
        setCurrentJob(null)
      } else {
        showToast('Por favor, envie apenas arquivos PDF', 'error')
      }
    }
  }, [])
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const file = files[0]
      if (file.type === 'application/pdf') {
        setUploadedFile(file)
        setAnalysisComplete(false)
        setAnalysisError(null)
        setCurrentJob(null)
      } else {
        showToast('Por favor, envie apenas arquivos PDF', 'error')
      }
    }
  }

  // ============================================================================
  // AI ANALYSIS WITH POLLING - MODIFICADO
  // ============================================================================
  
  const pollJobStatus = async (jobId: string) => {
    try {
      const { data, error } = await supabase
        .schema('sodcapital')
        .from('analise_contratos_jobs')
        .select('*')
        .eq('id', jobId)
        .single()
      
      if (error) throw error
      
      if (data) {
        setCurrentJob(data as AnaliseJob)
        
        // Check if job is complete or has error
        if (data.status === 'CONCLUIDO' && data.dados_extraidos) {
          // Stop polling
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
          
          // Parse dados_extraidos if it's a string (N8N may save as string)
          let dadosExtraidos = data.dados_extraidos
          if (typeof dadosExtraidos === 'string') {
            try {
              dadosExtraidos = JSON.parse(dadosExtraidos)
            } catch (e) {
              console.error('Erro ao parsear dados_extraidos:', e)
            }
          }
          
          // Apply extracted data to form
          applyExtractedData(dadosExtraidos)
          
          setAnalysisComplete(true)
          setAnalyzing(false)
          
          // Delay before closing modal
          setTimeout(() => {
            setShowProgressModal(false)
          }, 1500)
          
        } else if (data.status === 'ERRO') {
          // Stop polling
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
          
          setAnalysisError(data.erro_mensagem || 'Erro na análise do documento')
          setAnalyzing(false)
          setShowProgressModal(false)
        }
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error)
    }
  }
  
  const analyzeWithAI = async () => {
    if (!uploadedFile) return
    
    setAnalyzing(true)
    setAnalysisError(null)
    setShowProgressModal(true)
    setCurrentJob({
      id: '',
      status: 'UPLOAD_RECEBIDO',
      etapa_atual: 1,
      total_etapas: 5,
      mensagem: 'Enviando documento...',
      dados_extraidos: null,
      confianca_analise: null,
      erro_mensagem: null
    })
    
    try {
      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          const base64Data = result.split(',')[1]
          resolve(base64Data)
        }
        reader.onerror = reject
        reader.readAsDataURL(uploadedFile)
      })
      
      const N8N_WEBHOOK_URL = process.env.NEXT_PUBLIC_N8N_WEBHOOK_ANALISE_CONTRATO 
      
      const response = await fetch(N8N_WEBHOOK_URL!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: uploadedFile.name,
          filedata: base64,
          filetype: 'application/pdf'
        })
      })
      
      if (!response.ok) {
        throw new Error('Erro ao enviar documento')
      }
      
      const result = await response.json()
      
      // O webhook retorna o jobId
      const jobId = result.jobId || result.id
      
      if (!jobId) {
        throw new Error('ID do job não retornado')
      }
      
      // Start polling
      pollingIntervalRef.current = setInterval(() => {
        pollJobStatus(jobId)
      }, 2000) // Poll every 2 seconds
      
      // Initial poll
      pollJobStatus(jobId)
      
    } catch (error) {
      console.error('Erro na análise:', error)
      setAnalysisError('Não foi possível analisar o documento. Preencha os dados manualmente.')
      showToast('Erro na análise do documento', 'error')
      setAnalyzing(false)
      setShowProgressModal(false)
    }
  }
  
  const applyExtractedData = (result: any) => {
    // Populate form with AI analysis
    setFormData(prev => ({
      ...prev,
      numero_contrato: result.numero_contrato || '',
      tipo_contrato: (result.tipo_contrato as any) || 'TIPICO',
      objeto: result.objeto || '',
      data_assinatura: formatDateForInput(result.data_assinatura),
      data_inicio_vigencia: formatDateForInput(result.data_inicio_vigencia),
      data_fim_vigencia: formatDateForInput(result.data_fim_vigencia),
      prazo_meses: result.prazo_meses || 12,
      total_parcelas: result.prazo_meses || 12,
      valor_aluguel: parseValorBrasileiro(result.valor_aluguel),
      tipo_valor: (result.tipo_valor as any) || 'FIXO',
      percentual_faturamento: parseValorBrasileiro(result.percentual_faturamento),
      indice_reajuste: (result.indice_reajuste as any) || 'IPCA',
      periodicidade_reajuste: result.periodicidade_reajuste || 12,
      data_base_reajuste: formatDateForInput(result.data_base_reajuste),
      dia_vencimento: result.dia_vencimento || 10,
      renovacao_automatica: result.renovacao_automatica || false,
      prazo_renovacao_meses: result.prazo_renovacao_meses || 12,
      prazo_notificacao_dias: result.prazo_notificacao_dias || 90
    }))
    
    if (result.valor_aluguel) {
      const valorNumerico = parseValorBrasileiro(result.valor_aluguel)
      setValorAluguelFormatado(formatCurrencyInput((valorNumerico * 100).toString()))
    }
    
    // Populate partes from locadores, locatarios, and fiadores
    const mappedPartes: Parte[] = []
    
    // NOVO: Suporte para locadores (array plural)
    if (result.locadores && Array.isArray(result.locadores) && result.locadores.length > 0) {
      result.locadores.forEach((loc: any, idx: number) => {
        mappedPartes.push({
          id: generateId(),
          tipo_parte: 'LOCADOR',
          empresa_id: null,
          contraparte_id: null,
          nome: loc.nome || '',
          documento: loc.documento || '',
          quota_percentual: loc.quota_percentual || 100,
          representante_nome: loc.representante_nome || '',
          representante_cpf: loc.representante_cpf || '',
          representante_email: '',
          principal: idx === 0
        })
      })
    }
    // Fallback: suporte para locador (singular - formato antigo)
    else if (result.locador) {
      mappedPartes.push({
        id: generateId(),
        tipo_parte: 'LOCADOR',
        empresa_id: null,
        contraparte_id: null,
        nome: result.locador.nome || '',
        documento: result.locador.documento || '',
        quota_percentual: 100,
        representante_nome: result.locador.representante_nome || '',
        representante_cpf: result.locador.representante_cpf || '',
        representante_email: '',
        principal: true
      })
    }
    
    // NOVO: Suporte para locatarios (array plural)
    if (result.locatarios && Array.isArray(result.locatarios) && result.locatarios.length > 0) {
      result.locatarios.forEach((loc: any) => {
        mappedPartes.push({
          id: generateId(),
          tipo_parte: 'LOCATARIO',
          empresa_id: null,
          contraparte_id: null,
          nome: loc.nome || '',
          documento: loc.documento || '',
          quota_percentual: loc.quota_percentual || 100,
          representante_nome: loc.representante_nome || '',
          representante_cpf: loc.representante_cpf || '',
          representante_email: '',
          principal: false
        })
      })
    }
    // Fallback: suporte para locatario (singular - formato antigo)
    else if (result.locatario) {
      mappedPartes.push({
        id: generateId(),
        tipo_parte: 'LOCATARIO',
        empresa_id: null,
        contraparte_id: null,
        nome: result.locatario.nome || '',
        documento: result.locatario.documento || '',
        quota_percentual: 100,
        representante_nome: result.locatario.representante_nome || '',
        representante_cpf: result.locatario.representante_cpf || '',
        representante_email: '',
        principal: false
      })
    }
    
    // Fiadores (já era array)
    if (result.fiadores && result.fiadores.length > 0) {
      result.fiadores.forEach((f: any) => {
        mappedPartes.push({
          id: generateId(),
          tipo_parte: 'FIADOR',
          empresa_id: null,
          contraparte_id: null,
          nome: f.nome || '',
          documento: f.documento || '',
          quota_percentual: 100,
          representante_nome: f.representante_nome || '',
          representante_cpf: f.representante_cpf || '',
          representante_email: '',
          principal: false
        })
      })
    }
    
    // Legacy support for partes array
    if (result.partes && result.partes.length > 0 && mappedPartes.length === 0) {
      result.partes.forEach((p: any, idx: number) => {
        mappedPartes.push({
          id: generateId(),
          tipo_parte: p.tipo as any,
          empresa_id: null,
          contraparte_id: null,
          nome: p.nome,
          documento: p.documento,
          quota_percentual: p.quota_percentual || 100,
          representante_nome: p.representante_nome || '',
          representante_cpf: p.representante_cpf || '',
          representante_email: '',
          principal: idx === 0
        })
      })
    }
    
    if (mappedPartes.length > 0) {
      setPartes(mappedPartes)
    }
    
    // Populate imovel
    if (result.imovel) {
      setImovel(prev => ({
        ...prev,
        endereco_completo: result.imovel.endereco || result.imovel.endereco_completo || '',
        municipio: result.imovel.cidade || result.imovel.municipio || '',
        uf: result.imovel.estado || result.imovel.uf || '',
        cep: result.imovel.cep || '',
        area_terreno_m2: parseValorBrasileiro(result.imovel.area_total_m2) || parseValorBrasileiro(result.imovel.area_terreno_m2) || 0,
        area_construida_m2: parseValorBrasileiro(result.imovel.area_construida_m2) || 0,
        matricula_ri: result.imovel.matricula || result.imovel.matricula_rgi || result.imovel.matricula_ri || '',
        cartorio: result.imovel.cartorio || '',
        inscricao_iptu: result.imovel.inscricao_iptu || '',
        descricao: result.imovel.descricao || ''
      }))
    }
    
    // Populate garantias
    if (result.garantias && result.garantias.length > 0) {
      const mappedGarantias: Garantia[] = result.garantias.map((g: any) => {
        // Mapear tipos de garantia
        let tipoGarantia = g.tipo
        if (g.tipo === 'CESSAO_FIDUCIARIA') tipoGarantia = 'ALIENACAO_FIDUCIARIA'
        
        return {
          id: generateId(),
          tipo_garantia: tipoGarantia as any,
          valor: parseValorBrasileiro(g.valor),
          data_inicio: formatDateForInput(g.data_inicio) || '',
          data_fim: formatDateForInput(g.data_fim) || g.vigencia || '',
          fiador_nome: '',
          descricao: g.descricao || ''
        }
      })
      setGarantias(mappedGarantias)
    }
    
    showToast('Análise concluída! Revise os dados extraídos.', 'success')
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================
  
  const goToStep = (step: number) => {
    if (step < 1 || step > 5) return
    
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentStep(step)
      setIsTransitioning(false)
    }, 200)
  }
  
  const nextStep = () => goToStep(currentStep + 1)
  const prevStep = () => goToStep(currentStep - 1)

  // ============================================================================
  // PARTES MANAGEMENT
  // ============================================================================
  
  const addParte = () => {
    const newParte: Parte = {
      id: generateId(),
      tipo_parte: 'LOCADOR',
      empresa_id: null,
      contraparte_id: null,
      nome: '',
      documento: '',
      quota_percentual: 100,
      representante_nome: '',
      representante_cpf: '',
      representante_email: '',
      principal: partes.length === 0
    }
    setPartes([...partes, newParte])
  }
  
  const updateParte = (id: string, updates: Partial<Parte>) => {
    setPartes(partes.map(p => p.id === id ? { ...p, ...updates } : p))
  }
  
  const removeParte = (id: string) => {
    setPartes(partes.filter(p => p.id !== id))
  }

  // ============================================================================
  // GARANTIAS MANAGEMENT
  // ============================================================================
  
  const addGarantia = () => {
    const newGarantia: Garantia = {
      id: generateId(),
      tipo_garantia: 'FIANCA',
      valor: 0,
      data_inicio: '',
      data_fim: '',
      fiador_nome: '',
      descricao: ''
    }
    setGarantias([...garantias, newGarantia])
  }
  
  const updateGarantia = (id: string, updates: Partial<Garantia>) => {
    setGarantias(garantias.map(g => g.id === id ? { ...g, ...updates } : g))
  }
  
  const removeGarantia = (id: string) => {
    setGarantias(garantias.filter(g => g.id !== id))
  }

  // ============================================================================
  // SAVE CONTRACT - COM TRANSAÇÃO (RPC)
  // ============================================================================
  
  const saveContrato = async () => {
    if (!formData.empresa_id || !formData.data_inicio_vigencia) {
      showToast('Preencha os campos obrigatórios', 'warning')
      return
    }
    
    setSaving(true)
    
    try {
      // Preparar dados das partes
      const partesData = partes.map(p => ({
        tipo_parte: p.tipo_parte,
        empresa_id: p.empresa_id || null,
        contraparte_id: p.contraparte_id || null,
        nome: p.nome || null,
        documento: p.documento || null,
        quota_percentual: p.quota_percentual,
        representante_nome: p.representante_nome || null,
        representante_cpf: p.representante_cpf || null,
        representante_email: p.representante_email || null,
        principal: p.principal
      }))
      
      // Preparar dados do imóvel
      const imovelData = (imovel.endereco_completo || imovel.municipio) ? {
        endereco_completo: imovel.endereco_completo || null,
        municipio: imovel.municipio || null,
        uf: imovel.uf || null,
        cep: imovel.cep || null,
        area_terreno_m2: imovel.area_terreno_m2 || null,
        area_construida_m2: imovel.area_construida_m2 || null,
        matricula_ri: imovel.matricula_ri || null,
        cartorio: imovel.cartorio || null,
        inscricao_iptu: imovel.inscricao_iptu || null,
        descricao: imovel.descricao || null
      } : null
      
      // Preparar dados das garantias
      const garantiasData = garantias.map(g => ({
        tipo_garantia: g.tipo_garantia,
        valor: g.valor || null,
        data_inicio: g.data_inicio || null,
        data_fim: g.data_fim || null,
        descricao: g.descricao || null
      }))
      
      // Chamar função RPC com transação única (schema sodcapital)
      const { data, error } = await supabase
        .schema('sodcapital')
        .rpc('salvar_contrato_locacao_completo', {
        p_numero_contrato: formData.numero_contrato || null,
        p_tipo_contrato: formData.tipo_contrato,
        p_objeto: formData.objeto || null,
        p_data_assinatura: formData.data_assinatura || null,
        p_data_inicio_vigencia: formData.data_inicio_vigencia,
        p_data_fim_vigencia: formData.data_fim_vigencia || null,
        p_prazo_meses: formData.prazo_meses,
        p_total_parcelas: formData.total_parcelas,
        p_renovacao_automatica: formData.renovacao_automatica,
        p_prazo_renovacao_meses: formData.prazo_renovacao_meses || null,
        p_prazo_notificacao_dias: formData.prazo_notificacao_dias || null,
        p_valor_aluguel: formData.valor_aluguel,
        p_tipo_valor: formData.tipo_valor,
        p_percentual_faturamento: formData.percentual_faturamento || null,
        p_indice_reajuste: formData.indice_reajuste,
        p_periodicidade_reajuste: formData.periodicidade_reajuste,
        p_data_base_reajuste: formData.data_base_reajuste || null,
        p_dia_vencimento: formData.dia_vencimento,
        p_dia_util: formData.dia_util,
        p_empresa_id: formData.empresa_id,
        p_contraparte_id: formData.contraparte_id || null,
        p_projeto_id: formData.projeto_id || null,
        p_subprojeto_id: formData.subprojeto_id || null,
        p_banco_conta_id: formData.banco_conta_id || null,
        p_plano_conta_id: formData.plano_conta_id || null,
        p_forma_recebimento: formData.forma_recebimento,
        p_status: formData.status,
        p_observacoes: formData.observacoes || null,
        p_partes: partesData,
        p_imovel: imovelData,
        p_garantias: garantiasData,
        p_gerar_parcelas: true
      })
      
      if (error) throw error
      
      // Verificar resultado da função
      if (!data.success) {
        throw new Error(data.message || 'Erro ao salvar contrato')
      }
      
      showToast(`Contrato salvo! ${data.parcelas_geradas} parcelas e ${data.lancamentos_gerados} lançamentos gerados.`, 'success')
      
      // Redirect to listing
      setTimeout(() => {
        openPanel('/contratos/locacao', 'Contratos de Locação', false)
      }, 1500)
      
    } catch (error: any) {
      console.error('Erro ao salvar:', error)
      const errorMessage = error?.message || error?.details || 'Erro desconhecido'
      showToast(`Erro ao salvar contrato: ${errorMessage}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  // ============================================================================
  // RENDER PROGRESS MODAL - NOVO (CENTRALIZADO)
  // ============================================================================
  
  const renderProgressModal = () => {
    if (!showProgressModal) return null
    
    const currentStepIndex = ANALYSIS_STEPS.findIndex(s => s.status === currentJob?.status) + 1
    const isComplete = currentJob?.status === 'CONCLUIDO'
    const hasError = currentJob?.status === 'ERRO'
    
    // Pegar o ícone da etapa atual dinamicamente
    const currentStepData = ANALYSIS_STEPS.find(s => s.status === currentJob?.status)
    const CurrentIcon = currentStepData?.icon || Upload
    
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        backdropFilter: 'blur(4px)'
      }}>
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '24px',
          padding: '40px 48px',
          maxWidth: '480px',
          width: '90%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          animation: 'modalIn 0.3s ease'
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              width: '72px',
              height: '72px',
              borderRadius: '20px',
              background: isComplete 
                ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                : hasError
                  ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                  : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              boxShadow: isComplete 
                ? '0 8px 24px rgba(34, 197, 94, 0.4)'
                : hasError
                  ? '0 8px 24px rgba(239, 68, 68, 0.4)'
                  : '0 8px 24px rgba(59, 130, 246, 0.4)',
              transition: 'all 0.3s ease'
            }}>
              {isComplete ? (
                <CheckCircle2 size={36} color="#fff" />
              ) : hasError ? (
                <AlertCircle size={36} color="#fff" />
              ) : (
                <CurrentIcon size={36} color="#fff" style={{ animation: 'pulse 2s ease infinite' }} />
              )}
            </div>
            <h2 style={{
              fontSize: '22px',
              fontWeight: '700',
              color: '#1e293b',
              margin: '0 0 8px 0'
            }}>
              {isComplete ? 'Análise Concluída!' : hasError ? 'Erro na Análise' : 'Analisando Contrato'}
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#64748b',
              margin: 0
            }}>
              {isComplete 
                ? 'Os dados foram extraídos com sucesso'
                : hasError
                  ? currentJob?.erro_mensagem || 'Ocorreu um erro durante a análise'
                  : currentJob?.mensagem || 'Processando documento...'}
            </p>
          </div>
          
          {/* Progress Steps */}
          {!hasError && (
            <div style={{ marginBottom: '32px' }}>
              {ANALYSIS_STEPS.map((step, index) => {
                const Icon = step.icon
                const isStepComplete = currentStepIndex > index + 1 || isComplete
                const isCurrentStep = currentStepIndex === index + 1 && !isComplete
                
                return (
                  <div 
                    key={step.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      backgroundColor: isCurrentStep ? '#f0f9ff' : 'transparent',
                      marginBottom: index < ANALYSIS_STEPS.length - 1 ? '4px' : 0,
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      backgroundColor: isStepComplete 
                        ? '#22c55e' 
                        : isCurrentStep 
                          ? '#3b82f6' 
                          : '#f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.3s ease'
                    }}>
                      {isStepComplete ? (
                        <CheckCircle2 size={18} color="#fff" />
                      ) : isCurrentStep ? (
                        <Loader2 size={18} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Icon size={18} color="#94a3b8" />
                      )}
                    </div>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: isCurrentStep ? '600' : '500',
                      color: isStepComplete 
                        ? '#22c55e' 
                        : isCurrentStep 
                          ? '#1e293b' 
                          : '#94a3b8',
                      flex: 1
                    }}>
                      {step.label}
                    </span>
                    {isStepComplete && (
                      <span style={{ fontSize: '12px', color: '#22c55e' }}>✓</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          
          {/* Progress Bar */}
          {!isComplete && !hasError && (
            <div style={{
              height: '6px',
              backgroundColor: '#f1f5f9',
              borderRadius: '3px',
              overflow: 'hidden',
              marginBottom: '24px'
            }}>
              <div style={{
                height: '100%',
                width: `${(currentStepIndex / ANALYSIS_STEPS.length) * 100}%`,
                background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)',
                borderRadius: '3px',
                transition: 'width 0.5s ease'
              }} />
            </div>
          )}
          
          {/* Confiança da Análise */}
          {isComplete && currentJob?.confianca_analise && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 16px',
              backgroundColor: '#f0fdf4',
              borderRadius: '10px',
              marginBottom: '24px'
            }}>
              <Zap size={16} color="#22c55e" />
              <span style={{ fontSize: '13px', color: '#166534', fontWeight: '500' }}>
                Confiança da análise: {currentJob.confianca_analise}%
              </span>
            </div>
          )}
          
          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            {hasError && (
              <>
                <button
                  onClick={() => {
                    setShowProgressModal(false)
                    setAnalysisError(null)
                  }}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#f1f5f9',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  Preencher Manualmente
                </button>
                <button
                  onClick={analyzeWithAI}
                  style={{
                    padding: '12px 24px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  Tentar Novamente
                </button>
              </>
            )}
            
            {isComplete && (
              <button
                onClick={() => {
                  setShowProgressModal(false)
                  nextStep()
                }}
                style={{
                  padding: '14px 32px',
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(34, 197, 94, 0.35)'
                }}
              >
                Revisar Dados Extraídos
                <ChevronRight size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }
  
  // ============================================================================
  // RENDER FICHA MODAL - EXIBIR TODOS OS DADOS PREENCHIDOS
  // ============================================================================
  
  const renderFichaModal = () => {
    if (!showFichaModal) return null
    
    const empresaSelecionada = empresas.find(e => e.id === formData.empresa_id)
    const contraparteSelecionada = contrapartes.find(c => c.id === formData.contraparte_id)
    const projetoSelecionado = projetos.find(p => p.id === formData.projeto_id)
    
    const formatDate = (date: string) => {
      if (!date) return '—'
      return new Date(date + 'T12:00:00').toLocaleDateString('pt-BR')
    }
    
    const handlePrint = () => {
      const printContent = fichaRef.current
      if (!printContent) return
      
      const printWindow = window.open('', '_blank')
      if (!printWindow) return
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Ficha do Contrato</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1e293b; }
            h1 { font-size: 24px; color: #2563eb; margin-bottom: 8px; }
            h2 { font-size: 16px; color: #64748b; font-weight: 500; margin-bottom: 32px; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; }
            h3 { font-size: 14px; color: #2563eb; margin: 24px 0 16px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
            .section { margin-bottom: 24px; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
            .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
            .field { margin-bottom: 12px; }
            .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
            .value { font-size: 14px; color: #1e293b; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; }
            .badge-blue { background: #dbeafe; color: #1d4ed8; }
            .badge-green { background: #dcfce7; color: #15803d; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
            th { background: #f8fafc; color: #64748b; font-weight: 600; font-size: 11px; text-transform: uppercase; }
            .footer { margin-top: 48px; padding-top: 24px; border-top: 2px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
          <div class="footer">
            Ficha gerada em ${new Date().toLocaleString('pt-BR')} • SOD Documentos
          </div>
        </body>
        </html>
      `)
      printWindow.document.close()
      printWindow.print()
    }
    
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        backdropFilter: 'blur(4px)',
        padding: '20px'
      }}>
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '24px',
          maxWidth: '900px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          animation: 'modalIn 0.3s ease'
        }}>
          {/* Header fixo */}
          <div style={{
            padding: '24px 32px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                📋 Ficha do Contrato
              </h2>
              <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                Revise todos os dados antes de salvar
              </p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handlePrint}
                style={{
                  padding: '10px 20px',
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#475569',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Printer size={16} />
                Imprimir
              </button>
              <button
                onClick={() => setShowFichaModal(false)}
                style={{
                  padding: '10px',
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={20} color="#64748b" />
              </button>
            </div>
          </div>
          
          {/* Conteúdo scrollável */}
          <div 
            ref={fichaRef}
            style={{
              padding: '32px',
              overflowY: 'auto',
              flex: 1
            }}
          >
            {/* Cabeçalho */}
            <div style={{ marginBottom: '32px', paddingBottom: '24px', borderBottom: '2px solid #e2e8f0' }}>
              <h1 style={{ fontSize: '22px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                {formData.numero_contrato || 'Contrato Sem Número'}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '15px', color: '#64748b' }}>
                  {TIPOS_CONTRATO.find(t => t.value === formData.tipo_contrato)?.label || formData.tipo_contrato}
                </span>
                {formData.status && (
                  <span style={{
                    padding: '4px 12px',
                    backgroundColor: formData.status === 'VIGENTE' ? '#dcfce7' : formData.status === 'MINUTA' ? '#fef3c7' : '#f1f5f9',
                    color: formData.status === 'VIGENTE' ? '#15803d' : formData.status === 'MINUTA' ? '#b45309' : '#64748b',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}>
                    {formData.status}
                  </span>
                )}
                {projetoSelecionado && (
                  <span style={{
                    padding: '4px 12px',
                    backgroundColor: '#dbeafe',
                    color: '#1d4ed8',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}>
                    📁 {projetoSelecionado.nome}
                  </span>
                )}
              </div>
            </div>
            
            {/* Partes Principais */}
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#2563eb', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Partes Principais
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', borderLeft: '4px solid #3b82f6' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>Locador</div>
                  <div style={{ fontSize: '15px', fontWeight: '500', color: '#1e293b' }}>
                    {empresaSelecionada?.nome || '—'}
                  </div>
                  {empresaSelecionada?.cnpj && (
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                      CNPJ: {empresaSelecionada.cnpj}
                    </div>
                  )}
                </div>
                <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', borderLeft: '4px solid #10b981' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>Locatário</div>
                  <div style={{ fontSize: '15px', fontWeight: '500', color: '#1e293b' }}>
                    {contraparteSelecionada?.nome || '—'}
                  </div>
                  {contraparteSelecionada?.documento && (
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                      {contraparteSelecionada.pessoa === 'PJ' ? 'CNPJ' : 'CPF'}: {contraparteSelecionada.documento}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Vigência */}
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#2563eb', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Vigência
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Assinatura</div>
                  <div style={{ fontSize: '14px', color: '#1e293b' }}>{formatDate(formData.data_assinatura)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Início Vigência</div>
                  <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>{formatDate(formData.data_inicio_vigencia)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Fim Vigência</div>
                  <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>{formatDate(formData.data_fim_vigencia)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Prazo</div>
                  <div style={{ fontSize: '14px', color: '#1e293b' }}>{formData.prazo_meses} meses</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Total Parcelas</div>
                  <div style={{ fontSize: '14px', color: '#1e293b' }}>{formData.total_parcelas}</div>
                </div>
              </div>
            </div>
            
            {/* Valores */}
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#2563eb', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Valores e Reajuste
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Valor Aluguel</div>
                  <div style={{ fontSize: '16px', color: '#1e293b', fontWeight: '600' }}>{formatCurrencyBRL(formData.valor_aluguel)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Tipo Valor</div>
                  <div style={{ fontSize: '14px', color: '#1e293b' }}>
                    {formData.tipo_valor === 'FIXO' ? 'Fixo' : formData.tipo_valor === 'MAIOR_ENTRE' ? 'Maior entre fixo e %' : formData.tipo_valor === 'PERCENTUAL' ? 'Percentual' : formData.tipo_valor}
                  </div>
                </div>
                {formData.tipo_valor !== 'FIXO' && (
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>% Faturamento</div>
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>{formData.percentual_faturamento || 0}%</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Vencimento</div>
                  <div style={{ fontSize: '14px', color: '#1e293b' }}>Dia {formData.dia_vencimento} {formData.dia_util ? '(útil)' : ''}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Índice Reajuste</div>
                  <div style={{ fontSize: '14px', color: '#1e293b' }}>{formData.indice_reajuste}</div>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginTop: '16px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Periodicidade</div>
                  <div style={{ fontSize: '14px', color: '#1e293b' }}>{formData.periodicidade_reajuste} meses</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Data Base Reajuste</div>
                  <div style={{ fontSize: '14px', color: '#1e293b' }}>{formatDate(formData.data_base_reajuste)}</div>
                </div>
              </div>
            </div>
            
            {/* Renovação */}
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#2563eb', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Renovação
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Renovação Automática</div>
                  <div style={{ fontSize: '14px', color: '#1e293b' }}>
                    <span style={{
                      padding: '4px 10px',
                      backgroundColor: formData.renovacao_automatica ? '#dcfce7' : '#fee2e2',
                      color: formData.renovacao_automatica ? '#15803d' : '#b91c1c',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}>
                      {formData.renovacao_automatica ? 'Sim' : 'Não'}
                    </span>
                  </div>
                </div>
                {formData.renovacao_automatica && (
                  <>
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Prazo Renovação</div>
                      <div style={{ fontSize: '14px', color: '#1e293b' }}>{formData.prazo_renovacao_meses} meses</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Prazo Notificação</div>
                      <div style={{ fontSize: '14px', color: '#1e293b' }}>{formData.prazo_notificacao_dias} dias</div>
                    </div>
                  </>
                )}
              </div>
            </div>
            
            {/* Objeto */}
            {formData.objeto && (
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#2563eb', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Objeto do Contrato
                </h3>
                <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.6', backgroundColor: '#f8fafc', padding: '16px', borderRadius: '12px' }}>
                  {formData.objeto}
                </p>
              </div>
            )}
            
            {/* Partes Adicionais */}
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#2563eb', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Partes do Contrato ({partes.length || 0})
              </h3>
              {partes.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc' }}>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Tipo</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Nome / Razão Social</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>CPF/CNPJ</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Representante</th>
                      <th style={{ padding: '12px', textAlign: 'center', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Quota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partes.map((parte, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            padding: '4px 10px',
                            backgroundColor: TIPOS_PARTE.find(t => t.value === parte.tipo_parte)?.color + '20',
                            color: TIPOS_PARTE.find(t => t.value === parte.tipo_parte)?.color,
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '500'
                          }}>
                            {TIPOS_PARTE.find(t => t.value === parte.tipo_parte)?.label}
                          </span>
                          {parte.principal && (
                            <span style={{
                              marginLeft: '6px',
                              padding: '2px 6px',
                              backgroundColor: '#fef3c7',
                              color: '#b45309',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: '600'
                            }}>
                              PRINCIPAL
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b' }}>{parte.nome || '—'}</td>
                        <td style={{ padding: '12px', fontSize: '13px', color: '#64748b' }}>{parte.documento || '—'}</td>
                        <td style={{ padding: '12px' }}>
                          {parte.representante_nome ? (
                            <div>
                              <div style={{ fontSize: '13px', color: '#1e293b' }}>{parte.representante_nome}</div>
                              {parte.representante_cpf && (
                                <div style={{ fontSize: '11px', color: '#94a3b8' }}>CPF: {parte.representante_cpf}</div>
                              )}
                              {parte.representante_email && (
                                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{parte.representante_email}</div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px', color: '#64748b', textAlign: 'center' }}>{parte.quota_percentual}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '12px', textAlign: 'center', color: '#94a3b8' }}>
                  Nenhuma parte adicionada
                </div>
              )}
            </div>
            
            {/* Imóvel */}
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#2563eb', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Imóvel
              </h3>
              <div style={{ backgroundColor: '#f8fafc', padding: '20px', borderRadius: '12px' }}>
                {(imovel.endereco_completo || imovel.municipio) ? (
                  <>
                    <p style={{ fontSize: '14px', color: '#1e293b', marginBottom: '12px' }}>
                      {imovel.endereco_completo || '—'}
                      {imovel.municipio && ` — ${imovel.municipio}`}
                      {imovel.uf && `/${imovel.uf}`}
                      {imovel.cep && ` • CEP: ${imovel.cep}`}
                    </p>
                    {imovel.descricao && (
                      <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px', fontStyle: 'italic' }}>
                        {imovel.descricao}
                      </p>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: '14px', color: '#94a3b8' }}>Nenhum endereço informado</p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Área Terreno</div>
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>
                      {imovel.area_terreno_m2 > 0 ? `${imovel.area_terreno_m2.toLocaleString('pt-BR')} m²` : '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Área Construída</div>
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>
                      {imovel.area_construida_m2 > 0 ? `${imovel.area_construida_m2.toLocaleString('pt-BR')} m²` : '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Matrícula RGI</div>
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>{imovel.matricula_ri || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Cartório</div>
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>{imovel.cartorio || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Inscrição IPTU</div>
                    <div style={{ fontSize: '14px', color: '#1e293b' }}>{imovel.inscricao_iptu || '—'}</div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Garantias */}
            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#2563eb', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Garantias ({garantias.length || 0})
              </h3>
              {garantias.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc' }}>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Tipo</th>
                      <th style={{ padding: '12px', textAlign: 'right', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Valor</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Início</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Fim</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: '600' }}>Descrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {garantias.map((garantia, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '12px' }}>
                          <span style={{ fontSize: '14px' }}>
                            {TIPOS_GARANTIA.find(t => t.value === garantia.tipo_garantia)?.icon}{' '}
                            {TIPOS_GARANTIA.find(t => t.value === garantia.tipo_garantia)?.label || garantia.tipo_garantia}
                          </span>
                        </td>
                        <td style={{ padding: '12px', fontSize: '14px', color: '#1e293b', fontWeight: '500', textAlign: 'right' }}>
                          {garantia.valor ? formatCurrencyBRL(garantia.valor) : '—'}
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px', color: '#64748b' }}>
                          {garantia.data_inicio ? formatDate(garantia.data_inicio) : '—'}
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px', color: '#64748b' }}>
                          {garantia.data_fim ? formatDate(garantia.data_fim) : '—'}
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px', color: '#64748b', maxWidth: '250px' }}>
                          {garantia.descricao || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '12px', textAlign: 'center', color: '#94a3b8' }}>
                  Nenhuma garantia adicionada
                </div>
              )}
            </div>
            
            {/* Observações */}
            <div>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#2563eb', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Observações
              </h3>
              {formData.observacoes ? (
                <p style={{ fontSize: '14px', color: '#475569', lineHeight: '1.6', backgroundColor: '#fffbeb', padding: '16px', borderRadius: '12px', borderLeft: '4px solid #f59e0b' }}>
                  {formData.observacoes}
                </p>
              ) : (
                <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '12px', textAlign: 'center', color: '#94a3b8' }}>
                  Nenhuma observação
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  const renderProgressBar = () => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      padding: '16px 0',
      borderBottom: '1px solid #f0f0f0',
      backgroundColor: '#fff'
    }}>
      {WIZARD_STEPS.map((step, index) => {
        const Icon = step.icon
        const isActive = currentStep === step.id
        const isCompleted = currentStep > step.id
        
        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => isCompleted && goToStep(step.id)}
              disabled={!isCompleted && !isActive}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                padding: '8px 16px',
                background: isActive ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : isCompleted ? '#f1f5f9' : 'transparent',
                border: isActive ? 'none' : isCompleted ? '1px solid #e2e8f0' : '1px solid #f0f0f0',
                borderRadius: '10px',
                cursor: isCompleted ? 'pointer' : 'default',
                transition: 'all 0.2s ease',
                minWidth: '90px',
                opacity: !isCompleted && !isActive ? 0.4 : 1
              }}
            >
              <Icon 
                size={16} 
                color={isActive ? '#fff' : isCompleted ? '#3b82f6' : '#94a3b8'}
                strokeWidth={1.5}
              />
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: '600',
                  color: isActive ? '#fff' : isCompleted ? '#1e293b' : '#94a3b8'
                }}>
                  {step.title}
                </div>
              </div>
            </button>
            
            {index < WIZARD_STEPS.length - 1 && (
              <ChevronRight 
                size={14} 
                color={currentStep > step.id ? '#3b82f6' : '#e2e8f0'}
                style={{ margin: '0 2px' }}
              />
            )}
          </div>
        )
      })}
      
      {/* Separador e Botão Exibir Ficha */}
      <div style={{ 
        width: '1px', 
        height: '32px', 
        backgroundColor: '#e2e8f0', 
        margin: '0 12px' 
      }} />
      
      <button
        onClick={() => setShowFichaModal(true)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          padding: '8px 16px',
          background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
          border: 'none',
          borderRadius: '10px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          minWidth: '90px'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.02)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = 'none'
        }}
      >
        <Eye size={16} color="#fff" strokeWidth={1.5} />
        <div style={{
          fontSize: '11px',
          fontWeight: '600',
          color: '#fff'
        }}>
          Exibir Ficha
        </div>
      </button>
    </div>
  )

  // ============================================================================
  // STEP 1: UPLOAD
  // ============================================================================
  
  const renderStep1 = () => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 40px 60px',
      maxWidth: '560px',
      margin: '0 auto'
    }}>
      {/* Upload Area - Apple Style */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          width: '100%',
          padding: uploadedFile ? '32px' : '48px 40px',
          background: isDragging 
            ? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)' 
            : uploadedFile 
              ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)'
              : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          border: isDragging 
            ? '2px solid #3b82f6' 
            : uploadedFile 
              ? '1px solid #86efac'
              : '1px solid #e2e8f0',
          borderRadius: '20px',
          cursor: 'pointer',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          textAlign: 'center',
          boxShadow: isDragging 
            ? '0 8px 30px rgba(59, 130, 246, 0.15)' 
            : '0 1px 3px rgba(0, 0, 0, 0.04)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        
        {uploadedFile ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
            }}>
              <FileText size={22} color="#fff" />
            </div>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', margin: '0 0 2px 0' }}>
                {uploadedFile.name}
              </p>
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB • Pronto para análise
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setUploadedFile(null)
                setAnalysisComplete(false)
              }}
              style={{
                padding: '8px',
                backgroundColor: 'rgba(0,0,0,0.05)',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={16} color="#64748b" />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease'
            }}>
              <Upload size={26} color="#64748b" strokeWidth={1.5} />
            </div>
            <div>
              <p style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', margin: '0 0 6px 0' }}>
                Arraste o contrato aqui
              </p>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                ou <span style={{ color: '#3b82f6', fontWeight: '500' }}>clique para selecionar</span>
              </p>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#f1f5f9',
              borderRadius: '6px',
              marginTop: '4px'
            }}>
              <FileText size={12} color="#64748b" />
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>PDF até 20MB</span>
            </div>
          </div>
        )}
      </div>
      
      {/* AI Analysis Button */}
      {uploadedFile && !analysisComplete && (
        <button
          onClick={analyzeWithAI}
          disabled={analyzing}
          style={{
            marginTop: '24px',
            padding: '14px 32px',
            background: analyzing 
              ? '#e2e8f0' 
              : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            border: 'none',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '600',
            color: analyzing ? '#94a3b8' : '#fff',
            cursor: analyzing ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            transition: 'all 0.2s ease',
            boxShadow: analyzing ? 'none' : '0 4px 14px rgba(59, 130, 246, 0.35)'
          }}
        >
          {analyzing ? (
            <>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Analisando...
            </>
          ) : (
            <>
              <BrainCircuit size={16} />
              Analisar com IA
            </>
          )}
        </button>
      )}
      
      {/* Analysis Complete */}
      {analysisComplete && (
        <div style={{
          marginTop: '24px',
          padding: '16px 20px',
          background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          width: '100%',
          border: '1px solid #86efac'
        }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <CheckCircle2 size={18} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#166534', margin: 0 }}>
              Análise concluída
            </p>
            <p style={{ fontSize: '12px', color: '#16a34a', margin: '2px 0 0 0' }}>
              Dados extraídos com sucesso
            </p>
          </div>
          <button
            onClick={nextStep}
            style={{
              padding: '8px 16px',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            Continuar
            <ChevronRight size={14} />
          </button>
        </div>
      )}
      
      {/* Analysis Error */}
      {analysisError && (
        <div style={{
          marginTop: '24px',
          padding: '16px 20px',
          background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          width: '100%',
          border: '1px solid #fcd34d'
        }}>
          <AlertCircle size={20} color="#d97706" />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '13px', fontWeight: '500', color: '#92400e', margin: 0 }}>
              {analysisError}
            </p>
          </div>
        </div>
      )}
      
      {/* Divider */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        margin: '32px 0 24px',
        gap: '16px'
      }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
        <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '500' }}>ou</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
      </div>
      
      {/* Skip Upload */}
      <button
        onClick={nextStep}
        style={{
          padding: '12px 24px',
          backgroundColor: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          fontSize: '14px',
          fontWeight: '500',
          color: '#475569',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f8fafc'
          e.currentTarget.style.borderColor = '#cbd5e1'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#fff'
          e.currentTarget.style.borderColor = '#e2e8f0'
        }}
      >
        Preencher manualmente
        <ChevronRight size={16} color="#64748b" />
      </button>
    </div>
  )

  // ============================================================================
  // STEP 2: DADOS GERAIS
  // ============================================================================
  
  const renderStep2 = () => (
    <div style={{
      padding: '48px 60px',
      maxWidth: '900px',
      margin: '0 auto'
    }}>
      <div style={{ marginBottom: '40px' }}>
        <h2 style={{
          fontSize: '28px',
          fontWeight: '300',
          color: '#2563eb',
          marginBottom: '8px',
          letterSpacing: '-0.5px'
        }}>
          Dados do Contrato
        </h2>
        <p style={{ fontSize: '14px', color: '#666' }}>
          Informações básicas e condições comerciais
        </p>
      </div>
      
      {/* Tipo de Contrato */}
      <div style={{ marginBottom: '40px' }}>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#999', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Tipo de Contrato
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {TIPOS_CONTRATO.map(tipo => (
            <button
              key={tipo.value}
              onClick={() => setFormData({ ...formData, tipo_contrato: tipo.value as any })}
              style={{
                padding: '20px',
                backgroundColor: formData.tipo_contrato === tipo.value ? '#2563eb' : '#fff',
                border: formData.tipo_contrato === tipo.value ? 'none' : '1px solid #e0e0e0',
                borderRadius: '12px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{
                fontSize: '14px',
                fontWeight: '600',
                color: formData.tipo_contrato === tipo.value ? '#fff' : '#2563eb',
                marginBottom: '4px'
              }}>
                {tipo.label}
              </div>
              <div style={{
                fontSize: '12px',
                color: formData.tipo_contrato === tipo.value ? 'rgba(255,255,255,0.7)' : '#999'
              }}>
                {tipo.desc}
              </div>
            </button>
          ))}
        </div>
      </div>
      
      {/* Grid de campos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
        {/* Número do Contrato */}
        <div>
          <label style={labelStyle}>Número do Contrato</label>
          <input
            type="text"
            value={formData.numero_contrato}
            onChange={(e) => setFormData({ ...formData, numero_contrato: e.target.value })}
            placeholder="Ex: CT-2024/001"
            style={inputStyle}
          />
        </div>
        
        {/* Status */}
        <div>
          <label style={labelStyle}>Status</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
            style={inputStyle}
          >
            <option value="MINUTA">Minuta</option>
            <option value="ASSINADO">Assinado</option>
            <option value="VIGENTE">Vigente</option>
            <option value="ENCERRADO">Encerrado</option>
            <option value="RESCINDIDO">Rescindido</option>
          </select>
        </div>
        
        {/* Empresa (Locador Principal) - AUTOCOMPLETE */}
        <div style={{ position: 'relative' }}>
          <label style={labelStyle}>Empresa (Locador Principal) *</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={searchEmpresa}
              onChange={(e) => {
                setSearchEmpresa(e.target.value)
                setShowEmpresaDropdown(true)
                if (!e.target.value) {
                  setFormData({ ...formData, empresa_id: '' })
                }
              }}
              onFocus={() => setShowEmpresaDropdown(true)}
              placeholder={loadingEmpresas ? "Carregando..." : "Digite para buscar..."}
              style={{
                ...inputStyle,
                paddingRight: '40px'
              }}
              required
            />
            <div style={{ 
              position: 'absolute', 
              right: '12px', 
              top: '50%', 
              transform: 'translateY(-50%)',
              color: '#999',
              pointerEvents: 'none'
            }}>
              {loadingEmpresas ? (
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <ChevronDown size={18} />
              )}
            </div>
          </div>
          
          {/* Dropdown de resultados */}
          {showEmpresaDropdown && !loadingEmpresas && (
            <div 
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: '12px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                maxHeight: '280px',
                overflowY: 'auto',
                zIndex: 1000,
                marginTop: '4px'
              }}
            >
              {empresas
                .filter(emp => 
                  !searchEmpresa || 
                  emp.nome.toLowerCase().includes(searchEmpresa.toLowerCase()) ||
                  (emp.cnpj && emp.cnpj.includes(searchEmpresa))
                )
                .slice(0, 50)
                .map(emp => (
                  <div
                    key={emp.id}
                    onClick={() => {
                      setFormData({ ...formData, empresa_id: emp.id })
                      setSearchEmpresa(emp.nome)
                      setShowEmpresaDropdown(false)
                    }}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f0f0f0',
                      backgroundColor: formData.empresa_id === emp.id ? '#eff6ff' : 'transparent',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = formData.empresa_id === emp.id ? '#eff6ff' : 'transparent'}
                  >
                    <div style={{ fontWeight: '500', color: '#1e293b', fontSize: '14px' }}>
                      {emp.nome}
                    </div>
                    {emp.cnpj && (
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        CNPJ: {emp.cnpj}
                      </div>
                    )}
                  </div>
                ))
              }
              {empresas.filter(emp => 
                !searchEmpresa || 
                emp.nome.toLowerCase().includes(searchEmpresa.toLowerCase()) ||
                (emp.cnpj && emp.cnpj.includes(searchEmpresa))
              ).length === 0 && (
                <div style={{ padding: '16px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
                  Nenhuma empresa encontrada
                </div>
              )}
              {empresas.filter(emp => 
                !searchEmpresa || 
                emp.nome.toLowerCase().includes(searchEmpresa.toLowerCase()) ||
                (emp.cnpj && emp.cnpj.includes(searchEmpresa))
              ).length > 50 && (
                <div style={{ padding: '12px', textAlign: 'center', color: '#2563eb', fontSize: '12px', backgroundColor: '#f8fafc' }}>
                  Mostrando 50 de {empresas.filter(emp => 
                    !searchEmpresa || 
                    emp.nome.toLowerCase().includes(searchEmpresa.toLowerCase()) ||
                    (emp.cnpj && emp.cnpj.includes(searchEmpresa))
                  ).length} resultados. Continue digitando...
                </div>
              )}
            </div>
          )}
          
          {/* Overlay para fechar dropdown */}
          {showEmpresaDropdown && (
            <div 
              style={{ position: 'fixed', inset: 0, zIndex: 999 }}
              onClick={() => setShowEmpresaDropdown(false)}
            />
          )}
        </div>
        
        {/* Contraparte (Locatário Principal) - AUTOCOMPLETE */}
        <div style={{ position: 'relative' }}>
          <label style={labelStyle}>Locatário Principal</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={searchContraparte}
              onChange={(e) => {
                setSearchContraparte(e.target.value)
                setShowContraparteDropdown(true)
                if (!e.target.value) {
                  setFormData({ ...formData, contraparte_id: '' })
                }
              }}
              onFocus={() => setShowContraparteDropdown(true)}
              placeholder={loadingContrapartes ? "Carregando..." : "Digite para buscar..."}
              style={{
                ...inputStyle,
                paddingRight: '40px'
              }}
            />
            <div style={{ 
              position: 'absolute', 
              right: '12px', 
              top: '50%', 
              transform: 'translateY(-50%)',
              color: '#999',
              pointerEvents: 'none'
            }}>
              {loadingContrapartes ? (
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <ChevronDown size={18} />
              )}
            </div>
          </div>
          
          {/* Dropdown de resultados */}
          {showContraparteDropdown && !loadingContrapartes && (
            <div 
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: '12px',
                boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                maxHeight: '280px',
                overflowY: 'auto',
                zIndex: 1000,
                marginTop: '4px'
              }}
            >
              {contrapartes
                .filter(cp => 
                  !searchContraparte || 
                  cp.nome.toLowerCase().includes(searchContraparte.toLowerCase()) ||
                  (cp.documento && cp.documento.includes(searchContraparte)) ||
                  (cp.apelido && cp.apelido.toLowerCase().includes(searchContraparte.toLowerCase()))
                )
                .slice(0, 50)
                .map(cp => (
                  <div
                    key={cp.id}
                    onClick={() => {
                      setFormData({ ...formData, contraparte_id: cp.id })
                      setSearchContraparte(cp.nome)
                      setShowContraparteDropdown(false)
                    }}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f0f0f0',
                      backgroundColor: formData.contraparte_id === cp.id ? '#eff6ff' : 'transparent',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = formData.contraparte_id === cp.id ? '#eff6ff' : 'transparent'}
                  >
                    <div style={{ fontWeight: '500', color: '#1e293b', fontSize: '14px' }}>
                      {cp.nome}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', display: 'flex', gap: '12px' }}>
                      {cp.documento && <span>{cp.pessoa === 'PJ' ? 'CNPJ' : 'CPF'}: {cp.documento}</span>}
                      {cp.apelido && <span>• {cp.apelido}</span>}
                    </div>
                  </div>
                ))
              }
              {contrapartes.filter(cp => 
                !searchContraparte || 
                cp.nome.toLowerCase().includes(searchContraparte.toLowerCase()) ||
                (cp.documento && cp.documento.includes(searchContraparte)) ||
                (cp.apelido && cp.apelido.toLowerCase().includes(searchContraparte.toLowerCase()))
              ).length === 0 && (
                <div style={{ padding: '16px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
                  Nenhum locatário encontrado
                </div>
              )}
              {contrapartes.filter(cp => 
                !searchContraparte || 
                cp.nome.toLowerCase().includes(searchContraparte.toLowerCase()) ||
                (cp.documento && cp.documento.includes(searchContraparte)) ||
                (cp.apelido && cp.apelido.toLowerCase().includes(searchContraparte.toLowerCase()))
              ).length > 50 && (
                <div style={{ padding: '12px', textAlign: 'center', color: '#2563eb', fontSize: '12px', backgroundColor: '#f8fafc' }}>
                  Mostrando 50 de {contrapartes.filter(cp => 
                    !searchContraparte || 
                    cp.nome.toLowerCase().includes(searchContraparte.toLowerCase()) ||
                    (cp.documento && cp.documento.includes(searchContraparte)) ||
                    (cp.apelido && cp.apelido.toLowerCase().includes(searchContraparte.toLowerCase()))
                  ).length} resultados. Continue digitando...
                </div>
              )}
            </div>
          )}
          
          {/* Overlay para fechar dropdown */}
          {showContraparteDropdown && (
            <div 
              style={{ position: 'fixed', inset: 0, zIndex: 999 }}
              onClick={() => setShowContraparteDropdown(false)}
            />
          )}
        </div>
      </div>
      
      {/* Objeto */}
      <div style={{ marginBottom: '32px' }}>
        <label style={labelStyle}>Objeto do Contrato</label>
        <textarea
          value={formData.objeto}
          onChange={(e) => setFormData({ ...formData, objeto: e.target.value })}
          placeholder="Descrição do imóvel e finalidade da locação..."
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>
      
      {/* Separator */}
      <div style={{ borderTop: '1px solid #f0f0f0', margin: '40px 0', paddingTop: '40px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '500', color: '#2563eb', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={18} />
          Vigência
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
          <div>
            <label style={labelStyle}>Data Assinatura</label>
            <input
              type="date"
              value={formData.data_assinatura}
              onChange={(e) => setFormData({ ...formData, data_assinatura: e.target.value })}
              style={inputStyle}
            />
          </div>
          
          <div>
            <label style={labelStyle}>Início Vigência *</label>
            <input
              type="date"
              value={formData.data_inicio_vigencia}
              onChange={(e) => setFormData({ ...formData, data_inicio_vigencia: e.target.value })}
              style={inputStyle}
              required
            />
          </div>
          
          <div>
            <label style={labelStyle}>Fim Vigência</label>
            <input
              type="date"
              value={formData.data_fim_vigencia}
              onChange={(e) => setFormData({ ...formData, data_fim_vigencia: e.target.value })}
              style={inputStyle}
            />
          </div>
          
          <div>
            <label style={labelStyle}>Prazo (meses)</label>
            <input
              type="number"
              value={formData.prazo_meses}
              onChange={(e) => setFormData({ ...formData, prazo_meses: parseInt(e.target.value) || 0 })}
              min="1"
              style={inputStyle}
            />
          </div>
        </div>
      </div>
      
      {/* Valores */}
      <div style={{ borderTop: '1px solid #f0f0f0', margin: '40px 0', paddingTop: '40px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '500', color: '#2563eb', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <DollarSign size={18} />
          Valores
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {TIPOS_VALOR.map(tipo => (
            <button
              key={tipo.value}
              onClick={() => setFormData({ ...formData, tipo_valor: tipo.value as any })}
              style={{
                padding: '16px',
                backgroundColor: formData.tipo_valor === tipo.value ? '#2563eb' : '#fff',
                border: formData.tipo_valor === tipo.value ? 'none' : '1px solid #e0e0e0',
                borderRadius: '10px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{
                fontSize: '13px',
                fontWeight: '600',
                color: formData.tipo_valor === tipo.value ? '#fff' : '#2563eb'
              }}>
                {tipo.label}
              </div>
              <div style={{
                fontSize: '11px',
                color: formData.tipo_valor === tipo.value ? 'rgba(255,255,255,0.7)' : '#999',
                marginTop: '2px'
              }}>
                {tipo.desc}
              </div>
            </button>
          ))}
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
          <div>
            <label style={labelStyle}>Valor do Aluguel *</label>
            <input
              type="text"
              value={valorAluguelFormatado}
              onChange={(e) => {
                const formatted = formatCurrencyInput(e.target.value)
                setValorAluguelFormatado(formatted)
                setFormData({ ...formData, valor_aluguel: parseCurrencyInput(formatted) })
              }}
              placeholder="0,00"
              style={inputStyle}
            />
          </div>
          
          {(formData.tipo_valor === 'PERCENTUAL' || formData.tipo_valor === 'MAIOR_ENTRE') && (
            <div>
              <label style={labelStyle}>% Faturamento</label>
              <input
                type="number"
                value={formData.percentual_faturamento}
                onChange={(e) => setFormData({ ...formData, percentual_faturamento: parseFloat(e.target.value) || 0 })}
                step="0.1"
                min="0"
                max="100"
                style={inputStyle}
              />
            </div>
          )}
          
          <div>
            <label style={labelStyle}>Dia Vencimento</label>
            <input
              type="number"
              value={formData.dia_vencimento}
              onChange={(e) => setFormData({ ...formData, dia_vencimento: parseInt(e.target.value) || 1 })}
              min="1"
              max="31"
              style={inputStyle}
            />
          </div>
        </div>
      </div>
      
      {/* Reajuste */}
      <div style={{ borderTop: '1px solid #f0f0f0', margin: '40px 0', paddingTop: '40px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '500', color: '#2563eb', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Percent size={18} />
          Reajuste
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {INDICES_REAJUSTE.map(indice => (
            <button
              key={indice.value}
              onClick={() => setFormData({ ...formData, indice_reajuste: indice.value as any })}
              style={{
                padding: '16px',
                backgroundColor: formData.indice_reajuste === indice.value ? '#2563eb' : '#fff',
                border: formData.indice_reajuste === indice.value ? 'none' : '1px solid #e0e0e0',
                borderRadius: '10px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{
                fontSize: '14px',
                fontWeight: '600',
                color: formData.indice_reajuste === indice.value ? '#fff' : '#2563eb'
              }}>
                {indice.label}
              </div>
              <div style={{
                fontSize: '11px',
                color: formData.indice_reajuste === indice.value ? 'rgba(255,255,255,0.7)' : '#999',
                marginTop: '2px'
              }}>
                {indice.desc}
              </div>
            </button>
          ))}
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
          <div>
            <label style={labelStyle}>Periodicidade (meses)</label>
            <input
              type="number"
              value={formData.periodicidade_reajuste}
              onChange={(e) => setFormData({ ...formData, periodicidade_reajuste: parseInt(e.target.value) || 12 })}
              min="1"
              style={inputStyle}
            />
          </div>
          
          <div>
            <label style={labelStyle}>Data Base Reajuste</label>
            <input
              type="date"
              value={formData.data_base_reajuste}
              onChange={(e) => setFormData({ ...formData, data_base_reajuste: e.target.value })}
              style={inputStyle}
            />
          </div>
        </div>
      </div>
      
      {/* Renovação */}
      <div style={{ borderTop: '1px solid #f0f0f0', margin: '40px 0', paddingTop: '40px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '500', color: '#2563eb', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={18} />
          Renovação
        </h3>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <button
            onClick={() => setFormData({ ...formData, renovacao_automatica: !formData.renovacao_automatica })}
            style={{
              width: '48px',
              height: '28px',
              borderRadius: '14px',
              backgroundColor: formData.renovacao_automatica ? '#2563eb' : '#e0e0e0',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              transition: 'all 0.3s ease'
            }}
          >
            <div style={{
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              backgroundColor: '#fff',
              position: 'absolute',
              top: '3px',
              left: formData.renovacao_automatica ? '23px' : '3px',
              transition: 'all 0.3s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }} />
          </button>
          <span style={{ fontSize: '14px', color: '#2563eb' }}>
            Renovação automática
          </span>
        </div>
        
        {formData.renovacao_automatica && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
            <div>
              <label style={labelStyle}>Prazo Renovação (meses)</label>
              <input
                type="number"
                value={formData.prazo_renovacao_meses}
                onChange={(e) => setFormData({ ...formData, prazo_renovacao_meses: parseInt(e.target.value) || 12 })}
                min="1"
                style={inputStyle}
              />
            </div>
            
            <div>
              <label style={labelStyle}>Prazo Notificação (dias)</label>
              <input
                type="number"
                value={formData.prazo_notificacao_dias}
                onChange={(e) => setFormData({ ...formData, prazo_notificacao_dias: parseInt(e.target.value) || 90 })}
                min="1"
                style={inputStyle}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // ============================================================================
  // STEP 3: PARTES
  // ============================================================================
  
  const renderStep3 = () => (
    <div style={{
      padding: '48px 60px',
      maxWidth: '1000px',
      margin: '0 auto'
    }}>
      <div style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{
            fontSize: '28px',
            fontWeight: '300',
            color: '#2563eb',
            marginBottom: '8px',
            letterSpacing: '-0.5px'
          }}>
            Partes do Contrato
          </h2>
          <p style={{ fontSize: '14px', color: '#666' }}>
            Locadores, locatários, fiadores e intervenientes
          </p>
        </div>
        
        <button
          onClick={addParte}
          style={{
            padding: '12px 20px',
            backgroundColor: '#2563eb',
            border: 'none',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: '500',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Plus size={16} />
          Adicionar Parte
        </button>
      </div>
      
      {partes.length === 0 ? (
        <div style={{
          padding: '60px',
          backgroundColor: '#f8fafc',
          borderRadius: '16px',
          textAlign: 'center'
        }}>
          <Users size={48} color="#ccc" strokeWidth={1} />
          <p style={{ fontSize: '15px', color: '#666', marginTop: '16px' }}>
            Nenhuma parte adicionada ainda
          </p>
          <p style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>
            Clique em "Adicionar Parte" para incluir locadores, locatários e fiadores
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {partes.map((parte, index) => (
            <div
              key={parte.id}
              style={{
                padding: '24px',
                backgroundColor: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: '16px',
                borderLeft: `4px solid ${TIPOS_PARTE.find(t => t.value === parte.tipo_parte)?.color || '#999'}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    padding: '4px 12px',
                    backgroundColor: `${TIPOS_PARTE.find(t => t.value === parte.tipo_parte)?.color}15`,
                    color: TIPOS_PARTE.find(t => t.value === parte.tipo_parte)?.color,
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600'
                  }}>
                    {TIPOS_PARTE.find(t => t.value === parte.tipo_parte)?.label}
                  </span>
                  {parte.principal && (
                    <span style={{
                      padding: '4px 8px',
                      backgroundColor: '#f0f0f0',
                      color: '#666',
                      borderRadius: '4px',
                      fontSize: '11px'
                    }}>
                      Principal
                    </span>
                  )}
                </div>
                
                <button
                  onClick={() => removeParte(parte.id)}
                  style={{
                    padding: '8px',
                    backgroundColor: '#fee2e2',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  <Trash2 size={16} color="#dc2626" />
                </button>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Tipo</label>
                  <select
                    value={parte.tipo_parte}
                    onChange={(e) => updateParte(parte.id, { tipo_parte: e.target.value as any })}
                    style={inputStyleSmall}
                  >
                    {TIPOS_PARTE.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label style={labelStyle}>Nome / Razão Social</label>
                  <input
                    type="text"
                    value={parte.nome}
                    onChange={(e) => updateParte(parte.id, { nome: e.target.value })}
                    placeholder="Nome completo"
                    style={inputStyleSmall}
                  />
                </div>
                
                <div>
                  <label style={labelStyle}>CPF/CNPJ</label>
                  <input
                    type="text"
                    value={parte.documento}
                    onChange={(e) => updateParte(parte.id, { documento: e.target.value })}
                    placeholder="000.000.000-00"
                    style={inputStyleSmall}
                  />
                </div>
                
                <div>
                  <label style={labelStyle}>Quota (%)</label>
                  <input
                    type="number"
                    value={parte.quota_percentual}
                    onChange={(e) => updateParte(parte.id, { quota_percentual: parseFloat(e.target.value) || 0 })}
                    min="0"
                    max="100"
                    style={inputStyleSmall}
                  />
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '16px' }}>
                <div>
                  <label style={labelStyle}>Representante Legal</label>
                  <input
                    type="text"
                    value={parte.representante_nome}
                    onChange={(e) => updateParte(parte.id, { representante_nome: e.target.value })}
                    placeholder="Nome do representante"
                    style={inputStyleSmall}
                  />
                </div>
                
                <div>
                  <label style={labelStyle}>CPF Representante</label>
                  <input
                    type="text"
                    value={parte.representante_cpf}
                    onChange={(e) => updateParte(parte.id, { representante_cpf: e.target.value })}
                    placeholder="000.000.000-00"
                    style={inputStyleSmall}
                  />
                </div>
                
                <div>
                  <label style={labelStyle}>Email Representante</label>
                  <input
                    type="email"
                    value={parte.representante_email}
                    onChange={(e) => updateParte(parte.id, { representante_email: e.target.value })}
                    placeholder="email@empresa.com"
                    style={inputStyleSmall}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ============================================================================
  // STEP 4: IMOVEL E GARANTIAS
  // ============================================================================
  
  const renderStep4 = () => (
    <div style={{
      padding: '48px 60px',
      maxWidth: '1000px',
      margin: '0 auto'
    }}>
      {/* Imóvel */}
      <div style={{ marginBottom: '48px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{
            fontSize: '28px',
            fontWeight: '300',
            color: '#2563eb',
            marginBottom: '8px',
            letterSpacing: '-0.5px'
          }}>
            Dados do Imóvel
          </h2>
          <p style={{ fontSize: '14px', color: '#666' }}>
            Localização e características do imóvel locado
          </p>
        </div>
        
        <div style={{
          padding: '32px',
          backgroundColor: '#fff',
          border: '1px solid #e0e0e0',
          borderRadius: '16px'
        }}>
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Endereço Completo</label>
            <input
              type="text"
              value={imovel.endereco_completo}
              onChange={(e) => setImovel({ ...imovel, endereco_completo: e.target.value })}
              placeholder="Rua, número, complemento, bairro"
              style={inputStyle}
            />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            <div>
              <label style={labelStyle}>Município</label>
              <input
                type="text"
                value={imovel.municipio}
                onChange={(e) => setImovel({ ...imovel, municipio: e.target.value })}
                placeholder="Cidade"
                style={inputStyle}
              />
            </div>
            
            <div>
              <label style={labelStyle}>UF</label>
              <select
                value={imovel.uf}
                onChange={(e) => setImovel({ ...imovel, uf: e.target.value })}
                style={inputStyle}
              >
                <option value="">Selecione</option>
                {UFS.map(uf => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label style={labelStyle}>CEP</label>
              <input
                type="text"
                value={imovel.cep}
                onChange={(e) => setImovel({ ...imovel, cep: e.target.value })}
                placeholder="00000-000"
                style={inputStyle}
              />
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '24px' }}>
            <div>
              <label style={labelStyle}>Área Terreno (m²)</label>
              <input
                type="number"
                value={imovel.area_terreno_m2 || ''}
                onChange={(e) => setImovel({ ...imovel, area_terreno_m2: parseFloat(e.target.value) || 0 })}
                placeholder="0,00"
                style={inputStyle}
              />
            </div>
            
            <div>
              <label style={labelStyle}>Área Construída (m²)</label>
              <input
                type="number"
                value={imovel.area_construida_m2 || ''}
                onChange={(e) => setImovel({ ...imovel, area_construida_m2: parseFloat(e.target.value) || 0 })}
                placeholder="0,00"
                style={inputStyle}
              />
            </div>
            
            <div>
              <label style={labelStyle}>Matrícula RI</label>
              <input
                type="text"
                value={imovel.matricula_ri}
                onChange={(e) => setImovel({ ...imovel, matricula_ri: e.target.value })}
                placeholder="Nº matrícula"
                style={inputStyle}
              />
            </div>
            
            <div>
              <label style={labelStyle}>Inscrição IPTU</label>
              <input
                type="text"
                value={imovel.inscricao_iptu}
                onChange={(e) => setImovel({ ...imovel, inscricao_iptu: e.target.value })}
                placeholder="Nº inscrição"
                style={inputStyle}
              />
            </div>
          </div>
          
          <div>
            <label style={labelStyle}>Cartório</label>
            <input
              type="text"
              value={imovel.cartorio}
              onChange={(e) => setImovel({ ...imovel, cartorio: e.target.value })}
              placeholder="Nome do cartório de registro"
              style={inputStyle}
            />
          </div>
        </div>
      </div>
      
      {/* Garantias */}
      <div>
        <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{
              fontSize: '28px',
              fontWeight: '300',
              color: '#2563eb',
              marginBottom: '8px',
              letterSpacing: '-0.5px'
            }}>
              Garantias
            </h2>
            <p style={{ fontSize: '14px', color: '#666' }}>
              Fianças, cauções e outras garantias do contrato
            </p>
          </div>
          
          <button
            onClick={addGarantia}
            style={{
              padding: '12px 20px',
              backgroundColor: '#2563eb',
              border: 'none',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: '500',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Plus size={16} />
            Adicionar Garantia
          </button>
        </div>
        
        {garantias.length === 0 ? (
          <div style={{
            padding: '48px',
            backgroundColor: '#f8fafc',
            borderRadius: '16px',
            textAlign: 'center'
          }}>
            <Shield size={40} color="#ccc" strokeWidth={1} />
            <p style={{ fontSize: '14px', color: '#666', marginTop: '12px' }}>
              Nenhuma garantia adicionada
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {garantias.map((garantia) => (
              <div
                key={garantia.id}
                style={{
                  padding: '24px',
                  backgroundColor: '#fff',
                  border: '1px solid #e0e0e0',
                  borderRadius: '16px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <span style={{
                    fontSize: '20px'
                  }}>
                    {TIPOS_GARANTIA.find(t => t.value === garantia.tipo_garantia)?.icon}
                  </span>
                  
                  <button
                    onClick={() => removeGarantia(garantia.id)}
                    style={{
                      padding: '8px',
                      backgroundColor: '#fee2e2',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    <Trash2 size={16} color="#dc2626" />
                  </button>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Tipo</label>
                    <select
                      value={garantia.tipo_garantia}
                      onChange={(e) => updateGarantia(garantia.id, { tipo_garantia: e.target.value as any })}
                      style={inputStyleSmall}
                    >
                      {TIPOS_GARANTIA.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label style={labelStyle}>Valor</label>
                    <input
                      type="text"
                      value={garantia.valor ? formatCurrencyInput((garantia.valor * 100).toString()) : ''}
                      onChange={(e) => {
                        const formatted = formatCurrencyInput(e.target.value)
                        updateGarantia(garantia.id, { valor: parseCurrencyInput(formatted) })
                      }}
                      placeholder="0,00"
                      style={inputStyleSmall}
                    />
                  </div>
                  
                  <div>
                    <label style={labelStyle}>Início</label>
                    <input
                      type="date"
                      value={garantia.data_inicio}
                      onChange={(e) => updateGarantia(garantia.id, { data_inicio: e.target.value })}
                      style={inputStyleSmall}
                    />
                  </div>
                  
                  <div>
                    <label style={labelStyle}>Fim</label>
                    <input
                      type="date"
                      value={garantia.data_fim}
                      onChange={(e) => updateGarantia(garantia.id, { data_fim: e.target.value })}
                      style={inputStyleSmall}
                    />
                  </div>
                </div>
                
                <div style={{ marginTop: '16px' }}>
                  <label style={labelStyle}>Descrição</label>
                  <input
                    type="text"
                    value={garantia.descricao}
                    onChange={(e) => updateGarantia(garantia.id, { descricao: e.target.value })}
                    placeholder="Detalhes da garantia"
                    style={inputStyleSmall}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // ============================================================================
  // STEP 5: CONTABIL E PROJETO
  // ============================================================================
  
  // Handlers para selecao em cascata do plano de contas
  const handleGrupoChange = (grupo: string) => {
    setSelectedGrupo(grupo)
    setSelectedCategoria('')
    setSelectedSubcategoria('')
    setFormData(prev => ({ ...prev, plano_conta_id: '' }))
    
    const categorias = Array.from(new Set(
      planoContas
        .filter(p => p.grupo === grupo)
        .map(p => p.categoria)
    )).sort()
    setCategoriasDisponiveis(categorias)
    setSubcategoriasDisponiveis([])
  }
  
  const handleCategoriaChange = (categoria: string) => {
    setSelectedCategoria(categoria)
    setSelectedSubcategoria('')
    setFormData(prev => ({ ...prev, plano_conta_id: '' }))
    
    const subcategorias = Array.from(new Set(
      planoContas
        .filter(p => p.grupo === selectedGrupo && p.categoria === categoria)
        .map(p => p.subcategoria)
    )).sort()
    setSubcategoriasDisponiveis(subcategorias)
  }
  
  const handleSubcategoriaChange = (subcategoria: string) => {
    setSelectedSubcategoria(subcategoria)
    
    const plano = planoContas.find(
      p => p.grupo === selectedGrupo && 
           p.categoria === selectedCategoria && 
           p.subcategoria === subcategoria
    )
    if (plano) {
      setFormData(prev => ({ ...prev, plano_conta_id: plano.id }))
    }
  }
  
  const subprojetosDisponiveis = subprojetos.filter(
    sp => sp.projeto_pai_id === formData.projeto_id
  )
  
  const contasBancariasDisponiveis = bancosContas.filter(
    bc => bc.empresa_id === formData.empresa_id
  )
  
  const renderStep5 = () => (
    <div style={{
      padding: '48px 60px',
      maxWidth: '900px',
      margin: '0 auto'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <h2 style={{
          fontSize: '28px',
          fontWeight: '300',
          color: '#2563eb',
          marginBottom: '8px',
          letterSpacing: '-0.5px'
        }}>
          Contabil e Projeto
        </h2>
        <p style={{ fontSize: '14px', color: '#666' }}>
          Configure a categorizacao financeira e forma de recebimento
        </p>
      </div>
      
      <div style={{
        padding: '32px',
        backgroundColor: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: '16px',
        marginBottom: '24px'
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#999', marginBottom: '24px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Projeto
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={labelStyle}>Projeto *</label>
            <select
              value={formData.projeto_id}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, projeto_id: e.target.value, subprojeto_id: '' }))
              }}
              style={inputStyle}
            >
              <option value="">Selecione o projeto</option>
              {projetos
                .filter(p => !formData.empresa_id || p.empresa_id === formData.empresa_id)
                .map(projeto => (
                  <option key={projeto.id} value={projeto.id}>
                    {projeto.nome}
                  </option>
                ))}
            </select>
          </div>
          
          <div>
            <label style={labelStyle}>Subprojeto</label>
            <select
              value={formData.subprojeto_id}
              onChange={(e) => setFormData(prev => ({ ...prev, subprojeto_id: e.target.value }))}
              style={inputStyle}
              disabled={!formData.projeto_id || subprojetosDisponiveis.length === 0}
            >
              <option value="">{subprojetosDisponiveis.length === 0 ? 'Nenhum subprojeto' : 'Selecione...'}</option>
              {subprojetosDisponiveis.map(sp => (
                <option key={sp.id} value={sp.id}>{sp.nome}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      <div style={{
        padding: '32px',
        backgroundColor: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: '16px',
        marginBottom: '24px'
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#999', marginBottom: '24px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Recebimento
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={labelStyle}>Conta Bancaria *</label>
            <select
              value={formData.banco_conta_id}
              onChange={(e) => setFormData(prev => ({ ...prev, banco_conta_id: e.target.value }))}
              style={inputStyle}
              disabled={contasBancariasDisponiveis.length === 0}
            >
              <option value="">
                {!formData.empresa_id 
                  ? 'Selecione a empresa primeiro' 
                  : contasBancariasDisponiveis.length === 0 
                    ? 'Nenhuma conta cadastrada' 
                    : 'Selecione a conta'}
              </option>
              {contasBancariasDisponiveis.map(conta => (
                <option key={conta.id} value={conta.id}>
                  {conta.banco_codigo || '---'} - {conta.banco_nome || 'Banco'} - Ag: {conta.agencia || '-'} / CC: {conta.numero_conta || '-'}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={labelStyle}>Forma de Recebimento *</label>
            <select
              value={formData.forma_recebimento}
              onChange={(e) => setFormData(prev => ({ ...prev, forma_recebimento: e.target.value as 'BOLETO' | 'PIX' | 'DEPOSITO_CONTA' }))}
              style={inputStyle}
            >
              <option value="BOLETO">Boleto Bancario</option>
              <option value="PIX">PIX</option>
              <option value="DEPOSITO_CONTA">Deposito em Conta</option>
            </select>
          </div>
        </div>
      </div>
      
      <div style={{
        padding: '32px',
        backgroundColor: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: '16px'
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#999', marginBottom: '24px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Classificacao Financeira
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
          <div>
            <label style={labelStyle}>Grupo *</label>
            <select
              value={selectedGrupo}
              onChange={(e) => handleGrupoChange(e.target.value)}
              style={inputStyle}
            >
              <option value="">Selecione o grupo</option>
              {gruposUnicos.map(grupo => (
                <option key={grupo} value={grupo}>{grupo}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={labelStyle}>Categoria *</label>
            <select
              value={selectedCategoria}
              onChange={(e) => handleCategoriaChange(e.target.value)}
              style={inputStyle}
              disabled={!selectedGrupo}
            >
              <option value="">{!selectedGrupo ? 'Selecione o grupo primeiro' : 'Selecione'}</option>
              {categoriasDisponiveis.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={labelStyle}>Subcategoria *</label>
            <select
              value={selectedSubcategoria}
              onChange={(e) => handleSubcategoriaChange(e.target.value)}
              style={inputStyle}
              disabled={!selectedCategoria}
            >
              <option value="">{!selectedCategoria ? 'Selecione a categoria primeiro' : 'Selecione'}</option>
              {subcategoriasDisponiveis.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          </div>
        </div>
        
        {formData.plano_conta_id && (
          <div style={{
            marginTop: '16px',
            padding: '12px 16px',
            backgroundColor: '#e8f5e9',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <CheckCircle2 size={18} color="#2e7d32" />
            <span style={{ fontSize: '13px', color: '#2e7d32' }}>
              {(() => {
                const planoSelecionado = planoContas.find(p => p.id === formData.plano_conta_id)
                return planoSelecionado 
                  ? `${planoSelecionado.codigo_conta} - ${planoSelecionado.classificacao || `${selectedGrupo} > ${selectedCategoria} > ${selectedSubcategoria}`}`
                  : ''
              })()}
            </span>
          </div>
        )}
      </div>
      
      {(!formData.projeto_id || !formData.banco_conta_id || !formData.plano_conta_id) && (
        <div style={{
          marginTop: '24px',
          padding: '16px 20px',
          backgroundColor: '#fff3e0',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <AlertCircle size={20} color="#e65100" />
          <span style={{ fontSize: '14px', color: '#e65100' }}>
            Preencha todos os campos obrigatorios para prosseguir
          </span>
        </div>
      )}
    </div>
  )

  // ============================================================================
  
  const renderStep6 = () => (
    <div style={{
      padding: '48px 60px',
      maxWidth: '900px',
      margin: '0 auto'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <h2 style={{
          fontSize: '28px',
          fontWeight: '300',
          color: '#2563eb',
          marginBottom: '8px',
          letterSpacing: '-0.5px'
        }}>
          Revisão Final
        </h2>
        <p style={{ fontSize: '14px', color: '#666' }}>
          Confirme os dados antes de salvar o contrato
        </p>
      </div>
      
      {/* Summary Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Dados Gerais */}
        <div style={{
          padding: '28px',
          backgroundColor: '#fff',
          border: '1px solid #e0e0e0',
          borderRadius: '16px'
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#999', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Dados Gerais
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            <div>
              <p style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>Tipo</p>
              <p style={{ fontSize: '15px', color: '#2563eb', fontWeight: '500' }}>
                {TIPOS_CONTRATO.find(t => t.value === formData.tipo_contrato)?.label}
              </p>
            </div>
            
            <div>
              <p style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>Número</p>
              <p style={{ fontSize: '15px', color: '#2563eb', fontWeight: '500' }}>
                {formData.numero_contrato || '—'}
              </p>
            </div>
            
            <div>
              <p style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>Status</p>
              <p style={{ fontSize: '15px', color: '#2563eb', fontWeight: '500' }}>
                {formData.status}
              </p>
            </div>
            
            <div>
              <p style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>Empresa</p>
              <p style={{ fontSize: '15px', color: '#2563eb', fontWeight: '500' }}>
                {empresas.find(e => e.id === formData.empresa_id)?.nome || '—'}
              </p>
            </div>
            
            <div>
              <p style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>Locatário</p>
              <p style={{ fontSize: '15px', color: '#2563eb', fontWeight: '500' }}>
                {contrapartes.find(c => c.id === formData.contraparte_id)?.nome || '—'}
              </p>
            </div>
            
            <div>
              <p style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>Vigência</p>
              <p style={{ fontSize: '15px', color: '#2563eb', fontWeight: '500' }}>
                {formData.prazo_meses} meses ({formData.total_parcelas} parcelas)
              </p>
            </div>
          </div>
        </div>
        
        {/* Valores */}
        <div style={{
          padding: '28px',
          backgroundColor: '#fff',
          border: '1px solid #e0e0e0',
          borderRadius: '16px'
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#999', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Valores e Reajuste
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
            <div>
              <p style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>Aluguel Mensal</p>
              <p style={{ fontSize: '20px', color: '#2563eb', fontWeight: '600' }}>
                {formatCurrencyBRL(formData.valor_aluguel)}
              </p>
            </div>
            
            <div>
              <p style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>Tipo</p>
              <p style={{ fontSize: '15px', color: '#2563eb', fontWeight: '500' }}>
                {TIPOS_VALOR.find(t => t.value === formData.tipo_valor)?.label}
              </p>
            </div>
            
            <div>
              <p style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>Índice Reajuste</p>
              <p style={{ fontSize: '15px', color: '#2563eb', fontWeight: '500' }}>
                {formData.indice_reajuste}
              </p>
            </div>
            
            <div>
              <p style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>Vencimento</p>
              <p style={{ fontSize: '15px', color: '#2563eb', fontWeight: '500' }}>
                Dia {formData.dia_vencimento}
              </p>
            </div>
          </div>
        </div>
        
        {/* Partes */}
        {partes.length > 0 && (
          <div style={{
            padding: '28px',
            backgroundColor: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: '16px'
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#999', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Partes ({partes.length})
            </h3>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {partes.map(parte => (
                <div
                  key={parte.id}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: '#f8f8f8',
                    borderRadius: '8px',
                    borderLeft: `3px solid ${TIPOS_PARTE.find(t => t.value === parte.tipo_parte)?.color}`
                  }}
                >
                  <p style={{ fontSize: '13px', fontWeight: '500', color: '#2563eb' }}>
                    {parte.nome || 'Sem nome'}
                  </p>
                  <p style={{ fontSize: '11px', color: '#666' }}>
                    {TIPOS_PARTE.find(t => t.value === parte.tipo_parte)?.label} • {parte.quota_percentual}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Garantias */}
        {garantias.length > 0 && (
          <div style={{
            padding: '28px',
            backgroundColor: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: '16px'
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#999', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Garantias ({garantias.length})
            </h3>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {garantias.map(garantia => (
                <div
                  key={garantia.id}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: '#f8f8f8',
                    borderRadius: '8px'
                  }}
                >
                  <p style={{ fontSize: '13px', fontWeight: '500', color: '#2563eb' }}>
                    {TIPOS_GARANTIA.find(t => t.value === garantia.tipo_garantia)?.icon}{' '}
                    {TIPOS_GARANTIA.find(t => t.value === garantia.tipo_garantia)?.label}
                  </p>
                  <p style={{ fontSize: '11px', color: '#666' }}>
                    {garantia.valor ? formatCurrencyBRL(garantia.valor) : '—'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Save Button */}
      <div style={{ marginTop: '48px', textAlign: 'center' }}>
        <button
          onClick={saveContrato}
          disabled={saving || !formData.empresa_id || !formData.data_inicio_vigencia}
          style={{
            padding: '18px 60px',
            background: saving ? '#ccc' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            border: 'none',
            borderRadius: '14px',
            fontSize: '16px',
            fontWeight: '500',
            color: '#fff',
            cursor: saving ? 'default' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '12px',
            transition: 'all 0.3s ease'
          }}
        >
          {saving ? (
            <>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
              Salvando...
            </>
          ) : (
            <>
              <CheckCircle2 size={20} />
              Salvar Contrato e Gerar Parcelas
            </>
          )}
        </button>
        
        {(!formData.empresa_id || !formData.data_inicio_vigencia) && (
          <p style={{ fontSize: '13px', color: '#e65100', marginTop: '12px' }}>
            Preencha os campos obrigatórios: Empresa e Data de Início
          </p>
        )}
      </div>
    </div>
  )

  // ============================================================================
  // STYLES
  // ============================================================================
  
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '11px',
    fontWeight: '600',
    color: '#999',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  }
  
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    fontSize: '14px',
    border: '1px solid #e0e0e0',
    borderRadius: '10px',
    backgroundColor: '#fff',
    color: '#2563eb',
    outline: 'none',
    transition: 'border-color 0.2s ease',
    boxSizing: 'border-box'
  }
  
  const inputStyleSmall: React.CSSProperties = {
    ...inputStyle,
    padding: '12px 14px',
    fontSize: '13px'
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#f8fafc'
      }}>
        <Loader2 size={32} color="#2563eb" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }
  
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc'
    }}>
      {/* Header Compacto */}
      <div style={{
        backgroundColor: '#fff',
        borderBottom: '1px solid #f0f0f0',
        padding: '12px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => openPanel('/contratos/locacao', 'Contratos de Locação', false)}
            style={{
              padding: '8px',
              backgroundColor: '#f5f5f5',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={16} color="#666" />
          </button>
          <div>
            <h1 style={{
              fontSize: '16px',
              fontWeight: '600',
              color: '#1e293b',
              margin: 0
            }}>
              Novo Contrato de Locação
            </h1>
          </div>
        </div>
      </div>
      
      {/* Progress Bar */}
      {renderProgressBar()}
      
      {/* Content */}
      <div style={{
        opacity: isTransitioning ? 0 : 1,
        transform: isTransitioning ? 'translateY(10px)' : 'translateY(0)',
        transition: 'all 0.2s ease'
      }}>
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}
        {currentStep === 5 && renderStep5()}
        {currentStep === 6 && renderStep6()}
      </div>
      
      {/* Footer Navigation */}
      {currentStep > 1 && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: '256px',
          right: 0,
          backgroundColor: '#fff',
          borderTop: '1px solid #f0f0f0',
          padding: '16px 40px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10
        }}>
          <button
            onClick={prevStep}
            style={{
              padding: '12px 24px',
              backgroundColor: '#f5f5f5',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#666',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <ChevronLeft size={16} />
            Voltar
          </button>
          
          {currentStep < 6 && (
            <button
              onClick={nextStep}
              style={{
                padding: '12px 32px',
                backgroundColor: '#2563eb',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              Continuar
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      )}
      
      {/* Progress Modal - Centralizado */}
      {renderProgressModal()}
      
      {/* Ficha Modal - Preview completo */}
      {renderFichaModal()}
      
      {/* Toasts - CENTRALIZADO */}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          pointerEvents: 'none'
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            pointerEvents: 'auto'
          }}>
            {toasts.map(toast => (
              <div
                key={toast.id}
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                style={{
                  padding: '20px 32px',
                  backgroundColor: toast.type === 'success' ? '#fff' : toast.type === 'error' ? '#fff' : '#fff',
                  borderRadius: '16px',
                  boxShadow: toast.type === 'error' 
                    ? '0 20px 60px rgba(220, 38, 38, 0.3), 0 0 0 1px rgba(220, 38, 38, 0.1)' 
                    : toast.type === 'success'
                      ? '0 20px 60px rgba(34, 197, 94, 0.3), 0 0 0 1px rgba(34, 197, 94, 0.1)'
                      : '0 20px 60px rgba(245, 158, 11, 0.3), 0 0 0 1px rgba(245, 158, 11, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  animation: 'toastIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  cursor: 'pointer',
                  minWidth: '300px',
                  maxWidth: '500px',
                  borderLeft: toast.type === 'error' 
                    ? '4px solid #dc2626' 
                    : toast.type === 'success' 
                      ? '4px solid #22c55e' 
                      : '4px solid #f59e0b'
                }}
              >
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  backgroundColor: toast.type === 'success' ? '#dcfce7' : toast.type === 'error' ? '#fee2e2' : '#fef3c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {toast.type === 'success' && <CheckCircle2 size={24} color="#22c55e" />}
                  {toast.type === 'error' && <AlertCircle size={24} color="#dc2626" />}
                  {toast.type === 'warning' && <AlertCircle size={24} color="#f59e0b" />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontSize: '15px', 
                    fontWeight: '600', 
                    color: toast.type === 'success' ? '#15803d' : toast.type === 'error' ? '#b91c1c' : '#b45309',
                    marginBottom: '2px'
                  }}>
                    {toast.type === 'success' ? 'Sucesso!' : toast.type === 'error' ? 'Erro!' : 'Atenção!'}
                  </div>
                  <div style={{ 
                    fontSize: '14px', 
                    color: '#475569',
                    lineHeight: '1.4'
                  }}>
                    {toast.message}
                  </div>
                </div>
                <X size={18} color="#94a3b8" style={{ flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes toastIn {
          from {
            opacity: 0;
            transform: scale(0.9) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        
        @keyframes modalIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        
        input:focus, select:focus, textarea:focus {
          border-color: #2563eb !important;
        }
        
        button:hover {
          opacity: 0.9;
        }
      `}</style>
    </div>
  )
}