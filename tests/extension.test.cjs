const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { test, before, after } = require("node:test");
const { chromium, firefox } = require("playwright");

const root = path.resolve(__dirname, "..");
const capturedFeed = fs.readFileSync(path.join(__dirname, "fixtures/vinted-feed-2026-10.html"), "utf8");
let browser;

before(async () => {
  const browserType = process.env.TEST_BROWSER === "firefox" ? firefox : chromium;
  browser = await browserType.launch({
    headless: true,
    executablePath: process.env.TEST_BROWSER_PATH || undefined,
  });
});

after(async () => {
  await browser?.close();
});

function item(price, size = "M") {
  return `<div class="feed-grid__item"><a title="Shirt ${size}"></a>
    <div class="new-item-box__description"><p>Brand</p><p>${size} · Good</p></div>
    <div class="ItemBoxPricing-price">${price} €</div></div>`;
}

async function fixture(t, {
  route = "favourite_list", header = true, heading = true,
  items = item(10) + item(100, "L"),
  feed = null,
} = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(2500);
  t.after(() => page.close());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://www.vinted.de/**", (request) => request.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<style>body { margin: 0; } .l-header { position: relative; z-index: 10; background: white; }</style>
      ${header ? '<header class="l-header">Vinted</header>' : ""}
      ${heading ? '<h1 class="web_ui__Text__text">Favorites</h1>' : ""}
      ${feed ?? `<main class="feed__feed-grid--compact">${items}</main>`}`,
  }));
  await page.goto(`https://www.vinted.de/${route}`);
  await page.evaluate(() => {
    window.chrome = { runtime: { onMessage: { addListener() {} } } };
  });
  await page.addStyleTag({ path: path.join(root, "style.css") });
  await page.addScriptTag({ path: path.join(root, "main.js") });
  // Let the existing 500 ms polling cycle settle before changing the page.
  await page.waitForTimeout(650);
  return { page, errors };
}

async function waitForControls(page) {
  await page.waitForFunction(() => !!document.getElementById("slider-min"), null, { timeout: 2500 });
}

test("restores removed controls with unchanged item count and preserves input state", async (t) => {
  const { page, errors } = await fixture(t);
  await waitForControls(page);
  await page.locator("#searchField").fill("Shirt");
  await page.locator("#size0").check();
  await page.evaluate(() => {
    window.savedSlider = document.getElementById("slider-min");
    document.getElementById("specialContainer").remove();
  });
  await page.waitForFunction(() => document.getElementById("slider-min") === window.savedSlider, null,
    { timeout: 2500 });
  assert.equal(await page.locator("#searchField").inputValue(), "Shirt");
  assert.equal(await page.locator("#size0").isChecked(), true);
  assert.deepEqual(errors, []);
});

test("mounts outside the header and survives its replacement", async (t) => {
  const { page, errors } = await fixture(t);
  await waitForControls(page);
  assert.equal(await page.locator(".l-header #specialContainer").count(), 0);
  await page.evaluate(() => {
    const replacement = document.createElement("header");
    replacement.className = "l-header";
    document.querySelector(".l-header").replaceWith(replacement);
  });
  await waitForControls(page);
  assert.equal(await page.locator("#specialContainer").count(), 1);
  assert.deepEqual(errors, []);
});

test("waits for a delayed header without throwing", async (t) => {
  const { page, errors } = await fixture(t, { header: false });
  await page.evaluate(() => {
    const header = document.createElement("header");
    header.className = "l-header";
    document.body.prepend(header);
  });
  await waitForControls(page);
  assert.deepEqual(errors, []);
});

test("refreshes filters when an equally sized grid replaces the old grid", async (t) => {
  const { page, errors } = await fixture(t);
  await waitForControls(page);
  await page.evaluate((markup) => {
    const grid = document.querySelector("main");
    const replacement = grid.cloneNode(false);
    replacement.innerHTML = markup;
    grid.replaceWith(replacement);
  }, item(20, "XL") + item(200, "XXL"));
  await page.waitForFunction(() => document.getElementById("slider-max").max === "200", null,
    { timeout: 2500 });
  assert.equal(await page.locator("#sizeContainer").innerText(), "XL\nXXL");
  assert.deepEqual(errors, []);
});

test("keeps slider nodes stable during ordinary page mutations", async (t) => {
  const { page, errors } = await fixture(t);
  await waitForControls(page);
  await page.evaluate(() => {
    window.savedSlider = document.getElementById("slider-min");
    const image = document.createElement("img");
    document.querySelector("main > div").append(image);
  });
  await page.waitForTimeout(650);
  assert.equal(await page.evaluate(() => document.getElementById("slider-min") === window.savedSlider), true);
  assert.deepEqual(errors, []);
});

test("handles navigation into and out of favorites", async (t) => {
  const { page, errors } = await fixture(t, { route: "catalog" });
  await page.evaluate(() => history.pushState({}, "", "/favourite_list"));
  await waitForControls(page);
  await page.evaluate(() => history.pushState({}, "", "/catalog"));
  await page.waitForFunction(() => !document.getElementById("specialContainer"), null, { timeout: 2500 });
  assert.deepEqual(errors, []);
});

test("both price handles respond to mouse dragging", async (t) => {
  const { page, errors } = await fixture(t);
  await waitForControls(page);
  for (const [id, direction] of [["slider-min", 1], ["slider-max", -1]]) {
    const input = page.locator(`#${id}`);
    const bounds = await input.boundingBox();
    const before = Number(await input.inputValue());
    const x = direction === 1 ? bounds.x + 10 : bounds.x + bounds.width - 10;
    const y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + direction * 60, y, { steps: 8 });
    await page.mouse.up();
    const after = Number(await input.inputValue());
    assert.ok(direction === 1 ? after > before : after < before, `${id}: ${before} -> ${after}`);
  }
  assert.deepEqual(errors, []);
});

test("website menus remain above the slider", async (t) => {
  const { page, errors } = await fixture(t);
  await waitForControls(page);
  const topElement = await page.evaluate(() => {
    const bounds = document.getElementById("slider-min").getBoundingClientRect();
    const menu = document.createElement("button");
    menu.id = "website-menu";
    menu.textContent = "Menu";
    Object.assign(menu.style, {
      position: "fixed", left: `${bounds.x}px`, top: `${bounds.y - 10}px`,
      width: "100px", height: "40px",
    });
    document.querySelector("header").append(menu);
    return document.elementFromPoint(bounds.x + 10, bounds.y + bounds.height / 2).id;
  });
  assert.equal(topElement, "website-menu");
  assert.deepEqual(errors, []);
});

test("newly loaded items retain the selected size and price range", async (t) => {
  const { page, errors } = await fixture(t);
  await waitForControls(page);
  const sizeCheckbox = page.locator('#sizeContainer input[value="M"]');
  assert.equal(await sizeCheckbox.count(), 1, await page.locator("#sizeContainer").innerText());
  await sizeCheckbox.check();
  await page.locator("#slider-max").evaluate((slider) => {
    slider.value = "50";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.evaluate((markup) => document.querySelector("main").insertAdjacentHTML("beforeend", markup),
    item(30) + item(150, "XL"));
  await page.waitForFunction(() => document.getElementById("slider-max").max === "150",
    null, { timeout: 2500 });
  assert.equal(await page.locator('#sizeContainer input[value="M"]').isChecked(), true);
  assert.equal(await page.locator("#slider-max").inputValue(), "50");
  const visibleTitles = await page.locator("main > div:visible a").evaluateAll((links) =>
    links.map((link) => link.title));
  assert.deepEqual(visibleTitles, ["Shirt M", "Shirt M"]);
  assert.deepEqual(errors, []);
});

test("analyzes prices and sizes filled into existing article placeholders", async (t) => {
  const { page, errors } = await fixture(t, {
    items: '<div class="feed-grid__item"></div><div class="feed-grid__item"></div>',
  });
  await page.evaluate((markup) => {
    const source = document.createElement("div");
    source.innerHTML = markup;
    // Hydration fills the same outer elements; neither their identity nor count changes.
    [...document.querySelector("main").children].forEach((card, index) => {
      card.innerHTML = source.children[index].innerHTML;
    });
  }, item(20) + item(150, "XL"));
  await page.waitForFunction(() => document.getElementById("slider-max").max === "150",
    null, { timeout: 2500 });
  assert.equal(await page.locator("#slider-min").inputValue(), "20");
  assert.equal(await page.locator('#sizeContainer input[value="M"]').count(), 1);
  assert.equal(await page.locator('#sizeContainer input[value="XL"]').count(), 1);
  assert.match(await page.locator("#itemCounter").innerText(), /^2\/2 Items/);
  assert.deepEqual(errors, []);
});

test("updates bounds and sizes when article text changes in place", async (t) => {
  const { page, errors } = await fixture(t);
  await page.evaluate(() => {
    const card = document.querySelector("main > div");
    card.querySelector(".ItemBoxPricing-price").firstChild.data = "250 €";
    card.querySelectorAll("p")[1].firstChild.data = "XXL · Good";
  });
  await page.waitForFunction(() => document.getElementById("slider-max").max === "250",
    null, { timeout: 2500 });
  assert.equal(await page.locator('#sizeContainer input[value="XXL"]').count(), 1);
  assert.deepEqual(errors, []);
});

test("shows and updates a counter independently of Vinted's heading", async (t) => {
  const { page, errors } = await fixture(t, { heading: false });
  assert.match(await page.locator("#itemCounter").innerText(), /^2\/2 Items/);
  await page.evaluate(() => {
    const heading = document.createElement("h1");
    heading.textContent = "Favorites";
    document.querySelector("main").before(heading);
  });
  await page.locator('#sizeContainer input[value="M"]').check();
  assert.match(await page.locator("#itemCounter").innerText(), /^1\/2 Items/);
  assert.equal(await page.locator("h1").innerText(), "Favorites");
  assert.deepEqual(errors, []);
});

test("reapplies active size, price and availability filters to reused cards", async (t) => {
  const { page, errors } = await fixture(t);
  await page.locator('#sizeContainer input[value="M"]').check();
  await page.locator("#slider-max").evaluate((slider) => {
    slider.value = "50";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.locator("#status0").check();
  await page.evaluate(() => {
    const cards = document.querySelector("main").children;
    cards[0].querySelectorAll("p")[1].textContent = "XL · Good";
    cards[1].querySelectorAll("p")[1].textContent = "M · Good";
    cards[1].querySelector("a").title = "Updated M shirt";
    cards[1].querySelector(".ItemBoxPricing-price").textContent = "40 €";
  });
  await page.waitForFunction(() => {
    const visible = [...document.querySelector("main").children].filter((card) => card.style.display !== "none");
    return visible.length === 1 && visible[0].querySelector("a").title === "Updated M shirt";
  }, null, { timeout: 2500 });
  assert.match(await page.locator("#itemCounter").innerText(), /^1\/2 Items/);
  await page.evaluate(() => document.querySelectorAll("main > div")[1]
    .querySelector("p").classList.add("web_ui__Cell__success"));
  await page.waitForFunction(() => document.getElementById("itemCounter").textContent.startsWith("0/2 Items"),
    null, { timeout: 2500 });
  assert.deepEqual(errors, []);
});

test("the active price predicate follows bounds after cards change", async (t) => {
  const { page, errors } = await fixture(t);
  await page.locator("#slider-max").evaluate((slider) => {
    slider.value = "50";
    slider.dispatchEvent(new Event("change", { bubbles: true }));
  });
  assert.match(await page.locator("#itemCounter").innerText(), /^1\/2 Items/);
  await page.evaluate(() => {
    document.querySelectorAll(".ItemBoxPricing-price")[1].textContent = "40 €";
  });
  await page.waitForFunction(() => document.getElementById("slider-max").max === "40",
    null, { timeout: 2500 });
  await page.locator("#slider-max").evaluate((slider) => {
    slider.value = "30";
    slider.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.evaluate((markup) => document.querySelector("main").insertAdjacentHTML("beforeend", markup),
    item(45));
  await page.waitForFunction(() => document.getElementById("slider-max").max === "45",
    null, { timeout: 2500 });
  assert.equal(await page.locator("#slider-max").inputValue(), "30");
  assert.match(await page.locator("#itemCounter").innerText(), /^1\/3 Items/);
  assert.deepEqual(errors, []);
});

test("the captured current Vinted feed supplies items, sizes and base prices", async (t) => {
  const { page, errors } = await fixture(t, { feed: capturedFeed });
  assert.match(await page.locator("#itemCounter").innerText(), /^2\/2 Items/);
  assert.equal(await page.locator("#slider-min").inputValue(), "3");
  assert.equal(await page.locator("#slider-max").inputValue(), "15");
  assert.deepEqual(await page.evaluate(() => Array.from(getItems(), getPriceOfItem)), [3, 15]);
  assert.deepEqual(await page.evaluate(() => Array.from(getItems(), getDescriptionOfItem)), ["S", "L"]);
  await page.locator('#sizeContainer input[value="S"]').check();
  assert.match(await page.locator("#itemCounter").innerText(), /^1\/2 Items/);
  assert.deepEqual(errors, []);
});

test("filters and sorts the captured Vinted cards without moving their inner wrappers", async (t) => {
  const { page, errors } = await fixture(t, { feed: capturedFeed });
  await page.locator("#sortButton").click();
  await page.locator("#sortButton").click();
  assert.deepEqual(await page.evaluate(() => Array.from(getItems(), getPriceOfItem)), [15, 3]);
  assert.equal(await page.locator('[data-testid="grid-item"]').count(), 2);
  assert.equal(await page.locator('[class*="feed-grid__item-content"]').count(), 2);
  await page.locator("#slider-max").evaluate((slider) => {
    slider.value = "5";
    slider.dispatchEvent(new Event("change", { bubbles: true }));
  });
  assert.match(await page.locator("#itemCounter").innerText(), /^1\/2 Items/);
  assert.deepEqual(errors, []);
});

test("current data markers survive different CSS module names", async (t) => {
  const { page, errors } = await fixture(t, { feed: capturedFeed
    .replaceAll("HmDNda_", "anotherHash__")
    .replaceAll("chuxWa_new-item-box__description", "new-description-styles")
    .replaceAll("xkFchG_new-item-box__title", "new-price-styles") });
  assert.match(await page.locator("#itemCounter").innerText(), /^2\/2 Items/);
  assert.equal(await page.locator("#slider-max").inputValue(), "15");
  assert.deepEqual(await page.evaluate(() => Array.from(getItems(), getDescriptionOfItem)), ["S", "L"]);
  assert.deepEqual(errors, []);
});

test("a current card without a size does not list its condition as a size", async (t) => {
  const { page, errors } = await fixture(t, { feed: capturedFeed
    .replace("S · Sehr gut", "Neu, ohne Etikett") });
  assert.equal(await page.locator('#sizeContainer input[value=""]').count(), 1);
  assert.equal(await page.locator('#sizeContainer input[value="Neu, ohne Etikett"]').count(), 0);
  assert.deepEqual(errors, []);
});
