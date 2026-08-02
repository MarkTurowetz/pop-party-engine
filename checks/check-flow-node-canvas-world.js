"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");

function within(value, min, max, message) {
  assert.ok(value >= min && value <= max, `${message}: ${value} not in [${min}, ${max}]`);
}

async function main() {
  const { createServer } = await import("vite");
  const server = await createServer({
    root,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: false }
  });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer?.address();
    assert.ok(address && typeof address === "object", "Vite test server did not bind a port");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(
      `http://127.0.0.1:${address.port}/checks/fixtures/flow-node-canvas-world.html`,
      { waitUntil: "networkidle" }
    );
    await page
      .locator('[data-wire-id="opening-deal-complete->draw-opening-card:no-match"]')
      .waitFor();

    const geometry = await page.evaluate(() => {
      const graph = document.querySelector("[data-node-zoom]");
      const svg = document.querySelector("[data-node-wires]");
      const wire = document.querySelector(
        '[data-wire-id="opening-deal-complete->draw-opening-card:no-match"]'
      );
      const path = wire?.querySelector("path");
      const label = wire?.querySelector("[data-wire-label-kind]");
      const minimapSvg = document.querySelector("[data-minimap-wires]");
      const minimapPath = document.querySelector(
        '[data-minimap-wire-id="opening-deal-complete->draw-opening-card:no-match"]'
      );
      const backwardIds = [
        "opening-deal-complete->draw-opening-card:no-match",
        "opening-deal-complete-2->draw-opening-card:no-match",
        "opening-deal-complete-3->draw-opening-card:no-match"
      ];
      const backwardWires = backwardIds.map((id) =>
        document.querySelector(`[data-wire-id="${id}"]`)
      );
      const backwardMinimapPaths = backwardIds.map((id) =>
        document.querySelector(`[data-minimap-wire-id="${id}"]`)
      );
      const destinationMarker = document.querySelector("#flow-wire-destination-arrow");
      if (!graph || !svg || !path || !label || !minimapSvg || !minimapPath) {
        throw new Error("Flow canvas geometry elements did not render");
      }
      if (
        backwardWires.some((wire) => !wire) ||
        backwardMinimapPaths.some((wire) => !wire) ||
        !destinationMarker
      ) {
        throw new Error("Backward corridor or destination-arrow elements did not render");
      }
      const pathBox = path.getBBox();
      const labelBox = label.getBBox();
      const minimapRect = minimapSvg.getBoundingClientRect();
      const minimapPathRect = minimapPath.getBoundingClientRect();
      return {
        zoom: Number(graph.getAttribute("data-node-zoom")),
        originX: Number(graph.getAttribute("data-world-origin-x")),
        originY: Number(graph.getAttribute("data-world-origin-y")),
        worldWidth: Number(graph.getAttribute("data-world-width")),
        worldHeight: Number(graph.getAttribute("data-world-height")),
        svgWidth: Number(svg.getAttribute("width")),
        svgHeight: Number(svg.getAttribute("height")),
        pathBox: { x: pathBox.x, y: pathBox.y, width: pathBox.width, height: pathBox.height },
        labelBox: {
          x: labelBox.x,
          y: labelBox.y,
          width: labelBox.width,
          height: labelBox.height
        },
        minimapWidth: Number(minimapSvg.getAttribute("width")),
        minimapHeight: Number(minimapSvg.getAttribute("height")),
        minimapPathBox: {
          x: minimapPathRect.left - minimapRect.left,
          y: minimapPathRect.top - minimapRect.top,
          width: minimapPathRect.width,
          height: minimapPathRect.height
        },
        backwardCorridorXs: backwardWires.map((wire) =>
          Number(wire.getAttribute("data-wire-corridor-x"))
        ),
        mainArrowMarkers: backwardWires.map(
          (wire) => wire.querySelector("path")?.getAttribute("marker-end") || ""
        ),
        minimapArrowMarkers: backwardMinimapPaths.map(
          (wire) => wire.getAttribute("marker-end") || ""
        ),
        destinationMarkerOrient: destinationMarker.getAttribute("orient")
      };
    });

    assert.equal(geometry.zoom, 1, "Flow canvas did not start at normal zoom");
    assert.ok(geometry.originX < 0, "browser fixture did not exercise origin normalization");
    assert.equal(geometry.svgWidth, geometry.worldWidth, "Wire SVG and world width diverged");
    assert.equal(geometry.svgHeight, geometry.worldHeight, "Wire SVG and world height diverged");
    within(geometry.pathBox.x, 0, geometry.worldWidth, "wire left edge escaped the world");
    within(
      geometry.pathBox.x + geometry.pathBox.width,
      0,
      geometry.worldWidth,
      "wire right edge escaped the world"
    );
    within(geometry.labelBox.x, 0, geometry.worldWidth, "wire label left edge escaped the world");
    within(
      geometry.labelBox.x + geometry.labelBox.width,
      0,
      geometry.worldWidth,
      "wire label right edge escaped the world"
    );
    within(geometry.labelBox.y, 0, geometry.worldHeight, "wire label top escaped the world");
    within(
      geometry.labelBox.y + geometry.labelBox.height,
      0,
      geometry.worldHeight,
      "wire label bottom escaped the world"
    );
    within(geometry.minimapPathBox.x, 0, geometry.minimapWidth, "minimap wire left edge clipped");
    within(
      geometry.minimapPathBox.x + geometry.minimapPathBox.width,
      0,
      geometry.minimapWidth,
      "minimap wire right edge clipped"
    );
    within(geometry.minimapPathBox.y, 0, geometry.minimapHeight, "minimap wire top clipped");
    within(
      geometry.minimapPathBox.y + geometry.minimapPathBox.height,
      0,
      geometry.minimapHeight,
      "minimap wire bottom clipped"
    );
    assert.ok(
      geometry.backwardCorridorXs[1] - geometry.backwardCorridorXs[0] >= 48 &&
        geometry.backwardCorridorXs[2] - geometry.backwardCorridorXs[1] >= 48,
      `backward corridors overlap: ${geometry.backwardCorridorXs.join(", ")}`
    );
    assert.equal(
      new Set(geometry.backwardCorridorXs).size,
      geometry.backwardCorridorXs.length,
      "backward routes reused a vertical corridor"
    );
    assert.ok(
      geometry.mainArrowMarkers.every((value) => value.includes("destination-arrow")),
      "main-canvas connections are missing destination arrows"
    );
    assert.ok(
      geometry.minimapArrowMarkers.every((value) => value.includes("destination-arrow")),
      "minimap connections are missing destination arrows"
    );
    assert.equal(
      geometry.destinationMarkerOrient,
      "auto",
      "destination arrow does not follow the connection direction"
    );

    async function navigateMinimapToLabel() {
      const target = await page.evaluate(() => {
        const graph = document.querySelector("[data-node-zoom]");
        const label = document.querySelector(
          '[data-wire-id="opening-deal-complete->draw-opening-card:no-match"] [data-wire-label-kind]'
        );
        const minimap = document.querySelector("[data-node-minimap]");
        if (!graph || !label || !minimap)
          throw new Error("Minimap navigation elements are missing");
        const labelBox = label.getBBox();
        const rect = minimap.getBoundingClientRect();
        const worldWidth = Number(graph.getAttribute("data-world-width"));
        const worldHeight = Number(graph.getAttribute("data-world-height"));
        const inset = 4;
        const scale = Math.min((300 - inset * 2) / worldWidth, (260 - inset * 2) / worldHeight);
        return {
          x: rect.left + inset + (labelBox.x + labelBox.width / 2) * scale,
          y: rect.top + inset + (labelBox.y + labelBox.height / 2) * scale,
          labelX: labelBox.x + labelBox.width / 2,
          labelY: labelBox.y + labelBox.height / 2
        };
      });
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(50);
      const viewport = await page.evaluate(() => {
        const stage = document.querySelector("[data-node-stage]");
        const graph = document.querySelector("[data-node-zoom]");
        if (!stage || !graph) throw new Error("Flow viewport is missing");
        const zoom = Number(graph.getAttribute("data-node-zoom"));
        return {
          zoom,
          left: stage.scrollLeft / zoom,
          top: stage.scrollTop / zoom,
          right: (stage.scrollLeft + stage.clientWidth) / zoom,
          bottom: (stage.scrollTop + stage.clientHeight) / zoom,
          scrollLeft: stage.scrollLeft,
          scrollTop: stage.scrollTop,
          clientWidth: stage.clientWidth,
          clientHeight: stage.clientHeight,
          scrollWidth: stage.scrollWidth,
          scrollHeight: stage.scrollHeight
        };
      });
      within(
        target.labelX,
        viewport.left,
        viewport.right,
        "minimap did not navigate horizontally to the wire"
      );
      within(
        target.labelY,
        viewport.top,
        viewport.bottom,
        "minimap did not navigate vertically to the wire"
      );
      const expectedTop = Math.max(
        0,
        Math.min(
          target.labelY * viewport.zoom - viewport.clientHeight / 2,
          viewport.scrollHeight - viewport.clientHeight
        )
      );
      assert.ok(
        Math.abs(viewport.scrollTop - expectedTop) < 3,
        `minimap vertical navigation landed at ${viewport.scrollTop}, expected ${expectedTop}`
      );
      return viewport;
    }

    const normalViewport = await navigateMinimapToLabel();
    assert.equal(normalViewport.zoom, 1, "normal-zoom minimap navigation changed zoom");

    const stage = page.locator("[data-node-stage]");
    await stage.hover({ position: { x: 120, y: 120 } });
    for (let index = 0; index < 20; index += 1) await page.mouse.wheel(0, 100);
    await page.waitForTimeout(100);
    const minimumViewport = await navigateMinimapToLabel();
    assert.equal(minimumViewport.zoom, 0.2, "Flow canvas did not reach minimum zoom");

    await page.evaluate(() => {
      const stage = document.querySelector("[data-node-stage]");
      if (stage) {
        stage.scrollLeft = 0;
        stage.scrollTop = 0;
      }
    });
    await page.locator('[data-node-id="connect-source"]').click();
    assert.equal(
      await page
        .locator('[data-wire-id="connect-source->connect-target"]')
        .getAttribute("data-wire-highlighted"),
      "true",
      "wire selection/highlighting regressed"
    );

    // Return to normal zoom before pointer interactions so authored deltas are exact.
    await stage.hover({ position: { x: 120, y: 120 } });
    for (let index = 0; index < 20; index += 1) await page.mouse.wheel(0, -100);
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const stage = document.querySelector("[data-node-stage]");
      if (stage) {
        stage.scrollLeft = 0;
        stage.scrollTop = 0;
      }
    });
    const source = page.locator('[data-node-id="connect-source"]');
    const sourceBox = await source.boundingBox();
    assert.ok(sourceBox, "connect source node is not visible for drag verification");
    await page.mouse.move(sourceBox.x + 40, sourceBox.y + 40);
    await page.mouse.down();
    await page.mouse.move(sourceBox.x + 80, sourceBox.y + 70, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(50);
    assert.deepEqual(
      await page.evaluate(() => window.flowCanvasTest.lastMove),
      { id: "connect-source", x: 220, y: 210 },
      "node dragging did not preserve authored coordinates"
    );

    const portBox = await page.locator('[data-port-id="connect-source-next"]').boundingBox();
    const targetBox = await page.locator('[data-node-id="connect-target"]').boundingBox();
    assert.ok(portBox && targetBox, "connection creation controls are not visible");
    await page.mouse.move(portBox.x + portBox.width / 2, portBox.y + portBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
      steps: 4
    });
    await page.mouse.up();
    assert.equal(
      await page.evaluate(() => window.flowCanvasTest.lastConnect),
      "connect-source-next->connect-target",
      "connection creation regressed"
    );

    await page.locator("[data-node-optimize]").click();
    assert.equal(
      await page.evaluate(() => window.flowCanvasTest.optimizeCount),
      1,
      "Optimize callback regressed"
    );
    assert.deepEqual(pageErrors, [], `browser emitted errors: ${pageErrors.join("; ")}`);
    console.log("Flow node canvas world browser regression passed.");
  } finally {
    await browser?.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error("Flow node canvas world browser regression failed:");
  console.error(error);
  process.exitCode = 1;
});
