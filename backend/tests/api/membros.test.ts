import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { banco } from '../helpers/banco'
import { carregarApp, entrar, semearAdmin } from '../helpers/api'

/** Cadastro de membros: correções da avaliação com a igreja (tarefas A2 e A3). */
let app: Express
let auth: Record<string, string>
beforeAll(async () => {
  banco.limpar()
  semearAdmin(banco)
  app = await carregarApp()
  auth = await entrar(app)
})
beforeEach(() => {
  banco.tabelas.membro = []
  banco.tabelas.membroCargo = []
  // IDs como os que a migração de 30/10/2026 gerou (md5, fora do padrão de versão do UUID)
  banco.tabelas.cargo = [
    { id: '9e107d9d-372b-b682-6b6c-c1b55a1f1d3e', nome: 'Secretária' },
    { id: 'e4d909c2-90d0-fb1c-a068-ffaddf22cbd0', nome: 'Auxiliar' },
  ]
})

const criar = (dados: Record<string, unknown>) => request(app).post('/api/membros').set(auth).send({ nomeCompleto: 'Irmã Maria', telefone: '83999990000', ...dados })

describe('cadastro de membro', () => {
  it('regressão A2: aceita os cargos Secretária e Auxiliar (IDs criados pela migração)', async () => {
    const r = await criar({ cargoIds: banco.tabelas.cargo.map((c) => c.id) })
    expect(r.status).toBe(201)
    expect(r.body.cargos.map((c: any) => c.cargo.nome)).toEqual(['Secretária', 'Auxiliar'])
  })

  it('ID que não tem formato de ID → mensagem clara', async () => {
    const r = await criar({ cargoIds: ['cargo-qualquer'] })
    expect(r.status).toBe(400)
    expect(r.body.detalhes.join(' ')).toMatch(/ID inválido/)
  })

  it('A3: telefone é obrigatório', async () => {
    const r = await request(app).post('/api/membros').set(auth).send({ nomeCompleto: 'Sem Telefone' })
    expect(r.status).toBe(400)
    expect(banco.tabelas.membro).toHaveLength(0)
  })

  it('A3: telefone em branco também é recusado', async () => {
    expect((await criar({ telefone: '   ' })).status).toBe(400)
  })
})
