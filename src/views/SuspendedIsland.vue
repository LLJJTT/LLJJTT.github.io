<template>
  <div class="suspended-island-container">
    <!-- Loading效果 -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <div class="loading-text">渲染中...</div>
    </div>
    
    <!-- 顶部按钮切换 -->
    <div class="button-container">
      <button 
        v-for="city in cities" 
        :key="city.value"
        :class="['city-button', { active: selectedCity === city.value, disabled: isLoading }]"
        @click="switchCity(city.value)"
        :disabled="isLoading"
      >
        {{ city.label }}
      </button>
    </div>
    <!-- Cesium 容器 -->
    <div ref="cesiumContainerRef" class="cesium-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
// 引入配置文件
import { TD_MAP_KEY } from '../config.js';
let viewer = null;
const cesiumContainerRef = ref(null);
// 缓存边界效果实体ID，用于后续清空
const boundaryEntityIds = ref([]);

// 城市选项卡数据
const cities = ref([
  { label: '台湾省', value: '台湾省' },
  { label: '哈尔滨市', value: '哈尔滨市' },
  { label: '北京市', value: '北京市' }
]);
const selectedCity = ref('哈尔滨市'); // 默认选择哈尔滨市
const isLoading = ref(false); // 加载状态

// 创建天地图图层
const createTDLayer = (viewer, layerType) => {
  // 容错：检查TD_MAP_KEY是否有效
  if (!TD_MAP_KEY || typeof TD_MAP_KEY !== 'string' || TD_MAP_KEY.length === 0) {
    console.error('天地图密钥无效，请配置正确的TD_MAP_KEY');
    return null;
  }
  
  const layerConfigs = {
    satellite: {
      url: `https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${TD_MAP_KEY}`,
      zIndex: 0
    },
    label: {
      url: `https://t{s}.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${TD_MAP_KEY}`,
      zIndex: 1
    }
  };

  const config = layerConfigs[layerType];
  if (!config) {
    console.warn(`不支持的图层类型：${layerType}`);
    return null;
  }

  try {
    const layer = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      url: config.url,
      subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
      credit: '天地图',
      maximumLevel: 18,
      minimumLevel: 0,
      maximumScreenSpaceError: 0,
      disableDepthTestAgainstTerrain: true
    }));

    layer.zIndex = config.zIndex;
    return layer;
  } catch (error) {
    console.error(`创建${layerType}图层失败：`, error);
    return null;
  }
};

// 创建渐变Canvas纹理
function createGradientCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 500;
  const context = canvas.getContext('2d');
  
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, 'rgba(0, 255, 255, 0.8)');
  gradient.addColorStop(0.5, 'rgba(0, 255, 255, 0.4)');
  gradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
  
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  
  return canvas;
}

// 应用全局裁剪
async function applyGlobalClipping(geojsonData) {
  if (!viewer || !geojsonData) {
    throw new Error('Cesium实例或GeoJSON数据非法');
  }
  
  // 清空之前的裁剪集合和边界效果实体，避免数据累积
  if (viewer.scene.globe.clippingPolygons) {
    viewer.scene.globe.clippingPolygons.destroy();
    viewer.scene.globe.clippingPolygons = new Cesium.ClippingPolygonCollection({ enabled: false });
  }
  boundaryEntityIds.value.forEach(id => viewer.entities.removeById(id));
  boundaryEntityIds.value = [];
  
  const dataSource = await Cesium.GeoJsonDataSource.load(geojsonData);
  const entities = dataSource.entities.values;
  const clipPolygons = [];
  let allBoundaryPositions = [];
  
  entities.forEach(entity => {
    if (entity.polygon) {
      const hierarchy = entity.polygon.hierarchy.getValue();
      // 校验hierarchy和positions的合法性
      if (hierarchy && hierarchy.positions && Array.isArray(hierarchy.positions) && hierarchy.positions.length > 0) {
        clipPolygons.push(new Cesium.ClippingPolygon({
          positions: hierarchy.positions
        }));
        // 为每个实体单独添加边界效果，避免多个区域之间的链接线
        addBoundaryEffects(hierarchy.positions);
        // 收集所有位置用于计算中心点
        allBoundaryPositions = allBoundaryPositions.concat(hierarchy.positions);
      }
    }
  });
  
  if (clipPolygons.length === 0) {
    throw new Error('无有效裁剪区域数据');
  }
  
  viewer.scene.globe.clippingPolygons = new Cesium.ClippingPolygonCollection({
    polygons: clipPolygons,
    enabled: true,
    inverse: true
  });
  
  // 飞行到指定区域，使用Cesium的自动边界计算
  // 使用收集的所有边界点来计算边界球，确保完整显示裁剪区域
  if (allBoundaryPositions.length > 0) {
    const boundingSphere = Cesium.BoundingSphere.fromPoints(allBoundaryPositions);
    viewer.camera.flyToBoundingSphere(boundingSphere, {
      offset: {
        heading: Cesium.Math.toRadians(0.96),
        pitch: Cesium.Math.toRadians(-60), // 调整倾斜角度，向上移动视角
        range: boundingSphere.radius * 3 // 调整距离，拉高视角
      },
      duration: 3 // 飞行持续时间
    });
  }
}

// 添加发光边界和光墙
function addBoundaryEffects(positions) {
  if (!Array.isArray(positions) || positions.length === 0) {
    console.warn('边界坐标数组为空，无法添加视觉效果');
    return;
  }
  
  // 添加发光边界（保存实体ID，用于后续清空）
  const polylineEntity = viewer.entities.add({
    polyline: {
      positions: positions,
      width: 30,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.2,
        color: Cesium.Color.CYAN.withAlpha(0.8)
      }),
      clampToGround: true
    }
  });
  boundaryEntityIds.value.push(polylineEntity.id);
  
  // 校验positions长度，避免创建无效数组
  const positionLength = positions.length;
  if (positionLength <= 0 || positionLength > 4294967295) {
    console.warn('边界坐标数组长度非法，无法创建光墙');
    return;
  }
  
  // 添加渐变光墙（保存实体ID，用于后续清空）
  const wallEntity = viewer.entities.add({
    wall: {
      positions: positions,
      minimumHeights: new Array(positionLength).fill(-20000),
      maximumHeights: new Array(positionLength).fill(0),
      material: new Cesium.ImageMaterialProperty({
        image: createGradientCanvas(),
        transparent: true
      })
    }
  });
  boundaryEntityIds.value.push(wallEntity.id);
}

onMounted(() => {
  // 确保容器已完全挂载
  const timer = setTimeout(() => {
    if (cesiumContainerRef.value) {
      initCesium();
    } else {
      console.error('Cesium 容器挂载失败，无法初始化');
    }
    clearTimeout(timer);
  }, 100);
});

/**
 * 初始化 Cesium
 */
const initCesium = () => {
  try {
    // 初始化前先清空之前的viewer实例
    if (window.cesiumViewer) {
      window.cesiumViewer.destroy();
      delete window.cesiumViewer;
    }
    
    // 初始化 Cesium Viewer
    viewer = new Cesium.Viewer(cesiumContainerRef.value, {
      timeline: false,
      animation: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      baseLayerPicker: false,
      infoBox: false,
      selectionIndicator: false,
      navigationInstructionsInitiallyVisible: false,
      fullscreenButton: false,
      imageryProvider: false,
      contextOptions: { requestWebgl2: true }
    });

    // 将viewer实例存储到window对象中
    window.cesiumViewer = viewer;

    // 创建并配置天地图图层
    createTDLayer(viewer, 'satellite');
    createTDLayer(viewer, 'label');

    // 配置地球显示
    viewer.scene.skyBox.show = false; // 去掉天空盒
    viewer.scene.sun.show = true;
    viewer.scene.moon.show = false;
    viewer.scene.skyAtmosphere.show = false; // 去掉大气层
    viewer.scene.globe.translucency.enabled = false;
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0077be'); // 海洋蓝色
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#000000'); // 黑色背景
    
    // 开启深度测试
    viewer.scene.globe.depthTestAgainstTerrain = true;
    
    // 加载默认选择的城市边界数据
    loadCityBoundary(selectedCity.value);
  } catch (error) {
    console.error('Cesium 初始化失败：', error);
  }
};

/**
 * 加载指定城市的边界数据
 */
const loadCityBoundary = async (cityName) => {
  try {
    // 设置loading状态
    isLoading.value = true;
    
    // 加载本地GeoJSON文件
    const response = await fetch(`/src/data/${cityName}.geojson`);
    const geojsonData = await response.json();
    
    // 移除crs字段，避免Cesium不识别EPSG:4490
    if (geojsonData.crs) {
      delete geojsonData.crs;
    }
    
    // 应用裁剪
    await applyGlobalClipping(geojsonData);
  } catch (error) {
    console.error(`加载${cityName}边界数据失败：`, error);
  } finally {
    // 确保loading状态被关闭
    isLoading.value = false;
  }
};

/**
 * 切换城市
 */
const switchCity = (cityName) => {
  selectedCity.value = cityName;
  loadCityBoundary(cityName);
};

onUnmounted(() => {
  destroyCesium();
});

/**
 * 销毁 Cesium 资源
 */
const destroyCesium = () => {
  // 清空实体ID列表
  boundaryEntityIds.value = [];
  
  if (viewer) {
    viewer.destroy();
    viewer = null;
  }
  
  // 清空window上的引用
  if (window.cesiumViewer) {
    window.cesiumViewer.destroy();
    delete window.cesiumViewer;
  }
};
</script>

<style scoped>
/* 主容器样式 */
.suspended-island-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
  display: flex;
  flex-direction: column;
}

/* Loading遮罩层 */
.loading-overlay {
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid rgba(59, 130, 246, 0.4);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}

/* Loading旋转动画 */
.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(59, 130, 246, 0.2);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Loading文字 */
.loading-text {
  margin-left: 12px;
  color: white;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.5px;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* 按钮容器 */
.button-container {
  display: flex;
  gap: 15px;
  padding: 20px;
  z-index: 100;
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 12px;
  /* border: 1px solid rgba(59, 130, 246, 0.4); */
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}

/* 城市按钮 */
.city-button {
  padding: 12px 24px;
  background: rgba(30, 41, 59, 0.9);
  color: #94a3b8;
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.5px;
  backdrop-filter: blur(10px);
}

/* 按钮悬停效果 */
.city-button:hover {
  color: white;
  border-color: rgba(59, 130, 246, 0.8);
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.4);
  background: rgba(30, 41, 59, 0.95);
  transform: translateY(-2px);
}

/* 激活的按钮 */
.city-button.active {
  color: white;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  border-color: #3b82f6;
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.6);
  transform: translateY(-3px);
}

/* 禁用的按钮 */
.city-button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.city-button.disabled:hover {
  transform: none;
  box-shadow: none;
}

/* Cesium 容器样式 */
.cesium-container {
  flex: 1;
  width: 100%;
  overflow: hidden;
}

/* 隐藏 Cesium Viewer 底部元素和工具栏 */
:deep(.cesium-viewer-bottom),
:deep(.cesium-viewer-toolbar) {
  display: none !important;
}
</style>