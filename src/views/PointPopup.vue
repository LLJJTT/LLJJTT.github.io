<template>
  <div class="point-popup-container">
    <div ref="cesiumContainer" class="cesium-container"></div>
    
    <div 
      v-if="showPopup" 
      class="custom-popup"
      :style="{ left: popupPosition.x + 'px', top: popupPosition.y + 'px' }"
    >
      <div class="popup-header">
        <h3>{{ currentPointData.name }}</h3>
        <button class="close-btn" @click="closePopup">×</button>
      </div>
      <div class="popup-content">
        <div class="popup-item">
          <span class="label">经度:</span>
          <span class="value">{{ currentPointData.longitude.toFixed(6) }}</span>
        </div>
        <div class="popup-item">
          <span class="label">纬度:</span>
          <span class="value">{{ currentPointData.latitude.toFixed(6) }}</span>
        </div>
        <div class="popup-item">
          <span class="label">类型:</span>
          <span class="value">{{ currentPointData.type }}</span>
        </div>
        <div class="popup-item">
          <span class="label">描述:</span>
          <span class="value">{{ currentPointData.description }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { TD_MAP_KEY } from '../config.js';
import marker6 from '../assets/marker6.png';

const cesiumContainer = ref(null);
let viewer = null;
let entities = [];
let selectedEntity = null;
let screenPositionListener = null;

const showPopup = ref(false);
const popupPosition = ref({ x: 0, y: 0 });
const currentPointData = ref({});

const pointData = [
  {
    id: 1,
    name: '北京',
    longitude: 116.4074,
    latitude: 39.9042,
    type: '首都',
    description: '中华人民共和国首都，政治、文化中心'
  },
  {
    id: 2,
    name: '上海',
    longitude: 121.4737,
    latitude: 31.2304,
    type: '直辖市',
    description: '中国最大的经济中心，国际金融都市'
  },
  {
    id: 3,
    name: '广州',
    longitude: 113.2644,
    latitude: 23.1291,
    type: '省会',
    description: '华南地区政治、经济、文化中心'
  },
  {
    id: 4,
    name: '深圳',
    longitude: 114.0579,
    latitude: 22.5431,
    type: '经济特区',
    description: '中国改革开放的窗口，科技创新中心'
  },
  {
    id: 5,
    name: '成都',
    longitude: 104.0668,
    latitude: 30.5728,
    type: '省会',
    description: '西南地区科技、商贸、金融中心'
  }
];

const createTDLayer = (viewer, layerType) => {
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

const createPointMarker = (data) => {
  const entity = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(data.longitude, data.latitude),
    billboard: {
      image: marker6,
      width: 60,
      height: 60,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      scaleByDistance: new Cesium.NearFarScalar(1000, 1, 500000, 0.5),
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    },
    data: data
  });
  
  entities.push(entity);
  return entity;
};

const updatePopupPosition = () => {
  if (!selectedEntity || !showPopup.value || !viewer || !viewer.scene) {
    return;
  }
  
  try {
    const position = selectedEntity.position.getValue(viewer.clock.currentTime);
    if (!position) {
      return;
    }
    
    let canvasPosition;
    // 使用 cartesianToCanvasCoordinates
    if (!canvasPosition && viewer.scene && viewer.scene.cartesianToCanvasCoordinates) {
      canvasPosition = viewer.scene.cartesianToCanvasCoordinates(position);
    }
    
    if (canvasPosition) {
      // 调整气泡位置，使其显示在图标上方，倒三角指向图标
      popupPosition.value = {
        x: canvasPosition.x - 160, // 向左偏移，使气泡中心对齐图标
        y: canvasPosition.y - 340  // 向上偏移，确保倒三角指向图标
      };
    }
  } catch (error) {
    console.error('更新气泡位置时出错:', error);
  }
};

const handlePointClick = (entity) => {
  if (selectedEntity === entity) {
    closePopup();
    return;
  }
  
  selectedEntity = entity;
  currentPointData.value = entity.data;
  showPopup.value = true;
  
  updatePopupPosition();
  
  if (!screenPositionListener) {
    screenPositionListener = viewer.scene.postRender.addEventListener(() => {
      if (showPopup.value && selectedEntity) {
        updatePopupPosition();
      }
    });
  }
  
  viewer.flyTo(entity, {
    duration: 1,
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 500000)
  });
};

const closePopup = () => {
  showPopup.value = false;
  selectedEntity = null;
  
  if (screenPositionListener) {
    screenPositionListener();
    screenPositionListener = null;
  }
};



const initCesium = () => {
  try {
    if (window.cesiumViewer) {
      window.cesiumViewer.destroy();
      delete window.cesiumViewer;
    }
    
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

    window.cesiumViewer = viewer;

    createTDLayer(viewer, 'satellite');
    createTDLayer(viewer, 'label');

    pointData.forEach(data => {
      createPointMarker(data);
    });

    viewer.screenSpaceEventHandler.setInputAction((movement) => {
      const pickedObject = viewer.scene.pick(movement.position);
      
      if (Cesium.defined(pickedObject) && pickedObject.id) {
        const entity = pickedObject.id;
        if (entity.billboard) {
          handlePointClick(entity);
        }
      } else {
        closePopup();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(110.0, 35.0, 5000000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-90),
        roll: 0
      },
      duration: 3
    });
  } catch (error) {
    console.error('Cesium 初始化失败：', error);
  }
};

const destroyCesium = () => {
  if (screenPositionListener) {
    screenPositionListener();
    screenPositionListener = null;
  }
  
  entities.forEach(entity => {
    viewer.entities.remove(entity);
  });
  entities = [];
  
  if (viewer) {
    viewer.destroy();
    viewer = null;
  }
  
  if (window.cesiumViewer) {
    window.cesiumViewer.destroy();
    delete window.cesiumViewer;
  }
  
  selectedEntity = null;
};

onMounted(() => {
  const timer = setTimeout(() => {
    if (cesiumContainer.value) {
      initCesium();
    } else {
      console.error('Cesium 容器挂载失败，无法初始化');
    }
    clearTimeout(timer);
  }, 100);
});

onUnmounted(() => {
  destroyCesium();
});
</script>

<style scoped>
.point-popup-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.cesium-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.custom-popup {
  position: absolute;
  z-index: 1000;
  min-width: 320px;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.98));
  backdrop-filter: blur(24px);
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 20px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 
              0 0 30px rgba(59, 130, 246, 0.3);
  transform: translate(0, 0);
  animation: popupFadeIn 0.4s ease-out;
  /* 移除 overflow: hidden 以允许倒三角显示 */
}

/* 添加倒三角指向坐标图标 */
.custom-popup::after {
  content: '';
  position: absolute;
  bottom: -12px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 14px solid transparent;
  border-right: 14px solid transparent;
  border-top: 14px solid rgba(30, 41, 59, 0.98);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  z-index: -1; /* 确保倒三角在气泡下方 */
}

@keyframes popupFadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
    scale: 0.9;
  }
  to {
    opacity: 1;
    transform: translateY(0);
    scale: 1;
  }
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(99, 102, 241, 0.3));
  border-bottom: 1px solid rgba(59, 130, 246, 0.4);
  position: relative;
  overflow: hidden;
}

.popup-header::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6);
}

.popup-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #ffffff;
  background: linear-gradient(135deg, #ffffff, #93c5fd);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(220, 38, 38, 0.3));
  color: #fca5a5;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.2);
}

.close-btn:hover {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.5), rgba(220, 38, 38, 0.5));
  color: #ef4444;
  transform: rotate(90deg) scale(1.1);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
}

.popup-content {
  padding: 20px 24px;
  background: rgba(15, 23, 42, 0.4);
}

.popup-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid rgba(59, 130, 246, 0.15);
  transition: all 0.2s ease;
}

.popup-item:hover {
  background: rgba(59, 130, 246, 0.05);
  padding-left: 10px;
  border-radius: 8px;
}

.popup-item:last-child {
  border-bottom: none;
}

.popup-item .label {
  font-size: 14px;
  color: #94a3b8;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.popup-item .value {
  font-size: 15px;
  color: #f1f5f9;
  font-weight: 600;
  text-align: right;
  max-width: 65%;
  word-break: break-all;
  background: linear-gradient(135deg, #e2e8f0, #cbd5e1);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.popup-footer {
  padding: 16px 24px;
  background: rgba(15, 23, 42, 0.6);
  border-top: 1px solid rgba(59, 130, 246, 0.3);
}

.action-btn {
  width: 100%;
  padding: 12px 24px;
  background: linear-gradient(135deg, #3b82f6, #6366f1, #8b5cf6);
  border: none;
  border-radius: 12px;
  color: #ffffff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
  position: relative;
  overflow: hidden;
}

.action-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.6s ease;
}

.action-btn:hover::before {
  left: 100%;
}

.action-btn:hover {
  background: linear-gradient(135deg, #2563eb, #4f46e5, #7c3aed);
  box-shadow: 0 8px 25px rgba(59, 130, 246, 0.6);
  transform: translateY(-3px);
}

.action-btn:active {
  transform: translateY(0);
  box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
}

:deep(.cesium-viewer-bottom),
:deep(.cesium-viewer-toolbar) {
  display: none !important;
}
</style>