import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import DashboardPage from './DashboardPage'
import { renderizar } from '@/test/renderizar'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/services/api', () => ({ default: api }))

const painel = (manutencao: object) => ({
  membros: { total: 40, totalGeral: 45 }, eventosProximos: [], aniversariantes: [], contribuicoesPendentes: 2, doacoesPendentes: 0,
  manutencao: { alertas: 0, vencidos: 0, proximos: 0, semRegistro: 0, itens: [], ...manutencao },
})

function montar(dados: object) {
  api.get.mockImplementation(async (url: string) => ({ data: url === '/dashboard' ? dados : [] }))
  return renderizar(<DashboardPage />)
}

describe('DashboardPage — manutenção pendente salta aos olhos', () => {
  it('com manutenção vencida, mostra o aviso vermelho no topo com o ativo e o tipo', async () => {
    montar(painel({
      alertas: 2, vencidos: 1, proximos: 1,
      itens: [
        { ativoId: 'ar', ativoNome: 'Ar-condicionado', tipoId: 'gas', tipoNome: 'Recarga de gás', status: 'VENCIDO', proximaManutencao: '2026-10-01T00:00:00.000Z', periodicidadeDias: 365 },
        { ativoId: 'ar', ativoNome: 'Ar-condicionado', tipoId: 'f', tipoNome: 'Troca do filtro', status: 'PROXIMO', proximaManutencao: '2030-01-01T00:00:00.000Z', periodicidadeDias: 180 },
      ],
    }))
    const aviso = (await screen.findByRole('heading', { name: '1 manutenção vencida' })).closest('section')!
    expect(aviso.className).toMatch(/bg-red-50/)
    expect(within(aviso).getByText('Ar-condicionado — Recarga de gás')).toBeInTheDocument()
    expect(within(aviso).getByText('Ar-condicionado — Troca do filtro')).toBeInTheDocument()
    expect(within(aviso).getByRole('link', { name: /Ver manutenção/ })).toHaveAttribute('href', '/manutencao')
  })

  it('só com manutenções próximas, o aviso fica âmbar', async () => {
    montar(painel({ alertas: 1, proximos: 1, itens: [{ ativoId: 'b', ativoNome: 'Bomba', tipoId: 'r', tipoNome: 'Revisão', status: 'PROXIMO', proximaManutencao: '2030-01-01T00:00:00.000Z', periodicidadeDias: 90 }] }))
    const aviso = (await screen.findByRole('heading', { name: 'Manutenções precisando de atenção' })).closest('section')!
    expect(aviso.className).toMatch(/bg-amber-50/)
  })

  it('tudo em dia: faixa verde', async () => {
    montar(painel({}))
    expect(await screen.findByText('Todas as manutenções estão em dia.')).toBeInTheDocument()
  })
})
