import type { Membro } from '@/types'
import { mascararTelefone } from './mascaraTelefone'
import { formatarData } from './data'

/** Campo de CSV: entre aspas quando precisa, com aspas internas duplicadas. */
function campo(valor: string): string {
  return /[";\n\r]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
}

/**
 * Planilha (CSV) dos membros, no formato que o Excel em português abre direto:
 * separador ";" e BOM UTF-8 (para os acentos aparecerem certos).
 */
export function gerarCsvMembros(membros: Membro[]): string {
  const cabecalho = ['Nome', 'Telefone', 'E-mail', 'Data de nascimento', 'Situação', 'Cargos', 'Categorias', 'Conjuntos', 'Endereço', 'Não quer imagem gravada']
  const linhas = membros.map((m) => [
    m.nomeCompleto,
    m.telefone ? mascararTelefone(m.telefone) : '',
    m.email ?? '',
    m.dataNascimento ? formatarData(m.dataNascimento) : '',
    m.status === 'ATIVO' ? 'Ativo' : 'Inativo',
    m.cargos.map((c) => c.cargo.nome).join(', '),
    m.categorias.map((c) => c.categoria.nome).join(', '),
    m.conjuntos.map((c) => c.conjunto.nome).join(', '),
    m.endereco ?? '',
    m.naoQuerImagemGravada ? 'Sim' : 'Não',
  ])
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(campo).join(';')).join('\r\n')
}

/** Telefones (um por linha), sem repetir, para colar num grupo ou lista de transmissão. */
export function listaTelefones(membros: Membro[]): string {
  return [...new Set(membros.filter((m) => m.telefone).map((m) => mascararTelefone(m.telefone!)))].join('\n')
}

/** E-mails separados por vírgula, para colar no campo "Para" do e-mail. */
export function listaEmails(membros: Membro[]): string {
  return [...new Set(membros.filter((m) => m.email).map((m) => m.email!))].join(', ')
}

/** Faz o navegador baixar um arquivo de texto. */
export function baixarArquivo(conteudo: string, nome: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
