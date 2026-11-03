# Nexo TCG

Marketplace brasileiro executável de cartas e colecionáveis, com catálogo, anúncios, compras internas sandbox, afiliados e boosters de demonstração. Nome provisório, sem pressupor registro de marca ou domínio.

**Esta entrega é um ambiente de demonstração funcional. Não opera dinheiro nem envios reais.** O sandbox é local, não a homologação bancária de Mercado Pago. Os dados iniciais, contas, produtos, frete e imagens estão identificados como fictícios. Nenhuma estatística demo representa atividade comercial real.

## Executar

Requisitos: Node.js 22.6+ (validado com 24), npm e 1 GB de memória disponível. Sem serviços externos no modo local.

```sh
cd /workspace/Siteanime
npm ci
npm run setup:local  # gera chave HMAC privada; preserva .env.local existente
npm run db:migrate
npm run db:seed
npm run dev
```

O PGlite mantém PostgreSQL em `.data/postgres`. Não rode migração/seed ao mesmo tempo que o servidor quando usar o banco embarcado. Para uma aplicação já em execução, pare primeiro esse processo. Para um servidor otimizado, use `npm run build` e depois `npm start`. Não mantenha dev e start simultaneamente na mesma porta/diretório PGlite.

As migrações são idempotentes e o seed não duplica registros. Migrações também são verificadas na inicialização da camada de banco. Não são necessários Docker, APIs de cartas, credenciais de pagamento ou conta de afiliado para experimentar o fluxo local.

## Experimentar de ponta a ponta

1. Entre em **Minha conta**. Use os botões de contas demo ou os e-mails abaixo.
2. Explore o catálogo, filtre por franquia/tipo/conservação, favorite e compare ofertas da mesma versão e condição.
3. Adicione produtos de diferentes vendedores ao carrinho. Selecione o endereço demo e Pix ou cartão simulados. Reserva: 15 minutos. Frete demo: R$ 15 por vendedor.
4. No pedido, use **Simular pagamento aprovado**. Isto confirma o pagamento no servidor. **Simular falha** libera estoque.
5. Compre o **Booster Cosmos** em demonstração, confirme o pagamento e revele cada carta ou pule a animação. Recarregar preserva o resultado e as cartas já reveladas. O servidor nunca sorteia de novo ao abrir.
6. Use a conta vendedor para criar/editar/pausar/encerrar anúncios, cadastrar campanhas, conferir a lista exata das cartas, mensagens e atualizar remessas. Confirme a entrega como comprador para poder avaliar.
7. Como administrador, modere anúncios e usuários, cadastre catálogo e afiliados autorizados, consulte pedidos/auditoria/conciliação, resolva disputas e registre estornos. O detalhe do pedido mostra ao admin o ID do item para reembolso. Frete usa ID completo da remessa, visível em Admin → dados do pedido/API; a UI de remessa também o exibe.

Contas locais — senha compartilhada **somente de demonstração**: `NexoDemo2026!`

| Papel          | E-mail                 |
| -------------- | ---------------------- |
| Comprador      | colecionador@nexo.test |
| Vendedor       | loja@nexo.test         |
| Outro vendedor | otaku@nexo.test        |
| Administrador  | admin@nexo.test        |

Novos cadastros geram verificação de e-mail. Sem SMTP, links privados são gravados em `.data/outbox/` (não servida publicamente). Abra o arquivo local correspondente e acesse o link para verificar a conta. Recuperação usa o mesmo mecanismo e invalida sessões anteriores ao redefinir a senha. Em produção, configure SMTP; nunca publique a caixa local ou use documentos pessoais reais no demo.

## O que funciona

- Sessões com cookies HttpOnly, senhas com bcrypt, recuperação/verificação, perfis, avatar, endereços privados e papéis no servidor.
- Identidade de carta, edição/variante e oferta separadas; fotos raster próprias/autorizadas, estoque, filtros, ofertas comparáveis, favoritos e vitrine.
- Carrinho multivendedor; pedido e subpedidos; snapshots; reserva transacional; idempotência; pagamento sandbox; expiração e tratamento de pagamento tardio; frete e comissões separados.
- Comissão de 5% em centavos, arredondamento explícito, estornos parciais/totais de produtos e frete, reversão proporcional de comissão e extrato contábil sandbox.
- Mensagens, notificações, remessas/rastreio manuais, confirmação de entrega, avaliações vinculadas à compra e denúncias/disputas com fotos.
- Afiliados administrados manualmente, allowlist de URLs, aviso de vínculo, links patrocinados e contagem de cliques. Exemplo inicial inativo; não há conversões externas inventadas.
- Boosters com grupos/garantias, estoque físico exclusivo, capacidade, referências com fonte/data, simulação identificada, preço confirmado, sorteio criptográfico e revelação acessível com estado persistido.
- Administração de usuários, catálogo, moderação, campanhas, afiliados, pedidos, pagamentos, reembolsos, disputas, métricas e auditoria.

## Verificar

```sh
npm run typecheck
npm test
npm run build
# Com o servidor já iniciado e Chromium instalado:
npm run test:browser
npm run test:webhook  # servidor iniciado com a mesma .env.local
```

`npm test` usa um diretório PostgreSQL embarcado temporário separado. Não herda DATABASE_URL da aplicação. Para repetir a suíte em PostgreSQL convencional, crie **um banco dedicado de testes** e forneça `NEXO_TEST_DATABASE_URL`. Ela **limpa as tabelas da aplicação** antes de criar os dados fictícios e altera estoque deliberadamente. Nunca use um banco com dados a preservar.

```sh
NEXO_TEST_DATABASE_URL=postgresql://usuario@127.0.0.1:55432/nexo_test npm test
NEXO_TEST_DATABASE_URL=postgresql://usuario@127.0.0.1:55432/nexo_test npm run test:postgres-race
```

O teste de corrida usa dois processos e compradores diferentes disputando uma unidade. O teste de navegador usa Chromium em `/usr/bin/chromium` e grava capturas em `.data/checks/`. Ele efetua compras fictícias no banco de demonstração, por isso não deve apontar para operação real.

## PostgreSQL externo

Defina DATABASE_URL antes de migrar. Use um banco vazio separado para produção e um usuário com privilégios apropriados. O adaptador `pg` usa as mesmas migrações SQL. Testes PostgreSQL reais foram feitos com a imagem oficial postgres:17-alpine. Banco embarcado suporta apenas uma instância Node; PostgreSQL externo é necessário para múltiplos processos/instâncias.

## Antes de operar dinheiro real

A aplicação bloqueia checkout e boosters reais em APP_MODE=production; não basta adicionar uma chave. Também recusa banco com contas demo. Ainda são necessários adaptador de pagamento homologado, KYC/recebedores e split contratado, webhooks oficiais com consulta ao provedor, conciliação externa, frete real, e-mail, processamento e armazenamento de fotos, observabilidade, backups e revisão jurídica/LGPD. A venda real de boosters exige ainda aceitação expressa do provedor. Não há recompra, saldo sacável ou promessa de rentabilidade.

Leia [decisões de arquitetura](docs/ARCHITECTURE.md), [pagamentos e pendências de integração](docs/PAYMENTS.md) e [validação](docs/VALIDATION.md). Não presuma que as configurações salvas do ambiente já foram publicadas ou testadas em uma nova tarefa.

## Hospedar a demonstração

O pacote Docker e `render.yaml` preparam um serviço web e PostgreSQL separado no plano gratuito do Render. Não existe publicação automática sem uma conta conectada. Siga [as instruções de hospedagem](docs/DEPLOYMENT.md). O teste `node scripts/hosting-smoke.mjs` valida uma imagem já iniciada localmente na porta 3100; HOSTING_TEST_URL permite outro endereço de demonstração.
