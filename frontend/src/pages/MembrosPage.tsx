import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CameraOff, Check, Download, Mail, Pencil, Phone, Plus, Search, Trash2, UserCheck, UserX, Users, X } from 'lucide-react'
import api from '@/services/api'
import type { Membro, Cargo, Categoria, ConjuntoMusical } from '@/types'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import MultiSelectFilter from '@/components/ui/MultiSelectFilter'
import Spinner from '@/components/ui/Spinner'
import MembroFormModal from '@/components/membros/MembroFormModal'
import { mascararTelefone } from '@/utils/mascaraTelefone'
import { formatarDiaMes } from '@/utils/data'
import OrdenacaoSelect from '@/components/ui/OrdenacaoSelect'
import { compararData, compararTexto, diasAteAniversario, ordenar, type OpcaoOrdenacao } from '@/utils/ordenacao'
import { baixarArquivo, gerarCsvMembros, listaEmails, listaTelefones } from '@/utils/exportarMembros'
import dayjs from 'dayjs'

type OrdemMembros = 'nome' | 'nome-desc' | 'aniversario' | 'recentes' | 'antigos'
const OPCOES_ORDEM_MEMBROS: OpcaoOrdenacao<OrdemMembros>[] = [
  { valor: 'nome', label: 'Nome (A–Z)' },
  { valor: 'nome-desc', label: 'Nome (Z–A)' },
  { valor: 'aniversario', label: 'Próximo aniversário' },
  { valor: 'recentes', label: 'Cadastrados recentemente' },
  { valor: 'antigos', label: 'Cadastrados há mais tempo' },
]

const CORES_AVATAR = [
  'bg-primary-100 text-primary-600',
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
]

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/)
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

function Avatar({ nome }: { nome: string }) {
  const cor = CORES_AVATAR[[...nome].reduce((a, c) => a + c.charCodeAt(0), 0) % CORES_AVATAR.length]
  return (
    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${cor}`} aria-hidden>
      {iniciais(nome)}
    </div>
  )
}

/** Mostra os 2 primeiros e resume o resto em "+N" (com a lista completa no title) */
function Etiquetas({ itens, variant, prefixo = '' }: { itens: string[]; variant: 'purple' | 'blue' | 'amber'; prefixo?: string }) {
  if (itens.length === 0) return null
  const visiveis = itens.slice(0, 2)
  const resto = itens.slice(2)
  return (
    <>
      {visiveis.map((n) => <Badge key={n} variant={variant}>{prefixo}{n}</Badge>)}
      {resto.length > 0 && <span title={resto.join(', ')}><Badge variant="gray">+{resto.length}</Badge></span>}
    </>
  )
}

/** Caixa de seleção com tamanho bom para o dedo no celular */
function Marcar({ marcado, parcial, onChange, rotulo }: { marcado: boolean; parcial?: boolean; onChange: () => void; rotulo: string }) {
  return (
    <input
      type="checkbox"
      checked={marcado}
      ref={(el) => { if (el) el.indeterminate = !!parcial && !marcado }}
      onChange={onChange}
      aria-label={rotulo}
      className="w-4 h-4 rounded border-gray-300 text-primary-600 accent-primary-600 cursor-pointer"
    />
  )
}

/** Número de destaque no topo da página (total, ativos, inativos) */
function Numero({ icone, valor, rotulo, cor }: { icone: React.ReactNode; valor: number; rotulo: string; cor: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${cor}`}>
      <span className="flex-shrink-0" aria-hidden>{icone}</span>
      <div>
        <p className="text-2xl font-bold leading-none tabular-nums">{valor}</p>
        <p className="text-xs font-medium mt-1 opacity-80">{rotulo}</p>
      </div>
    </div>
  )
}

function SemImagem() {
  return (
    <span title="Não quer ter a imagem gravada" className="inline-flex text-amber-600" aria-label="Não quer ter a imagem gravada">
      <CameraOff size={14} aria-hidden />
    </span>
  )
}

export default function MembrosPage() {
  const [membros, setMembros] = useState<Membro[]>([])
  const [cargos, setCargos] = useState<Cargo[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [conjuntos, setConjuntos] = useState<ConjuntoMusical[]>([])

  // Filtros
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<'' | 'ATIVO' | 'INATIVO'>('')
  const [cargoIds, setCargoIds] = useState<string[]>([])
  const [categoriaIds, setCategoriaIds] = useState<string[]>([])
  const [conjuntoIds, setConjuntoIds] = useState<string[]>([])
  const [ordem, setOrdem] = useState<OrdemMembros>('nome')

  const [primeiraCarga, setPrimeiraCarga] = useState(true)
  const [carregando, setCarregando] = useState(false)
  const [erroLista, setErroLista] = useState('')

  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Membro | null>(null)
  const [excluindo, setExcluindo] = useState<Membro | null>(null)
  const [removendo, setRemovendo] = useState(false)
  const [erroAcao, setErroAcao] = useState('')

  // Seleção para exportar (guarda o membro inteiro: continua valendo mesmo se um filtro o esconder)
  const [selecionados, setSelecionados] = useState<Map<string, Membro>>(new Map())
  const [copiado, setCopiado] = useState('')

  // Listas de apoio dos filtros e do formulário: uma vez só
  useEffect(() => {
    Promise.all([api.get('/cargos'), api.get('/membros/categorias'), api.get('/membros/conjuntos')])
      .then(([c, cat, conj]) => { setCargos(c.data); setCategorias(cat.data); setConjuntos(conj.data) })
      .catch(() => setErroLista('Não foi possível carregar os filtros.'))
  }, [])

  // A busca por texto espera a pessoa parar de digitar
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), 300)
    return () => clearTimeout(t)
  }, [busca])

  const reqId = useRef(0)
  const carregar = useCallback(async () => {
    const id = ++reqId.current
    setCarregando(true)
    setErroLista('')
    const params: Record<string, string> = {}
    if (buscaAplicada) params.busca = buscaAplicada
    if (statusFiltro) params.status = statusFiltro
    if (cargoIds.length) params.cargoIds = cargoIds.join(',')
    if (categoriaIds.length) params.categoriaIds = categoriaIds.join(',')
    if (conjuntoIds.length) params.conjuntoIds = conjuntoIds.join(',')
    try {
      const r = await api.get('/membros', { params })
      if (id === reqId.current) setMembros(r.data)
    } catch {
      if (id === reqId.current) setErroLista('Não foi possível carregar os membros. Tente novamente.')
    } finally {
      if (id === reqId.current) { setCarregando(false); setPrimeiraCarga(false) }
    }
  }, [buscaAplicada, statusFiltro, cargoIds, categoriaIds, conjuntoIds])

  useEffect(() => { carregar() }, [carregar])

  const nomeDe = {
    cargo: (id: string) => cargos.find((c) => c.id === id)?.nome ?? '',
    categoria: (id: string) => categorias.find((c) => c.id === id)?.nome ?? '',
    conjunto: (id: string) => conjuntos.find((c) => c.id === id)?.nome ?? '',
  }
  const chips = [
    ...cargoIds.map((id) => ({ chave: `cargo-${id}`, texto: nomeDe.cargo(id), remover: () => setCargoIds((l) => l.filter((x) => x !== id)) })),
    ...categoriaIds.map((id) => ({ chave: `cat-${id}`, texto: nomeDe.categoria(id), remover: () => setCategoriaIds((l) => l.filter((x) => x !== id)) })),
    ...conjuntoIds.map((id) => ({ chave: `conj-${id}`, texto: nomeDe.conjunto(id), remover: () => setConjuntoIds((l) => l.filter((x) => x !== id)) })),
  ]
  const filtrando = !!(busca || statusFiltro || chips.length)

  function limparFiltros() {
    setBusca(''); setBuscaAplicada(''); setStatusFiltro('')
    setCargoIds([]); setCategoriaIds([]); setConjuntoIds([])
  }

  function abrirNovo() { setEditing(null); setModal(true) }
  function abrirEdicao(m: Membro) { setEditing(m); setModal(true) }

  async function confirmarExclusao() {
    if (!excluindo) return
    setRemovendo(true)
    setErroAcao('')
    try {
      await api.delete(`/membros/${excluindo.id}`)
      setExcluindo(null)
      await carregar()
    } catch {
      setErroAcao('Não foi possível remover o membro.')
      setExcluindo(null)
    } finally {
      setRemovendo(false)
    }
  }

  const ativos = membros.filter((m) => m.status === 'ATIVO').length

  // ── Seleção e exportação
  const todosVisiveisMarcados = membros.length > 0 && membros.every((m) => selecionados.has(m.id))
  const algumVisivelMarcado = membros.some((m) => selecionados.has(m.id))
  function alternarSelecao(m: Membro) {
    setSelecionados((atual) => {
      const novo = new Map(atual)
      if (novo.has(m.id)) novo.delete(m.id)
      else novo.set(m.id, m)
      return novo
    })
  }
  function alternarTodos() {
    setSelecionados((atual) => {
      const novo = new Map(atual)
      if (todosVisiveisMarcados) membros.forEach((m) => novo.delete(m.id))
      else membros.forEach((m) => novo.set(m.id, m))
      return novo
    })
  }
  async function copiar(texto: string, aviso: string) {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(aviso)
      setTimeout(() => setCopiado(''), 2500)
    } catch {
      setErroAcao('Não foi possível copiar. Tente pelo botão "Baixar planilha".')
    }
  }
  const ordenados = useMemo(() => {
    switch (ordem) {
      case 'nome-desc': return ordenar(membros, (a, b) => compararTexto(b.nomeCompleto, a.nomeCompleto))
      case 'aniversario': return ordenar(membros, (a, b) => diasAteAniversario(a.dataNascimento) - diasAteAniversario(b.dataNascimento) || compararTexto(a.nomeCompleto, b.nomeCompleto))
      case 'recentes': return ordenar(membros, (a, b) => compararData(b.criadoEm, a.criadoEm))
      case 'antigos': return ordenar(membros, (a, b) => compararData(a.criadoEm, b.criadoEm))
      default: return ordenar(membros, (a, b) => compararTexto(a.nomeCompleto, b.nomeCompleto))
    }
  }, [membros, ordem])

  /** O que vai ser exportado: os marcados, ou (sem nenhum marcado) a lista que está na tela, na ordem da tela */
  const alvoExportacao = selecionados.size > 0
    ? ordenados.filter((m) => selecionados.has(m.id)).concat([...selecionados.values()].filter((m) => !membros.some((x) => x.id === m.id)))
    : ordenados
  const semTelefone = alvoExportacao.filter((m) => !m.telefone).length
  function exportarPlanilha() {
    baixarArquivo(gerarCsvMembros(alvoExportacao), `membros-${dayjs().format('YYYY-MM-DD')}.csv`)
  }
  const Acoes = ({ m }: { m: Membro }) => (
    <div className="flex gap-1 justify-end">
      <button
        type="button" onClick={() => abrirEdicao(m)} title="Editar" aria-label={`Editar ${m.nomeCompleto}`}
        className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
      ><Pencil size={16} /></button>
      <button
        type="button" onClick={() => setExcluindo(m)} title="Remover" aria-label={`Remover ${m.nomeCompleto}`}
        className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
      ><Trash2 size={16} /></button>
    </div>
  )

  return (
    <div className="p-4 sm:p-6 2xl:px-10">
      <PageHeader
        title="Membros"
        subtitle={primeiraCarga ? 'Carregando…' : 'Marque membros para baixar a planilha ou copiar os contatos'}
        actions={<Button onClick={abrirNovo}><Plus size={16} aria-hidden /> Novo membro</Button>}
      />

      {/* Contagem */}
      {!primeiraCarga && (
        <div className="grid grid-cols-3 gap-3 mb-4" aria-live="polite">
          <Numero icone={<Users size={22} />} valor={membros.length} rotulo={filtrando ? 'Encontrados' : 'Total de membros'} cor="bg-primary-50 border-primary-100 text-primary-700" />
          <Numero icone={<UserCheck size={22} />} valor={ativos} rotulo="Ativos" cor="bg-green-50 border-green-100 text-green-700" />
          <Numero icone={<UserX size={22} />} valor={membros.length - ativos} rotulo="Inativos" cor="bg-gray-50 border-gray-200 text-gray-600" />
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, e-mail ou telefone"
              aria-label="Buscar membros"
              className="h-9 w-full rounded-lg border border-gray-300 pl-9 pr-3 text-sm outline-none focus:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-200"
            />
          </div>

          <div role="group" aria-label="Situação" className="inline-flex rounded-lg border border-gray-300 p-0.5 bg-gray-50">
            {([['', 'Todos'], ['ATIVO', 'Ativos'], ['INATIVO', 'Inativos']] as const).map(([valor, texto]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={statusFiltro === valor}
                onClick={() => setStatusFiltro(valor)}
                className={`px-3 h-8 rounded-md text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
                  statusFiltro === valor ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {texto}
              </button>
            ))}
          </div>

          <MultiSelectFilter label="Cargos" options={cargos.map((c) => ({ id: c.id, label: c.nome }))} selected={cargoIds} onChange={setCargoIds} />
          <MultiSelectFilter label="Categorias" options={categorias.map((c) => ({ id: c.id, label: c.nome, grupo: c.grupo }))} selected={categoriaIds} onChange={setCategoriaIds} />
          <MultiSelectFilter label="Conjuntos" options={conjuntos.map((c) => ({ id: c.id, label: c.nome }))} selected={conjuntoIds} onChange={setConjuntoIds} />
          <OrdenacaoSelect value={ordem} onChange={setOrdem} opcoes={OPCOES_ORDEM_MEMBROS} className="ml-auto" />
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-gray-500">Filtros aplicados:</span>
            {chips.map((c) => (
              <span key={c.chave} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-primary-50 text-primary-600 text-xs font-medium">
                {c.texto}
                <button type="button" onClick={c.remover} aria-label={`Remover filtro ${c.texto}`} className="p-0.5 rounded-full hover:bg-primary-100">
                  <X size={12} />
                </button>
              </span>
            ))}
            <button type="button" onClick={limparFiltros} className="text-xs font-medium text-gray-500 hover:text-gray-800 underline ml-1">
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {/* Seleção e exportação */}
      {!primeiraCarga && membros.length > 0 && (
        <div className={`sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 ${selecionados.size > 0 ? 'bg-primary-600 border-primary-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-700'}`}>
          <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer mr-1">
            <Marcar marcado={todosVisiveisMarcados} parcial={algumVisivelMarcado} onChange={alternarTodos} rotulo={todosVisiveisMarcados ? 'Desmarcar todos' : 'Marcar todos da lista'} />
            {selecionados.size > 0
              ? `${selecionados.size} selecionado${selecionados.size !== 1 ? 's' : ''}`
              : `Marcar todos (${membros.length})`}
          </label>
          <span className={`text-xs ${selecionados.size > 0 ? 'text-primary-100' : 'text-gray-400'}`}>
            {selecionados.size > 0 ? 'As ações valem para os selecionados' : 'Sem seleção, as ações valem para a lista da tela'}
          </span>
          <div className="flex flex-wrap gap-1.5 ml-auto">
            {([
              { texto: 'Baixar planilha', Icone: Download, acao: exportarPlanilha },
              { texto: 'Copiar telefones', Icone: Phone, acao: () => copiar(listaTelefones(alvoExportacao), 'Telefones copiados') },
              { texto: 'Copiar e-mails', Icone: Mail, acao: () => copiar(listaEmails(alvoExportacao), 'E-mails copiados') },
            ] as const).map(({ texto, Icone, acao }) => (
              <button
                key={texto}
                type="button"
                onClick={acao}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                  selecionados.size > 0 ? 'bg-white/15 hover:bg-white/25 focus-visible:ring-white' : 'border border-gray-300 hover:bg-gray-50 focus-visible:ring-primary-300'
                }`}
              >
                <Icone size={14} aria-hidden /> {texto}
              </button>
            ))}
            {selecionados.size > 0 && (
              <button type="button" onClick={() => setSelecionados(new Map())} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-sm hover:bg-white/15">
                <X size={14} aria-hidden /> Limpar
              </button>
            )}
          </div>
          {copiado && (
            <p role="status" className={`w-full text-xs inline-flex items-center gap-1 ${selecionados.size > 0 ? 'text-white' : 'text-green-700'}`}>
              <Check size={13} aria-hidden /> {copiado}{semTelefone > 0 && copiado.startsWith('Telefones') ? ` (${semTelefone} sem telefone cadastrado)` : ''}
            </p>
          )}
        </div>
      )}

      {erroLista && <p role="alert" className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erroLista}</p>}
      {erroAcao && <p role="alert" className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erroAcao}</p>}

      {primeiraCarga ? (
        <Spinner />
      ) : membros.length === 0 && !erroLista ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 py-14 px-4 text-center">
          <p className="font-medium text-gray-900">{filtrando ? 'Nenhum membro com esses filtros' : 'Nenhum membro cadastrado ainda'}</p>
          <p className="text-sm text-gray-500 mt-1">
            {filtrando ? 'Tente tirar algum filtro ou buscar por outro nome.' : 'Cadastre o primeiro membro para começar.'}
          </p>
          <div className="mt-4">
            {filtrando
              ? <Button variant="secondary" onClick={limparFiltros}>Limpar filtros</Button>
              : <Button onClick={abrirNovo}><Plus size={16} aria-hidden /> Novo membro</Button>}
          </div>
        </div>
      ) : (
        <div className={`transition-opacity ${carregando ? 'opacity-60' : ''}`} aria-busy={carregando}>
          {/* Desktop: tabela */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-10 pl-4 py-3"><span className="sr-only">Selecionar</span></th>
                  {['Membro', 'Cargos', 'Categorias e conjuntos', 'Aniversário', 'Situação'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
                  ))}
                  <th className="px-4 py-3"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ordenados.map((m) => (
                  <tr key={m.id} className={`align-middle ${selecionados.has(m.id) ? 'bg-primary-50/70' : 'hover:bg-gray-50/70'}`}>
                    <td className="pl-4 py-3"><Marcar marcado={selecionados.has(m.id)} onChange={() => alternarSelecao(m)} rotulo={`Selecionar ${m.nomeCompleto}`} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar nome={m.nomeCompleto} />
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 flex items-center gap-1.5">
                            <span className="truncate">{m.nomeCompleto}</span>
                            {m.naoQuerImagemGravada && <SemImagem />}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{m.telefone ? mascararTelefone(m.telefone) : m.email ?? 'Sem contato'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Etiquetas itens={m.cargos.map((c) => c.cargo.nome)} variant="purple" />
                        {m.cargos.length === 0 && <span className="text-gray-300">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Etiquetas itens={m.categorias.map((c) => c.categoria.nome)} variant="blue" />
                        <Etiquetas itens={m.conjuntos.map((c) => c.conjunto.nome)} variant="amber" prefixo="♪ " />
                        {m.categorias.length + m.conjuntos.length === 0 && <span className="text-gray-300">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatarDiaMes(m.dataNascimento)}</td>
                    <td className="px-4 py-3"><Badge variant={m.status === 'ATIVO' ? 'green' : 'gray'}>{m.status === 'ATIVO' ? 'Ativo' : 'Inativo'}</Badge></td>
                    <td className="px-2 py-3"><Acoes m={m} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular: cartões */}
          <ul className="md:hidden space-y-2.5">
            {ordenados.map((m) => (
              <li key={m.id} className={`rounded-xl border p-3.5 ${selecionados.has(m.id) ? 'bg-primary-50 border-primary-200' : 'bg-white border-gray-200'}`}>
                <div className="flex items-start gap-3">
                  <span className="pt-3"><Marcar marcado={selecionados.has(m.id)} onChange={() => alternarSelecao(m)} rotulo={`Selecionar ${m.nomeCompleto}`} /></span>
                  <Avatar nome={m.nomeCompleto} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 flex items-center gap-1.5">
                      <span className="truncate">{m.nomeCompleto}</span>
                      {m.naoQuerImagemGravada && <SemImagem />}
                    </p>
                    <p className="text-xs text-gray-500">
                      {m.telefone ? mascararTelefone(m.telefone) : m.email ?? 'Sem contato'}
                      {m.dataNascimento && ` · Aniversário ${formatarDiaMes(m.dataNascimento)}`}
                    </p>
                  </div>
                  <Badge variant={m.status === 'ATIVO' ? 'green' : 'gray'}>{m.status === 'ATIVO' ? 'Ativo' : 'Inativo'}</Badge>
                </div>
                {(m.cargos.length + m.categorias.length + m.conjuntos.length > 0) && (
                  <div className="flex flex-wrap gap-1 mt-2.5">
                    <Etiquetas itens={m.cargos.map((c) => c.cargo.nome)} variant="purple" />
                    <Etiquetas itens={m.categorias.map((c) => c.categoria.nome)} variant="blue" />
                    <Etiquetas itens={m.conjuntos.map((c) => c.conjunto.nome)} variant="amber" prefixo="♪ " />
                  </div>
                )}
                <div className="mt-1 -mb-1"><Acoes m={m} /></div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <MembroFormModal
        open={modal}
        editing={editing}
        cargos={cargos}
        categorias={categorias}
        conjuntos={conjuntos}
        onClose={() => setModal(false)}
        onSaved={() => { setModal(false); carregar() }}
      />

      <ConfirmDialog
        open={!!excluindo}
        title="Remover membro"
        confirmLabel="Remover"
        loading={removendo}
        onConfirm={confirmarExclusao}
        onCancel={() => setExcluindo(null)}
      >
        <p>Remover <strong>{excluindo?.nomeCompleto}</strong> do cadastro?</p>
        <p className="text-xs text-gray-500">Essa ação não pode ser desfeita. Se a pessoa só saiu da igreja, prefira marcar como inativo.</p>
      </ConfirmDialog>
    </div>
  )
}
