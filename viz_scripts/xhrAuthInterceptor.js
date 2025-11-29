import { getEnvlinkConfig, getApiKey } from "./config.js";

const { apiBaseUrl, assetBaseUrl } = getEnvlinkConfig();
const allowedOrigins = new Set(
    [apiBaseUrl, assetBaseUrl]
        .filter(Boolean)
        .map(url => {
            try {
                return new URL(url, window.location.origin).origin;
            } catch {
                return null;
            }
        })
        .filter(Boolean)
);

const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

function shouldAttach(url) {
    if (allowedOrigins.size === 0) return false;
    try {
        const resolved = new URL(url, window.location.origin);
        return allowedOrigins.has(resolved.origin);
    } catch {
        return false;
    }
}

XMLHttpRequest.prototype.open = function (...args) {
    const [, url] = args;
    this._envlinkAttachApiKey = shouldAttach(url);
    return originalOpen.apply(this, args);
};

XMLHttpRequest.prototype.send = function (...args) {
    if (this._envlinkAttachApiKey) {
        const apiKey = getApiKey();
        if (apiKey) {
            try {
                this.setRequestHeader("x-envlink-api-key", apiKey);
            } catch (err) {
                console.warn("Failed to set API key header:", err);
            }
        }
    }
    return originalSend.apply(this, args);
};
