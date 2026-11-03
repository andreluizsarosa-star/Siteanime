import { hash } from "bcryptjs";
import { transaction, rows } from "./db";
export async function seed() {
  if (process.env.APP_MODE === "production")
    throw new Error("Seed de demonstração proibido em produção");
  const password = await hash("NexoDemo2026!", 12);
  await transaction(async (db) => {
    if ((await rows(db, "SELECT id FROM users WHERE id='demo-buyer'")).length)
      return;
    for (const u of [
      ["demo-buyer", "colecionador@nexo.test", "Luca Martins", "user"],
      ["demo-seller", "loja@nexo.test", "Órbita Cards", "seller"],
      ["demo-seller2", "otaku@nexo.test", "Estação Otaku", "seller"],
      ["demo-admin", "admin@nexo.test", "Admin Demo", "admin"],
    ])
      await db.query(
        "INSERT INTO users(id,email,password_hash,name,role,verified,bio) VALUES($1,$2,$3,$4,$5,true,$6)",
        [
          u[0],
          u[1],
          password,
          u[2],
          u[3],
          "Perfil de demonstração. Nenhuma venda ou avaliação real.",
        ],
      );
    await db.query("INSERT INTO addresses VALUES($1,$2,$3,$4)", [
      "demo-address",
      "demo-buyer",
      "Casa · demonstração",
      JSON.stringify({
        recipient: "Luca Martins",
        street: "Rua Exemplo",
        number: "100",
        city: "São Paulo",
        state: "SP",
        zip: "01001000",
      }),
    ]);
    const cards = [
      [
        "aurora",
        "Dragão da Aurora",
        "Pokémon",
        "Carta avulsa",
        "Horizontes Originais",
        "NX-001",
        "Rara secreta",
        "Holográfico",
        28990,
        4,
        "NM",
      ],
      [
        "samurai",
        "Samurai do Amanhecer",
        "One Piece",
        "Carta avulsa",
        "Mares Distantes",
        "NX-002",
        "Super rara",
        "Foil",
        12990,
        8,
        "NM",
      ],
      [
        "kitsune",
        "Espírito Kitsune",
        "Naruto",
        "Carta avulsa",
        "Lendas da Névoa",
        "NX-003",
        "Rara",
        "Foil",
        7990,
        6,
        "NM",
      ],
      [
        "eclipse",
        "Feiticeira do Eclipse",
        "Yu-Gi-Oh!",
        "Carta avulsa",
        "Círculo Astral",
        "NX-004",
        "Ultra rara",
        "Holográfico",
        18990,
        3,
        "LP",
      ],
      [
        "mecha",
        "Guardião Mecha",
        "Dragon Ball",
        "Figure",
        "Oficina Nexo",
        "NX-005",
        "Colecionável",
        "Fosco",
        24990,
        2,
        "Novo",
      ],
      [
        "forest",
        "Sentinela da Floresta",
        "Pokémon",
        "Carta avulsa",
        "Horizontes Originais",
        "NX-006",
        "Comum",
        "Normal",
        1290,
        30,
        "NM",
      ],
      [
        "moon",
        "Viajante Lunar",
        "One Piece",
        "Carta avulsa",
        "Mares Distantes",
        "NX-007",
        "Comum",
        "Normal",
        1990,
        30,
        "NM",
      ],
      [
        "sakura",
        "Sakura Celestial",
        "Naruto",
        "Carta avulsa",
        "Lendas da Névoa",
        "NX-008",
        "Incomum",
        "Normal",
        2990,
        20,
        "NM",
      ],
    ];
    for (const [
      slug,
      name,
      franchise,
      type,
      collection,
      code,
      rarity,
      finish,
      price,
      stock,
      condition,
    ] of cards) {
      await db.query("INSERT INTO cards VALUES($1,$2,$3,$4)", [
        slug,
        franchise,
        name,
        type,
      ]);
      await db.query("INSERT INTO editions VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [
        slug + "-pt",
        slug,
        collection,
        code,
        rarity,
        "Português",
        finish,
        `/art/${slug}.svg`,
      ]);
      await db.query(
        "INSERT INTO listings(id,seller_id,edition_id,title,description,condition,price,stock,photos) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          slug + "-listing",
          slug === "mecha" ? "demo-seller2" : "demo-seller",
          slug + "-pt",
          name,
          "Item fictício para testar o marketplace. Ilustração original Nexo; não representa uma carta oficial ou produto à venda.",
          condition,
          price,
          stock,
          JSON.stringify([`/art/${slug}.svg`]),
        ],
      );
    }
    await db.query(
      "INSERT INTO listings(id,seller_id,edition_id,title,description,condition,price,stock,photos) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        "aurora-second",
        "demo-seller2",
        "aurora-pt",
        "Dragão da Aurora",
        "Oferta comparável fictícia da mesma edição e condição.",
        "NM",
        30990,
        2,
        JSON.stringify(["/art/aurora.svg"]),
      ],
    );
    await db.query(
      "INSERT INTO campaigns(id,seller_id,title,description,price,rules,status) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        "cosmos",
        "demo-seller",
        "Booster Cosmos",
        "6 cartas físicas fictícias: 5 comuns + 1 rara. Exclusivamente demonstração; sem cobrança ou envio real.",
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
        "INSERT INTO physical_cards(id,campaign_id,edition_id,group_name,condition,photo,declared_value) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          `physical-${i}`,
          "cosmos",
          i < 40 ? (i % 2 ? "forest-pt" : "moon-pt") : "kitsune-pt",
          i < 40 ? "comum" : "rara",
          "NM",
          i < 40 ? `/art/${i % 2 ? "forest" : "moon"}.svg` : "/art/kitsune.svg",
          i < 40 ? 1000 : 5000,
        ],
      );
    await db.query(
      "INSERT INTO affiliates(id,title,description,franchise,category,platform,external_seller,url,image,reference_price,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false)",
      [
        "affiliate-example",
        "Pasta para coleção",
        "Exemplo inativo: substitua por um link autorizado do programa de afiliados.",
        "Multiverso",
        "Acessório",
        "Shopee",
        "Exemplo não publicado",
        "https://shopee.com.br/",
        "/art/sakura.svg",
        null,
      ],
    );
  });
}
