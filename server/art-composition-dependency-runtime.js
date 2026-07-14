"use strict";

const crypto = require("crypto");

function cleanId(value) {
  return String(value || "").trim();
}

function compositionRevision(composition) {
  return crypto.createHash("sha256").update(JSON.stringify(composition || {})).digest("hex");
}

function createEmptySummary(composition) {
  return {
    compositionId: composition.id,
    total: 0,
    artReferences: 0,
    stageLayoutReferences: 0,
    controllerLayoutReferences: 0,
    flowReferences: 0,
    runtimeReferences: 0,
    details: []
  };
}

function createArtCompositionDependencyReport({
  compositions = [],
  controllerLayouts = null,
  flow = null,
  runtimeReferences = [],
  stageLayouts = null
} = {}) {
  const summaries = new Map((compositions || []).map((composition) => [composition.id, createEmptySummary(composition)]));
  const revisions = Object.fromEntries((compositions || []).map((composition) => [composition.id, compositionRevision(composition)]));

  function add(compositionId, kind, detail = {}) {
    const summary = summaries.get(cleanId(compositionId));
    if (!summary) return;
    const field = {
      art: "artReferences",
      stageLayout: "stageLayoutReferences",
      controllerLayout: "controllerLayoutReferences",
      flow: "flowReferences",
      runtime: "runtimeReferences"
    }[kind];
    if (!field) return;
    summary[field] += 1;
    summary.total += 1;
    summary.details.push({ kind, ...detail });
  }

  function visitArtComponents(components, sourceComposition, path = []) {
    for (const component of components || []) {
      const nextPath = [...path, cleanId(component.instanceLabel || component.name || component.id)].filter(Boolean);
      if (component.kind === "reference" && component.artCompositionId) {
        add(component.artCompositionId, "art", {
          sourceCompositionId: sourceComposition.id,
          sourceName: sourceComposition.name,
          sourcePath: nextPath.join(" / ")
        });
      }
      visitArtComponents(component.children, sourceComposition, nextPath);
    }
  }

  for (const composition of compositions || []) visitArtComponents(composition.components, composition);

  function visitLayouts(layouts, kind) {
    const states = [layouts?.global, ...(layouts?.states || [])].filter(Boolean);
    for (const state of states) {
      for (const element of state.elements || []) {
        if (!element.artCompositionId) continue;
        add(element.artCompositionId, kind, {
          sourceId: cleanId(state.id),
          sourceName: cleanId(state.name || state.id),
          sourcePath: cleanId(element.name || element.id)
        });
      }
    }
  }

  visitLayouts(stageLayouts, "stageLayout");
  visitLayouts(controllerLayouts, "controllerLayout");

  function visitFlow(value, path = []) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visitFlow(item, [...path, String(index)]));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const nextPath = [...path, key];
      if ((key === "artCompositionId" || key.endsWith("CompositionId")) && typeof child === "string") {
        add(child, "flow", { sourcePath: nextPath.join(" / ") });
      }
      visitFlow(child, nextPath);
    }
  }

  visitFlow(flow);

  for (const reference of runtimeReferences || []) {
    add(reference.compositionId, "runtime", {
      sourceId: cleanId(reference.sourceId),
      sourceName: cleanId(reference.sourceName || reference.sourceId),
      sourcePath: cleanId(reference.sourcePath)
    });
  }

  return {
    dependencies: Object.fromEntries(summaries),
    compositionRevisions: revisions
  };
}

module.exports = { compositionRevision, createArtCompositionDependencyReport };
