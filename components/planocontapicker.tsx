'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface PlanoContaFluxo {
  id: string
  codigo_conta: string
  sentido: 'Entrada' | 'Saida'
  classificacao: string
  tipo_fluxo: string
  grupo: string
  categoria: string
  subcategoria: string
  cod_cont: string | null
  conta_cont: string | null
}

interface Contraparte {
  id: string
  nome: string
  apelido: string | null
}

interface PlanoContaPickerProps {
  value: string
  onChange: (id: string) => void
  sentidoFilter?: 'Entrada' | 'Saida'
  tipoFluxoFilter?: string
  error?: string
  showContraparte?: boolean
  contraparteValue?: string
  onContraparteChange?: (id: string) => void
  contrapartes?: Contraparte[]
  contraparteError?: string
}

export default function PlanoContaPicker({ 
  value, 
  onChange, 
  sentidoFilter, 
  tipoFluxoFilter,
  error,
  showContraparte = false,
  contraparteValue = '',
  onContraparteChange,
  contrapartes = [],
  contraparteError
}: PlanoContaPickerProps) {
  const [todasContas, setTodasContas] = useState<PlanoContaFluxo[]>([])
  const [loading, setLoading] = useState(true)

  // Estados das seleções - REMOVIDO tipoFluxoSelecionado
  const [grupoSelecionado, setGrupoSelecionado] = useState<string>('')
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string>('')
  const [subcategoriaSelecionada, setSubcategoriaSelecionada] = useState<string>('')

  // Listas filtradas - REMOVIDO tiposFluxoDisponiveis
  const [gruposDisponiveis, setGruposDisponiveis] = useState<string[]>([])
  const [categoriasDisponiveis, setCategoriasDisponiveis] = useState<string[]>([])
  const [subcategoriasDisponiveis, setSubcategoriasDisponiveis] = useState<string[]>([])

  // Carregar todas as contas ao montar
  useEffect(() => {
    loadContas()
  }, [])

  // Filtrar por sentido e tipo de fluxo quando mudarem
  useEffect(() => {
    if (todasContas.length > 0) {
      aplicarFiltros()
    }
  }, [sentidoFilter, tipoFluxoFilter, todasContas])

  // Quando value mudar externamente (edição), preencher os campos E carregar as opções
  useEffect(() => {
    if (value && todasContas.length > 0) {
      const conta = todasContas.find(c => c.id === value)
      if (conta) {
        setGrupoSelecionado(conta.grupo)
        setCategoriaSelecionada(conta.categoria)
        setSubcategoriaSelecionada(conta.subcategoria)
        carregarOpcoesParaEdicao(conta)
      }
    } else if (!value) {
      resetarSelecoes()
    }
  }, [value, todasContas])

  const loadContas = async () => {
    try {
      const { data, error } = await supabase
        .from('plano_contas_fluxo')
        .select('*')
        .eq('ativo', true)
        .order('tipo_fluxo', { ascending: true })
        .order('grupo', { ascending: true })
        .order('categoria', { ascending: true })
        .order('subcategoria', { ascending: true })

      if (error) throw error
      setTodasContas(data || [])
    } catch (err) {
      console.error('Erro ao carregar plano de contas:', err)
    } finally {
      setLoading(false)
    }
  }

  const carregarOpcoesParaEdicao = (conta: PlanoContaFluxo) => {
    let contasFiltradas = todasContas
    
    if (sentidoFilter) {
      contasFiltradas = contasFiltradas.filter(c => c.sentido === sentidoFilter)
    }
    
    if (tipoFluxoFilter) {
      contasFiltradas = contasFiltradas.filter(c => c.tipo_fluxo === tipoFluxoFilter)
    }

    // Carregar grupos disponíveis
    const grupos = Array.from(new Set(contasFiltradas.map(c => c.grupo))).sort()
    setGruposDisponiveis(grupos)

    // Carregar categorias disponíveis para o grupo selecionado
    let contasPorGrupo = contasFiltradas.filter(c => c.grupo === conta.grupo)
    const categorias = Array.from(new Set(contasPorGrupo.map(c => c.categoria))).sort()
    setCategoriasDisponiveis(categorias)

    // Carregar subcategorias disponíveis para a categoria selecionada
    let contasPorCategoria = contasFiltradas.filter(
      c => c.grupo === conta.grupo && c.categoria === conta.categoria
    )
    const subcategorias = Array.from(new Set(contasPorCategoria.map(c => c.subcategoria))).sort()
    setSubcategoriasDisponiveis(subcategorias)
  }

  const resetarSelecoes = () => {
    setGrupoSelecionado('')
    setCategoriaSelecionada('')
    setSubcategoriaSelecionada('')
    setGruposDisponiveis([])
    setCategoriasDisponiveis([])
    setSubcategoriasDisponiveis([])
  }

  const aplicarFiltros = () => {
    let contasFiltradas = todasContas

    if (sentidoFilter) {
      contasFiltradas = contasFiltradas.filter(c => c.sentido === sentidoFilter)
    }

    if (tipoFluxoFilter) {
      contasFiltradas = contasFiltradas.filter(c => c.tipo_fluxo === tipoFluxoFilter)
    }

    // Extrair grupos únicos
    const grupos = Array.from(new Set(contasFiltradas.map(c => c.grupo))).sort()
    setGruposDisponiveis(grupos)

    // Resetar seleções apenas se não houver value
    if (!value) {
      setCategoriasDisponiveis([])
      setSubcategoriasDisponiveis([])
      setGrupoSelecionado('')
      setCategoriaSelecionada('')
      setSubcategoriaSelecionada('')
    }
  }

  const handleGrupoChange = (grupo: string) => {
    setGrupoSelecionado(grupo)
    setCategoriaSelecionada('')
    setSubcategoriaSelecionada('')
    onChange('')

    if (!grupo) {
      setCategoriasDisponiveis([])
      setSubcategoriasDisponiveis([])
      return
    }

    let contasFiltradas = todasContas.filter(c => c.grupo === grupo)

    if (sentidoFilter) {
      contasFiltradas = contasFiltradas.filter(c => c.sentido === sentidoFilter)
    }

    if (tipoFluxoFilter) {
      contasFiltradas = contasFiltradas.filter(c => c.tipo_fluxo === tipoFluxoFilter)
    }

    const categorias = Array.from(new Set(contasFiltradas.map(c => c.categoria))).sort()
    setCategoriasDisponiveis(categorias)
    setSubcategoriasDisponiveis([])
  }

  const handleCategoriaChange = (categoria: string) => {
    setCategoriaSelecionada(categoria)
    setSubcategoriaSelecionada('')
    onChange('')

    if (!categoria) {
      setSubcategoriasDisponiveis([])
      return
    }

    let contasFiltradas = todasContas.filter(
      c => c.grupo === grupoSelecionado && c.categoria === categoria
    )

    if (sentidoFilter) {
      contasFiltradas = contasFiltradas.filter(c => c.sentido === sentidoFilter)
    }

    if (tipoFluxoFilter) {
      contasFiltradas = contasFiltradas.filter(c => c.tipo_fluxo === tipoFluxoFilter)
    }

    const subcategorias = Array.from(new Set(contasFiltradas.map(c => c.subcategoria))).sort()
    setSubcategoriasDisponiveis(subcategorias)
  }

  const handleSubcategoriaChange = (subcategoria: string) => {
    setSubcategoriaSelecionada(subcategoria)

    if (!subcategoria) {
      onChange('')
      return
    }

    let conta = todasContas.find(
      c =>
        c.grupo === grupoSelecionado &&
        c.categoria === categoriaSelecionada &&
        c.subcategoria === subcategoria
    )

    if (sentidoFilter && conta) {
      conta = todasContas.find(
        c =>
          c.grupo === grupoSelecionado &&
          c.categoria === categoriaSelecionada &&
          c.subcategoria === subcategoria &&
          c.sentido === sentidoFilter
      )
    }

    if (tipoFluxoFilter && conta) {
      conta = todasContas.find(
        c =>
          c.grupo === grupoSelecionado &&
          c.categoria === categoriaSelecionada &&
          c.subcategoria === subcategoria &&
          c.tipo_fluxo === tipoFluxoFilter
      )
    }

    if (conta) {
      onChange(conta.id)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
        Carregando plano de contas...
      </div>
    )
  }

  const selectStyle = {
    width: '100%',
    padding: '9px 10px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '13px',
    outline: 'none',
    cursor: 'pointer',
    backgroundColor: 'white'
  }

  const disabledSelectStyle = {
    ...selectStyle,
    backgroundColor: '#f9fafb',
    cursor: 'not-allowed',
    opacity: 0.6
  }

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: showContraparte ? '0.8fr 1fr 1fr 1.2fr' : 'repeat(3, 1fr)',
          gap: '12px'
        }}
      >
        {/* Grupo */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}
          >
            Grupo <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            value={grupoSelecionado}
            onChange={(e) => handleGrupoChange(e.target.value)}
            disabled={!tipoFluxoFilter}
            style={{
              ...(tipoFluxoFilter ? selectStyle : disabledSelectStyle),
              borderColor: error && !grupoSelecionado ? '#ef4444' : '#e5e7eb'
            }}
            onFocus={(e) => {
              if (tipoFluxoFilter) {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = error && !grupoSelecionado ? '#ef4444' : '#e5e7eb'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <option value="">Selecione</option>
            {gruposDisponiveis.map((grupo) => (
              <option key={grupo} value={grupo}>
                {grupo}
              </option>
            ))}
          </select>
        </div>

        {/* Categoria */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}
          >
            Categoria <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            value={categoriaSelecionada}
            onChange={(e) => handleCategoriaChange(e.target.value)}
            disabled={!grupoSelecionado}
            style={{
              ...(grupoSelecionado ? selectStyle : disabledSelectStyle),
              borderColor: error && !categoriaSelecionada ? '#ef4444' : '#e5e7eb'
            }}
            onFocus={(e) => {
              if (grupoSelecionado) {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = error && !categoriaSelecionada ? '#ef4444' : '#e5e7eb'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <option value="">Selecione</option>
            {categoriasDisponiveis.map((categoria) => (
              <option key={categoria} value={categoria}>
                {categoria}
              </option>
            ))}
          </select>
        </div>

        {/* Subcategoria */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '6px'
            }}
          >
            Subcategoria <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            value={subcategoriaSelecionada}
            onChange={(e) => handleSubcategoriaChange(e.target.value)}
            disabled={!categoriaSelecionada}
            style={{
              ...(categoriaSelecionada ? selectStyle : disabledSelectStyle),
              borderColor: error && !subcategoriaSelecionada ? '#ef4444' : '#e5e7eb'
            }}
            onFocus={(e) => {
              if (categoriaSelecionada) {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = error && !subcategoriaSelecionada ? '#ef4444' : '#e5e7eb'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <option value="">Selecione</option>
            {subcategoriasDisponiveis.map((subcategoria) => (
              <option key={subcategoria} value={subcategoria}>
                {subcategoria}
              </option>
            ))}
          </select>
        </div>

        {/* Contraparte - NOVO */}
        {showContraparte && (
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '6px'
              }}
            >
              Contraparte <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              value={contraparteValue || ''}
              onChange={(e) => onContraparteChange?.(e.target.value)}
              style={{
                ...selectStyle,
                borderColor: contraparteError ? '#ef4444' : '#e5e7eb'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = contraparteError ? '#ef4444' : '#e5e7eb'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <option value="">Selecione</option>
              {contrapartes.map((cp) => (
                <option key={cp.id} value={cp.id}>
                  {cp.apelido || cp.nome}
                </option>
              ))}
            </select>
            {contraparteError && (
              <p
                style={{
                  marginTop: '4px',
                  fontSize: '11px',
                  color: '#ef4444',
                  fontWeight: '500'
                }}
              >
                {contraparteError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Preview do código selecionado */}
      {value && (
        <div
          style={{
            marginTop: '12px',
            padding: '12px',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            <span
              style={{
                fontSize: '12px',
                fontWeight: '500',
                color: '#1e40af'
              }}
            >
              Código Financeiro:{' '}
            </span>
            <span
              style={{
                fontSize: '14px',
                fontWeight: '700',
                color: '#1e3a8a',
                fontFamily: 'monospace'
              }}
            >
              {todasContas.find((c) => c.id === value)?.codigo_conta}
            </span>
          </div>
          <div>
            <span
              style={{
                fontSize: '12px',
                fontWeight: '500',
                color: '#1e40af'
              }}
            >
              Plano Contábil:{' '}
            </span>
            <span
              style={{
                fontSize: '14px',
                fontWeight: '700',
                color: '#1e3a8a',
                fontFamily: 'monospace'
              }}
            >
              {todasContas.find((c) => c.id === value)?.cod_cont || '1.00.00.00.001'}
            </span>
            <span
              style={{
                fontSize: '12px',
                fontWeight: '500',
                color: '#1e40af'
              }}
            >
              {' '}- {todasContas.find((c) => c.id === value)?.conta_cont || 'Em Desenvolvimento'}
            </span>
          </div>
        </div>
      )}

      {/* Erro */}
      {error && (
        <p
          style={{
            marginTop: '6px',
            fontSize: '12px',
            color: '#ef4444',
            fontWeight: '500'
          }}
        >
          {error}
        </p>
      )}
    </div>
  )
}