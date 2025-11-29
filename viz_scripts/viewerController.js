// viz_scripts/viewerController.js
import * as THREE from "../libs/three.js/build/three.module.js";

export function setupViewerView(viewer, pointcloud) {
  if (window.cancelOrbitAnimation && typeof window.cancelOrbitAnimation === "function") {
    window.cancelOrbitAnimation();
  }

  pointcloud.updateMatrixWorld(true);

  const worldBB = (pointcloud.getWorldBoundingBox)
    ? pointcloud.getWorldBoundingBox(new THREE.Box3())
    : pointcloud.boundingBox.clone().applyMatrix4(pointcloud.matrixWorld);

  const center = worldBB.getCenter(new THREE.Vector3());
  const size = worldBB.getSize(new THREE.Vector3());

  viewer.fitToScreen();

  const radius = Math.max(size.x, size.y) * 1.0;
  const cameraHeight = center.z + size.z * 1.2;

  const lookAtTarget = new THREE.Vector3(
    center.x,
    center.y,
    center.z - size.z * 0.6
  );

  const pathPoints = [];
  const segments = 850;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = center.x + radius * Math.cos(angle);
    const y = center.y + radius * Math.sin(angle);
    const z = cameraHeight;
    pathPoints.push(new THREE.Vector3(x, y, z));
  }

  const view = viewer.scene.view;
  let t = 0;
  const speed = 0.00015;
  let orbitEnabled = true;
  let orbitAnimationId = null;

  function animateCamera() {
    orbitAnimationId = requestAnimationFrame(animateCamera);
    if (!view || !orbitEnabled) return;

    t += speed;
    if (t > 1) t -= 1;

    const idx = Math.floor(t * segments);
    const pos = pathPoints[idx];
    if (!pos) return;

    view.position.copy(pos);
    view.lookAt(lookAtTarget);

    if (viewer.render) viewer.render();
  }

  animateCamera();

  window.toggleOrbit = function (enabled) {
    orbitEnabled = enabled;
    console.log(enabled ? "Orbit rotation enabled" : "Orbit rotation paused");
  };

  window.cancelOrbitAnimation = () => {
    if (orbitAnimationId) cancelAnimationFrame(orbitAnimationId);
    orbitAnimationId = null;
  };
}