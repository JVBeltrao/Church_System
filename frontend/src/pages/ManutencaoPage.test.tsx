import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ManutencaoPage from './ManutencaoPage'
import { renderizar } from '@/test/renderizar'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/services/api', () => ({ default: api, mensagemDeErro: (_e: unknown, p: string) => p }))

const ativos = [
  {
    id: 'ar', nome: 'Ar-condicionado', descricao: 'Salão', status: 'VENCIDO', proximaManutencao: '2026-10-22T00:00:00.000Z', ultimaManutencao: '2026-11-21T00:00:00.000Z',
    tipos: [
      { id: 'gas', nome: 'Recarga de gás', periodicidadeDias: 365, status: 'VENCIDO', ultimaManutencao: '2025-10-22T00:00:00.000Z', proximaManutencao: '2026-10-22T00:00:00.000Z' },
      { id: 'limp', nome: 'Limpeza', periodicidadeDias: 90, status: 'EM_DIA', ultimaManutencao: '2026-11-21T00:00:00.000Z', proximaManutencao: '2027-02-19T00:00:00.000Z' },
    ],
  },
  {
    id: 'bomba', nome: 'Bomba d’água', status: 'EM_DIA', tipos: [{ id: 'rev', nome: 'Revisão', periodicidadeDias: 90, status: 'EM_DIA', proximaManutencao: '2027-01-30T00:00:00.000Z' }],
  },
]

describe('ManutencaoPage — vários tipos por ativo', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 21, 10))
    api.get.mockReset().mockImplementation(async (url: string) => (url === '/ativos' ? { data: ativos } : { data: { historico: [] } }))
    api.post.mockReset().mockResolvedValue({ data: {} })
  })
  afterEach(() => vi.useRealTimers())

  it('mostra cada tipo com o seu prazo e a contagem colorida por situação', async () => {
    renderizar(<ManutencaoPage />)
    const ar = (await screen.findByRole('heading', { name: 'Ar-condicionado' })).closest('article')!
    expect(within(ar).getByText('Recarga de gás')).toBeInTheDocument()
    expect(within(ar).getByText(/venceu há 30 dias/)).toBeInTheDocument()
    expect(within(ar).getByText(/^todo ano/)).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: /Vencidas/ })).getByText('1')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: /Em dia/ })).getByText('2')).toBeInTheDocument()
  })

  it('clicar em "Vencidas" filtra os ativos', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderizar(<ManutencaoPage />)
    await usuario.click(await screen.findByRole('button', { name: /Vencidas/ }))
    expect(screen.getByRole('heading', { name: 'Ar-condicionado' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Bomba d’água' })).not.toBeInTheDocument()
  })

  it('registrar: escolhe o que foi feito e envia os tipos marcados', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderizar(<ManutencaoPage />)
    const ar = (await screen.findByRole('heading', { name: 'Ar-condicionado' })).closest('article')!
    await usuario.click(within(ar).getByRole('button', { name: /Registrar manutenção/ }))

    const dialogo = await screen.findByRole('dialog')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar' }))
    expect(within(dialogo).getByText('Marque o que foi feito.')).toBeInTheDocument()

    await usuario.click(within(dialogo).getByLabelText(/Recarga de gás/))
    await usuario.type(within(dialogo).getByLabelText('Responsável *'), 'Refrigeração Santos')
    await usuario.type(within(dialogo).getByLabelText('Descrição do serviço *'), 'Recarga R-410A')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Registrar' }))
    expect(api.post).toHaveBeenCalledWith('/ativos/ar/manutencoes', expect.objectContaining({ tipoIds: ['gas'], responsavel: 'Refrigeração Santos', data: '2026-11-21' }))
  })

  it('novo ativo: cadastra vários tipos, cada um com o seu prazo', async () => {
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderizar(<ManutencaoPage />)
    await usuario.click(await screen.findByRole('button', { name: /Novo ativo/ }))
    const dialogo = await screen.findByRole('dialog')
    await usuario.type(within(dialogo).getByLabelText('Nome *'), 'Ar da secretaria')
    await usuario.click(within(dialogo).getByRole('button', { name: '+ Limpeza' }))
    await usuario.click(within(dialogo).getByRole('button', { name: '+ Recarga de gás' }))
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(api.post).toHaveBeenCalledWith('/ativos', {
      nome: 'Ar da secretaria',
      descricao: null,
      tipos: [{ nome: 'Limpeza', periodicidadeDias: 90 }, { nome: 'Recarga de gás', periodicidadeDias: 365 }],
    })
  })
})
