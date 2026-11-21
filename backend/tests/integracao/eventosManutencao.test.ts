import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { criarAdmin, limparBanco, prisma } from '../helpers/bancoReal'
import { entrar } from '../helpers/api'

let app: Express
let auth: Record<string, string>
beforeAll(async () => { app = (await import('../../src/app')).default })
beforeEach(async () => {
  await limparBanco()
  await criarAdmin()
  auth = await entrar(app)
})
afterAll(() => prisma.$disconnect())

describe('eventos recorrentes no PostgreSQL', () => {
  const culto = { nome: 'Culto', tipo: 'CULTO', inicio: '2026-11-02T00:00:00.000Z', fusoMinutos: 180, recorrencia: 'SEMANAL', regraRecorrencia: { diasSemana: [0], intervalo: 1, criterioParada: { tipo: 'OCORRENCIAS', valor: 4 } } }

  it('grava a série: 1 evento pai + 3 ocorrências ligadas a ele', async () => {
    expect((await request(app).post('/api/eventos').set(auth).send(culto)).status).toBe(201)
    const todos = await prisma.evento.findMany({ orderBy: { inicio: 'asc' } })
    expect(todos).toHaveLength(4)
    expect(todos.slice(1).every((e) => e.eventoPaiId === todos[0].id)).toBe(true)
    expect(todos[0].regraRecorrencia).toMatchObject({ diasSemana: [0] })
  })

  it('consulta por intervalo, com ordem e limite', async () => {
    await request(app).post('/api/eventos').set(auth).send(culto)
    const r = await request(app).get('/api/eventos').query({ ate: '2026-12-01T00:00:00.000Z', ordem: 'desc', limite: 2 }).set(auth)
    expect(r.body.map((e: any) => e.inicio)).toEqual(['2026-11-23T00:00:00.000Z', '2026-11-16T00:00:00.000Z'])
  })

  it('excluir a série apaga todas as ocorrências (cascata no banco)', async () => {
    await request(app).post('/api/eventos').set(auth).send(culto)
    const pai = await prisma.evento.findFirst({ where: { eventoPaiId: null } })
    expect((await request(app).delete(`/api/eventos/${pai!.id}?escopo=serie`).set(auth)).status).toBe(204)
    expect(await prisma.evento.count()).toBe(0)
  })
})

describe('manutenção com vários tipos por ativo, no PostgreSQL', () => {
  const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
  const criarAtivo = async (nome: string, tipos: [string, number][]) =>
    (await request(app).post('/api/ativos').set(auth).send({ nome, tipos: tipos.map(([n, periodicidadeDias]) => ({ nome: n, periodicidadeDias })) })).body
  const tipoId = (ativo: any, nome: string) => ativo.tipos.find((t: any) => t.nome === nome).id
  const registrar = (ativoId: string, tipoIds: string[], data: string) =>
    request(app).post(`/api/ativos/${ativoId}/manutencoes`).set(auth).send({ tipoIds, data, descricao: 'Serviço', responsavel: 'Técnico' })

  it('cada tipo tem o seu prazo: a limpeza de hoje não resolve a recarga de gás vencida', async () => {
    const ar = await criarAtivo('Ar-condicionado', [['Limpeza', 90], ['Troca do filtro', 180], ['Recarga de gás', 365]])
    await registrar(ar.id, [tipoId(ar, 'Recarga de gás')], diasAtras(400))
    await registrar(ar.id, [tipoId(ar, 'Troca do filtro')], diasAtras(170))
    const r = await registrar(ar.id, [tipoId(ar, 'Limpeza')], diasAtras(0))
    expect(r.status).toBe(201)

    const situacao = Object.fromEntries(r.body.ativo.tipos.map((t: any) => [t.nome, t.status]))
    expect(situacao).toEqual({ Limpeza: 'EM_DIA', 'Troca do filtro': 'PROXIMO', 'Recarga de gás': 'VENCIDO' })
    expect(r.body.ativo.status).toBe('VENCIDO')
  })

  it('uma visita pode registrar vários tipos de uma vez', async () => {
    const ar = await criarAtivo('Ar-condicionado', [['Limpeza', 90], ['Troca do filtro', 180]])
    const r = await registrar(ar.id, [tipoId(ar, 'Limpeza'), tipoId(ar, 'Troca do filtro')], diasAtras(0))
    expect(r.body.manutencoes).toHaveLength(2)
    expect(r.body.ativo.status).toBe('EM_DIA')
  })

  it('não aceita tipo de outro ativo', async () => {
    const ar = await criarAtivo('Ar-condicionado', [['Limpeza', 90]])
    const bomba = await criarAtivo('Bomba', [['Revisão', 90]])
    expect((await registrar(ar.id, [tipoId(bomba, 'Revisão')], diasAtras(0))).status).toBe(400)
  })

  it('ativo sem nenhum tipo ou com tipos repetidos é recusado', async () => {
    expect((await request(app).post('/api/ativos').set(auth).send({ nome: 'Gerador', tipos: [] })).status).toBe(400)
    const repetido = await request(app).post('/api/ativos').set(auth).send({ nome: 'Gerador', tipos: [{ nome: 'Óleo', periodicidadeDias: 90 }, { nome: 'óleo', periodicidadeDias: 30 }] })
    expect(repetido.status).toBe(400)
  })

  it('editar o ativo: muda prazo, cria tipo novo e apaga o removido (com o histórico dele)', async () => {
    const ar = await criarAtivo('Ar-condicionado', [['Limpeza', 90], ['Gás', 365]])
    await registrar(ar.id, [tipoId(ar, 'Gás')], diasAtras(10))
    const r = await request(app).put(`/api/ativos/${ar.id}`).set(auth).send({
      nome: 'Ar-condicionado do salão',
      tipos: [{ id: tipoId(ar, 'Limpeza'), nome: 'Limpeza', periodicidadeDias: 60 }, { nome: 'Troca do filtro', periodicidadeDias: 180 }],
    })
    expect(r.status).toBe(200)
    expect(r.body.tipos.map((t: any) => [t.nome, t.periodicidadeDias]).sort()).toEqual([['Limpeza', 60], ['Troca do filtro', 180]])
    expect(await prisma.manutencao.count()).toBe(0)
  })

  it('dois tipos podem trocar de nome entre si na mesma edição', async () => {
    const ar = await criarAtivo('Ar', [['A', 30], ['B', 60]])
    const r = await request(app).put(`/api/ativos/${ar.id}`).set(auth).send({
      nome: 'Ar',
      tipos: [{ id: tipoId(ar, 'A'), nome: 'B', periodicidadeDias: 30 }, { id: tipoId(ar, 'B'), nome: 'A', periodicidadeDias: 60 }],
    })
    expect(r.status).toBe(200)
  })

  it('pendências do dashboard vêm por tipo, da mais urgente para a menos', async () => {
    const ar = await criarAtivo('Ar-condicionado', [['Limpeza', 90], ['Recarga de gás', 365]])
    await registrar(ar.id, [tipoId(ar, 'Recarga de gás')], diasAtras(400))
    await registrar(ar.id, [tipoId(ar, 'Limpeza')], diasAtras(0))
    const r = await request(app).get('/api/dashboard').set(auth)
    expect(r.body.manutencao).toMatchObject({ vencidos: 1, alertas: 1 })
    expect(r.body.manutencao.itens[0]).toMatchObject({ ativoNome: 'Ar-condicionado', tipoNome: 'Recarga de gás', status: 'VENCIDO' })
  })

  it('o histórico traz o tipo de cada manutenção e filtra por tipo', async () => {
    const ar = await criarAtivo('Ar-condicionado', [['Limpeza', 90], ['Gás', 365]])
    await registrar(ar.id, [tipoId(ar, 'Limpeza')], '2026-01-10')
    await registrar(ar.id, [tipoId(ar, 'Gás')], '2026-04-10')
    const todos = await request(app).get('/api/manutencoes/relatorio').set(auth)
    expect(todos.body[0].manutencoes.map((m: any) => [m.data.slice(0, 10), m.tipo.nome])).toEqual([['2026-04-10', 'Gás'], ['2026-01-10', 'Limpeza']])
    const soLimpeza = await request(app).get(`/api/manutencoes/relatorio?tipoId=${tipoId(ar, 'Limpeza')}`).set(auth)
    expect(soLimpeza.body[0].manutencoes).toHaveLength(1)
  })

  it('editar uma manutenção pode corrigir o tipo', async () => {
    const ar = await criarAtivo('Ar-condicionado', [['Limpeza', 90], ['Gás', 365]])
    const { body } = await registrar(ar.id, [tipoId(ar, 'Limpeza')], diasAtras(5))
    const r = await request(app).put(`/api/manutencoes/${body.manutencoes[0].id}`).set(auth).send({ tipoId: tipoId(ar, 'Gás'), data: diasAtras(5), descricao: 'Recarga', responsavel: 'Técnico' })
    expect(r.status).toBe(200)
    expect(r.body.ativo.tipos.find((t: any) => t.nome === 'Gás').status).toBe('EM_DIA')
  })

  it('excluir o ativo apaga tipos e histórico (cascata)', async () => {
    const ar = await criarAtivo('Ar-condicionado', [['Limpeza', 90]])
    await registrar(ar.id, [tipoId(ar, 'Limpeza')], '2026-01-10')
    expect((await request(app).delete(`/api/ativos/${ar.id}`).set(auth)).status).toBe(204)
    expect(await prisma.manutencao.count()).toBe(0)
    expect(await prisma.tipoManutencao.count()).toBe(0)
  })
})
