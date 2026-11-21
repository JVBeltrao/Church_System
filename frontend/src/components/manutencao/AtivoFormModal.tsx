import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import api, { mensagemDeErro } from '@/services/api'
import type { Ativo } from '@/types'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

interface LinhaTipo {
  id?: string
  nome: string
  periodicidadeDias: string
  /** Chave estável para o React (tipos novos ainda não têm id) */
  chave: string
}

/** Sugestões comuns para preencher com um clique */
const SUGESTOES: [string, number][] = [
  ['Limpeza', 90],
  ['Troca do filtro', 180],
  ['Recarga de gás', 365],
  ['Revisão geral', 365],
  ['Recarga e vistoria', 365],
  ['Troca de óleo', 120],
]

let contador = 0
const novaLinha = (nome = '', dias = ''): LinhaTipo => ({ nome, periodicidadeDias: dias, chave: `novo-${++contador}` })

interface Props {
  open: boolean
  editando: Ativo | null
  onClose: () => void
  onSaved: () => void
}

/** Cadastro/edição de ativo com os seus tipos de manutenção (cada um com o seu prazo). */
export default function AtivoFormModal({ open, editando, onClose, onSaved }: Props) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tipos, setTipos] = useState<LinhaTipo[]>([novaLinha()])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!open) return
    setErro('')
    if (editando) {
      setNome(editando.nome)
      setDescricao(editando.descricao ?? '')
      setTipos(
        [...editando.tipos]
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
          .map((t) => ({ id: t.id, nome: t.nome, periodicidadeDias: String(t.periodicidadeDias), chave: t.id }))
      )
    } else {
      setNome('')
      setDescricao('')
      setTipos([novaLinha()])
    }
  }, [open, editando])

  const removidosComHistorico = editando
    ? editando.tipos.filter((t) => t.ultimaManutencao && !tipos.some((l) => l.id === t.id))
    : []
  const nomesUsados = new Set(tipos.map((t) => t.nome.trim().toLowerCase()))

  function alterar(chave: string, campo: 'nome' | 'periodicidadeDias', valor: string) {
    setTipos((ts) => ts.map((t) => (t.chave === chave ? { ...t, [campo]: valor } : t)))
  }

  function usarSugestao(n: string, dias: number) {
    setTipos((ts) => {
      const vazia = ts.find((t) => !t.nome.trim() && !t.periodicidadeDias)
      if (vazia) return ts.map((t) => (t === vazia ? { ...t, nome: n, periodicidadeDias: String(dias) } : t))
      return [...ts, novaLinha(n, String(dias))]
    })
  }

  async function salvar() {
    const preenchidos = tipos.filter((t) => t.nome.trim() || t.periodicidadeDias)
    if (nome.trim().length < 2) return setErro('Informe o nome do ativo.')
    if (preenchidos.length === 0) return setErro('Cadastre pelo menos um tipo de manutenção.')
    if (preenchidos.some((t) => t.nome.trim().length < 2 || !(Number(t.periodicidadeDias) > 0)))
      return setErro('Cada tipo precisa de um nome e de um prazo em dias.')

    setErro('')
    setSalvando(true)
    const payload = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      tipos: preenchidos.map((t) => ({ ...(t.id ? { id: t.id } : {}), nome: t.nome.trim(), periodicidadeDias: Number(t.periodicidadeDias) })),
    }
    try {
      if (editando) await api.put(`/ativos/${editando.id}`, payload)
      else await api.post('/ativos', payload)
      onSaved()
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível salvar o ativo.'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar ativo' : 'Novo ativo'} width="max-w-xl">
      <div className="space-y-4">
        <Input label="Nome *" placeholder="Ex.: Ar-condicionado do salão" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
        <Input label="Descrição" placeholder="Ex.: Split 60.000 BTU" value={descricao} onChange={(e) => setDescricao(e.target.value)} />

        <fieldset className="rounded-xl border border-gray-200 p-3">
          <legend className="px-1 text-sm font-medium text-gray-800">Tipos de manutenção *</legend>
          <p className="text-xs text-gray-500 mb-3">
            Cada serviço tem o seu prazo. Ex.: limpeza a cada 90 dias, troca do filtro a cada 180, recarga de gás a cada 365.
          </p>

          <ul className="space-y-2">
            {tipos.map((t, i) => (
              <li key={t.chave} className="flex items-end gap-2">
                <div className="flex-1">
                  <Input label={i === 0 ? 'O que é feito' : undefined} aria-label="O que é feito" placeholder="Ex.: Limpeza" value={t.nome} onChange={(e) => alterar(t.chave, 'nome', e.target.value)} />
                </div>
                <div className="w-32">
                  <Input label={i === 0 ? 'A cada (dias)' : undefined} aria-label="A cada quantos dias" type="number" min="1" inputMode="numeric" placeholder="90" value={t.periodicidadeDias} onChange={(e) => alterar(t.chave, 'periodicidadeDias', e.target.value)} />
                </div>
                <button
                  type="button"
                  onClick={() => setTipos((ts) => (ts.length > 1 ? ts.filter((x) => x.chave !== t.chave) : [novaLinha()]))}
                  aria-label={`Remover ${t.nome || 'tipo'}`}
                  className="mb-0.5 p-2.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <Button type="button" variant="secondary" size="sm" onClick={() => setTipos((ts) => [...ts, novaLinha()])}>
              <Plus size={14} aria-hidden /> Adicionar tipo
            </Button>
            <span className="text-xs text-gray-400 ml-1">Sugestões:</span>
            {SUGESTOES.filter(([n]) => !nomesUsados.has(n.toLowerCase())).slice(0, 4).map(([n, d]) => (
              <button key={n} type="button" onClick={() => usarSugestao(n, d)} className="px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 text-xs font-medium hover:bg-primary-100">
                + {n}
              </button>
            ))}
          </div>
        </fieldset>

        {removidosComHistorico.length > 0 && (
          <p role="alert" className="text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2">
            Ao salvar, o histórico de <strong>{removidosComHistorico.map((t) => t.nome).join(', ')}</strong> será apagado junto com o tipo.
          </p>
        )}
        {erro && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} loading={salvando}>Salvar</Button>
        </div>
      </div>
    </Modal>
  )
}
