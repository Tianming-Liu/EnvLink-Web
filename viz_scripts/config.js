const ABSOLUTE_URL_PATTERN = /^https?:\/\//i;

const DEFAULT_CONFIG = {
    apiBaseUrl: "",
    assetBaseUrl: "",
    mapboxToken: "",
    cesiumIonToken: "",
    apiKey: ""
};

function normalizeBase(base) {
    if (!base) return "";
    return base.endsWith("/") ? base.slice(0, -1) : base;
}

function normalizePath(path) {
    if (!path) return "";
    if (ABSOLUTE_URL_PATTERN.test(path) || path.startsWith("//")) {
        return path;
    }
    return path.startsWith("/") ? path : `/${path}`;
}

function joinBase(base, path) {
    if (!base) return path;
    if (!path) return base;
    if (ABSOLUTE_URL_PATTERN.test(path) || path.startsWith("//")) return path;
    return `${base}${path}`;
}

export function getEnvlinkConfig() {
    const globalConfig = window?.EnvlinkConfig ?? {};
    const apiBaseUrl = normalizeBase(globalConfig.apiBaseUrl ?? DEFAULT_CONFIG.apiBaseUrl);
    const resolvedAssetBase = globalConfig.assetBaseUrl ?? globalConfig.apiBaseUrl ?? DEFAULT_CONFIG.assetBaseUrl;
    const assetBaseUrl = normalizeBase(resolvedAssetBase);

    return {
        apiBaseUrl,
        assetBaseUrl,
        mapboxToken: globalConfig.mapboxToken ?? DEFAULT_CONFIG.mapboxToken,
        cesiumIonToken: globalConfig.cesiumIonToken ?? DEFAULT_CONFIG.cesiumIonToken,
        apiKey: globalConfig.apiKey ?? DEFAULT_CONFIG.apiKey
    };
}

export function buildApiUrl(path) {
    const { apiBaseUrl } = getEnvlinkConfig();
    const normalized = normalizePath(path);
    return joinBase(apiBaseUrl, normalized);
}

export function buildAssetUrl(path) {
    const { assetBaseUrl, apiBaseUrl } = getEnvlinkConfig();
    const base = assetBaseUrl || apiBaseUrl;
    const normalized = normalizePath(path);
    return joinBase(base, normalized);
}

export function getMapboxToken() {
    const { mapboxToken } = getEnvlinkConfig();
    return mapboxToken;
}

export function getCesiumIonToken() {
    const { cesiumIonToken } = getEnvlinkConfig();
    return cesiumIonToken;
}

export function getApiKey() {
    const { apiKey } = getEnvlinkConfig();
    return apiKey;
}

export function appendApiKeyParam(url) {
    const apiKey = getApiKey();
    if (!apiKey) return url;
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}apiKey=${encodeURIComponent(apiKey)}`;
}
