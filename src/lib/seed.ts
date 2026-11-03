import { hash } from "bcryptjs";
import { transaction, rows } from "./db";
import { seedRealCatalog, DEMO_PHOTO } from "./demo-catalog";
export async function seed() {
  if (process.env.APP_MODE === "production")
    throw new Error("Seed de demonstração proibido em produção");
  const password = await hash("NexoDemo2026!", 12);
  await transaction(async (db) => {
    for (const u of [
      ["demo-buyer", "colecionador@nexo.test", "Luca Martins", "user"],
      ["demo-seller", "loja@nexo.test", "Órbita Cards", "seller"],
      ["demo-seller2", "otaku@nexo.test", "Estação Otaku", "seller"],
      ["demo-admin", "admin@nexo.test", "Admin Demo", "admin"],
    ])
      await db.query(
        "INSERT INTO users(id,email,password_hash,name,role,verified,bio) VALUES($1,$2,$3,$4,$5,true,$6) ON CONFLICT(id) DO NOTHING",
        [
          u[0],
          u[1],
          password,
          u[2],
          u[3],
          "Perfil de demonstração. Nenhuma venda ou avaliação real.",
        ],
      );
    await db.query(
      "INSERT INTO addresses VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING",
      [
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
      ],
    );
    await seedRealCatalog(db);
    await db.query(
      "INSERT INTO affiliates(id,title,description,franchise,category,platform,external_seller,url,image,reference_price,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false) ON CONFLICT(id) DO NOTHING",
      [
        "affiliate-example",
        "Pasta para coleção",
        "Exemplo inativo: substitua por um link autorizado do programa de afiliados.",
        "Multiverso",
        "Acessório",
        "Shopee",
        "Exemplo não publicado",
        "https://shopee.com.br/",
        DEMO_PHOTO,
        null,
      ],
    );
  });
}
