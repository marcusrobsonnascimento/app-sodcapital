'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Search, ChevronDown, X } from 'lucide-react'
import { PlanoContaFluxo, TipoFluxo, Sentido } from '../types/plano-contas.ts'

interface PlanoContaPickerProps {
  value: string
  onChange: (value: string) => void
  tipoFluxoFilter?: TipoFluxo
  sentidoFilter?: Sentido
  disabled?: boolean
  error?: string
  placeholder?: string
}

export default function PlanoContaPicker({
  value,
  onChange,
  tipoFluxoFilter,
  sentidoFilter,
  disabled = false,
  error,
  placeholder = 'Selecione uma conta...'
}: PlanoContaPickerProps) {
  const [contas, setContas] = useState<PlanoContaFluxo[]>([])
  const [filteredContas, setFilteredContas] = useState<PlanoContaFluxo[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selectedConta, setSelectedConta] = useState<PlanoContaFluxo | null>(null)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadContas()
  }, [tipoFluxoFilter, sentidoFilter])

  useEffect(() => {
    if (value && contas.length > 0) {
      const conta = contas.find(c => c.id === value)
      setSelectedConta(conta || null)
    } else {
      setSelectedConta(null)
    }
  }, [value, contas])

  useEffect(() => {
    const filtered = contas.filter(conta => {
      if (!conta.ativo) return false

      const searchLower = searchTerm.toLowerCase()
      const matchesSearch = 
        conta.codigo_conta.toLowerCase().includes(searchLower) ||
        conta.categoria.toLowerCase().includes(searchLower) ||
        conta.subcategoria.toLowerCase().includes(searchLower) ||
        (conta.grupo && conta.grupo.toLowerCase().includes(searchLower))

      return matchesSearch
    })

    setFilteredContas(filtered)
  }, [searchTerm, contas])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadContas = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('plano_contas_fluxo')
        .select('*')
        .eq('ativo', true)
        .order('codigo_conta', { ascending: true })

      if (tipoFluxoFilter) {
        query = query.eq('tipo_fluxo', tipoFluxoFilter)
      }

      if (sentidoFilter) {
        query = query.eq('sentido', sentidoFilter)
      }

      const { data, error } = await query

      if (error) throw error
      setContas(data || [])
      setFilteredContas(data || [])
    } catch (err) {
      console.error('Erro ao carregar plano de contas:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (conta: PlanoContaFluxo) => {
    setSelectedConta(conta)
    onChange(conta.id)
    setIsOpen(false)
    setSearchTerm('')
  }

  const handleClear = () => {
    setSelectedConta(null)
    onChange('')
    setSearchTerm('')
  }

  const getTipoFluxoColor = (tipo: TipoFluxo) => {
    switch (tipo) {
      case 'Operacional': return { bg: '#dbeafe', color: '#1d4ed8' }
      case 'Investimento': return { bg: '#fef3c7', color: '#b45309' }
      case 'Financiamento': return { bg: '#e0e7ff', color: '#6366f1' }
    }
  }

  const getSentidoColor = (sentido: Sentido | null) => {
    if (sentido === 'Entrada') return { bg: '#dcfce7', color: '#16a34a' }
    if (sentido === 'Saida') return { bg: '#fee2e2', color: '#dc2626' }
    return { bg: '#f3f4f6', color: '#6b7280' }
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      {/* Selected Display / Search Input */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '9px 12px',
          border: `1px solid ${error ? '#ef4444' : '#e5e7eb'}`,
          borderRadius: '8px',
          fontSize: '13px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          backgroundColor: disabled ? '#f9fafb' : 'white',
          opacity: disabled ? 0.6 : 1,
          transition: 'all 0.2s',
          minHeight: '38px'
        }}
      >
        <Search size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />
        
        {selectedConta ? (
          <>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
              <span style={{
                fontFamily: 'monospace',
                fontWeight: '600',
                color: '#374151',
                flexShrink: 0
              }}>
                {selectedConta.codigo_conta}
              </span>
              <span style={{ color: '#6b7280', flexShrink: 0 }}>•</span>
              <span style={{
                color: '#374151',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {selectedConta.categoria} - {selectedConta.subcategoria}
              </span>
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleClear()
                }}
                style={{
                  padding: '2px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#9ca3af',
                  flexShrink: 0
                }}
              >
                <X size={16} />
              </button>
            )}
          </>
        ) : (
          <>
            <span style={{ flex: 1, color: '#9ca3af' }}>{placeholder}</span>
            <ChevronDown size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />
          </>
        )}
      </div>

      {error && (
        <span style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
          {error}
        </span>
      )}

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
            zIndex: 50,
            maxHeight: '320px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Search Input */}
          <div style={{ padding: '12px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#9ca3af'
                }}
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por código ou descrição..."
                autoFocus
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Results */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{
                padding: '24px',
                textAlign: 'center',
                color: '#6b7280',
                fontSize: '13px'
              }}>
                Carregando...
              </div>
            ) : filteredContas.length === 0 ? (
              <div style={{
                padding: '24px',
                textAlign: 'center',
                color: '#6b7280',
                fontSize: '13px'
              }}>
                Nenhuma conta encontrada
              </div>
            ) : (
              filteredContas.map((conta) => {
                const tipoColor = getTipoFluxoColor(conta.tipo_fluxo)
                const sentidoColor = getSentidoColor(conta.sentido)

                return (
                  <div
                    key={conta.id}
                    onClick={() => handleSelect(conta)}
                    style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid #f3f4f6',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                      backgroundColor: value === conta.id ? '#f0f9ff' : 'transparent'
                    }}
                    onMouseOver={(e) => {
                      if (value !== conta.id) {
                        e.currentTarget.style.backgroundColor = '#f9fafb'
                      }
                    }}
                    onMouseOut={(e) => {
                      if (value !== conta.id) {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '4px'
                    }}>
                      <span style={{
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#374151'
                      }}>
                        {conta.codigo_conta}
                      </span>
                      
                      <span style={{
                        display: 'inline-flex',
                        padding: '2px 8px',
                        fontSize: '10px',
                        fontWeight: '500',
                        borderRadius: '8px',
                        backgroundColor: tipoColor.bg,
                        color: tipoColor.color
                      }}>
                        {conta.tipo_fluxo}
                      </span>

                      {conta.sentido && (
                        <span style={{
                          display: 'inline-flex',
                          padding: '2px 8px',
                          fontSize: '10px',
                          fontWeight: '500',
                          borderRadius: '8px',
                          backgroundColor: sentidoColor.bg,
                          color: sentidoColor.color
                        }}>
                          {conta.sentido}
                        </span>
                      )}
                    </div>

                    <div style={{
                      fontSize: '12px',
                      color: '#374151'
                    }}>
                      {conta.categoria} - {conta.subcategoria}
                    </div>

                    {conta.grupo && (
                      <div style={{
                        fontSize: '11px',
                        color: '#9ca3af',
                        marginTop: '2px'
                      }}>
                        {conta.grupo}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}