'use client'

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

// Tipos
export interface Panel {
  id: string
  route: string
  title: string
  isActive: boolean
}

interface PanelContextType {
  panels: Panel[]
  activePanel: string | null
  maxPanels: number
  openPanel: (route: string, title: string, forceNew?: boolean) => void
  closePanel: (panelId: string) => void
  setActivePanel: (panelId: string) => void
  closeAllPanels: () => void
}

const PanelContext = createContext<PanelContextType | undefined>(undefined)

// Gerador de ID único
const generatePanelId = () => `panel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// Provider
export function PanelProvider({ children }: { children: ReactNode }) {
  const [panels, setPanels] = useState<Panel[]>([])
  const [activePanel, setActivePanelState] = useState<string | null>(null)
  const maxPanels = 5

  // Abrir painel
  const openPanel = useCallback((route: string, title: string, forceNew: boolean = false) => {
    setPanels(currentPanels => {
      // Se não forçar novo painel, verificar se a rota já está aberta
      if (!forceNew) {
        const existingPanel = currentPanels.find(p => p.route === route)
        if (existingPanel) {
          // Ativar o painel existente
          setActivePanelState(existingPanel.id)
          return currentPanels.map(p => ({
            ...p,
            isActive: p.id === existingPanel.id
          }))
        }
      }

      // Se não há painéis, criar o primeiro
      if (currentPanels.length === 0) {
        const newPanel: Panel = {
          id: generatePanelId(),
          route,
          title,
          isActive: true
        }
        setActivePanelState(newPanel.id)
        return [newPanel]
      }

      // Se forceNew e não atingiu o limite, adicionar novo painel
      if (forceNew && currentPanels.length < maxPanels) {
        const newPanel: Panel = {
          id: generatePanelId(),
          route,
          title,
          isActive: true
        }
        setActivePanelState(newPanel.id)
        return [
          ...currentPanels.map(p => ({ ...p, isActive: false })),
          newPanel
        ]
      }

      // Se forceNew mas atingiu limite, substituir o painel ativo
      if (forceNew && currentPanels.length >= maxPanels) {
        const activePanelId = currentPanels.find(p => p.isActive)?.id || currentPanels[currentPanels.length - 1].id
        return currentPanels.map(p => 
          p.id === activePanelId 
            ? { ...p, route, title }
            : p
        )
      }

      // Clique normal: substituir conteúdo do painel ativo
      const activePanelId = currentPanels.find(p => p.isActive)?.id
      if (activePanelId) {
        return currentPanels.map(p => 
          p.id === activePanelId 
            ? { ...p, route, title }
            : p
        )
      }

      // Fallback: substituir o último painel
      return currentPanels.map((p, index) => 
        index === currentPanels.length - 1
          ? { ...p, route, title, isActive: true }
          : { ...p, isActive: false }
      )
    })
  }, [maxPanels])

  // Fechar painel
  const closePanel = useCallback((panelId: string) => {
    setPanels(currentPanels => {
      const newPanels = currentPanels.filter(p => p.id !== panelId)
      
      // Se fechou o painel ativo, ativar o último
      if (newPanels.length > 0) {
        const wasActive = currentPanels.find(p => p.id === panelId)?.isActive
        if (wasActive) {
          newPanels[newPanels.length - 1].isActive = true
          setActivePanelState(newPanels[newPanels.length - 1].id)
        }
      } else {
        setActivePanelState(null)
      }
      
      return newPanels
    })
  }, [])

  // Definir painel ativo
  const setActivePanel = useCallback((panelId: string) => {
    setActivePanelState(panelId)
    setPanels(currentPanels => 
      currentPanels.map(p => ({
        ...p,
        isActive: p.id === panelId
      }))
    )
  }, [])

  // Fechar todos os painéis
  const closeAllPanels = useCallback(() => {
    setPanels([])
    setActivePanelState(null)
  }, [])

  return (
    <PanelContext.Provider value={{
      panels,
      activePanel,
      maxPanels,
      openPanel,
      closePanel,
      setActivePanel,
      closeAllPanels
    }}>
      {children}
    </PanelContext.Provider>
  )
}

// Hook para usar o contexto
export function usePanels() {
  const context = useContext(PanelContext)
  if (context === undefined) {
    throw new Error('usePanels must be used within a PanelProvider')
  }
  return context
}