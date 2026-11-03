import { chromium } from "playwright-core";
const base = process.env.BROWSER_TEST_URL || "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "");
  await page.locator(".product-card").first().waitFor();
  await page.screenshot({
    path: ".data/checks/home-desktop.png",
    fullPage: true,
  });
  await page.goto(base + "/conta");
  await page.getByRole("button", { name: "Comprador", exact: true }).click();
  await page.getByRole("heading", { name: "Olá, Luca Martins." }).waitFor();
  await page.goto(base + "/boosters");
  await page.getByRole("button", { name: "Experimentar booster" }).click();
  await page.goto(base + "/carrinho");
  await page.locator('select[name="address"]').selectOption("demo-address");
  await page.locator('input[type="checkbox"]').check();
  await page
    .getByRole("button", { name: "Reservar e ir ao pagamento" })
    .click();
  await page
    .getByRole("button", { name: "Simular pagamento aprovado" })
    .waitFor();
  await page
    .getByRole("button", { name: "Simular pagamento aprovado" })
    .click();
  await page
    .getByRole("button", { name: "Pular animação e revelar todas" })
    .waitFor();
  await page
    .getByRole("button", { name: "Pular animação e revelar todas" })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".reveal-card.revealed").length === 6,
  );
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll(".reveal-card.revealed").length === 6,
  );
  console.log(
    "PASS: login, carrinho, pedido, aprovação sandbox, abertura de 6 cartas, persistência após recarregar",
  );
  await page.screenshot({
    path: ".data/checks/booster-open.png",
    fullPage: true,
  });
  const orderId = new URL(page.url()).pathname.split("/").pop();
  const detail = await (
    await page.request.get(base + "/api/orders/" + orderId)
  ).json();
  async function loginAs(email) {
    const res = await page.request.post(base + "/api/auth/login", {
      data: { email, password: "NexoDemo2026!" },
    });
    if (!res.ok()) throw new Error(await res.text());
  }
  async function post(path, data) {
    const res = await page.request.post(base + "/api/" + path, {
      data,
    });
    if (!res.ok()) throw new Error(await res.text());
    return res.json();
  }
  await post("messages", {
    orderId,
    body: "Mensagem de validação do fluxo completo.",
  });
  await loginAs("loja@nexo.test");
  for (const sub of detail.suborders)
    await post("shipments", {
      suborderId: sub.id,
      status: "shipped",
      tracking: "DEMO-SEM-ENVIO-REAL",
    });
  await loginAs("colecionador@nexo.test");
  await post("delivery", { orderId });
  await post("reviews", {
    orderId,
    sellerId: "demo-seller",
    rating: 5,
    body: "Avaliação fictícia de teste automatizado.",
  });
  console.log(
    "PASS: mensagem, postagem sandbox, confirmação de entrega e avaliação vinculada à compra",
  );
  await loginAs("loja@nexo.test");
  await page.goto(base + "/vender");
  await page
    .getByRole("button", { name: "Criar anúncio", exact: true })
    .click();
  await page
    .getByLabel("Título do anúncio")
    .fill("Anúncio de validação sandbox " + Date.now());
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("Anúncio fictício criado pelo teste de navegador.");
  await page.getByLabel("Preço em centavos").fill("1234");
  await page.locator('input[type="checkbox"]').check();
  await page
    .getByRole("button", { name: "Salvar anúncio", exact: true })
    .click();
  await page.getByText("Salvo com sucesso.", { exact: true }).waitFor();
  console.log("PASS: vendedor cria anúncio pelo formulário");
  await loginAs("admin@nexo.test");
  await page.goto(base + "/admin");
  await page.getByRole("button", { name: "Afiliados", exact: true }).click();
  await page
    .getByRole("heading", { name: "Cadastrar oferta autorizada" })
    .waitFor();
  const affiliateForm = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: "Cadastrar oferta autorizada" }),
  });
  await affiliateForm
    .getByLabel("Produto", { exact: true })
    .fill("Oferta de validação inativa " + Date.now());
  await affiliateForm.getByLabel("Franquia / personagem").fill("Nexo original");
  await affiliateForm
    .getByLabel("Categoria", { exact: true })
    .fill("Acessório");
  await affiliateForm
    .getByLabel("Descrição", { exact: true })
    .fill("Exemplo fictício de teste, sem oferta real.");
  await affiliateForm.getByLabel("Vendedor externo").fill("Demonstração");
  await affiliateForm
    .getByLabel("Link autorizado de afiliado")
    .fill("https://shopee.com.br/?af_id=demo");
  await affiliateForm
    .getByText("Confirmo autorização do link e da imagem.")
    .click();
  await affiliateForm
    .getByRole("button", { name: "Salvar oferta de afiliado" })
    .click();
  await affiliateForm
    .getByText("Salvo com sucesso.", { exact: true })
    .waitFor();
  console.log(
    "PASS: administração cadastra oferta externa inativa sem checkout interno",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "");
  await page.locator(".product-card").first().waitFor();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (overflow) throw new Error("Overflow horizontal mobile");
  await page.screenshot({
    path: ".data/checks/home-mobile.png",
    fullPage: true,
  });
  console.log("PASS: mobile 390px sem overflow");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("PASS: sem erros JavaScript no navegador");
} finally {
  await browser.close();
}
