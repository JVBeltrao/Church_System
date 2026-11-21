import { Request, Response } from 'express'
import prisma from '../utils/prisma'
import { diasAteAniversario } from '../utils/aniversario'
import { listarPendencias } from './manutencaoController'

export async function resumo(_req: Request, res: Response) {
  const hoje = new Date()
  const em7dias = new Date()
  em7dias.setDate(hoje.getDate() + 7)

  const [totalMembros, totalAtivos, eventosProximos, pendencias, pendentesContribuicao, pendentesPix] =
    await Promise.all([
      prisma.membro.count({ where: { status: 'ATIVO' } }),
      prisma.membro.count(),
      prisma.evento.findMany({ where: { inicio: { gte: hoje, lte: em7dias } }, orderBy: { inicio: 'asc' }, take: 5 }),
      listarPendencias(),
      prisma.contribuicao.count({ where: { status: 'PENDENTE' } }),
      prisma.doacaoAlimento.count({ where: { status: 'PENDENTE' } }),
    ])

  const membrosComAniversario = await prisma.membro.findMany({
    where: { status: 'ATIVO', dataNascimento: { not: null } },
    select: {
      id: true,
      nomeCompleto: true,
      dataNascimento: true,
      cargos: { include: { cargo: { select: { nome: true } } } },
    },
  })

  const aniversariantes = membrosComAniversario
    .map((m) => ({ ...m, diffDias: diasAteAniversario(m.dataNascimento!) }))
    .filter((m) => m.diffDias <= 7)
    .sort((a, b) => a.diffDias - b.diffDias)

  return res.json({
    membros: { total: totalMembros, totalGeral: totalAtivos },
    eventosProximos,
    aniversariantes,
    // Pendências por tipo de manutenção (ex.: "Ar-condicionado — Recarga de gás")
    manutencao: {
      alertas: pendencias.length,
      vencidos: pendencias.filter((p) => p.status === 'VENCIDO').length,
      proximos: pendencias.filter((p) => p.status === 'PROXIMO').length,
      semRegistro: pendencias.filter((p) => p.status === 'SEM_REGISTRO').length,
      itens: pendencias,
    },
    contribuicoesPendentes: pendentesContribuicao,
    doacoesPendentes: pendentesPix,
  })
}
