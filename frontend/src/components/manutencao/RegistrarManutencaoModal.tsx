import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import api, { mensagemDeErro } from '@/services/api'
import type { Ativo, Manutencao } from '@/types'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { formatarData } from '@/utils/data'
import { SITUACAO, periodicidadePorExtenso, prazoPorExtenso } from '@/utils/situacaoManutencao'

interface Props {
  ativo: Ativo | null
  onClose: () => void
  onSaved: () => void
}

/** Registrar o que foi feito numa visita (pode marcar vários tipos de uma vez). */
export default function RegistrarManutencaoModal({ ativo, onClose, onSaved }: Props) {
  const [tipoIds, setTipoIds] = useState<string[]>([])
  const [form, setForm] = useState({ data: dayjs().format('YYYY-MM-DD'), descricao: '', responsavel: '' })
  const [historico, setHistorico] = useState<Manutencao[]>([])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!ativo) return
    setErro('')
    setForm({ data: dayjs().format('YYYY-MM-DD'), descricao: '', responsavel: '' })
    // Com um tipo só, já vem marcado
    setTipoIds(ativo.tipos.length === 1 ? [ativo.tipos[0].id] : [])
    setHistorico([])
    api.get(`/ativos/${ativo.id}`).then((r) => setHistorico(r.data.historico ?? [])).catch(() => {})
  }, [ativo])

  function alternar(id: string) {
    setTipoIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  async function salvar() {
    if (!ativo) return
    if (tipoIds.length === 0) return setErro('Marque o que foi feito.')
    if (!form.data || form.responsavel.trim().length < 2 || form.descricao.trim().length < 2)
      return setErro('Preencha a data, o responsável e a descrição do serviço.')
    setErro('')
    setSalvando(true)
    try {
      await api.post(`/ativos/${ativo.id}/manutencoes`, { ...form, tipoIds })
      onSaved()
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível registrar a manutenção.'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal open={!!ativo} onClose={onClose} title={`Registrar manutenção — ${ativo?.nome ?? ''}`} width="max-w-xl">
      <div className="space-y-4">
        <fieldset>
          <legend className="text-xs font-medium text-gray-600 mb-1.5">O que foi feito? *</legend>
          <div className="grid gap-2">
            {ativo?.tipos.map((t) => {
              const s = SITUACAO[t.status]
              const marcado = tipoIds.includes(t.id)
              return (
                <label
                  key={t.id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                    marcado ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-300' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input type="checkbox" checked={marcado} onChange={() => alternar(t.id)} className="w-4 h-4 accent-primary-600" />
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-gray-900">{t.nome}</span>
                    <span className="block text-xs text-gray-500">{periodicidadePorExtenso(t.periodicidadeDias)}</span>
                  </span>
                  <span className={`text-xs font-medium ${s.texto}`}>{t.status === 'SEM_REGISTRO' ? s.rotulo : prazoPorExtenso(t.proximaManutencao)}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Data *" type="date" value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />
          <Input label="Responsável *" placeholder="Quem fez o serviço" value={form.responsavel} onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))} />
        </div>
        <Input label="Descrição do serviço *" placeholder="Ex.: Limpeza das serpentinas" value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />

        {erro && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} loading={salvando}>Registrar</Button>
        </div>

        {historico.length > 0 && (
          <div className="pt-4 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2">Últimas manutenções</p>
            <ul className="space-y-1.5 max-h-44 overflow-y-auto">
              {historico.slice(0, 15).map((h) => (
                <li key={h.id} className="text-xs bg-gray-50 rounded-lg px-3 py-2 flex flex-wrap gap-x-2">
                  <span className="font-semibold text-gray-700">{formatarData(h.data)}</span>
                  {h.tipo && <span className="font-medium text-primary-700">{h.tipo.nome}</span>}
                  <span className="text-gray-500">· {h.responsavel} · {h.descricao}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
