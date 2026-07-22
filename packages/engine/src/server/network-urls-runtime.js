"use strict";

function createNetworkUrlsRuntime({ networkInterfaces, port }) {
  function getLanUrls() {
    const urls = [];
    for (const network of Object.values(networkInterfaces())) {
      for (const details of network || []) {
        if (details.family === "IPv4" && !details.internal) {
          urls.push(`http://${details.address}:${port}`);
        }
      }
    }
    return urls;
  }

  return { getLanUrls };
}

module.exports = { createNetworkUrlsRuntime };
