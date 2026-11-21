import { defineConfig } from 'vitest/config'

/**
 * Testes automatizados do backend.
 *  - unidade: regras de negócio puras (recorrência, aniversário, manutenção, validação)
 *  - api:     Express real + banco em memória (rotas, autenticação, validação, segurança)
 * Os testes de integração com PostgreSQL ficam em vitest.integracao.config.ts.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unidade',
          // Fuso de João Pessoa, como no uso real (pega erros de "data um dia antes")
          env: { TZ: 'America/Fortaleza' },
          include: ['tests/unit/**/*.test.ts'],
          setupFiles: ['tests/helpers/ambiente.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'api',
          env: { TZ: 'America/Fortaleza' },
          include: ['tests/api/**/*.test.ts'],
          setupFiles: ['tests/helpers/ambiente.ts', 'tests/helpers/mockPrisma.ts'],
          environment: 'node',
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'],
      reporter: ['text-summary', 'text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
})
