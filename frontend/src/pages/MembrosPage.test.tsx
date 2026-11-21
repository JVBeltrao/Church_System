import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MembrosPage from './MembrosPage'
import { renderizar } from '@/test/renderizar'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/services/api', () => ({ default: api, mensagemDeErro: (_e: unknown, p: string) => p }))
const baixar = vi.hoisted(() => vi.fn())
vi.mock('@/utils/exportarMembros', async (original) => ({ ...(await original<typeof import('@/utils/exportarMembros')>()), baixarArquivo: baixar }))

const membro = (id: string, nome: string, status = 'ATIVO', telefone: string | null = '83999990001') => ({
  id, nomeCompleto: nome, telefone, email: `${id}@x.com`, status, cargos: [], categorias: [], conjuntos: [], naoQuerImagemGravada: false, criadoEm: '2026-01-01',
})

describe('MembrosPage — contagem, seleção e exportação', () => {
  beforeEach(() => {
    baixar.mockReset()
    api.get.mockImplementation(async (url: string) =>
      url === '/membros'
        ? { data: [membro('a', 'Ana Souza'), membro('b', 'Bruno Lima', 'INATIVO', '83988887777'), membro('c', 'Carla Dias', 'ATIVO', null)] }
        : { data: [] }
    )
  })

  it('mostra o total, os ativos e os inativos', async () => {
    renderizar(<MembrosPage />)
    const total = (await screen.findByText('Total de membros')).parentElement!
    expect(within(total).getByText('3')).toBeInTheDocument()
    expect(within(screen.getByText('Ativos', { selector: 'p' }).parentElement!).getByText('2')).toBeInTheDocument()
    expect(within(screen.getByText('Inativos', { selector: 'p' }).parentElement!).getByText('1')).toBeInTheDocument()
  })

  it('marcar membros e baixar a planilha só com eles', async () => {
    const usuario = userEvent.setup()
    renderizar(<MembrosPage />)
    await screen.findByText('Total de membros')
    // tabela (desktop) e cartões (celular) estão no DOM: usa o primeiro de cada
    await usuario.click(screen.getAllByLabelText('Selecionar Ana Souza')[0])
    await usuario.click(screen.getAllByLabelText('Selecionar Bruno Lima')[0])
    expect(screen.getByText('2 selecionados')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: /Baixar planilha/ }))
    const [csv, nome] = baixar.mock.calls[0]
    expect(nome).toMatch(/^membros-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(csv).toContain('Ana Souza')
    expect(csv).toContain('Bruno Lima')
    expect(csv).not.toContain('Carla Dias')
  })

  it('"Marcar todos" seleciona a lista inteira e copia os telefones', async () => {
    const usuario = userEvent.setup()
    const copiar = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    renderizar(<MembrosPage />)
    await usuario.click(await screen.findByLabelText('Marcar todos da lista'))
    expect(screen.getByText('3 selecionados')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: /Copiar telefones/ }))
    expect(copiar).toHaveBeenCalledWith('(83) 99999-0001\n(83) 98888-7777')
    expect(await screen.findByText(/Telefones copiados \(1 sem telefone cadastrado\)/)).toBeInTheDocument()
  })

  it('sem seleção, as ações valem para a lista que está na tela', async () => {
    const usuario = userEvent.setup()
    renderizar(<MembrosPage />)
    await usuario.click(await screen.findByRole('button', { name: /Baixar planilha/ }))
    expect(baixar.mock.calls[0][0]).toContain('Carla Dias')
  })
})
