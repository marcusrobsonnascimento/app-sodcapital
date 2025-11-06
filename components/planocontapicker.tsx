'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface PlanoContaFluxo {
  id: string
  codigo_conta: string
  tipo_fluxo: 'Operacional' | 'Investimento' | 'Financiamento'
  grupo: string
  categoria: string
  subcategoria: string
  sentido: 'Entrada' | 'Saida' | null
}

interface PlanoContaPickerProps {
  value: string
  onChange: (id: string) => void
  sentidoFilter?: 'Entrada' | 'Saida'
  error?: string
}

export default function PlanoContaPicker({ value, onChange, sentidoFilter, error }: PlanoContaPickerProps) {
  const [todasContas, setTodasContas] = useState<PlanoContaFluxo[]>([])
  const [loading, setLoading] = useState(true)

  // Estados das seleções
  const [tipoFluxoSelecionado, setTipoFluxoSelecionado] = useState<string>('')
  const [grupoSelecionado, setGrupoSelecionado] = useState<string>('')
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string>('')
  const [subcategoriaSelecionada, setSubcategoriaSelecionada] = useState<string>('')

  // Listas filtradas
  const [tiposFluxoDisponiveis, setTiposFluxoDisponiveis] = useState<string[]>([])
  const [gruposDisponiveis, setGruposDisponiveis] = useState<string[]>([])
  const [categoriasDisponiveis, setCategoriasDisponiveis] = useState<string[]>([])
  const [subcategoriasDisponiveis, setSubcategoriasDisponiveis] = useState<string[]>([])

  // Carregar todas as contas ao montar
  useEffect(() => {
    loadContas()
  }, [])

  // Filtrar por sentido quando mudar
  useEffect(() => {
    if (todasContas.length > 0) {
      aplicarFiltroSentido()
    }
  }, [sentidoFilter, todasContas])

  // Quando value mudar externamente (edição), preencher os campos
  useEffect(() => {
    if (value && todasContas.length > 0) {
      const conta = todasContas.find(c => c.id === value)
      if (conta) {
        setTipoFluxoSelecionado(conta.tipo_fluxo)
        setGrupoSelecionado(conta.grupo)
        setCategoriaSelecionada(conta.categoria)
        setSubcategoriaSelecionada(conta.subcategoria)
      }
    }
  }, [value, todasContas])

  const loadContas = async () => {
    try {
      const { data, error } = await supabase
        .from('plano_contas_fluxo')
        .select('*')
        .eq('ativo', true)
        .order('codigo_conta', { ascending: true })

      if (error) throw error
      setTodasContas(data || [])
    } catch (err) {
      console.error('Erro ao carregar plano de contas:', err)
    } finally {
      setLoading(false)
    }
  }

  const aplicarFiltroSentido = () => {
    let contasFiltradas = todasContas

    if (sentidoFilter) {
      contasFiltradas = todasContas.filter(c => c.sentido === sentidoFilter)
    }

    // Extrair tipos de fluxo únicos
    const tipos = Array.from(new Set(contasFiltradas.map(c => c.tipo_fluxo)))
    setTiposFluxoDisponiveis(tipos)

    // Resetar seleções
    setTipoFluxoSelecionado('')
    setGrupoSelecionado('')
    setCategoriaSelecionada('')
    setSubcategoriaSelecionada('')
    setGruposDisponiveis([])
    setCategoriasDisponiveis([])
    setSubcategoriasDisponiveis([])
  }

  const handleTipoFluxoChange = (tipo: string) => {
    setTipoFluxoSelecionado(tipo)
    setGrupoSelecionado('')
    setCategoriaSelecionada('')
    setSubcategoriaSelecionada('')
    onChange('')

    if (!tipo) {
      setGruposDisponiveis([])
      setCategoriasDisponiveis([])
      setSubcategoriasDisponiveis([])
      return
    }

    // Filtrar grupos disponíveis para este tipo de fluxo
    let contasFiltradas = todasContas.filter(c => c.tipo_fluxo === tipo)

    if (sentidoFilter) {
      contasFiltradas = contasFiltradas.filter(c => c.sentido === sentidoFilter)
    }

    const grupos = Array.from(new Set(contasFiltradas.map(c => c.grupo))).sort()
    setGruposDisponiveis(grupos)
    setCategoriasDisponiveis([])
    setSubcategoriasDisponiveis([])
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

    // Filtrar categorias disponíveis para este grupo
    let contasFiltradas = todasContas.filter(
      c => c.tipo_fluxo === tipoFluxoSelecionado && c.grupo === grupo
    )

    if (sentidoFilter) {
      contasFiltradas = contasFiltradas.filter(c => c.sentido === sentidoFilter)
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

    // Filtrar subcategorias disponíveis para esta categoria
    let contasFiltradas = todasContas.filter(
      c =>
        c.tipo_fluxo === tipoFluxoSelecionado &&
        c.grupo === grupoSelecionado &&
        c.categoria === categoria
    )

    if (sentidoFilter) {
      contasFiltradas = contasFiltradas.filter(c => c.sentido === sentidoFilter)
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

    // Encontrar a conta correspondente
    let conta = todasContas.find(
      c =>
        c.tipo_fluxo === tipoFluxoSelecionado &&
        c.grupo === grupoSelecionado &&
        c.categoria === categoriaSelecionada &&
        c.subcategoria === subcategoria
    )

    if (sentidoFilter && conta) {
      conta = todasContas.find(
        c =>
          c.tipo_fluxo === tipoFluxoSelecionado &&
          c.grupo === grupoSelecionado &&
          c.categoria === categoriaSelecionada &&
          c.subcategoria === subcategoria &&
          c.sentido === sentidoFilter
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
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px'
        }}
      >
        {/* Tipo de Fluxo */}
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
            Tipo de Fluxo
          </label>
          <select
            value={tipoFluxoSelecionado}
            onChange={(e) => handleTipoFluxoChange(e.target.value)}
            style={selectStyle}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#1555D6'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <option value="">Selecione</option>
            {tiposFluxoDisponiveis.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </select>
        </div>

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
            Grupo
          </label>
          <select
            value={grupoSelecionado}
            onChange={(e) => handleGrupoChange(e.target.value)}
            disabled={!tipoFluxoSelecionado}
            style={tipoFluxoSelecionado ? selectStyle : disabledSelectStyle}
            onFocus={(e) => {
              if (tipoFluxoSelecionado) {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb'
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
            Categoria
          </label>
          <select
            value={categoriaSelecionada}
            onChange={(e) => handleCategoriaChange(e.target.value)}
            disabled={!grupoSelecionado}
            style={grupoSelecionado ? selectStyle : disabledSelectStyle}
            onFocus={(e) => {
              if (grupoSelecionado) {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb'
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
            Subcategoria
          </label>
          <select
            value={subcategoriaSelecionada}
            onChange={(e) => handleSubcategoriaChange(e.target.value)}
            disabled={!categoriaSelecionada}
            style={categoriaSelecionada ? selectStyle : disabledSelectStyle}
            onFocus={(e) => {
              if (categoriaSelecionada) {
                e.currentTarget.style.borderColor = '#1555D6'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb'
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
      </div>

      {/* Preview do código selecionado */}
      {value && (
        <div
          style={{
            marginTop: '12px',
            padding: '12px',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bfdbfe',
            borderRadius: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: '500',
                color: '#1e40af'
              }}
            >
              Código:
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