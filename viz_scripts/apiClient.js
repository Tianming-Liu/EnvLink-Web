import { buildApiUrl, buildAssetUrl, getApiKey } from "./config.js";

function encodeSegment(value) {
    return encodeURIComponent(value);
}

function normalizeAssets(assets) {
    if (!assets || typeof assets !== "object") return assets;
    const normalized = { ...assets };
    return normalized;
}

async function fetchFromApi(path, options = {}) {
    const url = buildApiUrl(path);
    const headers = new Headers(options.headers || {});
    const apiKey = getApiKey();
    if (apiKey) {
        headers.set("x-envlink-api-key", apiKey);
    }
    const response = await fetch(url, {
        ...options,
        headers
    });
    if (!response.ok) {
        throw new Error(`API request failed (${response.status})`);
    }

    const data = await response.json();
    if (data && typeof data === "object" && "success" in data) {
        if (data.success) {
            return data.data;
        }
        throw new Error(data.message || "API error");
    }
    return data;
}

let datasetsCache = null;
const metadataCache = new Map();
const sessionsCache = new Map();
const sessionDetailCache = new Map();

export async function fetchDatasets(force = false) {
    if (!datasetsCache || force) {
        const payload = await fetchFromApi("/api/datasets");
        datasetsCache = Array.isArray(payload)
            ? payload.map(item => ({
                ...item,
                assets: normalizeAssets(item.assets)
            }))
            : [];
    }
    return datasetsCache;
}

export function getCachedDatasetSummary(key) {
    if (!datasetsCache) return null;
    return datasetsCache.find(ds => ds.key === key) || null;
}

export async function fetchDatasetMetadata(key, { force = false } = {}) {
    if (!key) throw new Error("dataset key is required");
    if (!metadataCache.has(key) || force) {
        const payload = await fetchFromApi(`/api/datasets/${encodeSegment(key)}/metadata`);
        const normalized = {
            ...payload,
            assets: normalizeAssets(payload?.assets)
        };
        metadataCache.set(key, normalized);
    }
    return metadataCache.get(key);
}

export async function fetchDatasetSessions(key, { force = false } = {}) {
    if (!key) throw new Error("dataset key is required");
    const cacheKey = key;
    if (!sessionsCache.has(cacheKey) || force) {
        const payload = await fetchFromApi(`/api/datasets/${encodeSegment(key)}/sessions`);
        const normalized = Array.isArray(payload)
            ? payload.map(item => ({
                ...item,
                assets: normalizeAssets(item.assets)
            }))
            : [];
        sessionsCache.set(cacheKey, normalized);
    }
    return sessionsCache.get(cacheKey);
}

export async function fetchSessionDetail(datasetKey, sessionId, { force = false } = {}) {
    if (!datasetKey || !sessionId) throw new Error("dataset key and session id are required");
    const cacheKey = `${datasetKey}:${sessionId}`;
    if (!sessionDetailCache.has(cacheKey) || force) {
        const payload = await fetchFromApi(`/api/datasets/${encodeSegment(datasetKey)}/sessions/${encodeSegment(sessionId)}`);
        const normalized = {
            ...payload,
            assets: normalizeAssets(payload.assets)
        };
        sessionDetailCache.set(cacheKey, normalized);
    }
    return sessionDetailCache.get(cacheKey);
}

export function resolveAssetUrl(path) {
    if (!path) return "";
    return buildAssetUrl(path);
}

export function resolveAssetUrlWithKey(path) {
    if (!path) return "";
    const base = resolveAssetUrl(path);
    const apiKey = getApiKey();
    if (!apiKey) return base;
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}apiKey=${encodeURIComponent(apiKey)}`;
}

export function clearApiCaches() {
    datasetsCache = null;
    metadataCache.clear();
    sessionsCache.clear();
    sessionDetailCache.clear();
}
