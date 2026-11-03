# Pagamentos e integrações externas

## Implementado e testável

O adaptador ativo é o sandbox LOCAL, não o ambiente de homologação bancária de um provedor. Pix e cartão são escolhas simuladas, sem QR válido, dados de cartão ou movimentação financeira. O comprador pode aprovar/falhar seu próprio pedido pelo painel. Isto está explicitamente bloqueado em APP_MODE=production.

Webhook: POST /api/payments/webhook, Content-Type application/json e `x-nexo-signature` = HMAC-SHA256 hexadecimal do corpo bruto usando SANDBOX_WEBHOOK_SECRET (mínimo 24 caracteres). Corpo:

```json
{
  "eventId": "evento-unico",
  "orderId": "id-do-pedido",
  "amount": 5490,
  "status": "approved"
}
```

O total deve coincidir exatamente com o pedido. Assinatura ausente/incorreta é recusada. Evento duplicado com corpo diferente é recusado. A confirmação e a atribuição de estoque estão na mesma transação. Há teste de replay e de pagamento tardio. Conciliação administrativa compara os registros do simulador aos pedidos; não consulta banco ou adquirente real.

## Provedor brasileiro avaliado: Mercado Pago

Consulta feita em 03/11/2026 às fontes oficiais do SDK:

- https://github.com/mercadopago/sdk-nodejs
- https://github.com/mercadopago/sdk-nodejs/blob/master/src/clients/payment/create/types.ts
- https://github.com/mercadopago/sdk-nodejs/blob/master/README.md

Os tipos oficiais confirmam `application_fee` para comissão do marketplace, `external_reference` para conciliação, `notification_url`, método `pix`, token de cartão e a opção `idempotencyKey`. A página de documentação de split no domínio www.mercadopago.com.br retornou HTTP 403 neste ambiente. Não foi possível confirmar aqui todas as condições contratuais, regras atuais de split multivendedor, OAuth/recebedores e autorização de boosters. Por isso Mercado Pago é candidato, não uma integração real concluída ou selecionada definitivamente para operar dinheiro.

Não transformar uma taxa única em split multivendedor presumido. Antes de integrar, confirmar a modalidade aprovada e decidir pagamentos por subpedido ou um provedor com divisão entre vários recebedores no mesmo pagamento. O modelo interno já separa vendedor, frete e comissão por remessa.

## Requisitos concretos para dinheiro real

1. Definir provedor contratado e produto de marketplace aprovado; verificar documentação e suporte a Pix, tokenização de cartão, recebedores/KYC, split, chargebacks e reembolsos parciais.
2. Implementar o adaptador real: criação com idempotência, consulta autenticada ao provedor em cada webhook e conciliação agendada. A assinatura sandbox NÃO é assinatura Mercado Pago.
3. Guardar credenciais no servidor e tokens de recebedores de maneira criptografada; nunca expor documentos publicamente nem receber números de cartão na API da aplicação.
4. Homologar no sandbox OFICIAL: duplicatas, retries, falhas parciais de subpedidos, expiração, pagamentos tardios, retenções, tarifas e estornos confirmados remotamente. Um timeout não autoriza liberar uma reserva ainda cobrável.
5. Frete real (cotações, etiquetas e rastreio), notificações com SMTP autenticado, armazenamento de fotos com processamento e limites de resolução, backups/restauração e observabilidade.
6. Revisão jurídica, tributária, LGPD, termos de compra/venda, devoluções e moderação. Venda real de boosters exige viabilidade jurídica e aceitação expressa do provedor. Não há recompra automática nem promessa de retorno.

Contas de recebedores e extrato atuais são exclusivamente simulados. O aplicativo não faz custódia financeira própria.

## Afiliados

Cadastro manual para Shopee e Mercado Livre. Administrador deve possuir autorização do programa e imagem licenciada. Os exemplos estão inativos. A allowlist valida o destino inicial (incluindo shortlinks oficiais); não confirma que um redirecionamento encurtado contém uma oferta autorizada. O administrador deve conferir o destino final antes de publicar. Parâmetros de atribuição são preservados. Links usam sponsored/nofollow/noopener/noreferrer. Cliques não são conversões e não recebem comissão interna de 5%.
