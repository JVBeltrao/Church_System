import { PrismaClient, StatusMembro, TipoEvento, RecorrenciaEvento } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Este seed cria dados de exemplo e a senha padrão admin123. Em produção use: npm run db:seed:admin')
    process.exit(1)
  }
  console.log('🌱 Iniciando seed...')

  // Usuário admin
  const senhaHash = await bcrypt.hash('admin123', 10)
  const admin = await prisma.usuario.upsert({
    where: { email: 'admin@igreja.com' },
    update: {},
    create: {
      nome: 'Administrador',
      email: 'admin@igreja.com',
      senhaHash,
      telefone: '5583999990000',
    },
  })
  console.log('✅ Usuário admin criado:', admin.email)

  // Cargos
  const cargos = await Promise.all([
    prisma.cargo.upsert({ where: { nome: 'Pastor' }, update: {}, create: { nome: 'Pastor', descricao: 'Líder pastoral da igreja' } }),
    prisma.cargo.upsert({ where: { nome: 'Presbítero' }, update: {}, create: { nome: 'Presbítero', descricao: 'Ancião da congregação' } }),
    prisma.cargo.upsert({ where: { nome: 'Diácono' }, update: {}, create: { nome: 'Diácono', descricao: 'Servo da congregação' } }),
    prisma.cargo.upsert({ where: { nome: 'Coord. Mocidade' }, update: {}, create: { nome: 'Coord. Mocidade', descricao: 'Coordenador(a) do ministério de jovens' } }),
    prisma.cargo.upsert({ where: { nome: 'Auxiliar' }, update: {}, create: { nome: 'Auxiliar', descricao: 'Auxiliar da congregação' } }),
    prisma.cargo.upsert({ where: { nome: 'Secretária' }, update: {}, create: { nome: 'Secretária', descricao: 'Secretaria da igreja' } }),
  ])
  console.log(`✅ ${cargos.length} cargos criados`)

  // Categorias (professores EBD por subcategoria, músicos, mídia)
  const categorias = await Promise.all(
    [
      { nome: 'Professor(a) EBD — Irmãs', grupo: 'EBD' },
      { nome: 'Professor(a) EBD — Irmãos', grupo: 'EBD' },
      { nome: 'Professor(a) EBD — Juvenis', grupo: 'EBD' },
      { nome: 'Professor(a) EBD — Crianças', grupo: 'EBD' },
      { nome: 'Professor(a) EBD — Jovens', grupo: 'EBD' },
      { nome: 'Músico', grupo: 'Louvor' },
      { nome: 'Mídia', grupo: 'Mídia' },
    ].map((c) => prisma.categoria.upsert({ where: { nome: c.nome }, update: {}, create: c }))
  )
  console.log(`✅ ${categorias.length} categorias criadas`)

  // Conjuntos musicais
  const conjuntos = await Promise.all(
    ['Lírios dos Vales', 'Colunas de Prata', 'Filhas de Jerusalém', 'Oráculos de Deus'].map((nome) =>
      prisma.conjuntoMusical.upsert({ where: { nome }, update: {}, create: { nome } })
    )
  )
  console.log(`✅ ${conjuntos.length} conjuntos musicais criados`)

  // Membros
  const [cargoPastor, , , , cargoAuxiliar, cargoSecretaria] = cargos
  const membro1 = await prisma.membro.create({
    data: {
      nomeCompleto: 'Roberto Silva',
      dataNascimento: new Date('1970-03-12'),
      telefone: '(83) 99999-0001',
      email: 'pastor@igreja.com',
      status: StatusMembro.ATIVO,
      cargos: { create: [{ cargoId: cargoPastor.id }] },
    },
  })
  const membro2 = await prisma.membro.create({
    data: {
      nomeCompleto: 'Maria Rodrigues',
      dataNascimento: new Date('1985-06-01'),
      telefone: '(83) 99999-0002',
      status: StatusMembro.ATIVO,
      cargos: { create: [{ cargoId: cargoSecretaria.id }] },
      categorias: { create: [{ categoriaId: categorias[5].id }] }, // Músico
      conjuntos: { create: [{ conjuntoId: conjuntos[2].id }] }, // Filhas de Jerusalém
    },
  })
  await prisma.membro.create({
    data: {
      nomeCompleto: 'João Pedro Lima',
      dataNascimento: new Date('1995-06-05'),
      telefone: '(83) 99999-0003',
      status: StatusMembro.ATIVO,
      cargos: { create: [{ cargoId: cargoAuxiliar.id }] },
      categorias: { create: [{ categoriaId: categorias[4].id }] }, // Professor EBD Jovens
    },
  })
  console.log('✅ Membros criados')

  // Eventos
  await prisma.evento.createMany({
    data: [
      { nome: 'Culto dominical', local: 'Templo principal', inicio: new Date('2026-10-04T09:00:00'), tipo: TipoEvento.CULTO, recorrencia: RecorrenciaEvento.SEMANAL },
      { nome: 'Reunião de líderes', local: 'Sala de reuniões', inicio: new Date('2026-10-07T19:30:00'), tipo: TipoEvento.REUNIAO, recorrencia: RecorrenciaEvento.NENHUMA },
      { nome: 'Retiro de jovens', descricao: 'Retiro anual da mocidade', local: 'Sítio Esperança', inicio: new Date('2026-10-17T08:00:00'), tipo: TipoEvento.ESPECIAL, recorrencia: RecorrenciaEvento.NENHUMA },
    ],
  })
  console.log('✅ Eventos criados')

  // Ativos
  const criarAtivo = (nome: string, descricao: string, tipos: [string, number][]) =>
    prisma.ativo.create({
      data: { nome, descricao, tipos: { create: tipos.map(([n, periodicidadeDias]) => ({ nome: n, periodicidadeDias })) } },
      include: { tipos: true },
    })
  const ar = await criarAtivo('Ar-condicionado — salão principal', 'Split 60.000 BTU', [['Limpeza', 90], ['Troca do filtro', 180], ['Recarga de gás', 365]])
  const extintor = await criarAtivo('Extintor — sala principal', 'Extintor de incêndio tipo ABC', [['Recarga e vistoria', 365]])
  await criarAtivo("Caixa d'água", 'Reservatório principal', [['Limpeza e higienização', 180]])
  await criarAtivo('Instalação elétrica', 'Quadro e fiação', [['Revisão geral', 365]])

  const tipo = (a: typeof ar, nome: string) => a.tipos.find((t) => t.nome === nome)!.id
  await prisma.manutencao.create({ data: { ativoId: ar.id, tipoId: tipo(ar, 'Limpeza'), data: new Date('2026-06-01'), descricao: 'Limpeza dos aparelhos', responsavel: 'José Santos', realizadaPor: admin.id } })
  await prisma.manutencao.create({ data: { ativoId: ar.id, tipoId: tipo(ar, 'Troca do filtro'), data: new Date('2026-06-01'), descricao: 'Troca dos filtros', responsavel: 'José Santos', realizadaPor: admin.id } })
  await prisma.manutencao.create({ data: { ativoId: extintor.id, tipoId: tipo(extintor, 'Recarga e vistoria'), data: new Date('2025-10-15'), descricao: 'Recarga e vistoria', responsavel: 'Empresa Extintores JP', realizadaPor: admin.id } })
  console.log('✅ Ativos e manutenções criados')

  // Itens da Campanha
  const item1 = await prisma.itemCampanha.create({
    data: { nome: 'Geladeira', descricao: 'Geladeira para a cozinha da igreja', valorTotal: 2800, chavePix: 'igreja.adju@gmail.com', whatsappTesoureiro: '5583999990010', ordem: 1 },
  })
  await prisma.itemCampanha.create({
    data: { nome: 'Televisão — sala de reuniões', descricao: 'TV 50" para a sala de reuniões', valorTotal: 1500, chavePix: 'igreja.adju@gmail.com', whatsappTesoureiro: '5583999990010', ordem: 2 },
  })
  await prisma.itemCampanha.create({
    data: { nome: 'Caixa de som', descricao: 'Caixa de som ativa para eventos', valorTotal: 800, chavePix: 'igreja.adju@gmail.com', whatsappTesoureiro: '5583999990010', ordem: 3 },
  })

  await prisma.contribuicao.createMany({
    data: [
      { itemId: item1.id, nomeContribuidor: 'Maria Rodrigues', valor: 50, status: 'CONFIRMADO', confirmadoPor: admin.id, confirmadoEm: new Date() },
      { itemId: item1.id, nomeContribuidor: 'João Pedro Lima', valor: 100, status: 'CONFIRMADO', confirmadoPor: admin.id, confirmadoEm: new Date() },
      { itemId: item1.id, nomeContribuidor: 'Carlos Ferreira', valor: 900, status: 'CONFIRMADO', confirmadoPor: admin.id, confirmadoEm: new Date() },
    ],
  })
  console.log('✅ Campanha e contribuições criadas')

  // Metas da cesta básica (Projeto Mão Amiga)
  const metas = await Promise.all(
    [
      { nomeItem: 'Arroz', unidade: 'kg', quantidadeNecessaria: 50 },
      { nomeItem: 'Feijão', unidade: 'kg', quantidadeNecessaria: 30 },
      { nomeItem: 'Óleo', unidade: 'L', quantidadeNecessaria: 20 },
      { nomeItem: 'Açúcar', unidade: 'kg', quantidadeNecessaria: 25 },
    ].map((m) => prisma.metaCesta.create({ data: m }))
  )
  console.log(`✅ ${metas.length} metas de cesta criadas`)

  // Doações Mão Amiga (algumas já vinculadas a metas, simulando baixa dinâmica)
  await prisma.doacaoAlimento.createMany({
    data: [
      { membroId: membro2.id, data: new Date('2026-09-01'), itemDoado: 'Arroz', quantidade: '5 kg', quantidadeNumerica: 5, metaCestaId: metas[0].id, tipo: 'FISICA', status: 'CONFIRMADO' },
      { membroId: membro1.id, data: new Date('2026-08-30'), itemDoado: 'Feijão', quantidade: '2 kg', quantidadeNumerica: 2, metaCestaId: metas[1].id, tipo: 'FISICA', status: 'CONFIRMADO' },
      { nomeDoador: 'Doador anônimo', data: new Date('2026-08-28'), itemDoado: 'Pix — compra de alimentos', quantidade: 'R$ 80,00', tipo: 'PIX', status: 'CONFIRMADO' },
    ],
  })
  console.log('✅ Doações Mão Amiga criadas')

  // Configuração da landing page pública
  await prisma.configuracaoIgreja.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      sobre: 'Uma comunidade de fé, acolhimento e serviço no Jardim Cidade Universitária.',
      endereco: 'Rua Exemplo, 123 — Jardim Cidade Universitária, João Pessoa/PB',
      whatsappContato: '5583999990000',
    },
  })
  console.log('✅ Configuração da landing page criada')

  console.log('\n🎉 Seed concluído com sucesso!')
  console.log('👤 Login admin: admin@igreja.com / admin123')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
