<template>
  <div class="app-container">
    <div class="top-left-controls">
      <div class="map-style-group">
        <button @click="setMapStyle('normal')" :class="['style-btn', mapStyleMode === 'normal' ? 'active' : '']">
          <span>普通底图</span>
        </button>
        <div class="color-picker-wrapper">
          <label class="color-label">底图色调:</label>
          <input type="color" v-model="customColorHex" class="color-input" @input="onCustomColorChange" />
        </div>
      </div>
    </div>

    <div ref="cesiumContainer" class="cesium-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { TD_MAP_KEY } from '../config.js';

const cesiumContainer = ref(null);

const mapStyleMode = ref('normal');
const customColorHex = ref('#3a86ff');
let colorizedImageryProvider = null;
let satelliteLayer = null;
let labelLayer = null;
let currentViewer = null;

/**
 * 支持实时颜色映射的瓦片提供器
 * 仅保留普通模式和自定义色调模式，暗黑模式已移除
 */
class ColorizedImageryProvider extends Cesium.UrlTemplateImageryProvider {
  constructor(options) {
    super(options);
    this._tilingScheme = new Cesium.WebMercatorTilingScheme();
    this.colorMode = options.colorMode || 'normal';
    this.customColorRGB = options.customColorRGB || { r: 58, g: 134, b: 255 };
  }

  get tilingScheme() {
    return this._tilingScheme;
  }

  requestImage(x, y, level, request) {
    const promise = super.requestImage(x, y, level, request);
    if (!promise) {
      return undefined;
    }
    return promise
      .then(async (image) => {
        if (!image) return image;
        return await this.processImage(image);
      })
      .catch((error) => {
        console.warn('瓦片加载失败，使用原图', error);
        return null;
      });
  }

  async processImage(image) {
    // 普通模式直接返回原图
    if (this.colorMode === 'normal') {
      return image;
    }

    // 自定义色调模式：根据目标RGB对灰度进行染色
    if (this.colorMode === 'custom') {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const { r: tr, g: tg, b: tb } = this.customColorRGB;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // 计算灰度值
        const gray = r * 0.299 + g * 0.587 + b * 0.114;
        // 应用目标色调，保留一定亮度层次
        data[i] = Math.min(255, gray * (tr / 255) * 1.2);
        data[i + 1] = Math.min(255, gray * (tg / 255) * 1.2);
        data[i + 2] = Math.min(255, gray * (tb / 255) * 1.2);
      }

      context.putImageData(imageData, 0, 0);
      return await createImageBitmap(canvas);
    }

    return image;
  }

  updateColorMode(mode, customRGB = null) {
    this.colorMode = mode;
    if (customRGB) {
      this.customColorRGB = customRGB;
    }
  }
}

/**
 * 创建天地图标注图层（置于影像图层之上）
 */
const createLabelLayer = (viewer) => {
  const layer = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
    url: `https://t{s}.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${TD_MAP_KEY}`,
    subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
    credit: '天地图',
    maximumLevel: 18,
    minimumLevel: 0,
    maximumScreenSpaceError: 0,
    disableDepthTestAgainstTerrain: true
  }));
  layer.zIndex = 1;
  return layer;
};

/**
 * 刷新影像图层（由于修改色调后需要重新生成瓦片，通过移除再添加的方式强制刷新）
 */
const refreshSatelliteLayer = () => {
  if (!currentViewer || !colorizedImageryProvider) return;
  const oldLayer = satelliteLayer;
  if (oldLayer) {
    currentViewer.imageryLayers.remove(oldLayer);
  }
  satelliteLayer = currentViewer.imageryLayers.addImageryProvider(colorizedImageryProvider);
  satelliteLayer.zIndex = 0;
  // 确保标注图层在影像之上
  if (labelLayer) {
    currentViewer.imageryLayers.raiseToTop(labelLayer);
  }
};

/**
 * 初始化地图图层
 */
const initMapLayers = (viewer) => {
  currentViewer = viewer;
  colorizedImageryProvider = new ColorizedImageryProvider({
    url: `https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${TD_MAP_KEY}`,
    subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
    colorMode: 'normal',
    customColorRGB: { r: 58, g: 134, b: 255 },
    credit: '天地图(色调可调)',
    maximumLevel: 18,
    minimumLevel: 0
  });
  satelliteLayer = viewer.imageryLayers.addImageryProvider(colorizedImageryProvider);
  satelliteLayer.zIndex = 0;

  labelLayer = createLabelLayer(viewer);
};

/**
 * 根据当前模式更新地图样式（普通或自定义）
 */
const updateMapStyle = () => {
  if (!colorizedImageryProvider) return;

  if (mapStyleMode.value === 'normal') {
    colorizedImageryProvider.updateColorMode('normal');
  } else if (mapStyleMode.value === 'custom') {
    const hex = customColorHex.value.slice(1);
    const customRGB = {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16)
    };
    colorizedImageryProvider.updateColorMode('custom', customRGB);
  }

  refreshSatelliteLayer();
};

/**
 * 颜色选择器变化事件：自动切换到自定义模式并应用所选颜色
 */
const onCustomColorChange = () => {
  // 如果当前是普通模式，自动切换到自定义模式
  if (mapStyleMode.value !== 'custom') {
    mapStyleMode.value = 'custom';
  }
  updateMapStyle();
};

/**
 * 设置地图样式（普通或自定义）
 */
const setMapStyle = (mode) => {
  mapStyleMode.value = mode;
  updateMapStyle();
};

/**
 * 将相机定位到中国区域（默认视角）
 */
const flyToChina = (viewer) => {
  if (!viewer) return;
  // 定位中国主体区域
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(102.655488, 33.138425, 20060657),
    orientation: {
      heading: Cesium.Math.toRadians(359.86),
      pitch: Cesium.Math.toRadians(-87.01),
      roll: Cesium.Math.toRadians(359.94)
    },
    duration: 5
  });
};

/**
 * 初始化Cesium视图
 */
const initCesium = () => {
  try {
    if (!cesiumContainer.value) {
      console.error('Cesium容器DOM元素不存在');
      return;
    }

    // 销毁已有实例
    if (window.cesiumViewer) {
      window.cesiumViewer.destroy();
      window.cesiumViewer = null;
    }

    const newViewer = new Cesium.Viewer(cesiumContainer.value, {
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
      geocoder: false,
      imageryProvider: false,
      shouldAnimate: true,
    });

    window.cesiumViewer = newViewer;

    // 初始化自定义图层
    initMapLayers(newViewer);

    // 默认定位到中国
    flyToChina(newViewer);
  } catch (error) {
    console.error('Cesium 初始化失败：', error);
  }
};

const destroyCesium = () => {
  if (window.cesiumViewer) {
    window.cesiumViewer.destroy();
    window.cesiumViewer = null;
  }
};

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
.app-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  font-family: 'Segoe UI', 'Poppins', 'Roboto', sans-serif;
}

.cesium-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.top-left-controls {
  position: absolute;
  z-index: 1000;
  left: 20px;
  top: 20px;
}

.map-style-group {
  display: flex;
  gap: 12px;
  align-items: center;
  background: rgba(15, 25, 45, 0.4);
  backdrop-filter: blur(8px);
  padding: 8px 20px;
  border-radius: 60px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
  width: fit-content;
}

.style-btn {
  padding: 6px 20px;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
  background: transparent;
  border: none;
  border-radius: 40px;
  cursor: pointer;
  transition: all 0.25s ease;
  font-family: inherit;
  backdrop-filter: blur(2px);
}

.style-btn:hover {
  background: rgba(64, 128, 255, 0.25);
  color: white;
  transform: translateY(-1px);
}

.style-btn.active {
  background: rgba(64, 128, 255, 0.5);
  color: white;
  box-shadow: 0 0 8px rgba(64, 128, 255, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.color-picker-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
  padding-left: 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.25);
}

.color-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  letter-spacing: 0.5px;
}

.color-input {
  width: 32px;
  height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  cursor: pointer;
  background: transparent;
  padding: 0;
  outline: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}

.color-input::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-input::-webkit-color-swatch {
  border: none;
  border-radius: 50%;
}

.color-input:hover {
  transform: scale(1.05);
}
</style>