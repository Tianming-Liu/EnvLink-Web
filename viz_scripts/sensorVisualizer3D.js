import * as THREE from "../libs/three.js/build/three.module.js";
import { interpolateSensorPositions } from "./interpolation.js";
import {
    queryPointCloudHeightOptimized,
    queryPointCloudHeight,
    processHeightData,
    createSensorSpheres,
    setupClickInteraction
} from "./sensorCore.js";
import {
    showSensorDataPanel,
    showSensorImages,
    buildSessionUI,
    formatSessionIdToLabel,
    resetCollapsibleState
} from "./sensorUI.js";
import {
    fetchDatasetMetadata,
    fetchDatasetSessions,
    fetchSessionDetail
} from "./apiClient.js";

const proj4 = window.proj4;
window.SensorRegistry = window.SensorRegistry || {};

function cleanupDataset(viewer, datasetKey) {
    const reg = window.SensorRegistry[datasetKey];
    if (reg?.parentGroup) {
        reg.parentGroup.parent?.remove(reg.parentGroup);
    }
    delete window.SensorRegistry[datasetKey];

    const list = document.getElementById("sessionList");
    if (list) list.innerHTML = "";

    if (window.hideSensorDataPanel) window.hideSensorDataPanel();

    resetCollapsibleState();
}

function normalizeSessionMeta(sessionSpec) {
    if (!sessionSpec) return null;
    if (typeof sessionSpec === "string") {
        return { id: sessionSpec, label: formatSessionIdToLabel(sessionSpec), summary: null };
    }

    const id = sessionSpec.sessionId || sessionSpec.id || "";
    if (!id) return null;
    return {
        id,
        label: sessionSpec.label || formatSessionIdToLabel(id),
        summary: sessionSpec
    };
}

function normalizeTime(ts) {
    if (!Number.isFinite(ts)) return null;
    if (ts < 2000000000) return ts * 1000;
    return ts;
}

function normalizeSensorData(raw) {
    if (!raw || !Array.isArray(raw.data_points)) return [];

    return raw.data_points.map(p => {
        let ts = p.timestamp ?? p.timestamp_ms;
        if (!Number.isFinite(ts)) return null;
        if (ts < 2000000000) ts = ts * 1000;

        return {
            ...p,
            timestamp: ts,
            local_time: p.local_time ?? ts / 1000
        };
    }).filter(Boolean);
}

function normalizeTrajectory(traj) {
    if (!traj || !Array.isArray(traj.trajectory)) return [];

    return traj.trajectory
        .map(t => {
            const ts = normalizeTime(t.timestamp_ms ?? t.timestamp);
            return {
                ...t,
                timestamp_ms: ts,
                latitude: Number(t.latitude),
                longitude: Number(t.longitude),
                altitude: Number(t.altitude ?? 0)
            };
        })
        .filter(t =>
            Number.isFinite(t.timestamp_ms) &&
            Number.isFinite(t.latitude) &&
            Number.isFinite(t.longitude)
        );
}

export async function addSensorPointsToScene(viewer, datasetKey = "xz_lz", options = {}) {
    const {
        heightOffset = 3,
        searchRadius = 5,
        useOptimizedQuery = true,
        fallbackHeight = 10,
        maxHeightJump = 5,
        smoothWindow = 3,
        sphereRadius = 3
    } = options;

    cleanupDataset(viewer, datasetKey);

    let sessionsRaw = [];
    try {
        sessionsRaw = await fetchDatasetSessions(datasetKey);
    } catch (error) {
        console.warn("[Sensor] Failed to load sessions:", error);
        buildSessionUI(datasetKey, []);
        return;
    }

    if (!Array.isArray(sessionsRaw) || sessionsRaw.length === 0) {
        console.warn(`[Sensor] No sensor sessions for ${datasetKey}`);
        buildSessionUI(datasetKey, []);
        return;
    }

    const sessions = sessionsRaw
        .map(normalizeSessionMeta)
        .filter(Boolean);

    const pc = viewer.scene.pointclouds?.[0];
    if (!pc) {
        console.warn("[Sensor] No point cloud in scene.");
        buildSessionUI(datasetKey, []);
        return;
    }

    const potreeOffset = pc.pcoGeometry?.offset ?? { x: 0, y: 0, z: 0 };

    let metadata = null;
    try {
        metadata = await fetchDatasetMetadata(datasetKey);
    } catch (error) {
        console.warn("[Sensor] Failed to load dataset metadata:", error);
    }

    const projDef = metadata?.projection?.raw;
    if (!projDef) {
        console.warn(`[Sensor] Missing projection definition for ${datasetKey}.`);
    }

    proj4.defs("WGS84", "+proj=longlat +datum=WGS84 +no_defs");
    if (projDef) {
        proj4.defs("pointcloud", projDef);
    }
    const transform = projDef ? proj4("WGS84", "pointcloud") : null;

    let pcMinZ = 0;
    try {
        pc.updateMatrixWorld(true);
        const worldBB = pc.getWorldBoundingBox
            ? pc.getWorldBoundingBox(new THREE.Box3())
            : pc.boundingBox.clone().applyMatrix4(pc.matrixWorld);
        pcMinZ = worldBB.min.z;
    } catch (e) { }

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    viewer.scene.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 10, 10);
    viewer.scene.scene.add(directionalLight);

    const parentGroup = new THREE.Group();
    parentGroup.name = "SensorPoints";
    viewer.scene.scene.add(parentGroup);

    window.SensorRegistry[datasetKey] = {
        parentGroup,
        nodes: {},
        toggles: {},
        clickableObjects: []
    };

    const heightQuery = useOptimizedQuery
        ? queryPointCloudHeightOptimized
        : queryPointCloudHeight;

    const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 16, 16);
    const sphereMaterial = new THREE.MeshLambertMaterial({
        color: 0x690d0d,
        emissive: 0x360505,
        transparent: true,
        opacity: 0.9,
        depthTest: true,
        depthWrite: true
    });

    const loadPromises = sessions.map(async ({ id }) => {
        let sessionDetail = null;
        try {
            sessionDetail = await fetchSessionDetail(datasetKey, id);
        } catch (error) {
            console.warn(`[Sensor] Failed to load session ${id}:`, error);
            return null;
        }

        if (!sessionDetail?.sensorData || !sessionDetail?.trajectory) {
            console.warn(`[Sensor] Session ${id}: missing sensor or trajectory data`);
            return null;
        }

        const trajData = normalizeTrajectory(sessionDetail.trajectory);
        const sdataList = normalizeSensorData(sessionDetail.sensorData);

        if (!trajData.length || !sdataList.length || !transform) {
            console.warn(`[Sensor] Session ${id}: insufficient data`);
            return null;
        }

        const interpolated = interpolateSensorPositions(trajData, sdataList);

        const pointsData = [];
        for (const p of interpolated) {
            const coords = transform.forward([p.longitude, p.latitude]);
            const x = coords[0] - potreeOffset.x;
            const y = coords[1] - potreeOffset.y;
            const terrainZ = heightQuery(pc, x, y, searchRadius);

            pointsData.push({
                x,
                y,
                terrainZ,
                hasHeight: terrainZ !== null && Number.isFinite(terrainZ),
                sensorData: p
            });
        }

        processHeightData(pointsData, pcMinZ, fallbackHeight, maxHeightJump, smoothWindow);

        const { sessionGroup, clickableObjects, statsMsg } = createSensorSpheres(
            pointsData,
            id,
            heightOffset,
            pcMinZ,
            fallbackHeight,
            sphereGeometry,
            sphereMaterial
        );

        if (sessionGroup.children.length === 0) {
            console.warn(`[Sensor] Session ${id} has no valid points`);
            return id;
        }

        const sessionAssets = {
            datasetKey,
            sessionId: id,
            basePath: sessionDetail.assets?.basePath || null,
            imagesPath: sessionDetail.assets?.imagesPath || null,
            segmentedImagesPath: sessionDetail.assets?.segmentedImagesPath || null
        };

        clickableObjects.forEach(obj => {
            obj.userData.sessionAssets = sessionAssets;
        });

        parentGroup.add(sessionGroup);
        window.SensorRegistry[datasetKey].nodes[id] = sessionGroup;
        window.SensorRegistry[datasetKey].clickableObjects.push(...clickableObjects);

        console.log(`[Sensor] Session ${id}: ${statsMsg}`);
        return id;
    });

    const finished = (await Promise.all(loadPromises)).filter(Boolean);

    setupClickInteraction(viewer, datasetKey, showSensorDataPanel, showSensorImages);
    buildSessionUI(datasetKey, sessions);

    if (viewer.render) viewer.render();

    console.log(`[Sensor] Added ${finished.length} session(s)`);
}
