import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formatação de data para pt-BR (DD/MM/AAAA)
export function formatDate(date: string | Date | null): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('pt-BR').format(d)
}

// Formatação de moeda BRL (R$ 1.234,56)
export function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

// Formatação de porcentagem
export function formatPercent(value: number | null, decimals: number = 2): string {
  if (value === null || value === undefined) return '0%'
  return `${value.toFixed(decimals)}%`
}

// Parser de data pt-BR para ISO
export function parseDateBR(dateBR: string): string {
  const [day, month, year] = dateBR.split('/')
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}
