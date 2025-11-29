'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDate } from '@/lib/utils'
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Search, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  X, 
  RefreshCw, 
  ChevronDown, 
  CreditCard,
  Paperclip,
  Upload,
  FileText,
  File,
  Download,
  Eye,
  Loader2
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import PlanoContaPicker from '@/components/planocontapicker'

// Toast notification system
type ToastType = 'success' | 'warning' | 'error'

interface Toast {
  id: number
  message: string
  type: ToastType
  requiresConfirmation?: boolean
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
  projeto_pai_id: string | null
}

interface Banco {
  id: string
  codigo: string
  nome: string
}

interface BancoConta {
  id: string
  empresa_id: string
  banco_nome: string
  numero_conta: string
  agencia: string
  nome_banco?: string
  banco?: { nome: string }
  bancos?: { nome: string } | { nome: string }[] | null
  digito_conta?: string
  tipo_conta: string
}

interface Contraparte {
  id: string
  nome: string
  apelido: string | null
}

interface PlanoContaFluxo {
  id: string
  codigo_conta: string
  categoria: string
  subcategoria: string
  tipo_fluxo: string
  sentido: 'Entrada' | 'Saida' | null
}

interface Retencao {
  id?: string
  imposto: string
  valor: number
  valorFormatado?: string
  detalhe: string | null
}

interface Lancamento {
  id: string
  tipo: 'Entrada' | 'Saida'
  empresa_id: string
  projeto_id: string | null
  subprojeto_id: string | null
  banco_conta_id: string | null
  contraparte_id: string | null
  plano_conta_id: string
  valor_bruto: number
  valor_liquido: number
  data_emissao: string | null
  data_vencimento: string
  data_previsao_pagamento: string | null
  data_liquidacao: string | null
  status: 'ABERTO' | 'PAGO_RECEBIDO' | 'CANCELADO'
  documento_tipo: string | null
  documento_numero: string | null
  observacoes: string | null
  created_at: string
  pagamento_terceiro: boolean
  empresa_pagadora_id: string | null
  // Novos campos de forma de pagamento
  forma_pagamento: string | null
  pix_tipo_chave: string | null
  pix_chave: string | null
  beneficiario_nome: string | null
  beneficiario_banco: string | null
  beneficiario_agencia: string | null
  beneficiario_conta: string | null
  beneficiario_conta_dv: string | null
  boleto_linha_digitavel: string | null
  boleto_codigo_barras: string | null
  // Campos virtuais
  empresa_nome?: string
  projeto_nome?: string
  subprojeto_nome?: string
  contraparte_nome?: string
  empresa_pagadora_nome?: string
  plano_conta?: PlanoContaFluxo
  retencoes?: Retencao[]
  documentos_count?: number
}

// Interface para documentos anexados
interface LancamentoDocumento {
  id: string
  lancamento_id: string
  tipo_documento: 'NOTA_FISCAL' | 'BOLETO' | 'COMPROVANTE_PAGAMENTO' | 'CONTRATO' | 'OUTRO'
  nome_arquivo: string
  nome_original: string
  extensao: string
  tamanho_bytes: number
  mime_type: string
  sharepoint_web_url: string
  sharepoint_download_url: string | null
  created_at: string
}

// Tipos de documento disponíveis
const TIPOS_DOCUMENTO = [
  { value: 'NOTA_FISCAL', label: 'Nota Fiscal', icon: '📄' },
  { value: 'BOLETO', label: 'Boleto', icon: '🧾' },
  { value: 'COMPROVANTE_PAGAMENTO', label: 'Comprovante de Pagamento', icon: '✅' },
  { value: 'CONTRATO', label: 'Contrato', icon: '📝' },
  { value: 'OUTRO', label: 'Outro', icon: '📁' }
]

// Helpers de formatação
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
  return date.split('T')[0]
}

// Função para formatar data para exibição sem aplicar timezone
const formatDateLocal = (dateString: string | null): string => {
  if (!dateString) return ''
  // Parse direto da string no formato YYYY-MM-DD para evitar conversão de timezone
  const [year, month, day] = dateString.split('T')[0].split('-')
  return `${day}/${month}/${year}`
}

// Schema de validação sem Zod - usaremos validação manual
interface LancamentoForm {
  tipo: 'Entrada' | 'Saida'
  empresa_id: string
  tipo_fluxo: string
  projeto_id?: string
  subprojeto_id?: string
  pagamento_terceiro: boolean
  empresa_pagadora_id?: string
  banco_conta_id: string
  contraparte_id: string
  plano_conta_id: string
  valor_bruto: number
  data_emissao: string
  data_vencimento: string
  data_previsao_pagamento?: string
  documento_tipo?: string
  documento_numero?: string
  observacoes?: string
  // Novos campos de forma de pagamento
  forma_pagamento?: string
  pix_tipo_chave?: string
  pix_chave?: string
  beneficiario_nome?: string
  beneficiario_banco?: string
  beneficiario_agencia?: string
  beneficiario_conta?: string
  beneficiario_conta_dv?: string
  boleto_linha_digitavel?: string
  boleto_codigo_barras?: string
}

const FORMAS_PAGAMENTO = [
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'PIX', label: 'PIX' },
  { value: 'DEPOSITO_CONTA', label: 'Depósito em Conta' },
  { value: 'DINHEIRO', label: 'Dinheiro' },
  { value: 'OUTRO', label: 'Outro' }
]

const TIPOS_CHAVE_PIX = [
  { value: 'CPF', label: 'CPF' },
  { value: 'CNPJ', label: 'CNPJ' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'TELEFONE', label: 'Telefone' },
  { value: 'ALEATORIA', label: 'Chave Aleatória' }
]

// Funções de validação e formatação de chave PIX
const validarCPF = (cpf: string): boolean => {
  const cleaned = cpf.replace(/\D/g, '')
  if (cleaned.length !== 11) return false
  if (/^(\d)\1+$/.test(cleaned)) return false
  
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(cleaned[i]) * (10 - i)
  let digit = (sum * 10) % 11
  if (digit === 10) digit = 0
  if (digit !== parseInt(cleaned[9])) return false
  
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(cleaned[i]) * (11 - i)
  digit = (sum * 10) % 11
  if (digit === 10) digit = 0
  return digit === parseInt(cleaned[10])
}

const validarCNPJ = (cnpj: string): boolean => {
  const cleaned = cnpj.replace(/\D/g, '')
  if (cleaned.length !== 14) return false
  if (/^(\d)\1+$/.test(cleaned)) return false
  
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  
  let sum = 0
  for (let i = 0; i < 12; i++) sum += parseInt(cleaned[i]) * weights1[i]
  let digit = sum % 11 < 2 ? 0 : 11 - (sum % 11)
  if (digit !== parseInt(cleaned[12])) return false
  
  sum = 0
  for (let i = 0; i < 13; i++) sum += parseInt(cleaned[i]) * weights2[i]
  digit = sum % 11 < 2 ? 0 : 11 - (sum % 11)
  return digit === parseInt(cleaned[13])
}

const validarEmail = (email: string): boolean => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return regex.test(email)
}

const validarTelefone = (telefone: string): boolean => {
  const cleaned = telefone.replace(/\D/g, '')
  // Formato: +55 + DDD (2) + Número (8 ou 9 dígitos)
  return cleaned.length >= 10 && cleaned.length <= 13
}

const validarChaveAleatoria = (chave: string): boolean => {
  // UUID formato: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (32 chars + 4 hífens)
  const regex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
  return regex.test(chave)
}

const detectarTipoChavePix = (chave: string): string | null => {
  if (!chave) return null
  
  const cleaned = chave.replace(/\D/g, '')
  
  // CPF: 11 dígitos numéricos
  if (/^\d{11}$/.test(cleaned) || /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(chave)) {
    return 'CPF'
  }
  
  // CNPJ: 14 dígitos numéricos
  if (/^\d{14}$/.test(cleaned) || /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(chave)) {
    return 'CNPJ'
  }
  
  // Telefone: começa com +55 ou tem 10-11 dígitos
  if (/^\+55/.test(chave) || (cleaned.length >= 10 && cleaned.length <= 11 && /^\d+$/.test(cleaned))) {
    return 'TELEFONE'
  }
  
  // E-mail
  if (validarEmail(chave)) {
    return 'EMAIL'
  }
  
  // Chave aleatória (UUID)
  if (validarChaveAleatoria(chave)) {
    return 'ALEATORIA'
  }
  
  return null
}

const formatarChavePix = (chave: string, tipo: string): string => {
  const cleaned = chave.replace(/\D/g, '')
  
  switch (tipo) {
    case 'CPF':
      if (cleaned.length <= 11) {
        return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, p1, p2, p3, p4) => {
          let result = p1
          if (p2) result += '.' + p2
          if (p3) result += '.' + p3
          if (p4) result += '-' + p4
          return result
        })
      }
      return chave
    case 'CNPJ':
      if (cleaned.length <= 14) {
        return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_, p1, p2, p3, p4, p5) => {
          let result = p1
          if (p2) result += '.' + p2
          if (p3) result += '.' + p3
          if (p4) result += '/' + p4
          if (p5) result += '-' + p5
          return result
        })
      }
      return chave
    case 'TELEFONE':
      if (cleaned.length <= 11) {
        if (cleaned.length <= 2) return cleaned
        if (cleaned.length <= 7) return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`
      }
      return chave
    default:
      return chave
  }
}

const validarChavePix = (chave: string, tipo: string): { valido: boolean; mensagem: string } => {
  if (!chave) return { valido: false, mensagem: 'Informe a chave PIX' }
  
  switch (tipo) {
    case 'CPF':
      return validarCPF(chave) 
        ? { valido: true, mensagem: 'CPF válido' }
        : { valido: false, mensagem: 'CPF inválido' }
    case 'CNPJ':
      return validarCNPJ(chave)
        ? { valido: true, mensagem: 'CNPJ válido' }
        : { valido: false, mensagem: 'CNPJ inválido' }
    case 'EMAIL':
      return validarEmail(chave)
        ? { valido: true, mensagem: 'E-mail válido' }
        : { valido: false, mensagem: 'E-mail inválido' }
    case 'TELEFONE':
      return validarTelefone(chave)
        ? { valido: true, mensagem: 'Telefone válido' }
        : { valido: false, mensagem: 'Telefone inválido (use formato com DDD)' }
    case 'ALEATORIA':
      return validarChaveAleatoria(chave)
        ? { valido: true, mensagem: 'Chave aleatória válida' }
        : { valido: false, mensagem: 'Chave aleatória inválida (formato UUID)' }
    default:
      return { valido: false, mensagem: 'Selecione o tipo de chave' }
  }
}

const IMPOSTOS = [
  { value: 'COFINS', label: 'COFINS' },
  { value: 'CSLL', label: 'CSLL' },
  { value: 'INSS', label: 'INSS' },
  { value: 'IRRF', label: 'IRRF' },
  { value: 'ISSQN', label: 'ISSQN' },
  { value: 'OUTRO', label: 'Outro' },
  { value: 'PIS', label: 'PIS' }
]

export default function LancamentosPage() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [subprojetos, setSubprojetos] = useState<Projeto[]>([])
  const [bancosContas, setBancosContas] = useState<BancoConta[]>([])
  const [empresasPagadoras, setEmpresasPagadoras] = useState<Empresa[]>([])
  const [contrapartes, setContrapartes] = useState<Contraparte[]>([])
  const [tiposFluxo, setTiposFluxo] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isLancamentoPago, setIsLancamentoPago] = useState(false)
  const [statusOriginal, setStatusOriginal] = useState<'ABERTO' | 'PAGO_RECEBIDO' | 'CANCELADO' | null>(null)

  // Estados para paginação infinita
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const ITEMS_PER_PAGE = 50

  // Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTipoFilter, setSelectedTipoFilter] = useState<string>('')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('')
  const [selectedEmpresaFilter, setSelectedEmpresaFilter] = useState<string>('')
  const [selectedProjetoFilter, setSelectedProjetoFilter] = useState<string>('')
  const [selectedSubprojetoFilter, setSelectedSubprojetoFilter] = useState<string>('')
  const [selectedContraparteFilter, setSelectedContraparteFilter] = useState<string>('')
  const [selectedCategoriaFilter, setSelectedCategoriaFilter] = useState<string>('')
  const [dataVencimentoInicio, setDataVencimentoInicio] = useState('')
  const [dataVencimentoFim, setDataVencimentoFim] = useState('')
  const [dataPrevisaoInicio, setDataPrevisaoInicio] = useState('')
  const [dataPrevisaoFim, setDataPrevisaoFim] = useState('')

  // Filtros de coluna (inline na tabela)
  const [colFilterTipo, setColFilterTipo] = useState<string>('')
  const [colFilterPgtoTerc, setColFilterPgtoTerc] = useState<string>('')
  const [colFilterEmpresa, setColFilterEmpresa] = useState<string>('')
  const [colFilterProjeto, setColFilterProjeto] = useState<string>('')
  const [colFilterContraparte, setColFilterContraparte] = useState<string>('')
  const [colFilterCategoria, setColFilterCategoria] = useState<string>('')
  const [colFilterValorBruto, setColFilterValorBruto] = useState<string>('')
  const [colFilterValorLiquido, setColFilterValorLiquido] = useState<string>('')
  const [colFilterVencimento, setColFilterVencimento] = useState<string>('')
  const [colFilterStatus, setColFilterStatus] = useState<string>('')

  // Listas para os filtros
  const [projetosFilter, setProjetosFilter] = useState<Projeto[]>([])
  const [subprojetosFilter, setSubprojetosFilter] = useState<Projeto[]>([])
  const [categorias, setCategorias] = useState<string[]>([])

  // Estados para combobox de contraparte
  const [contraparteSearchTerm, setContraparteSearchTerm] = useState('')
  const [showContraparteDropdown, setShowContraparteDropdown] = useState(false)
  const [contraparteNomeExibicao, setContraparteNomeExibicao] = useState('')

  // Retenções
  const [retencoes, setRetencoes] = useState<Retencao[]>([])
  const [valorBruto, setValorBruto] = useState<number>(0)
  const [valorBrutoFormatado, setValorBrutoFormatado] = useState<string>('')
  const [valorLiquido, setValorLiquido] = useState<number>(0)

  // Estados para forma de pagamento
  const [formaPagamento, setFormaPagamento] = useState<string>('')
  const [pixTipoChave, setPixTipoChave] = useState<string>('')
  const [pixChave, setPixChave] = useState<string>('')
  const [pixChaveValidacao, setPixChaveValidacao] = useState<{ valido: boolean; mensagem: string } | null>(null)
  const [beneficiarioNome, setBeneficiarioNome] = useState<string>('')
  const [beneficiarioBanco, setBeneficiarioBanco] = useState<string>('')
  const [beneficiarioAgencia, setBeneficiarioAgencia] = useState<string>('')
  const [beneficiarioConta, setBeneficiarioConta] = useState<string>('')
  const [beneficiarioContaDv, setBeneficiarioContaDv] = useState<string>('')
  const [boletoLinhaDigitavel, setBoletoLinhaDigitavel] = useState<string>('')
  const [boletoCodigoBarras, setBoletoCodigoBarras] = useState<string>('')
  const [bancos, setBancos] = useState<Banco[]>([])

  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastIdCounter, setToastIdCounter] = useState(0)
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({
    show: false,
    id: null
  })
  const [liquidarModal, setLiquidarModal] = useState<{ show: boolean; id: string | null }>({
    show: false,
    id: null
  })
  const [dataLiquidacao, setDataLiquidacao] = useState('')
  const [validationModal, setValidationModal] = useState<{ show: boolean; message: string }>({
    show: false,
    message: ''
  })

  // Estados para modal de documentos
  const [documentosModal, setDocumentosModal] = useState<{ show: boolean; lancamento: Lancamento | null }>({
    show: false,
    lancamento: null
  })
  const [documentos, setDocumentos] = useState<LancamentoDocumento[]>([])
  const [loadingDocumentos, setLoadingDocumentos] = useState(false)
  const [uploadingDocumento, setUploadingDocumento] = useState(false)
  const [tipoDocumentoSelecionado, setTipoDocumentoSelecionado] = useState<string>('NOTA_FISCAL')
  const [documentosCount, setDocumentosCount] = useState<{ [key: string]: number }>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estado para documentos pendentes (antes de salvar o lançamento)
  interface DocumentoPendente {
    id: string
    file: File
    tipo_documento: string
    nome_original: string
    tamanho_bytes: number
  }
  const [documentosPendentes, setDocumentosPendentes] = useState<DocumentoPendente[]>([])
  const [uploadingPendentes, setUploadingPendentes] = useState(false)

  const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<LancamentoForm>({
    defaultValues: {
      tipo: 'Saida',
      empresa_id: '',
      tipo_fluxo: '',
      projeto_id: '',
      subprojeto_id: '',
      pagamento_terceiro: false,
      empresa_pagadora_id: '',
      banco_conta_id: '',
      contraparte_id: '',
      plano_conta_id: '',
      valor_bruto: 0,
      data_emissao: '',
      data_vencimento: '',
      data_previsao_pagamento: '',
      documento_tipo: '',
      documento_numero: '',
      observacoes: ''
    }
  })

  const tipo = watch('tipo')
  const empresaId = watch('empresa_id')
  const tipoFluxo = watch('tipo_fluxo')
  const projetoId = watch('projeto_id')
  const pagamentoTerceiro = watch('pagamento_terceiro')
  const empresaPagadoraId = watch('empresa_pagadora_id')

  // Toast functions
  const showToast = (message: string, type: ToastType = 'success', requiresConfirmation: boolean = false) => {
    const id = toastIdCounter
    setToastIdCounter(prev => prev + 1)
    setToasts(prev => [...prev, { id, message, type, requiresConfirmation }])
    
    if (!requiresConfirmation) {
      setTimeout(() => {
        dismissToast(id)
      }, 3000)
    }
  }

  const dismissToast = (id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  // Funções para filtros de coluna
  const formatFilterCurrency = (value: string): string => {
    const numbers = value.replace(/\D/g, '')
    if (!numbers) return ''
    const amount = parseInt(numbers, 10) / 100
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount)
  }

  const parseFilterCurrency = (value: string): number => {
    if (!value) return 0
    const cleaned = value.replace(/\./g, '').replace(',', '.')
    return parseFloat(cleaned) || 0
  }

  const clearAllColumnFilters = () => {
    setColFilterTipo('')
    setColFilterPgtoTerc('')
    setColFilterEmpresa('')
    setColFilterProjeto('')
    setColFilterContraparte('')
    setColFilterCategoria('')
    setColFilterValorBruto('')
    setColFilterValorLiquido('')
    setColFilterVencimento('')
    setColFilterStatus('')
  }

  const hasActiveColumnFilters = colFilterTipo || colFilterPgtoTerc || colFilterEmpresa || 
    colFilterProjeto || colFilterContraparte || colFilterCategoria || 
    colFilterValorBruto || colFilterValorLiquido || colFilterVencimento || colFilterStatus

  const getToastStyles = (type: ToastType) => {
    switch (type) {
      case 'success':
        return { borderColor: '#10b981', icon: CheckCircle, iconColor: '#10b981' }
      case 'warning':
        return { borderColor: '#f59e0b', icon: AlertTriangle, iconColor: '#f59e0b' }
      case 'error':
        return { borderColor: '#ef4444', icon: XCircle, iconColor: '#ef4444' }
    }
  }

  // Badge styles
  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'ABERTO':
        return { bg: '#fef3c7', text: '#92400e', label: 'Aberto' }
      case 'PAGO_RECEBIDO':
        return { bg: '#d1fae5', text: '#065f46', label: 'Liquidado' }
      case 'CANCELADO':
        return { bg: '#fee2e2', text: '#991b1b', label: 'Cancelado' }
      default:
        return { bg: '#f3f4f6', text: '#1f2937', label: status }
    }
  }

  const getTipoBadgeStyle = (tipo: string) => {
    switch (tipo) {
      case 'Entrada':
        return { bg: '#d1fae5', text: '#065f46', label: 'Recebimento' }
      case 'Saida':
        return { bg: '#fee2e2', text: '#991b1b', label: 'Pagamento' }
      default:
        return { bg: '#f3f4f6', text: '#1f2937', label: tipo }
    }
  }

  // Retenções handlers
  const adicionarRetencao = () => {
    setRetencoes(prev => [...prev, { imposto: 'IRRF', valor: 0, valorFormatado: '0,00', detalhe: null }])
  }

  const removerRetencao = (index: number) => {
    const novasRetencoes = retencoes.filter((_, i) => i !== index)
    setRetencoes(novasRetencoes)
  }

  const atualizarRetencao = (index: number, campo: string, valor: string) => {
    const novasRetencoes = [...retencoes]
    if (campo === 'valorFormatado') {
      const formatted = formatCurrencyInput(valor)
      const numericValue = parseCurrencyInput(formatted)
      novasRetencoes[index].valorFormatado = formatted
      novasRetencoes[index].valor = numericValue
    } else if (campo === 'imposto') {
      novasRetencoes[index].imposto = valor
    } else if (campo === 'detalhe') {
      novasRetencoes[index].detalhe = valor
    }
    setRetencoes(novasRetencoes)
  }

  // Carregar dados iniciais
  useEffect(() => {
    fetchEmpresas()
    fetchContrapartes()
    fetchTiposFluxo()
    fetchBancos()
  }, [])

  useEffect(() => {
    if (empresaId) {
      fetchProjetos(empresaId)
      // Carregar empresas pagadoras (todas menos a selecionada)
      fetchEmpresasPagadoras(empresaId)
      // Carregar contas bancárias baseadas se é pagamento por terceiro
      if (pagamentoTerceiro && empresaPagadoraId) {
        fetchBancosContas(empresaPagadoraId)
      } else {
        fetchBancosContas(empresaId)
      }
      // Buscar projetos para o filtro
      fetchProjetosFilter(empresaId)
    } else {
      setProjetos([])
      setSubprojetos([])
      setBancosContas([])
      setEmpresasPagadoras([])
      setProjetosFilter([])
      setSubprojetosFilter([])
    }
  }, [empresaId, pagamentoTerceiro, empresaPagadoraId])

  useEffect(() => {
    if (projetoId) {
      fetchSubprojetos(projetoId)
    } else {
      setSubprojetos([])
    }
  }, [projetoId])

  useEffect(() => {
    if (selectedProjetoFilter) {
      fetchSubprojetosFilter(selectedProjetoFilter)
    } else {
      setSubprojetosFilter([])
    }
  }, [selectedProjetoFilter])

  // Calcular valor líquido quando retenções mudam ou valor bruto muda
  useEffect(() => {
    const totalRetencoes = retencoes.reduce((acc, ret) => acc + ret.valor, 0)
    const liquido = valorBruto - totalRetencoes
    setValorLiquido(liquido)
  }, [retencoes, valorBruto])

  // Carregar lançamentos quando filtros mudam
  useEffect(() => {
    setPage(0)
    setHasMore(true)
    fetchLancamentos(0, true)
  }, [
    searchTerm,
    selectedTipoFilter,
    selectedStatusFilter,
    selectedEmpresaFilter,
    selectedProjetoFilter,
    selectedSubprojetoFilter,
    selectedContraparteFilter,
    selectedCategoriaFilter,
    dataVencimentoInicio,
    dataVencimentoFim,
    dataPrevisaoInicio,
    dataPrevisaoFim
  ])

  const fetchEmpresas = async () => {
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome')
      
      if (error) throw error
      setEmpresas(data || [])
    } catch (error) {
      console.error('Erro ao carregar empresas:', error)
    }
  }

  const fetchBancos = async () => {
    try {
      const { data, error } = await supabase
        .from('bancos')
        .select('id, codigo, nome')
        .eq('ativo', true)
        .order('nome')
      
      if (error) throw error
      setBancos(data || [])
    } catch (error) {
      console.error('Erro ao carregar bancos:', error)
    }
  }

  const fetchEmpresasPagadoras = async (empresaIdExcluir: string) => {
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome')
        .eq('ativo', true)
        .neq('id', empresaIdExcluir)
        .order('nome')
      
      if (error) throw error
      setEmpresasPagadoras(data || [])
    } catch (error) {
      console.error('Erro ao carregar empresas pagadoras:', error)
    }
  }

  const fetchProjetos = async (empresaId: string) => {
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, empresa_id, nome, projeto_pai_id')
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .is('projeto_pai_id', null)
        .order('nome')
      
      if (error) throw error
      setProjetos(data || [])
    } catch (error) {
      console.error('Erro ao carregar projetos:', error)
    }
  }

  const fetchSubprojetos = async (projetoId: string) => {
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, empresa_id, nome, projeto_pai_id')
        .eq('projeto_pai_id', projetoId)
        .eq('ativo', true)
        .order('nome')
      
      if (error) throw error
      setSubprojetos(data || [])
    } catch (error) {
      console.error('Erro ao carregar subprojetos:', error)
    }
  }

  const fetchProjetosFilter = async (empresaId: string) => {
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, empresa_id, nome, projeto_pai_id')
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .is('projeto_pai_id', null)
        .order('nome')
      
      if (error) throw error
      setProjetosFilter(data || [])
    } catch (error) {
      console.error('Erro ao carregar projetos para filtro:', error)
    }
  }

  const fetchSubprojetosFilter = async (projetoId: string) => {
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, empresa_id, nome, projeto_pai_id')
        .eq('projeto_pai_id', projetoId)
        .eq('ativo', true)
        .order('nome')
      
      if (error) throw error
      setSubprojetosFilter(data || [])
    } catch (error) {
      console.error('Erro ao carregar subprojetos para filtro:', error)
    }
  }

  const fetchBancosContas = async (empresaId: string) => {
    try {
      const { data, error } = await supabase
        .from('bancos_contas')
        .select(`
          id,
          empresa_id,
          banco_nome,
          numero_conta,
          agencia,
          tipo_conta,
          banco_id,
          bancos:banco_id (
            nome
          )
        `)
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .eq('tipo_conta', 'CC')
        .order('banco_nome')
      
      if (error) throw error
      setBancosContas(data || [])
    } catch (error) {
      console.error('Erro ao carregar bancos contas:', error)
    }
  }

  const fetchContrapartes = async () => {
    try {
      // Buscar todas as contrapartes sem limite
      let allContrapartes: any[] = []
      let start = 0
      const limit = 1000
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('contrapartes')
          .select('id, nome, apelido')
          .eq('ativo', true)
          .order('nome', { ascending: true })
          .range(start, start + limit - 1)
        
        if (error) throw error
        
        if (data && data.length > 0) {
          allContrapartes = [...allContrapartes, ...data]
          start += limit
          hasMore = data.length === limit
        } else {
          hasMore = false
        }
      }
      
      setContrapartes(allContrapartes)
    } catch (error) {
      console.error('Erro ao carregar contrapartes:', error)
    }
  }

  const fetchTiposFluxo = async () => {
    try {
      const { data, error } = await supabase
        .from('plano_contas_fluxo')
        .select('tipo_fluxo')
        .eq('ativo', true)
      
      if (error) throw error
      const uniqueTipos = Array.from(new Set(data?.map(item => item.tipo_fluxo) || []))
      setTiposFluxo(uniqueTipos.sort())
    } catch (error) {
      console.error('Erro ao carregar tipos de fluxo:', error)
    }
  }

  const fetchCategorias = async () => {
    try {
      const { data, error } = await supabase
        .from('plano_contas_fluxo')
        .select('categoria')
        .eq('ativo', true)
      
      if (error) throw error
      const uniqueCategorias = Array.from(new Set(data?.map(item => item.categoria) || []))
      setCategorias(uniqueCategorias.sort())
    } catch (error) {
      console.error('Erro ao carregar categorias:', error)
    }
  }

  useEffect(() => {
    fetchCategorias()
  }, [])

  const fetchLancamentos = async (pageNum: number = 0, reset: boolean = false) => {
    try {
      if (pageNum === 0) {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }

      let query = supabase
        .from('lancamentos')
        .select(`
          id,
          tipo,
          empresa_id,
          projeto_id,
          subprojeto_id,
          banco_conta_id,
          contraparte_id,
          plano_conta_id,
          pagamento_terceiro,
          empresa_pagadora_id,
          valor_bruto,
          valor_liquido,
          data_emissao,
          data_vencimento,
          data_previsao_pagamento,
          data_liquidacao,
          status,
          documento_tipo,
          documento_numero,
          observacoes,
          created_at,
          empresas!lancamentos_empresa_id_fkey(nome),
          empresa_pagadora:empresas!lancamentos_empresa_pagadora_id_fkey(nome),
          projeto:projetos!projeto_id(nome),
          subprojeto:projetos!subprojeto_id(nome),
          contrapartes(nome, apelido),
          plano_contas_fluxo!inner(
            id,
            codigo_conta,
            categoria,
            subcategoria,
            tipo_fluxo
          )
        `)

      // Aplicar filtros
      if (selectedTipoFilter) {
        query = query.eq('tipo', selectedTipoFilter)
      }
      if (selectedStatusFilter) {
        query = query.eq('status', selectedStatusFilter)
      }
      if (selectedEmpresaFilter) {
        query = query.eq('empresa_id', selectedEmpresaFilter)
      }
      if (selectedProjetoFilter) {
        query = query.eq('projeto_id', selectedProjetoFilter)
      }
      if (selectedSubprojetoFilter) {
        query = query.eq('subprojeto_id', selectedSubprojetoFilter)
      }
      if (selectedContraparteFilter) {
        query = query.eq('contraparte_id', selectedContraparteFilter)
      }
      if (selectedCategoriaFilter) {
        query = query.eq('plano_contas_fluxo.categoria', selectedCategoriaFilter)
      }
      if (dataVencimentoInicio) {
        query = query.gte('data_vencimento', dataVencimentoInicio)
      }
      if (dataVencimentoFim) {
        query = query.lte('data_vencimento', dataVencimentoFim)
      }
      if (dataPrevisaoInicio) {
        query = query.gte('data_previsao_pagamento', dataPrevisaoInicio)
      }
      if (dataPrevisaoFim) {
        query = query.lte('data_previsao_pagamento', dataPrevisaoFim)
      }
      if (searchTerm) {
        query = query.or(`documento_numero.ilike.%${searchTerm}%,observacoes.ilike.%${searchTerm}%`)
      }

      // Paginação
      const from = pageNum * ITEMS_PER_PAGE
      const to = from + ITEMS_PER_PAGE - 1

      query = query
        .order('data_vencimento', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to)

      const { data, error } = await query

      if (error) throw error

      const formattedData = (data || []).map((item: any) => ({
        ...item,
        empresa_nome: item.empresas?.nome,
        empresa_pagadora_nome: Array.isArray(item.empresa_pagadora) ? item.empresa_pagadora[0]?.nome : item.empresa_pagadora?.nome,
        projeto_nome: item.projeto?.nome,
        subprojeto_nome: item.subprojeto?.nome,
        contraparte_nome: Array.isArray(item.contrapartes) 
          ? (item.contrapartes[0]?.apelido || item.contrapartes[0]?.nome)
          : (item.contrapartes?.apelido || item.contrapartes?.nome),
        plano_conta: item.plano_contas_fluxo
      }))

      // Buscar retenções para cada lançamento
      const lancamentosComRetencoes = await Promise.all(
        formattedData.map(async (lanc: any) => {
          const { data: retencoesData, error: retencoesError } = await supabase
            .from('lancamento_retencoes')
            .select('*')
            .eq('lancamento_id', lanc.id)

          if (retencoesError) {
            console.error('Erro ao buscar retenções:', retencoesError)
            return { ...lanc, retencoes: [] }
          }

          return {
            ...lanc,
            retencoes: retencoesData || []
          }
        })
      )

      if (reset || pageNum === 0) {
        setLancamentos(lancamentosComRetencoes)
        // Buscar contagem de documentos para os lançamentos carregados
        const ids = lancamentosComRetencoes.map((l: Lancamento) => l.id)
        fetchDocumentosCount(ids)
      } else {
        setLancamentos(prev => [...prev, ...lancamentosComRetencoes])
        // Buscar contagem de documentos para os novos lançamentos
        const ids = lancamentosComRetencoes.map((l: Lancamento) => l.id)
        fetchDocumentosCount(ids)
      }

      setHasMore(lancamentosComRetencoes.length === ITEMS_PER_PAGE)
    } catch (error) {
      console.error('Erro ao carregar lançamentos:', error)
      showToast('Erro ao carregar lançamentos', 'error')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const handleLoadMore = () => {
    const nextPage = page + 1
    setPage(nextPage)
    fetchLancamentos(nextPage, false)
  }

  const openModal = async (lancamento?: Lancamento) => {
    if (lancamento) {
      setEditingId(lancamento.id)
      setIsLancamentoPago(lancamento.status === 'PAGO_RECEBIDO')
      setStatusOriginal(lancamento.status)
      
      // Carregar dados dependentes da empresa
      await fetchProjetos(lancamento.empresa_id)
      await fetchEmpresasPagadoras(lancamento.empresa_id)
      
      // Carregar contas bancárias baseadas em pagamento_terceiro
      if (lancamento.pagamento_terceiro && lancamento.empresa_pagadora_id) {
        await fetchBancosContas(lancamento.empresa_pagadora_id)
      } else {
        await fetchBancosContas(lancamento.empresa_id)
      }
      
      // Se tiver projeto, carregar subprojetos
      if (lancamento.projeto_id) {
        await fetchSubprojetos(lancamento.projeto_id)
      }
      
      setValue('tipo', lancamento.tipo)
      setValue('empresa_id', lancamento.empresa_id)
      setValue('projeto_id', lancamento.projeto_id || '')
      setValue('subprojeto_id', lancamento.subprojeto_id || '')
      setValue('pagamento_terceiro', lancamento.pagamento_terceiro || false)
      setValue('empresa_pagadora_id', lancamento.empresa_pagadora_id || '')
      setValue('banco_conta_id', lancamento.banco_conta_id || '')
      setValue('contraparte_id', lancamento.contraparte_id || '')
      setValue('plano_conta_id', lancamento.plano_conta_id)
      setValue('data_emissao', formatDateForInput(lancamento.data_emissao))
      setValue('data_vencimento', formatDateForInput(lancamento.data_vencimento))
      setValue('data_previsao_pagamento', formatDateForInput(lancamento.data_previsao_pagamento))
      setValue('documento_tipo', lancamento.documento_tipo || '')
      setValue('documento_numero', lancamento.documento_numero || '')
      setValue('observacoes', lancamento.observacoes || '')
      
      // Definir valor bruto
      setValorBruto(lancamento.valor_bruto)
      setValorBrutoFormatado(formatCurrencyInput(lancamento.valor_bruto.toFixed(2)))
      setValue('valor_bruto', lancamento.valor_bruto)

      // Carregar campos de forma de pagamento
      setFormaPagamento(lancamento.forma_pagamento || '')
      setPixTipoChave(lancamento.pix_tipo_chave || '')
      setPixChave(lancamento.pix_chave || '')
      setBeneficiarioNome(lancamento.beneficiario_nome || '')
      setBeneficiarioBanco(lancamento.beneficiario_banco || '')
      setBeneficiarioAgencia(lancamento.beneficiario_agencia || '')
      setBeneficiarioConta(lancamento.beneficiario_conta || '')
      setBeneficiarioContaDv(lancamento.beneficiario_conta_dv || '')
      setBoletoLinhaDigitavel(lancamento.boleto_linha_digitavel || '')
      setBoletoCodigoBarras(lancamento.boleto_codigo_barras || '')
      
      // Validar chave PIX se existir
      if (lancamento.pix_tipo_chave && lancamento.pix_chave) {
        setPixChaveValidacao(validarChavePix(lancamento.pix_chave, lancamento.pix_tipo_chave))
      } else {
        setPixChaveValidacao(null)
      }

      // Carregar tipo_fluxo
      if (lancamento.plano_conta) {
        setValue('tipo_fluxo', lancamento.plano_conta.tipo_fluxo)
      }

      // Carregar retenções
      const { data: retencoesData, error: retencoesError } = await supabase
        .from('lancamento_retencoes')
        .select('*')
        .eq('lancamento_id', lancamento.id)

      if (retencoesError) {
        console.error('Erro ao carregar retenções:', retencoesError)
        setRetencoes([])
      } else {
        const retencoesFormatadas = (retencoesData || []).map(ret => ({
          ...ret,
          valorFormatado: formatCurrencyInput(ret.valor.toFixed(2))
        }))
        setRetencoes(retencoesFormatadas)
      }

      // Carregar nome da contraparte
      if (lancamento.contraparte_id) {
        // Primeiro tentar usar o nome que veio com o lançamento
        if (lancamento.contraparte_nome) {
          setContraparteNomeExibicao(lancamento.contraparte_nome)
        } else {
          // Se não veio, buscar na lista de contrapartes
          const contraparte = contrapartes.find(c => c.id === lancamento.contraparte_id)
          if (contraparte) {
            setContraparteNomeExibicao(contraparte.apelido || contraparte.nome)
          }
        }
      } else {
        setContraparteNomeExibicao('')
      }

      // Carregar documentos do lançamento
      setDocumentos([])
      setLoadingDocumentos(true)
      try {
        const formData = new FormData()
        formData.append('action', 'list')
        formData.append('lancamento_id', lancamento.id)

        const response = await fetch('/api/sharepoint', {
          method: 'POST',
          body: formData
        })

        const result = await response.json()
        if (response.ok) {
          setDocumentos(result.documentos || [])
        }
      } catch (error) {
        console.error('Erro ao carregar documentos:', error)
      } finally {
        setLoadingDocumentos(false)
      }
    } else {
      setEditingId(null)
      setIsLancamentoPago(false)
      setStatusOriginal(null)
      reset()
      setRetencoes([])
      setValorBruto(0)
      setValorBrutoFormatado('')
      setValorLiquido(0)
      setContraparteNomeExibicao('')
      // Limpar campos de forma de pagamento
      setFormaPagamento('')
      setPixTipoChave('')
      setPixChave('')
      setPixChaveValidacao(null)
      setBeneficiarioNome('')
      setBeneficiarioBanco('')
      setBeneficiarioAgencia('')
      setBeneficiarioConta('')
      setBeneficiarioContaDv('')
      setBoletoLinhaDigitavel('')
      setBoletoCodigoBarras('')
      // Limpar documentos
      setDocumentos([])
      setLoadingDocumentos(false)
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingId(null)
    setIsLancamentoPago(false)
    setStatusOriginal(null)
    reset()
    setRetencoes([])
    setValorBruto(0)
    setValorBrutoFormatado('')
    setValorLiquido(0)
    setContraparteNomeExibicao('')
    // Limpar campos de forma de pagamento
    setFormaPagamento('')
    setPixTipoChave('')
    setPixChave('')
    setPixChaveValidacao(null)
    setBeneficiarioNome('')
    setBeneficiarioBanco('')
    setBeneficiarioAgencia('')
    setBeneficiarioConta('')
    setBeneficiarioContaDv('')
    setBoletoLinhaDigitavel('')
    setBoletoCodigoBarras('')
    // Limpar documentos
    setDocumentos([])
    setLoadingDocumentos(false)
    // Limpar documentos pendentes (descartar ao cancelar)
    setDocumentosPendentes([])
  }

  const onSubmit = async (formData: LancamentoForm) => {
    try {
      // Validação de campos obrigatórios
      const camposFaltando: string[] = []

      if (!formData.empresa_id) camposFaltando.push('Empresa')
      if (!formData.tipo_fluxo) camposFaltando.push('Tipo de Fluxo')
      if (formData.tipo_fluxo !== 'Corporativo' && !formData.projeto_id) camposFaltando.push('Projeto')
      if (formData.pagamento_terceiro && !formData.empresa_pagadora_id) camposFaltando.push('Empresa Pagadora')
      if (!formData.banco_conta_id) camposFaltando.push('Conta Bancária')
      if (!formData.contraparte_id) camposFaltando.push('Contraparte')
      if (!formData.plano_conta_id) camposFaltando.push('Plano de Conta')
      if (!valorBruto || valorBruto <= 0) camposFaltando.push('Valor Bruto')
      if (!formData.data_emissao) camposFaltando.push('Data Emissão')
      if (!formData.data_vencimento) camposFaltando.push('Data Vencimento')

      if (camposFaltando.length > 0) {
        const mensagem = camposFaltando.join(', ')
        setValidationModal({ show: true, message: mensagem })
        return
      }

      const lancamentoData = {
        tipo: formData.tipo,
        empresa_id: formData.empresa_id,
        projeto_id: formData.projeto_id || null,
        subprojeto_id: formData.subprojeto_id || null,
        pagamento_terceiro: formData.pagamento_terceiro || false,
        empresa_pagadora_id: formData.pagamento_terceiro ? formData.empresa_pagadora_id || null : null,
        banco_conta_id: formData.banco_conta_id,
        contraparte_id: formData.contraparte_id,
        plano_conta_id: formData.plano_conta_id,
        valor_bruto: valorBruto,
        valor_liquido: valorLiquido,
        data_emissao: formData.data_emissao,
        data_vencimento: formData.data_vencimento,
        data_previsao_pagamento: formData.data_previsao_pagamento || null,
        documento_tipo: formData.documento_tipo || null,
        documento_numero: formData.documento_numero || null,
        observacoes: formData.observacoes || null,
        // Novos campos de forma de pagamento
        forma_pagamento: formaPagamento || null,
        pix_tipo_chave: formaPagamento === 'PIX' ? pixTipoChave || null : null,
        pix_chave: formaPagamento === 'PIX' ? pixChave || null : null,
        beneficiario_nome: ['PIX', 'DEPOSITO_CONTA'].includes(formaPagamento) ? beneficiarioNome || null : null,
        beneficiario_banco: ['PIX', 'DEPOSITO_CONTA'].includes(formaPagamento) ? beneficiarioBanco || null : null,
        beneficiario_agencia: ['PIX', 'DEPOSITO_CONTA'].includes(formaPagamento) ? beneficiarioAgencia || null : null,
        beneficiario_conta: ['PIX', 'DEPOSITO_CONTA'].includes(formaPagamento) ? beneficiarioConta || null : null,
        beneficiario_conta_dv: ['PIX', 'DEPOSITO_CONTA'].includes(formaPagamento) ? beneficiarioContaDv || null : null,
        boleto_linha_digitavel: formaPagamento === 'BOLETO' ? boletoLinhaDigitavel || null : null,
        boleto_codigo_barras: formaPagamento === 'BOLETO' ? boletoCodigoBarras || null : null
      }

      if (editingId) {
        // Atualizar
        const { error } = await supabase
          .from('lancamentos')
          .update(lancamentoData)
          .eq('id', editingId)

        if (error) throw error

        // Deletar retenções antigas
        await supabase
          .from('lancamento_retencoes')
          .delete()
          .eq('lancamento_id', editingId)

        // Inserir novas retenções
        if (retencoes.length > 0) {
          const retencoesData = retencoes.map(ret => ({
            lancamento_id: editingId,
            imposto: ret.imposto,
            valor: ret.valor,
            detalhe: ret.detalhe
          }))

          const { error: retencoesError } = await supabase
            .from('lancamento_retencoes')
            .insert(retencoesData)

          if (retencoesError) throw retencoesError
        }

        showToast('Lançamento atualizado com sucesso!')
      } else {
        // Criar
        const { data, error } = await supabase
          .from('lancamentos')
          .insert([lancamentoData])
          .select()
          .single()

        if (error) throw error

        // Inserir retenções
        if (retencoes.length > 0) {
          const retencoesData = retencoes.map(ret => ({
            lancamento_id: data.id,
            imposto: ret.imposto,
            valor: ret.valor,
            detalhe: ret.detalhe
          }))

          const { error: retencoesError } = await supabase
            .from('lancamento_retencoes')
            .insert(retencoesData)

          if (retencoesError) throw retencoesError
        }

        // Upload de documentos pendentes
        if (documentosPendentes.length > 0) {
          // Buscar nome da empresa
          const empresa = empresas.find(e => e.id === formData.empresa_id)
          const empresaNome = empresa?.nome || 'Sem Empresa'
          
          await uploadDocumentosPendentes(data.id, empresaNome, formData.data_vencimento)
          showToast(`Lançamento criado com sucesso! ${documentosPendentes.length} documento(s) anexado(s).`)
        } else {
          showToast('Lançamento criado com sucesso!')
        }
      }

      closeModal()
      fetchLancamentos()
    } catch (error) {
      console.error('Erro ao salvar lançamento:', error)
      showToast('Erro ao salvar lançamento', 'error', true)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      // Primeiro deletar as retenções
      await supabase
        .from('lancamento_retencoes')
        .delete()
        .eq('lancamento_id', id)

      // Depois deletar o lançamento
      const { error } = await supabase
        .from('lancamentos')
        .delete()
        .eq('id', id)

      if (error) throw error

      showToast('Lançamento excluído com sucesso!')
      setDeleteConfirm({ show: false, id: null })
      fetchLancamentos()
    } catch (error) {
      console.error('Erro ao excluir lançamento:', error)
      showToast('Erro ao excluir lançamento', 'error', true)
    }
  }

  const handleLiquidar = async () => {
    if (!liquidarModal.id || !dataLiquidacao) return

    try {
      const { error } = await supabase
        .from('lancamentos')
        .update({
          status: 'PAGO_RECEBIDO',
          data_liquidacao: dataLiquidacao
        })
        .eq('id', liquidarModal.id)

      if (error) throw error

      showToast('Lançamento liquidado com sucesso!')
      setLiquidarModal({ show: false, id: null })
      setDataLiquidacao('')
      fetchLancamentos()
    } catch (error) {
      console.error('Erro ao liquidar lançamento:', error)
      showToast('Erro ao liquidar lançamento', 'error', true)
    }
  }

  // ==================== FUNÇÕES DE DOCUMENTOS ====================

  // Buscar contagem de documentos para todos os lançamentos visíveis
  const fetchDocumentosCount = async (lancamentoIds: string[]) => {
    if (lancamentoIds.length === 0) return

    try {
      const { data, error } = await supabase
        .from('lancamento_documentos')
        .select('lancamento_id')
        .in('lancamento_id', lancamentoIds)

      if (error) throw error

      const counts: { [key: string]: number } = {}
      data?.forEach(doc => {
        counts[doc.lancamento_id] = (counts[doc.lancamento_id] || 0) + 1
      })
      setDocumentosCount(counts)
    } catch (error) {
      console.error('Erro ao buscar contagem de documentos:', error)
    }
  }

  // Abrir modal de documentos
  const openDocumentosModal = async (lancamento: Lancamento) => {
    setDocumentosModal({ show: true, lancamento })
    setDocumentos([])
    setLoadingDocumentos(true)

    try {
      const formData = new FormData()
      formData.append('action', 'list')
      formData.append('lancamento_id', lancamento.id)

      const response = await fetch('/api/sharepoint', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao buscar documentos')
      }

      setDocumentos(result.documentos || [])
    } catch (error: any) {
      console.error('Erro ao buscar documentos:', error)
      showToast('Erro ao carregar documentos: ' + error.message, 'error')
    } finally {
      setLoadingDocumentos(false)
    }
  }

  // Upload de documento
  const handleUploadDocumento = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Determinar o lançamento: do modal de documentos ou do modal de edição
    let lancamentoId: string | null = null
    let empresaNome: string = 'Sem Empresa'
    let dataVencimento: string = ''

    if (documentosModal.lancamento) {
      // Veio do modal de documentos separado
      lancamentoId = documentosModal.lancamento.id
      empresaNome = documentosModal.lancamento.empresa_nome || 'Sem Empresa'
      dataVencimento = documentosModal.lancamento.data_vencimento
    } else if (editingId) {
      // Veio do modal de edição de lançamento
      lancamentoId = editingId
      // Buscar dados do lançamento
      const lancamentoAtual = lancamentos.find(l => l.id === editingId)
      if (lancamentoAtual) {
        empresaNome = lancamentoAtual.empresa_nome || 'Sem Empresa'
        dataVencimento = lancamentoAtual.data_vencimento
      }
    }

    if (!lancamentoId) {
      showToast('Erro: ID do lançamento não encontrado', 'error')
      return
    }

    setUploadingDocumento(true)

    try {
      const formData = new FormData()
      formData.append('action', 'upload')
      formData.append('file', file)
      formData.append('lancamento_id', lancamentoId)
      formData.append('tipo_documento', tipoDocumentoSelecionado)
      formData.append('empresa_nome', empresaNome)
      formData.append('data_vencimento', dataVencimento)
      
      // Buscar org_id da sessão ou usar default
      const { data: orgData } = await supabase
        .from('lancamentos')
        .select('empresa_id, empresas!inner(org_id)')
        .eq('id', lancamentoId)
        .single()

      if (orgData?.empresas) {
        formData.append('org_id', (orgData.empresas as any).org_id)
      }

      const response = await fetch('/api/sharepoint', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao fazer upload')
      }

      showToast('Documento enviado com sucesso!')
      
      // Atualizar lista de documentos
      setDocumentos(prev => [result.documento, ...prev])
      
      // Atualizar contagem
      setDocumentosCount(prev => ({
        ...prev,
        [lancamentoId!]: (prev[lancamentoId!] || 0) + 1
      }))

    } catch (error: any) {
      console.error('Erro ao fazer upload:', error)
      showToast('Erro ao enviar documento: ' + error.message, 'error')
    } finally {
      setUploadingDocumento(false)
      // Limpar input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Deletar documento
  const handleDeleteDocumento = async (documentoId: string) => {
    if (!confirm('Tem certeza que deseja excluir este documento?')) return

    try {
      const formData = new FormData()
      formData.append('action', 'delete')
      formData.append('documento_id', documentoId)

      const response = await fetch('/api/sharepoint', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao excluir')
      }

      showToast('Documento excluído com sucesso!')
      
      // Remover da lista
      setDocumentos(prev => prev.filter(d => d.id !== documentoId))
      
      // Atualizar contagem
      const lancamentoId = documentosModal.lancamento?.id || editingId
      if (lancamentoId) {
        setDocumentosCount(prev => ({
          ...prev,
          [lancamentoId]: Math.max(0, (prev[lancamentoId] || 0) - 1)
        }))
      }

    } catch (error: any) {
      console.error('Erro ao excluir documento:', error)
      showToast('Erro ao excluir documento: ' + error.message, 'error')
    }
  }

  // Visualizar documento
  const handleViewDocumento = async (documento: LancamentoDocumento) => {
    try {
      const response = await fetch(`/api/sharepoint?id=${documento.id}&action=view`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao obter URL')
      }

      // Abrir em nova aba
      window.open(result.url, '_blank')
    } catch (error: any) {
      console.error('Erro ao visualizar documento:', error)
      showToast('Erro ao abrir documento: ' + error.message, 'error')
    }
  }

  // Download de documento
  const handleDownloadDocumento = async (documento: LancamentoDocumento) => {
    try {
      const response = await fetch(`/api/sharepoint?id=${documento.id}&action=download`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao obter URL')
      }

      // Criar link temporário para download
      const link = document.createElement('a')
      link.href = result.url
      link.download = result.nome
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error: any) {
      console.error('Erro ao baixar documento:', error)
      showToast('Erro ao baixar documento: ' + error.message, 'error')
    }
  }

  // Formatar tamanho do arquivo
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Obter ícone do tipo de documento
  const getTipoDocumentoIcon = (tipo: string): string => {
    const tipoDoc = TIPOS_DOCUMENTO.find(t => t.value === tipo)
    return tipoDoc?.icon || '📁'
  }

  // Obter label do tipo de documento
  const getTipoDocumentoLabel = (tipo: string): string => {
    const tipoDoc = TIPOS_DOCUMENTO.find(t => t.value === tipo)
    return tipoDoc?.label || tipo
  }

  // Adicionar documento pendente (antes de salvar o lançamento)
  const handleAddDocumentoPendente = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const novoPendente = {
      id: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      file: file,
      tipo_documento: tipoDocumentoSelecionado,
      nome_original: file.name,
      tamanho_bytes: file.size
    }

    setDocumentosPendentes(prev => [...prev, novoPendente])

    // Limpar input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Remover documento pendente
  const handleRemoveDocumentoPendente = (id: string) => {
    setDocumentosPendentes(prev => prev.filter(d => d.id !== id))
  }

  // Fazer upload de todos os documentos pendentes após salvar o lançamento
  const uploadDocumentosPendentes = async (lancamentoId: string, empresaNome: string, dataVencimento: string) => {
    if (documentosPendentes.length === 0) return

    setUploadingPendentes(true)

    try {
      // Buscar org_id
      const { data: orgData } = await supabase
        .from('lancamentos')
        .select('empresa_id, empresas!inner(org_id)')
        .eq('id', lancamentoId)
        .single()

      const orgId = orgData?.empresas ? (orgData.empresas as any).org_id : null

      for (const doc of documentosPendentes) {
        try {
          const formData = new FormData()
          formData.append('action', 'upload')
          formData.append('file', doc.file)
          formData.append('lancamento_id', lancamentoId)
          formData.append('tipo_documento', doc.tipo_documento)
          formData.append('empresa_nome', empresaNome)
          formData.append('data_vencimento', dataVencimento)
          if (orgId) {
            formData.append('org_id', orgId)
          }

          const response = await fetch('/api/sharepoint', {
            method: 'POST',
            body: formData
          })

          if (!response.ok) {
            const result = await response.json()
            console.error('Erro ao fazer upload:', result.error)
          }
        } catch (error) {
          console.error('Erro ao fazer upload do documento:', doc.nome_original, error)
        }
      }

      // Atualizar contagem
      setDocumentosCount(prev => ({
        ...prev,
        [lancamentoId]: (prev[lancamentoId] || 0) + documentosPendentes.length
      }))

      // Limpar pendentes
      setDocumentosPendentes([])

    } catch (error) {
      console.error('Erro ao fazer upload dos documentos pendentes:', error)
    } finally {
      setUploadingPendentes(false)
    }
  }

  // Filtrar e ordenar contrapartes
  const filteredContrapartes = contrapartes
    .filter(c =>
      contraparteSearchTerm === '' ||
      c.nome.toLowerCase().includes(contraparteSearchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const nomeA = a.nome.toLowerCase()
      const nomeB = b.nome.toLowerCase()
      return nomeA.localeCompare(nomeB)
    })

  const handleSelectContraparte = (contraparte: Contraparte) => {
    setValue('contraparte_id', contraparte.id)
    setContraparteNomeExibicao(contraparte.nome)
    setContraparteSearchTerm('')
    setShowContraparteDropdown(false)
  }

  // Filtrar lançamentos pelos filtros de coluna
  const lancamentosFiltrados = lancamentos.filter((lancamento) => {
    // Filtro TIPO
    if (colFilterTipo && lancamento.tipo !== colFilterTipo) return false

    // Filtro PGTO TERC
    if (colFilterPgtoTerc) {
      const isPgtoTerc = lancamento.pagamento_terceiro
      if (colFilterPgtoTerc === 'SIM' && !isPgtoTerc) return false
      if (colFilterPgtoTerc === 'NAO' && isPgtoTerc) return false
    }

    // Filtro EMPRESA
    if (colFilterEmpresa && lancamento.empresa_id !== colFilterEmpresa) return false

    // Filtro PROJETO
    if (colFilterProjeto && lancamento.projeto_id !== colFilterProjeto) return false

    // Filtro CONTRAPARTE
    if (colFilterContraparte && colFilterContraparte.trim() !== '') {
      const filterLower = colFilterContraparte.toLowerCase()
      const contraparteLower = (lancamento.contraparte_nome || '').toLowerCase()
      if (!contraparteLower.includes(filterLower)) return false
    }

    // Filtro CATEGORIA
    if (colFilterCategoria && lancamento.plano_conta?.categoria !== colFilterCategoria) return false

    // Filtro VALOR BRUTO
    if (colFilterValorBruto) {
      const filterValue = parseFilterCurrency(colFilterValorBruto)
      if (filterValue > 0 && lancamento.valor_bruto !== filterValue) return false
    }

    // Filtro VALOR LÍQUIDO
    if (colFilterValorLiquido) {
      const filterValue = parseFilterCurrency(colFilterValorLiquido)
      if (filterValue > 0 && lancamento.valor_liquido !== filterValue) return false
    }

    // Filtro VENCIMENTO
    if (colFilterVencimento && lancamento.data_vencimento !== colFilterVencimento) return false

    // Filtro STATUS
    if (colFilterStatus && lancamento.status !== colFilterStatus) return false

    return true
  })

  // Extrair valores únicos de valor_bruto e valor_liquido para os datalists
  const valoresBrutosUnicos = Array.from(new Set(lancamentos.map(l => l.valor_bruto)))
    .sort((a, b) => a - b)
  const valoresLiquidosUnicos = Array.from(new Set(lancamentos.map(l => l.valor_liquido)))
    .sort((a, b) => a - b)

  return (
    <div style={{ padding: '24px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      {/* Cabeçalho */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <h1 style={{
          fontSize: '26px',
          fontWeight: '700',
          color: '#1f2937',
          margin: 0
        }}>
          Lançamentos Financeiros
        </h1>
        <button
          onClick={() => openModal()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 20px',
            backgroundColor: '#1555D6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1044b5'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1555D6'}
        >
          <Plus size={16} />
          Novo Lançamento
        </button>
      </div>

      {/* Filtros */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '16px'
        }}>
          {/* Busca */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Buscar
            </label>
            <div style={{ position: 'relative' }}>
              <Search style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '16px',
                height: '16px',
                color: '#9ca3af'
              }} />
              <input
                type="text"
                placeholder="Doc ou Observação..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 10px 9px 36px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#1555D6'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>
          </div>

          {/* Filtro Tipo */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Tipo
            </label>
            <select
              value={selectedTipoFilter}
              onChange={(e) => setSelectedTipoFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todos</option>
              <option value="Entrada">Recebimento</option>
              <option value="Saida">Pagamento</option>
            </select>
          </div>

          {/* Filtro Status */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Status
            </label>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todos</option>
              <option value="ABERTO">Aberto</option>
              <option value="PAGO_RECEBIDO">Liquidado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </div>

          {/* Filtro Empresa */}
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
              value={selectedEmpresaFilter}
              onChange={(e) => {
                setSelectedEmpresaFilter(e.target.value)
                setSelectedProjetoFilter('')
                setSelectedSubprojetoFilter('')
                if (e.target.value) {
                  fetchProjetosFilter(e.target.value)
                } else {
                  setProjetosFilter([])
                  setSubprojetosFilter([])
                }
              }}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todas</option>
              {empresas.map(empresa => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Projeto */}
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
              value={selectedProjetoFilter}
              onChange={(e) => {
                setSelectedProjetoFilter(e.target.value)
                setSelectedSubprojetoFilter('')
                if (e.target.value) {
                  fetchSubprojetosFilter(e.target.value)
                } else {
                  setSubprojetosFilter([])
                }
              }}
              disabled={!selectedEmpresaFilter}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: selectedEmpresaFilter ? 'pointer' : 'not-allowed',
                backgroundColor: selectedEmpresaFilter ? 'white' : '#f9fafb',
                color: selectedEmpresaFilter ? '#1f2937' : '#9ca3af'
              }}
            >
              <option value="">Todos</option>
              {projetosFilter.map(projeto => (
                <option key={projeto.id} value={projeto.id}>
                  {projeto.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Subprojeto */}
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
              value={selectedSubprojetoFilter}
              onChange={(e) => setSelectedSubprojetoFilter(e.target.value)}
              disabled={!selectedProjetoFilter}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: selectedProjetoFilter ? 'pointer' : 'not-allowed',
                backgroundColor: selectedProjetoFilter ? 'white' : '#f9fafb',
                color: selectedProjetoFilter ? '#1f2937' : '#9ca3af'
              }}
            >
              <option value="">Todos</option>
              {subprojetosFilter.map(subprojeto => (
                <option key={subprojeto.id} value={subprojeto.id}>
                  {subprojeto.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Contraparte */}
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
              value={selectedContraparteFilter}
              onChange={(e) => setSelectedContraparteFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todas</option>
              {contrapartes.map(contraparte => (
                <option key={contraparte.id} value={contraparte.id}>
                  {contraparte.apelido || contraparte.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Categoria */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Categoria
            </label>
            <select
              value={selectedCategoriaFilter}
              onChange={(e) => setSelectedCategoriaFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Todas</option>
              {categorias.map(categoria => (
                <option key={categoria} value={categoria}>
                  {categoria}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Data Vencimento Início */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Vencimento (Início)
            </label>
            <input
              type="date"
              value={dataVencimentoInicio}
              onChange={(e) => setDataVencimentoInicio(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>

          {/* Filtro Data Vencimento Fim */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Vencimento (Fim)
            </label>
            <input
              type="date"
              value={dataVencimentoFim}
              onChange={(e) => setDataVencimentoFim(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>

          {/* Filtro Data Previsão Início */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Previsão Pgto (Início)
            </label>
            <input
              type="date"
              value={dataPrevisaoInicio}
              onChange={(e) => setDataPrevisaoInicio(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>

          {/* Filtro Data Previsão Fim */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}>
              Previsão Pgto (Fim)
            </label>
            <input
              type="date"
              value={dataPrevisaoFim}
              onChange={(e) => setDataPrevisaoFim(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 10px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>
        </div>

        {/* Botões de ação */}
        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={() => {
              setSearchTerm('')
              setSelectedTipoFilter('')
              setSelectedStatusFilter('')
              setSelectedEmpresaFilter('')
              setSelectedProjetoFilter('')
              setSelectedSubprojetoFilter('')
              setSelectedContraparteFilter('')
              setSelectedCategoriaFilter('')
              setDataVencimentoInicio('')
              setDataVencimentoFim('')
              setDataPrevisaoInicio('')
              setDataPrevisaoFim('')
              setProjetosFilter([])
              setSubprojetosFilter([])
              // Limpar filtros de coluna
              clearAllColumnFilters()
            }}
            style={{
              padding: '9px 18px',
              backgroundColor: 'white',
              color: '#6b7280',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
          >
            Limpar Filtros
          </button>
          <button
            onClick={() => fetchLancamentos()}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 18px',
              backgroundColor: loading ? '#d1d5db' : '#1555D6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = '#1044b5'
            }}
            onMouseOut={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = '#1555D6'
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        {/* Indicador de filtros de coluna ativos */}
        {hasActiveColumnFilters && (
          <div style={{
            padding: '8px 16px',
            backgroundColor: '#eff6ff',
            borderBottom: '1px solid #bfdbfe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ fontSize: '13px', color: '#1e40af' }}>
              <strong>{lancamentosFiltrados.length}</strong> de <strong>{lancamentos.length}</strong> lançamentos exibidos (filtros de coluna ativos)
            </span>
            <button
              onClick={clearAllColumnFilters}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#1e40af',
                backgroundColor: 'white',
                border: '1px solid #93c5fd',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Limpar filtros de coluna
            </button>
          </div>
        )}
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'left',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  TIPO
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'center',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  PGTO TERC
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'left',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  EMPRESA
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'left',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  PROJETO
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'left',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  CONTRAPARTE
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'left',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  CATEGORIA
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'right',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  VALOR BRUTO
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'right',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  VALOR LÍQUIDO
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'center',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  VENCIMENTO
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'center',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  STATUS
                </th>
                <th style={{
                  padding: '6px 8px',
                  textAlign: 'center',
                  fontSize: '8px',
                  fontWeight: '600',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  whiteSpace: 'nowrap',
                }}>
                  AÇÕES
                </th>
              </tr>
              {/* Linha de Filtros */}
              <tr style={{ backgroundColor: '#ffffff', borderBottom: '2px solid #e5e7eb' }}>
                {/* Filtro TIPO */}
                <td style={{ padding: '4px 8px' }}>
                  <select
                    value={colFilterTipo}
                    onChange={(e) => setColFilterTipo(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Todos</option>
                    <option value="Saida">Pagamento</option>
                    <option value="Entrada">Recebimento</option>
                  </select>
                </td>
                {/* Filtro PGTO TERC */}
                <td style={{ padding: '4px 8px' }}>
                  <select
                    value={colFilterPgtoTerc}
                    onChange={(e) => setColFilterPgtoTerc(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Todos</option>
                    <option value="SIM">Sim</option>
                    <option value="NAO">Não</option>
                  </select>
                </td>
                {/* Filtro EMPRESA */}
                <td style={{ padding: '4px 8px' }}>
                  <select
                    value={colFilterEmpresa}
                    onChange={(e) => setColFilterEmpresa(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Todas</option>
                    {empresas.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.nome}</option>
                    ))}
                  </select>
                </td>
                {/* Filtro PROJETO */}
                <td style={{ padding: '4px 8px' }}>
                  <select
                    value={colFilterProjeto}
                    onChange={(e) => setColFilterProjeto(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Todos</option>
                    {projetosFilter.map(proj => (
                      <option key={proj.id} value={proj.id}>{proj.nome}</option>
                    ))}
                  </select>
                </td>
                {/* Filtro CONTRAPARTE */}
                <td style={{ padding: '4px 8px' }}>
                  <input
                    list="contrapartes-list"
                    value={colFilterContraparte}
                    onChange={(e) => setColFilterContraparte(e.target.value)}
                    placeholder="Digite..."
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px'
                    }}
                  />
                  <datalist id="contrapartes-list">
                    <option value="">Todas</option>
                    {contrapartes
                      .sort((a, b) => {
                        const nomeA = (a.apelido || a.nome).toLowerCase()
                        const nomeB = (b.apelido || b.nome).toLowerCase()
                        return nomeA.localeCompare(nomeB)
                      })
                      .map(cp => (
                        <option key={cp.id} value={cp.apelido || cp.nome} />
                      ))
                    }
                  </datalist>
                </td>
                {/* Filtro CATEGORIA */}
                <td style={{ padding: '4px 8px' }}>
                  <select
                    value={colFilterCategoria}
                    onChange={(e) => setColFilterCategoria(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Todas</option>
                    {categorias.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </td>
                {/* Filtro VALOR BRUTO */}
                <td style={{ padding: '4px 8px' }}>
                  <input
                    type="text"
                    list="valores-brutos-list"
                    placeholder="0,00"
                    value={colFilterValorBruto}
                    onChange={(e) => setColFilterValorBruto(formatFilterCurrency(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      textAlign: 'right'
                    }}
                  />
                  <datalist id="valores-brutos-list">
                    {valoresBrutosUnicos.map((valor, idx) => (
                      <option key={idx} value={formatCurrencyBRL(valor).replace('R$', '').trim()} />
                    ))}
                  </datalist>
                </td>
                {/* Filtro VALOR LÍQUIDO */}
                <td style={{ padding: '4px 8px' }}>
                  <input
                    type="text"
                    list="valores-liquidos-list"
                    placeholder="0,00"
                    value={colFilterValorLiquido}
                    onChange={(e) => setColFilterValorLiquido(formatFilterCurrency(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      textAlign: 'right'
                    }}
                  />
                  <datalist id="valores-liquidos-list">
                    {valoresLiquidosUnicos.map((valor, idx) => (
                      <option key={idx} value={formatCurrencyBRL(valor).replace('R$', '').trim()} />
                    ))}
                  </datalist>
                </td>
                {/* Filtro VENCIMENTO */}
                <td style={{ padding: '4px 8px' }}>
                  <input
                    type="date"
                    value={colFilterVencimento}
                    onChange={(e) => setColFilterVencimento(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px'
                    }}
                  />
                </td>
                {/* Filtro STATUS */}
                <td style={{ padding: '4px 8px' }}>
                  <select
                    value={colFilterStatus}
                    onChange={(e) => setColFilterStatus(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      backgroundColor: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Todos</option>
                    <option value="ABERTO">Aberto</option>
                    <option value="PAGO_RECEBIDO">Liquidado</option>
                    <option value="CANCELADO">Cancelado</option>
                  </select>
                </td>
                {/* Botão Limpar Filtros */}
                <td style={{ padding: '4px 8px' }}>
                  {hasActiveColumnFilters && (
                    <button
                      onClick={clearAllColumnFilters}
                      title="Limpar todos os filtros"
                      style={{
                        width: '100%',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: '500',
                        color: '#dc2626',
                        backgroundColor: '#fee2e2',
                        border: '1px solid #fecaca',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                      }}
                    >
                      <X size={12} />
                      Limpar
                    </button>
                  )}
                </td>
              </tr>
            </thead>
            <tbody>
              {lancamentosFiltrados.map((lancamento) => {
                const statusStyle = getStatusBadgeStyle(lancamento.status)
                const tipoStyle = getTipoBadgeStyle(lancamento.tipo)

                return (
                  <tr
                    key={lancamento.id}
                    style={{
                      borderBottom: '1px solid #f3f4f6',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    {/* TIPO */}
                    <td style={{ padding: '6px 8px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '8px',
                        fontWeight: '600',
                        backgroundColor: tipoStyle.bg,
                        color: tipoStyle.text,
                        whiteSpace: 'nowrap'
                      }}>
                        {tipoStyle.label}
                      </span>
                    </td>

                    {/* PGTO TERCEIRO */}
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      {lancamento.pagamento_terceiro ? (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <span
                            className="tooltip-btn"
                            data-tooltip={`Pago por: ${lancamento.empresa_pagadora_nome || 'N/A'}`}
                            style={{
                              display: 'inline-block',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '8px',
                              fontWeight: '600',
                              backgroundColor: '#dbeafe',
                              color: '#1e40af',
                              whiteSpace: 'nowrap',
                              cursor: 'help'
                            }}
                          >
                            SIM
                          </span>
                        </div>
                      ) : (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          fontSize: '8px',
                          fontWeight: '500',
                          color: '#6b7280'
                        }}>
                          NÃO
                        </span>
                      )}
                    </td>

                    {/* EMPRESA */}
                    <td style={{
                      padding: '6px 8px',
                      fontSize: '9px',
                      color: '#1f2937',
                      fontWeight: '500',
                      wordWrap: 'break-word',
                      wordBreak: 'break-word',
                      whiteSpace: 'normal',
                      lineHeight: '1.4',
                    }}>
                      {lancamento.empresa_nome}
                    </td>

                    {/* PROJETO */}
                    <td style={{
                      padding: '6px 8px',
                      fontSize: '9px',
                      color: '#6b7280',
                      wordWrap: 'break-word',
                      wordBreak: 'break-word',
                      whiteSpace: 'normal',
                      lineHeight: '1.4',
                    }}>
                      {lancamento.projeto_nome || '-'}
                    </td>

                    {/* CONTRAPARTE */}
                    <td style={{
                      padding: '6px 8px',
                      fontSize: '9px',
                      color: '#6b7280',
                      wordWrap: 'break-word',
                      wordBreak: 'break-word',
                      whiteSpace: 'normal',
                      lineHeight: '1.4',
                    }}>
                      {lancamento.contraparte_nome || '-'}
                    </td>

                    {/* CATEGORIA */}
                    <td style={{
                      padding: '6px 8px',
                      fontSize: '9px',
                      color: '#6b7280',
                      wordWrap: 'break-word',
                      wordBreak: 'break-word',
                      whiteSpace: 'normal',
                      lineHeight: '1.4',
                    }}>
                      {lancamento.plano_conta?.categoria || '-'}
                    </td>

                    {/* VALOR BRUTO */}
                    <td style={{
                      padding: '6px 8px',
                      fontSize: '9px',
                      color: '#1f2937',
                      fontWeight: '600',
                      textAlign: 'right',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatCurrencyBRL(lancamento.valor_bruto)}
                    </td>

                    {/* VALOR LÍQUIDO */}
                    <td style={{
                      padding: '6px 8px',
                      fontSize: '9px',
                      color: '#1f2937',
                      fontWeight: '600',
                      textAlign: 'right',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatCurrencyBRL(lancamento.valor_liquido)}
                    </td>

                    {/* VENCIMENTO */}
                    <td style={{
                      padding: '6px 8px',
                      fontSize: '9px',
                      color: '#6b7280',
                      whiteSpace: 'nowrap',
                      textAlign: 'center'
                    }}>
                      {formatDateLocal(lancamento.data_vencimento)}
                    </td>

                    {/* STATUS */}
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '8px',
                        fontWeight: '600',
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.text,
                        whiteSpace: 'nowrap'
                      }}>
                        {statusStyle.label}
                      </span>
                    </td>


                    {/* AÇÕES */}
                    <td style={{
                      padding: '6px 8px',
                      textAlign: 'center'
                    }}>
                      <div style={{
                        display: 'flex',
                        gap: '6px',
                        justifyContent: 'center'
                      }}>
                        {lancamento.status === 'ABERTO' && (
                          <div style={{ position: 'relative', display: 'inline-block' }}>
                            <button
                              onClick={() => setLiquidarModal({ show: true, id: lancamento.id })}
                              className="tooltip-btn"
                              data-tooltip="Liquidar"
                              style={{
                                padding: '4px',
                                backgroundColor: '#d1fae5',
                                color: '#10b981',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s'
                              }}
                              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#a7f3d0'}
                              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#d1fae5'}
                            >
                              <CheckCircle size={13} />
                            </button>
                          </div>
                        )}
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <button
                            onClick={() => openModal(lancamento)}
                            className="tooltip-btn"
                            data-tooltip="Editar"
                            style={{
                              padding: '4px',
                              backgroundColor: '#e0e7ff',
                              color: '#1555D6',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#c7d2fe'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#e0e7ff'}
                          >
                            <Pencil size={13} />
                          </button>
                        </div>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <button
                            onClick={() => openDocumentosModal(lancamento)}
                            className="tooltip-btn"
                            data-tooltip="Documentos"
                            style={{
                              padding: '4px',
                              backgroundColor: '#fef3c7',
                              color: '#d97706',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s',
                              position: 'relative'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fde68a'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fef3c7'}
                          >
                            <Paperclip size={13} />
                            {documentosCount[lancamento.id] > 0 && (
                              <span style={{
                                position: 'absolute',
                                top: '-4px',
                                right: '-4px',
                                backgroundColor: '#d97706',
                                color: 'white',
                                fontSize: '8px',
                                fontWeight: '700',
                                padding: '1px 4px',
                                borderRadius: '10px',
                                minWidth: '14px',
                                textAlign: 'center'
                              }}>
                                {documentosCount[lancamento.id]}
                              </span>
                            )}
                          </button>
                        </div>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <button
                            onClick={() => setDeleteConfirm({ show: true, id: lancamento.id })}
                            className="tooltip-btn"
                            data-tooltip="Excluir"
                            style={{
                              padding: '4px',
                              backgroundColor: '#fee2e2',
                              color: '#ef4444',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fecaca'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#fee2e2'}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <div style={{
            padding: '20px',
            textAlign: 'center',
            borderTop: '1px solid #e5e7eb'
          }}>
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              style={{
                padding: '10px 24px',
                backgroundColor: loadingMore ? '#d1d5db' : '#1555D6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: loadingMore ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {loadingMore ? 'Carregando...' : 'Carregar Mais'}
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
          }}
          onClick={closeModal}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '100%',
              maxHeight: '90vh',
              margin: '16px',
              display: 'flex',
              flexDirection: 'column',
              animation: 'scaleIn 0.2s ease-out',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              position: 'sticky',
              top: 0,
              backgroundColor: 'white',
              borderBottom: '1px solid #e5e7eb',
              padding: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              zIndex: 10
            }}>
              <h2 style={{
                fontSize: '18px',
                fontWeight: '700',
                color: '#1f2937',
                margin: 0
              }}>
                {editingId ? 'Editar Lançamento' : 'Novo Lançamento'}
              </h2>
              <button
                onClick={closeModal}
                style={{
                  padding: '6px',
                  backgroundColor: '#f3f4f6',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
              >
                <X size={18} color="#6b7280" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit(onSubmit)} style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '14px',
                marginBottom: '16px'
              }}>
                {/* Empresa */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Empresa *
                  </label>
                  <select
                    {...register('empresa_id')}
                    disabled={isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                  >
                    <option value="">Selecione...</option>
                    {empresas.map(empresa => (
                      <option key={empresa.id} value={empresa.id}>
                        {empresa.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tipo de Fluxo */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Tipo de Fluxo *
                  </label>
                  <select
                    {...register('tipo_fluxo')}
                    disabled={isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                  >
                    <option value="">Selecione...</option>
                    {tiposFluxo.map(tipoFluxo => (
                      <option key={tipoFluxo} value={tipoFluxo}>
                        {tipoFluxo}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tipo */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Tipo *
                  </label>
                  <select
                    {...register('tipo')}
                    disabled={isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                  >
                    <option value="Entrada">Recebimento</option>
                    <option value="Saida">Pagamento</option>
                  </select>
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1.2fr 0.8fr 1fr 1.3fr',
                gap: '14px',
                marginBottom: '16px'
              }}>
                {/* Projeto */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Projeto {tipoFluxo !== 'Corporativo' && '*'}
                  </label>
                  <select
                    {...register('projeto_id')}
                    disabled={!empresaId || isLancamentoPago || tipoFluxo === 'Corporativo'}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: empresaId && !isLancamentoPago && tipoFluxo !== 'Corporativo' ? 'pointer' : 'not-allowed',
                      backgroundColor: empresaId && !isLancamentoPago && tipoFluxo !== 'Corporativo' ? 'white' : '#f9fafb',
                      color: empresaId && !isLancamentoPago && tipoFluxo !== 'Corporativo' ? '#1f2937' : '#9ca3af'
                    }}
                  >
                    <option value="">Selecione...</option>
                    {projetos.map(projeto => (
                      <option key={projeto.id} value={projeto.id}>
                        {projeto.nome}
                      </option>
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
                    {...register('subprojeto_id')}
                    disabled={!projetoId || isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: projetoId && !isLancamentoPago ? 'pointer' : 'not-allowed',
                      backgroundColor: projetoId && !isLancamentoPago ? 'white' : '#f9fafb',
                      color: projetoId && !isLancamentoPago ? '#1f2937' : '#9ca3af'
                    }}
                  >
                    <option value="">Selecione...</option>
                    {subprojetos.map(subprojeto => (
                      <option key={subprojeto.id} value={subprojeto.id}>
                        {subprojeto.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Pagamento por Terceiro */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Pgto Conta/Ordem?
                  </label>
                  <select
                    {...register('pagamento_terceiro')}
                    disabled={isLancamentoPago}
                    onChange={(e) => {
                      const value = e.target.value === 'true'
                      setValue('pagamento_terceiro', value)
                      if (!value) {
                        setValue('empresa_pagadora_id', '')
                        setValue('banco_conta_id', '')
                        if (empresaId) {
                          fetchBancosContas(empresaId)
                        }
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                  >
                    <option value="false">Não</option>
                    <option value="true">Sim</option>
                  </select>
                </div>

                {/* Empresa Pagadora */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Empresa Pagadora {pagamentoTerceiro && '*'}
                  </label>
                  <select
                    {...register('empresa_pagadora_id')}
                    disabled={!pagamentoTerceiro || isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: pagamentoTerceiro && !isLancamentoPago ? 'pointer' : 'not-allowed',
                      backgroundColor: pagamentoTerceiro && !isLancamentoPago ? 'white' : '#f9fafb',
                      color: pagamentoTerceiro && !isLancamentoPago ? '#1f2937' : '#9ca3af'
                    }}
                  >
                    <option value="">Selecione...</option>
                    {empresasPagadoras.map(empresa => (
                      <option key={empresa.id} value={empresa.id}>
                        {empresa.nome}
                      </option>
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
                    Conta Bancária *
                  </label>
                  <select
                    {...register('banco_conta_id')}
                    disabled={!empresaId || isLancamentoPago || (pagamentoTerceiro && !empresaPagadoraId)}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: empresaId && !isLancamentoPago && (!pagamentoTerceiro || empresaPagadoraId) ? 'pointer' : 'not-allowed',
                      backgroundColor: empresaId && !isLancamentoPago && (!pagamentoTerceiro || empresaPagadoraId) ? 'white' : '#f9fafb',
                      color: empresaId && !isLancamentoPago && (!pagamentoTerceiro || empresaPagadoraId) ? '#1f2937' : '#9ca3af'
                    }}
                  >
                    <option value="">Selecione...</option>
                    {bancosContas.map(conta => {
                      // bancos pode ser array ou objeto dependendo do relacionamento
                      const bancosData = Array.isArray(conta.bancos) ? conta.bancos[0] : conta.bancos
                      const nomeBanco = bancosData?.nome || conta.banco_nome || 'Banco não informado'
                      return (
                        <option key={conta.id} value={conta.id}>
                          {nomeBanco} - Ag: {conta.agencia} - Conta: {conta.numero_conta}
                        </option>
                      )
                    })}
                  </select>
                </div>
              </div>

              {/* Plano de Contas e Contraparte na mesma linha */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '14px'
                }}>
                  <div style={{ gridColumn: 'span 3' }}>
                    <PlanoContaPicker
                      value={watch('plano_conta_id')}
                      onChange={(value) => setValue('plano_conta_id', value)}
                      tipoFluxoFilter={watch('tipo_fluxo')}
                      sentidoFilter={watch('tipo')}
                      error={errors.plano_conta_id?.message}
                    />
                  </div>

                  <div style={{ position: 'relative' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '6px'
                    }}>
                      Contraparte *
                    </label>
                    <input
                      type="text"
                      value={contraparteNomeExibicao}
                      onChange={(e) => {
                        setContraparteNomeExibicao(e.target.value)
                        setContraparteSearchTerm(e.target.value)
                        setShowContraparteDropdown(true)
                      }}
                      disabled={isLancamentoPago}
                      placeholder="Digite para buscar..."
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
                        outline: 'none',
                        backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                        cursor: isLancamentoPago ? 'not-allowed' : 'text',
                        color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                      }}
                      onFocus={(e) => {
                        setShowContraparteDropdown(true)
                        if (!isLancamentoPago) {
                          e.currentTarget.style.borderColor = '#1555D6'
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb'
                        e.currentTarget.style.boxShadow = 'none'
                        setTimeout(() => setShowContraparteDropdown(false), 200)
                      }}
                    />
                    {showContraparteDropdown && filteredContrapartes.length > 0 && !isLancamentoPago && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        maxHeight: '300px',
                        overflowY: 'auto',
                        zIndex: 1000,
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}>
                        {filteredContrapartes.map(contraparte => (
                          <div
                            key={contraparte.id}
                            onClick={() => handleSelectContraparte(contraparte)}
                            style={{
                              padding: '8px 10px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              color: '#1f2937',
                              borderBottom: '1px solid #f3f4f6'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                          >
                            <div style={{ fontWeight: '500' }}>
                              {contraparte.nome}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>



              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '14px',
                marginBottom: '16px'
              }}>
                {/* Data Emissão */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Data Emissão *
                  </label>
                  <input
                    {...register('data_emissao')}
                    type="date"
                    disabled={isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      cursor: isLancamentoPago ? 'not-allowed' : 'text',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                    onFocus={(e) => {
                      if (!isLancamentoPago) e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                </div>

                {/* Data Vencimento */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Data Vencimento *
                  </label>
                  <input
                    {...register('data_vencimento')}
                    type="date"
                    disabled={isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      cursor: isLancamentoPago ? 'not-allowed' : 'text',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                    onFocus={(e) => {
                      if (!isLancamentoPago) e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                </div>

                {/* Previsão Pagamento */}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Previsão Pag.
                  </label>
                  <input
                    {...register('data_previsao_pagamento')}
                    type="date"
                    disabled={isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      cursor: isLancamentoPago ? 'not-allowed' : 'text',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                    onFocus={(e) => {
                      if (!isLancamentoPago) e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Valor Bruto *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute',
                      left: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '13px',
                      color: '#6b7280',
                      fontWeight: '500'
                    }}>
                      R$
                    </span>
                    <input
                      type="text"
                      value={valorBrutoFormatado}
                      disabled={isLancamentoPago}
                      onChange={(e) => {
                        const formatted = formatCurrencyInput(e.target.value)
                        setValorBrutoFormatado(formatted)
                        const numericValue = parseCurrencyInput(formatted)
                        setValorBruto(numericValue)
                        setValue('valor_bruto', numericValue)
                      }}
                      style={{
                        width: '100%',
                        padding: '9px 10px 9px 32px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
                        outline: 'none',
                        textAlign: 'right',
                        backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                        cursor: isLancamentoPago ? 'not-allowed' : 'text',
                        color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                      }}
                      onFocus={(e) => {
                        if (!isLancamentoPago) {
                          e.currentTarget.style.borderColor = '#1555D6'
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                        }
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Tipo Doc
                  </label>
                  <input
                    {...register('documento_tipo')}
                    type="text"
                    disabled={isLancamentoPago}
                    placeholder="NF, Boleto..."
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      cursor: isLancamentoPago ? 'not-allowed' : 'text',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                    onFocus={(e) => {
                      if (!isLancamentoPago) {
                        e.currentTarget.style.borderColor = '#1555D6'
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Nº Doc
                  </label>
                  <input
                    {...register('documento_numero')}
                    type="text"
                    disabled={isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      cursor: isLancamentoPago ? 'not-allowed' : 'text',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                    onFocus={(e) => {
                      if (!isLancamentoPago) {
                        e.currentTarget.style.borderColor = '#1555D6'
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                      }
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                </div>
              </div>

              {/* Retenções */}
              <div style={{
                borderTop: '1px solid #e5e7eb',
                margin: '16px 0',
                paddingTop: '16px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '14px'
                }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#1f2937',
                    margin: 0
                  }}>
                    Retenções de Impostos
                  </h3>
                  <button
                    type="button"
                    onClick={adicionarRetencao}
                    disabled={isLancamentoPago}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      backgroundColor: isLancamentoPago ? '#d1d5db' : '#e0e7ff',
                      color: isLancamentoPago ? '#9ca3af' : '#1555D6',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => {
                      if (!isLancamentoPago) {
                        e.currentTarget.style.backgroundColor = '#c7d2fe'
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!isLancamentoPago) {
                        e.currentTarget.style.backgroundColor = '#e0e7ff'
                      }
                    }}
                  >
                    <Plus size={16} />
                    Adicionar Retenção
                  </button>
                </div>

                {retencoes.length > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    {retencoes.map((retencao, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr 2fr auto',
                          gap: '12px',
                          alignItems: 'end',
                          padding: '12px',
                          backgroundColor: '#f9fafb',
                          borderRadius: '8px',
                          marginBottom: '8px'
                        }}
                      >
                        <div>
                          <label style={{
                            display: 'block',
                            fontSize: '13px',
                            fontWeight: '500',
                            color: '#374151',
                            marginBottom: '6px'
                          }}>
                            Imposto
                          </label>
                          <select
                            value={retencao.imposto}
                            onChange={(e) => atualizarRetencao(index, 'imposto', e.target.value)}
                            disabled={isLancamentoPago}
                            style={{
                              width: '100%',
                              padding: '9px 10px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              fontSize: '13px',
                              outline: 'none',
                              cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                              backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                              color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                            }}
                          >
                            {IMPOSTOS.map((imp) => (
                              <option key={imp.value} value={imp.value}>
                                {imp.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{
                            display: 'block',
                            fontSize: '13px',
                            fontWeight: '500',
                            color: '#374151',
                            marginBottom: '6px'
                          }}>
                            Valor
                          </label>
                          <div style={{ position: 'relative' }}>
                            <span style={{
                              position: 'absolute',
                              left: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              fontSize: '13px',
                              color: '#6b7280',
                              fontWeight: '500'
                            }}>
                              R$
                            </span>
                            <input
                              type="text"
                              value={retencao.valorFormatado}
                              onChange={(e) => atualizarRetencao(index, 'valorFormatado', e.target.value)}
                              disabled={isLancamentoPago}
                              style={{
                                width: '100%',
                                padding: '9px 10px 9px 32px',
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                fontSize: '13px',
                                outline: 'none',
                                textAlign: 'right',
                                backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                                cursor: isLancamentoPago ? 'not-allowed' : 'text',
                                color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                              }}
                            />
                          </div>
                        </div>

                        <div>
                          <label style={{
                            display: 'block',
                            fontSize: '13px',
                            fontWeight: '500',
                            color: '#374151',
                            marginBottom: '6px'
                          }}>
                            Detalhe
                          </label>
                          <input
                            type="text"
                            value={retencao.detalhe || ''}
                            onChange={(e) => atualizarRetencao(index, 'detalhe', e.target.value)}
                            disabled={isLancamentoPago}
                            placeholder="Informações adicionais..."
                            style={{
                              width: '100%',
                              padding: '9px 10px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              fontSize: '13px',
                              outline: 'none',
                              backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                              cursor: isLancamentoPago ? 'not-allowed' : 'text',
                              color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                            }}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => removerRetencao(index)}
                          disabled={isLancamentoPago}
                          style={{
                            padding: '9px',
                            backgroundColor: isLancamentoPago ? '#d1d5db' : '#fee2e2',
                            color: isLancamentoPago ? '#9ca3af' : '#ef4444',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                          }}
                          onMouseOver={(e) => {
                            if (!isLancamentoPago) {
                              e.currentTarget.style.backgroundColor = '#fecaca'
                            }
                          }}
                          onMouseOut={(e) => {
                            if (!isLancamentoPago) {
                              e.currentTarget.style.backgroundColor = '#fee2e2'
                            }
                          }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Valor Líquido */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px',
                  backgroundColor: '#f0f9ff',
                  borderRadius: '8px',
                  border: '1px solid #bae6fd'
                }}>
                  <span style={{
                    fontSize: '15px',
                    fontWeight: '600',
                    color: '#0369a1'
                  }}>
                    Valor Líquido
                  </span>
                  <span style={{
                    fontSize: '17px',
                    fontWeight: '700',
                    color: '#0369a1'
                  }}>
                    {formatCurrencyBRL(valorLiquido)}
                  </span>
                </div>
              </div>

              {/* Forma de Pagamento/Recebimento */}
              <div style={{
                padding: '16px',
                backgroundColor: '#fafafa',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                marginTop: '16px'
              }}>
                <h4 style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <CreditCard size={18} />
                  Forma de Pagamento/Recebimento
                </h4>

                {/* Select Forma de Pagamento */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    marginBottom: '6px'
                  }}>
                    Forma de Pagamento
                  </label>
                  <select
                    value={formaPagamento}
                    onChange={(e) => {
                      setFormaPagamento(e.target.value)
                      // Limpar campos ao mudar forma de pagamento
                      setPixTipoChave('')
                      setPixChave('')
                      setPixChaveValidacao(null)
                      setBeneficiarioNome('')
                      setBeneficiarioBanco('')
                      setBeneficiarioAgencia('')
                      setBeneficiarioConta('')
                      setBeneficiarioContaDv('')
                      setBoletoLinhaDigitavel('')
                      setBoletoCodigoBarras('')
                    }}
                    disabled={isLancamentoPago}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '13px',
                      outline: 'none',
                      backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                      cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                      color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                    }}
                  >
                    <option value="">Selecione...</option>
                    {FORMAS_PAGAMENTO.map(fp => (
                      <option key={fp.value} value={fp.value}>{fp.label}</option>
                    ))}
                  </select>
                </div>

                {/* Campos para BOLETO */}
                {formaPagamento === 'BOLETO' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: '500',
                        color: '#374151',
                        marginBottom: '6px'
                      }}>
                        Linha Digitável
                      </label>
                      <input
                        type="text"
                        value={boletoLinhaDigitavel}
                        onChange={(e) => setBoletoLinhaDigitavel(e.target.value)}
                        disabled={isLancamentoPago}
                        placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"
                        style={{
                          width: '100%',
                          padding: '9px 10px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          fontSize: '13px',
                          outline: 'none',
                          fontFamily: 'monospace',
                          backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                          cursor: isLancamentoPago ? 'not-allowed' : 'text',
                          color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: '500',
                        color: '#374151',
                        marginBottom: '6px'
                      }}>
                        Código de Barras
                      </label>
                      <input
                        type="text"
                        value={boletoCodigoBarras}
                        onChange={(e) => setBoletoCodigoBarras(e.target.value)}
                        disabled={isLancamentoPago}
                        placeholder="00000000000000000000000000000000000000000000"
                        style={{
                          width: '100%',
                          padding: '9px 10px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          fontSize: '13px',
                          outline: 'none',
                          fontFamily: 'monospace',
                          backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                          cursor: isLancamentoPago ? 'not-allowed' : 'text',
                          color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Campos para PIX */}
                {formaPagamento === 'PIX' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: '500',
                          color: '#374151',
                          marginBottom: '6px'
                        }}>
                          Tipo de Chave
                        </label>
                        <select
                          value={pixTipoChave}
                          onChange={(e) => {
                            setPixTipoChave(e.target.value)
                            setPixChave('')
                            setPixChaveValidacao(null)
                          }}
                          disabled={isLancamentoPago}
                          style={{
                            width: '100%',
                            padding: '9px 10px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            fontSize: '13px',
                            outline: 'none',
                            backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                            cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                            color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                          }}
                        >
                          <option value="">Selecione...</option>
                          {TIPOS_CHAVE_PIX.map(tipo => (
                            <option key={tipo.value} value={tipo.value}>{tipo.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: '500',
                          color: '#374151',
                          marginBottom: '6px'
                        }}>
                          Chave PIX
                        </label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type="text"
                            value={pixChave}
                            onChange={(e) => {
                              let valor = e.target.value
                              
                              // Auto-detectar tipo se não selecionado
                              if (!pixTipoChave) {
                                const tipoDetectado = detectarTipoChavePix(valor)
                                if (tipoDetectado) {
                                  setPixTipoChave(tipoDetectado)
                                }
                              }
                              
                              // Formatar conforme o tipo
                              if (pixTipoChave && ['CPF', 'CNPJ', 'TELEFONE'].includes(pixTipoChave)) {
                                valor = formatarChavePix(valor, pixTipoChave)
                              }
                              
                              setPixChave(valor)
                              
                              // Validar
                              if (pixTipoChave && valor) {
                                setPixChaveValidacao(validarChavePix(valor, pixTipoChave))
                              } else {
                                setPixChaveValidacao(null)
                              }
                            }}
                            disabled={isLancamentoPago}
                            placeholder={
                              pixTipoChave === 'CPF' ? '000.000.000-00' :
                              pixTipoChave === 'CNPJ' ? '00.000.000/0000-00' :
                              pixTipoChave === 'EMAIL' ? 'exemplo@email.com' :
                              pixTipoChave === 'TELEFONE' ? '(00) 00000-0000' :
                              pixTipoChave === 'ALEATORIA' ? 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' :
                              'Digite a chave PIX'
                            }
                            style={{
                              width: '100%',
                              padding: '9px 10px',
                              paddingRight: pixChaveValidacao ? '36px' : '10px',
                              border: `1px solid ${pixChaveValidacao ? (pixChaveValidacao.valido ? '#10b981' : '#ef4444') : '#e5e7eb'}`,
                              borderRadius: '8px',
                              fontSize: '13px',
                              outline: 'none',
                              backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                              cursor: isLancamentoPago ? 'not-allowed' : 'text',
                              color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                            }}
                          />
                          {pixChaveValidacao && (
                            <span style={{
                              position: 'absolute',
                              right: '10px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              fontSize: '16px'
                            }}>
                              {pixChaveValidacao.valido ? '✓' : '✗'}
                            </span>
                          )}
                        </div>
                        {pixChaveValidacao && (
                          <span style={{
                            fontSize: '11px',
                            color: pixChaveValidacao.valido ? '#10b981' : '#ef4444',
                            marginTop: '4px',
                            display: 'block'
                          }}>
                            {pixChaveValidacao.mensagem}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dados bancários do beneficiário (opcional para PIX) */}
                    <div style={{
                      marginTop: '8px',
                      padding: '12px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                      border: '1px dashed #d1d5db'
                    }}>
                      <span style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px', display: 'block' }}>
                        Dados bancários do beneficiário (opcional)
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                        <input
                          type="text"
                          value={beneficiarioNome}
                          onChange={(e) => setBeneficiarioNome(e.target.value)}
                          disabled={isLancamentoPago}
                          placeholder="Nome do titular"
                          style={{
                            width: '100%',
                            padding: '9px 10px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            fontSize: '13px',
                            outline: 'none',
                            backgroundColor: isLancamentoPago ? '#f9fafb' : 'white'
                          }}
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 80px', gap: '8px' }}>
                          <select
                            value={beneficiarioBanco}
                            onChange={(e) => setBeneficiarioBanco(e.target.value)}
                            disabled={isLancamentoPago}
                            style={{
                              width: '100%',
                              padding: '9px 10px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              fontSize: '13px',
                              outline: 'none',
                              backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                              cursor: isLancamentoPago ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <option value="">Selecione o banco</option>
                            {bancos.map(banco => (
                              <option key={banco.id} value={banco.nome}>
                                {banco.codigo} - {banco.nome}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={beneficiarioAgencia}
                            onChange={(e) => setBeneficiarioAgencia(e.target.value)}
                            disabled={isLancamentoPago}
                            placeholder="Agência"
                            style={{
                              width: '100%',
                              padding: '9px 10px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              fontSize: '13px',
                              outline: 'none',
                              backgroundColor: isLancamentoPago ? '#f9fafb' : 'white'
                            }}
                          />
                          <input
                            type="text"
                            value={beneficiarioConta}
                            onChange={(e) => setBeneficiarioConta(e.target.value)}
                            disabled={isLancamentoPago}
                            placeholder="Conta"
                            style={{
                              width: '100%',
                              padding: '9px 10px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              fontSize: '13px',
                              outline: 'none',
                              backgroundColor: isLancamentoPago ? '#f9fafb' : 'white'
                            }}
                          />
                          <input
                            type="text"
                            value={beneficiarioContaDv}
                            onChange={(e) => setBeneficiarioContaDv(e.target.value)}
                            disabled={isLancamentoPago}
                            placeholder="DV"
                            maxLength={2}
                            style={{
                              width: '100%',
                              padding: '9px 10px',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              fontSize: '13px',
                              outline: 'none',
                              backgroundColor: isLancamentoPago ? '#f9fafb' : 'white'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Campos para DEPÓSITO EM CONTA */}
                {formaPagamento === 'DEPOSITO_CONTA' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: '500',
                        color: '#374151',
                        marginBottom: '6px'
                      }}>
                        Nome do Titular *
                      </label>
                      <input
                        type="text"
                        value={beneficiarioNome}
                        onChange={(e) => setBeneficiarioNome(e.target.value)}
                        disabled={isLancamentoPago}
                        placeholder="Nome completo do titular da conta"
                        style={{
                          width: '100%',
                          padding: '9px 10px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          fontSize: '13px',
                          outline: 'none',
                          backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                          cursor: isLancamentoPago ? 'not-allowed' : 'text',
                          color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                        }}
                      />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 80px', gap: '12px' }}>
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: '500',
                          color: '#374151',
                          marginBottom: '6px'
                        }}>
                          Banco *
                        </label>
                        <select
                          value={beneficiarioBanco}
                          onChange={(e) => setBeneficiarioBanco(e.target.value)}
                          disabled={isLancamentoPago}
                          style={{
                            width: '100%',
                            padding: '9px 10px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            fontSize: '13px',
                            outline: 'none',
                            backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                            cursor: isLancamentoPago ? 'not-allowed' : 'pointer',
                            color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                          }}
                        >
                          <option value="">Selecione o banco</option>
                          {bancos.map(banco => (
                            <option key={banco.id} value={banco.nome}>
                              {banco.codigo} - {banco.nome}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: '500',
                          color: '#374151',
                          marginBottom: '6px'
                        }}>
                          Agência *
                        </label>
                        <input
                          type="text"
                          value={beneficiarioAgencia}
                          onChange={(e) => setBeneficiarioAgencia(e.target.value)}
                          disabled={isLancamentoPago}
                          placeholder="0000"
                          style={{
                            width: '100%',
                            padding: '9px 10px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            fontSize: '13px',
                            outline: 'none',
                            backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                            cursor: isLancamentoPago ? 'not-allowed' : 'text',
                            color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: '500',
                          color: '#374151',
                          marginBottom: '6px'
                        }}>
                          Conta *
                        </label>
                        <input
                          type="text"
                          value={beneficiarioConta}
                          onChange={(e) => setBeneficiarioConta(e.target.value)}
                          disabled={isLancamentoPago}
                          placeholder="00000000"
                          style={{
                            width: '100%',
                            padding: '9px 10px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            fontSize: '13px',
                            outline: 'none',
                            backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                            cursor: isLancamentoPago ? 'not-allowed' : 'text',
                            color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: '500',
                          color: '#374151',
                          marginBottom: '6px'
                        }}>
                          DV
                        </label>
                        <input
                          type="text"
                          value={beneficiarioContaDv}
                          onChange={(e) => setBeneficiarioContaDv(e.target.value)}
                          disabled={isLancamentoPago}
                          placeholder="0"
                          maxLength={2}
                          style={{
                            width: '100%',
                            padding: '9px 10px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            fontSize: '13px',
                            outline: 'none',
                            backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                            cursor: isLancamentoPago ? 'not-allowed' : 'text',
                            color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Observações */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '6px'
                }}>
                  Observações
                </label>
                <textarea
                  {...register('observacoes')}
                  disabled={isLancamentoPago}
                  rows={3}
                  placeholder="Informações adicionais sobre o lançamento..."
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '13px',
                    outline: 'none',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    backgroundColor: isLancamentoPago ? '#f9fafb' : 'white',
                    cursor: isLancamentoPago ? 'not-allowed' : 'text',
                    color: isLancamentoPago ? '#9ca3af' : '#1f2937'
                  }}
                  onFocus={(e) => {
                    if (!isLancamentoPago) {
                      e.currentTarget.style.borderColor = '#1555D6'
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>

              {/* Seção de Documentos Anexados */}
              <div style={{
                borderTop: '1px solid #e5e7eb',
                marginTop: '16px',
                paddingTop: '16px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px'
                }}>
                  <h3 style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#1f2937',
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <Paperclip size={16} />
                    Documentos Anexados
                    {(editingId ? documentos.length > 0 : documentosPendentes.length > 0) && (
                      <span style={{
                        backgroundColor: editingId ? '#dbeafe' : '#fef3c7',
                        color: editingId ? '#1d4ed8' : '#d97706',
                        fontSize: '11px',
                        fontWeight: '600',
                        padding: '2px 8px',
                        borderRadius: '10px'
                      }}>
                        {editingId ? documentos.length : documentosPendentes.length}
                        {!editingId && ' pendente(s)'}
                      </span>
                    )}
                  </h3>
                </div>

                {/* Área de Upload - sempre visível */}
                <div style={{
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '12px',
                  border: '2px dashed #e5e7eb'
                }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      value={tipoDocumentoSelecionado}
                      onChange={(e) => setTipoDocumentoSelecionado(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '12px',
                        backgroundColor: 'white',
                        minWidth: '160px'
                      }}
                    >
                      {TIPOS_DOCUMENTO.map(tipo => (
                        <option key={tipo.value} value={tipo.value}>
                          {tipo.icon} {tipo.label}
                        </option>
                      ))}
                    </select>
                    
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={editingId ? handleUploadDocumento : handleAddDocumentoPendente}
                      style={{ display: 'none' }}
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                    />
                    
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingDocumento}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        backgroundColor: uploadingDocumento ? '#9ca3af' : '#1555D6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: uploadingDocumento ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {uploadingDocumento ? (
                        <>
                          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Upload size={14} />
                          Anexar Documento
                        </>
                      )}
                    </button>
                  </div>
                  <p style={{ fontSize: '10px', color: '#9ca3af', marginTop: '8px', marginBottom: 0 }}>
                    PDF, JPG, PNG, DOC, DOCX, XLS, XLSX (máx. 10MB)
                    {!editingId && documentosPendentes.length > 0 && (
                      <span style={{ color: '#f59e0b', fontWeight: '500' }}>
                        {' '}• Os documentos serão enviados ao salvar o lançamento
                      </span>
                    )}
                  </p>
                </div>

                {/* Lista de Documentos */}
                {!editingId ? (
                  // Novo lançamento - mostrar documentos pendentes
                  documentosPendentes.length === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      padding: '16px',
                      color: '#9ca3af',
                      fontSize: '12px'
                    }}>
                      <FileText size={24} style={{ marginBottom: '4px', opacity: 0.5 }} />
                      <p style={{ margin: 0 }}>Nenhum documento anexado</p>
                      <p style={{ fontSize: '11px', marginTop: '4px', color: '#9ca3af' }}>
                        Anexe documentos usando o botão acima
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                      {documentosPendentes.map(doc => (
                        <div
                          key={doc.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 10px',
                            backgroundColor: '#fffbeb',
                            borderRadius: '6px',
                            border: '1px solid #fcd34d'
                          }}
                        >
                          <span style={{ fontSize: '16px' }}>
                            {getTipoDocumentoIcon(doc.tipo_documento)}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{
                              fontSize: '12px',
                              fontWeight: '500',
                              color: '#1f2937',
                              margin: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {doc.nome_original}
                            </p>
                            <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>
                              {getTipoDocumentoLabel(doc.tipo_documento)} • {formatFileSize(doc.tamanho_bytes)}
                              <span style={{ color: '#f59e0b', fontWeight: '500' }}> • Pendente</span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveDocumentoPendente(doc.id)}
                            title="Remover"
                            style={{
                              padding: '4px',
                              backgroundColor: '#fee2e2',
                              color: '#dc2626',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex'
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  // Editando lançamento - mostrar documentos já salvos
                  loadingDocumentos ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                      <p style={{ fontSize: '12px', marginTop: '8px' }}>Carregando documentos...</p>
                    </div>
                  ) : documentos.length === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      padding: '16px',
                      color: '#9ca3af',
                      fontSize: '12px'
                    }}>
                      <FileText size={24} style={{ marginBottom: '4px', opacity: 0.5 }} />
                      <p style={{ margin: 0 }}>Nenhum documento anexado</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                      {documentos.map(doc => (
                        <div
                          key={doc.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 10px',
                            backgroundColor: '#f9fafb',
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb'
                          }}
                        >
                          <span style={{ fontSize: '16px' }}>
                            {getTipoDocumentoIcon(doc.tipo_documento)}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{
                              fontSize: '12px',
                              fontWeight: '500',
                              color: '#1f2937',
                              margin: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {doc.nome_original}
                            </p>
                            <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>
                              {getTipoDocumentoLabel(doc.tipo_documento)} • {formatFileSize(doc.tamanho_bytes)}
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              onClick={() => handleViewDocumento(doc)}
                              title="Visualizar"
                              style={{
                                padding: '4px',
                                backgroundColor: '#dbeafe',
                                color: '#2563eb',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex'
                              }}
                            >
                              <Eye size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadDocumento(doc)}
                              title="Baixar"
                              style={{
                                padding: '4px',
                                backgroundColor: '#d1fae5',
                                color: '#059669',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex'
                              }}
                            >
                              <Download size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDocumento(doc.id)}
                              title="Excluir"
                              style={{
                                padding: '4px',
                                backgroundColor: '#fee2e2',
                                color: '#dc2626',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex'
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>

              {/* Modal Footer */}
              <div style={{
                position: 'sticky',
                bottom: 0,
                backgroundColor: 'white',
                borderTop: '1px solid #e5e7eb',
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                borderBottomLeftRadius: '12px',
                borderBottomRightRadius: '12px'
              }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    padding: '10px 24px',
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 24px',
                    backgroundColor: '#1555D6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1044b5'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1555D6'}
                >
                  {editingId ? 'Atualizar' : 'Criar'} Lançamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
          }}
          onClick={() => setDeleteConfirm({ show: false, id: null })}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              padding: '32px',
              width: '100%',
              margin: '16px',
              animation: 'scaleIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: '56px',
              height: '56px',
              margin: '0 auto 20px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <AlertTriangle style={{ width: '28px', height: '28px', color: '#ef4444' }} />
            </div>

            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '12px',
              textAlign: 'center'
            }}>
              Confirmar Exclusão
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              marginBottom: '24px',
              textAlign: 'center',
              lineHeight: '1.5'
            }}>
              Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.
            </p>

            <div style={{
              display: 'flex',
              gap: '12px'
            }}>
              <button
                onClick={() => setDeleteConfirm({ show: false, id: null })}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteConfirm.id && handleDelete(deleteConfirm.id)}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  backgroundColor: '#ef4444',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Liquidar Modal */}
      {liquidarModal.show && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
          }}
          onClick={() => {
            setLiquidarModal({ show: false, id: null })
            setDataLiquidacao('')
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              padding: '32px',
              width: '100%',
              margin: '16px',
              animation: 'scaleIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: '56px',
              height: '56px',
              margin: '0 auto 20px',
              borderRadius: '50%',
              backgroundColor: '#d1fae5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CheckCircle style={{ width: '28px', height: '28px', color: '#10b981' }} />
            </div>

            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#111827',
              marginBottom: '12px',
              textAlign: 'center'
              }}>
            Liquidar Lançamento
</h2>
            <p style={{
            fontSize: '14px',
            color: '#6b7280',
            marginBottom: '20px',
            textAlign: 'center',
            lineHeight: '1.5'
            }}>
            Confirme a data de pagamento/recebimento:
            </p>
<div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '8px'
          }}>
            Data de Liquidação *
          </label>
          <input
            type="date"
            value={dataLiquidacao}
            onChange={(e) => setDataLiquidacao(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#1555D6'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
        </div>

        <div style={{
          display: 'flex',
          gap: '12px'
        }}>
          <button
            onClick={() => {
              setLiquidarModal({ show: false, id: null })
              setDataLiquidacao('')
            }}
            style={{
              flex: 1,
              padding: '12px 24px',
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
          >
            Cancelar
          </button>
          <button
            onClick={handleLiquidar}
            disabled={!dataLiquidacao}
            style={{
              flex: 1,
              padding: '12px 24px',
              backgroundColor: dataLiquidacao ? '#10b981' : '#d1d5db',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              color: 'white',
              cursor: dataLiquidacao ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              if (dataLiquidacao) {
                e.currentTarget.style.backgroundColor = '#059669'
              }
            }}
            onMouseOut={(e) => {
              if (dataLiquidacao) {
                e.currentTarget.style.backgroundColor = '#10b981'
              }
            }}
          >
            Confirmar Liquidação
          </button>
        </div>
      </div>
    </div>
  )}

  {/* Validation Modal */}
  {validationModal.show && (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)'
      }}
      onClick={() => setValidationModal({ show: false, message: '' })}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          borderTop: '4px solid #f59e0b',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          padding: '24px',
          width: '90%',
          maxWidth: '400px',
          margin: '16px',
          animation: 'scaleIn 0.2s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          marginBottom: '20px'
        }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            backgroundColor: '#fef3c7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: '2px'
          }}>
            <AlertTriangle style={{ width: '16px', height: '16px', color: '#f59e0b' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{
              fontSize: '14px',
              color: '#111827',
              margin: 0,
              lineHeight: '1.5',
              fontWeight: '500'
            }}>
              Faltam os seguintes campos obrigatórios: {validationModal.message}
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={() => setValidationModal({ show: false, message: '' })}
            style={{
              padding: '8px 20px',
              backgroundColor: '#f59e0b',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#d97706'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f59e0b'}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )}

  {/* Modal de Documentos */}
  {documentosModal.show && documentosModal.lancamento && (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)'
      }}
      onClick={() => setDocumentosModal({ show: false, lancamento: null })}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          padding: '24px',
          width: '95%',
          maxWidth: '700px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          animation: 'scaleIn 0.2s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', margin: 0 }}>
              📎 Documentos do Lançamento
            </h2>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0 0' }}>
              {documentosModal.lancamento.contraparte_nome || 'Sem contraparte'} • {formatCurrencyBRL(documentosModal.lancamento.valor_bruto)}
            </p>
          </div>
          <button
            onClick={() => setDocumentosModal({ show: false, lancamento: null })}
            style={{
              padding: '8px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Upload Section */}
        <div style={{
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px',
          border: '2px dashed #e5e7eb'
        }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={tipoDocumentoSelecionado}
              onChange={(e) => setTipoDocumentoSelecionado(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '13px',
                backgroundColor: 'white',
                minWidth: '180px'
              }}
            >
              {TIPOS_DOCUMENTO.map(tipo => (
                <option key={tipo.value} value={tipo.value}>
                  {tipo.icon} {tipo.label}
                </option>
              ))}
            </select>
            
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleUploadDocumento}
              style={{ display: 'none' }}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
            />
            
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingDocumento}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                backgroundColor: uploadingDocumento ? '#9ca3af' : '#1555D6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: uploadingDocumento ? 'not-allowed' : 'pointer'
              }}
            >
              {uploadingDocumento ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Enviando...
                </>
              ) : (
                <>
                  <Upload size={16} />
                  Enviar Documento
                </>
              )}
            </button>
          </div>
          <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px', margin: '8px 0 0 0' }}>
            Formatos aceitos: PDF, JPG, PNG, DOC, DOCX, XLS, XLSX (máx. 10MB)
          </p>
        </div>

        {/* Lista de Documentos */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingDocumentos ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
              <p>Carregando documentos...</p>
            </div>
          ) : documentos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
              <FileText size={48} style={{ marginBottom: '12px', opacity: 0.5 }} />
              <p style={{ margin: 0 }}>Nenhum documento anexado</p>
              <p style={{ fontSize: '12px', marginTop: '4px' }}>Envie o primeiro documento usando o botão acima</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {documentos.map(doc => (
                <div
                  key={doc.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb'
                  }}
                >
                  {/* Ícone do tipo */}
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    backgroundColor: '#e0e7ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px'
                  }}>
                    {getTipoDocumentoIcon(doc.tipo_documento)}
                  </div>

                  {/* Info do arquivo */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#1f2937',
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {doc.nome_original}
                    </p>
                    <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0 0' }}>
                      {getTipoDocumentoLabel(doc.tipo_documento)} • {formatFileSize(doc.tamanho_bytes)} • {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>

                  {/* Ações */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handleViewDocumento(doc)}
                      title="Visualizar"
                      style={{
                        padding: '6px',
                        backgroundColor: '#dbeafe',
                        color: '#2563eb',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => handleDownloadDocumento(doc)}
                      title="Baixar"
                      style={{
                        padding: '6px',
                        backgroundColor: '#d1fae5',
                        color: '#059669',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteDocumento(doc.id)}
                      title="Excluir"
                      style={{
                        padding: '6px',
                        backgroundColor: '#fee2e2',
                        color: '#dc2626',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            {documentos.length} documento(s) anexado(s)
          </span>
          <button
            onClick={() => setDocumentosModal({ show: false, lancamento: null })}
            style={{
              padding: '8px 20px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )}

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
            padding: toast.requiresConfirmation ? '20px' : '16px 20px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            flexDirection: toast.requiresConfirmation ? 'column' : 'row',
            alignItems: toast.requiresConfirmation ? 'stretch' : 'center',
            gap: toast.requiresConfirmation ? '16px' : '12px',
            minWidth: '400px',
            animation: 'scaleIn 0.3s ease-out',
            pointerEvents: toast.requiresConfirmation ? 'auto' : 'none'
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Icon style={{ width: '24px', height: '24px', flexShrink: 0, color: iconColor }} />
            <span style={{
              fontSize: '14px',
              fontWeight: '500',
              flex: 1,
              color: '#374151',
              lineHeight: '1.5',
              whiteSpace: 'pre-line'
            }}>
              {toast.message}
            </span>
          </div>
          
          {toast.requiresConfirmation && (
            <button
              onClick={() => dismissToast(toast.id)}
              style={{
                padding: '10px 24px',
                backgroundColor: '#1555D6',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                color: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
                alignSelf: 'center',
                minWidth: '100px'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1044b5'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1555D6'}
            >
              OK
            </button>
          )}
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
    
    /* Tooltips customizados */
    .tooltip-btn[data-tooltip] {
      position: relative;
    }
    
    .tooltip-btn[data-tooltip]::before {
      content: attr(data-tooltip);
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%) translateY(-4px);
      padding: 4px 8px;
      background-color: #1f2937;
      color: white;
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
      border-radius: 4px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
      z-index: 1000;
    }
    
    .tooltip-btn[data-tooltip]::after {
      content: "";
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%) translateY(2px);
      border: 4px solid transparent;
      border-top-color: #1f2937;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
      z-index: 1000;
    }
    
    .tooltip-btn[data-tooltip]:hover::before {
      opacity: 1;
      transform: translateX(-50%) translateY(-8px);
    }
    
    .tooltip-btn[data-tooltip]:hover::after {
      opacity: 1;
      transform: translateX(-50%) translateY(-2px);
    }
  `}</style>
</div>
)
}