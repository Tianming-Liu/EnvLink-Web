import { fetchDatasetMetadata } from "./apiClient.js";
import { getMapboxToken } from "./config.js";

const proj4 = window.proj4;
const DEFAULT_PROJECTIONS = {
    "xz_lz": "+proj=utm +zone=45 +datum=WGS84 +units=m +no_defs",
    "xj_ajkc": "+proj=utm +zone=44 +datum=WGS84 +units=m +no_defs",
    "zj_adh": "+proj=utm +zone=51 +datum=WGS84 +units=m +no_defs",
    "zj_cjp": "+proj=utm +zone=51 +datum=WGS84 +units=m +no_defs",
    "zj_xkc": "+proj=utm +zone=51 +datum=WGS84 +units=m +no_defs"
};

function waitForStyleLoad(map) {
    return new Promise((resolve) => {
        if (map.isStyleLoaded()) {
            resolve();
        } else {
            map.once("style.load", resolve);
        }
    });
}

export function initMapbox() {
    const token = getMapboxToken();
    if (!token) {
        console.warn("[Mapbox] Missing mapbox token in config/env.config.js");
    } else {
        mapboxgl.accessToken = token;
    }

    const map = new mapboxgl.Map({
        container: "map",
        style: "mapbox://styles/tianmingliu/cmhkvngfj001i01pg6q26ca5y",
        center: [103.479650, 37.428937],
        zoom: 3.3
    });

    map.on("load", () => {
        console.log("[Mapbox] Map loaded");
    });

    setTimeout(() => {
        map.resize();
        console.log("[Mapbox] Map resized");
    }, 500);

    return map;
}

export async function updateMapLocation(map, key) {
    console.log(`[Mapbox] Updating map for ${key}...`);

    await waitForStyleLoad(map);

    let metadata = null;
    try {
        metadata = await fetchDatasetMetadata(key);
    } catch (error) {
        console.error("[Mapbox] Failed to load metadata:", error);
        return;
    }

    if (!metadata?.bounds) {
        console.warn(`[Mapbox] No bounds in metadata for ${key}`);
        return;
    }

    const bounds = metadata.bounds;
    const projectionDef = resolveProjection(metadata, key);

    const [minX, minY] = bounds.min;
    const [maxX, maxY] = bounds.max;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const centerLngLat = convertUTMToLngLat(projectionDef, [centerX, centerY]);
    if (!centerLngLat) {
        console.warn(`[Mapbox] Could not convert center coordinates for ${key}`);
        return;
    }

    const bbox = convertUTMBoundsToLngLat(projectionDef, bounds);
    if (!bbox) {
        console.warn(`[Mapbox] Could not convert bounds for ${key}`);
        return;
    }

    const name = metadata.label || getDatasetNameFromSelector(key);

    drawBoundingBox(map, bbox, name);
    map.fitBounds(bbox, {
        padding: 50,
        maxZoom: 15,
        duration: 1000
    });

    console.log(`[Mapbox] Map updated for ${name}`);
}

function resolveProjection(metadata, key) {
    return metadata?.projection?.raw || DEFAULT_PROJECTIONS[key] || "+proj=utm +zone=45 +datum=WGS84 +units=m +no_defs";
}

function convertUTMToLngLat(projDef, utmPoint) {
    try {
        proj4.defs("WGS84", "+proj=longlat +datum=WGS84 +no_defs");
        proj4.defs("pointcloud_utm", projDef);
        const transform = proj4("pointcloud_utm", "WGS84");
        return transform.forward(utmPoint);
    } catch (error) {
        console.error("[Mapbox] Error converting UTM point:", error);
        return null;
    }
}

function convertUTMBoundsToLngLat(projDef, bounds) {
    try {
        proj4.defs("WGS84", "+proj=longlat +datum=WGS84 +no_defs");
        proj4.defs("pointcloud_utm", projDef);

        const transform = proj4("pointcloud_utm", "WGS84");
        const [minX, minY] = bounds.min;
        const [maxX, maxY] = bounds.max;

        const sw = transform.forward([minX, minY]);
        const ne = transform.forward([maxX, maxY]);

        return [
            [sw[0], sw[1]],
            [ne[0], ne[1]]
        ];
    } catch (error) {
        console.error("[Mapbox] Error converting UTM bounds:", error);
        return null;
    }
}

function getDatasetNameFromSelector(key) {
    const selector = document.getElementById("pointcloudSelector");
    if (!selector) return key;
    const option = selector.querySelector(`option[value="${key}"]`);
    return option?.textContent || key;
}

function drawBoundingBox(map, bbox, name) {
    const ids = [
        "pointcloud-bounds-fill",
        "pointcloud-bounds-outline",
        "pointcloud-labels",
        "pointcloud-lengths"
    ];
    ids.forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
    });
    ["pointcloud-bounds", "pointcloud-labels", "pointcloud-lengths"].forEach(src => {
        if (map.getSource(src)) map.removeSource(src);
    });

    const [[west, south], [east, north]] = bbox;

    const polygon = {
        type: "Feature",
        geometry: {
            type: "Polygon",
            coordinates: [[
                [west, south],
                [east, south],
                [east, north],
                [west, north],
                [west, south]
            ]]
        },
        properties: { name }
    };

    map.addSource("pointcloud-bounds", { type: "geojson", data: polygon });

    map.addLayer({
        id: "pointcloud-bounds-fill",
        type: "fill",
        source: "pointcloud-bounds",
        paint: { "fill-color": "white", "fill-opacity": 0.08 }
    });

    map.addLayer({
        id: "pointcloud-bounds-outline",
        type: "line",
        source: "pointcloud-bounds",
        paint: {
            "line-color": "#ffffff",
            "line-width": 0.8,
            "line-dasharray": [5, 2]
        }
    });

    const topLine = turf.lineString([[west, north], [east, north]]);
    const leftLine = turf.lineString([[west, south], [west, north]]);

    const lenTop = turf.length(topLine, { units: "kilometers" });
    const lenLeft = turf.length(leftLine, { units: "kilometers" });

    const labelTop = lenTop < 1 ? `${(lenTop * 1000).toFixed(0)} m` : `${lenTop.toFixed(2)} km`;
    const labelLeft = lenLeft < 1 ? `${(lenLeft * 1000).toFixed(0)} m` : `${lenLeft.toFixed(2)} km`;

    const lengthLabels = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                geometry: { type: "Point", coordinates: [(west + east) / 2, north] },
                properties: { text: labelTop, rotate: 0 }
            },
            {
                type: "Feature",
                geometry: { type: "Point", coordinates: [west, (north + south) / 2] },
                properties: { text: labelLeft, rotate: -90 }
            }
        ]
    };

    map.addSource("pointcloud-lengths", { type: "geojson", data: lengthLabels });

    map.addLayer({
        id: "pointcloud-lengths",
        type: "symbol",
        source: "pointcloud-lengths",
        layout: {
            "text-field": ["get", "text"],
            "text-size": 12,
            "text-anchor": "center",
            "text-rotation-alignment": "map",
            "text-rotate": ["get", "rotate"]
        },
        paint: { "text-color": "#ffffff" }
    });
}
