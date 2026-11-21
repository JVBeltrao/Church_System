import { describe, expect, it } from 'vitest'
import { gerarCsvMembros, listaEmails, listaTelefones } from './exportarMembros'
import type { Membro } from '@/types'

const membro = (over: Partial<Membro>): Membro => ({
  id: 'm', nomeCompleto: 'Ana Souza', telefone: '83999990001', email: 'ana@x.com', dataNascimento: '1990-03-05T00:00:00.000Z',
  status: 'ATIVO', cargos: [], categorias: [], conjuntos: [], naoQuerImagemGravada: false, criadoEm: '', ...over,
} as Membro)

describe('gerarCsvMembros — planilha para o Excel', () => {
  it('usa ";" e BOM (acentos certos no Excel em português)', () => {
    const csv = gerarCsvMembros([membro({})])
    expect(csv.startsWith('﻿')).toBe(true)
    const [cabecalho, linha] = csv.slice(1).split('\r\n')
    expect(cabecalho.split(';')[0]).toBe('Nome')
    expect(linha.split(';').slice(0, 5)).toEqual(['Ana Souza', '(83) 99999-0001', 'ana@x.com', '05/03/1990', 'Ativo'])
  })

  it('protege campos com ";" ou aspas', () => {
    const csv = gerarCsvMembros([membro({ endereco: 'Rua A; nº 10 "fundos"' })])
    expect(csv).toContain('"Rua A; nº 10 ""fundos"""')
  })

  it('junta cargos numa célula só', () => {
    const csv = gerarCsvMembros([membro({ cargos: [{ cargo: { nome: 'Diácono' } }, { cargo: { nome: 'Auxiliar' } }] as any })])
    expect(csv).toContain('Diácono, Auxiliar')
  })
})

describe('listas para copiar', () => {
  const lista = [membro({ id: '1' }), membro({ id: '2', telefone: null, email: 'bia@x.com' }), membro({ id: '3' })]
  it('telefones: um por linha, sem repetir e sem vazios', () => expect(listaTelefones(lista)).toBe('(83) 99999-0001'))
  it('e-mails: separados por vírgula, sem repetir', () => expect(listaEmails(lista)).toBe('ana@x.com, bia@x.com'))
})
