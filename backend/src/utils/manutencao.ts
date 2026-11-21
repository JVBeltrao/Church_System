export type StatusManutencao = 'EM_DIA' | 'PROXIMO' | 'VENCIDO' | 'SEM_REGISTRO'

const DIAS_AVISO = 30

export function calcularProximaManutencao(
  ultimaData: Date,
  periodicidadeDias: number
): Date {
  const proxima = new Date(ultimaData)
  proxima.setDate(proxima.getDate() + periodicidadeDias)
  return proxima
}

export function calcularStatus(proximaManutencao: Date | null): StatusManutencao {
  if (!proximaManutencao) return 'SEM_REGISTRO'

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const proxima = new Date(proximaManutencao)
  proxima.setHours(0, 0, 0, 0)

  const diffMs = proxima.getTime() - hoje.getTime()
  const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDias < 0) return 'VENCIDO'
  if (diffDias <= DIAS_AVISO) return 'PROXIMO'
  return 'EM_DIA'
}

/** Da situação mais urgente para a menos: vencido → sem registro → próximo → em dia */
export const URGENCIA: Record<StatusManutencao, number> = { VENCIDO: 0, SEM_REGISTRO: 1, PROXIMO: 2, EM_DIA: 3 }

interface TipoComUltima {
  id: string
  nome: string
  periodicidadeDias: number
  /** Só a última manutenção deste tipo (ou nenhuma) */
  manutencoes: { data: Date }[]
}

export type SituacaoTipo<T extends TipoComUltima> = Omit<T, 'manutencoes'> & {
  ultimaManutencao: Date | null
  proximaManutencao: Date | null
  status: StatusManutencao
}

/** Situação de um tipo de manutenção, derivada da última vez que foi feito + o prazo do tipo. */
export function situacaoDoTipo<T extends TipoComUltima>(tipo: T): SituacaoTipo<T> {
  const { manutencoes, ...resto } = tipo
  const ultimaManutencao = manutencoes[0]?.data ?? null
  const proximaManutencao = ultimaManutencao ? calcularProximaManutencao(ultimaManutencao, tipo.periodicidadeDias) : null
  return { ...resto, ultimaManutencao, proximaManutencao, status: calcularStatus(proximaManutencao) }
}

/**
 * Situação do ativo = a do tipo mais urgente. A próxima manutenção do ativo é a mais próxima
 * entre os tipos; a última é a mais recente entre todos.
 */
export function resumirAtivo<A extends { tipos: TipoComUltima[] }>(ativo: A): Omit<A, 'tipos'> & {
  tipos: SituacaoTipo<A['tipos'][number]>[]
  status: StatusManutencao
  proximaManutencao: Date | null
  ultimaManutencao: Date | null
} {
  const tipos = ativo.tipos.map((t) => situacaoDoTipo(t)).sort((a, b) => URGENCIA[a.status] - URGENCIA[b.status] || a.nome.localeCompare(b.nome, 'pt-BR'))
  const datas = (xs: (Date | null)[]) => xs.filter((d): d is Date => !!d).map((d) => d.getTime())
  const proximas = datas(tipos.map((t) => t.proximaManutencao))
  const ultimas = datas(tipos.map((t) => t.ultimaManutencao))
  return {
    ...ativo,
    tipos,
    status: (tipos[0]?.status ?? 'SEM_REGISTRO') as StatusManutencao,
    proximaManutencao: proximas.length ? new Date(Math.min(...proximas)) : null,
    ultimaManutencao: ultimas.length ? new Date(Math.max(...ultimas)) : null,
  }
}

/** `include` do Prisma que traz cada tipo com a sua última manutenção */
export const incluirTiposComUltima = {
  tipos: { include: { manutencoes: { orderBy: { data: 'desc' as const }, take: 1, select: { data: true } } } },
}
