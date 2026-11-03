# Publicar a demonstração

Este pacote publica somente a demonstração. Os pagamentos continuam simulados e a imagem recusa APP_MODE diferente de demo. O banco de demonstração começa com dados novos; `.env.local`, banco local, outbox de e-mails e histórico desta tarefa não entram na imagem.

## Render

O arquivo `render.yaml` define um serviço Docker e um PostgreSQL separado, ambos explicitamente no plano gratuito, sem disco ou banco pagos, healthcheck em `/api/health` e deploy automático desativado. O primeiro deploy é iniciado ao criar o serviço. Não adicione credenciais de pagamentos reais.

1. Entre em uma conta Render e conecte o repositório GitHub `andreluizsarosa-star/Siteanime`.
2. Crie um Blueprint a partir da branch `main`; revise o serviço `nexo-tcg-demo` e mantenha o plano gratuito.
3. Aguarde build, inicialização do banco demo e status saudável. O Render mostrará o endereço HTTPS real do serviço; esse endereço, depois de validado, é o link do site.
4. Entre em Minha conta e use Comprador, Vendedor ou Admin de demonstração.

`RENDER_EXTERNAL_URL` é usado automaticamente para links e origem pública. Cookies da hospedagem usam Secure. A chave do webhook é gerada pelo provedor e nunca vai ao navegador.

O PostgreSQL separado evita exceder a memória limitada do serviço web ao inicializar PostgreSQL embarcado. O banco gratuito do provedor tem limites e pode ter prazo de expiração; confira as condições apresentadas pelo Render antes de confirmar. Não habilite renovação ou plano pago sem aprovação. O serviço web gratuito também pode suspender por inatividade. A caixa local de e-mails é efêmera; os dados do marketplace ficam no PostgreSQL provisionado. Esta opção serve para experimentar, não para operar um marketplace real. Para uma operação duradoura, planeje PostgreSQL com retenção adequada, backups e armazenamento de fotos; não habilite serviços pagos sem autorização.

## Docker em outro provedor

```sh
docker build -t nexo-tcg-demo .
docker run --rm -p 3000:3000 -e APP_MODE=demo -e APP_URL=https://seu-endereco.example -e COOKIE_SECURE=true -e DATABASE_URL nexo-tcg-demo
```

O provedor deve fornecer o HTTPS e encaminhar o cabeçalho Host original. PORT é configurável. Use DATABASE_URL de um PostgreSQL dedicado à demonstração. Sem DATABASE_URL, o PostgreSQL embarcado admite uma única instância Node por diretório de dados, mas sua inicialização excedeu o limite de 512 MB no teste deste pacote; não use essa alternativa no plano gratuito de memória limitada. A inicialização executa migração e seed antes de iniciar Next.js; o servidor não compete com outro processo de banco.

Em ambiente Codex, a construção usa a CA da sessão sem copiá-la para camadas:

```sh
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t nexo-tcg-demo .
```

Sem a montagem, o Dockerfile usa a cadeia normal de confiança TLS do provedor. Não desative a verificação TLS. Testes locais devem usar somente banco e volume de demonstração descartáveis.

## Publicação exige autenticação de hospedagem

Autorizar o deploy no chat não conecta automaticamente uma conta Render, Railway ou outro provedor. Na ausência de uma conta conectada, a imagem e as instruções podem ser preparadas e testadas, mas não existe endereço público. Não confundir link de configuração do provedor com link do site.

## Verificação do pacote

A construção Docker passou. O teste confirmou ausência de `.env.local`, metadados Git e banco do ambiente na imagem. Os 34 testes de domínio passaram após o ajuste de cookies HTTPS. O fluxo de login, sessão, compra sandbox, atribuição de seis cartas, revelação e permanência do resultado passou dentro do contêiner, com serviço web limitado a 512 MB e PostgreSQL 17 separado. O teste sem PostgreSQL externo excedeu essa memória, por isso a configuração do Render provisiona o banco separado. Isso valida o pacote local; a publicação e o endereço externo ainda dependem do cadastro e da implantação no provedor.
