<template>
  <div class="area-drawing-component">
    <!-- 简洁的区域绘制图标按钮 -->
    <a-tooltip :title="isDrawing ? '结束绘制' : (isViewerReadyInternal ? '开始绘制区域' : '地图加载中')" placement="left">
      <button 
        class="draw-btn"
        :class="{ disabled: !isViewerReadyInternal, active: isDrawing }"
        @click="toggleDrawing"
        :disabled="!isViewerReadyInternal"
      >
        <span class="draw-icon">
          <EditOutlined />
        </span>
      </button>
    </a-tooltip>
  </div>
</template>

<script setup>
import { ref, defineProps, defineEmits, onMounted, watch, onUnmounted } from 'vue';
import { EditOutlined  } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';

// 定义组件属性
const props = defineProps({
  isViewerReady: {
    type: Boolean,
    default: false,
    description: 'Cesium Viewer是否已准备好'
  },
  viewer: {
    type: Object,
    default: null,
    description: 'Cesium Viewer实例，可选，优先级高于window.cesiumViewer'
  }
});

// 定义组件事件
const emit = defineEmits(['areaDrawn', 'drawingStarted', 'drawingStopped']);

// 内部状态
const isViewerReadyInternal = ref(props.isViewerReady);
const isDrawing = ref(false);
let handler = null;
let positions = [];
let polygon = null;
let tempPolyline = null;
let pointMarkers = [];

/**
 * 检查 Viewer 是否准备好
 */
const checkViewerReady = () => {
  const viewer = props.viewer || window.cesiumViewer;
  isViewerReadyInternal.value = !!viewer;
  // console.log('检查 Viewer 状态:', { propsViewer: !!props.viewer, windowCesiumViewer: !!window.cesiumViewer, isViewerReady: isViewerReadyInternal.value });
};

/**
 * 获取 Viewer 实例
 */
const getViewer = () => {
  const viewer = props.viewer || window.cesiumViewer;
  // console.log('获取 Viewer 实例:', { viewer: !!viewer });
  return viewer;
};

/**
 * 初始化绘制处理器
 */
const initHandler = () => {
  const viewer = getViewer();
  if (!viewer) return;
  
  try {
    // 如果已有事件处理器，先销毁
    if (handler) {
      handler.destroy();
      console.log('已销毁旧的事件处理器');
    }
    
    handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    console.log('事件处理器初始化成功:', { canvas: !!viewer.canvas });
    
    // 处理鼠标左键点击事件
    const leftClickHandler = (click) => {
      console.log('鼠标左键点击:', { isDrawing: isDrawing.value, clickPosition: click.position });
      if (!isDrawing.value) return;
      
      const viewer = getViewer();
      if (!viewer) {
        console.error('Viewer 实例不存在');
        return;
      }
      
      try {
        const ray = viewer.camera.getPickRay(click.position);
        console.log('获取射线:', !!ray);
        
        if (!ray) {
          console.error('无法获取射线');
          return;
        }
        
        const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
        console.log('获取交点:', !!cartesian);
        
        if (cartesian) {
          positions.push(cartesian);
          console.log('添加绘制点:', positions.length, { x: cartesian.x, y: cartesian.y, z: cartesian.z });
          
          // 创建点标记
          const marker = viewer.entities.add({
            position: cartesian,
            point: {
              pixelSize: 8,
              color: Cesium.Color.YELLOW,
              outlineWidth: 2,
              outlineColor: Cesium.Color.BLACK,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
            }
          });
          pointMarkers.push(marker);
          console.log('创建点标记:', pointMarkers.length);
          
          // 更新临时线
          updateTempPolyline();
          console.log('更新临时线');
          
          // 如果已经有至少3个点，更新多边形
          if (positions.length >= 3) {
            updatePolygon();
            console.log('更新多边形');
          }
        } else {
          console.warn('未获取到地球表面交点');
        }
      } catch (error) {
        console.error('处理点击事件失败:', error);
      }
    };
    
    handler.setInputAction(leftClickHandler, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    console.log('鼠标左键点击事件绑定成功');
    
    // 处理鼠标移动事件
    const mouseMoveHandler = (movement) => {
      if (!isDrawing.value || positions.length === 0) return;
      
      const viewer = getViewer();
      if (!viewer) return;
      
      const ray = viewer.camera.getPickRay(movement.endPosition);
      const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
      
      if (cartesian) {
        // 更新临时线
        if (tempPolyline) {
          const tempPositions = [...positions, cartesian];
          tempPolyline.polyline.positions = tempPositions;
        }
      }
    };
    
    handler.setInputAction(mouseMoveHandler, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    console.log('鼠标移动事件绑定成功');
    
    // 处理鼠标右键点击事件（结束绘制）
    const rightClickHandler = () => {
      console.log('鼠标右键点击:', { isDrawing: isDrawing.value });
      if (isDrawing.value) {
        finishDrawing();
      }
    };
    
    handler.setInputAction(rightClickHandler, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    console.log('鼠标右键点击事件绑定成功');
  } catch (error) {
    console.error('初始化事件处理器失败:', error);
    message.error('绘制功能初始化失败，请刷新页面重试', 2);
  }
};

/**
 * 更新临时线
 */
const updateTempPolyline = () => {
  const viewer = getViewer();
  if (!viewer) {
    console.error('更新临时线失败：Viewer 实例不存在');
    return;
  }
  
  console.log('更新临时线:', { positionsLength: positions.length, hasTempPolyline: !!tempPolyline });
  
  try {
    if (!tempPolyline) {
      console.log('创建临时线');
      tempPolyline = viewer.entities.add({
        polyline: {
          positions: positions,
          width: 2,
          material: new Cesium.PolylineOutlineMaterialProperty({
            color: Cesium.Color.BLUE,
            outlineWidth: 1,
            outlineColor: Cesium.Color.WHITE
          })
        }
      });
      console.log('临时线创建成功:', !!tempPolyline);
    } else {
      console.log('更新临时线位置');
      tempPolyline.polyline.positions = positions;
      console.log('临时线位置更新成功');
    }
  } catch (error) {
    console.error('更新临时线失败:', error);
  }
};

/**
 * 更新多边形
 */
const updatePolygon = () => {
  const viewer = getViewer();
  if (!viewer) {
    console.error('更新多边形失败：Viewer 实例不存在');
    return;
  }
  
  console.log('更新多边形:', { positionsLength: positions.length, hasPolygon: !!polygon });
  
  try {
    if (!polygon) {
      console.log('创建多边形');
      polygon = viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: new Cesium.ColorMaterialProperty(Cesium.Color.BLUE.withAlpha(0.3)),
          outline: true,
          outlineWidth: 2,
          outlineColor: Cesium.Color.BLUE
        }
      });
      console.log('多边形创建成功:', !!polygon);
    } else {
      console.log('更新多边形层次结构');
      polygon.polygon.hierarchy = new Cesium.PolygonHierarchy(positions);
      console.log('多边形层次结构更新成功');
    }
  } catch (error) {
    console.error('更新多边形失败:', error);
  }
};

/**
 * 开始绘制
 */
const startDrawing = () => {
  const viewer = getViewer();
  if (!viewer) {
    message.error('地图正在加载中，请稍候再试！', 2);
    return;
  }
  
  try {
    console.log('开始绘制:', { viewer: !!viewer });
    
    // 重置绘制状态
    isDrawing.value = true;
    positions = [];
    polygon = null;
    tempPolyline = null;
    pointMarkers = [];
    
    console.log('绘制状态重置完成:', { isDrawing: isDrawing.value, positions: positions.length });
    
    // 清除所有相关实体
    console.log('清除之前的实体');
    viewer.entities.values.forEach(entity => {
      if (entity.polyline || entity.polygon || entity.point) {
        viewer.entities.remove(entity);
      }
    });
    console.log('实体清除完成');
    
    // 初始化事件处理器
    initHandler();
    console.log('事件处理器重新初始化');
    
    emit('drawingStarted');
    message.info('开始绘制区域，点击添加点，右键结束绘制', 3);
    console.log('开始绘制流程完成');
  } catch (error) {
    console.error('开始绘制失败:', error);
    message.error('开始绘制失败，请重试', 2);
    isDrawing.value = false;
  }
};

/**
 * 结束绘制
 */
const finishDrawing = () => {
  const viewer = getViewer();
  if (!viewer) return;
  
  try {
    isDrawing.value = false;
    console.log('结束绘制，点数:', positions.length);
    
    // 清除临时线
    if (tempPolyline) {
      viewer.entities.remove(tempPolyline);
      tempPolyline = null;
    }
    
    // 检查是否绘制了有效的多边形
    if (positions.length >= 3) {
      // 转换为经纬度坐标数组
      const coordinates = positions.map(pos => {
        const cartographic = Cesium.Cartographic.fromCartesian(pos);
        return [
          Cesium.Math.toDegrees(cartographic.longitude),
          Cesium.Math.toDegrees(cartographic.latitude)
        ];
      });
      console.log('绘制完成，坐标:', coordinates);
      
      // 复制坐标到剪贴板
      try {
        navigator.clipboard.writeText(JSON.stringify(coordinates));
        message.success('区域坐标已复制到剪贴板', 2);
      } catch (err) {
        message.error('复制坐标失败，请手动复制', 2);
        console.error('复制失败:', err);
      }
      
      // 触发绘制完成事件
      emit('areaDrawn', {
        positions: positions,
        coordinates: coordinates
      });
    } else {
      message.warning('绘制的区域无效，请至少点击3个点', 2);
    }
    
    // 清除所有实体
    if (polygon) {
      viewer.entities.remove(polygon);
      polygon = null;
    }
    
    // 清除点标记
    pointMarkers.forEach(marker => {
      viewer.entities.remove(marker);
    });
    pointMarkers = [];
    
    emit('drawingStopped');
  } catch (error) {
    console.error('结束绘制失败:', error);
    message.error('结束绘制失败，请重试', 2);
  }
};

/**
 * 切换绘制状态
 */
const toggleDrawing = () => {
  console.log('切换绘制状态:', { currentIsDrawing: isDrawing.value, isViewerReady: isViewerReadyInternal.value });
  if (isDrawing.value) {
    finishDrawing();
  } else {
    startDrawing();
  }
};

/**
 * 计算多边形面积
 */
const calculateArea = (positions) => {
  if (positions.length < 3) return 0;
  
  // 转换为经纬度坐标
  const cartographics = positions.map(pos => {
    return Cesium.Cartographic.fromCartesian(pos);
  });
  
  // 使用基于经纬度的面积计算方法
  let area = 0;
  const earthRadius = 6371000; // 地球半径（米）
  
  // 计算多边形面积（使用球面多边形面积计算公式）
  for (let i = 0; i < cartographics.length; i++) {
    const j = (i + 1) % cartographics.length;
    const lat1 = cartographics[i].latitude;
    const lon1 = cartographics[i].longitude;
    const lat2 = cartographics[j].latitude;
    const lon2 = cartographics[j].longitude;
    
    const dLon = lon2 - lon1;
    const term = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon);
    area += Math.atan2(Math.sin(dLon) * Math.cos(lat2), term);
  }
  
  area = Math.abs(area) * earthRadius * earthRadius;
  return area;
};

// 组件挂载时初始化
onMounted(() => {
  console.log('组件挂载，开始初始化');
  // 检查 Cesium 是否存在
  if (typeof Cesium === 'undefined') {
    console.error('Cesium 库未加载');
    message.error('Cesium 库未加载，请检查依赖配置', 3);
    return;
  }
  console.log('Cesium 库已加载');
  
  checkViewerReady();
  
  // 每秒钟检查一次 Viewer 是否准备好
  const intervalId = setInterval(checkViewerReady, 1000);
  
  // 清理函数
  return () => clearInterval(intervalId);
});

// 组件卸载时清理
onUnmounted(() => {
  if (handler) {
    handler.destroy();
    console.log('事件处理器已销毁');
  }
  
  // 清除实体
  const viewer = getViewer();
  if (viewer) {
    if (polygon) {
      viewer.entities.remove(polygon);
    }
    if (tempPolyline) {
      viewer.entities.remove(tempPolyline);
    }
    // 清除点标记
    pointMarkers.forEach(marker => {
      viewer.entities.remove(marker);
    });
  }
});

// 监听 props 变化
watch(
  () => props.viewer,
  () => {
    checkViewerReady();
    // 重新初始化事件处理器
    if (handler) {
      handler.destroy();
      handler = null;
    }
    initHandler();
  }
);

watch(
  () => props.isViewerReady,
  (newValue) => {
    isViewerReadyInternal.value = newValue;
    if (newValue) {
      checkViewerReady();
      initHandler();
    }
  }
);
</script>

<style scoped>
.area-drawing-component {
  z-index: 1000;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* 简洁的绘制按钮样式 */
.draw-btn {
  width: 35px;
  height: 35px;
  border: 1px solid #fff;
  border-radius: 4px;
  background: rgba(0, 123, 255, 0.8);
  cursor: pointer;
  transition: all 0.1s linear;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
}

.draw-btn:hover {
  background: rgba(0, 123, 255, 1);
  transform: scale(1.05);
  box-shadow: none;
}

.draw-btn:active {
  transform: scale(0.95);
}

.draw-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
  background: rgba(0, 123, 255, 0.5);
}

.draw-btn.active {
  background: rgba(255, 99, 132, 0.8);
}

.draw-btn.active:hover {
  background: rgba(255, 99, 132, 1);
}

.draw-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Ant Design图标样式 */
.draw-icon :deep(.anticon) {
  font-size: 20px;
  color: white;
  font-weight: bold;
}
</style>