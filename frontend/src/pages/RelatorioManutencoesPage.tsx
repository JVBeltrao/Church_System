import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '@/services/api'
import type { Ativo, AtivoRelatorio, Manutencao } from '@/types'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Spinner from '@/components/ui/Spinner'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { formatarData, paraInputData } from '@/utils/data'
import OrdenacaoSelect from '@/components/ui/OrdenacaoSelect'
import { URGENCIA, compararData, compararTexto, ordenar, type OpcaoOrdenacao } from '@/utils/ordenacao'

import { SITUACAO, periodicidadePorExtenso } from '@/utils/situacaoManutencao'

type OrdemAtivos = 'nome' | 'urgencia' | 'ultima' | 'quantidade'
const OPCOES_ATIVOS: OpcaoOrdenacao<OrdemAtivos>[] = [
  { valor: 'nome', label: 'Nome (A–Z)' },
  { valor: 'urgencia', label: 'Mais urgentes primeiro' },
  { valor: 'ultima', label: 'Última manutenção (recente)' },
  { valor: 'quantidade', label: 'Mais manutenções' },
]
type OrdemManut = 'recentes' | 'antigas' | 'responsavel'
const OPCOES_MANUT: OpcaoOrdenacao<OrdemManut>[] = [
  { valor: 'recentes', label: 'Mais recentes primeiro' },
  { valor: 'antigas', label: 'Mais antigas primeiro' },
  { valor: 'responsavel', label: 'Responsável (A–Z)' },
]

interface Alvo {
  manutencao: Manutencao
  ativoNome: string
  tipos: { id: string; nome: string }[]
}

export default function RelatorioManutencoesPage() {
  const [ativos, setAtivos] = useState<AtivoRelatorio[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const [filtroAtivo, setFiltroAtivo] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [ordemAtivos, setOrdemAtivos] = useState<OrdemAtivos>('nome')
  const [ordemManut, setOrdemManut] = useState<OrdemManut>('recentes')

  const [editando, setEditando] = useState<Alvo | null>(null)
  const [form, setForm] = useState({ data: '', descricao: '', responsavel: '', tipoId: '' })
  const [excluindo, setExcluindo] = useState<Alvo | null>(null)
  const [saving, setSaving] = useState(false)

  // Lista completa de ativos para o filtro (não some quando o filtro está aplicado)
  const [todosAtivos, setTodosAtivos] = useState<Ativo[]>([])
  const tiposDoFiltro = todosAtivos.find((a) => a.id === filtroAtivo)?.tipos ?? []

  const load = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const r = await api.get('/manutencoes/relatorio', {
        params: { ativoId: filtroAtivo || undefined, tipoId: filtroTipo || undefined, de: de || undefined, ate: ate || undefined },
      })
      setAtivos(r.data)
    } catch {
      setErro('Não foi possível carregar o histórico.')
    } finally {
      setLoading(false)
    }
  }, [filtroAtivo, filtroTipo, de, ate])

  useEffect(() => { load() }, [load])

  // Lista de ativos do filtro: carregada uma vez, independente dos filtros aplicados
  useEffect(() => {
    api.get('/ativos').then((r) => setTodosAtivos(r.data)).catch(() => {})
  }, [])

  const totalRegistros = ativos.reduce((acc, a) => acc + a.manutencoes.length, 0)

  const ordenados = useMemo(() => {
    const cmpManut = (x: Manutencao, y: Manutencao) =>
      ordemManut === 'antigas' ? compararData(x.data, y.data)
      : ordemManut === 'responsavel' ? compararTexto(x.responsavel, y.responsavel) || compararData(y.data, x.data)
      : compararData(y.data, x.data)
    const comManut = ativos.map((a) => ({ ...a, manutencoes: ordenar(a.manutencoes, cmpManut) }))
    switch (ordemAtivos) {
      case 'urgencia': return ordenar(comManut, (a, b) => (URGENCIA[a.status] ?? 9) - (URGENCIA[b.status] ?? 9) || compararTexto(a.nome, b.nome))
      case 'ultima': return ordenar(comManut, (a, b) => compararData(b.ultimaManutencao, a.ultimaManutencao) || compararTexto(a.nome, b.nome))
      case 'quantidade': return ordenar(comManut, (a, b) => b.manutencoes.length - a.manutencoes.length || compararTexto(a.nome, b.nome))
      default: return ordenar(comManut, (a, b) => compararTexto(a.nome, b.nome))
    }
  }, [ativos, ordemAtivos, ordemManut])

  function abrirEdicao(alvo: Alvo) {
    setForm({
      data: paraInputData(alvo.manutencao.data),
      descricao: alvo.manutencao.descricao,
      responsavel: alvo.manutencao.responsavel,
      tipoId: alvo.manutencao.tipoId ?? alvo.manutencao.tipo?.id ?? '',
    })
    setEditando(alvo)
    setErro('')
  }

  async function salvarEdicao() {
    if (!editando) return
    if (!form.data || form.descricao.trim().length < 2 || form.responsavel.trim().length < 2) {
      setErro('Preencha data, responsável e descrição.')
      return
    }
    setSaving(true)
    setErro('')
    try {
      await api.put(`/manutencoes/${editando.manutencao.id}`, { ...form, tipoId: form.tipoId || undefined })
      setEditando(null)
      await load()
    } catch {
      setErro('Não foi possível salvar a manutenção.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return
    setSaving(true)
    setErro('')
    try {
      await api.delete(`/manutencoes/${excluindo.manutencao.id}`)
      setExcluindo(null)
      await load()
    } catch {
      setErro('Não foi possível excluir a manutenção.')
      setExcluindo(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 2xl:px-10">
      <PageHeader
        title="Histórico de manutenções"
        subtitle="Todas as manutenções realizadas, agrupadas por ativo"
        actions={<Link to="/manutencao"><Button variant="secondary">← Voltar aos ativos</Button></Link>}
      />

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
        <Select label="Ativo" value={filtroAtivo} onChange={(e) => { setFiltroAtivo(e.target.value); setFiltroTipo('') }}>
          <option value="">Todos os ativos</option>
          {todosAtivos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </Select>
        <Select label="Tipo de manutenção" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} disabled={!filtroAtivo}>
          <option value="">{filtroAtivo ? 'Todos os tipos' : 'Escolha um ativo'}</option>
          {tiposDoFiltro.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </Select>
        <Input label="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        <Input label="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        <Button
          variant="ghost"
          onClick={() => { setFiltroAtivo(''); setFiltroTipo(''); setDe(''); setAte('') }}
          disabled={!filtroAtivo && !de && !ate}
        >
          Limpar filtros
        </Button>
        <div className="sm:col-span-5 flex flex-wrap gap-4 pt-1 border-t border-gray-100">
          <OrdenacaoSelect rotulo="Ordenar ativos" value={ordemAtivos} onChange={setOrdemAtivos} opcoes={OPCOES_ATIVOS} />
          <OrdenacaoSelect rotulo="Manutenções" value={ordemManut} onChange={setOrdemManut} opcoes={OPCOES_MANUT} />
        </div>
      </div>

      {erro && <p className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

      {loading ? <Spinner /> : ativos.length === 0 ? (
        <EmptyState message="Nenhum ativo encontrado" icon="🔧" />
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-3">
            {ativos.length} {ativos.length === 1 ? 'ativo' : 'ativos'} · {totalRegistros} {totalRegistros === 1 ? 'manutenção' : 'manutenções'}
          </p>
          <div className="space-y-4">
            {ordenados.map((a) => (
              <section key={a.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <header className={`px-4 py-3 border-b border-l-4 ${SITUACAO[a.status].faixa} ${SITUACAO[a.status].bloco}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold text-gray-900">{a.nome}</h2>
                    <Badge variant={SITUACAO[a.status].badge}>{SITUACAO[a.status].rotulo}</Badge>
                  </div>
                  <ul className="flex flex-wrap gap-1.5 mt-2">
                    {a.tipos.map((t) => (
                      <li key={t.id} className="inline-flex items-center gap-1.5 rounded-full bg-white/80 border border-white px-2.5 py-0.5 text-xs text-gray-700">
                        <span className={`w-2 h-2 rounded-full ${SITUACAO[t.status].ponto}`} aria-hidden />
                        <strong className="font-medium">{t.nome}</strong>
                        <span className="text-gray-500">{periodicidadePorExtenso(t.periodicidadeDias)} · próxima {formatarData(t.proximaManutencao)}</span>
                        <span className="sr-only">({SITUACAO[t.status].rotulo})</span>
                      </li>
                    ))}
                  </ul>
                </header>

                {a.manutencoes.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-gray-400 text-center">Nenhuma manutenção no período.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-100">
                      <tr>{['Data', 'Tipo', 'Serviço realizado', 'Responsável', ''].map((h) => (
                        <th key={h} className="text-left px-4 py-2 text-xs font-medium text-gray-500">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {a.manutencoes.map((m) => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatarData(m.data)}</td>
                          <td className="px-4 py-3"><span className="inline-block rounded-full bg-primary-50 text-primary-700 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">{m.tipo?.nome ?? '—'}</span></td>
                          <td className="px-4 py-3 text-gray-900">{m.descricao}</td>
                          <td className="px-4 py-3 text-gray-600">{m.responsavel}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="sm" onClick={() => abrirEdicao({ manutencao: m, ativoNome: a.nome, tipos: a.tipos })}>Editar</Button>
                              <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50" onClick={() => setExcluindo({ manutencao: m, ativoNome: a.nome, tipos: a.tipos })}>Excluir</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            ))}
          </div>
        </>
      )}

      <Modal open={!!editando} onClose={() => setEditando(null)} title={`Editar manutenção — ${editando?.ativoNome ?? ''}`}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data *" type="date" value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />
            <Input label="Responsável *" value={form.responsavel} onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))} />
          </div>
          <Select label="Tipo de manutenção *" value={form.tipoId} onChange={(e) => setForm((f) => ({ ...f, tipoId: e.target.value }))}>
            {editando?.tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </Select>
          <Input label="Descrição do serviço *" value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
          {erro && editando && <p className="text-sm text-red-600">{erro}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvarEdicao} loading={saving}>Salvar</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!excluindo}
        title="Excluir manutenção"
        confirmLabel="Excluir"
        loading={saving}
        onConfirm={confirmarExclusao}
        onCancel={() => setExcluindo(null)}
      >
        <p>
          Excluir a manutenção de <strong>{excluindo?.ativoNome}</strong> realizada em{' '}
          <strong>{excluindo ? formatarData(excluindo.manutencao.data) : ''}</strong>?
        </p>
        <p className="text-xs text-gray-500">
          “{excluindo?.manutencao.descricao}”. A próxima data desse tipo de manutenção será recalculada.
        </p>
      </ConfirmDialog>
    </div>
  )
}
