/**
 * Banco de dados em memória que imita o subconjunto do Prisma usado pelos controllers.
 *
 * Serve para os testes de API rodarem o Express de verdade (rotas, middlewares, validação,
 * autenticação) SEM precisar de PostgreSQL. O comportamento real do banco (SQL, chaves,
 * cascatas) é coberto pelos testes de integração em `tests/integracao`.
 */
import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'

type Linha = Record<string, any>

export function criarBancoEmMemoria() {
  const tabelas: Record<string, Linha[]> = {}

  const casa = (r: Linha, w: Linha = {}): boolean =>
    Object.entries(w ?? {}).every(([k, v]) => {
      if (k === 'OR') return (v as Linha[]).some((x) => casa(r, x))
      if (k === 'AND') return (v as Linha[]).every((x) => casa(r, x))
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('in' in v) return v.in.includes(r[k])
        if ('notIn' in v) return !v.notIn.includes(r[k])
        if ('contains' in v) return String(r[k] ?? '').toLowerCase().includes(String(v.contains).toLowerCase())
        if ('not' in v) return r[k] !== v.not
        if ('gte' in v || 'lte' in v || 'lt' in v || 'gt' in v)
          return (
            (!('gte' in v) || r[k] >= v.gte) &&
            (!('lte' in v) || r[k] <= v.lte) &&
            (!('lt' in v) || r[k] < v.lt) &&
            (!('gt' in v) || r[k] > v.gt)
          )
      }
      return r[k] === v
    })

  const ordenar = (lista: Linha[], orderBy?: Linha | Linha[]) => {
    const regras = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).flatMap((o) => Object.entries(o))
    if (!regras.length) return lista
    return [...lista].sort((a, b) => {
      for (const [campo, dir] of regras) {
        if (typeof dir !== 'string') continue
        const x = a[campo], y = b[campo]
        if (x === y) continue
        const c = x > y ? 1 : -1
        return dir === 'desc' ? -c : c
      }
      return 0
    })
  }

  /**
   * Relações conhecidas: [modelo de destino, chave estrangeira, 'muitos' | 'um'].
   * 'muitos': destino[fk] === registro.id  ·  'um': registro[fk] === destino.id
   */
  const RELACOES: Record<string, Record<string, [string, string, 'muitos' | 'um']>> = {
    evento: { eventoPai: ['evento', 'eventoPaiId', 'um'] },
    ativo: { tipos: ['tipoManutencao', 'ativoId', 'muitos'], manutencoes: ['manutencao', 'ativoId', 'muitos'] },
    tipoManutencao: { manutencoes: ['manutencao', 'tipoId', 'muitos'], ativo: ['ativo', 'ativoId', 'um'] },
    manutencao: { tipo: ['tipoManutencao', 'tipoId', 'um'], ativo: ['ativo', 'ativoId', 'um'] },
    membro: { cargos: ['membroCargo', 'membroId', 'muitos'], categorias: ['membroCategoria', 'membroId', 'muitos'], conjuntos: ['membroConjunto', 'membroId', 'muitos'] },
    membroCargo: { cargo: ['cargo', 'cargoId', 'um'] },
    membroCategoria: { categoria: ['categoria', 'categoriaId', 'um'] },
    membroConjunto: { conjunto: ['conjuntoMusical', 'conjuntoId', 'um'] },
  }
  /** Apagar em cascata, como no banco: modelo → [filho, chave estrangeira] */
  const CASCATA: Record<string, [string, string][]> = {
    evento: [['evento', 'eventoPaiId']],
    ativo: [['tipoManutencao', 'ativoId'], ['manutencao', 'ativoId']],
    tipoManutencao: [['manutencao', 'tipoId'], ['notificacaoManutencao', 'tipoId']],
    membro: [['membroCargo', 'membroId'], ['membroCategoria', 'membroId'], ['membroConjunto', 'membroId']],
  }

  /** Aplica include/select (inclusive aninhados) a um registro */
  const moldar = (nome: string, r: Linha, opcoes: { include?: Linha; select?: Linha } = {}): Linha => {
    const { include, select } = opcoes
    if (!include && !select) return r
    const saida: Linha = select ? {} : { ...r }
    for (const [campo, valor] of Object.entries(select ?? include ?? {})) {
      if (!valor) continue
      const rel = RELACOES[nome]?.[campo]
      if (!rel) { if (select) saida[campo] = r[campo]; continue }
      const [destino, fk, tipo] = rel
      const sub: Linha = valor === true ? {} : valor
      const tabela = tabelas[destino] ?? []
      if (tipo === 'um') {
        const alvo = tabela.find((x) => x.id === r[fk])
        saida[campo] = alvo ? moldar(destino, alvo, sub) : null
      } else {
        const filhos = ordenar(tabela.filter((x) => x[fk] === r.id && casa(x, sub.where)), sub.orderBy).slice(0, sub.take ?? Infinity)
        saida[campo] = filhos.map((x) => moldar(destino, x, sub))
      }
    }
    return saida
  }
  const incluir = (nome: string, r: Linha, include?: Linha, select?: Linha) => moldar(nome, r, { include, select })

  const padroes = (nome: string): Linha => ({
    ...(nome === 'contribuicao' || nome === 'doacaoAlimento' ? { status: 'PENDENTE' } : {}),
    ...(nome === 'tokenRecuperacaoSenha' ? { usadoEm: null } : {}),
    ...(nome === 'evento' ? { eventoPaiId: null, regraRecorrencia: null } : {}),
  })

  const modelo = (nome: string) => {
    const t = (tabelas[nome] ??= [])
    const novo = (data: Linha): Linha => {
      // create aninhado: { tipos: { create: [...] } }
      const aninhados = Object.entries(data).filter(([k, v]) => RELACOES[nome]?.[k] && v && typeof v === 'object' && 'create' in v)
      const proprios = Object.fromEntries(Object.entries(data).filter(([k]) => !aninhados.some(([a]) => a === k)))
      const r: Linha = { id: randomUUID(), criadoEm: new Date(), ...padroes(nome), ...proprios }
      // Prisma.DbNull grava NULL de verdade numa coluna JSON
      for (const k of Object.keys(r)) if (r[k] === Prisma.DbNull) r[k] = null
      t.push(r)
      for (const [campo, v] of aninhados) {
        const [destino, fk] = RELACOES[nome][campo]
        for (const filho of ([] as Linha[]).concat(v.create)) modelo(destino).create({ data: { ...filho, [fk]: r.id } })
      }
      return r
    }
    const apagar = (r: Linha) => {
      for (const [filho, fk] of CASCATA[nome] ?? []) {
        const m = modelo(filho)
        for (const f of (tabelas[filho] ?? []).filter((x) => x[fk] === r.id)) m.delete({ where: { id: f.id } })
      }
      const i = t.indexOf(r)
      if (i >= 0) t.splice(i, 1)
    }
    return {
      create: async ({ data, include, select }: Linha) => incluir(nome, novo(data), include, select),
      createMany: async ({ data }: Linha) => { (data as Linha[]).forEach(novo); return { count: data.length } },
      findUnique: async ({ where, include, select }: Linha) => { const r = t.find((x) => casa(x, where)); return r ? incluir(nome, r, include, select) : null },
      findFirst: async ({ where, include, select, orderBy }: Linha = {}) => { const r = ordenar(t.filter((x) => casa(x, where)), orderBy)[0]; return r ? incluir(nome, r, include, select) : null },
      findUniqueOrThrow: async ({ where }: Linha) => { const r = t.find((x) => casa(x, where)); if (!r) throw new Error('Registro não encontrado'); return r },
      findMany: async ({ where, take, orderBy, include, select }: Linha = {}) =>
        ordenar(t.filter((r) => casa(r, where)), orderBy).slice(0, take ?? Infinity).map((r) => incluir(nome, r, include, select)),
      update: async ({ where, data }: Linha) => {
        const r = t.find((x) => casa(x, where))
        if (!r) throw new Error('Registro não encontrado')
        Object.assign(r, data)
        for (const k of Object.keys(data)) if (r[k] === Prisma.DbNull) r[k] = null
        return r
      },
      updateMany: async ({ where, data }: Linha) => { const alvo = t.filter((r) => casa(r, where)); alvo.forEach((r) => Object.assign(r, data)); return { count: alvo.length } },
      upsert: async ({ where, update, create }: Linha) => { const r = t.find((x) => casa(x, where)); return r ? Object.assign(r, update) : novo(create) },
      delete: async ({ where }: Linha) => { const r = t.find((x) => casa(x, where)); if (r) apagar(r); return r },
      deleteMany: async ({ where }: Linha = {}) => { const alvo = t.filter((r) => casa(r, where)); alvo.forEach(apagar); return { count: alvo.length } },
      count: async ({ where }: Linha = {}) => t.filter((r) => casa(r, where)).length,
      aggregate: async ({ where, _sum }: Linha) => ({
        _sum: Object.fromEntries(Object.keys(_sum).map((k) => [k, t.filter((r) => casa(r, where)).reduce((a, r) => a + Number(r[k] ?? 0), 0)])),
      }),
      groupBy: async ({ by, where, _sum }: Linha) => {
        const grupos = new Map<string, Linha>()
        for (const r of t.filter((x) => casa(x, where))) {
          const chave = by.map((b: string) => r[b]).join('|')
          const g = grupos.get(chave) ?? { ...Object.fromEntries(by.map((b: string) => [b, r[b]])), _sum: Object.fromEntries(Object.keys(_sum).map((k) => [k, 0])) }
          for (const k of Object.keys(_sum)) g._sum[k] += Number(r[k] ?? 0)
          grupos.set(chave, g)
        }
        return [...grupos.values()]
      },
    }
  }

  const prisma: any = new Proxy({}, {
    get: (_, nome: string) => {
      if (nome === '$transaction') return async (fn: any) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn))
      if (nome === '$queryRaw') return async () => [{ ok: 1 }]
      if (nome === '$disconnect' || nome === '$connect') return async () => {}
      if (nome === 'then') return undefined // não é uma Promise
      return modelo(nome)
    },
  })

  return {
    prisma,
    tabelas,
    /** Esvazia todas as tabelas (use em beforeEach). */
    limpar: () => { for (const k of Object.keys(tabelas)) delete tabelas[k] },
  }
}

export type BancoEmMemoria = ReturnType<typeof criarBancoEmMemoria>
