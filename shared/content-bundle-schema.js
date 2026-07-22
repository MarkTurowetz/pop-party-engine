"use strict";
// Dual-use content bundle schema. Built to content-bundle-schema.js for the
// plain Node server and exposed as PartyGameContentBundleSchema in browsers.
(function (root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports)
        module.exports = api;
    else
        root.PartyGameContentBundleSchema = api;
})((typeof globalThis !== "undefined" ? globalThis : window), function () {
    "use strict";
    const CONTENT_BUNDLE_SCHEMA_VERSION = 1;
    const CONTENT_BUNDLE_MANIFEST_PATH = "content-bundle.json";
    const REQUIRED_CONTENT_PATHS = Object.freeze([
        "flow.json",
        "constants.json",
        "layouts/stage.json",
        "layouts/controller.json",
        "audio/host-audios.json",
        "art/manifest.json",
        "prompts/prompts.json",
        "semantic-roles.json"
    ]);
    const SHA256_PATTERN = /^[a-f0-9]{64}$/;
    const GAME_ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;
    function normalizeBundlePath(value) {
        const normalized = String(value || "").normalize("NFC").replace(/\\/g, "/").replace(/^\.\//, "");
        if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) {
            throw new Error(`Unsafe bundle path: ${String(value || "")}`);
        }
        const parts = normalized.split("/");
        if (parts.some((part) => !part || part === "." || part === ".." || /[\u0000-\u001f\u007f]/.test(part))) {
            throw new Error(`Unsafe bundle path: ${String(value || "")}`);
        }
        return parts.join("/");
    }
    function canonicalizeJson(value) {
        function canonical(valueAtPath, logicalPath) {
            if (valueAtPath === null)
                return "null";
            if (typeof valueAtPath === "string" || typeof valueAtPath === "boolean")
                return JSON.stringify(valueAtPath);
            if (typeof valueAtPath === "number") {
                if (!Number.isFinite(valueAtPath))
                    throw new Error(`Non-finite number at ${logicalPath}`);
                return JSON.stringify(Object.is(valueAtPath, -0) ? 0 : valueAtPath);
            }
            if (Array.isArray(valueAtPath)) {
                return `[${valueAtPath.map((item, index) => canonical(item, `${logicalPath}[${index}]`)).join(",")}]`;
            }
            if (typeof valueAtPath === "object") {
                const record = valueAtPath;
                const keys = Object.keys(record).sort();
                return `{${keys.map((key) => {
                    if (record[key] === undefined)
                        throw new Error(`Undefined value at ${logicalPath}.${key}`);
                    return `${JSON.stringify(key)}:${canonical(record[key], `${logicalPath}.${key}`)}`;
                }).join(",")}}`;
            }
            throw new Error(`Unsupported JSON value at ${logicalPath}`);
        }
        return canonical(value, "$");
    }
    function normalizeManifest(value) {
        if (!value || typeof value !== "object" || Array.isArray(value))
            throw new Error("Content bundle manifest must be an object");
        const input = value;
        const schemaVersion = Number(input.schemaVersion);
        if (schemaVersion !== CONTENT_BUNDLE_SCHEMA_VERSION) {
            throw new Error(`Unsupported content bundle schema version: ${String(input.schemaVersion ?? "")}`);
        }
        const gameId = String(input.gameId || "").trim();
        if (!GAME_ID_PATTERN.test(gameId))
            throw new Error(`Invalid content bundle game id: ${gameId}`);
        const engineContentSchemaVersion = String(input.engineContentSchemaVersion || "").trim();
        if (!/^\d+\.\d+\.\d+$/.test(engineContentSchemaVersion)) {
            throw new Error("engineContentSchemaVersion must be an exact semantic version");
        }
        const flowExpressionLanguageVersion = Number(input.flowExpressionLanguageVersion);
        if (!Number.isInteger(flowExpressionLanguageVersion) || flowExpressionLanguageVersion < 1) {
            throw new Error("flowExpressionLanguageVersion must be a positive integer");
        }
        const gameMigrationLevel = Number(input.gameMigrationLevel || 0);
        if (!Number.isInteger(gameMigrationLevel) || gameMigrationLevel < 0) {
            throw new Error("gameMigrationLevel must be a non-negative integer");
        }
        const semanticRolesPath = normalizeBundlePath(input.semanticRolesPath || "semantic-roles.json");
        const parentRevision = String(input.parentRevision || "").toLowerCase();
        const publishedRevision = String(input.publishedRevision || "").toLowerCase();
        if (parentRevision && !SHA256_PATTERN.test(parentRevision))
            throw new Error("parentRevision must be SHA-256 when present");
        if (publishedRevision && !SHA256_PATTERN.test(publishedRevision))
            throw new Error("publishedRevision must be SHA-256 when present");
        const fileInputs = Array.isArray(input.files) ? input.files : [];
        const seenExact = new Set();
        const seenPortable = new Set();
        const files = fileInputs.map((fileValue, index) => {
            if (!fileValue || typeof fileValue !== "object" || Array.isArray(fileValue)) {
                throw new Error(`Invalid bundle file record at index ${index}`);
            }
            const record = fileValue;
            const filePath = normalizeBundlePath(record.path);
            if (filePath === CONTENT_BUNDLE_MANIFEST_PATH)
                throw new Error("The bundle manifest cannot hash itself");
            const portableKey = filePath.normalize("NFC").toLocaleLowerCase("en-US");
            if (seenExact.has(filePath) || seenPortable.has(portableKey))
                throw new Error(`Duplicate or colliding bundle path: ${filePath}`);
            seenExact.add(filePath);
            seenPortable.add(portableKey);
            const fileSha = String(record.sha256 || "").toLowerCase();
            if (!SHA256_PATTERN.test(fileSha))
                throw new Error(`Invalid SHA-256 for ${filePath}`);
            const bytes = Number(record.bytes);
            if (!Number.isInteger(bytes) || bytes < 0)
                throw new Error(`Invalid byte size for ${filePath}`);
            return Object.freeze({ path: filePath, sha256: fileSha, bytes });
        }).sort((left, right) => left.path.localeCompare(right.path));
        for (const requiredPath of REQUIRED_CONTENT_PATHS) {
            if (!seenExact.has(requiredPath))
                throw new Error(`Content bundle is missing required file: ${requiredPath}`);
        }
        if (!seenExact.has(semanticRolesPath))
            throw new Error(`semanticRolesPath is not present in files: ${semanticRolesPath}`);
        const rootHash = String(input.rootHash || "").toLowerCase();
        if (!SHA256_PATTERN.test(rootHash))
            throw new Error("Content bundle rootHash must be SHA-256");
        return Object.freeze({
            schemaVersion,
            gameId,
            engineContentSchemaVersion,
            flowExpressionLanguageVersion,
            gameMigrationLevel,
            semanticRolesPath,
            parentRevision,
            publishedRevision,
            files: Object.freeze(files),
            rootHash
        });
    }
    function rootHashInput(files) {
        return [...files]
            .sort((left, right) => left.path.localeCompare(right.path))
            .map((file) => `${file.path}\0${file.sha256}\0${file.bytes}\n`)
            .join("");
    }
    return {
        CONTENT_BUNDLE_MANIFEST_PATH,
        CONTENT_BUNDLE_SCHEMA_VERSION,
        REQUIRED_CONTENT_PATHS,
        canonicalizeJson,
        normalizeBundlePath,
        normalizeManifest,
        rootHashInput
    };
});
