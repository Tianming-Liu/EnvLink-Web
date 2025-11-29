// viz_scripts/sensorProfile.js
// ============================================================
// Potree-style Sensor Profile for multi-session sensor data
// ============================================================

import * as THREE from "../libs/three.js/build/three.module.js";
const d3Global = window.d3;

export class SensorProfileWindow {
  constructor(containerSelector = '.profile-draw-container') {
    this.container = document.querySelector(containerSelector);
    this.camera = null;
    this.scene = null;
    this.renderer = null;
    this.svg = null;
    this.scale = new THREE.Vector3(1, 1, 1);
    this.mouseIsDown = false;
    this.mouse = new THREE.Vector2(0, 0);
    this.dataSets = []; // ✅ 支持多组数据
    this.field = 'temperature';

    this.hoverPoint = null; // Hover 点
    this.hoverLabel = null; // Hover 提示框

    this.initTHREE();
    this.initSVG();
    this.initListeners();
  }

  // ======================================================
  // 加载单个 session
  // ======================================================
  async load(datasetKey, sessionId, field = 'temperature') {
    this.field = field;

    try {
      const detail = await fetchSessionDetail(datasetKey, sessionId);
      const raw = detail?.sensorData;
      const points = Array.isArray(raw) ? raw : (raw?.data_points || []);
      if (!Array.isArray(points) || points.length === 0) {
        console.warn('[SensorProfile] No valid data_points in API payload');
        return;
      }

      const data = points
        .map((d, i) => ({
          _dist: i,
          timestamp: d.timestamp,
          sequence: d.sequence,
          local_time: d.local_time,
          ...d.sensor_data
        }))
        .filter(d => d[field] != null && Number.isFinite(+d[field]));

      if (data.length === 0) {
        console.warn(`[SensorProfile] Field "${field}" not found or no numeric values in session ${sessionId}`);
        console.log('[SensorProfile] Example keys:', Object.keys(points[0]?.sensor_data || {}));
        return;
      }

      this.dataSets = [{ sessionId, data }];
      console.log(`[SensorProfile] Loaded ${data.length} valid points for "${field}" in session ${sessionId}`);

      this.autoFit();
      this.renderMultiple();
    } catch (err) {
      console.error('[SensorProfile] Failed to load session data:', err);
    }
  }

  // ======================================================
  // 加载多个 session
  // ======================================================
  async loadMultiple(datasetKey, sessionIds = [], field = 'temperature') {
    this.field = field;
    this.dataSets = [];

    for (const sessionId of sessionIds) {
      try {
        const detail = await fetchSessionDetail(datasetKey, sessionId);
        const raw = detail?.sensorData;
        const points = Array.isArray(raw) ? raw : (raw?.data_points || []);
        if (!Array.isArray(points) || points.length === 0) continue;

        const data = points
          .map((d, i) => ({
            _dist: i,
            timestamp: d.timestamp,
            sequence: d.sequence,
            local_time: d.local_time,
            ...d.sensor_data
          }))
          .filter(d => d[field] != null && Number.isFinite(+d[field]));

        if (data.length > 0) {
          this.dataSets.push({ sessionId, data });
          console.log(`[SensorProfile] ✅ Loaded ${data.length} points for ${sessionId}`);
        } else {
          console.warn(`[SensorProfile] ⚠️ No numeric field "${field}" in ${sessionId}`);
        }

      } catch (err) {
        console.warn(`[SensorProfile] Failed to load ${sessionId}:`, err);
      }
    }

    if (this.dataSets.length === 0) {
      console.warn('[SensorProfile] No valid session data to plot.');
      return;
    }

    this.autoFit();
    this.renderMultiple();
  }

  // ======================================================
  // 初始化 WebGL 渲染层
  // ======================================================
  initTHREE() {
    const container = this.container;

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setSize(container.clientWidth, container.clientHeight);

    // ✅ 找到 profile-canvas-container（和 Potree 一致）
    const canvasContainer = container.querySelector('#profileCanvasContainer')
      || document.getElementById('profileCanvasContainer')
      || container;

    // ✅ 附加到正确层
    canvasContainer.appendChild(this.renderer.domElement);

    // ✅ 确保 z-index 正确
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.zIndex = '5';


    this.camera = new THREE.OrthographicCamera(-100, 100, 100, -100, -1000, 1000);
    this.camera.up.set(0, 0, 1);
    this.camera.rotation.order = 'ZXY';
    this.camera.rotation.x = Math.PI / 2.0;

    this.scene = new THREE.Scene();

    const geo = new THREE.SphereGeometry(0.5, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    this.hoverPoint = new THREE.Mesh(geo, mat);
    this.hoverPoint.visible = false;
    this.scene.add(this.hoverPoint);
  }

  // ======================================================
  // 初始化坐标轴（复刻 Potree 样式）
  // ======================================================
  initSVG() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.svg = d3Global.select(this.container)
      .append('svg')
      .attr('width', w)
      .attr('height', h)
      .style('position', 'absolute')
      .style('top', 0)
      .style('left', 0)
      .style('pointer-events', 'none');

    this.scaleX = d3Global.scale.linear().domain([0, 100]).range([0, w]);
    this.scaleY = d3Global.scale.linear().domain([0, 100]).range([h, 0]);

    this.xAxis = d3Global.svg.axis().scale(this.scaleX)
      .orient('bottom')
      .innerTickSize(-h)
      .outerTickSize(1)
      .tickPadding(10)
      .ticks(w / 50);

    this.yAxis = d3Global.svg.axis().scale(this.scaleY)
      .orient('left')
      .innerTickSize(-w)
      .outerTickSize(1)
      .tickPadding(10)
      .ticks(h / 20);

    this.elXAxis = this.svg.append('g')
      .attr('class', 'x axis')
      .attr('transform', `translate(0, ${h})`)
      .call(this.xAxis);

    this.elYAxis = this.svg.append('g')
      .attr('class', 'y axis')
      .call(this.yAxis);

    this.hoverLabel = d3Global.select(this.container)
      .append('div')
      .attr('class', 'sensor-profile-hover')
      .style('position', 'absolute')
      .style('background', 'rgba(20,20,20,0.75)')
      .style('color', '#fff')
      .style('font-size', '10px')
      .style('padding', '3px 6px')
      .style('border-radius', '3px')
      .style('pointer-events', 'none')
      .style('opacity', 0);
  }

  // ======================================================
  // 鼠标交互
  // ======================================================
  initListeners() {
    const c = this.container;

    c.addEventListener('mousedown', e => {
      this.mouseIsDown = true;
      this.mouse.set(e.offsetX, e.offsetY);
    });
    window.addEventListener('mouseup', () => (this.mouseIsDown = false));
    window.addEventListener('mousemove', e => {
      if (this.mouseIsDown) {
        const dx = e.offsetX - this.mouse.x;
        const dy = e.offsetY - this.mouse.y;
        this.camera.position.x -= dx / this.scale.x;
        this.camera.position.z += dy / this.scale.y;
        this.mouse.set(e.offsetX, e.offsetY);
        this.renderMultiple();
      } else {
        this.handleHover(e);
      }
    });

    c.addEventListener('wheel', e => {
      const zoom = e.deltaY > 0 ? 1.1 : 0.9;
      this.scale.multiplyScalar(zoom);
      this.renderMultiple();
    });
  }

  // ======================================================
  // 自动缩放
  // ======================================================
  autoFit() {
    if (!this.dataSets.length) return;
    const field = this.field;

    const allX = this.dataSets.flatMap(s => s.data.map(d => d._dist));
    const allY = this.dataSets.flatMap(s => s.data.map(d => d[field] ?? 0));

    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);

    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.scaleX.domain([minX, maxX]).range([0, w]);
    this.scaleY.domain([minY, maxY]).range([h, 0]);
  }

  // ======================================================
  // Hover 显示最近点
  // ======================================================
  handleHover(e) {
    if (!this.dataSets.length) return;

    const rect = this.container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const dist = this.scaleX.invert(x);
    const field = this.field;

    let closest = null;
    let closestSet = null;
    let minDiff = Infinity;

    for (const set of this.dataSets) {
      for (const p of set.data) {
        const diff = Math.abs(p._dist - dist);
        if (diff < minDiff) {
          minDiff = diff;
          closest = p;
          closestSet = set;
        }
      }
    }

    if (closest) {
      const px = this.scaleX(closest._dist);
      const py = this.scaleY(closest[field]);

      this.hoverPoint.visible = true;
      this.hoverPoint.position.set(closest._dist, closest[field], 0);

      this.hoverLabel
        .style('opacity', 1)
        .style('left', `${px + 10}px`)
        .style('top', `${py - 20}px`)
        .html(`
          <div><b>${field}</b>: ${closest[field].toFixed(2)}</div>
          <div>Session: ${closestSet.sessionId}</div>
          <div>Index: ${closest._dist}</div>
        `);

      this.renderMultiple();
    } else {
      this.hoverPoint.visible = false;
      this.hoverLabel.style('opacity', 0);
      this.renderMultiple();
    }
  }

  clear() {
    this.data = [];
    if (this.scene) {
      // 保留 hover 点，清空其他线
      this.scene.children = this.scene.children.filter(o => o === this.hoverPoint);
    }
    if (this.renderer) {
      this.renderer.clear();
    }
  }


  // ======================================================
  // 渲染多个 session 曲线
  // ======================================================
  renderMultiple() {
    const { scene, camera, renderer, dataSets, field } = this;
    renderer.clear();

    scene.children = scene.children.filter(o => o.type === 'Mesh');

    const colors = [0x00ffff, 0xff8800, 0x00ff00, 0xff00ff, 0xffff00, 0xff4444];

    dataSets.forEach((set, idx) => {
      const positions = [];
      set.data.forEach(d => positions.push(d._dist, d[field], 0));

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({ color: colors[idx % colors.length] });
      const line = new THREE.Line(geometry, material);
      scene.add(line);
    });

    renderer.render(scene, camera);
    this.updateAxes();
  }

  updateAxes() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.xAxis.scale(this.scaleX);
    this.yAxis.scale(this.scaleY);
    this.elXAxis.call(this.xAxis);
    this.elYAxis.call(this.yAxis);
  }
}

// ============================================================
// 对外接口
// ============================================================
let profileInstance = null;

export async function showSensorProfile(datasetKey, sessionIds, options = {}) {
  if (!profileInstance) {
    profileInstance = new SensorProfileWindow('.profile-draw-container');
  }

  const field = options.field || 'temperature';

  // ✅ 支持数组或单一 ID
  const ids = Array.isArray(sessionIds) ? sessionIds : [sessionIds];

  // 清空旧数据
  profileInstance.clear();

  for (const sid of ids) {
    await profileInstance.load(datasetKey, sid, field);
  }
}

export function hideSensorProfile() {
  if (profileInstance) {
    profileInstance.scene.children = [];
    profileInstance.dataSets = [];
    profileInstance.hoverLabel.style('opacity', 0);
    profileInstance.renderer.clear();
  }
}
