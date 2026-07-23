"use strict";

// Temporary deployment compatibility entry point. The running composition is
// owned by the reference application; generic games must not import it.
const { startReferenceApplication } = require("./apps/reference/server");

const startup = startReferenceApplication().catch((error) => {
  const port = Number(process.env.PORT || 3000);
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Try PORT=${port + 1} npm start`);
    process.exit(1);
  }
  console.error(`Authoritative game content failed to initialize: ${error.message}`);
  process.exit(1);
});

module.exports = Object.freeze({ startReferenceApplication, startup });
