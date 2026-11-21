import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CalendarDays, Cake, CheckCircle2, CircleDashed, Clock, Gift, HeartHandshake, Users, Wrench } from 'lucide-react'
import api from '@/services/api'
import type { DashboardData, Evento, Membro, PendenciaManutencao } from '@/types'
import Card, { CardBody, CardHeader } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import PageHeader from '@/components/ui/PageHeader'
import CalendarioMensal from '@/components/calendario/CalendarioMensal'
import { aniversariosNoCalendario, eventosNoCalendario, legendaEventos } from '@/utils/calendario'
import { SITUACAO, prazoPorExtenso } from '@/utils/situacaoManutencao'
import dayjs from 'dayjs'
import 'dayjs/locale/pt-br'
dayjs.locale('pt-br')

const ICONE_SITUACAO = { VENCIDO: AlertTriangle, SEM_REGISTRO: CircleDashed, PROXIMO: Clock, EM_DIA: CheckCircle2 } as const

/** Uma pendência de manutenção, com a cor da situação bem visível */
function LinhaPendencia({ p }: { p: PendenciaManutencao }) {
  const s = SITUACAO[p.status]
  const Icone = ICONE_SITUACAO[p.status]
  return (
    <li className={`flex items-center gap-3 rounded-lg border border-l-4 px-3 py-2 ${s.bloco} ${s.faixa}`}>
      <Icone size={18} className="flex-shrink-0" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{p.ativoNome} — {p.tipoNome}</p>
        <p className="text-xs opacity-90">
          {p.status === 'SEM_REGISTRO' ? 'Nenhuma manutenção registrada ainda' : `${prazoPorExtenso(p.proximaManutencao)} (${dayjs(p.proximaManutencao).format('DD/MM/YYYY')})`}
        </p>
      </div>
      <span className="text-xs font-bold uppercase tracking-wide whitespace-nowrap">{s.rotulo}</span>
    </li>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [erro, setErro] = useState(false)
  const navigate = useNavigate()

  // Calendário do mês: eventos do mês exibido + aniversários (todos os ativos, carregados uma vez)
  const [mesCal, setMesCal] = useState(dayjs().startOf('month'))
  const [eventosMes, setEventosMes] = useState<Evento[]>([])
  const [carregandoCal, setCarregandoCal] = useState(true)
  const [nascimentos, setNascimentos] = useState<Membro[]>([])

  useEffect(() => {
    api.get('/dashboard').then((r) => setData(r.data)).catch(() => setErro(true))
    api.get('/membros/aniversariantes', { params: { periodo: 'todos' } }).then((r) => setNascimentos(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    let ativo = true
    setCarregandoCal(true)
    api.get('/eventos', { params: { mes: mesCal.month() + 1, ano: mesCal.year() } })
      .then((r) => { if (ativo) setEventosMes(r.data) })
      .catch(() => { if (ativo) setEventosMes([]) })
      .finally(() => { if (ativo) setCarregandoCal(false) })
    return () => { ativo = false }
  }, [mesCal])

  const itensCalendario = useMemo(
    () => [...eventosNoCalendario(eventosMes, () => navigate('/eventos')), ...aniversariosNoCalendario(nascimentos, mesCal)],
    [eventosMes, nascimentos, mesCal, navigate]
  )

  if (erro) return <div className="p-6"><p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">Não foi possível carregar o painel. Recarregue a página.</p></div>
  if (!data) return <Spinner />

  const { vencidos, proximos, semRegistro, itens } = data.manutencao
  const corManut = vencidos > 0 ? 'red' : proximos + semRegistro > 0 ? 'amber' : 'green'

  // Cada indicador com a sua cor, para achar com o olho sem ler
  const metrics = [
    { label: 'Membros ativos', value: data.membros.total, icon: Users, to: '/membros', cor: 'bg-violet-50 border-violet-200 text-violet-700', icone: 'bg-violet-500' },
    { label: 'Eventos esta semana', value: data.eventosProximos.length, icon: CalendarDays, to: '/eventos', cor: 'bg-blue-50 border-blue-200 text-blue-700', icone: 'bg-blue-500' },
    { label: 'Aniversários na semana', value: data.aniversariantes.length, icon: Cake, to: '/aniversarios', cor: 'bg-pink-50 border-pink-200 text-pink-700', icone: 'bg-pink-500' },
    {
      label: vencidos > 0 ? 'Manutenções vencidas' : 'Manutenções pendentes',
      value: vencidos > 0 ? vencidos : itens.length,
      icon: Wrench,
      to: '/manutencao',
      cor: { red: 'bg-red-50 border-red-300 text-red-700', amber: 'bg-amber-50 border-amber-300 text-amber-800', green: 'bg-green-50 border-green-200 text-green-700' }[corManut],
      icone: { red: 'bg-red-600', amber: 'bg-amber-500', green: 'bg-green-600' }[corManut],
    },
    { label: 'Contribuições a aprovar', value: data.contribuicoesPendentes, icon: Gift, to: '/campanha', cor: data.contribuicoesPendentes ? 'bg-orange-50 border-orange-300 text-orange-800' : 'bg-white border-gray-200 text-gray-600', icone: data.contribuicoesPendentes ? 'bg-orange-500' : 'bg-gray-400' },
    { label: 'Doações a confirmar', value: data.doacoesPendentes, icon: HeartHandshake, to: '/mao-amiga', cor: data.doacoesPendentes ? 'bg-teal-50 border-teal-300 text-teal-800' : 'bg-white border-gray-200 text-gray-600', icone: data.doacoesPendentes ? 'bg-teal-600' : 'bg-gray-400' },
  ]

  const urgentes = itens.filter((p) => p.status === 'VENCIDO')
  const atencao = itens.filter((p) => p.status !== 'VENCIDO')

  return (
    <div className="p-4 sm:p-6 2xl:px-10">
      <PageHeader title="Dashboard" subtitle={dayjs().format('dddd, D [de] MMMM [de] YYYY')} />

      {/* Precisa de atenção: a primeira coisa que se vê */}
      {itens.length > 0 ? (
        <section
          aria-labelledby="titulo-atencao"
          className={`rounded-2xl border-2 p-4 sm:p-5 mb-6 ${vencidos > 0 ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}
        >
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className={`w-11 h-11 rounded-full flex items-center justify-center text-white ${vencidos > 0 ? 'bg-red-600' : 'bg-amber-500'}`} aria-hidden>
              <AlertTriangle size={22} />
            </span>
            <div className="flex-1 min-w-[200px]">
              <h2 id="titulo-atencao" className={`text-lg font-bold ${vencidos > 0 ? 'text-red-800' : 'text-amber-900'}`}>
                {vencidos > 0
                  ? `${vencidos} ${vencidos === 1 ? 'manutenção vencida' : 'manutenções vencidas'}`
                  : 'Manutenções precisando de atenção'}
              </h2>
              <p className={`text-sm ${vencidos > 0 ? 'text-red-700' : 'text-amber-800'}`}>
                {[
                  vencidos && `${vencidos} vencida${vencidos > 1 ? 's' : ''}`,
                  proximos && `${proximos} vence${proximos > 1 ? 'm' : ''} nos próximos 30 dias`,
                  semRegistro && `${semRegistro} sem registro`,
                ].filter(Boolean).join(' · ')}
              </p>
            </div>
            <Link
              to="/manutencao"
              className={`inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${vencidos > 0 ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-400' : 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-400'}`}
            >
              Ver manutenção <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
          <ul className="grid gap-2 md:grid-cols-2">
            {[...urgentes, ...atencao].slice(0, 6).map((p) => <LinhaPendencia key={p.tipoId} p={p} />)}
          </ul>
          {itens.length > 6 && <p className="text-xs mt-2 text-gray-600">e mais {itens.length - 6}…</p>}
        </section>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 text-green-800 px-4 py-3 mb-6">
          <CheckCircle2 size={22} aria-hidden />
          <p className="text-sm font-medium">Todas as manutenções estão em dia.</p>
        </div>
      )}

      {/* Indicadores */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {metrics.map((m) => (
          <Link
            key={m.label}
            to={m.to}
            className={`group rounded-xl border p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${m.cor}`}
          >
            <span className={`inline-flex w-9 h-9 rounded-lg items-center justify-center text-white mb-2 ${m.icone}`} aria-hidden>
              <m.icon size={18} />
            </span>
            <div className="text-2xl font-bold tabular-nums">{m.value}</div>
            <div className="text-xs font-medium mt-0.5 opacity-90">{m.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Aniversariantes */}
        <Card className="lg:col-span-2">
          <CardHeader><span className="text-sm font-semibold text-gray-900">🎂 Aniversariantes da semana</span></CardHeader>
          <CardBody className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
            {data.aniversariantes.length === 0
              ? <p className="text-sm text-gray-400 py-4 text-center sm:col-span-2 xl:col-span-3">Nenhum esta semana</p>
              : data.aniversariantes.map((m) => (
                <div key={m.id} className={`flex items-center gap-3 py-2.5 ${m.diffDias === 0 ? 'bg-pink-50 rounded-lg px-2 -mx-2' : ''}`}>
                  <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-xs font-bold text-pink-700">
                    {m.nomeCompleto.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.nomeCompleto}</p>
                    <p className="text-xs text-gray-500 truncate">{m.cargos.map((c) => c.cargo.nome).join(', ')}</p>
                  </div>
                  <span className={`text-xs font-semibold ${m.diffDias === 0 ? 'text-pink-700' : 'text-pink-600'}`}>
                    {m.diffDias === 0 ? 'Hoje 🎉' : m.diffDias === 1 ? 'Amanhã' : `em ${m.diffDias}d`}
                  </span>
                </div>
              ))
            }
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* Calendário do mês */}
      <Card className="xl:col-span-2">
        <CardHeader>
          <span className="text-sm font-semibold text-gray-900">Calendário</span>
          <Link to="/eventos" className="text-xs font-medium text-primary-600 hover:underline">Abrir agenda</Link>
        </CardHeader>
        <CardBody>
          <CalendarioMensal
            mes={mesCal}
            onMudarMes={setMesCal}
            itens={itensCalendario}
            carregando={carregandoCal}
            compacto
            legenda={[...legendaEventos, { cor: 'pink', texto: 'Aniversário' }]}
            vazioDia="Nenhum evento ou aniversário neste dia."
          />
        </CardBody>
      </Card>

      {/* Próximos eventos */}
      <Card className="self-start">
        <CardHeader><span className="text-sm font-semibold text-gray-900">Próximos eventos</span></CardHeader>
        <CardBody className="divide-y divide-gray-50">
          {data.eventosProximos.length === 0
            ? <p className="text-sm text-gray-400 py-4 text-center">Nenhum evento nos próximos 7 dias</p>
            : data.eventosProximos.map((e) => (
              <div key={e.id} className="flex items-center gap-4 py-2.5">
                <div className="w-10 h-10 rounded-lg bg-primary-50 flex flex-col items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary-600 leading-none">{dayjs(e.inicio).format('DD')}</span>
                  <span className="text-[10px] text-primary-400 uppercase">{dayjs(e.inicio).format('MMM')}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{e.nome}</p>
                  <p className="text-xs text-gray-500">{dayjs(e.inicio).format('HH:mm')} · {e.local ?? '—'}</p>
                </div>
                <Badge variant={e.tipo === 'CULTO' ? 'purple' : e.tipo === 'REUNIAO' ? 'blue' : 'amber'}>
                  {e.tipo === 'CULTO' ? 'Culto' : e.tipo === 'REUNIAO' ? 'Reunião' : 'Especial'}
                </Badge>
              </div>
            ))
          }
        </CardBody>
      </Card>
      </div>
    </div>
  )
}
