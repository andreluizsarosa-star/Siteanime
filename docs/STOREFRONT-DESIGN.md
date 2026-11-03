# Vitrine e navegação

## Direção visual

Azul-noite `#11152b` no cabeçalho e rodapé, violeta `#6842dd` para ações e superfícies claras `#f7f8fc` para leitura de cartas e preços. Fonte Inter Variable hospedada localmente pelo pacote @fontsource-variable/inter. Sem dependência de Google Fonts em tempo de execução.

O menu separa catálogo, cartas por universo, tipos de produto, colecionáveis, boosters, parceiros e área do vendedor. No desktop, usa disclosures com botões, estado expandido e Escape com retorno do foco. No celular, usa dialog nativo modal, foco contido, fechamento por Escape e pela navegação, além de bloqueio da rolagem do fundo.

A página inicial tem descoberta por universo e filtros rápidos. A busca encontra nome, coleção, código e franquia; filtros de idioma, acabamento e raridade preservam a comparação por edição e condição. Os preços atuais continuam demonstrativos.

## Referências de funcionamento e limite da pesquisa

O pedido indicou padrões de TCGplayer, Cardmarket, eBay, Mercari e CardTrader. Nesta revisão, foram tentadas consultas diretas a https://www.tcgplayer.com/, https://www.cardmarket.com/ e https://www.ligapokemon.com.br/. O proxy do ambiente recusou a conexão com HTTP 403 antes do destino. Portanto, esta entrega NÃO afirma ter inspecionado visualmente as versões atuais desses sites.

A direção usa os princípios funcionais já definidos no pedido: busca em destaque, navegação por jogo, edição e condição explícitas, ofertas comparáveis e acesso simples à área do vendedor. Layout, textos, componentes e identidade são próprios; não foram copiados assets dos concorrentes. Os domínios necessários à consulta foram adicionados apenas ao rascunho da política de rede, preservando o domínio do site. Isso não aplica permissões ao runtime sem revisão/salvamento/publicação do ambiente.

## Cartas existentes, não cartas inventadas

O catálogo de demonstração agora usa identidades existentes: Charizard 4/102, Blastoise 2/102, Bulbasaur 44/102 e Pikachu 58/102 (Base Set), Charizard ex 125/197 (Obsidian Flames), Roronoa Zoro OP01-025 e Nami OP01-016 (ROMANCE DAWN), Monkey.D.Luffy ST01-001 (Straw Hat Crew). Os nomes, edições e variantes são separados das ofertas simuladas.

Os metadados históricos de Pokémon foram conferidos nos arquivos públicos:

- https://github.com/PokemonTCG/pokemon-tcg-data/blob/master/cards/en/base1.json
- https://github.com/PokemonTCG/pokemon-tcg-data/blob/master/cards/en/sv3.json

O README atual dessa fonte informa descontinuação da API em 1º de março de 2027. Não foi criada integração de runtime dependente desse serviço legado: apenas uma seleção estática de fatos de catálogo. Não foram importadas imagens nem cotações dessa fonte. Os códigos de One Piece foram curados manualmente; a consulta à página oficial https://en.onepiece-cardgame.com/cardlist/ permanece pendente de acesso de rede.

As fotos devem vir dos vendedores ou de uma fonte com uso permitido. Sem isso, a UI mostra imagem neutra “Foto do exemplar” em vez de inventar uma carta ou presumir licença de scans encontrados online. A ilustração de fantasia inicialmente gerada foi descartada da implementação após a orientação do usuário; nenhum arquivo dela entra no repositório nem na imagem da aplicação.

## Atualização de dados e compatibilidade

A migração 003 acrescenta arquivamento ao catálogo. O seed tem uma etapa versionada e idempotente que arquiva os antigos exemplos inventados e encerra as ofertas de demonstração correspondentes, criando identidades novas para cartas reais. O booster antigo é pausado e um pacote personalizado de demonstração passa a utilizar as identidades reais do catálogo, sem se apresentar como produto oficial lacrado.

Não há exclusão de pedidos, preços comprados, snapshots, mensagens, resultados de abertura ou unidades já atribuídas. O deploy normal da imagem executa migração e seed antes de iniciar o servidor. O catálogo público e as opções de edição excluem identidades arquivadas.

## Validação

- 36 testes de domínio/HTTP: incluem busca por código, filtros por variante e migração idempotente sem alteração de snapshots de compras pagas.
- scripts/navigation-smoke.mjs: navegação desktop por teclado, menu móvel com foco contido, fechamento, filtros e larguras de 320 a 1440 px, sem overflow e com movimento reduzido.
- scripts/browser-smoke.mjs: fluxo completo existente de compra, booster, envio, avaliação, anúncio e administração. BROWSER_TEST_URL permite usar uma instância local com banco separado.

A hospedagem existente usa autoDeploy:false. Enviar o commit ao GitHub não comprova a atualização do endereço público; é necessário executar Manual Deploy da versão mais recente no Render, a menos que o proprietário tenha alterado essa configuração no painel.
