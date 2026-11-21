import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, History, Pencil, Plus, Search, Trash2, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '@/services/api'
import type { Ativo, StatusManutencao } from '@/types'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import OrdenacaoSelect from '@/components/ui/OrdenacaoSelect'
import AtivoFormModal from '@/components/manutencao/AtivoFormModal'
import RegistrarManutencaoModal from '@/components/manutencao/RegistrarManutencaoModal'
import { formatarData } from '@/utils/data'
import { URGENCIA, compararData, compararTexto, ordenar, type OpcaoOrdenacao } from '@/utils/ordenacao'
import { SITUACAO, periodicidadePorExtenso, prazoPorExtenso } from '@/utils/situacaoManutencao'

type Ordem = 'urgencia' | 'proxima' | 'ultima' | 'nome'
const OPCOES_ORDEM: OpcaoOrdenacao<Ordem>[] = [
  { valor: 'urgencia', label: 'Mais urgentes primeiro' },
  { valor: 'proxima', label: 'Próxima manutenção' },
  { valor: 'ultima', label: 'Última manutenção (recente)' },
  { valor: 'nome', label: 'Nome (A–Z)' },
]

const ICONE: Record<StatusManutencao, typeof AlertTriangle> = {
  VENCIDO: AlertTriangle,
  SEM_REGISTRO: CircleDashed,
  PROXIMO: Clock,
  EM_DIA: CheckCircle2,
}
const ORDEM_STATUS: StatusManutencao[] = ['VENCIDO', 'SEM_REGISTRO', 'PROXIMO', 'EM_DIA']

export default function ManutencaoPage() {
  const [ativos, setAtivos] = useState<Ativo[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [formAberto, setFormAberto] = useState(false)
  const [editando, setEditando] = useState<Ativo | null>(null)
  const [registrando, setRegistrando] = useState<Ativo | null>(null)
  const [removendo, setRemovendo] = useState<Ativo | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<StatusManutencao | ''>('')
  const [ordem, setOrdem] = useState<Ordem>('urgencia')

  async function load() {
    setErro('')
    try {
      const r = await api.get('/ativos')
      setAtivos(r.data)
    } catch {
      setErro('Não foi possível carregar os ativos.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  async function confirmarRemocao() {
    if (!removendo) return
    setOcupado(true)
    try {
      await api.delete(`/ativos/${removendo.id}`)
      setRemovendo(null)
      load()
    } catch {
      setErro('Não foi possível remover o ativo.')
      setRemovendo(null)
    } finally {
      setOcupado(false)
    }
  }

  // Contagem por tipo de manutenção (um ativo pode ter uma vencida e outra em dia)
  const contagem = useMemo(() => {
    const c: Record<StatusManutencao, number> = { VENCIDO: 0, SEM_REGISTRO: 0, PROXIMO: 0, EM_DIA: 0 }
    ativos.forEach((a) => a.tipos.forEach((t) => c[t.status]++))
    return c
  }, [ativos])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const lista = ativos.filter(
      (a) =>
        (!filtroStatus || a.tipos.some((t) => t.status === filtroStatus)) &&
        (!q || a.nome.toLowerCase().includes(q) || (a.descricao ?? '').toLowerCase().includes(q) || a.tipos.some((t) => t.nome.toLowerCase().includes(q)))
    )
    switch (ordem) {
      case 'nome': return ordenar(lista, (a, b) => compararTexto(a.nome, b.nome))
      case 'proxima': return ordenar(lista, (a, b) => compararData(a.proximaManutencao, b.proximaManutencao) || compararTexto(a.nome, b.nome))
      case 'ultima': return ordenar(lista, (a, b) => compararData(b.ultimaManutencao, a.ultimaManutencao) || compararTexto(a.nome, b.nome))
      default: return ordenar(lista, (a, b) => (URGENCIA[a.status] ?? 9) - (URGENCIA[b.status] ?? 9) || compararData(a.proximaManutencao, b.proximaManutencao) || compararTexto(a.nome, b.nome))
    }
  }, [ativos, busca, filtroStatus, ordem])

  return (
    <div className="p-4 sm:p-6 2xl:px-10">
      <PageHeader
        title="Manutenção"
        subtitle="Ativos da igreja e os prazos de cada serviço"
        actions={<>
          <Link to="/manutencao/relatorio"><Button variant="secondary"><History size={15} aria-hidden /> Histórico de manutenções</Button></Link>
          <Button onClick={() => { setEditando(null); setFormAberto(true) }}><Plus size={16} aria-hidden /> Novo ativo</Button>
        </>}
      />

      {erro && <p role="alert" className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

      {/* Contadores coloridos: também servem de filtro */}
      {!loading && ativos.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {ORDEM_STATUS.map((st) => {
            const s = SITUACAO[st]
            const Icone = ICONE[st]
            const ativo = filtroStatus === st
            return (
              <button
                key={st}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFiltroStatus(ativo ? '' : st)}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${s.bloco} ${ativo ? 'ring-2 ring-offset-1 ring-current' : ''} ${contagem[st] === 0 ? 'opacity-60' : ''}`}
              >
                <Icone size={22} aria-hidden />
                <span>
                  <span className="block text-2xl font-bold leading-none tabular-nums">{contagem[st]}</span>
                  <span className="block text-xs font-medium mt-1">{s.plural}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {!loading && ativos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar ativo ou serviço"
              aria-label="Buscar ativo ou serviço"
              className="w-full h-9 rounded-lg border border-gray-300 pl-9 pr-3 text-sm outline-none focus:border-primary-500"
            />
          </div>
          {filtroStatus && (
            <button type="button" onClick={() => setFiltroStatus('')} className="text-xs font-medium text-gray-500 underline hover:text-gray-800">
              Mostrar todas as situações
            </button>
          )}
          <OrdenacaoSelect value={ordem} onChange={setOrdem} opcoes={OPCOES_ORDEM} />
        </div>
      )}

      {loading ? <Spinner /> : ativos.length === 0 ? (
        <EmptyState message="Nenhum ativo cadastrado" icon="🔧" />
      ) : visiveis.length === 0 ? (
        <EmptyState message="Nenhum ativo corresponde aos filtros" icon="🔍" />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {visiveis.map((a) => {
            const s = SITUACAO[a.status]
            return (
              <article key={a.id} className={`flex flex-col bg-white rounded-xl border border-gray-200 border-l-4 ${s.faixa} overflow-hidden`}>
                <header className="flex flex-wrap items-start gap-3 px-4 pt-4 pb-3">
                  <span className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${s.bloco}`} aria-hidden><Wrench size={18} /></span>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-gray-900">{a.nome}</h2>
                    {a.descricao && <p className="text-xs text-gray-500">{a.descricao}</p>}
                  </div>
                  <Badge variant={s.badge}>{s.rotulo}</Badge>
                </header>

                <ul className="flex-1 divide-y divide-gray-100 border-t border-gray-100">
                  {a.tipos.map((t) => {
                    const st = SITUACAO[t.status]
                    const Icone = ICONE[t.status]
                    return (
                      <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                        <Icone size={16} className={st.texto} aria-label={st.rotulo} />
                        <div className="flex-1 min-w-[150px]">
                          <p className="text-sm font-medium text-gray-900">{t.nome}</p>
                          <p className="text-xs text-gray-500">
                            {periodicidadePorExtenso(t.periodicidadeDias)}
                            {t.ultimaManutencao && ` · última em ${formatarData(t.ultimaManutencao)}`}
                          </p>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-1 rounded-md ${st.bloco}`}>
                          {t.status === 'SEM_REGISTRO' ? 'Nunca registrada' : `${prazoPorExtenso(t.proximaManutencao)} · ${formatarData(t.proximaManutencao)}`}
                        </span>
                      </li>
                    )
                  })}
                </ul>

                <footer className="flex flex-wrap items-center gap-1 px-3 py-2 bg-gray-50 border-t border-gray-100">
                  <Button size="sm" variant="success" onClick={() => setRegistrando(a)}><Plus size={14} aria-hidden /> Registrar manutenção</Button>
                  <span className="flex-1" />
                  <Button variant="ghost" size="sm" onClick={() => { setEditando(a); setFormAberto(true) }} aria-label={`Editar ${a.nome}`}><Pencil size={14} aria-hidden /> Editar</Button>
                  <Button variant="ghost" size="sm" onClick={() => setRemovendo(a)} className="text-red-600 hover:bg-red-50" aria-label={`Remover ${a.nome}`}><Trash2 size={14} aria-hidden /> Remover</Button>
                </footer>
              </article>
            )
          })}
        </div>
      )}

      <AtivoFormModal open={formAberto} editando={editando} onClose={() => setFormAberto(false)} onSaved={() => { setFormAberto(false); load() }} />
      <RegistrarManutencaoModal ativo={registrando} onClose={() => setRegistrando(null)} onSaved={() => { setRegistrando(null); load() }} />

      <ConfirmDialog
        open={!!removendo}
        title="Remover ativo"
        confirmLabel="Remover"
        loading={ocupado}
        onConfirm={confirmarRemocao}
        onCancel={() => setRemovendo(null)}
      >
        <p>Remover <strong>{removendo?.nome}</strong>?</p>
        <p className="text-xs text-gray-500">Todos os tipos de manutenção e o histórico deste ativo serão apagados.</p>
      </ConfirmDialog>
    </div>
  )
}
