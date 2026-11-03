# Publicar a demonstração

Este pacote publica somente a demonstração. Os pagamentos continuam simulados e a imagem recusa APP_MODE diferente de demo. O banco de demonstração começa com dados novos; `.env.local`, banco local, outbox de e-mails e histórico desta tarefa não entram na imagem.

## Render

O arquivo `render.yaml` define um serviço Docker no plano gratuito, sem disco ou banco pagos, healthcheck em `/api/health` e deploy automático desativado. O primeiro deploy é iniciado ao criar o serviço. Não adicione credenciais de pagamentos reais.

1. Entre em uma conta Render e conecte o repositório GitHub `andreluizsarosa-star/Siteanime`.
2. Crie um Blueprint a partir da branch `main`; revise o serviço `nexo-tcg-demo` e mantenha o plano gratuito.
3. Aguarde build, inicialização do banco demo e status saudável. O Render mostrará o endereço HTTPS real do serviço; esse endereço, depois de validado, é o link do site.
4. Entre em Minha conta e use Comprador, Vendedor ou Admin de demonstração.

`RENDER_EXTERNAL_URL` é usado automaticamente para links e origem pública. Cookies da hospedagem usam Secure. A chave do webhook é gerada pelo provedor e nunca vai ao navegador.

O disco do plano gratuito é efêmero: contas, compras, fotos e alterações de demonstração podem ser perdidas quando o serviço for recriado/reiniciado. O serviço gratuito também pode suspender por inatividade. Esta opção serve para experimentar, não para operar um marketplace real. Para preservar dados, planeje PostgreSQL externo dedicado e armazenamento de fotos; não habilite serviços pagos sem autorização.

## Docker em outro provedor

```sh
docker build -t nexo-tcg-demo .
docker run --rm -p 3000:3000 -e APP_MODE=demo -e APP_URL=https://seu-endereco.example -e COOKIE_SECURE=true nexo-tcg-demo
```

O provedor deve fornecer o HTTPS e encaminhar o cabeçalho Host original. PORT é configurável. Sem DATABASE_URL, o PostgreSQL embarcado admite uma única instância Node por diretório de dados. A inicialização executa migração e seed antes de iniciar Next.js; o servidor não compete com outro processo de banco.

Em ambiente Codex, a construção usa a CA da sessão sem copiá-la para camadas:

```sh
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t nexo-tcg-demo .
```

Sem a montagem, o Dockerfile usa a cadeia normal de confiança TLS do provedor. Não desative a verificação TLS. Testes locais devem usar somente banco e volume de demonstração descartáveis.

## Publicação exige autenticação de hospedagem

Autorizar o deploy no chat não conecta automaticamente uma conta Render, Railway ou outro provedor. Na ausência de uma conta conectada, a imagem e as instruções podem ser preparadas e testadas, mas não existe endereço público. Não confundir link de configuração do provedor com link do site.
