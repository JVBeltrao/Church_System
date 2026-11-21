import { Request, Response } from 'express'
import { z } from 'zod'
import prisma from '../utils/prisma'
import { AppError } from '../utils/AppError'
import { idRegistro, textoCurto, textoLongo } from '../utils/validacao'
import { URGENCIA, incluirTiposComUltima, resumirAtivo } from '../utils/manutencao'

/** Um tipo de manutenção do ativo (ex.: "Limpeza", a cada 90 dias). `id` só vem na edição. */
const tipoSchema = z.object({
  id: idRegistro.optional(),
  nome: textoCurto(2, 80),
  periodicidadeDias: z.number().int().positive('O prazo deve ser de pelo menos 1 dia.').max(3650, 'O prazo máximo é de 10 anos.'),
})

const ativoSchema = z
  .object({
    nome: textoCurto(2, 120),
    descricao: textoLongo(500),
    tipos: z.array(tipoSchema).min(1, 'Cadastre pelo menos um tipo de manutenção.').max(20),
  })
  .refine((a) => new Set(a.tipos.map((t) => t.nome.toLowerCase())).size === a.tipos.length, {
    message: 'Há dois tipos de manutenção com o mesmo nome.',
    path: ['tipos'],
  })

const dataValida = z.string().refine((d) => !Number.isNaN(Date.parse(d)), 'Data inválida.')

/** Registrar: pode marcar vários tipos feitos na mesma visita (ex.: limpeza + troca do filtro). */
const registrarSchema = z.object({
  tipoIds: z.array(idRegistro).min(1, 'Escolha o que foi feito.').max(20),
  data: dataValida,
  descricao: textoCurto(2, 300),
  responsavel: textoCurto(2, 120),
})

const editarManutencaoSchema = z.object({
  tipoId: idRegistro.optional(),
  data: dataValida,
  descricao: textoCurto(2, 300),
  responsavel: textoCurto(2, 120),
})

async function ativoResumido(id: string) {
  const ativo = await prisma.ativo.findUnique({ where: { id }, include: incluirTiposComUltima })
  return ativo ? resumirAtivo(ativo) : null
}

export async function listarAtivos(_req: Request, res: Response) {
  const ativos = await prisma.ativo.findMany({ include: incluirTiposComUltima, orderBy: { nome: 'asc' } })
  return res.json(ativos.map(resumirAtivo))
}

export async function obterAtivo(req: Request, res: Response) {
  const ativo = await ativoResumido(req.params.id)
  if (!ativo) throw new AppError('Ativo não encontrado.', 404)

  const historico = await prisma.manutencao.findMany({
    where: { ativoId: req.params.id },
    orderBy: { data: 'desc' },
    include: { tipo: { select: { id: true, nome: true } } },
  })
  return res.json({ ...ativo, historico })
}

export async function criarAtivo(req: Request, res: Response) {
  const { tipos, ...dados } = ativoSchema.parse(req.body)
  const ativo = await prisma.ativo.create({
    data: { ...dados, tipos: { create: tipos.map(({ nome, periodicidadeDias }) => ({ nome, periodicidadeDias })) } },
  })
  return res.status(201).json(await ativoResumido(ativo.id))
}

/**
 * Atualiza o ativo e sincroniza os tipos: os que vêm com `id` são alterados, os sem `id` são
 * criados e os que sumiram da lista são apagados (junto com o histórico deles — a tela avisa antes).
 */
export async function atualizarAtivo(req: Request, res: Response) {
  const { id } = req.params
  const existente = await prisma.ativo.findUnique({ where: { id }, include: { tipos: { select: { id: true } } } })
  if (!existente) throw new AppError('Ativo não encontrado.', 404)

  const { tipos, ...dados } = ativoSchema.parse(req.body)
  const idsAtuais = new Set(existente.tipos.map((t) => t.id))
  if (tipos.some((t) => t.id && !idsAtuais.has(t.id))) throw new AppError('Tipo de manutenção não pertence a este ativo.', 400)
  const manter = new Set(tipos.filter((t) => t.id).map((t) => t.id!))

  await prisma.$transaction(async (tx) => {
    await tx.ativo.update({ where: { id }, data: dados })
    await tx.tipoManutencao.deleteMany({ where: { ativoId: id, id: { notIn: [...manter] } } })
    // Renomear em duas etapas evita conflito do nome único quando dois tipos trocam de nome
    for (const t of tipos.filter((t) => t.id)) {
      await tx.tipoManutencao.update({ where: { id: t.id }, data: { nome: `__${t.id}`, periodicidadeDias: t.periodicidadeDias } })
    }
    for (const t of tipos.filter((t) => t.id)) {
      await tx.tipoManutencao.update({ where: { id: t.id }, data: { nome: t.nome } })
    }
    for (const t of tipos.filter((t) => !t.id)) {
      await tx.tipoManutencao.create({ data: { ativoId: id, nome: t.nome, periodicidadeDias: t.periodicidadeDias } })
    }
  })

  return res.json(await ativoResumido(id))
}

export async function removerAtivo(req: Request, res: Response) {
  const { id } = req.params
  const existente = await prisma.ativo.findUnique({ where: { id } })
  if (!existente) throw new AppError('Ativo não encontrado.', 404)

  await prisma.ativo.delete({ where: { id } })
  return res.status(204).send()
}

export async function registrarManutencao(req: Request, res: Response) {
  const { id: ativoId } = req.params
  const ativo = await prisma.ativo.findUnique({ where: { id: ativoId }, include: { tipos: { select: { id: true } } } })
  if (!ativo) throw new AppError('Ativo não encontrado.', 404)

  const dados = registrarSchema.parse(req.body)
  const doAtivo = new Set(ativo.tipos.map((t) => t.id))
  const tipoIds = [...new Set(dados.tipoIds)]
  if (tipoIds.some((t) => !doAtivo.has(t))) throw new AppError('Tipo de manutenção não pertence a este ativo.', 400)

  const manutencoes = await prisma.$transaction(
    tipoIds.map((tipoId) =>
      prisma.manutencao.create({
        data: {
          ativoId,
          tipoId,
          data: new Date(dados.data),
          descricao: dados.descricao,
          responsavel: dados.responsavel,
          realizadaPor: req.usuarioId,
        },
      })
    )
  )

  return res.status(201).json({ manutencoes, ativo: await ativoResumido(ativoId) })
}

/** Pendências por tipo (vencidas, sem registro e próximas), da mais urgente para a menos. */
export async function listarPendencias() {
  const ativos = await prisma.ativo.findMany({ include: incluirTiposComUltima })
  return ativos
    .map(resumirAtivo)
    .flatMap((a) =>
      a.tipos
        .filter((t) => t.status !== 'EM_DIA')
        .map((t) => ({
          ativoId: a.id,
          ativoNome: a.nome,
          tipoId: t.id,
          tipoNome: t.nome,
          periodicidadeDias: t.periodicidadeDias,
          ultimaManutencao: t.ultimaManutencao,
          proximaManutencao: t.proximaManutencao,
          status: t.status,
        }))
    )
    .sort(
      (a, b) =>
        URGENCIA[a.status] - URGENCIA[b.status] ||
        (a.proximaManutencao?.getTime() ?? 0) - (b.proximaManutencao?.getTime() ?? 0) ||
        a.ativoNome.localeCompare(b.ativoNome, 'pt-BR')
    )
}

export async function alertas(_req: Request, res: Response) {
  return res.json(await listarPendencias())
}

// ─── Histórico e edição de manutenções individuais ───────────────────────────

/**
 * Todas as manutenções agrupadas por ativo.
 * Filtros opcionais: ?ativoId=, ?tipoId=, ?de=YYYY-MM-DD, ?ate=YYYY-MM-DD
 */
export async function relatorio(req: Request, res: Response) {
  const { ativoId, tipoId, de, ate } = req.query as Record<string, string | undefined>

  const filtroData = {
    ...(de ? { gte: new Date(de) } : {}),
    ...(ate ? { lte: new Date(ate) } : {}),
  }

  const ativos = await prisma.ativo.findMany({
    where: ativoId ? { id: ativoId } : {},
    orderBy: { nome: 'asc' },
    include: {
      ...incluirTiposComUltima, // situação sempre pela última manutenção real (sem o filtro de período)
      manutencoes: {
        where: {
          ...(Object.keys(filtroData).length ? { data: filtroData } : {}),
          ...(tipoId ? { tipoId } : {}),
        },
        orderBy: { data: 'desc' },
        include: { tipo: { select: { id: true, nome: true } } },
      },
    },
  })

  return res.json(ativos.map(resumirAtivo))
}

export async function atualizarManutencao(req: Request, res: Response) {
  const { id } = req.params
  const existente = await prisma.manutencao.findUnique({ where: { id } })
  if (!existente) throw new AppError('Manutenção não encontrada.', 404)

  const dados = editarManutencaoSchema.parse(req.body)
  if (dados.tipoId && dados.tipoId !== existente.tipoId) {
    const tipo = await prisma.tipoManutencao.findUnique({ where: { id: dados.tipoId } })
    if (!tipo || tipo.ativoId !== existente.ativoId) throw new AppError('Tipo de manutenção não pertence a este ativo.', 400)
  }

  const manutencao = await prisma.manutencao.update({
    where: { id },
    data: {
      data: new Date(dados.data),
      descricao: dados.descricao,
      responsavel: dados.responsavel,
      ...(dados.tipoId ? { tipoId: dados.tipoId } : {}),
    },
  })

  // Situação e próxima data são derivadas na consulta: basta devolver o ativo recalculado.
  return res.json({ manutencao, ativo: await ativoResumido(existente.ativoId) })
}

export async function removerManutencao(req: Request, res: Response) {
  const { id } = req.params
  const existente = await prisma.manutencao.findUnique({ where: { id } })
  if (!existente) throw new AppError('Manutenção não encontrada.', 404)

  await prisma.manutencao.delete({ where: { id } })
  // O cron diário limpa os avisos que deixaram de valer.
  return res.json({ ativo: await ativoResumido(existente.ativoId) })
}
