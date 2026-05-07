<template>
  <div class="animate-line">
    <div ref="cesiumContainer" class="cesium-container"></div>
    <!-- 控制面板：liquid风格，位于左上角（无图标） -->
    <div class="control-panel liquid-glass">
      <h3>光线穿梭调控</h3>
      
      <div class="control-group">
        <div class="group-title">路网</div>
        <div class="control-item">
          <label>颜色</label>
          <div class="color-picker-wrapper">
            <input type="color" v-model="baseColorHex" />
          </div>
        </div>
        <div class="control-item">
          <label>透明度 <span>{{ baseAlpha.toFixed(2) }}</span></label>
          <input type="range" v-model.number="baseAlpha" min="0" max="1" step="0.05" />
        </div>
      </div>

      <div class="control-group">
        <div class="group-title">光线</div>
        <div class="control-item">
          <label>速度 <span>{{ lightSpeed.toFixed(1) }}</span></label>
          <input type="range" v-model.number="lightSpeed" min="0" max="100" step="1" />
        </div>
        <div class="control-item">
          <label>主色</label>
          <div class="color-picker-wrapper">
            <input type="color" v-model="lightColorHex" />
          </div>
        </div>
        <div class="control-item">
          <label>高光色</label>
          <div class="color-picker-wrapper">
            <input type="color" v-model="glowColorHex" />
          </div>
        </div>
        <div class="control-item">
          <label>长度 <span>{{ lightWidth.toFixed(2) }}</span></label>
          <input type="range" v-model.number="lightWidth" min="0.02" max="2" step="0.005" />
        </div>
        <div class="control-item">
          <label>强度 <span>{{ intensityFactor.toFixed(1) }}</span></label>
          <input type="range" v-model.number="intensityFactor" min="0.5" max="3.0" step="0.1" />
        </div>
      </div>
      
      <button @click="resetParams" class="reset-btn">重置默认</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { TD_MAP_KEY } from '../config.js';

const cesiumContainer = ref(null);
let viewer = null;
// 优化内存：只保留一个合并后的Primitive
let mergedLinePrimitive = null;
let flowMaterialInstance = null; // 共享材质实例

// --- 可调控参数（响应式，新默认值）---
const lightSpeed = ref(21);           // 光线移动速度 0~100，默认10
const lightColorHex = ref('#00ccff'); // 光线主色（亮青色）
const baseColorHex = ref('#000000');  // 基底色（黑色）- 控制路网线条颜色
const baseAlpha = ref(0.9);           // 路网透明度
const glowColorHex = ref('#ffffff');  // 高光色（纯白）
const lightWidth = ref(0.13);         // 光线长度（占路径比例）
const intensityFactor = ref(3.0);     // 强度系数

// 辅助函数：将hex颜色转为Cesium.Color
const hexToCesiumColor = (hex, alpha = 1.0) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new Cesium.Color(r, g, b, alpha);
};

// 默认参数重置
const resetParams = () => {
  lightSpeed.value = 21;
  lightColorHex.value = '#00ccff';
  baseColorHex.value = '#0a0f1a';
  baseAlpha.value = 0.9;
  glowColorHex.value = '#ffffff';
  lightWidth.value = 0.13;
  intensityFactor.value = 3.0;
};

// 更新材质uniforms（高效，仅更新共享材质实例）
const updateMaterialUniforms = () => {
  if (!flowMaterialInstance) return;
  
  const lightColor = hexToCesiumColor(lightColorHex.value);
  const baseColor = hexToCesiumColor(baseColorHex.value, baseAlpha.value);
  const glowColor = hexToCesiumColor(glowColorHex.value);
  
  flowMaterialInstance.uniforms.lightSpeed = lightSpeed.value;
  flowMaterialInstance.uniforms.lightWidth = lightWidth.value;
  flowMaterialInstance.uniforms.intensityFactor = intensityFactor.value;
  flowMaterialInstance.uniforms.lightColor = new Cesium.Cartesian3(lightColor.red, lightColor.green, lightColor.blue);
  flowMaterialInstance.uniforms.baseColor = new Cesium.Cartesian3(baseColor.red, baseColor.green, baseColor.blue);
  flowMaterialInstance.uniforms.glowColor = new Cesium.Cartesian3(glowColor.red, glowColor.green, glowColor.blue);
  flowMaterialInstance.uniforms.baseAlpha = baseAlpha.value;
};

// 监听参数变化，实时更新材质（高效，只更新uniforms）
watch([lightSpeed, lightColorHex, baseColorHex, baseAlpha, glowColorHex, lightWidth, intensityFactor], () => {
  updateMaterialUniforms();
});

/**
 * 工具函数：轨迹重采样（补点），让短轨迹更顺滑
 * @param {Array} positions - 原始坐标数组
 * @param {Number} step - 采样步长（米），越小越顺滑
 * @returns {Array} 重采样后的坐标数组
 */
const resampleLinePositions = (positions, step = 12) => {
  if (!positions || positions.length < 2) return positions;
  
  const resampled = [positions[0]];
  let currentPos = positions[0];
  
  for (let i = 1; i < positions.length; i++) {
    const targetPos = positions[i];
    const distance = Cesium.Cartesian3.distance(currentPos, targetPos);
    
    if (distance > step) {
      const stepsCount = Math.ceil(distance / step);
      for (let j = 1; j < stepsCount; j++) {
        const t = j / stepsCount;
        const interpolated = Cesium.Cartesian3.lerp(currentPos, targetPos, t, new Cesium.Cartesian3());
        resampled.push(interpolated);
      }
    }
    resampled.push(targetPos);
    currentPos = targetPos;
  }
  return resampled;
};

/**
 * 核心：光线穿梭材质（基于当前全局参数）
 * @returns {Cesium.Material} 可调控的材质
 */
const createFlowParticleMaterial = () => {
  const lightColor = hexToCesiumColor(lightColorHex.value);
  const baseColor = hexToCesiumColor(baseColorHex.value, baseAlpha.value);
  const glowColor = hexToCesiumColor(glowColorHex.value);
  
  return new Cesium.Material({
    fabric: {
      type: 'RacingLightMaterial',
      uniforms: {
        baseColor: new Cesium.Cartesian3(baseColor.red, baseColor.green, baseColor.blue),
        lightColor: new Cesium.Cartesian3(lightColor.red, lightColor.green, lightColor.blue),
        glowColor: new Cesium.Cartesian3(glowColor.red, glowColor.green, glowColor.blue),
        baseAlpha: baseAlpha.value,
        lightWidth: lightWidth.value,
        lightSpeed: lightSpeed.value,
        intensityFactor: intensityFactor.value
      },
      source: `
        czm_material czm_getMaterial(czm_materialInput materialInput)
        {
          czm_material material = czm_getDefaultMaterial(materialInput);
          vec2 st = materialInput.st;
          
          // 时间驱动：速度值直接控制流动速率（0~100，速度快慢分明）
          float time = czm_frameNumber * 0.0005 * lightSpeed;
          float phase = fract(time);
          float distToLight = abs(st.s - phase);
          
          float intensity = exp(-pow(distToLight / lightWidth, 2.0)) * intensityFactor;
          float trailIntensity = 0.0;
          if (distToLight > lightWidth && distToLight < lightWidth * 2.5) {
            trailIntensity = (1.0 - (distToLight - lightWidth) / (lightWidth * 1.5)) * 0.6;
          }
          intensity = clamp(intensity + trailIntensity, 0.0, 2.2);
          
          float pulse = 0.8 + 0.4 * sin(phase * 35.0 - time * 25.0);
          intensity *= pulse;
          
          vec3 finalColor = baseColor;
          finalColor += lightColor * intensity * 1.2;
          finalColor += glowColor * intensity * intensity * 0.9;
          
          material.diffuse = finalColor;
          material.alpha = baseAlpha + intensity * 0.85;
          return material;
        }
      `
    }
  });
};

/**
 * 创建天地图图层
 */
const createTDLayer = (viewer, layerType) => {
  const layerConfigs = {
    satellite: {
      url: `https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${TD_MAP_KEY}`,
      zIndex: 0, alpha: 0.85
    }
  };
  const config = layerConfigs[layerType];
  if (!config) return null;

  const layer = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
    url: config.url, subdomains: ['0','1','2','3','4','5','6','7'],
    credit: '天地图', maximumLevel: 18
  }));
  layer.zIndex = config.zIndex;
  layer.alpha = config.alpha;
  return layer;
};

/**
 * 清除所有路网Primitive（内存优化：只清除合并的Primitive）
 */
const clearLinePrimitive = () => {
  if (!viewer) return;
  if (mergedLinePrimitive) {
    viewer.scene.primitives.remove(mergedLinePrimitive);
    mergedLinePrimitive = null;
  }
  // 释放材质引用
  if (flowMaterialInstance) {
    flowMaterialInstance = null;
  }
};

/**
 * 加载并渲染路网（优化内存：合并所有路段为单个Primitive）
 */
const loadLineData = async (viewer) => {
  try {
    clearLinePrimitive();
    
    // 关键优化：不将dataSource添加到场景，只用于读取几何数据，避免重复渲染和内存浪费
    const dataSource = await Cesium.GeoJsonDataSource.load('/src/data/line_1.json');
    const routes = dataSource.entities.values;
    
    if (!routes || routes.length === 0) {
      console.warn('未找到任何路线数据');
      return;
    }

    const geometryInstances = [];
    let validSegmentCount = 0;
    let totalBoundingBox = null;

    for (const route of routes) {
      let positions = null;
      if (route.polyline && route.polyline.positions) {
        positions = route.polyline.positions.getValue ? 
                    route.polyline.positions.getValue(Cesium.JulianDate.now()) : 
                    route.polyline.positions._value;
      }
      if (!positions || positions.length < 2) continue;
      
      const validPositions = positions.filter(pos => pos && !isNaN(pos.x) && !isNaN(pos.y) && !isNaN(pos.z));
      if (validPositions.length < 2) continue;
      
      const resampledPos = resampleLinePositions(validPositions, 12);
      if (resampledPos.length < 2) continue;
      
      // 动态线宽（基于长度自适应）
      let segmentLength = 0;
      for (let i = 1; i < resampledPos.length; i++) {
        segmentLength += Cesium.Cartesian3.distance(resampledPos[i-1], resampledPos[i]);
      }
      let lineWidth = Math.min(9, Math.max(5, Math.floor(segmentLength / 150) + 5));
      if (segmentLength < 200) lineWidth = 8;
      
      // 创建几何实例（每个路段独立线宽，但共享材质）
      const geometryInstance = new Cesium.GeometryInstance({
        geometry: new Cesium.PolylineGeometry({
          positions: resampledPos,
          width: lineWidth,
          vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT
        }),
        id: `segment_${validSegmentCount}`
      });
      
      geometryInstances.push(geometryInstance);
      validSegmentCount++;
      
      // 累计包围盒
      if (!totalBoundingBox) {
        totalBoundingBox = {
          minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity
        };
      }
      resampledPos.forEach(pos => {
        const cartographic = Cesium.Cartographic.fromCartesian(pos);
        totalBoundingBox.minX = Math.min(totalBoundingBox.minX, cartographic.longitude);
        totalBoundingBox.maxX = Math.max(totalBoundingBox.maxX, cartographic.longitude);
        totalBoundingBox.minY = Math.min(totalBoundingBox.minY, cartographic.latitude);
        totalBoundingBox.maxY = Math.max(totalBoundingBox.maxY, cartographic.latitude);
      });
    }
    
    if (geometryInstances.length === 0) {
      console.warn('没有有效的路段数据');
      return;
    }
    
    // 关键优化：创建共享材质实例（所有路段共用，大幅减少内存）
    flowMaterialInstance = createFlowParticleMaterial();
    
    const appearance = new Cesium.PolylineMaterialAppearance({
      material: flowMaterialInstance,
      translucent: true,
      closed: false,
      renderState: {
        depthTest: { enabled: true },
        blending: Cesium.BlendingState.ALPHA_BLEND
      }
    });
    
    // 关键优化：合并所有路段为单个Primitive，减少draw call和内存占用
    mergedLinePrimitive = new Cesium.Primitive({
      geometryInstances: geometryInstances,
      appearance: appearance,
      show: true
    });
    
    viewer.scene.primitives.add(mergedLinePrimitive);
    console.log(`成功加载 ${validSegmentCount} 条独立路段（已合并为单个Primitive），光线穿梭效果已启用，内存占用优化`);
    
    // 相机定位
    if (totalBoundingBox && 
        isFinite(totalBoundingBox.minX) && isFinite(totalBoundingBox.maxX)) {
      const centerLon = (totalBoundingBox.minX + totalBoundingBox.maxX) / 2;
      const centerLat = (totalBoundingBox.minY + totalBoundingBox.maxY) / 2;
      const lonRange = Math.abs(totalBoundingBox.maxX - totalBoundingBox.minX);
      const latRange = Math.abs(totalBoundingBox.maxY - totalBoundingBox.minY);
      const maxRange = Math.max(lonRange, latRange) * 111000;
      let altitude = Math.max(2000, maxRange * 1.2);
      altitude = Math.min(altitude, 30000);
      
      setTimeout(() => {
        viewer?.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(centerLon * 180 / Math.PI, centerLat * 180 / Math.PI, altitude),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0
          },
          duration: 2.5
        });
      }, 500);
    } else {
      setTimeout(() => {
        viewer?.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(106.54072, 29.457231, 12000),
          orientation: {
            heading: Cesium.Math.toRadians(354.98),
            pitch: Cesium.Math.toRadians(-50),
            roll: 0
          },
          duration: 2.5
        });
      }, 500);
    }
    
  } catch (error) {
    console.error('加载线数据失败：', error);
  }
};

/**
 * 初始化Cesium
 */
const initCesium = () => {
  try {
    if (window.cesiumViewer) {
      window.cesiumViewer.destroy();
      window.cesiumViewer = null;
    }

    viewer = new Cesium.Viewer(cesiumContainer.value, {
      timeline: false, animation: false, homeButton: false,
      sceneModePicker: false, navigationHelpButton: false,
      baseLayerPicker: false, infoBox: false, selectionIndicator: false,
      fullscreenButton: false, imageryProvider: false,
      targetFrameRate: 60,
      contextOptions: {
        webgl: {
          alpha: true,
          preserveDrawingBuffer: false
        }
      }
    });
    window.cesiumViewer = viewer;

    viewer.scene.globe.showGroundAtmosphere = false;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.postProcessStages.fxaa.enabled = true;
    viewer.scene.highDynamicRange = true;
    
    createTDLayer(viewer, 'satellite');
    loadLineData(viewer);
  } catch (error) {
    console.error('Cesium初始化失败：', error);
  }
};

const destroyCesium = () => {
  if (viewer) {
    clearLinePrimitive();
    viewer.scene.primitives.removeAll();
    viewer.destroy();
    viewer = null;
  }
};

onMounted(() => {
  cesiumContainer.value && initCesium();
});

onUnmounted(() => {
  destroyCesium();
});
</script>

<style scoped>
.animate-line {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
.cesium-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
:deep(.cesium-viewer-bottom),
:deep(.cesium-viewer-toolbar) {
  display: none !important;
}

/* liquid风格控制面板（无图标） */
.control-panel {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 100;
  /* width: 260px; */
  padding: 16px 20px;
  border-radius: 20px;
  /* background: rgba(20, 28, 40, 0.65); */
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #f0f3fa;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  transition: all 0.2s ease;
}
.control-panel h3 {
  margin: 0 0 14px 0;
  font-size: 1.2rem;
  font-weight: 500;
  letter-spacing: 1px;
  text-align: center;
  color: #fff;
  border-bottom: 1px solid rgba(255,255,255,0.2);
  padding-bottom: 8px;
}
.control-group {
  margin-bottom: 16px;
  border-bottom:1px  solid #6a7887;
}
.group-title {
  font-size: 0.9rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255,255,255,0.5);
  margin-bottom: 10px;
  padding-left: 2px;
}
.control-item {
  margin-bottom: 10px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
}
.control-item label {
  font-size: 0.85rem;
  font-weight: 500;
  display: flex;
  justify-content: space-between;
  letter-spacing: 0.5px;
  min-width: 120px;
}
.control-item span {
  color: #ffc285;
  font-weight: 600;
}
input[type="range"] {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  background: rgba(255,255,255,0.2);
  border-radius: 2px;
  outline: none;
}
input[type="range"]:focus {
  outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ffb347;
  cursor: pointer;
  box-shadow: 0 0 4px #ffb347;
  border: none;
}
input[type="color"] {
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(0,0,0,0.3);
  border-radius: 4px;
  cursor: pointer;
  padding: 2px;
}
.color-picker-wrapper {
  display: flex;
  justify-content: flex-start;
}
.reset-btn {
  width: 100%;
  margin-top: 12px;
  padding: 8px 0;
  background: rgba(255, 180, 70, 0.25);
  border: 1px solid rgba(255, 180, 70, 0.6);
  border-radius: 40px;
  color: #ffd8aa;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
  backdrop-filter: blur(4px);
}
.reset-btn:hover {
  background: rgba(255, 180, 70, 0.45);
  color: #fff;
  border-color: #ffb347;
  box-shadow: 0 0 8px rgba(255,180,70,0.4);
}
</style>