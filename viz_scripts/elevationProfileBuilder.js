// viz_scripts/elevationProfileBuilder.js
import * as THREE from "../libs/three.js/build/three.module.js";

/**
 * Random Elevation Profile Creator from Geometry Points
 * - 采样几何的“局部坐标”，用 pc.matrixWorld 转为“世界坐标”再作为 profile marker
 * - 距离与阈值计算也基于“世界包围盒”
 * @param {Potree.Viewer} viewer
 * @param {THREE.BufferGeometry} geom  点云根节点的几何
 * @param {THREE.Object3D} pc         Potree 的 pointcloud 对象（用于 matrixWorld）
 */
export function createRandomProfileFromGeometry(viewer, geom, pc) {
  // 确保世界矩阵是最新的（你在 dataLoader 里 set 了 pc.position.z 之后要记得 update）
  pc.updateMatrixWorld(true);

  const positions = geom.attributes.position.array;
  const totalPointsCount = positions.length / 3;

  // 用“世界包围盒”来设置最小距离阈值（避免用局部 bbox）
  const worldBB = (pc.getWorldBoundingBox)
    ? pc.getWorldBoundingBox(new THREE.Box3())
    : pc.boundingBox.clone().applyMatrix4(pc.matrixWorld);

  const minDistance = computeMinDistanceWorld(worldBB, 0.3);

  // 采样两个“世界坐标”点
  let p1, p2, dist = 0, tries = 0;
  do {
    p1 = getRandomPointWorld(positions, pc.matrixWorld);
    p2 = getRandomPointWorld(positions, pc.matrixWorld);
    dist = p1.distanceTo(p2);
    tries++;
  } while (dist < minDistance && tries < 4000);

  const profile = new Potree.Profile();
  profile.setWidth(1);
  profile.addMarker(p1);
  profile.addMarker(p2);
  viewer.scene.addProfile(profile);
  console.log("Profile created (world-synced).");

//   Customize marker appearance
//   profile.spheres.forEach((sphere) => {
//   sphere.material = new THREE.MeshStandardMaterial({
//     color: 0x8B0000,
//     emissive: 0xAD2323,       // 发光边缘
//     roughness: 0.2,
//     metalness: 0.5,
//     transparent: true,
//     opacity: 0.85,
//   });
//   sphere.scale.set(1.6, 1.6, 1.6);  // 稍微放大一点
// });

  const forceRefresh = () => {
    try {
      profile.update?.();
      viewer.profileWindow?.update?.(profile);
      viewer.profileWindowController?.update?.();
      if (viewer.render) viewer.render();
      else if (viewer.requestRedraw) viewer.requestRedraw();
      else if (viewer.scene?.requestRedraw) viewer.scene.requestRedraw();
    } catch (err) {
      console.warn("Profile/GUI refresh failed:", err);
    }
  };

  ["marker_moved", "marker_added", "marker_removed", "width_changed"].forEach(ev =>
    profile.addEventListener(ev, forceRefresh)
  );

  if (viewer.profileWindow && viewer.profileWindowController) {
    viewer.profileWindow.show?.();
    try { viewer.profileWindowController.setProfile(null); } catch (_) {}
    viewer.profileWindowController.setProfile(profile);
    viewer.profileWindow.update?.(profile);
    viewer.profileWindowController.update?.();
  } else {
    console.warn("GUI not ready — profile works in 3D only.");
  }

  forceRefresh();
  return profile;
}

// === Utilities ===

// 从几何“局部坐标”随机取一点，并转成“世界坐标”
function getRandomPointWorld(positions, matrixWorld) {
  const totalPointsCount = positions.length / 3;
  const idx = Math.floor(Math.random() * totalPointsCount);

  const local = new THREE.Vector3(
    positions[idx * 3],
    positions[idx * 3 + 1],
    positions[idx * 3 + 2]
  );

  return local.applyMatrix4(matrixWorld); // 局部 -> 世界
}

// 用“世界包围盒”算距离阈值
function computeMinDistanceWorld(worldBB, ratio = 0.3) {
  if (!worldBB) return 10;
  const dx = worldBB.max.x - worldBB.min.x;
  const dy = worldBB.max.y - worldBB.min.y;
  const dz = worldBB.max.z - worldBB.min.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) * ratio;
}
