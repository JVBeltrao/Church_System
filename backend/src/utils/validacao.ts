import { z } from 'zod'

/** URL externa segura: só http(s) — bloqueia `javascript:`, `data:` etc., que virariam XSS em um <a href>. */
export const urlHttp = z
  .string()
  .trim()
  .max(2048, 'URL muito longa.')
  .url('URL inválida.')
  .refine((u) => /^https?:\/\//i.test(u), 'Use um endereço http:// ou https://.')

/** Texto curto de formulário (nomes, itens). */
export const textoCurto = (min = 2, max = 120) => z.string().trim().min(min).max(max)

/** Texto longo opcional (descrições, motivos). Vazio vira null. */
export const textoLongo = (max = 1000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))

/** Telefone/WhatsApp: dígitos, espaços, parênteses, hífen e "+". */
export const telefone = z
  .string()
  .trim()
  .max(25)
  .regex(/^[0-9+()\-\s]*$/, 'Telefone inválido.')

/**
 * ID de registro (formato 8-4-4-4-12 hexadecimal).
 *
 * Não usar `z.string().uuid()`: no Zod 4 ele exige a versão/variante do RFC 9562, e os
 * cargos criados pela migração de 30/10/2026 (Auxiliar, Secretária) têm IDs gerados por
 * md5 que não seguem isso — o cadastro de membros com esses cargos era recusado.
 */
export const idRegistro = z.guid('ID inválido.')

/** Telefone obrigatório (cadastro de membros) */
export const telefoneObrigatorio = telefone.min(8, 'Informe o telefone (com DDD).')

/** Lê um enum de query string; valor desconhecido é ignorado. */
export function enumQuery<T extends string>(valor: unknown, validos: readonly T[]): T | undefined {
  return typeof valor === 'string' && (validos as readonly string[]).includes(valor) ? (valor as T) : undefined
}
