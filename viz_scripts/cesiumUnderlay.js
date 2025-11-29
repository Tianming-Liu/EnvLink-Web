// viz_scripts/cesiumUnderlay.js
import * as THREE from "../libs/three.js/build/three.module.js";
import { fetchDatasetMetadata } from "./apiClient.js";
import { getCesiumIonToken } from "./config.js";

let cesiumViewer = null;
let toMap = null;
let currentOffset = { x: 0, y: 0, z: 0 };
let heightCorrection = 0;
let manualCorrections = {};
let currentDatasetKey = null;
let currentViewer = null;

/**
 * Initialize Cesium Underlay
 */
export function initCesiumUnderlay(containerId) {
  if (cesiumViewer) return cesiumViewer;

  if (typeof window.CESIUM_BASE_URL === 'undefined') {
    window.CESIUM_BASE_URL = 'libs/Cesium/';
  }

  const ionToken = getCesiumIonToken();
  if (ionToken) {
    Cesium.Ion.defaultAccessToken = ionToken;
  } else {
    console.warn("[CesiumUnderlay] Cesium Ion token missing in config/env.config.js");
  }

  cesiumViewer = new Cesium.Viewer(containerId, {
    terrain: Cesium.Terrain.fromWorldTerrain(),
    useDefaultRenderLoop: false,
    requestRenderMode: true,
    maximumRenderTimeChange: 0.0,
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    navigationHelpButton: false,
    navigationInstructionsInitiallyVisible: false,
    terrainShadows: Cesium.ShadowMode.DISABLED,
    shadows: false,
    scene3DOnly: true,
  });

  cesiumViewer.scene.globe.show = true;
  cesiumViewer.scene.fxaa = true;
  cesiumViewer.scene.globe.baseColor = Cesium.Color.TRANSPARENT;
  cesiumViewer.scene.skyAtmosphere.show = true;
  cesiumViewer.scene.skyAtmosphere.saturationShift = -0.5;
  cesiumViewer.scene.skyAtmosphere.brightnessShift = -0.6;
  cesiumViewer.scene.skyAtmosphere.hueShift = 0.05;

  cesiumViewer.scene.globe.depthTestAgainstTerrain = true;

  const imageryLayers = cesiumViewer.imageryLayers;
  if (imageryLayers.length > 0) {
    const baseLayer = imageryLayers.get(0);
    baseLayer.brightness = 0.4;
    baseLayer.saturation = 0;
    baseLayer.alpha = 0.3;
  }

  return cesiumViewer;
}


/**
 * Set projection from proj.txt (初始化时不做高度校正)
 */
export async function setProjectionFromProjTxt(viewer, datasetKey) {
  let metadata = null;
  try {
    metadata = await fetchDatasetMetadata(datasetKey);
  } catch (error) {
    console.error("[CesiumUnderlay] Failed to load dataset metadata:", error);
  }

  const projTxt = metadata?.projection?.raw;
  if (!projTxt) {
    console.error(`[CesiumUnderlay] Projection definition not found for ${datasetKey}`);
    return false;
  }

  if (metadata && metadata.manualHeightCorrection !== undefined && metadata.manualHeightCorrection !== null) {
    manualCorrections[datasetKey] = metadata.manualHeightCorrection;
  }

  const pc = viewer?.scene?.pointclouds?.[0];
  if (!pc) {
    console.warn("[CesiumUnderlay] No point cloud in scene");
    return false;
  }

  currentOffset = pc.pcoGeometry?.offset ?? { x: 0, y: 0, z: 0 };
  currentDatasetKey = datasetKey;
  currentViewer = viewer;

  try {
    const wgs84 = "+proj=longlat +datum=WGS84 +no_defs";
    toMap = proj4(projTxt, wgs84);

    // 检查是否有手动校正值
    if (manualCorrections[datasetKey] !== undefined) {
      heightCorrection = manualCorrections[datasetKey];
      console.log(`[CesiumUnderlay] Using manual correction: ${heightCorrection.toFixed(2)}m`);
    } else {
      // 使用原始高度（不做校正）
      heightCorrection = 0;
      console.log("[CesiumUnderlay] Using original height");
    }

    setInitialCesiumView(viewer);
    return true;

  } catch (err) {
    console.error("[CesiumUnderlay] Projection error:", err);
    return false;
  }
}

/**
 * 计算高度校正（返回成功/失败状态）
 */
async function calculateHeightCorrection(viewer, datasetKey) {
  const pc = viewer.scene.pointclouds?.[0];
  if (!pc || !cesiumViewer) return false;

  const terrainProvider = cesiumViewer.scene?.terrainProvider;
  if (!terrainProvider) return false;

  pc.updateMatrixWorld(true);
  const bb = pc.getWorldBoundingBox
    ? pc.getWorldBoundingBox(new THREE.Box3())
    : pc.boundingBox.clone().applyMatrix4(pc.matrixWorld);

  const center = bb.getCenter(new THREE.Vector3());
  const xy = [center.x + currentOffset.x, center.y + currentOffset.y];
  const deg = toMap.forward(xy);
  const pointCloudBottomHeight = bb.min.z + currentOffset.z;

  try {
    const positions = [Cesium.Cartographic.fromDegrees(deg[0], deg[1])];
    const updatedPositions = await Cesium.sampleTerrainMostDetailed(
      terrainProvider,
      positions
    );

    const terrainHeight = updatedPositions[0]?.height;

    if (terrainHeight !== undefined && !isNaN(terrainHeight)) {
      heightCorrection = terrainHeight - pointCloudBottomHeight;
      console.log(`[CesiumUnderlay] Terrain: ${terrainHeight.toFixed(1)}m, Correction: ${heightCorrection.toFixed(1)}m`);
      return true;
    }
  } catch (error) {
    // 静默失败（terrain 还没准备好）
  }

  return false;
}

/**
 * 执行高度同步（供外部调用）
 */
export async function performHeightSync(viewer, datasetKey) {
  // 如果有手动校正值，跳过
  if (manualCorrections[datasetKey] !== undefined) {
    return true;
  }

  // 尝试计算高度校正
  const success = await calculateHeightCorrection(viewer, datasetKey);

  if (success) {
    setInitialCesiumView(viewer);
    return true;
  }

  return false;
}

/**
 * 设置Cesium初始视角
 */
function setInitialCesiumView(viewer) {
  if (!cesiumViewer) return;

  const pc = viewer.scene.pointclouds[0];
  if (!pc) return;

  pc.updateMatrixWorld(true);
  const bb = pc.getWorldBoundingBox
    ? pc.getWorldBoundingBox(new THREE.Box3())
    : pc.boundingBox.clone().applyMatrix4(pc.matrixWorld);

  const center = bb.getCenter(new THREE.Vector3());
  const xy = [center.x + currentOffset.x, center.y + currentOffset.y];
  const deg = toMap.forward(xy);
  const height = center.z + currentOffset.z + heightCorrection + 1000;

  const position = Cesium.Cartesian3.fromDegrees(deg[0], deg[1], height);

  cesiumViewer.camera.setView({
    destination: position,
    orientation: {
      heading: 0,
      pitch: -Cesium.Math.PI_OVER_TWO * 0.5,
      roll: 0
    }
  });
}

/**
 * 同步Potree相机到Cesium
 */
export function syncPotreeToCesium(potreeViewer) {
  if (!toMap || !cesiumViewer) return;

  const camera = potreeViewer.scene.getActiveCamera();
  const view = potreeViewer.scene.view;

  const pPos = new THREE.Vector3(0, 0, 0).applyMatrix4(camera.matrixWorld);
  const pUp = new THREE.Vector3(0, 600, 0).applyMatrix4(camera.matrixWorld);
  const pTarget = view.getPivot();

  const toCesium = (pos) => {
    const xy = [pos.x + currentOffset.x, pos.y + currentOffset.y];
    const height = pos.z + currentOffset.z + heightCorrection;
    const deg = toMap.forward(xy);
    return Cesium.Cartesian3.fromDegrees(deg[0], deg[1], height);
  };

  const cPos = toCesium(pPos);
  const cUpTarget = toCesium(pUp);
  const cTarget = toCesium(pTarget);

  let cDir = Cesium.Cartesian3.subtract(cTarget, cPos, new Cesium.Cartesian3());
  let cUp = Cesium.Cartesian3.subtract(cUpTarget, cPos, new Cesium.Cartesian3());

  cDir = Cesium.Cartesian3.normalize(cDir, cDir);
  cUp = Cesium.Cartesian3.normalize(cUp, cUp);

  cesiumViewer.camera.setView({
    destination: cPos,
    orientation: {
      direction: cDir,
      up: cUp
    }
  });

  const aspect = camera.aspect;
  const fovy = Math.PI * (camera.fov / 180);

  if (aspect < 1) {
    cesiumViewer.camera.frustum.fov = fovy;
  } else {
    const fovx = Math.atan(Math.tan(0.5 * fovy) * aspect) * 2;
    cesiumViewer.camera.frustum.fov = fovx;
  }

  // cesiumViewer.render();
}

export function getCesiumViewer() {
  return cesiumViewer;
}

/**
 * 设置高度校正（API接口）
 * @param {number} correction - 校正值（米），正数向上，负数向下
 * @param {string} datasetKey - 数据集名称（可选，默认使用当前数据集）
 */
export function setHeightCorrection(correction, datasetKey = null) {
  heightCorrection = correction;

  const key = datasetKey || currentDatasetKey;
  if (key) {
    manualCorrections[key] = correction;
  }

  // 立即应用新的校正值
  if (currentViewer) {
    setInitialCesiumView(currentViewer);
  }
}

/**
 * 🔧 调整高度（增量调整）
 * @param {number} delta - 增量（米），正数向上，负数向下
 */
export function adjustHeight(delta) {
  heightCorrection += delta;

  const key = currentDatasetKey;
  if (key) {
    manualCorrections[key] = heightCorrection;
  }

  if (currentViewer) {
    setInitialCesiumView(currentViewer);
  }

  console.log(`[CesiumUnderlay] Height adjusted: ${heightCorrection.toFixed(1)}m`);
}

/**
 * 获取当前高度校正值
 */
export function getHeightCorrection() {
  return heightCorrection;
}

/**
 * 获取当前数据集名称
 */
export function getCurrentDataset() {
  return currentDatasetKey;
}
