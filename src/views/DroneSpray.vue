<template>
  <div class="app-container">
    
    <!-- 左侧控制面板 -->
    <div class="control-panel">
      
      
      <!-- 控制按钮组 -->
      <div class="button-section">
        <button 
          v-if="!hasStarted" 
          @click="startMission" 
          class="control-button primary"
          :disabled="!isViewerReady"
        >
          开始
        </button>
        
        <template v-if="hasStarted">
          <button 
            @click="togglePause" 
            :class="['control-button', isPaused ? 'secondary' : 'warning']"
          >
            {{ isPaused ? '继续' : '暂停' }}
          </button>
        </template>
      </div>
    </div>
    
    <!-- 绘制区域组件 -->
    <Tools/>
    
    <!-- Cesium 容器 -->
    <div ref="cesiumContainer" class="cesium-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

// 引入配置文件
import { TD_MAP_KEY } from '../config.js';

// 引入自定义组件
import Tools from '../components/Tools.vue';

// ==============================================
// 核心配置（可随时修改）
// ==============================================
const CONFIG = {
  drone: {
    modelUrl: '/static/modal/CesiumDrone.glb',
    scale: 3.0, // 无人机模型大小
    height: 60, // 飞行高度（米）
    pitch: -15,
    minimumPixelSize: 10, // 最小像素大小，确保远处可见
    maximumScale: 500, // 最大缩放比例
    heightOffset: 0 // 无人机向上偏移
  },
  area: {
    coordinates: [
      [133.083935, 47.729674],
      [133.083704, 47.719309],
      [133.099809, 47.718895],
      [133.099513, 47.729559],
      [133.084099, 47.729731],
      [133.083935, 47.729674]
    ]
  },
  mission: {
    height: 50, // 喷洒高度（米），棱锥底面距离地面高度
    radius: 6, // 喷洒半径（米）
    speed: 20, // 飞行速度（米/秒）
    sprayWidth: 50, // 喷洒宽度（米），与视角棱锥大小一致
    sprayOverlap: 0.8 // 喷洒重叠率，确保覆盖均匀
  }
};

// ==============================================
// 状态变量
// ==============================================
const cesiumContainer = ref(null); // 容器 DOM 引用
const isViewerReady = ref(false); // 标记viewer是否已初始化完成
const hasStarted = ref(false); // 标记任务是否已开始
const isPaused = ref(false); // 标记任务是否已暂停
const droneEntity = ref(null); // 无人机实体
const sprayCone = ref(null); // 喷洒锥（旧版圆锥）
const frustumPrimitives = ref([]); // 视椎体 primitive 数组
const frustumOutlinePrimitives = ref([]); // 视椎体轮廓线 primitive 数组
const sprayedAreas = ref([]); // 已喷洒的区域
const isMissionActive = ref(false); // 任务状态
const savedClockTime = ref(null); // 保存暂停时的时间
const preUpdateListeners = ref([]); // 场景更新事件监听器数组

// 暴露CONFIG对象给模板
defineExpose({
  CONFIG
});

// 生成无人机沿边缘飞行路径
const generateFlightPath = (coordinates, altitude = 50) => {
  // console.log('生成地块边缘飞行路径...');
  
  const path = [];
  
  // 确保按照顺时针方向飞行（调整坐标顺序）
  // 标准矩形顺时针顺序：左上 → 右上 → 右下 → 左下 → 左上
  const orderedCoordinates = [
    coordinates[0],  // 左上
    coordinates[3],  // 右上
    coordinates[2],  // 右下
    coordinates[1],  // 左下
    coordinates[0]   // 回到左上
  ];
  
  // console.log('调整后的飞行顺序:', orderedCoordinates);
  
  // 按照调整后的顺序生成飞行路径
  for (const coord of orderedCoordinates) {
    const [lon, lat] = coord;
    const position = Cesium.Cartesian3.fromDegrees(lon, lat, altitude);
    
    if (position && !isNaN(position.x) && !isNaN(position.y) && !isNaN(position.z)) {
      path.push(position);
      // console.log('添加路径点:', { lon, lat, altitude });
    }
  }
  
  // console.log('生成的飞行路径包含', path.length, '个点');
  return path;
};

// 飞行路径
const FLIGHT_PATH = generateFlightPath(CONFIG.area.coordinates, CONFIG.drone.height + CONFIG.drone.heightOffset);

//创建天地图图层
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

//初始化 Cesium 并加载无人机模型
const initCesium = () => {
  try {
    // 确保DOM元素存在
    if (!cesiumContainer.value) {
      console.error('Cesium容器DOM元素不存在');
      return;
    }
    
    // console.log('开始初始化Cesium...');
    
    // 初始化前先清空之前的viewer实例
    if (window.cesiumViewer) {
      // console.log('发现之前的Cesium Viewer实例，正在销毁...');
      window.cesiumViewer.destroy();
      window.cesiumViewer = null;
      // console.log('之前的Cesium Viewer实例已销毁');
    }
    
    // 初始化Cesium Viewer
    const newViewer = new Cesium.Viewer(cesiumContainer.value, {
      timeline: true,
      animation: true,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      baseLayerPicker: false,
      infoBox: false,
      selectionIndicator: false,
      navigationInstructionsInitiallyVisible: false,
      fullscreenButton: false,
      geocoder: false, // 去掉搜索按钮
      imageryProvider: false,
      shouldAnimate: true,//是否显示模型动画
    });
    
    // 调整场景光照，增加亮度
    newViewer.scene.light = new Cesium.DirectionalLight({
      direction: new Cesium.Cartesian3(0.0, -1.0, -1.0),
      color: Cesium.Color.WHITE,
      intensity: 2.0 // 增加光照强度
    });
    
    // 调整模型的光照因子
    newViewer.scene.globe.enableLighting = true;

    // 将viewer实例存储到window对象中，供其他组件使用
    window.cesiumViewer = newViewer;
    
    // console.log('Cesium Viewer创建成功，并已存储到window.cesiumViewer');
    // console.log('window.cesiumViewer:', window.cesiumViewer);
    // console.log('window.cesiumViewer类型:', typeof window.cesiumViewer);
    
    // 标记viewer已初始化完成
    isViewerReady.value = true;

    // 创建并配置天地图图层
    const imageryLayers = {};
    imageryLayers.satellite = createTDLayer(newViewer, 'satellite');
    imageryLayers.label = createTDLayer(newViewer, 'label');
    
    // console.log('天地图图层创建成功');
    
    // 添加多边形实体来圈出区域
    const areaPolygon = newViewer.entities.add({
      name: '飞行区域',
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(
          CONFIG.area.coordinates.map(coord => Cesium.Cartesian3.fromDegrees(coord[0], coord[1]))
        ),
        material: Cesium.Color.TRANSPARENT, // 区域内部透明，无颜色
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#00FF00'), // 使用亮绿色作为高亮颜色
        outlineWidth: 5, // 增加线宽，确保可见
        show: true
      }
    });
    
    // 同时创建一个折线实体来增强边框效果
    const areaBorder = newViewer.entities.add({
      name: '飞行区域边框',
      polyline: {
        positions: CONFIG.area.coordinates.map(coord => Cesium.Cartesian3.fromDegrees(coord[0], coord[1])),
        width: 5,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.2,
          color: Cesium.Color.fromCssColorString('#00FF00')
        }),
        clampToGround: true,
        show: true
      }
    });
    
    // console.log('区域边框创建成功，坐标:', CONFIG.area.coordinates);
    // console.log('区域多边形创建成功，坐标:', CONFIG.area.coordinates);
    // console.log('区域中心点:', AREA_CENTER);

    // 确保相机控制器的所有功能都被启用
    newViewer.scene.screenSpaceCameraController.enableTranslate = true; // 启用平移
    newViewer.scene.screenSpaceCameraController.enableZoom = true; // 启用缩放
    newViewer.scene.screenSpaceCameraController.enableRotate = true; // 启用旋转
    newViewer.scene.screenSpaceCameraController.enableTilt = true; // 启用倾斜
    newViewer.scene.screenSpaceCameraController.enableLook = true; // 启用观察
    
    // console.log('Cesium Viewer初始化完成，正在创建无人机模型...');
    
    // 创建无人机实体
    const entity = createDroneEntity(newViewer);
    droneEntity.value = entity; // 保存无人机实体引用
    
    // console.log('无人机实体创建完成，开始加载模型...');
    // console.log('无人机初始位置:', CONFIG.area.coordinates[0]);
    // console.log('飞行路径点数量:', FLIGHT_PATH.length);
    
    // 延迟一段时间，确保地球和地图加载完成后，再飞向模型
    setTimeout(() => {
      if (window.cesiumViewer && entity) {
        // console.log('地球和地图加载完成，开始飞向无人机模型...');
        
        // 计算模型的包围球
        // const modelPosition = entity.position.getValue(Cesium.JulianDate.now());
        // const boundingSphere = new Cesium.BoundingSphere(modelPosition, 50); // 半径50米
        
        // 平滑飞行到模型位置，类似DynamicWallView.vue的实现
        // window.cesiumViewer.camera.flyToBoundingSphere(boundingSphere, {
        //   offset: new Cesium.HeadingPitchRange(
        //     Cesium.Math.toRadians(0),
        //     Cesium.Math.toRadians(-40),
        //     300 // 距离球体中心的距离，更近一些，便于观察喷洒效果
        //   ),
        //   duration: 5,
        //   easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT
        // });

        window.cesiumViewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(133.084112, 47.7281881, 359),
          orientation: {
            heading: Cesium.Math.toRadians(1.5),
            pitch: Cesium.Math.toRadians(-70),
            roll: 0.01
          },
          duration: 5,
          easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT
        });
        
      }
    }, 1500); // 延迟 确保地球和地图已经加载
  } catch (error) {
    console.error('Cesium 初始化失败：', error);
    console.error('错误详细信息:', error.stack);
  }
};

/**
 * 创建无人机模型
 * @param {Cesium.Viewer} viewer Cesium Viewer实例
 * @param {string} url 模型URL
 * @param {number} height 飞行高度
 */
const createModel = (viewer, url, height) => {
  console.log('创建模型，URL:', url, '高度:', height);
  
  // 移除所有无人机实体（保留区域多边形）
  const entities = viewer.entities.values;
  for (let i = entities.length - 1; i >= 0; i--) {
    const entity = entities[i];
    if (entity.name === '农药无人机') {
      viewer.entities.remove(entity);
    }
  }
 
  // 设置模型位置和朝向（使用地块边界的第一个点作为起始位置）
  const startCoord = CONFIG.area.coordinates[0];
  const position = Cesium.Cartesian3.fromDegrees(
    startCoord[0], // 经度
    startCoord[1],  // 纬度
    height + CONFIG.drone.heightOffset
  );
  
  // console.log('无人机初始位置设置为地块边界起点:', startCoord);
  
  const heading = Cesium.Math.toRadians(135);
  const pitch = Cesium.Math.toRadians(0); // 设置为0，确保无人机保持水平
  const roll = 0;
  const hpr = new Cesium.HeadingPitchRoll(heading, pitch, roll);
  const orientation = Cesium.Transforms.headingPitchRollQuaternion(
    position,
    hpr
  );
 
  // 创建模型实体
  const entity = viewer.entities.add({
    name: '农药无人机',
    position: position,
    orientation: orientation,
    model: {
      uri: url,
      minimumPixelSize: CONFIG.drone.minimumPixelSize, // 减小像素大小，提高性能
      maximumScale: CONFIG.drone.maximumScale, // 减小最大缩放，提高性能
      scale: CONFIG.drone.scale,
      show: true,
      shouldAnimate: true,
      shadows: Cesium.ShadowMode.DISABLED, // 禁用阴影，提高性能
      color: Cesium.Color.WHITE.withAlpha(1.0) // 增加亮度，使模型更亮
    },
  });
  return entity;
};

/**
 * 创建无人机实体（兼容旧方法）
 * @param {Cesium.Viewer} viewer Cesium Viewer实例
 */
const createDroneEntity = (viewer) => {
  return createModel(viewer, CONFIG.drone.modelUrl, CONFIG.drone.height);
};

/**
 * 开始喷洒任务（由用户点击按钮触发）
 */
const startMission = () => {
  // console.log('用户点击开始按钮，开始执行喷洒任务...');
  
  if (!window.cesiumViewer || !droneEntity.value) {
    console.error('无法开始任务：viewer或无人机实体不存在');
    return;
  }
  
  hasStarted.value = true;
  isPaused.value = false;
  startSprayingMission(window.cesiumViewer, droneEntity.value);
};

/**
 * 切换暂停/继续状态
 */
const togglePause = () => {
  if (!window.cesiumViewer) return;
  
  if (isPaused.value) {
    // 继续任务
    // console.log('继续喷洒任务...');
    isPaused.value = false;
    window.cesiumViewer.clock.shouldAnimate = true;
  } else {
    // 暂停任务
    // console.log('暂停喷洒任务...');
    isPaused.value = true;
    window.cesiumViewer.clock.shouldAnimate = false;
    savedClockTime.value = window.cesiumViewer.clock.currentTime.clone();
  }
};

/**
 * 开始喷洒任务
 * @param {Cesium.Viewer} viewer Cesium Viewer实例
 * @param {Cesium.Entity} droneEntity 无人机实体
 */
const startSprayingMission = (viewer, droneEntity) => {
  // console.log('开始喷洒农药任务...');
  
  // 标记任务为活动状态
  isMissionActive.value = true;
  
  // 初始化喷洒锥效果
  initSprayCone(viewer, droneEntity);
  
  // 开始沿着路径飞行
  flyAlongPath(viewer, droneEntity);
};

/**
 * 初始化喷洒雷达四棱锥效果
 * @param {Cesium.Viewer} viewer Cesium Viewer实例
 * @param {Cesium.Entity} droneEntity 无人机实体
 */
const initSprayCone = (viewer, droneEntity) => {
  // console.log('初始化喷洒视椎体效果...');
  // console.log('初始化前状态 - 视觉棱锥数量:', frustumPrimitives.value.length, '轮廓线数量:', frustumOutlinePrimitives.value.length, '事件监听器数量:', preUpdateListeners.value.length);
  
  if (!viewer || !droneEntity) {
    console.error('初始化视椎体失败：参数无效');
    return;
  }
  
  // 清理旧的棱锥效果
  // console.log('清理旧的棱锥效果...');
  for (const primitive of frustumPrimitives.value) {
    // console.log('移除旧视觉棱锥:', primitive);
    viewer.scene.primitives.remove(primitive);
  }
  frustumPrimitives.value = [];
  
  for (const primitive of frustumOutlinePrimitives.value) {
    // console.log('移除旧视觉棱锥轮廓线:', primitive);
    viewer.scene.primitives.remove(primitive);
  }
  frustumOutlinePrimitives.value = [];
  
  // 清理旧的事件监听器
  for (const listener of preUpdateListeners.value) {
    // console.log('移除旧事件监听器:', listener);
    viewer.scene.preUpdate.removeEventListener(listener);
  }
  preUpdateListeners.value = [];
  // console.log('旧棱锥效果清理完成');
  
  const near = 1.0;
  const far = CONFIG.mission.height;
  
  // 计算视场角，确保底面宽度与喷洒宽度一致
  // 喷洒宽度（米）
  const sprayWidth = CONFIG.mission.sprayWidth;
  // 视场角 = 2 * arctan(喷洒宽度 / 2 / 喷洒高度)，直接使用弧度
  const fov = 2 * Math.atan((sprayWidth / 2) / far);
  const aspectRatio = 1; // 正方形底面
  
  // console.log('视角棱锥大小计算:', { sprayWidth, far, fov: fov * (180 / Math.PI) });
  // console.log('视角棱锥底面宽度:', sprayWidth);
  
  // console.log('视椎体参数:', { fov: fov * (180 / Math.PI), aspectRatio, near, far, sprayWidth });
  
  let position;
  try {
    position = droneEntity.position && droneEntity.position.getValue ? 
      droneEntity.position.getValue(Cesium.JulianDate.now()) : null;
  } catch (e) {
    position = null;
  }
  
  if (!position) {
    position = Cesium.Cartesian3.fromDegrees(
      CONFIG.area.coordinates[0][0], 
      CONFIG.area.coordinates[0][1], 
      CONFIG.drone.height + CONFIG.drone.heightOffset
    );
  }
  
  console.log('无人机位置:', position);
  
  try {
    const heading = Cesium.Math.toRadians(0);
    const pitch = Cesium.Math.toRadians(180);
    const roll = Cesium.Math.toRadians(0);
    
    const hpr = new Cesium.HeadingPitchRoll(heading, pitch, roll);
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(Cesium.Cartesian3.ZERO, hpr);
    
    
    const frustum = new Cesium.PerspectiveFrustum({
      fov: fov,
      aspectRatio: aspectRatio,
      near: near,
      far: far
    });
    
    const instanceGeo = new Cesium.GeometryInstance({
      geometry: new Cesium.FrustumGeometry({
        frustum: frustum,
        origin: Cesium.Cartesian3.ZERO,
        orientation: orientation,
        vertexFormat: Cesium.VertexFormat.POSITION_ONLY
      }),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(
          Cesium.Color.fromCssColorString('#ffff00').withAlpha(0.5)
        )
      }
    });
    
    const initialModelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);
    
    const frustumPrimitive = viewer.scene.primitives.add(new Cesium.Primitive({
      geometryInstances: instanceGeo,
      appearance: new Cesium.PerInstanceColorAppearance({
        translucent: true,
        closed: true
      }),
      modelMatrix: initialModelMatrix
    }));
    frustumPrimitives.value.push(frustumPrimitive);
    // console.log('创建视觉棱锥:', frustumPrimitive, '当前数量:', frustumPrimitives.value.length);
    
    const instanceGeoLine = new Cesium.GeometryInstance({
      geometry: new Cesium.FrustumOutlineGeometry({
        frustum: frustum,
        origin: Cesium.Cartesian3.ZERO,
        orientation: orientation
      }),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(
          Cesium.Color.fromCssColorString('#ffff00').withAlpha(0.51)
        )
      }
    });
    
    const frustumOutlinePrimitive = viewer.scene.primitives.add(new Cesium.Primitive({
      geometryInstances: instanceGeoLine,
      appearance: new Cesium.PolylineColorAppearance({
        translucent: true
      }),
      modelMatrix: initialModelMatrix
    }));
    frustumOutlinePrimitives.value.push(frustumOutlinePrimitive);
    // console.log('创建视觉棱锥轮廓线:', frustumOutlinePrimitive, '当前数量:', frustumOutlinePrimitives.value.length);
    
    // console.log('喷洒视椎体初始化完成');
    // console.log('视椎体配置: FOV ' + fov * (180 / Math.PI) + '°, 宽高比 ' + aspectRatio + ', 远裁剪面 ' + far + 'm, 喷洒宽度 ' + sprayWidth + 'm, 黄色半透明');
    
    // 保存当前创建的棱锥引用
    const currentFrustumPrimitive = frustumPrimitive;
    const currentFrustumOutlinePrimitive = frustumOutlinePrimitive;
    
    // 创建并保存事件监听器引用
    const listener = function(scene, time) {
      if (droneEntity) {
        let dronePos;
        try {
          dronePos = droneEntity.position && droneEntity.position.getValue ? 
            droneEntity.position.getValue(time) : null;
        } catch (e) {
          dronePos = null;
        }
        
        if (dronePos) {
          const newModelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(dronePos);
          if (currentFrustumPrimitive) {
            currentFrustumPrimitive.modelMatrix = newModelMatrix;
          }
          if (currentFrustumOutlinePrimitive) {
            currentFrustumOutlinePrimitive.modelMatrix = newModelMatrix;
          }
        }
      }
    };
    
    // 添加事件监听器到数组
    preUpdateListeners.value.push(listener);
    // console.log('创建事件监听器:', listener, '当前数量:', preUpdateListeners.value.length);
    
    // 添加事件监听器
    viewer.scene.preUpdate.addEventListener(listener);
    // console.log('事件监听器已添加到场景');
  } catch (error) {
    console.error('创建视椎体失败:', error);
  }
};

/**
 * 沿着路径飞行（基于速度而非时间）
 * @param {Cesium.Viewer} viewer Cesium Viewer实例
 * @param {Cesium.Entity} droneEntity 无人机实体
 */
const flyAlongPath = (viewer, droneEntity) => {
  // console.log('开始沿着平行扫描路径飞行...');
  
  // 验证参数
  if (!viewer || !droneEntity) {
    console.error('开始沿路径飞行失败：参数无效');
    return;
  }
  
  // 配置时间轴和时钟
  const start = Cesium.JulianDate.fromDate(new Date());
  
  // 创建位置属性
  const positionProperty = new Cesium.SampledPositionProperty();
  
  // 计算总飞行时间（基于速度）
  let totalDistance = 0;
  const distances = [];
  
  // 计算每段路径的距离
  for (let i = 0; i < FLIGHT_PATH.length - 1; i++) {
    const distance = Cesium.Cartesian3.distance(FLIGHT_PATH[i], FLIGHT_PATH[i + 1]);
    distances.push(distance);
    totalDistance += distance;
  }
  
  // console.log('总飞行距离（米）:', totalDistance);
  // console.log('飞行速度（米/秒）:', CONFIG.mission.speed);
  
  // 计算总飞行时间（秒）
  const totalTime = totalDistance / CONFIG.mission.speed;
  // console.log('预计总飞行时间（秒）:', totalTime);
  
  // 计算停止时间
  const stop = Cesium.JulianDate.addSeconds(start, totalTime, new Cesium.JulianDate());
  
  // 添加路径点到位置属性（基于速度）
  let currentTime = start;
  for (let i = 0; i < FLIGHT_PATH.length; i++) {
    positionProperty.addSample(currentTime, FLIGHT_PATH[i]);
    
    // 如果不是最后一个点，计算下一个点的时间
    if (i < distances.length) {
      const segmentTime = distances[i] / CONFIG.mission.speed;
      currentTime = Cesium.JulianDate.addSeconds(currentTime, segmentTime, new Cesium.JulianDate());
    }
  }
  
  // 设置位置插值选项，使用线性插值确保直线飞行
  positionProperty.setInterpolationOptions({
    interpolationDegree: 1, // 线性插值，确保直线飞行
    interpolationAlgorithm: Cesium.LinearApproximation
  });
  
  // 创建速度方向属性
  const velocityOrientation = new Cesium.VelocityOrientationProperty(positionProperty);
  
  // 更新无人机位置
  droneEntity.position = positionProperty;
  
  // 设置无人机朝向，基于速度
  droneEntity.orientation = velocityOrientation;
  
  // 移除路径可视化
  // 飞行轨迹线已禁用
  
  // 设置可用性，与时间轴关联
  droneEntity.availability = new Cesium.TimeIntervalCollection([
    new Cesium.TimeInterval({
      start: start,
      stop: stop
    })
  ]);
  
  // 更新时钟和时间轴
  viewer.clock.startTime = start.clone();
  viewer.clock.currentTime = start.clone();
  viewer.clock.stopTime = stop.clone();
  viewer.clock.multiplier = 1; // 时间速率为1，实时播放
  viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP; // 循环执行
  viewer.clock.shouldAnimate = true; // 启用动画
  
  // 配置时间轴
  viewer.timeline.zoomTo(start, stop);
  
  // 实时标记喷洒区域
  let lastPosition = null;
  let isFirstPosition = true;
  let updateInterval = setInterval(() => {
    if (!isMissionActive.value) {
      clearInterval(updateInterval);
      return;
    }
    
    try {
      const currentTime = viewer.clock.currentTime;
      const currentPosition = droneEntity.position.getValue(currentTime);
      
      if (currentPosition) {
        if (isFirstPosition) {
          // 第一次获取到位置时，立即标记
          lastPosition = currentPosition;
          isFirstPosition = false;
          // 延迟一小段时间后标记第一个区域，确保无人机已经开始飞行
          setTimeout(() => {
            if (lastPosition && isMissionActive.value) {
              markSprayedArea(viewer, lastPosition, lastPosition);
            }
          }, 500);
        } else if (lastPosition) {
          // 检查位置是否有效
          if (!isNaN(currentPosition.x) && !isNaN(currentPosition.y) && !isNaN(currentPosition.z) &&
              !isNaN(lastPosition.x) && !isNaN(lastPosition.y) && !isNaN(lastPosition.z)) {
            // 计算距离，使用喷洒宽度的一半作为标记距离，确保不重复覆盖
            const distance = Cesium.Cartesian3.distance(lastPosition, currentPosition);
            if (distance > CONFIG.mission.sprayWidth / 2) { // 使用喷洒宽度的一半，确保不重复覆盖
              markSprayedArea(viewer, lastPosition, currentPosition);
              lastPosition = currentPosition;
            }
          }
        }
      }
    } catch (error) {
      console.error('实时标记喷洒区域失败:', error);
    }
  }, 1000); // 每1000毫秒更新一次
  
  // console.log('飞行路径与时间轴关联完成，开始实时标记喷洒区域');
};

/**
 * 标记已喷洒的区域
 * @param {Cesium.Viewer} viewer Cesium Viewer实例
 * @param {Cesium.Cartesian3} startPos 起始位置
 * @param {Cesium.Cartesian3} endPos 结束位置
 */
const markSprayedArea = (viewer, startPos, endPos) => {
  try {
    // 喷洒宽度（米），与棱锥底面一致
    const sprayWidthMeters = CONFIG.mission.sprayWidth;
    // console.log('喷洒区域宽度:', sprayWidthMeters);
    
    // 计算飞行方向向量
    const flightDirection = new Cesium.Cartesian3();
    Cesium.Cartesian3.subtract(endPos, startPos, flightDirection);
    
    // 检查飞行方向是否有效
    const flightDirectionLength = Cesium.Cartesian3.magnitude(flightDirection);
    if (flightDirectionLength < 0.00001) return; // 忽略非常短的线段
    
    // 归一化飞行方向向量
    Cesium.Cartesian3.normalize(flightDirection, flightDirection);
    
    // 计算垂直于飞行方向的向量
    // 使用叉乘计算垂直向量（假设向上向量为Z轴）
    const upVector = new Cesium.Cartesian3(0, 0, 1);
    const perpendicularDirection = new Cesium.Cartesian3();
    Cesium.Cartesian3.cross(flightDirection, upVector, perpendicularDirection);
    Cesium.Cartesian3.normalize(perpendicularDirection, perpendicularDirection);
    
    // 计算喷洒宽度的一半（米），与视角棱锥保持一致
    // 确保喷洒区域与视角棱锥大小完全相同
    const halfSprayWidth = CONFIG.mission.sprayWidth / 2;
    // console.log('喷洒区域半宽:', halfSprayWidth);
    
    // 计算四个角点，确保喷洒区域与视角棱锥大小一致
    // 左上角：起始位置 + 垂直方向 * 半宽
    const topLeft = new Cesium.Cartesian3();
    Cesium.Cartesian3.multiplyByScalar(perpendicularDirection, halfSprayWidth, topLeft);
    Cesium.Cartesian3.add(startPos, topLeft, topLeft);
    
    // 右上角：结束位置 + 垂直方向 * 半宽
    const topRight = new Cesium.Cartesian3();
    Cesium.Cartesian3.multiplyByScalar(perpendicularDirection, halfSprayWidth, topRight);
    Cesium.Cartesian3.add(endPos, topRight, topRight);
    
    // 右下角：结束位置 - 垂直方向 * 半宽
    const bottomRight = new Cesium.Cartesian3();
    Cesium.Cartesian3.multiplyByScalar(perpendicularDirection, -halfSprayWidth, bottomRight);
    Cesium.Cartesian3.add(endPos, bottomRight, bottomRight);
    
    // 左下角：起始位置 - 垂直方向 * 半宽
    const bottomLeft = new Cesium.Cartesian3();
    Cesium.Cartesian3.multiplyByScalar(perpendicularDirection, -halfSprayWidth, bottomLeft);
    Cesium.Cartesian3.add(startPos, bottomLeft, bottomLeft);
    
    // 创建喷洒区域多边形
    const polygonHierarchy = new Cesium.PolygonHierarchy([
      topLeft,
      topRight,
      bottomRight,
      bottomLeft
    ]);
    
    // 检查多边形层次结构是否有效
    if (!polygonHierarchy.positions || polygonHierarchy.positions.length < 3) return;
    
    const sprayedArea = viewer.entities.add({
      name: '已喷洒区域',
      polygon: {
        hierarchy: polygonHierarchy,
        material: Cesium.Color.YELLOW.withAlpha(0.3),
        show: true
      }
    });
    
    // 保存喷洒区域引用
    sprayedAreas.value.push(sprayedArea);
  } catch (error) {
    console.error('标记喷洒区域失败:', error);
  }
};



/**
 * 销毁 Cesium 资源，避免内存泄漏
 */
const destroyCesium = () => {
  isViewerReady.value = false;
  isMissionActive.value = false;
  
  if (window.cesiumViewer) {
    console.log('清理喷洒任务相关资源...');
    
    if (sprayCone.value) {
      window.cesiumViewer.entities.remove(sprayCone.value);
      sprayCone.value = null;
    }
    
    // 清理所有视觉棱锥
    for (const primitive of frustumPrimitives.value) {
      window.cesiumViewer.scene.primitives.remove(primitive);
    }
    frustumPrimitives.value = [];
    
    // 清理所有视觉棱锥轮廓线
    for (const primitive of frustumOutlinePrimitives.value) {
      window.cesiumViewer.scene.primitives.remove(primitive);
    }
    frustumOutlinePrimitives.value = [];
    
    // 清理所有事件监听器
    for (const listener of preUpdateListeners.value) {
      window.cesiumViewer.scene.preUpdate.removeEventListener(listener);
    }
    preUpdateListeners.value = [];
    
    for (const area of sprayedAreas.value) {
      if (area) {
        window.cesiumViewer.entities.remove(area);
      }
    }
    sprayedAreas.value = [];
  }
  
  if (droneEntity.value && window.cesiumViewer) {
    window.cesiumViewer.entities.remove(droneEntity.value);
    droneEntity.value = null;
  }
  
  if (window.cesiumViewer) {
    window.cesiumViewer.destroy();
    window.cesiumViewer = null;
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
/* 主容器样式 */
.app-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

/* Cesium 容器样式 */
.cesium-container {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

/* 左侧控制面板 */
.control-panel {
  position: absolute;
  top: 30px;
  left: 30px;
  z-index: 1000;
  /* background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px); */
  border-radius: 16px;
  padding: 24px;
  /* box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1); */
  max-width: 360px;
  /* border: 1px solid rgba(255, 255, 255, 0.2); */
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.control-panel:hover {
  background: rgba(255, 255, 255, 0.2);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.15);
  transform: translateY(-2px);
}

/* 面板标题 */
.panel-header {
  margin-bottom: 24px;
  text-align: center;
}

.panel-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* 参数部分 */
.params-section {
  margin-bottom: 28px;
}

.params-section:last-child {
  margin-bottom: 32px;
}

.section-title {
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: rgba(255, 255, 255, 0.1);
  padding: 8px 12px;
  border-radius: 8px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* 参数网格 */
.params-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.param-item {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.3s ease;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.param-item:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateX(4px);
}

.param-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  font-weight: 500;
}

.param-value {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.95);
  font-weight: 600;
  background: rgba(255, 255, 255, 0.1);
  padding: 4px 8px;
  border-radius: 4px;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

/* 按钮部分 */
.button-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 通用按钮样式 */
.control-button {
  padding: 12px 20px;
  font-size: 15px;
  font-weight: 600;
  color: white;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  position: relative;
  overflow: hidden;
}

.control-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.6s;
}

.control-button:hover::before {
  left: 100%;
}

.control-button:hover:not(:disabled) {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.control-button:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* 按钮颜色 */
.control-button.primary {
  background: rgba(76, 175, 80, 0.85);
}

.control-button.primary:hover:not(:disabled) {
  background: rgba(76, 175, 80, 0.95);
}

.control-button.secondary {
  background: rgba(33, 150, 243, 0.85);
}

.control-button.secondary:hover {
  background: rgba(33, 150, 243, 0.95);
}

.control-button.warning {
  background: rgba(255, 152, 0, 0.85);
}

.control-button.warning:hover {
  background: rgba(255, 152, 0, 0.95);
}

.control-button.danger {
  background: rgba(244, 67, 54, 0.85);
}

.control-button.danger:hover {
  background: rgba(244, 67, 54, 0.95);
}

.control-button:disabled {
  background: rgba(204, 204, 204, 0.5);
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
  opacity: 0.6;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .control-panel {
    top: 20px;
    left: 20px;
    max-width: 300px;
    padding: 20px;
  }
  
  .panel-header h2 {
    font-size: 18px;
  }
  
  .params-section {
    margin-bottom: 24px;
  }
  
  .params-section:last-child {
    margin-bottom: 28px;
  }
  
  .control-button {
    padding: 14px 18px;
  }
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
  .control-panel {
    background: rgba(20, 20, 20, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .panel-header h2 {
    color: rgba(255, 255, 255, 0.9);
  }
  
  .section-title {
    color: rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.08);
  }
  
  .param-item {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  
  .param-label {
    color: rgba(255, 255, 255, 0.7);
  }
  
  .param-value {
    color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.08);
  }
}
</style>