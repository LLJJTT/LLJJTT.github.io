<template>
  <div class="camera-view-component">
    <!-- 简洁的相机视角图标按钮 -->
    <a-tooltip :title="isViewerReadyInternal ? '获取当前相机视角' : '地图加载中'" placement="left">
      <button 
        class="camera-btn"
        :class="{ disabled: !isViewerReadyInternal }"
        @click="getCameraView"
        :disabled="!isViewerReadyInternal"
      >
        <span class="camera-icon">
          <CameraOutlined />
        </span>
      </button>
    </a-tooltip>
  </div>
</template>

<script setup>
import { ref, defineProps, defineEmits, onMounted, watch } from 'vue';
import { CameraOutlined, CopyOutlined } from '@ant-design/icons-vue';
import { Tooltip as ATooltip, message } from 'ant-design-vue';

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
const emit = defineEmits(['cameraViewChange']);

// 内部状态
const isViewerReadyInternal = ref(props.isViewerReady);

/**
 * 检查 Viewer 是否准备好
 */
const checkViewerReady = () => {
  const viewer = props.viewer || window.cesiumViewer;
  isViewerReadyInternal.value = !!viewer;
};

// 组件挂载时初始化状态
onMounted(() => {
  checkViewerReady();
  
  // 每秒钟检查一次 Viewer 是否准备好
  const intervalId = setInterval(checkViewerReady, 1000);
  
  // 清理函数
  return () => clearInterval(intervalId);
});

// 监听 props 变化
watch(
  () => props.viewer,
  () => {
    checkViewerReady();
  }
);

watch(
  () => props.isViewerReady,
  (newValue) => {
    isViewerReadyInternal.value = newValue;
  }
);

/**
 * 获取当前相机视角并自动复制
 */
const getCameraView = () => {
  // 优先使用props.viewer（如果提供），否则回退到window.cesiumViewer
  const viewer = props.viewer || window.cesiumViewer;
  
  if (!viewer) {
    console.error('Cesium Viewer实例不存在，请等待地图加载完成');
    message.error('地图正在加载中，请稍候再试！', 2);
    return;
  }
  
  try {
    const camera = viewer.camera;
    
    // 获取相机位置（笛卡尔坐标）
    const cartesianPosition = camera.position;
    
    // 转换为经纬度
    const cartographic = Cesium.Cartographic.fromCartesian(cartesianPosition);
    const longitude = Cesium.Math.toDegrees(cartographic.longitude);
    const latitude = Cesium.Math.toDegrees(cartographic.latitude);
    const height = cartographic.height;
    
    // 获取相机方向
    const heading = Cesium.Math.toDegrees(camera.heading);
    const pitch = Cesium.Math.toDegrees(camera.pitch);
    const roll = Cesium.Math.toDegrees(camera.roll);
    
    // 生成相机视角数据
    const cameraData = {
      position: {
        longitude: parseFloat(longitude.toFixed(6)),
        latitude: parseFloat(latitude.toFixed(6)),
        height: parseFloat(height.toFixed(0))
      },
      orientation: {
        heading: parseFloat(heading.toFixed(2)),
        pitch: parseFloat(pitch.toFixed(2)),
        roll: parseFloat(roll.toFixed(2))
      }
    };
    
    // 触发相机视角变化事件
    emit('cameraViewChange', cameraData);
    
    // 自动复制到剪贴板
    navigator.clipboard.writeText(JSON.stringify(cameraData, null, 2)).then(() => {
      message.success('相机视角数据已复制到剪贴板！', 2);
    }).catch(err => {
      console.error('复制失败:', err);
      // 降级方案
      const textArea = document.createElement('textarea');
      textArea.value = JSON.stringify(cameraData, null, 2);
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      message.success('相机视角数据已复制到剪贴板！', 2);
    });
    
    console.log('相机视角数据已获取并复制:', cameraData);
  } catch (error) {
    console.error('获取相机视角失败:', error);
    message.error('获取相机视角失败，请重试', 2);
  }
};
</script>

<style scoped>
.camera-view-component {
  z-index: 1000;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* 简洁的相机按钮样式 */
.camera-btn {
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

.camera-btn:hover {
  background: rgba(0, 123, 255, 1);
  transform: scale(1.05);
  box-shadow: none;
}

.camera-btn:active {
  transform: scale(0.95);
}

.camera-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
  background: rgba(0, 123, 255, 0.5);
}

.camera-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Ant Design图标样式 */
.camera-icon :deep(.anticon) {
  font-size: 20px;
  color: white;
  font-weight: bold;
}
</style>