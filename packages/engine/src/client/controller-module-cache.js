"use strict";

function createControllerModuleCache() {
  const modules = new Map();
  return Object.freeze({
    get(key, factory) {
      if (!modules.has(key)) modules.set(key, factory());
      return modules.get(key);
    }
  });
}

module.exports = Object.freeze({ createControllerModuleCache });
