// viz_scripts/depthReader.js
import * as THREE from "../libs/three.js/build/three.module.js";

class DepthReaderTool {
    constructor() {
        this.enabled = false;
        this.potreeViewer = null;
        this.cesiumViewer = null;
        this.mousePosition = { x: 0, y: 0 };
        this.clickHandler = null;
        this.mouseMoveHandler = null;
        this.indicator = null;
        
        console.log("📊 DepthReader initialized");
    }

    /**
     * 初始化 - 自动检测全局 viewer
     */
    init() {
        // 自动检测 Potree Viewer
        if (window.viewer) {
            this.potreeViewer = window.viewer;
            console.log("✅ Potree viewer detected");
        } else {
            console.warn("⚠️ Potree viewer not found");
        }

        // 自动检测 Cesium Viewer
        if (window.cesiumViewer) {
            this.cesiumViewer = window.cesiumViewer;
            console.log("✅ Cesium viewer detected");
        } else {
            console.warn("⚠️ Cesium viewer not found");
        }

        // 创建屏幕指示器
        this.createIndicator();

        return this.potreeViewer !== null || this.cesiumViewer !== null;
    }

    /**
     * 创建屏幕指示器
     */
    createIndicator() {
        if (document.getElementById('depth-indicator')) return;

        this.indicator = document.createElement('div');
        this.indicator.id = 'depth-indicator';
        this.indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            padding: 15px;
            border-radius: 5px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            z-index: 10000;
            pointer-events: none;
            display: none;
            min-width: 300px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        `;
        this.indicator.innerHTML = `
            <div style="color: #ffaa00; font-weight: bold; margin-bottom: 8px;">
                🎯 DEPTH READER [Active]
            </div>
            <div id="depth-content">Click anywhere to read depth...</div>
        `;
        document.body.appendChild(this.indicator);
    }

    /**
     * 启用深度读取模式
     */
    enable() {
        if (!this.init()) {
            console.error("❌ No viewers found. Cannot enable depth reader.");
            return false;
        }

        if (this.enabled) {
            console.log("ℹ️ Depth reader already enabled");
            return true;
        }

        this.enabled = true;
        if (this.indicator) {
            this.indicator.style.display = 'block';
        }

        // 添加事件监听器
        const container = document.getElementById('potree_render_area');
        if (container) {
            this.clickHandler = (e) => this.onMouseClick(e);
            this.mouseMoveHandler = (e) => this.onMouseMove(e);
            
            container.addEventListener('click', this.clickHandler);
            container.addEventListener('mousemove', this.mouseMoveHandler);
        }

        console.log("✅ Depth reader enabled - Click anywhere to read depth");
        console.log("💡 Tip: Use DepthReader.disable() to turn off");
        
        return true;
    }

    /**
     * 禁用深度读取模式
     */
    disable() {
        this.enabled = false;
        
        if (this.indicator) {
            this.indicator.style.display = 'none';
        }

        const container = document.getElementById('potree_render_area');
        if (container) {
            if (this.clickHandler) {
                container.removeEventListener('click', this.clickHandler);
            }
            if (this.mouseMoveHandler) {
                container.removeEventListener('mousemove', this.mouseMoveHandler);
            }
        }

        console.log("❌ Depth reader disabled");
    }

    /**
     * 鼠标移动事件
     */
    onMouseMove(event) {
        const rect = event.target.getBoundingClientRect();
        this.mousePosition.x = event.clientX - rect.left;
        this.mousePosition.y = event.clientY - rect.top;
    }

    /**
     * 鼠标点击事件
     */
    onMouseClick(event) {
        const rect = event.target.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const depth = this.getDepthAt(x, y);
        this.displayDepth(depth);
    }

    /**
     * 获取指定屏幕坐标的深度信息
     */
    getDepthAt(x, y) {
        const result = {
            timestamp: new Date().toISOString(),
            screenPosition: { x, y },
            potree: null,
            cesium: null
        };

        // 读取 Potree 深度
        if (this.potreeViewer) {
            result.potree = this.getPotreeDepth(x, y);
        }

        // 读取 Cesium 深度
        if (this.cesiumViewer) {
            result.cesium = this.getCesiumDepth(x, y);
        }

        return result;
    }

    /**
     * 获取 Potree 深度信息
     */
    getPotreeDepth(x, y) {
        try {
            const camera = this.potreeViewer.scene.getActiveCamera();
            const renderer = this.potreeViewer.renderer;
            
            // 归一化设备坐标
            const mouse = new THREE.Vector2(
                (x / renderer.domElement.clientWidth) * 2 - 1,
                -(y / renderer.domElement.clientHeight) * 2 + 1
            );

            // 使用 Raycaster
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, camera);
            raycaster.params.Points.threshold = 0.5;

            const pointclouds = this.potreeViewer.scene.pointclouds;
            if (pointclouds.length === 0) {
                return { error: "No point clouds in scene" };
            }

            let closestDistance = Infinity;
            let closestPoint = null;
            let closestPointCloud = null;

            pointclouds.forEach(pc => {
                // 需要确保点云可见
                if (!pc.visible) return;

                const intersects = raycaster.intersectObject(pc, true);
                if (intersects.length > 0) {
                    if (intersects[0].distance < closestDistance) {
                        closestDistance = intersects[0].distance;
                        closestPoint = intersects[0].point.clone();
                        closestPointCloud = pc;
                    }
                }
            });

            if (closestPoint) {
                // 获取相机位置
                const cameraPos = camera.position.clone();
                const distanceFromCamera = cameraPos.distanceTo(closestPoint);

                return {
                    hit: true,
                    worldPosition: {
                        x: closestPoint.x,
                        y: closestPoint.y,
                        z: closestPoint.z
                    },
                    distanceFromCamera: distanceFromCamera,
                    cameraPosition: {
                        x: cameraPos.x,
                        y: cameraPos.y,
                        z: cameraPos.z
                    },
                    pointCloudName: closestPointCloud.name || "unnamed"
                };
            }

            return { hit: false, message: "No intersection found" };

        } catch (error) {
            console.error("Error reading Potree depth:", error);
            return { error: error.message };
        }
    }

    /**
     * 获取 Cesium 深度信息
     */
    getCesiumDepth(x, y) {
        try {
            const scene = this.cesiumViewer.scene;
            const screenPosition = new Cesium.Cartesian2(x, y);

            // 方法1: pickPosition (拾取场景中的任意对象)
            const cartesian = scene.pickPosition(screenPosition);
            
            let result = {
                hit: false
            };

            if (Cesium.defined(cartesian)) {
                const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                
                result = {
                    hit: true,
                    method: "pickPosition",
                    cartesian: {
                        x: cartesian.x,
                        y: cartesian.y,
                        z: cartesian.z
                    },
                    cartographic: {
                        longitude: Cesium.Math.toDegrees(cartographic.longitude),
                        latitude: Cesium.Math.toDegrees(cartographic.latitude),
                        height: cartographic.height
                    },
                    cameraHeight: this.cesiumViewer.camera.positionCartographic.height,
                    distanceFromCamera: Cesium.Cartesian3.distance(
                        this.cesiumViewer.camera.position,
                        cartesian
                    )
                };
            } else {
                // 方法2: 如果 pickPosition 失败，尝试与地球表面求交
                const ray = this.cesiumViewer.camera.getPickRay(screenPosition);
                const globePosition = scene.globe.pick(ray, scene);
                
                if (Cesium.defined(globePosition)) {
                    const cartographic = Cesium.Cartographic.fromCartesian(globePosition);
                    
                    result = {
                        hit: true,
                        method: "globePick",
                        cartesian: {
                            x: globePosition.x,
                            y: globePosition.y,
                            z: globePosition.z
                        },
                        cartographic: {
                            longitude: Cesium.Math.toDegrees(cartographic.longitude),
                            latitude: Cesium.Math.toDegrees(cartographic.latitude),
                            height: cartographic.height
                        },
                        cameraHeight: this.cesiumViewer.camera.positionCartographic.height,
                        distanceFromCamera: Cesium.Cartesian3.distance(
                            this.cesiumViewer.camera.position,
                            globePosition
                        )
                    };
                }
            }

            return result;

        } catch (error) {
            console.error("Error reading Cesium depth:", error);
            return { error: error.message };
        }
    }

    /**
     * 获取当前鼠标位置的深度
     */
    getCurrentDepth() {
        return this.getDepthAt(this.mousePosition.x, this.mousePosition.y);
    }

    /**
     * 显示深度信息
     */
    displayDepth(depth) {
        console.group('🎯 Depth Information');
        console.log('Screen Position:', depth.screenPosition);
        console.log('Potree:', depth.potree);
        console.log('Cesium:', depth.cesium);
        console.groupEnd();

        // 更新屏幕指示器
        if (this.indicator) {
            const content = document.getElementById('depth-content');
            if (content) {
                content.innerHTML = this.formatDepthDisplay(depth);
            }
        }

        return depth;
    }

    /**
     * 格式化深度信息显示
     */
    formatDepthDisplay(depth) {
        let html = `<div style="color: #aaa; margin-bottom: 5px;">
            Screen: (${depth.screenPosition.x.toFixed(0)}, ${depth.screenPosition.y.toFixed(0)})
        </div>`;

        // Potree 信息
        html += `<div style="color: #00aaff; font-weight: bold; margin-top: 8px;">POTREE:</div>`;
        if (depth.potree?.hit) {
            html += `
                <div style="padding-left: 10px;">
                    World: (${depth.potree.worldPosition.x.toFixed(2)}, 
                            ${depth.potree.worldPosition.y.toFixed(2)}, 
                            ${depth.potree.worldPosition.z.toFixed(2)})</div>
                <div style="padding-left: 10px;">Distance: ${depth.potree.distanceFromCamera.toFixed(2)} m</div>
            `;
        } else {
            html += `<div style="padding-left: 10px; color: #888;">No hit</div>`;
        }

        // Cesium 信息
        html += `<div style="color: #00ff88; font-weight: bold; margin-top: 8px;">CESIUM:</div>`;
        if (depth.cesium?.hit) {
            html += `
                <div style="padding-left: 10px;">
                    Lon/Lat: (${depth.cesium.cartographic.longitude.toFixed(6)}°, 
                              ${depth.cesium.cartographic.latitude.toFixed(6)}°)</div>
                <div style="padding-left: 10px;">Height: ${depth.cesium.cartographic.height.toFixed(2)} m</div>
                <div style="padding-left: 10px;">Distance: ${depth.cesium.distanceFromCamera.toFixed(2)} m</div>
            `;
        } else {
            html += `<div style="padding-left: 10px; color: #888;">No hit</div>`;
        }

        return html;
    }

    /**
     * 导出深度数据为 JSON
     */
    exportDepthData(depth) {
        const json = JSON.stringify(depth, null, 2);
        console.log("📋 Depth data (copy from below):");
        console.log(json);
        
        // 尝试复制到剪贴板
        if (navigator.clipboard) {
            navigator.clipboard.writeText(json).then(() => {
                console.log("✅ Copied to clipboard!");
            }).catch(() => {
                console.log("⚠️ Could not copy to clipboard");
            });
        }
        
        return json;
    }

    /**
     * 连续读取模式（每秒读取一次）
     */
    startContinuousReading(interval = 1000) {
        if (this.readingInterval) {
            console.warn("Continuous reading already active");
            return;
        }

        this.enable();
        this.readingInterval = setInterval(() => {
            const depth = this.getCurrentDepth();
            this.displayDepth(depth);
        }, interval);

        console.log(`Continuous reading started (${interval}ms interval)`);
        console.log("Use DepthReader.stopContinuousReading() to stop");
    }

    /**
     * 停止连续读取
     */
    stopContinuousReading() {
        if (this.readingInterval) {
            clearInterval(this.readingInterval);
            this.readingInterval = null;
            console.log("❌ Continuous reading stopped");
        }
    }
}

// 创建全局实例
const depthReaderInstance = new DepthReaderTool();

// 导出到全局 window 对象，方便控制台调用
window.DepthReader = {
    enable: () => depthReaderInstance.enable(),
    disable: () => depthReaderInstance.disable(),
    getDepthAt: (x, y) => depthReaderInstance.getDepthAt(x, y),
    getCurrentDepth: () => depthReaderInstance.getCurrentDepth(),
    exportData: (depth) => depthReaderInstance.exportDepthData(depth),
    startContinuous: (interval) => depthReaderInstance.startContinuousReading(interval),
    stopContinuous: () => depthReaderInstance.stopContinuousReading(),
    
    // 帮助信息
    help: () => {
        console.log(`
╔════════════════════════════════════════════╗
║       DEPTH READER - Quick Reference       ║
╚════════════════════════════════════════════╝

Basic Usage:
  DepthReader.enable()           - 启用点击读取模式
  DepthReader.disable()          - 禁用读取模式
  
Manual Reading:
  DepthReader.getDepthAt(x, y)   - 读取指定坐标深度
  DepthReader.getCurrentDepth()  - 读取当前鼠标位置深度
  
Advanced:
  DepthReader.startContinuous()  - 启动连续读取 (1秒/次)
  DepthReader.stopContinuous()   - 停止连续读取
  DepthReader.exportData(depth)  - 导出深度数据为JSON
  
Example:
  > DepthReader.enable()
  > // Click anywhere on the viewer
  > const depth = DepthReader.getDepthAt(500, 300)
  > DepthReader.exportData(depth)
        `);
    }
};

// 自动显示帮助信息
console.log("📊 DepthReader loaded! Type 'DepthReader.help()' for usage.");

export default depthReaderInstance;