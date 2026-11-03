# Decisões de arquitetura

## Escopo entregue

Aplicação Next.js App Router + React + TypeScript, API Node no servidor e PostgreSQL. A UI é própria: verde floresta, creme e ilustrações SVG originais. Lucide fornece ícones; os componentes de formulário e cartões compartilham CSS e semântica nativa. Nome provisório configurável em `NEXT_PUBLIC_SITE_NAME`. Nenhuma disponibilidade comercial é presumida.

O repositório e o remoto estavam sem arquivos, commits ou branch main. Não havia AGENTS.md, stack ou banco preexistentes. A implementação está no checkout original, sem worktree.

## Domínios

- `src/domains/users`: senhas bcrypt, sessões opacas com hash e expiração, verificação e recuperação por tokens de uso único, e-mail SMTP ou caixa local privada.
- `catalog`: identidade (`cards`) separada de edição/variante (`editions`); conservação e graduação pertencem à oferta. Comparação usa edição, conservação e graduação exatas.
- `listings`: fotos próprias/autorizadas, estoque livre, pausa/encerramento lógico e validação de uploads.
- `orders`: pedido principal, remessas por vendedor, itens com snapshots, reservas, expiração, autorização e reembolsos.
- `payments`: sandbox local, assinatura HMAC do corpo bruto, eventos idempotentes. Nunca confirma pelo retorno do navegador.
- `affiliates`: URLs HTTPS com hostname exato, cadastro manual e cliques distintos de conversões. Sem scraping ou preços inventados.
- `boosters`: grupos com garantias, estoque físico exclusivo, capacidade mínima por grupo, seleção criptográfica sem reposição, atribuição persistente e revelação idempotente.
- `admin`: métricas, moderação, conciliação sandbox e auditoria.

## PostgreSQL e concorrência

Sem DATABASE_URL, usa PGlite (PostgreSQL embarcado, não SQLite). Destina-se a UMA instância Node para desenvolvimento, com uma fila de transações no processo. Não compartilhar seu diretório com processos simultâneos. Migrações e seed rodam ANTES de iniciar a aplicação. O seed é idempotente e recusado no modo produção.

Com DATABASE_URL, usa `pg.Pool` e as mesmas migrações SQL. Há `SELECT ... FOR UPDATE` para pedidos, campanhas, anúncios e unidades físicas. A chave de checkout é única por comprador; a linha do comprador é bloqueada para coordenar idempotência entre instâncias. Itens são bloqueados em ordem estável. Baixa/reserva e snapshots fazem parte de uma transação.

Expiração é verificada em consultas de pedidos, catálogo de boosters e novo checkout, assim como na confirmação do pagamento. Não depende de o navegador continuar aberto. Uma rotina periódica pode chamar `expireReservations` para limpeza proativa. Pagamento tardio não reutiliza estoque: o sandbox registra estorno integral e auditoria.

O estoque destinado a um booster não participa de anúncios normais: cada unidade possui UUID próprio na campanha. O operador declara a disponibilidade física; o sistema não pode verificar materialmente se a mesma carta foi cadastrada como duas unidades distintas. Antes da operação real são necessários processos de conferência e prevenção de fraude.

## Dinheiro

Valores inteiros em centavos, limite de pedido de R$ 100.000. Comissão por item: `floor((subtotal * 5 + 50) / 100)`, calculada com BigInt; empate arredonda para cima. Comissão do subpedido é a soma dos itens. Frete não integra a base. Taxa sandbox é explicitamente zero, sem antecipar taxas reais.

Reembolso parcial usa a comissão proporcional acumulada e reverte a diferença em relação ao que já foi estornado. O último estorno do item reverte exatamente sua comissão. Frete possui estorno próprio, sem comissão. Estorno financeiro não repõe automaticamente estoque físico: devolução precisa ser conferida. Extrato não é carteira nem custódia própria; entrega não significa liquidação financeira.

## Boosters e aceite

Garantias são verificadas antes da reserva e novamente no servidor. O catálogo devolve hash das unidades disponíveis; a compra HTTP exige esse aceite além de versão e preço. Mudanças nas probabilidades recusam o checkout para revisão. Uma transação reserva todas as unidades selecionadas. O pagamento apenas confirma a atribuição; resultado fica oculto antes da aprovação. Abertura altera somente `revealed`, nunca sorteia novamente. Unidade física vendida não volta ao conjunto elegível por atualização de página, webhook ou reembolso.

A referência de preço exige fonte e data; ausência retorna estimativa nula. A sugestão de preço é opcional e apenas ilustra cobertura da média estimada mais comissão, sem prever lucro ou custo. Referências inseridas manualmente precisam de validação operacional; não existe feed de cotação confiável integrado.

## Segurança e limites

Autorização no servidor; isolamento de pedidos, mensagens, remessas e avaliações; SameSite/HttpOnly e cookies Secure em produção; origem validada contra Host/APP_URL; entradas Zod; SQL parametrizado; limitação de tentativas persistida; URLs de imagens restritas a arte local ou imagens raster com assinatura e limite de tamanho; SVG arbitrário não é aceito.

Auditoria é append-only pela API, incluindo versão, reserva, pagamento, revelação e moderação. Não é uma trilha criptográfica inviolável contra quem administra o banco. Produção deve separar privilégios de banco, retenção e exportação para armazenamento imutável.

APP_MODE=production exige PostgreSQL externo e recusa banco contendo contas demo. Checkout real e boosters reais falham de forma fechada. O sinal REAL_BOOSTERS_ENABLED=false é informativo: alterar para true NÃO habilita dinheiro real nesta versão.
