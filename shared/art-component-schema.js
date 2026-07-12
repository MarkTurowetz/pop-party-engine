"use strict";
// Dual-use (server require + client global) art component schema + normalizers. Built to
// shared/art-component-schema.js via `npm run build:shared` (committed output). Wrapped in
// an IIFE so declarations stay local to the shared compilation's script scope.
(function () {
    "use strict";
    const componentKinds = ["text", "shape", "container", "badge", "reference"];
    const creatableComponentKinds = ["text", "shape", "container", "reference"];
    const shapeStyleOptions = [
        { value: "rounded", label: "Rounded" },
        { value: "rectangle", label: "Rectangle" },
        { value: "pill", label: "Pill" },
        { value: "circle", label: "Circle" }
    ];
    const shapeStyleValues = shapeStyleOptions.map((option) => option.value);
    const imageMimeTypes = ["image/png", "image/svg+xml", "image/jpeg", "image/webp"];
    const imageObjectFits = ["cover", "contain", "fill"];
    const containerDistributionOptions = [
        { value: "none", label: "None" },
        { value: "horizontal", label: "Horizontal Distribution" },
        { value: "vertical", label: "Vertical Distribution" }
    ];
    const transformOriginOptions = [
        { value: "topLeft", label: "Top Left", x: 0, y: 0 },
        { value: "top", label: "Top", x: 50, y: 0 },
        { value: "topRight", label: "Top Right", x: 100, y: 0 },
        { value: "right", label: "Right", x: 100, y: 50 },
        { value: "bottomRight", label: "Bottom Right", x: 100, y: 100 },
        { value: "bottom", label: "Bottom", x: 50, y: 100 },
        { value: "bottomLeft", label: "Bottom Left", x: 0, y: 100 },
        { value: "left", label: "Left", x: 0, y: 50 },
        { value: "center", label: "Center", x: 50, y: 50 }
    ];
    const containerDistributionValues = containerDistributionOptions.map((option) => option.value);
    const transformOriginValues = transformOriginOptions.map((option) => option.value);
    const defaultTextFontFamily = 'ui-rounded, "Avenir Next", "Trebuchet MS", system-ui, sans-serif';
    const textFontFamilyOptions = [
        { value: defaultTextFontFamily, label: "Game UI" },
        { value: '"Avenir Next", Avenir, system-ui, sans-serif', label: "Avenir Next" },
        { value: '"Trebuchet MS", "Avenir Next", system-ui, sans-serif', label: "Trebuchet MS" },
        { value: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif', label: "Impact" },
        { value: 'Georgia, "Times New Roman", serif', label: "Georgia" },
        { value: '"Courier New", Courier, monospace', label: "Courier New" }
    ];
    const textFontFamilyValues = textFontFamilyOptions.map((option) => option.value);
    const componentImageMaxBytes = 5 * 1024 * 1024;
    const imageAccept = imageMimeTypes.join(",");
    const fillCssMaxLength = 240;
    function normalizeValue(value) {
        return String(value || "").trim().toLowerCase();
    }
    function normalizeComponentKind(value, fallback = "shape") {
        const kind = normalizeValue(value || fallback || "shape");
        return componentKinds.includes(kind) ? kind : "shape";
    }
    function normalizeCreatableComponentKind(value, fallback = "shape") {
        const kind = normalizeValue(value || fallback || "shape");
        return creatableComponentKinds.includes(kind) ? kind : "shape";
    }
    function componentKindFrom(componentOrKind) {
        if (!componentOrKind)
            return "";
        if (typeof componentOrKind === "object")
            return normalizeComponentKind(componentOrKind.kind);
        return normalizeComponentKind(componentOrKind);
    }
    function componentKindLabel(kind) {
        const cleanKind = normalizeComponentKind(kind);
        if (cleanKind === "text")
            return "Text";
        if (cleanKind === "container")
            return "Container";
        if (cleanKind === "badge")
            return "Badge";
        if (cleanKind === "reference")
            return "Reference";
        return "Shape";
    }
    function componentSupportsShapeStyle(componentOrKind) {
        const kind = componentKindFrom(componentOrKind);
        return kind === "shape" || kind === "container" || kind === "badge";
    }
    function defaultShapeStyle(kind) {
        return normalizeComponentKind(kind) === "container" ? "rectangle" : "rounded";
    }
    function normalizeShapeStyle(value, kind = "shape") {
        const style = normalizeValue(value || defaultShapeStyle(kind));
        return shapeStyleValues.includes(style) ? style : defaultShapeStyle(kind);
    }
    function componentSupportsImageMask(componentOrKind) {
        return componentKindFrom(componentOrKind) === "shape";
    }
    function componentHasImageMask(component) {
        return componentSupportsImageMask(component) && Boolean(component?.imageDataUrl || component?.imageAssetId);
    }
    function componentImageMaskDataUrl(component) {
        return componentSupportsImageMask(component) ? String(component?.imageDataUrl || "") : "";
    }
    function componentLabel(component) {
        const kind = componentKindFrom(component);
        if (kind === "text" || kind === "badge") {
            return component?.defaultText === undefined || component?.defaultText === null
                ? ""
                : String(component.defaultText);
        }
        return "";
    }
    function normalizeImageObjectFit(value) {
        const fit = normalizeValue(value || "cover");
        return imageObjectFits.includes(fit) ? fit : "cover";
    }
    function normalizeContainerDistribution(value) {
        const distribution = normalizeValue(value || "none");
        return containerDistributionValues.includes(distribution) ? distribution : "none";
    }
    function normalizeTransformOrigin(value) {
        const origin = String(value || "center").trim();
        return transformOriginValues.includes(origin) ? origin : "center";
    }
    function transformOriginCss(value) {
        const origin = normalizeTransformOrigin(value);
        const option = transformOriginOptions.find((item) => item.value === origin) || transformOriginOptions[8];
        return `${option.x}% ${option.y}%`;
    }
    function normalizeTextFontFamily(value, fallback = defaultTextFontFamily) {
        const text = String(value || "").trim();
        if (textFontFamilyValues.includes(text))
            return text;
        const fallbackText = String(fallback || "").trim();
        if (textFontFamilyValues.includes(fallbackText))
            return fallbackText;
        return defaultTextFontFamily;
    }
    function isSupportedImageMimeType(mimeType) {
        return imageMimeTypes.includes(String(mimeType || "").trim().toLowerCase());
    }
    function parseImageDataUrl(dataUrl) {
        const match = String(dataUrl || "").trim().match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/);
        if (!match)
            return null;
        const mimeType = match[1].trim().toLowerCase();
        if (!isSupportedImageMimeType(mimeType))
            return null;
        return { mimeType, base64: match[2] };
    }
    function imageBase64ByteLength(base64) {
        const text = String(base64 || "").trim();
        if (!text)
            return 0;
        const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
        return Math.max(0, Math.floor((text.length * 3) / 4) - padding);
    }
    function validateImageFile(file) {
        if (!file)
            return "Choose an image file first.";
        if (!isSupportedImageMimeType(file.type))
            return "Use PNG, SVG, JPG, or WEBP.";
        if (Number(file.size || 0) <= 0 || Number(file.size || 0) > componentImageMaxBytes)
            return "Image masks must be under 5 MB.";
        return "";
    }
    function normalizeFillCss(value) {
        const text = String(value || "").trim();
        if (!text)
            return "";
        if (text.length > fillCssMaxLength)
            return "";
        if (!/^[a-zA-Z0-9#%.,()*_\-\s]+$/.test(text))
            return "";
        if (!/\b(?:linear-gradient|radial-gradient|conic-gradient)\(/.test(text))
            return "";
        return text;
    }
    const exportedSchema = {
        componentHasImageMask,
        componentImageMaskDataUrl,
        componentImageMaxBytes,
        componentKindFrom,
        componentKindLabel,
        componentKinds,
        componentLabel,
        componentSupportsImageMask,
        componentSupportsShapeStyle,
        containerDistributionOptions,
        containerDistributionValues,
        creatableComponentKinds,
        defaultTextFontFamily,
        defaultShapeStyle,
        imageAccept,
        imageBase64ByteLength,
        imageMimeTypes,
        imageObjectFits,
        isSupportedImageMimeType,
        normalizeComponentKind,
        normalizeContainerDistribution,
        normalizeCreatableComponentKind,
        normalizeFillCss,
        normalizeTextFontFamily,
        normalizeTransformOrigin,
        normalizeImageObjectFit,
        normalizeShapeStyle,
        parseImageDataUrl,
        shapeStyleOptions,
        shapeStyleValues,
        textFontFamilyOptions,
        textFontFamilyValues,
        transformOriginCss,
        transformOriginOptions,
        transformOriginValues,
        validateImageFile
    };
    if (typeof module !== "undefined" && module.exports) {
        module.exports = exportedSchema;
    }
    if (typeof window !== "undefined") {
        window.PartyGameArtComponentSchema = exportedSchema;
    }
})();
