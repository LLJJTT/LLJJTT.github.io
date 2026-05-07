<template>
  <div class="default-earth">
    <!-- Cesium 容器 -->
    <div ref="cesiumContainer" class="cesium-container"></div>
    
    <!-- 首页标题 -->
    <div class="home-title">
      <h1>Cesium 3D 可视化平台</h1>
      <p>探索地球的无限可能</p>
    </div>

    <!-- 工具组件 -->
    <Tools />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
// 引入配置文件
import { TD_MAP_KEY } from '../config.js';
import Tools from '../components/Tools.vue';
// Cesium 相关变量
const cesiumContainer = ref(null);
let viewer = null;

/**
 * 创建天地图图层
 * @param {Object} viewer - Cesium Viewer 实例
 * @param {string} layerType - 图层类型：satellite/label
 * @returns {Object} - 图层实例
 */
const createTDLayer = (viewer, layerType) => {
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
  if (!config) return null;

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
};

/**
 * 初始化 Cesium
 */
const initCesium = () => {
  try {
    // 初始化前先清空之前的viewer实例
    if (window.cesiumViewer) {
      window.cesiumViewer.destroy();
      window.cesiumViewer = null;
    }
    
    // 初始化 Cesium Viewer
    viewer = new Cesium.Viewer(cesiumContainer.value, {
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
      imageryProvider: false
    });

    // 将viewer实例存储到window对象中
    window.cesiumViewer = viewer;

    // 创建并配置天地图图层
    createTDLayer(viewer, 'satellite');
    createTDLayer(viewer, 'label');

    // 设置相机初始位置
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(102.655488, 33.138425, 20060657),
      orientation: {
        heading: Cesium.Math.toRadians(359.86),
        pitch: Cesium.Math.toRadians(-87.01),
        roll: Cesium.Math.toRadians(359.94)
      },
      duration: 5
    });
  } catch (error) {
    console.error('Cesium 初始化失败：', error);
  }
};

/**
 * 销毁 Cesium 资源
 */
const destroyCesium = () => {
  if (viewer) {
    viewer.destroy();
    viewer = null;
  }
};

// Vue 生命周期钩子
onMounted(() => {
  if (cesiumContainer.value) {
    initCesium();
  }
});

onUnmounted(() => {
  destroyCesium();
});
</script>

<style scoped>
.default-earth {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.cesium-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.home-title {
  position: absolute;
  top: 10%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: white;
  z-index: 10;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  padding: 40px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
}

.home-title h1 {
  font-size: 36px;
  font-weight: 700;
  margin: 0 0 16px;
  background: linear-gradient(135deg, #ffffff, #3b82f6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
}

.home-title p {
  font-size: 18px;
  margin: 0;
  color: rgba(255, 255, 255, 0.8);
}

/* 隐藏 Cesium Viewer 底部元素和工具栏 */
:deep(.cesium-viewer-bottom),
:deep(.cesium-viewer-toolbar) {
  display: none !important;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .home-title {
    padding: 20px;
    margin: 0 20px;
  }
  
  .home-title h1 {
    font-size: 24px;
  }
  
  .home-title p {
    font-size: 14px;
  }
}
</style>