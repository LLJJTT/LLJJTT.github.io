<template>
  <div class="app-container">
    <div class="control-panel">
      <div class="panel-header">
        <h2>🚀 Artemis II 任务轨迹</h2>
        <p class="subtitle">NASA 阿尔忒弥斯二号 - 载人绕月飞行</p>
      </div>

      <div class="info-section">
        <div class="info-item">
          <span class="info-label">任务状态</span>
          <span class="info-value" :class="statusClass">{{ statusText }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">当前位置</span>
          <span class="info-value">{{ currentLocation }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">飞行阶段</span>
          <span class="info-value">{{ flightPhase }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">已飞行时间</span>
          <span class="info-value">{{ flightTime }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">当前速度</span>
          <span class="info-value">{{ speed }} km/s</span>
        </div>
        <div class="info-item">
          <span class="info-label">距地球</span>
          <span class="info-value">{{ distToEarth }}</span>
        </div>
        <div class="info-item">
          <span class="info-label">距月球</span>
          <span class="info-value">{{ distToMoon }}</span>
        </div>
      </div>

      <div class="button-section">
        <button
          v-if="!hasStarted"
          @click="startMission"
          class="control-button primary"
          :disabled="!isViewerReady"
        >
          开始任务
        </button>

        <template v-if="hasStarted">
          <button
            @click="togglePause"
            :class="['control-button', isPaused ? 'secondary' : 'warning']"
          >
            {{ isPaused ? '继续' : '暂停' }}
          </button>
        </template>

        <button @click="resetView" class="control-button secondary">重置视角</button>
        <button @click="followShip" class="control-button secondary">跟随飞船</button>
        <button @click="viewMoon" class="control-button secondary">月球特写</button>
        <button @click="viewEarth" class="control-button secondary">地球特写</button>
      </div>
    </div>

    <div ref="cesiumContainer" class="cesium-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { TD_MAP_KEY } from '../config.js';

const cesiumContainer = ref(null);
let viewer = null;
let artemisEntity = null;
let pathEntities = [];
let animationFrameId = null;

const isViewerReady = ref(false);
const hasStarted = ref(false);
const isPaused = ref(false);
const missionElapsed = ref(0);       // 累计飞行时间（秒），不含暂停
let lastFrameTime = 0;               // 上一帧的时间戳
let pauseStart = 0;                  // 暂停开始的时间戳
let totalPausedTime = 0;             // 累计暂停时间
let startTimestamp = 0;              // 任务开始时的时间戳

const currentLocation = ref('等待开始');
const flightPhase = ref('准备发射');
const speed = ref('0.0');
const distToEarth = ref('--');
const distToMoon = ref('--');

const statusClass = computed(() => {
  if (!hasStarted.value) return 'status-ready';
  if (isPaused.value) return 'status-paused';
  if (flightPhase.value === '任务完成') return 'status-complete';
  return 'status-active';
});

const statusText = computed(() => {
  if (flightPhase.value === '任务完成') return '已完成';
  if (!hasStarted.value) return '待发射';
  if (isPaused.value) return '已暂停';
  return '飞行中';
});

const flightTime = computed(() => {
  const totalSeconds = Math.floor(missionElapsed.value);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}天 ${hours}小时`;
  if (hours > 0) return `${hours}小时 ${minutes}分`;
  return `${minutes}分 ${seconds}秒`;
});

// ===================== 常量定义 =====================
const EARTH_RADIUS = 6371000;           // 地球半径(m)
const MOON_RADIUS = 1737100;            // 月球半径(m)
const MOON_ORBIT_RADIUS = 384400000;    // 地月平均距离(m)
const MISSION_DURATION = 120;           // 任务总时长(秒)，仅用于演示

// 月球位置（放在 +X 方向）
const MOON_POS = new Cesium.Cartesian3(MOON_ORBIT_RADIUS, 0, 0);

// 近月轨道半径（绕月飞行时距月球中心的距离，约 100km 高度）
const LUNAR_ORBIT_RADIUS = MOON_RADIUS + 100000;

// ===================== 辅助函数 =====================

/**
 * 三次平滑插值 (smoothstep)
 */
const smoothstep = (t) => t * t * (3 - 2 * t);

/**
 * 在两个笛卡尔坐标之间进行线性插值
 */
const lerpVec3 = (a, b, t) => {
  return new Cesium.Cartesian3(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t
  );
};

/**
 * 计算两点间距离
 */
const distBetween = (a, b) => {
  return Cesium.Cartesian3.distance(a, b);
};

// ===================== 生成平滑任务轨迹 =====================
/**
 * 轨迹设计说明（椭圆轨道版）：
 * 1. 发射段 (0~0.10)：从地球表面上升至近地轨道 (LEO ~400km)
 * 2. 地月转移段 (0.10~0.45)：霍曼转移椭圆轨道，从 LEO 飞向月球
 * 3. 绕月段 (0.45~0.65)：以月球为中心，在近月轨道上绕飞
 * 4. 月地返回段 (0.65~0.90)：霍曼返回椭圆轨道，从月球飞回地球
 * 5. 再入段 (0.90~1.0)：减速并再入地球大气层
 */
const generateMissionPath = () => {
  const positions = [];
  const totalPoints = 1200;

  const leoAlt = 400000;
  const leoRadius = EARTH_RADIUS + leoAlt;

  const a = (leoRadius + MOON_ORBIT_RADIUS) / 2;
  const e = (MOON_ORBIT_RADIUS - leoRadius) / (MOON_ORBIT_RADIUS + leoRadius);
  const p = a * (1 - e * e);

  for (let i = 0; i <= totalPoints; i++) {
    const t = i / totalPoints;
    let pos;

    if (t < 0.10) {
      // ===== 发射段：从地球表面上升至 LEO =====
      const tt = t / 0.10;
      const st = smoothstep(tt);
      const r = EARTH_RADIUS + st * leoAlt;
      const angle = st * Math.PI * 0.3;
      pos = new Cesium.Cartesian3(
        r * Math.cos(angle),
        0,
        r * Math.sin(angle)
      );
    }
    else if (t < 0.45) {
      // ===== 地月转移段：霍曼转移椭圆轨道 =====
      const tt = (t - 0.10) / 0.35;
      const theta = Math.PI + tt * Math.PI;
      const r = p / (1 + e * Math.cos(theta));
      const worldAngle = theta - Math.PI / 2;
      pos = new Cesium.Cartesian3(
        r * Math.cos(worldAngle),
        0,
        r * Math.sin(worldAngle)
      );

      if (tt > 0.92) {
        const blendT = (tt - 0.92) / 0.08;
        const blend = smoothstep(blendT);
        const targetPos = new Cesium.Cartesian3(
          MOON_POS.x,
          0,
          LUNAR_ORBIT_RADIUS
        );
        pos = lerpVec3(pos, targetPos, blend * 0.7);
      }
    }
    else if (t < 0.65) {
      // ===== 绕月段：以月球为中心的圆形轨道 =====
      const tt = (t - 0.45) / 0.20;
      const angle = tt * Math.PI * 3;

      const orbitX = LUNAR_ORBIT_RADIUS * Math.cos(angle);
      const orbitZ = LUNAR_ORBIT_RADIUS * Math.sin(angle);

      pos = new Cesium.Cartesian3(
        MOON_POS.x + orbitX,
        MOON_POS.y,
        MOON_POS.z + orbitZ
      );

      if (tt < 0.08) {
        const blend = smoothstep(tt / 0.08);
        const entryPos = new Cesium.Cartesian3(
          MOON_POS.x + LUNAR_ORBIT_RADIUS,
          0,
          0
        );
        pos = lerpVec3(entryPos, pos, blend);
      }
    }
    else if (t < 0.90) {
      // ===== 月地返回段：霍曼返回椭圆轨道 =====
      const tt = (t - 0.65) / 0.25;
      const theta = tt * Math.PI;
      const r = p / (1 + e * Math.cos(theta));
      const worldAngle = theta + Math.PI / 2;
      pos = new Cesium.Cartesian3(
        r * Math.cos(worldAngle),
        0,
        r * Math.sin(worldAngle)
      );

      if (tt < 0.08) {
        const blend = smoothstep(tt / 0.08);
        const exitPos = new Cesium.Cartesian3(
          MOON_POS.x - LUNAR_ORBIT_RADIUS,
          0,
          0
        );
        pos = lerpVec3(exitPos, pos, blend);
      }

      if (tt > 0.92) {
        const blendT = (tt - 0.92) / 0.08;
        const blend = smoothstep(blendT);
        const targetPos = new Cesium.Cartesian3(
          EARTH_RADIUS + 300000,
          0,
          -200000
        );
        pos = lerpVec3(pos, targetPos, blend * 0.6);
      }
    }
    else {
      // ===== 再入段：减速并再入地球大气层 =====
      const tt = (t - 0.90) / 0.10;
      const st = smoothstep(tt);
      const r = EARTH_RADIUS + 300000 * (1 - st);
      const angle = Math.PI * 0.3 + st * Math.PI * 0.2;
      pos = new Cesium.Cartesian3(
        r * Math.cos(angle),
        0,
        -r * Math.sin(angle)
      );
    }

    positions.push(pos);
  }

  return positions;
};

const FLIGHT_PATH = generateMissionPath();

// 轨迹分段颜色
const phaseColors = [
  { start: 0.0, end: 0.10, color: Cesium.Color.RED },
  { start: 0.10, end: 0.45, color: Cesium.Color.YELLOW },
  { start: 0.45, end: 0.65, color: Cesium.Color.CYAN },
  { start: 0.65, end: 0.90, color: Cesium.Color.ORANGE },
  { start: 0.90, end: 1.0, color: Cesium.Color.GREEN }
];

// 创建分段轨迹线
const createSegmentedPath = (viewer, positions) => {
  phaseColors.forEach(phase => {
    const startIdx = Math.floor(phase.start * (positions.length - 1));
    const endIdx = Math.floor(phase.end * (positions.length - 1));
    const segmentPositions = positions.slice(startIdx, endIdx + 1);
    const entity = viewer.entities.add({
      polyline: {
        positions: segmentPositions,
        width: 6,
        material: phase.color,
        arcType: Cesium.ArcType.NONE
      }
    });
    pathEntities.push(entity);
  });
};

// ===================== 初始化 Cesium =====================
const initCesium = async () => {
  if (!cesiumContainer.value) return;

  viewer = new Cesium.Viewer(cesiumContainer.value, {
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    imageryProvider: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    skyBox: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    infoBox: false,
    selectionIndicator: false
  });

  viewer.scene.backgroundColor = Cesium.Color.BLACK;
  viewer.scene.globe.show = true;
  viewer.scene.globe.depthTestAgainstTerrain = false;
  viewer.scene.globe.enableLighting = true;
  viewer.scene.skyAtmosphere = new Cesium.SkyAtmosphere();

  viewer.scene.light = new Cesium.DirectionalLight({
    direction: new Cesium.Cartesian3(1.0, 0.0, 0.0),
    color: Cesium.Color.WHITE,
    intensity: 1.5
  });

  // 1. 添加天地图底图
  try {
    const tdtImg = new Cesium.UrlTemplateImageryProvider({
      url: `https://t{s}.tianditu.gov.cn/img_w/wmts?service=wmts&request=GetTile&version=1.0.0&layer=img&tilematrixset=w&format=tiles&tilematrix={z}&tilerow={y}&tilecol={x}&tk=${TD_MAP_KEY}`,
      subdomains: ['0', '1', '2', '3', '4', '5', '6', '7']
    });
    viewer.imageryLayers.addImageryProvider(tdtImg);

    const tdtCia = new Cesium.UrlTemplateImageryProvider({
      url: `https://t{s}.tianditu.gov.cn/cia_w/wmts?service=wmts&request=GetTile&version=1.0.0&layer=cia&tilematrixset=w&format=tiles&tilematrix={z}&tilerow={y}&tilecol={x}&tk=${TD_MAP_KEY}`,
      subdomains: ['0', '1', '2', '3', '4', '5', '6', '7']
    });
    viewer.imageryLayers.addImageryProvider(tdtCia);
  } catch (e) {
    console.warn('天地图加载失败，请检查密钥', e);
  }

  // 2. 地球标签
  viewer.entities.add({
    name: '地球',
    position: Cesium.Cartesian3.ZERO,
    label: {
      text: '🌍 地球',
      font: '14px sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -EARTH_RADIUS * 0.05),
      scaleByDistance: new Cesium.NearFarScalar(1e6, 1.0, 1e9, 0.3),
      translucencyByDistance: new Cesium.NearFarScalar(1e8, 1.0, 5e8, 0.0)
    }
  });

  // 3. 月球（使用图片材质，位于正确位置）
  const moonTextureUrl = 'https://threejs.org/examples/textures/planets/moon_1024.jpg';
  viewer.entities.add({
    name: '月球',
    position: MOON_POS,
    ellipsoid: {
      radii: new Cesium.Cartesian3(MOON_RADIUS, MOON_RADIUS, MOON_RADIUS),
      material: new Cesium.ImageMaterialProperty({
        image: moonTextureUrl,
        color: Cesium.Color.WHITE
      }),
      outline: true,
      outlineColor: Cesium.Color.LIGHTGRAY
    },
    label: {
      text: '🌙 月球',
      font: '14px sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -MOON_RADIUS * 0.15)
    }
  });

  // 4. 月球轨道（白色圆圈）
  const moonOrbitPoints = [];
  const steps = 360;
  for (let i = 0; i <= steps; i++) {
    const angle = Cesium.Math.toRadians(i);
    const x = MOON_ORBIT_RADIUS * Math.cos(angle);
    const y = MOON_ORBIT_RADIUS * Math.sin(angle);
    moonOrbitPoints.push(new Cesium.Cartesian3(x, y, 0));
  }
  viewer.entities.add({
    name: '月球轨道',
    polyline: {
      positions: moonOrbitPoints,
      width: 1,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.15,
        color: Cesium.Color.WHITE.withAlpha(0.3)
      })
    }
  });

  // 5. 绕月轨道指示（虚线圆圈，以月球为中心）
  const lunarOrbitPoints = [];
  for (let i = 0; i <= steps; i++) {
    const angle = Cesium.Math.toRadians(i);
    const x = MOON_POS.x + LUNAR_ORBIT_RADIUS * Math.cos(angle);
    const z = MOON_POS.z + LUNAR_ORBIT_RADIUS * Math.sin(angle);
    lunarOrbitPoints.push(new Cesium.Cartesian3(x, 0, z));
  }
  viewer.entities.add({
    name: '绕月轨道',
    polyline: {
      positions: lunarOrbitPoints,
      width: 1,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.2,
        color: Cesium.Color.CYAN.withAlpha(0.25)
      })
    }
  });

  // 6. 任务轨迹（分段彩色）
  createSegmentedPath(viewer, FLIGHT_PATH);

  // 7. 飞船模型
  const modelUri = '/static/modal/artemis_ii.gltf';
  let finalModelUri = modelUri;
  try {
    const response = await fetch(modelUri, { method: 'HEAD' });
    if (!response.ok) finalModelUri = 'https://sandcastle.cesium.com/SampleData/models/GroundVehicle.glb';
  } catch {
    finalModelUri = 'https://sandcastle.cesium.com/SampleData/models/GroundVehicle.glb';
  }

  artemisEntity = viewer.entities.add({
    name: 'Artemis II 飞船',
    position: FLIGHT_PATH[0],
    model: {
      uri: finalModelUri,
      scale: finalModelUri.includes('GroundVehicle') ? 2000 : 50000,
      minimumPixelSize: 80
    },
    point: {
      color: Cesium.Color.RED,
      pixelSize: 8,
      outlineColor: Cesium.Color.YELLOW,
      outlineWidth: 2
    }
  });

  // 8. 初始相机视角
  viewer.camera.flyTo({
    destination: new Cesium.Cartesian3(0, -MOON_ORBIT_RADIUS * 1.2, MOON_ORBIT_RADIUS * 0.3),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-15),
      roll: 0
    },
    duration: 0
  });

  isViewerReady.value = true;
};

// ===================== 飞船朝向更新 =====================
const updateOrientation = (currentPos, nextPos) => {
  const direction = new Cesium.Cartesian3();
  Cesium.Cartesian3.subtract(nextPos, currentPos, direction);
  if (Cesium.Cartesian3.magnitude(direction) < 1e-6) return null;
  Cesium.Cartesian3.normalize(direction, direction);

  const up = new Cesium.Cartesian3(0, 0, 1);
  const right = new Cesium.Cartesian3();
  Cesium.Cartesian3.cross(direction, up, right);
  if (Cesium.Cartesian3.magnitude(right) < 1e-6) {
    // direction 与 up 平行，使用备用 up
    Cesium.Cartesian3.cross(direction, new Cesium.Cartesian3(0, 1, 0), right);
  }
  Cesium.Cartesian3.normalize(right, right);
  const newUp = new Cesium.Cartesian3();
  Cesium.Cartesian3.cross(right, direction, newUp);
  Cesium.Cartesian3.normalize(newUp, newUp);

  const matrix = Cesium.Matrix3.fromColumns(right, newUp, direction, new Cesium.Matrix3());
  return Cesium.Quaternion.fromRotationMatrix(matrix);
};

// ===================== 动画循环 =====================
const animate = (timestamp) => {
  if (isPaused.value) {
    animationFrameId = requestAnimationFrame(animate);
    return;
  }

  // 计算帧间隔，累加到 missionElapsed（排除暂停时间）
  if (lastFrameTime > 0) {
    const dt = (timestamp - lastFrameTime) / 1000;
    missionElapsed.value += dt;
  }
  lastFrameTime = timestamp;

  const elapsed = missionElapsed.value;
  const progress = Math.min(elapsed / MISSION_DURATION, 1);

  // 更新飞行阶段和位置信息
  updateFlightInfo(progress);

  // 计算位置
  const idx = progress * (FLIGHT_PATH.length - 1);
  const i1 = Math.floor(idx);
  const i2 = Math.min(i1 + 1, FLIGHT_PATH.length - 1);
  const t = idx - i1;
  const currentPos = Cesium.Cartesian3.lerp(FLIGHT_PATH[i1], FLIGHT_PATH[i2], t, new Cesium.Cartesian3());

  if (artemisEntity) {
    artemisEntity.position = currentPos;
    if (i2 < FLIGHT_PATH.length - 1) {
      const orientation = updateOrientation(FLIGHT_PATH[i1], FLIGHT_PATH[i2]);
      if (orientation) artemisEntity.orientation = orientation;
    }
  }

  // 更新距离信息
  const earthDist = distBetween(currentPos, Cesium.Cartesian3.ZERO);
  const moonDist = distBetween(currentPos, MOON_POS);
  distToEarth.value = formatDistance(earthDist);
  distToMoon.value = formatDistance(moonDist);

  // 任务结束
  if (progress >= 1) {
    hasStarted.value = false;
    flightPhase.value = '任务完成';
    currentLocation.value = '地球';
    speed.value = '0.0';
    return;
  }

  animationFrameId = requestAnimationFrame(animate);
};

/**
 * 格式化距离显示
 */
const formatDistance = (meters) => {
  if (meters > 1000000) {
    return `${(meters / 1000000).toFixed(1)} 万km`;
  }
  if (meters > 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${meters.toFixed(0)} m`;
};

/**
 * 更新飞行阶段信息和速度
 */
const updateFlightInfo = (progress) => {
  // 速度模拟（基于真实数据的简化版本）
  // LEO 速度 ~7.8 km/s，地月转移 ~1-11 km/s，绕月 ~1.6 km/s
  let simulatedSpeed;
  if (progress < 0.10) {
    const tt = progress / 0.10;
    simulatedSpeed = tt * 7.8;
  } else if (progress < 0.45) {
    const tt = (progress - 0.10) / 0.35;
    simulatedSpeed = 7.8 - tt * 5.0 + Math.sin(tt * Math.PI) * 2.0;
  } else if (progress < 0.65) {
    simulatedSpeed = 1.6 + Math.sin(progress * 20) * 0.2;
  } else if (progress < 0.90) {
    const tt = (progress - 0.65) / 0.25;
    simulatedSpeed = 1.6 + tt * 9.0;
  } else {
    const tt = (progress - 0.90) / 0.10;
    simulatedSpeed = 11.0 * (1 - smoothstep(tt));
  }
  speed.value = simulatedSpeed.toFixed(1);

  // 阶段信息
  if (progress < 0.10) {
    flightPhase.value = '发射升空';
    currentLocation.value = '近地轨道';
  } else if (progress < 0.45) {
    flightPhase.value = '地月转移';
    if (progress < 0.28) {
      currentLocation.value = '转移轨道（近地段）';
    } else {
      currentLocation.value = '转移轨道（近月段）';
    }
  } else if (progress < 0.65) {
    flightPhase.value = '绕月飞行';
    currentLocation.value = '月球轨道';
  } else if (progress < 0.90) {
    flightPhase.value = '月地返回';
    if (progress < 0.78) {
      currentLocation.value = '返回轨道（近月段）';
    } else {
      currentLocation.value = '返回轨道（近地段）';
    }
  } else {
    flightPhase.value = '再入大气层';
    currentLocation.value = '地球';
  }
};

// ===================== 交互方法 =====================
const startMission = () => {
  if (!viewer || !artemisEntity) return;
  hasStarted.value = true;
  isPaused.value = false;
  missionElapsed.value = 0;
  totalPausedTime = 0;
  lastFrameTime = 0;
  flightPhase.value = '发射升空';
  currentLocation.value = '近地轨道';
  animationFrameId = requestAnimationFrame(animate);
};

const togglePause = () => {
  isPaused.value = !isPaused.value;
  if (isPaused.value) {
    // 暂停：记录暂停时间
    pauseStart = performance.now();
  } else {
    // 继续：重置 lastFrameTime 使下一帧不产生大的 dt
    lastFrameTime = 0;
  }
};

const resetView = () => {
  if (!viewer) return;
  viewer.camera.flyTo({
    destination: new Cesium.Cartesian3(0, -MOON_ORBIT_RADIUS * 1.2, MOON_ORBIT_RADIUS * 0.3),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-15), roll: 0 },
    duration: 1.5
  });
};

const followShip = () => {
  if (!viewer || !artemisEntity) return;
  const position = artemisEntity.position.getValue(Cesium.JulianDate.now());
  if (position) {
    viewer.camera.flyTo({
      destination: position,
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-25),
        roll: 0
      },
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-25), 5000),
      duration: 1
    });
  }
};

const viewMoon = () => {
  if (!viewer) return;
  viewer.camera.flyTo({
    destination: new Cesium.Cartesian3(
      MOON_POS.x + MOON_RADIUS * 3,
      MOON_POS.y - MOON_RADIUS * 2,
      MOON_POS.z + MOON_RADIUS * 2
    ),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-30),
      roll: 0
    },
    duration: 1.5
  });
};

const viewEarth = () => {
  if (!viewer) return;
  viewer.camera.flyTo({
    destination: new Cesium.Cartesian3(0, -EARTH_RADIUS * 4, EARTH_RADIUS * 2),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-30),
      roll: 0
    },
    duration: 1.5
  });
};

// ===================== 生命周期 =====================
onMounted(() => {
  initCesium();
});

onUnmounted(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  if (viewer) viewer.destroy();
});
</script>

<style scoped>
.app-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  font-family: 'Segoe UI', Roboto, sans-serif;
  background: #000;
}

.cesium-container {
  width: 100%;
  height: 100%;
}

.control-panel {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 1000;
  background: rgba(10, 20, 40, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 20px;
  padding: 20px;
  width: 300px;
  border: 1px solid rgba(0, 150, 255, 0.4);
  box-shadow: 0 8px 20px rgba(0,0,0,0.5);
  color: white;
  transition: all 0.3s;
}

.control-panel:hover {
  background: rgba(10, 20, 40, 0.95);
}

.panel-header {
  text-align: center;
  margin-bottom: 20px;
}

.panel-header h2 {
  margin: 0;
  font-size: 1.5rem;
  background: linear-gradient(135deg, #fff, #4caf50);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.subtitle {
  font-size: 0.8rem;
  color: #aaa;
  margin-top: 5px;
}

.info-section {
  background: rgba(0,0,0,0.4);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 20px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 0.9rem;
}

.info-item:last-child {
  margin-bottom: 0;
}

.info-label {
  color: #ccc;
}

.info-value {
  font-weight: bold;
  color: #ffd966;
}

.status-ready {
  color: #90caf9;
}

.status-active {
  color: #4caf50;
  text-shadow: 0 0 5px #4caf50;
}

.status-paused {
  color: #ff9800;
  text-shadow: 0 0 5px #ff9800;
}

.status-complete {
  color: #4caf50;
  text-shadow: 0 0 8px #4caf50;
}

.button-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.control-button {
  padding: 10px;
  border: none;
  border-radius: 10px;
  font-weight: bold;
  cursor: pointer;
  transition: 0.2s;
  background: #2c3e50;
  color: white;
}

.control-button.primary {
  background: linear-gradient(135deg, #1e88e5, #0d47a1);
}

.control-button.secondary {
  background: #546e7a;
}

.control-button.warning {
  background: linear-gradient(135deg, #ff9800, #e65100);
}

.control-button:hover {
  transform: translateY(-2px);
  filter: brightness(1.05);
}

.control-button:active {
  transform: translateY(0);
}

.control-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
