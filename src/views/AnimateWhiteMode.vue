<template>
  <div class="app-container">
    <div class="top-left-controls">
      <div class="color-control-group">
        <div class="color-row">
          <label class="color-label">渐变颜色:</label>
          <input type="color" v-model="modelColorHex" class="color-input" @input="onColorChange" />
        </div>
        <div class="color-row">
          <label class="color-label">到</label>
          <input type="color" v-model="gradientColorHex" class="color-input" @input="onColorChange" />
        </div>
      </div>

      <div class="liquid-btn-group">
        <button @click="customShader2" :class="['liquid-btn', activeShader === 2 ? 'active' : '']">
          <span>动态光圈扫描</span>
        </button>
        <button @click="customShader3" :class="['liquid-btn', activeShader === 3 ? 'active' : '']">
          <span>清除效果</span>
        </button>
      </div>
    </div>

    <div ref="cesiumContainer" class="cesium-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { TD_MAP_KEY } from '../config.js';

const cesiumContainer = ref(null);
const activeShader = ref(0);
const modelColorHex = ref('#00aaff');
const gradientColorHex = ref('#ffffff');
let tileset = null;
let customShader = null;
let maxBuildingHeight = 150.0;

let colorizedImageryProvider = null;
let satelliteLayer = null;
let labelLayer = null;
let currentViewer = null;

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
 
}

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

const refreshSatelliteLayer = () => {
  if (!currentViewer || !colorizedImageryProvider) return;
  const oldLayer = satelliteLayer;
  if (oldLayer) {
    currentViewer.imageryLayers.remove(oldLayer);
  }
  satelliteLayer = currentViewer.imageryLayers.addImageryProvider(colorizedImageryProvider);
  satelliteLayer.zIndex = 0;
  if (labelLayer) {
    currentViewer.imageryLayers.raiseToTop(labelLayer);
  }
};

const initMapLayers = (viewer) => {
  currentViewer = viewer;
  colorizedImageryProvider = new ColorizedImageryProvider({
    url: `https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${TD_MAP_KEY}`,
    subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
    colorMode: 'normal',
    customColorRGB: { r: 58, g: 134, b: 255 },
    credit: '天地图',
    maximumLevel: 18,
    minimumLevel: 0
  });
  satelliteLayer = viewer.imageryLayers.addImageryProvider(colorizedImageryProvider);
  satelliteLayer.zIndex = 0;

  labelLayer = createLabelLayer(viewer);
};

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 0, g: 0.67, b: 1 };
};

const getTilesetMaxHeight = async (tileset) => {
  try {
    await tileset.readyPromise;
    let maxHeight = 75.0 + 80;
    const root = tileset.root;
    if (root && root.boundingVolume) {
      const boundingVolume = root.boundingVolume;
      if (boundingVolume.box) {
        const centerZ = boundingVolume.box[2];
        const halfZ = boundingVolume.box[11];
        maxHeight = centerZ + halfZ;
      } else if (boundingVolume.region) {
        maxHeight = boundingVolume.region[5];
      } else if (boundingVolume.sphere) {
        const centerZ = boundingVolume.sphere[2];
        const radius = boundingVolume.sphere[3];
        maxHeight = centerZ + radius;
      }
      if (isNaN(maxHeight) || maxHeight <= 75.0) {
        maxHeight = 155.0;
      }
    }
    maxHeight = Math.max(maxHeight + 5, 95.0);
    console.log(`模型最大高度: ${maxHeight.toFixed(2)} 米`);
    return maxHeight;
  } catch (error) {
    console.warn('获取模型最大高度失败，使用默认值:', error);
    return 155.0;
  }
};

const initCesium = () => {
  try {
    if (!cesiumContainer.value) {
      console.error('Cesium容器DOM元素不存在');
      return;
    }

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

    initMapLayers(newViewer);

    load3DTiles(newViewer);
  } catch (error) {
    console.error('Cesium 初始化失败：', error);
  }
};

const load3DTiles = async (viewer) => {
  try {
    tileset = await Cesium.Cesium3DTileset.fromUrl('/data/tileset.json');
    viewer.scene.primitives.add(tileset);
    maxBuildingHeight = await getTilesetMaxHeight(tileset);
    viewer.zoomTo(tileset);
  } catch (error) {
    console.error('加载3DTiles失败：', error);
  }
};

const onColorChange = () => {
  activeShader.value = 1;
  const baseColor = hexToRgb(modelColorHex.value);
  const gradientColor = hexToRgb(gradientColorHex.value);

  const shader = new Cesium.CustomShader({
    fragmentShaderText: `
      void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        vec3 positionMC = fsInput.attributes.positionMC;
        float height = positionMC.y;
        float maxHeight = ${maxBuildingHeight.toFixed(2)};
        float heightRatio = clamp(height / maxHeight, 0.0, 1.0);
        
        vec3 baseColor = vec3(${baseColor.r.toFixed(3)}, ${baseColor.g.toFixed(3)}, ${baseColor.b.toFixed(3)});
        vec3 gradientColor = vec3(${gradientColor.r.toFixed(3)}, ${gradientColor.g.toFixed(3)}, ${gradientColor.b.toFixed(3)});
        
        material.diffuse = mix(baseColor, gradientColor, heightRatio);
      }
    `
  });
  tileset.customShader = shader;
  customShader = shader;
};

const customShader2 = () => {
  activeShader.value = 2;
  const baseColor = hexToRgb(modelColorHex.value);
  const gradientColor = hexToRgb(gradientColorHex.value);
  const baseHeight = 0;
  const heightRange = 60.0;
  const glowRange = maxBuildingHeight - baseHeight;

  const shader = new Cesium.CustomShader({
    fragmentShaderText: `
      void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        vec3 positionMC = fsInput.attributes.positionMC;
        float height = positionMC.y;
        float maxHeight = ${maxBuildingHeight.toFixed(2)};
        float heightRatio = clamp(height / maxHeight, 0.0, 1.0);
        
        vec3 baseColor = vec3(${baseColor.r.toFixed(3)}, ${baseColor.g.toFixed(3)}, ${baseColor.b.toFixed(3)});
        vec3 gradientColor = vec3(${gradientColor.r.toFixed(3)}, ${gradientColor.g.toFixed(3)}, ${gradientColor.b.toFixed(3)});
        
        material.diffuse = mix(baseColor, gradientColor, heightRatio);

        if (height >= ${baseHeight}.0) {
          float _baseHeight = ${baseHeight}.0;
          float _heightRange = ${heightRange}.0;
          float _glowRange = ${glowRange.toFixed(2)};

          float vtxf_height = height - _baseHeight;
          float vtxf_a11 = fract(czm_frameNumber / 360.0) * 3.14159265 * 2.0;
          float vtxf_a12 = vtxf_height / _heightRange + sin(vtxf_a11) * 0.1;
          material.diffuse *= vec3(vtxf_a12, vtxf_a12, vtxf_a12);

          float vtxf_a13 = fract(czm_frameNumber / 360.0);
          float vtxf_h = clamp(vtxf_height / _glowRange, 0.0, 1.0);
          vtxf_a13 = abs(vtxf_a13 - 0.5) * 2.0;
          float vtxf_diff = step(0.01, abs(vtxf_h - vtxf_a13));
          material.diffuse += material.diffuse * (1.0 - vtxf_diff);
        }
      }
    `
  });
  tileset.customShader = shader;
  customShader = shader;
};

const customShader3 = () => {
  activeShader.value = 3;
  clearShader();
};

const clearShader = () => {
  if (tileset) {
    tileset.customShader = undefined;
  }
  customShader = null;
};

const destroyCesium = () => {
  clearShader();

  if (tileset && window.cesiumViewer) {
    window.cesiumViewer.scene.primitives.remove(tileset);
    tileset = null;
  }

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
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.color-control-group {
  display: flex;
  gap: 16px;
  background: rgba(15, 25, 45, 0.4);
  backdrop-filter: blur(8px);
  padding: 8px 16px;
  border-radius: 60px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
}

.color-row {
  display: flex;
  align-items: center;
  gap: 8px;
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

.liquid-btn-group {
  display: flex;
  gap: 16px;
  background: rgba(15, 25, 45, 0.3);
  backdrop-filter: blur(8px);
  padding: 8px 16px;
  border-radius: 60px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
}

.liquid-btn {
  position: relative;
  padding: 8px 24px;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.9);
  background: transparent;
  border: none;
  border-radius: 40px;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.35s cubic-bezier(0.2, 0.9, 0.4, 1.1);
  backdrop-filter: blur(4px);
  font-family: inherit;
}

.liquid-btn span {
  position: relative;
  z-index: 2;
}

.liquid-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(120deg, 
    rgba(64, 128, 255, 0.2) 0%,
    rgba(100, 180, 255, 0.3) 30%,
    rgba(64, 128, 255, 0.2) 60%,
    rgba(40, 100, 210, 0.2) 100%);
  border-radius: 40px;
  opacity: 0.6;
  transition: opacity 0.4s ease;
  z-index: 1;
}

.liquid-btn:hover::before {
  animation: liquidFlow 1.2s ease-in-out infinite;
  background: linear-gradient(120deg, 
    rgba(80, 150, 255, 0.4) 0%,
    rgba(120, 200, 255, 0.5) 30%,
    rgba(80, 150, 255, 0.4) 60%,
    rgba(60, 120, 230, 0.3) 100%);
  background-size: 200% 100%;
}

@keyframes liquidFlow {
  0% {
    background-position: 0% 50%;
    opacity: 0.5;
  }
  50% {
    background-position: 100% 50%;
    opacity: 0.8;
  }
  100% {
    background-position: 0% 50%;
    opacity: 0.5;
  }
}

.liquid-btn.active {
  color: white;
  background: rgba(64, 128, 255, 0.3);
  box-shadow: 0 0 12px rgba(64, 128, 255, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(64, 128, 255, 0.6);
}

.liquid-btn.active::before {
  background: linear-gradient(120deg, 
    rgba(64, 128, 255, 0.5) 0%,
    rgba(100, 180, 255, 0.7) 30%,
    rgba(64, 128, 255, 0.5) 60%,
    rgba(40, 100, 210, 0.4) 100%);
  opacity: 0.9;
  animation: liquidFlow 1.8s ease-in-out infinite;
}

.liquid-btn:not(.active):hover {
  background: rgba(64, 128, 255, 0.2);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.liquid-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(64, 128, 255, 0.5), 0 0 0 4px rgba(0, 0, 0, 0.2);
}
</style>
