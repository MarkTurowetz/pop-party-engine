"use strict";

const crypto = require("crypto");

function cleanField(value, maxLength = 240) {
  return String(value || "").replace(/[\r\n\u0000-\u001f\u007f]+/g, " ").trim().slice(0, maxLength);
}

function createAdminAuditRuntime(options = {}) {
  const writer = options.writer || ((event) => console.info(JSON.stringify(event)));

  function requestId(req) {
    if (req.auditRequestId) return req.auditRequestId;
    const supplied = cleanField(req.headers?.["x-request-id"], 80);
    req.auditRequestId = /^[A-Za-z0-9._:-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID();
    return req.auditRequestId;
  }

  function record(req, fields = {}) {
    const event = Object.freeze({
      type: "pop-party-admin-audit",
      timestamp: new Date().toISOString(),
      requestId: requestId(req),
      actorId: cleanField(fields.actorId || req.adminActor?.id || "anonymous", 100),
      operation: cleanField(fields.operation, 100),
      outcome: cleanField(fields.outcome, 40),
      path: cleanField(fields.path || req.url, 300),
      expectedRevision: cleanField(fields.expectedRevision, 100),
      resultRevision: cleanField(fields.resultRevision, 100),
      errorCode: cleanField(fields.errorCode, 100)
    });
    writer(event);
    return event;
  }

  return Object.freeze({ record, requestId });
}

module.exports = { cleanField, createAdminAuditRuntime };
