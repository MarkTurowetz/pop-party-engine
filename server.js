"use strict";

// Temporary deployment compatibility entry point. The running composition is
// owned by the reference application; generic games must not import it.
module.exports = require("./apps/reference/server");
