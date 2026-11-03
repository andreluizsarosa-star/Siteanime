import assert from "node:assert/strict";
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
  await page.goto(base);
  await page.locator(".product-card").first().waitFor();
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  const cards = nav.getByRole("button", { name: "Cartas TCG" });
  await cards.focus();
  await page.keyboard.press("Enter");
  assert.ok(await page.locator("#menu-cards").isVisible());
  await page.keyboard.press("Escape");
  assert.equal(await cards.getAttribute("aria-expanded"), "false");
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "nav-cards",
  );
  await cards.click();
  await page.locator("#menu-cards a").first().click();
  await page.waitForURL(/franchise=/);
  await page.locator(".product-card").first().waitFor();
  assert.equal(new URL(page.url()).searchParams.get("franchise"), "Pokémon");
  assert.equal(await page.locator("#menu-cards").count(), 0);
  await page
    .getByRole("searchbox", { name: "Buscar cartas e colecionáveis" })
    .count()
    .then(async (n) => {
      const input = n
        ? page.getByRole("searchbox", { name: "Buscar cartas e colecionáveis" })
        : page.getByRole("textbox", { name: "Buscar cartas e colecionáveis" });
      await input.fill("OP01-025");
      await input.press("Enter");
    });
  await page.waitForURL(/q=OP01-025/);
  await page.getByRole("link", { name: "Roronoa Zoro", exact: true }).waitFor();
  assert.equal(await page.locator(".product-card").count(), 1);
  await page.getByLabel("Idioma", { exact: true }).selectOption("Inglês");
  await page.waitForURL(/language=/);
  await page.locator(".product-card").first().waitFor();
  await page.getByLabel("Raridade", { exact: true }).selectOption("SR");
  await page.waitForURL(/rarity=SR/);
  await page.locator(".product-card").first().waitFor();
  assert.equal(await page.locator(".product-card").count(), 1);
  console.log(
    "PASS: menu desktop por teclado, Escape e retorno do foco; busca por código e filtros por versão.",
  );
  await page.goto(base);
  await page.locator(".product-card").first().waitFor();
  await page.getByRole("button", { name: "Até R$ 50", exact: true }).click();
  const prices = await page
    .locator(".product-card .product-bottom strong")
    .allTextContents();
  assert.ok(prices.length > 0);
  assert.ok(prices.every((text) => Number(text.replace(/\D/g, "")) <= 5000));
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "Overflow na largura " + width,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  assert.ok(await page.getByRole("dialog").isVisible());
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    assert.ok(
      await page.evaluate(() =>
        Boolean(document.activeElement?.closest("dialog")),
      ),
    );
  }
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () =>
      document
        .querySelector('[aria-controls="mobile-navigation"]')
        ?.getAttribute("aria-expanded") === "false" &&
      !document.querySelector("dialog[open]"),
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Abrir menu", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.locator(".drawer-game").filter({ hasText: "One Piece" }).click();
  await page.waitForURL(/franchise=One/);
  await page.locator(".product-card").first().waitFor();
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".product-card")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration),
    "0s",
  );
  console.log(
    "PASS: filtros rápidos, larguras 320–1440 px, menu mobile com foco contido, fechamento na navegação e movimento reduzido.",
  );
  assert.deepEqual(errors, []);
  console.log("PASS: nenhum erro JavaScript.");
  await page.goto(base);
  await page.locator(".product-card").first().waitFor();
  await page.screenshot({
    path: ".data/checks/redesign-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: ".data/checks/redesign-desktop.png",
    fullPage: true,
  });
} finally {
  await browser.close();
}
