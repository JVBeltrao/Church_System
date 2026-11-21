import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calcularProximaManutencao, calcularStatus, diasAte, resumirAtivo, situacaoDoTipo } from '../../src/utils/manutencao'

describe('calcularProximaManutencao', () => {
  it('soma a periodicidade à data da última manutenção', () => {
    const r = calcularProximaManutencao(new Date(2026, 0, 31), 30)
    expect([r.getFullYear(), r.getMonth(), r.getDate()]).toEqual([2026, 2, 2]) // 31/01 + 30 dias = 02/03
  })
  it('não altera a data recebida', () => {
    const ultima = new Date(2026, 5, 1)
    calcularProximaManutencao(ultima, 90)
    expect(ultima.getMonth()).toBe(5)
  })
})

describe('calcularStatus (derivado na hora, nunca gravado)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 12, 15, 0)) }) // 12/11/2026 15h
  afterEach(() => vi.useRealTimers())

  const dia = (d: number, m = 11) => new Date(2026, m - 1, d)

  it('sem manutenção registrada → SEM_REGISTRO', () => expect(calcularStatus(null)).toBe('SEM_REGISTRO'))
  it('data já passou → VENCIDO', () => expect(calcularStatus(dia(11))).toBe('VENCIDO'))
  it('vence hoje → PROXIMO (ainda não venceu)', () => expect(calcularStatus(dia(12))).toBe('PROXIMO'))
  it('faltam exatamente 30 dias → PROXIMO (limite do aviso)', () => expect(calcularStatus(dia(12, 12))).toBe('PROXIMO'))
  it('faltam 31 dias → EM_DIA', () => expect(calcularStatus(dia(13, 12))).toBe('EM_DIA'))
})

describe('vários tipos de manutenção no mesmo ativo', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 21, 10, 0)) }) // 21/11/2026
  afterEach(() => vi.useRealTimers())

  const diasAtras = (n: number) => new Date(2026, 10, 21 - n)
  const ar = {
    id: 'ar',
    nome: 'Ar-condicionado',
    tipos: [
      { id: 'limpeza', nome: 'Limpeza', periodicidadeDias: 90, manutencoes: [{ data: diasAtras(10) }] },      // em dia (faltam 80)
      { id: 'filtro', nome: 'Troca do filtro', periodicidadeDias: 180, manutencoes: [{ data: diasAtras(160) }] }, // próxima (faltam 20)
      { id: 'gas', nome: 'Recarga de gás', periodicidadeDias: 365, manutencoes: [{ data: diasAtras(400) }] },   // vencida
    ],
  }

  it('cada tipo tem a sua situação, calculada com o seu próprio prazo', () => {
    expect(situacaoDoTipo(ar.tipos[0]).status).toBe('EM_DIA')
    expect(situacaoDoTipo(ar.tipos[1]).status).toBe('PROXIMO')
    expect(situacaoDoTipo(ar.tipos[2]).status).toBe('VENCIDO')
  })

  it('a limpeza de hoje não "zera" o prazo da recarga de gás', () => {
    const r = resumirAtivo(ar)
    expect(r.tipos.find((t) => t.id === 'gas')!.status).toBe('VENCIDO')
  })

  it('o ativo fica com a situação do tipo mais urgente, e os tipos vêm do mais urgente para o menos', () => {
    const r = resumirAtivo(ar)
    expect(r.status).toBe('VENCIDO')
    expect(r.tipos.map((t) => t.id)).toEqual(['gas', 'filtro', 'limpeza'])
  })

  it('última = a mais recente entre os tipos; próxima = a mais próxima', () => {
    const r = resumirAtivo(ar)
    expect(r.ultimaManutencao).toEqual(diasAtras(10))
    expect(r.proximaManutencao).toEqual(new Date(2026, 10, 21 - 400 + 365))
  })

  it('tipo nunca feito → SEM_REGISTRO (mais urgente que "vence em breve")', () => {
    const r = resumirAtivo({ tipos: [ar.tipos[1], { id: 'novo', nome: 'Revisão', periodicidadeDias: 30, manutencoes: [] }] })
    expect(r.status).toBe('SEM_REGISTRO')
    expect(r.tipos[0].ultimaManutencao).toBeNull()
  })
})

describe('regressão: datas do banco (DATE = 00:00 UTC) no fuso de Brasília', () => {
  afterEach(() => vi.useRealTimers())
  // Como o Prisma entrega uma coluna DATE: meia-noite em UTC
  const doBanco = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

  it('última em 22/10 + 30 dias = 21/11 (e não 20/11)', () => {
    expect(calcularProximaManutencao(doBanco('2026-10-22'), 30).toISOString().slice(0, 10)).toBe('2026-11-21')
  })

  it('no próprio dia do vencimento, à tarde, ainda é "vence hoje" (PROXIMO), não VENCIDO', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-21T19:24:00.000Z')) // 21/11 16:24 em Brasília
    const proxima = calcularProximaManutencao(doBanco('2026-10-22'), 30)
    expect(calcularStatus(proxima)).toBe('PROXIMO')
    expect(diasAte(proxima)).toBe(0)
  })

  it('no dia seguinte ao vencimento → VENCIDO', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-22T11:00:00.000Z')) // 22/11 08:00 em Brasília
    expect(calcularStatus(calcularProximaManutencao(doBanco('2026-10-22'), 30))).toBe('VENCIDO')
  })

  it('à noite (depois das 21h, quando em UTC já é o dia seguinte) continua sendo o mesmo dia', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-22T01:30:00.000Z')) // 21/11 22:30 em Brasília
    expect(calcularStatus(calcularProximaManutencao(doBanco('2026-10-22'), 30))).toBe('PROXIMO')
  })
})
