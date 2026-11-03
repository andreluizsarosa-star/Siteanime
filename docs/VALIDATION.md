# Validação da entrega

Executada em 03/11/2026 no ambiente desta tarefa, com Node 24 e npm 11.

| Verificação                                                            | Resultado                                                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm ci --no-audit --no-fund`                                          | Instalou a partir do lockfile                                                                     |
| `npm run setup:local` executado duas vezes                             | Criou configuração privada; segunda execução preservou o arquivo                                  |
| Migrações e seed repetidos                                             | Passaram sem duplicar dados demo                                                                  |
| `npm run typecheck`                                                    | Passou                                                                                            |
| `npm test` com PostgreSQL embarcado temporário                         | 34 testes executados e aprovados; zero ignorados                                                  |
| Mesma suíte com PostgreSQL 17 real, banco dedicado descartável         | 34 testes executados e aprovados; zero ignorados                                                  |
| Corrida entre dois processos e compradores diferentes em PostgreSQL 17 | Uma reserva, uma recusa por estoque insuficiente                                                  |
| `npm run build`                                                        | Compilação otimizada e checagem TypeScript aprovadas                                              |
| Chromium desktop                                                       | Login, carrinho, pedido, pagamento sandbox, abertura das seis cartas e persistência ao recarregar |
| Fluxo de compra/entrega                                                | Mensagem, postagem simulada, confirmação de entrega e avaliação vinculada à compra                |
| Formulários de vendedor/admin                                          | Criação de anúncio e cadastro de oferta externa inativa                                           |
| Chromium mobile 390 px                                                 | Sem overflow horizontal e sem erros JavaScript                                                    |
| Webhook HTTP com chave local privada | Sem assinatura: recusado; HMAC válido: pagamento confirmado; replay: idempotente |

Os testes cobrem comissão e arredondamento, estornos parciais e de frete, snapshots, idempotência de checkout e webhook, valor divergente, falha de pagamento, expiração, pagamento tardio, composição e insuficiência de boosters, resultados permanentes, aceite de preço/probabilidades, papéis, acesso a pedidos/mensagens/avaliações, privacidade de perfis, destinos de afiliados, uploads, verificação de e-mail e recuperação com invalidação das sessões.

O teste HTTP de webhook usa `npm run test:webhook`: assinatura HMAC do corpo exato, recusa sem assinatura, confirmação válida e repetição idempotente. Usa a chave local privada, sem imprimir seu valor.

Capturas e logs locais de validação ficam em `.data/checks/` (ignorados pelo Git). O contêiner PostgreSQL criado para a validação foi removido após os testes; a aplicação padrão utiliza o banco embarcado persistente.

Não foram validados pagamentos bancários, liquidação, split, KYC, antifraude de adquirente, transporte real, conversões de afiliados nem operação jurídica de boosters. Não houve publicação do ambiente nem teste de restauração em uma nova tarefa. As instruções de instalação e inicialização foram salvas no rascunho da configuração, que ainda exige revisão e publicação pelo produto.
