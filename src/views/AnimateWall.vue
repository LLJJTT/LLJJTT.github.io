<template>
  <div class="app-container">
    
    <Tools
    />
    <!-- 颜色选择器 - 细长条设计 -->
    <div class="color-picker">
      <div class="color-options">
        <button 
          v-for="color in colorOptions" 
          :key="color.name"
          :class="['color-btn', { active: selectedColor.name === color.name }]"
          :style="{ backgroundColor: color.hex }"
          @click="changeWallColor(color)"
          :title="color.name"
        ></button>
      </div>
    </div>
    
    <!-- Cesium 容器：必须设置宽高，否则无法渲染 -->
    <div ref="cesiumContainer" class="cesium-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import Tools from '../components/Tools.vue';
// 引入配置文件
import { TD_MAP_KEY } from '../config.js';

// 引入动态墙体纹理图片
import wallImage from '../assets/wall.png';

// 核心参数配置 - 集中管理，方便后续修改
const WALL_CONFIG = {
  // 墙体高度配置
  minimumHeight: 0,          // 墙体底部高度
  maximumHeight: 100,        // 墙体顶部高度
  
  // 材质动画配置
  duration: 2500,            // 动画持续时间（毫秒）
  
  // 着色器参数
  shader: {
    count: 4.0,              // 渐变带数量
    freely: 'vertical',      // 流动方向：vertical（上下）或 standard（左右）
    direction: '-',          // 流动方向：+（正向）或 -（反向）
    linewidth: 0.25,         // 渐变带粗细（0.25适配wall.png，0.1更细/0.3稍粗）
    emissionIntensity: 0.4   // 泛光强度，避免颜色过亮
  },
  
  // 墙体外观
  opacity: 0.99,              // 透明度（0.9保留渐变层次感）
  
  // 颜色配置
  defaultColor: Cesium.Color.WHITE  // 默认白色（保留wall.png本身渐变）
};

/**
 * 带方向的墙体着色器
 * @param {Object} options 配置参数
 * @param {boolean} options.get 是否获取着色器代码
 * @param {number} options.count 数量
 * @param {string} options.freely 方向：vertical（由下到上）或 standard（逆时针）
 * @param {string} options.direction 方向：+ 或 -
 * @param {number} options.linewidth 线宽
 * @param {number} options.emissionIntensity 泛光强度
 * @returns {string} 着色器代码
 */
function getDirectionWallShader(options) {
  if (!options || !options.get) {
    return '';
  }
  
  // 使用配置参数或默认值
  const count = options.count || WALL_CONFIG.shader.count;
  const freely = options.freely || WALL_CONFIG.shader.freely;
  const direction = options.direction || WALL_CONFIG.shader.direction;
  const linewidth = options.linewidth || WALL_CONFIG.shader.linewidth;
  const emissionIntensity = options.emissionIntensity || WALL_CONFIG.shader.emissionIntensity;
  
  let materialShader = `
    czm_material czm_getMaterial(czm_materialInput materialInput) {
      czm_material material = czm_getDefaultMaterial(materialInput);
      vec2 st = materialInput.st;
  `;
  
  if (freely === 'vertical') {
    // 由下到上流动
    materialShader += `
      // 初始帧time过渡，避免采样异常
      float safeTime = clamp(time, 0.0, 1.0);
      vec4 colorImage = texture(image, vec2(fract(st.s), fract(float(${count})*st.t*${linewidth} ${direction} safeTime)));
      // alpha兜底：避免初始帧透明导致闪烁
      colorImage.a = max(colorImage.a, 0.1);
    `;
  } else {
    // 逆时针流动
    materialShader += `
      float safeTime = clamp(time, 0.0, 1.0);
      vec4 colorImage = texture(image, vec2(fract(float(${count})*st.s*${linewidth} ${direction} safeTime), fract(st.t)));
      colorImage.a = max(colorImage.a, 0.1);
    `;
  }
  
  // 泛光效果
  materialShader += `
      vec4 fragColor;
      // 增强自定义颜色的影响，同时保留纹理的流动效果
      vec3 finalColor = mix(colorImage.rgb, color.rgb, 0.7); // 70%自定义颜色，30%纹理颜色
      fragColor.rgb = finalColor;
      fragColor.a = colorImage.a * ${WALL_CONFIG.opacity}; // 统一透明度
      fragColor = czm_gammaCorrect(fragColor);
      
      // 让diffuse和emission都使用混合后的颜色
      material.diffuse = finalColor;
      material.alpha = fragColor.a;
      material.emission = finalColor * ${emissionIntensity};
      return material;
    }
  `;
  
  return materialShader;
}

/**
 * 动态墙材质属性类
 * @param {Object} options 配置参数
 * @param {Cesium.Color} options.color 颜色，默认白色
 * @param {number} options.duration 持续时间，毫秒，默认2500
 * @param {string} options.trailImage 贴图地址，默认wall.png
 * @param {Cesium.Viewer} options.viewer Cesium Viewer实例
 */
function DynamicWallMaterialProperty(options) {
  this._definitionChanged = new Cesium.Event();
  this._color = undefined;
  this._colorSubscription = undefined;
  this.color = options.color || WALL_CONFIG.defaultColor;
  this.duration = options.duration || WALL_CONFIG.duration;
  this.trailImage = options.trailImage || wallImage;
  this._time = new Date().getTime();
  this._viewer = options.viewer; // 保存viewer实例，用于请求渲染
}

// 定义属性描述符
Object.defineProperties(DynamicWallMaterialProperty.prototype, {
  isConstant: {
    get: function () {
      return false;
    }
  },
  definitionChanged: {
    get: function () {
      return this._definitionChanged;
    }
  },
  color: Cesium.createPropertyDescriptor('color')
});

// 生成唯一的材质类型名称，避免冲突
const MATERIAL_TYPE = 'DynamicWall' + parseInt(Math.random() * 1000);

/**
 * 获取材质类型
 * @param {Cesium.JulianDate} time 时间
 * @returns {string} 材质类型
 */
DynamicWallMaterialProperty.prototype.getType = function (time) {
  return MATERIAL_TYPE;
};

/**
 * 获取材质值
 * @param {Cesium.JulianDate} time 时间
 * @param {Object} result 结果对象
 * @returns {Object} 材质值
 */
DynamicWallMaterialProperty.prototype.getValue = function (time, result) {
  if (!Cesium.defined(result)) {
    result = {};
  }
  
  result.color = Cesium.Property.getValueOrClonedDefault(
    this._color,
    time,
    Cesium.Color.WHITE,
    result.color
  );
  result.image = this.trailImage;
  
  // 安全计算time，避免初始帧负数/NaN
  if (this.duration) {
    const elapsed = Math.max(0, new Date().getTime() - this._time);
    result.time = (elapsed % this.duration) / this.duration;
  } else {
    result.time = 0;
  }
  
  // 请求场景重新渲染
  if (this._viewer && this._viewer.scene) {
    this._viewer.scene.requestRender();
  }
  
  return result;
};

/**
 * 比较材质是否相等
 * @param {Object} other 另一个材质
 * @returns {boolean} 是否相等
 */
DynamicWallMaterialProperty.prototype.equals = function (other) {
  return (
    this === other ||
    (other instanceof DynamicWallMaterialProperty &&
      Cesium.Property.equals(this._color, other._color))
  );
};

// 注册材质到Cesium材质缓存
if (typeof Cesium !== 'undefined') {
  Cesium.Material._materialCache.addMaterial(MATERIAL_TYPE, {
    fabric: {
      type: MATERIAL_TYPE,
      uniforms: {
        color: new Cesium.Color(1.0, 1.0, 1.0, WALL_CONFIG.opacity), // 默认白色，保留wall.png渐变
        image: wallImage, // 初始绑定实际纹理，替换默认占位图
        time: 0
      },
      source: getDirectionWallShader({
        get: true,
        count: WALL_CONFIG.shader.count,
        freely: WALL_CONFIG.shader.freely,
        direction: WALL_CONFIG.shader.direction,
        linewidth: WALL_CONFIG.shader.linewidth,
        emissionIntensity: WALL_CONFIG.shader.emissionIntensity
      })
    },
    translucent: function () {
      return true;
    }
  });
  
  // 添加到Cesium全局对象
  Cesium.DynamicWallMaterialProperty = DynamicWallMaterialProperty;
}

/**
 * 绘制动态墙效果
 * @param {Cesium.Viewer} viewer Cesium Viewer实例
 * @param {Array<Array<number>>} coordinates 坐标数组，格式：[[lon, lat], [lon, lat], ...]
 * @param {Cesium.Color|string} color 颜色
 * @returns {Cesium.Entity|null} 墙体实体，失败返回null
 */
function drawDynamicWall(viewer, coordinates, color) {
  // 确保Cesium已加载
  if (typeof Cesium === 'undefined') {
    console.error('Cesium is not loaded');
    return null;
  }
  
  // 确保viewer有效
  if (!viewer) {
    console.error('Viewer is undefined');
    return null;
  }
  
  // 确保坐标有效
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
    console.error('Invalid coordinates, need at least 3 points');
    return null;
  }
  
  // 确保color是Cesium.Color对象
  const wallColor = color instanceof Cesium.Color 
    ? color 
    : Cesium.Color.fromCssColorString(color || '#FFFFFF');
  
  // 将经纬度坐标转换为Cesium笛卡尔坐标
  const cartesianCoordinates = coordinates.map(coord => {
    return Cesium.Cartesian3.fromDegrees(coord[0], coord[1], 0);
  });
  
  // 闭合多边形
  const firstPos = cartesianCoordinates[0];
  const lastPos = cartesianCoordinates[cartesianCoordinates.length - 1];
  if (firstPos && lastPos && !Cesium.Cartesian3.equalsEpsilon(firstPos, lastPos, 1e-6)) {
    cartesianCoordinates.push(firstPos);
  }
  
  // 同步高度数组长度
  const pointCount = cartesianCoordinates.length;
  const maximumHeights = new Array(pointCount).fill(WALL_CONFIG.maximumHeight);
  const minimumHeights = new Array(pointCount).fill(WALL_CONFIG.minimumHeight);
  
  // 创建动态材质实例
  const dynamicMaterial = new Cesium.DynamicWallMaterialProperty({
    color: wallColor,
    duration: WALL_CONFIG.duration,
    trailImage: wallImage,
    viewer: viewer
  });
  
  // 绘制墙体
  const wallEntity = viewer.entities.add({
    name: '动态墙效果',
    wall: {
      positions: cartesianCoordinates,
      maximumHeights: maximumHeights,
      minimumHeights: minimumHeights,
      material: dynamicMaterial,
      show: true
    }
  });
  
  // 保存材质实例到墙体实体上，以便在关闭时能够正确清除
  wallEntity._materialInstance = dynamicMaterial;
  
  return wallEntity;
};

// Cesium 相关变量
const cesiumContainer = ref(null); // 容器 DOM 引用
let viewer = null; // Cesium Viewer 实例
let currentOutlineEntity = null; // 动态墙实体对象
let imageryLayers = {}; // 图层引用集合
let dynamicWallMaterial = null; // 动态墙材质实例

// 墙体围栏坐标数据
const wallCoordinates = [
  [124.85494820221486, 46.39299841890931],
  [124.85437527250163, 46.39261809453681],
  [124.85428434562529, 46.39191211509367],
  [124.85461466531423, 46.38942666842337],
  [124.85990628674652, 46.38835990509117],
  [124.86775724975378, 46.386695439234074],
  [124.8668195015688, 46.391185293475424]
];

// 颜色选项配置
const colorOptions = [
  { name: '绿色', hex: '#34c759', cesiumColor: new Cesium.Color(0.2, 0.78, 0.35, 1.0) },
  { name: '蓝色', hex: '#007aff', cesiumColor: new Cesium.Color(0, 0.48, 1.0, 1.0) },
  { name: '红色', hex: '#ff3b30', cesiumColor: new Cesium.Color(1.0, 0.23, 0.19, 1.0) },
  { name: '黄色', hex: '#ffcc00', cesiumColor: new Cesium.Color(1.0, 0.8, 0, 1.0) },
  { name: '紫色', hex: '#af52de', cesiumColor: new Cesium.Color(0.69, 0.32, 0.87, 1.0) },
  { name: '青色', hex: '#5ac8fa', cesiumColor: new Cesium.Color(0.35, 0.78, 0.98, 1.0) },
  { name: '橙色', hex: '#ff9500', cesiumColor: new Cesium.Color(1.0, 0.59, 0, 1.0) },
  { name: '白色', hex: '#ffffff', cesiumColor: new Cesium.Color(1.0, 1.0, 1.0, 1.0) },
];

// 选中的颜色
const selectedColor = ref(colorOptions[0]);

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
 * 计算坐标数组的中心点
 * @param {Array<Array<number>>} coordinates 坐标数组，格式：[[lon, lat], [lon, lat], ...]
 * @returns {Array<number>} 中心点坐标，格式：[lon, lat]
 */
const calculateCenterPoint = (coordinates) => {
  if (!coordinates || coordinates.length === 0) {
    return [0, 0];
  }

  let lonSum = 0;
  let latSum = 0;
  
  for (const coord of coordinates) {
    lonSum += coord[0];
    latSum += coord[1];
  }
  
  return [lonSum / coordinates.length, latSum / coordinates.length];
};

/**
 * 设置相机初始位置为墙体围栏区域
 */
const setInitialCameraPosition = () => {
  setTimeout(() => {
    if (viewer) {
      // 计算墙体围栏的包围球
      const positions = wallCoordinates.map(coord => Cesium.Cartesian3.fromDegrees(coord[0], coord[1]));
      const boundingSphere = Cesium.BoundingSphere.fromPoints(positions);
      
      // 平滑飞行到包围球，确保整个墙体可见且居中
      viewer.camera.flyToBoundingSphere(boundingSphere, {
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(0),
          Cesium.Math.toRadians(-40),
          2000 // 距离球体中心的距离
        ),
        duration: 5,
        easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT
      });
    }
  }, 1500);
};

/**
 * 初始化 Cesium 并绘制动态墙
 */
const initCesium = () => {
  try {
    // 初始化前先清空之前的viewer实例
    if (window.cesiumViewer) {
      console.log('发现之前的Cesium Viewer实例，正在销毁...');
      window.cesiumViewer.destroy();
      window.cesiumViewer = null;
      console.log('之前的Cesium Viewer实例已销毁');
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

    // 将viewer实例存储到window对象中，供其他组件使用
    window.cesiumViewer = viewer;
    console.log('Cesium Viewer创建成功，并已存储到window.cesiumViewer');
    console.log('window.cesiumViewer:', window.cesiumViewer);
    console.log('window.cesiumViewer类型:', typeof window.cesiumViewer);

    // 创建并配置天地图图层
    imageryLayers.satellite = createTDLayer(viewer, 'satellite');
    imageryLayers.label = createTDLayer(viewer, 'label');

    // 绘制带流动动画的电子围栏/动态墙
    currentOutlineEntity = drawDynamicWall(viewer, wallCoordinates, selectedColor.value.cesiumColor);
    
    // 保存材质实例，用于后续颜色更新
    if (currentOutlineEntity && currentOutlineEntity._materialInstance) {
      dynamicWallMaterial = currentOutlineEntity._materialInstance;
    }

    // 设置相机初始位置，等待地球和地图渲染完成
    setInitialCameraPosition();

    // 强制渲染场景，确保墙体立即显示
    viewer.scene.requestRender();
  } catch (error) {
    console.error('Cesium 初始化/动态墙绘制失败：', error);
  }
};

/**
 * 切换动态墙颜色
 * @param {Object} color 选中的颜色对象
 */
const changeWallColor = (color) => {
  selectedColor.value = color;
  
  // 更新动态墙颜色
  if (dynamicWallMaterial) {
    dynamicWallMaterial.color = color.cesiumColor;
    
    // 强制渲染场景，立即更新颜色
    if (viewer) {
      viewer.scene.requestRender();
    }
  }
};

/**
 * 销毁 Cesium 资源，避免内存泄漏
 */
const destroyCesium = () => {
  if (currentOutlineEntity && viewer) {
    viewer.entities.remove(currentOutlineEntity);
    currentOutlineEntity = null;
  }
  
  if (viewer) {
    viewer.destroy();
    viewer = null;
  }
  
  // 清空引用
  imageryLayers = {};
  dynamicWallMaterial = null;
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
/* 主容器样式 */
.app-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

/* 颜色选择器样式 - 单行细长条毛玻璃效果 */
.color-picker {
  position: absolute;
  top: 20px;
  left: 20px;
  /* 毛玻璃效果 */
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  
  /* 边框和阴影 */
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  
  /* 内边距 */
  padding: 8px 12px;
  z-index: 1000;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* 颜色选项容器 - 单行布局 */
.color-options {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 颜色按钮样式 - 超小圆形 */
.color-btn {
  width: 20px;
  height: 20px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  background: transparent;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.color-btn:hover {
  transform: scale(1.2);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.25);
  border:2px solid rgba(255, 255, 255, 1);
}

.color-btn.active {
  transform: scale(1.2);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  border:2px solid rgba(255, 255, 255, 1);
}

/* 隐藏原生按钮样式 */
.color-btn::-moz-focus-inner {
  border: 0;
  padding: 0;
}

.color-btn:focus {
  outline: none;
}

/* Cesium 容器样式：必须设置宽高，否则无法渲染 */
.cesium-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

/* 隐藏 Cesium Viewer 底部元素和工具栏 */
:deep(.cesium-viewer-bottom),
:deep(.cesium-viewer-toolbar) {
  display: none !important;
}
</style>