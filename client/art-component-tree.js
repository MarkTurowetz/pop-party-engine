(function attachPartyGameArtComponentTree(global) {
  "use strict";

  function flattenComponents(components = [], depth = 0, parent = null, output = []) {
    for (const component of components || []) {
      output.push({ component, depth, parent });
      flattenComponents(component.children || [], depth + 1, component, output);
    }
    return output;
  }

  function findComponent(components = [], componentId) {
    return flattenComponents(components).find(({ component }) => component.id === componentId) || null;
  }

  function collectionRef(components = [], componentId, parent = null) {
    if (!componentId) return null;
    for (const component of components || []) {
      if (component.id === componentId) return { parent, components };
      const childRef = collectionRef(component.children || [], componentId, component);
      if (childRef) return childRef;
    }
    return null;
  }

  function componentIds(components = []) {
    return new Set(flattenComponents(components).map(({ component }) => component.id));
  }

  const api = {
    collectionRef,
    componentIds,
    findComponent,
    flattenComponents
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.PartyGameArtComponentTree = api;
})(typeof window !== "undefined" ? window : globalThis);
