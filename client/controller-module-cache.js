(function () {
  "use strict";

  function createControllerModuleCache() {
    const modules = new Map();
    return {
      get(key, factory) {
        if (!modules.has(key)) modules.set(key, factory());
        return modules.get(key);
      }
    };
  }

  window.createControllerModuleCache = createControllerModuleCache;
})();
