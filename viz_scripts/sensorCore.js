// viz_scripts/sensorCore.js
import * as THREE from "../libs/three.js/build/three.module.js";

const proj4 = window.proj4;

/**
 * Query point cloud height within a search radius
 */
export function queryPointCloudHeight(pointcloud, x, y, searchRadius = 5) {
    try {
        let positions = null;

        if (pointcloud.geometry?.attributes?.position) {
            positions = pointcloud.geometry.attributes.position.array;
        }

        if (!positions && pointcloud.pcoGeometry?.root) {
            const collectPositions = (node) => {
                const pos = [];
                if (node.geometry?.attributes?.position) {
                    const arr = node.geometry.attributes.position.array;
                    for (let i = 0; i < arr.length; i += 3) {
                        pos.push(arr[i], arr[i + 1], arr[i + 2]);
                    }
                }
                if (node.children) {
                    if (Array.isArray(node.children)) {
                        node.children.forEach(child => {
                            if (child) pos.push(...collectPositions(child));
                        });
                    } else if (typeof node.children === 'object') {
                        for (const key in node.children) {
                            const child = node.children[key];
                            if (child) pos.push(...collectPositions(child));
                        }
                    }
                }
                return pos;
            };

            const collected = collectPositions(pointcloud.pcoGeometry.root);
            if (collected.length > 0) {
                positions = new Float32Array(collected);
            }
        }

        if (!positions || positions.length === 0) return null;

        const searchRadiusSq = searchRadius * searchRadius;
        const nearbyHeights = [];

        for (let i = 0; i < positions.length; i += 3) {
            const px = positions[i];
            const py = positions[i + 1];
            const pz = positions[i + 2];

            const dx = px - x;
            const dy = py - y;
            const distSq = dx * dx + dy * dy;

            if (distSq <= searchRadiusSq) {
                nearbyHeights.push(pz);
            }
        }

        if (nearbyHeights.length === 0) {
            return null;
        }

        nearbyHeights.sort((a, b) => a - b);
        const percentileIndex = Math.floor(nearbyHeights.length * 0.2);
        return nearbyHeights[percentileIndex];

    } catch (e) {
        console.error("[QueryHeight] Error:", e);
        return null;
    }
}

/**
 * Use Octree structure to optimize point cloud height query
 */
export function queryPointCloudHeightOptimized(pointcloud, x, y, searchRadius = 5) {
    try {
        const center = new THREE.Vector3(x, y, 0);
        const nearbyPoints = [];

        function traverseNodes(node) {
            if (!node) return;

            const boundingBox = node.getBoundingBox();
            const closestPoint = boundingBox.clampPoint(center, new THREE.Vector3());
            const distance = center.distanceTo(closestPoint);

            if (distance > searchRadius) return;

            if (node.geometry && node.geometry.attributes.position) {
                const positions = node.geometry.attributes.position.array;
                const worldMatrix = node.sceneNode?.matrixWorld || new THREE.Matrix4();

                for (let i = 0; i < positions.length; i += 3) {
                    const localPos = new THREE.Vector3(
                        positions[i],
                        positions[i + 1],
                        positions[i + 2]
                    );
                    const worldPos = localPos.applyMatrix4(worldMatrix);

                    const dx = worldPos.x - x;
                    const dy = worldPos.y - y;
                    const distSq = dx * dx + dy * dy;

                    if (distSq <= searchRadius * searchRadius) {
                        nearbyPoints.push(worldPos.z);
                    }
                }
            }

            if (node.children) {
                if (Array.isArray(node.children)) {
                    for (const child of node.children) {
                        if (child) traverseNodes(child);
                    }
                } else if (typeof node.children === 'object') {
                    for (const key in node.children) {
                        const child = node.children[key];
                        if (child) traverseNodes(child);
                    }
                }
            }
        }

        traverseNodes(pointcloud.pcoGeometry?.root);

        if (nearbyPoints.length === 0) {
            return null;
        }

        nearbyPoints.sort((a, b) => a - b);
        const percentileIndex = Math.floor(nearbyPoints.length * 0.2);
        return nearbyPoints[percentileIndex];

    } catch (e) {
        console.error("[QueryHeightOpt] Error:", e);
        return null;
    }
}

/**
 * Process height data with chain assignment and smoothing
 */
export function processHeightData(pointsData, pcMinZ, fallbackHeight, maxHeightJump, smoothWindow) {
    // Stage 2: Chain height assignment
    let unassignedCount = pointsData.filter(p => !p.hasHeight).length;

    if (unassignedCount === pointsData.length && pointsData.length > 0) {
        pointsData[0].terrainZ = pcMinZ + fallbackHeight;
        pointsData[0].hasHeight = true;
        pointsData[0].seedPoint = true;
        unassignedCount--;
    }

    let prevUnassignedCount = unassignedCount;
    let iteration = 0;
    const maxIterations = 10;

    while (unassignedCount > 0 && iteration < maxIterations) {
        iteration++;

        for (let i = 0; i < pointsData.length; i++) {
            const point = pointsData[i];
            if (point.hasHeight) continue;

            let minDist = Infinity;
            let nearestZ = null;

            for (let j = 0; j < pointsData.length; j++) {
                if (i === j || !pointsData[j].hasHeight) continue;

                const dx = point.x - pointsData[j].x;
                const dy = point.y - pointsData[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < minDist) {
                    minDist = dist;
                    nearestZ = pointsData[j].terrainZ;
                }
            }

            if (nearestZ !== null) {
                point.terrainZ = nearestZ;
                point.hasHeight = true;
                point.chainAssigned = true;
                unassignedCount--;
            }
        }

        if (unassignedCount === prevUnassignedCount) break;
        prevUnassignedCount = unassignedCount;
    }

    // Stage 2.5: Smooth height of adjacent points
    for (let i = 1; i < pointsData.length; i++) {
        const curr = pointsData[i];
        const prev = pointsData[i - 1];

        if (!curr.hasHeight || !prev.hasHeight) continue;

        const heightDiff = Math.abs(curr.terrainZ - prev.terrainZ);

        if (heightDiff > maxHeightJump) {
            const windowHeights = [];
            const start = Math.max(0, i - smoothWindow);
            const end = Math.min(pointsData.length, i + smoothWindow + 1);

            for (let j = start; j < end; j++) {
                if (pointsData[j].hasHeight && j !== i) {
                    windowHeights.push(pointsData[j].terrainZ);
                }
            }

            if (windowHeights.length > 0) {
                windowHeights.sort((a, b) => a - b);
                const mid = Math.floor(windowHeights.length / 2);
                const smoothedZ = windowHeights.length % 2 === 0
                    ? (windowHeights[mid - 1] + windowHeights[mid]) / 2
                    : windowHeights[mid];

                curr.terrainZ = smoothedZ;
                curr.smoothed = true;
            }
        }
    }
}

/**
 * Create sensor spheres for a session
 */
export function createSensorSpheres(pointsData, sessionId, heightOffset, pcMinZ, fallbackHeight, sphereGeometry, sphereMaterial) {
    const sessionGroup = new THREE.Group();
    sessionGroup.name = `SensorPoints:${sessionId}`;

    let directMatchCount = 0;
    let chainAssignedCount = 0;
    let fallbackCount = 0;
    let smoothedCount = 0;
    const clickableObjects = [];

    for (const point of pointsData) {
        let z;

        if (point.hasHeight && point.terrainZ !== null) {
            z = point.terrainZ + heightOffset;
            if (point.smoothed) {
                smoothedCount++;
            }
            if (point.chainAssigned) {
                chainAssignedCount++;
            } else {
                directMatchCount++;
            }
        } else {
            z = pcMinZ + fallbackHeight;
            fallbackCount++;
        }

        if (!Number.isFinite(z)) continue;

        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial.clone());
        sphere.position.set(point.x, point.y, z);
        sphere.userData.sensorData = point.sensorData;
        sphere.userData.sessionId = sessionId;

        sessionGroup.add(sphere);
        clickableObjects.push(sphere);
    }

    const statsMsg = smoothedCount > 0
        ? `${directMatchCount} direct, ${chainAssignedCount} chain, ${smoothedCount} smoothed, ${fallbackCount} fallback`
        : `${directMatchCount} direct, ${chainAssignedCount} chain, ${fallbackCount} fallback`;

    return { sessionGroup, clickableObjects, statsMsg };
}

/**
 * Setup click and hover interaction for sensor points
 */
export function setupClickInteraction(viewer, datasetKey, showSensorDataPanelFn, showSensorImagesFn) {
    const canvas = viewer.renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    raycaster.params.Points.threshold = 1;

    canvas.addEventListener('click', (event) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, viewer.scene.getActiveCamera());

        const registry = window.SensorRegistry[datasetKey];
        if (!registry || !registry.clickableObjects) return;

        const intersects = raycaster.intersectObjects(registry.clickableObjects, false);

        if (intersects.length > 0) {
            const clickedObject = intersects[0].object;
            const sensorData = clickedObject.userData.sensorData;
            const sessionId = clickedObject.userData.sessionId;
            const sessionAssets = clickedObject.userData.sessionAssets;

            if (sensorData) {
                console.log("[SensorClick] Clicked sensor point:", sensorData);

                // Show sensor data panel
                showSensorDataPanelFn(sensorData, sessionId); 

                // Show sensor images (pass sessionId)
                if (showSensorImagesFn) {
                    showSensorImagesFn(sensorData, sessionAssets, datasetKey, sessionId);
                }
            }
        }
    });

    canvas.addEventListener('mousemove', (event) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, viewer.scene.getActiveCamera());

        const registry = window.SensorRegistry[datasetKey];
        if (!registry || !registry.clickableObjects) return;

        const intersects = raycaster.intersectObjects(registry.clickableObjects, false);

        registry.clickableObjects.forEach(obj => {
            if (obj.material) {
                obj.material.color.set(0x690d0d);
                obj.material.emissive.set(0x360505);
                obj.material.opacity = 0.9;
                obj.scale.set(1, 1, 1);
            }
        });

        if (intersects.length > 0) {
            canvas.style.cursor = 'pointer';
            const hovered = intersects[0].object;
            if (hovered.material) {
                hovered.material.color.set(0x690d0d);
                hovered.material.emissive.set(0x540601);
                hovered.material.opacity = 1.0;
                hovered.scale.set(1.5, 1.5, 1.5);
            }
        } else {
            canvas.style.cursor = 'default';
        }
    });
}
