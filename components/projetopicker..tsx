'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface Projeto {
  id: string
  nome: string
  projeto_pai_id: string | null
  empresa_id: string
  ativo: boolean
  descricao?: string
}

interface ProjetoHierarquico extends Projeto {
  nivel: number
  caminho_completo: string
  nome_indentado: string
}

interface ProjetoPickerProps {
  empresaId: string | null
  value: string | null
  onChange: (id: string | null) => void
  disabled?: boolean
  error?: string
}

export default function ProjetoPicker({ 
  empresaId, 
  value, 
  onChange, 
  disabled = false,
  error 
}: ProjetoPickerProps) {
  const [projetos, setProjetos] = useState<ProjetoHierarquico[]>([])
  const [loading, setLoading] = useState(false)

  // Carregar projetos quando empresa mudar
  useEffect(() => {
    if (!empresaId) {
      setProjetos([])
      return
    }
    loadProjetos()
  }, [empresaId])

  const loadProjetos = async () => {
    if (!empresaId) return

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .order('nome', { ascending: true })

      if (error) throw error

      // Construir hierarquia
      const hierarquia = construirHierarquia(data || [])
      setProjetos(hierarquia)
    } catch (err) {
      console.error('Erro ao carregar projetos:', err)
    } finally {
      setLoading(false)
    }
  }

  const construirHierarquia = (projetos: Projeto[]): ProjetoHierarquico[] => {
    const map = new Map<string, ProjetoHierarquico>()

    // Criar mapa inicial
    projetos.forEach((projeto) => {
      map.set(projeto.id, {
        ...projeto,
        nivel: 0,
        caminho_completo: projeto.nome,
        nome_indentado: projeto.nome
      })
    })

    const raizes: ProjetoHierarquico[] = []

    // Construir árvore
    projetos.forEach((projeto) => {
      const node = map.get(projeto.id)!

      if (!projeto.projeto_pai_id) {
        // Projeto raiz
        raizes.push(node)
      } else {
        // Subprojeto
        const pai = map.get(projeto.projeto_pai_id)
        if (pai) {
          node.nivel = pai.nivel + 1
          node.caminho_completo = `${pai.caminho_completo} > ${projeto.nome}`
          // Criar indentação visual com caracteres
          node.nome_indentado = '└─ '.repeat(node.nivel) + projeto.nome
        } else {
          // Pai não encontrado, tratar como raiz
          raizes.push(node)
        }
      }
    })

    // Achatar hierarquia para exibição em lista
    return achatarHierarquia(raizes)
  }

  const achatarHierarquia = (projetos: ProjetoHierarquico[]): ProjetoHierarquico[] => {
    const resultado: ProjetoHierarquico[] = []

    projetos.forEach((projeto) => {
      resultado.push(projeto)
      // Se houver subprojetos, processar recursivamente
      const filhos = projetos.filter(p => p.projeto_pai_id === projeto.id)
      if (filhos.length > 0) {
        resultado.push(...achatarHierarquia(filhos))
      }
    })

    return resultado
  }

  const projetoSelecionado = projetos.find(p => p.id === value)

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
        Carregando projetos...
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
    backgroundColor: 'white',
    fontFamily: 'monospace' // Para visualizar melhor a indentação
  }

  const disabledSelectStyle = {
    ...selectStyle,
    backgroundColor: '#f9fafb',
    cursor: 'not-allowed',
    opacity: 0.6
  }

  return (
    <div>
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
          Projeto {!disabled && <span style={{ color: '#ef4444' }}>*</span>}
        </label>
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled || !empresaId || loading}
          style={disabled || !empresaId || loading ? disabledSelectStyle : selectStyle}
          onFocus={(e) => {
            if (!disabled && empresaId && !loading) {
              e.currentTarget.style.borderColor = '#1555D6'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(21, 85, 214, 0.1)'
            }
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#e5e7eb'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <option value="">
            {!empresaId 
              ? 'Selecione uma empresa primeiro' 
              : loading 
              ? 'Carregando projetos...'
              : 'Selecione um projeto...'}
          </option>
          {projetos.map((projeto) => (
            <option key={projeto.id} value={projeto.id}>
              {projeto.nome_indentado}
            </option>
          ))}
        </select>
      </div>

      {/* Preview do projeto selecionado */}
      {projetoSelecionado && (
        <div
          style={{
            marginTop: '12px',
            padding: '12px',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bfdbfe',
            borderRadius: '8px'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: '500',
                  color: '#1e40af'
                }}
              >
                📁 Caminho completo:
              </span>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#1e3a8a'
                }}
              >
                {projetoSelecionado.caminho_completo}
              </span>
            </div>
            {projetoSelecionado.descricao && (
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                {projetoSelecionado.descricao}
              </div>
            )}
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