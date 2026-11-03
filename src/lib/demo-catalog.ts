import { rows, type DB } from "./db";
import { audit } from "./core";
export const DEMO_PHOTO = "/art/card-photo-pending.svg";
export const DEMO_CAMPAIGN = "pokemon-starter-demo";
// Catalog identity is real. Prices, sellers and units below are demo offers, NOT quotations.
export const demoCards = [
  {
    id: "pkmn-base1-4",
    listingId: "demo-charizard-base",
    name: "Charizard",
    franchise: "Pokémon",
    collection: "Base Set",
    code: "4/102",
    rarity: "Rare Holo",
    language: "Inglês",
    finish: "Holo",
    price: 28990,
    stock: 4,
    condition: "NM",
    seller: "demo-seller",
    source:
      "https://github.com/PokemonTCG/pokemon-tcg-data/blob/master/cards/en/base1.json",
  },
  {
    id: "op-op01-025",
    listingId: "demo-zoro-op01",
    name: "Roronoa Zoro",
    franchise: "One Piece",
    collection: "ROMANCE DAWN [OP-01]",
    code: "OP01-025",
    rarity: "SR",
    language: "Inglês",
    finish: "Arte padrão",
    price: 12990,
    stock: 8,
    condition: "NM",
    seller: "demo-seller",
    source: "https://en.onepiece-cardgame.com/cardlist/",
  },
  {
    id: "pkmn-sv3-125",
    listingId: "demo-charizard-ex-125",
    name: "Charizard ex",
    franchise: "Pokémon",
    collection: "Obsidian Flames",
    code: "125/197",
    rarity: "Double Rare",
    language: "Inglês",
    finish: "Holo",
    price: 7990,
    stock: 6,
    condition: "NM",
    seller: "demo-seller",
    source:
      "https://github.com/PokemonTCG/pokemon-tcg-data/blob/master/cards/en/sv3.json",
  },
  {
    id: "pkmn-base1-2",
    listingId: "demo-blastoise-base",
    name: "Blastoise",
    franchise: "Pokémon",
    collection: "Base Set",
    code: "2/102",
    rarity: "Rare Holo",
    language: "Inglês",
    finish: "Holo",
    price: 18990,
    stock: 3,
    condition: "LP",
    seller: "demo-seller",
    source:
      "https://github.com/PokemonTCG/pokemon-tcg-data/blob/master/cards/en/base1.json",
  },
  {
    id: "op-st01-001",
    listingId: "demo-luffy-st01",
    name: "Monkey.D.Luffy",
    franchise: "One Piece",
    collection: "Straw Hat Crew [ST-01]",
    code: "ST01-001",
    rarity: "L",
    language: "Inglês",
    finish: "Arte padrão",
    price: 24990,
    stock: 2,
    condition: "NM",
    seller: "demo-seller2",
    source: "https://en.onepiece-cardgame.com/cardlist/",
  },
  {
    id: "pkmn-base1-44",
    listingId: "demo-bulbasaur-base",
    name: "Bulbasaur",
    franchise: "Pokémon",
    collection: "Base Set",
    code: "44/102",
    rarity: "Common",
    language: "Inglês",
    finish: "Normal",
    price: 1290,
    stock: 30,
    condition: "NM",
    seller: "demo-seller",
    source:
      "https://github.com/PokemonTCG/pokemon-tcg-data/blob/master/cards/en/base1.json",
  },
  {
    id: "pkmn-base1-58",
    listingId: "demo-pikachu-base",
    name: "Pikachu",
    franchise: "Pokémon",
    collection: "Base Set",
    code: "58/102",
    rarity: "Common",
    language: "Inglês",
    finish: "Normal",
    price: 1990,
    stock: 30,
    condition: "NM",
    seller: "demo-seller",
    source:
      "https://github.com/PokemonTCG/pokemon-tcg-data/blob/master/cards/en/base1.json",
  },
  {
    id: "op-op01-016",
    listingId: "demo-nami-op01",
    name: "Nami",
    franchise: "One Piece",
    collection: "ROMANCE DAWN [OP-01]",
    code: "OP01-016",
    rarity: "R",
    language: "Inglês",
    finish: "Arte padrão",
    price: 2990,
    stock: 20,
    condition: "NM",
    seller: "demo-seller",
    source: "https://en.onepiece-cardgame.com/cardlist/",
  },
];
export async function seedRealCatalog(db: DB) {
  if (
    (
      await rows(
        db,
        "SELECT id FROM audit WHERE action='demo.catalog.real.v1' LIMIT 1",
      )
    ).length
  )
    return;
  const legacy = [
    "aurora",
    "samurai",
    "kitsune",
    "eclipse",
    "mecha",
    "forest",
    "moon",
    "sakura",
  ];
  await db.query("UPDATE cards SET archived=true WHERE id=ANY($1::text[])", [
    legacy,
  ]);
  await db.query(
    "UPDATE listings SET status='closed' WHERE demo AND edition_id IN (SELECT id FROM editions WHERE card_id=ANY($1::text[]))",
    [legacy],
  );
  await db.query(
    "UPDATE campaigns SET status='paused' WHERE id='cosmos' AND demo",
  );
  for (const card of demoCards) {
    await db.query(
      "INSERT INTO cards(id,franchise,name,product_type) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
      [card.id, card.franchise, card.name, "Carta avulsa"],
    );
    await db.query(
      "INSERT INTO editions(id,card_id,collection,code,rarity,language,finish,art) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING",
      [
        card.id + "-en",
        card.id,
        card.collection,
        card.code,
        card.rarity,
        card.language,
        card.finish,
        DEMO_PHOTO,
      ],
    );
    await db.query(
      "INSERT INTO listings(id,seller_id,edition_id,title,description,condition,price,stock,photos) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING",
      [
        card.listingId,
        card.seller,
        card.id + "-en",
        card.name,
        "Carta existente: " +
          card.collection +
          " · " +
          card.code +
          ". Oferta de demonstração; preço e quantidade simulados, sem cotação de mercado ou envio real. A foto do exemplar deve ser fornecida pelo vendedor.",
        card.condition,
        card.price,
        card.stock,
        JSON.stringify([DEMO_PHOTO]),
      ],
    );
  }
  await db.query(
    "INSERT INTO listings(id,seller_id,edition_id,title,description,condition,price,stock,photos) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING",
    [
      "demo-charizard-second",
      "demo-seller2",
      "pkmn-base1-4-en",
      "Charizard",
      "Oferta de demonstração da mesma edição, idioma e condição. Sem cotação ou venda real.",
      "NM",
      30990,
      2,
      JSON.stringify([DEMO_PHOTO]),
    ],
  );
  await db.query(
    "INSERT INTO campaigns(id,seller_id,title,description,price,rules,status) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING",
    [
      DEMO_CAMPAIGN,
      "demo-seller",
      "Booster Pokémon — demonstração",
      "Pacote personalizado de vendedor com 6 cartas existentes do catálogo: 5 comuns + 1 do grupo raro. Não é um booster oficial lacrado. Compra, estoque e envio são simulados.",
      3990,
      JSON.stringify([
        { group: "comum", count: 5 },
        { group: "rara", count: 1 },
      ]),
      "active",
    ],
  );
  for (let i = 0; i < 48; i++)
    await db.query(
      "INSERT INTO physical_cards(id,campaign_id,edition_id,group_name,condition,photo,declared_value) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING",
      [
        "real-demo-unit-" + i,
        DEMO_CAMPAIGN,
        i < 40
          ? i % 2
            ? "pkmn-base1-44-en"
            : "pkmn-base1-58-en"
          : "pkmn-sv3-125-en",
        i < 40 ? "comum" : "rara",
        "NM",
        DEMO_PHOTO,
        i < 40 ? 1000 : 5000,
      ],
    );
  await audit(db, null, "demo.catalog.real.v1", "catalog", {
    sources: [...new Set(demoCards.map((c) => c.source))],
    photos: "seller upload pending; no third-party artwork imported",
    legacy: "archived; paid order snapshots and allocations preserved",
  });
}
