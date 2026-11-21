-- Tipos de manutenção por ativo (avaliação com a igreja, nov/2026):
-- um ar-condicionado tem limpeza, troca de filtro e recarga de gás, cada uma com o seu prazo.
-- Os ativos existentes ganham o tipo "Manutenção geral" com o prazo que já tinham, e todo o
-- histórico (manutenções e avisos já enviados) passa a apontar para esse tipo. Nada se perde.

-- 1. Tabela de tipos
CREATE TABLE "tipos_manutencao" (
    "id" TEXT NOT NULL,
    "ativo_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "periodicidade_dias" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tipos_manutencao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tipos_manutencao_ativo_id_nome_key" ON "tipos_manutencao"("ativo_id", "nome");

ALTER TABLE "tipos_manutencao" ADD CONSTRAINT "tipos_manutencao_ativo_id_fkey"
    FOREIGN KEY ("ativo_id") REFERENCES "ativos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Cada ativo existente ganha "Manutenção geral" com o prazo antigo
INSERT INTO "tipos_manutencao" ("id", "ativo_id", "nome", "periodicidade_dias")
SELECT gen_random_uuid()::text, a."id", 'Manutenção geral', a."periodicidade_dias"
FROM "ativos" a;

-- 3. Cada manutenção passa a ter o seu tipo
ALTER TABLE "manutencoes" ADD COLUMN "tipo_id" TEXT;

UPDATE "manutencoes" m SET "tipo_id" = t."id"
FROM "tipos_manutencao" t
WHERE t."ativo_id" = m."ativo_id";

ALTER TABLE "manutencoes" ALTER COLUMN "tipo_id" SET NOT NULL;

ALTER TABLE "manutencoes" ADD CONSTRAINT "manutencoes_tipo_id_fkey"
    FOREIGN KEY ("tipo_id") REFERENCES "tipos_manutencao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "manutencoes_tipo_id_data_idx" ON "manutencoes"("tipo_id", "data");

-- 4. Avisos enviados passam a ser por tipo (e não mais por ativo)
ALTER TABLE "notificacoes_manutencao" ADD COLUMN "tipo_id" TEXT;

UPDATE "notificacoes_manutencao" n SET "tipo_id" = t."id"
FROM "tipos_manutencao" t
WHERE t."ativo_id" = n."ativo_id";

DELETE FROM "notificacoes_manutencao" WHERE "tipo_id" IS NULL;

ALTER TABLE "notificacoes_manutencao" ALTER COLUMN "tipo_id" SET NOT NULL;

DROP INDEX "notificacoes_manutencao_ativo_id_status_canal_key";
ALTER TABLE "notificacoes_manutencao" DROP CONSTRAINT "notificacoes_manutencao_ativo_id_fkey";
ALTER TABLE "notificacoes_manutencao" DROP COLUMN "ativo_id";

CREATE UNIQUE INDEX "notificacoes_manutencao_tipo_id_status_canal_key" ON "notificacoes_manutencao"("tipo_id", "status", "canal");

ALTER TABLE "notificacoes_manutencao" ADD CONSTRAINT "notificacoes_manutencao_tipo_id_fkey"
    FOREIGN KEY ("tipo_id") REFERENCES "tipos_manutencao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. O prazo sai do ativo (agora fica em cada tipo)
ALTER TABLE "ativos" DROP COLUMN "periodicidade_dias";
