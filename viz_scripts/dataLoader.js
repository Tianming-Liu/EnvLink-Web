import * as THREE from "../libs/three.js/build/three.module.js";
import { setupViewerView } from "./viewerController.js";
import { createRandomProfileFromGeometry } from "./elevationProfileBuilder.js";
import {
    fetchDatasets,
    fetchDatasetMetadata,
    resolveAssetUrl
} from "./apiClient.js";

export async function initDataLoader(viewer) {
    const selector = document.getElementById("pointcloudSelector");
    if (!selector) {
        console.error("[DataLoader] pointcloudSelector element not found.");
        return;
    }

    let datasets = [];
    try {
        datasets = await fetchDatasets();
    } catch (error) {
        console.error("[DataLoader] Failed to fetch datasets:", error);
        selector.innerHTML = `<option value="">加载数据失败</option>`;
        return;
    }

    if (!Array.isArray(datasets) || datasets.length === 0) {
        selector.innerHTML = `<option value="">暂无可用数据</option>`;
        return;
    }

    const defaultKey = getInitialDatasetKey(datasets);
    populateSelector(selector, datasets, defaultKey);

    let currentLoadToken = 0;

    async function handleSelectionChange(key) {
        if (!key) return;
        const token = ++currentLoadToken;
        console.log(`[DataLoader] Loading dataset ${key}`);

        cleanupSensorData();
        clearOldScene();
        await resetViewControllers();

        try {
            const metadata = await fetchDatasetMetadata(key);
            if (!metadata) {
                console.warn(`[DataLoader] Metadata not found for ${key}`);
                return;
            }

            if (token !== currentLoadToken) return; // skip stale loads

            await loadPointCloud(viewer, key, metadata);
        } catch (err) {
            console.error(`[DataLoader] Failed to load dataset ${key}:`, err);
        }
    }

    selector.addEventListener("change", (e) => {
        const key = e.target.value;
        handleSelectionChange(key);
    });

    if (defaultKey) {
        selector.value = defaultKey;
        handleSelectionChange(defaultKey);
    }

    async function loadPointCloud(viewer, key, metadata) {
        const cloudUrl = resolveAssetUrl(metadata?.pointcloud?.cloudUrl);
        if (!cloudUrl) {
            console.warn(`[DataLoader] Missing cloudUrl for dataset ${key}`);
            return;
        }

        setTimeout(() => {
            Potree.loadPointCloud(cloudUrl, key, e => {
                const pc = e.pointcloud;
                viewer.scene.addPointCloud(pc);

                const material = pc.material;
                material.size = 1;
                material.pointSizeType = Potree.PointSizeType.ADAPTIVE;

                pc.position.set(0, 0, 0);
                pc.updateMatrixWorld(true);

                console.log("[DataLoader] Point cloud added:", key);

                setupViewerView(viewer, pc);

                let pointcloudReadyDispatched = false;

                function dispatchPointcloudReady() {
                    if (pointcloudReadyDispatched) return;
                    pointcloudReadyDispatched = true;
                    const detail = { key, metadata };
                    const event = new CustomEvent("pointcloudLoaded", { detail });
                    document.dispatchEvent(event);
                }

                function waitForGeometry() {
                    const geom = pc.pcoGeometry?.root?.geometry;
                    if (geom && geom.attributes?.position) {
                        console.log("[DataLoader] Geometry ready, creating profile…");

                        if (viewer.scene.profiles?.length) {
                            viewer.scene.profiles.forEach(p => viewer.scene.removeProfile(p));
                            viewer.scene.profiles = [];
                        }
                        if (viewer.profileWindowController) {
                            try {
                                viewer.profileWindowController.setProfile(null);
                            } catch (_) { }
                        }

                        pc.updateMatrixWorld(true);
                        createRandomProfileFromGeometry(viewer, geom, pc);

                        waitForTerrainAndCorrectHeight(viewer, pc, key);
                        dispatchPointcloudReady();

                    } else {
                        console.log("[DataLoader] Waiting for geometry…");
                        setTimeout(waitForGeometry, 600);
                    }
                }

                waitForGeometry();
            });
        }, 200);
    }

    async function waitForTerrainAndCorrectHeight(viewer, pc, key) {
        try {
            const {
                setProjectionFromProjTxt,
                performHeightSync,
                getCesiumViewer
            } = await import("./cesiumUnderlay.js");

            console.log("[DataLoader] Initializing projection…");
            pc.updateMatrixWorld(true);
            const initSuccess = await setProjectionFromProjTxt(viewer, key);

            if (!initSuccess) {
                console.error("[DataLoader] Failed to initialize projection");
                return;
            }
            console.log("[DataLoader] Initial view set");

            const cesiumViewer = getCesiumViewer();
            if (!cesiumViewer?.scene?.terrainProvider) {
                console.warn("[DataLoader] No terrain provider, skipping height sync");
                return;
            }

            console.log("[DataLoader] Waiting for terrain (max 15s)...");

            const maxWaitTime = 15000;
            const checkInterval = 1000;
            const startTime = Date.now();

            const tryHeightSync = async () => {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

                pc.updateMatrixWorld(true);
                const syncSuccess = await performHeightSync(viewer, key);

                if (syncSuccess) {
                    console.log(`[DataLoader] Height sync completed (${elapsed}s)`);
                    return true;
                }
                return false;
            };

            if (await tryHeightSync()) return;

            while (Date.now() - startTime < maxWaitTime) {
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                if (await tryHeightSync()) return;
            }

            console.warn("[DataLoader] Height sync timeout, keeping original height");

        } catch (error) {
            console.error("[DataLoader] Error during initialization:", error);
        }
    }

    function populateSelector(target, list, defaultKey) {
        target.innerHTML = "";

        list.forEach(item => {
            const option = document.createElement("option");
            option.value = item.key;
            option.textContent = item.label || item.key;
            if (item.key === defaultKey) {
                option.selected = true;
            }
            target.appendChild(option);
        });
    }

    function getInitialDatasetKey(list) {
        const preferred = list.find(item => item.isDefault);
        return preferred?.key ?? list[0]?.key ?? null;
    }

    function clearOldScene() {
        try {
            if (window.cancelOrbitAnimation) window.cancelOrbitAnimation();

            if (viewer.scene?.profiles?.length) {
                viewer.scene.profiles.forEach(p => viewer.scene.removeProfile(p));
                viewer.scene.profiles = [];
            }

            if (viewer.profileWindowController) {
                try {
                    viewer.profileWindowController.setProfile(null);
                } catch (_) { }
            }

            if (Potree.pointcloudCache) {
                const keys = Object.keys(Potree.pointcloudCache);
                if (keys.length > 0) {
                    for (const k of keys) delete Potree.pointcloudCache[k];
                }
            }

            const newScene = new Potree.Scene();
            viewer.setScene(newScene);
            viewer.render();
        } catch (err) {
            console.error("[DataLoader] Scene reset failed:", err);
        }
    }

    function cleanupSensorData() {
        Object.keys(window.SensorRegistry || {}).forEach(key => {
            const reg = window.SensorRegistry[key];
            if (reg?.parentGroup && viewer.scene?.scene) {
                viewer.scene.scene.remove(reg.parentGroup);
            }
        });

        window.SensorRegistry = {};

        const list = document.getElementById("sessionList");
        if (list) list.innerHTML = "";

        if (window.hideSensorDataPanel) {
            window.hideSensorDataPanel();
        }

        if (window.hideSensorImages) {
            window.hideSensorImages();
        }

        if (window.resetCollapsibleState) {
            window.resetCollapsibleState();
        }

        console.log("[DataLoader] Sensor data cleaned");
    }

    async function resetViewControllers() {
        const orbitToggle = document.getElementById("orbitToggle");
        if (orbitToggle) {
            orbitToggle.checked = true;
            if (window.toggleOrbit) window.toggleOrbit(true);
        }

        const displaySelect = document.getElementById("displayModeSelect");
        if (displaySelect) {
            displaySelect.value = "rgb";
            if (window.setPointCloudDisplayMode) {
                window.setPointCloudDisplayMode("rgb");
            }
        }

        try {
            const { adjustHeight } = await import("./cesiumUnderlay.js");
            if (typeof adjustHeight === "function") {
                adjustHeight(0);
            }
        } catch (err) {
            console.warn("[DataLoader] adjustHeight reset skipped:", err);
        }

        const baseLayerSlider = document.getElementById("baseLayerSlider");
        if (baseLayerSlider) {
            baseLayerSlider.value = 0;
            const event = new Event("input");
            baseLayerSlider.dispatchEvent(event);
        }
    }
}
