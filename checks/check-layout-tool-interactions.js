"use strict";

const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const repoRoot = path.resolve(__dirname, "..");
const host = "127.0.0.1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function openPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function health(port) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host, port, path: "/api/health" }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.on("error", reject);
  });
}

async function waitForServer(port, child) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    if (child.exitCode !== null) throw new Error(`server exited with code ${child.exitCode}`);
    try {
      if (await health(port) === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("local server did not become ready");
}

async function positions(page, ids) {
  return page.locator(".layout-canvas-element").evaluateAll((elements, requestedIds) =>
    Object.fromEntries(elements
      .filter((element) => requestedIds.includes(element.dataset.layoutElement))
      .map((element) => [element.dataset.layoutElement, {
        left: Number(element.style.left.replace("px", "")),
        top: Number(element.style.top.replace("px", ""))
      }]))
  , ids);
}

async function main() {
  const port = await openPort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: repoRoot,
    env: { ...process.env, HOST: host, PORT: String(port), GAME_FLOW_STORAGE: "local", GITHUB_TOKEN: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let browser;
  try {
    await waitForServer(port, child);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    await page.goto(`http://${host}:${port}/layout`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-layout-object-id]").first().waitFor();

    assert(await page.locator("[draggable='true']").count() === 0, "Layout Tool still uses interruptible native HTML drag");
    assert(await page.locator("[data-layout-element-field='defaultAnimationState']").count() === 0, "Inspector should start empty");

    const ids = await page.locator("[data-layout-object-id]").evaluateAll((elements) =>
      elements.slice(0, 2).map((element) => element.dataset.layoutObjectId)
    );
    assert(ids.length === 2, "Layout fixture does not contain two draggable objects");
    await page.locator(`[data-layout-object-select='${ids[0]}']`).click();
    await page.locator(`[data-layout-object-select='${ids[1]}']`).click({ modifiers: ["ControlOrMeta"] });
    assert(await page.locator("[data-layout-element-count='2']").count() === 1, "multi-selection inspector did not open");
    assert(await page.locator("[data-layout-element-field='defaultAnimationState']").count() === 1, "Stage Initial State is not exposed");

    const before = await positions(page, ids);
    const anchor = await page.locator(`[data-layout-element='${ids[0]}']`).boundingBox();
    assert(anchor, "selected layout object has no canvas bounds");
    await page.mouse.move(anchor.x + anchor.width / 2, anchor.y + anchor.height / 2);
    await page.mouse.down();
    await page.mouse.move(anchor.x + anchor.width / 2 + 36, anchor.y + anchor.height / 2 + 24, { steps: 4 });
    await page.mouse.up();
    const dragged = await positions(page, ids);
    const firstDelta = { x: dragged[ids[0]].left - before[ids[0]].left, y: dragged[ids[0]].top - before[ids[0]].top };
    const secondDelta = { x: dragged[ids[1]].left - before[ids[1]].left, y: dragged[ids[1]].top - before[ids[1]].top };
    assert(Math.abs(firstDelta.x - secondDelta.x) < 0.01 && Math.abs(firstDelta.y - secondDelta.y) < 0.01,
      `group drag lost relative positions: ${JSON.stringify({ firstDelta, secondDelta })}`);

    const xInput = page.locator("[data-layout-element-field='x']");
    const xBefore = Number(await xInput.inputValue());
    await xInput.fill(String(xBefore + 10));
    await xInput.blur();
    const edited = await positions(page, ids);
    assert(Math.abs((edited[ids[0]].left - dragged[ids[0]].left) - 10) < 0.01, "group X edit did not move the primary object relatively");
    assert(Math.abs((edited[ids[1]].left - dragged[ids[1]].left) - 10) < 0.01, "group X edit did not move the peer object relatively");

    const handle = page.locator(`[data-layout-object-reorder='${ids[0]}']`);
    const handleBox = await handle.boundingBox();
    assert(handleBox, "reorder handle has no bounds");
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.mouse.up();
    assert(await page.locator("[data-layout-object-dragging='true']").count() === 0, "blur left Layout reorder capture active");
    await page.locator(`[data-layout-object-select='${ids[1]}']`).click();
    assert(await page.locator(`[data-layout-element-id='${ids[1]}']`).count() === 1, "Layout Tool became unselectable after interrupted reorder");

    const sourceHandle = page.locator(`[data-layout-object-reorder='${ids[0]}']`);
    const sourceBox = await sourceHandle.boundingBox();
    const targetBox = await page.locator(`[data-layout-object-id='${ids[1]}']`).boundingBox();
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height - 2, { steps: 5 });
    await page.mouse.up();
    const reordered = await page.locator("[data-layout-object-id]").evaluateAll((elements) =>
      elements.map((element) => element.dataset.layoutObjectId)
    );
    assert(reordered.indexOf(ids[0]) === reordered.indexOf(ids[1]) + 1, `pointer reorder failed: ${JSON.stringify(reordered)}`);

    await page.getByRole("button", { name: "Controller" }).click();
    await page.locator("[data-layout-group-select='reference-avatar-picker']").click();
    const controllerOrder = await page.locator("[data-layout-object-id]").evaluateAll((elements) =>
      elements.map((element) => element.dataset.layoutObjectId)
    );
    assert(controllerOrder[0] === "reference-avatar-done", `highest legacy zIndex was not imported at the top: ${JSON.stringify(controllerOrder)}`);
    assert(controllerOrder.at(-1) === "reference-avatar-picker-panel", `background panel was not imported at the bottom: ${JSON.stringify(controllerOrder)}`);
    const previewZ = await page.locator(".layout-canvas-element").evaluateAll((elements) =>
      elements.map((element) => Number(element.style.zIndex))
    );
    assert(previewZ.every((value, index) => index === 0 || value < previewZ[index - 1]), `Controller preview is not top-first: ${JSON.stringify(previewZ)}`);

    const controllerPage = await browser.newPage();
    await controllerPage.goto(`http://${host}:${port}/controller`, { waitUntil: "domcontentloaded" });
    await controllerPage.waitForFunction(() => document.querySelector("#stageCodeField")?.classList.contains("controller-layout-target"));
    const runtimeZ = await controllerPage.evaluate(() => {
      const element = (id, selector, zIndex) => ({
        id,
        name: id,
        selector,
        kind: "text",
        defaultAnimationState: "On",
        x: 195,
        y: 200,
        width: 330,
        height: 80,
        scale: 1,
        rotation: 0,
        zIndex
      });
      window.controllerLayouts = {
        canvas: { width: 390, height: 844 },
        global: { id: "global", name: "Global", elements: [] },
        layers: [],
        states: [{
          id: "join",
          name: "Join",
          elements: [
            element("back", "#stageCodeField", 0),
            element("front", "#playerNameField", 10)
          ]
        }]
      };
      window.applyControllerLayoutForPhase("join");
      return {
        back: Number(document.querySelector("#stageCodeField").style.zIndex),
        front: Number(document.querySelector("#playerNameField").style.zIndex)
      };
    });
    assert(runtimeZ.front > runtimeZ.back, `Controller runtime disagrees with top-first order: ${JSON.stringify(runtimeZ)}`);
    await controllerPage.close();

    console.log("Layout Tool interaction check passed.");
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null) child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
