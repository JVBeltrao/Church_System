import dayjs from 'dayjs'
import type { StatusManutencao } from '@/types'

/**
 * Cores e textos de cada situação de manutenção, usados em todas as telas para
 * que "vermelho = vencido" e "âmbar = vence logo" fiquem iguais no sistema todo.
 */
export const SITUACAO: Record<StatusManutencao, {
  rotulo: string
  plural: string
  badge: 'red' | 'amber' | 'gray' | 'green'
  /** fundo + borda + texto de um bloco colorido */
  bloco: string
  /** faixa lateral de um cartão */
  faixa: string
  ponto: string
  texto: string
}> = {
  VENCIDO: {
    rotulo: 'Vencida', plural: 'Vencidas', badge: 'red',
    bloco: 'bg-red-50 border-red-200 text-red-800', faixa: 'border-l-red-500', ponto: 'bg-red-500', texto: 'text-red-700',
  },
  SEM_REGISTRO: {
    rotulo: 'Sem registro', plural: 'Sem registro', badge: 'gray',
    bloco: 'bg-slate-50 border-slate-200 text-slate-700', faixa: 'border-l-slate-400', ponto: 'bg-slate-400', texto: 'text-slate-600',
  },
  PROXIMO: {
    rotulo: 'Vence em breve', plural: 'Vencem em breve', badge: 'amber',
    bloco: 'bg-amber-50 border-amber-200 text-amber-900', faixa: 'border-l-amber-500', ponto: 'bg-amber-500', texto: 'text-amber-700',
  },
  EM_DIA: {
    rotulo: 'Em dia', plural: 'Em dia', badge: 'green',
    bloco: 'bg-green-50 border-green-200 text-green-800', faixa: 'border-l-green-500', ponto: 'bg-green-500', texto: 'text-green-700',
  },
}

/** "vence hoje", "vence em 12 dias", "venceu há 3 dias", "nunca registrada" */
export function prazoPorExtenso(proxima: string | null | undefined, hoje = dayjs()): string {
  if (!proxima) return 'nunca registrada'
  const dias = dayjs(proxima.slice(0, 10)).diff(hoje.startOf('day'), 'day')
  if (dias === 0) return 'vence hoje'
  if (dias === 1) return 'vence amanhã'
  if (dias > 1) return `vence em ${dias} dias`
  if (dias === -1) return 'venceu ontem'
  return `venceu há ${-dias} dias`
}

/** "a cada 90 dias" → "a cada 3 meses" quando dá conta redonda */
export function periodicidadePorExtenso(dias: number): string {
  if (dias % 365 === 0) return dias === 365 ? 'todo ano' : `a cada ${dias / 365} anos`
  if (dias % 30 === 0) return dias === 30 ? 'todo mês' : `a cada ${dias / 30} meses`
  if (dias % 7 === 0) return dias === 7 ? 'toda semana' : `a cada ${dias / 7} semanas`
  return `a cada ${dias} dias`
}
