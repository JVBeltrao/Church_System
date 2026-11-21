import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import { periodicidadePorExtenso, prazoPorExtenso } from './situacaoManutencao'

describe('prazoPorExtenso', () => {
  const hoje = dayjs('2026-11-21T15:00')
  it.each([
    ['2026-11-21T00:00:00.000Z', 'vence hoje'],
    ['2026-11-22T00:00:00.000Z', 'vence amanhã'],
    ['2026-12-01T00:00:00.000Z', 'vence em 10 dias'],
    ['2026-11-20T00:00:00.000Z', 'venceu ontem'],
    ['2026-10-22T00:00:00.000Z', 'venceu há 30 dias'],
  ])('%s → %s', (data, texto) => expect(prazoPorExtenso(data, hoje)).toBe(texto))
  it('sem data → nunca registrada', () => expect(prazoPorExtenso(null, hoje)).toBe('nunca registrada'))
})

describe('periodicidadePorExtenso', () => {
  it.each([[30, 'todo mês'], [90, 'a cada 3 meses'], [365, 'todo ano'], [730, 'a cada 2 anos'], [14, 'a cada 2 semanas'], [45, 'a cada 45 dias']])(
    '%i dias → %s', (dias, texto) => expect(periodicidadePorExtenso(dias)).toBe(texto)
  )
})
