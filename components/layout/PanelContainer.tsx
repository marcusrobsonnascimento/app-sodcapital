'use client'

import { X, Columns } from 'lucide-react'
import { usePanels } from '@/contexts/PanelContext'
import { getPageInfo } from '@/lib/pageRegistry'

// Componente para renderizar o conteúdo de um painel
function PanelContent({ route }: { route: string }) {
  const pageInfo = getPageInfo(route)
  
  if (!pageInfo) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#6b7280',
        flexDirection: 'column',
        gap: '8px'
      }}>
        <span style={{ fontSize: '48px' }}>🔍</span>
        <span style={{ fontSize: '14px' }}>Página não encontrada: {route}</span>
      </div>
    )
  }

  const PageComponent = pageInfo.component
  return <PageComponent />
}

// Componente principal do container de painéis
export default function PanelContainer() {
  const { panels, maxPanels, closePanel, setActivePanel } = usePanels()

  // Se não há painéis, mostrar mensagem inicial
  if (panels.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        backgroundColor: '#f9fafb',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <Columns size={64} color="#d1d5db" />
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
            Nenhuma página aberta
          </h3>
          <p style={{ fontSize: '14px', color: '#6b7280', maxWidth: '400px' }}>
            Clique em um item do menu para abrir.<br />
            Use <strong>Ctrl+Clique</strong> para abrir em uma nova aba.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Barra de abas */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        padding: '0 12px',
        minHeight: '46px',
        gap: '2px'
      }}>
        {/* Abas */}
        <div style={{ display: 'flex', gap: '2px', flex: 1, overflow: 'auto' }}>
          {panels.map((panel) => (
            <div
              key={panel.id}
              onClick={() => setActivePanel(panel.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                backgroundColor: panel.isActive ? '#ffffff' : '#f3f4f6',
                border: panel.isActive ? '1px solid #e5e7eb' : '1px solid transparent',
                borderBottom: panel.isActive ? '2px solid #1555D6' : '2px solid transparent',
                borderRadius: '8px 8px 0 0',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                maxWidth: '200px',
                minWidth: '100px'
              }}
              onMouseOver={(e) => {
                if (!panel.isActive) {
                  e.currentTarget.style.backgroundColor = '#e5e7eb'
                }
              }}
              onMouseOut={(e) => {
                if (!panel.isActive) {
                  e.currentTarget.style.backgroundColor = '#f3f4f6'
                }
              }}
            >
              {/* Indicador de ativo */}
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: panel.isActive ? '#1555D6' : '#9ca3af',
                flexShrink: 0
              }} />
              
              {/* Título */}
              <span style={{
                fontSize: '13px',
                fontWeight: panel.isActive ? '600' : '500',
                color: panel.isActive ? '#1555D6' : '#6b7280',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flex: 1
              }}>
                {panel.title}
              </span>
              
              {/* Botão fechar */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closePanel(panel.id)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '20px',
                  height: '20px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: '#9ca3af',
                  transition: 'all 0.15s ease',
                  flexShrink: 0
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#fee2e2'
                  e.currentTarget.style.color = '#dc2626'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = '#9ca3af'
                }}
                title="Fechar aba"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        
        {/* Contador de abas */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          color: '#9ca3af',
          fontSize: '12px',
          borderLeft: '1px solid #e5e7eb',
          marginLeft: '8px'
        }}>
          <Columns size={14} />
          <span>{panels.length}/{maxPanels} abas</span>
        </div>
      </div>

      {/* SOLUÇÃO: Renderiza TODOS os painéis, mas esconde os inativos com CSS */}
      {/* Isso mantém o estado de cada painel mesmo quando não está visível */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        backgroundColor: '#ffffff',
        position: 'relative'
      }}>
        {panels.map((panel) => (
          <div
            key={panel.id}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              padding: '24px',
              overflow: 'auto',
              // CRÍTICO: Usa display para esconder/mostrar sem desmontar
              display: panel.isActive ? 'block' : 'none',
              // Visibilidade extra para garantir que não processe eventos quando oculto
              visibility: panel.isActive ? 'visible' : 'hidden',
              // Pointer events desabilitados quando oculto
              pointerEvents: panel.isActive ? 'auto' : 'none'
            }}
          >
            <PanelContent route={panel.route} />
          </div>
        ))}
      </div>
    </div>
  )
}