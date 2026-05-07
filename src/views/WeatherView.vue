<template>
  <div class="weather-view-container">
    <div ref="cesiumContainer" class="cesium-container"></div>
    
    <div class="layer-controls">
      <div class="control-item">
        <input type="radio" id="satelliteLayer" name="weatherLayer" v-model="activeLayer" value="satellite" @change="toggleLayer" checked>
        <label for="satelliteLayer">卫星云图</label>
      </div>
      <div class="control-item">
        <input type="radio" id="radarLayer" name="weatherLayer" v-model="activeLayer" value="radar" @change="toggleLayer">
        <label for="radarLayer">气象雷达图</label>
      </div>
    </div>
    
    <div class="time-info-panel">
      <p id="times">{{ currentTime }}</p>
      <p>注：数据来源于中央气象台与国家气象信息中心，中国天气网制图</p>
    </div>
    
    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { TD_MAP_KEY } from '../config.js';
import axios from 'axios';

const cesiumContainer = ref(null);
let viewer = null;
let satelliteLayers = [];
let radarLayer = null;
let satelliteTimer = null;
let radarTimer = null;

const activeLayer = ref('satellite'); // 默认选择卫星云图
const currentTime = ref('');
const satelliteImages = ref([]);
const satelliteTimes = ref([]);
const radarImages = ref([]);
const currentSatelliteIndex = ref(0);
const currentRadarIndex = ref(0);
const isLoading = ref(false);

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

const fetchWeatherData = async (url) => {
  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://weather.cma.cn/',
        'Origin': 'https://weather.cma.cn',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      },
      cache: 'no-cache'
    });

    if (!response.ok) {
      throw new Error(`HTTP 错误：${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
};



const parseImageTime = (imageUrl) => {
  // 从图片URL中提取时间信息
  const match = imageUrl.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }
  return '';
};

const addWeatherLayer = (type) => {
  if (!viewer) return;
  
  if (type === 'satellite') {
    // 使用axios获取卫星云图数据
    axios.get('https://gswarn.weather.com.cn/app/api/cn_scw_radar_cloud?type=satellite')
      .then((response) => {
        const data = response.data;
        if (data && data.l) {
          initSatelliteLayer(data.l);
        }
      })
      .catch(error => {
        console.error('加载卫星云图失败：', error);
      });
  } else if (type === 'radar') {
    isLoading.value = true;
    const url = `https://gswarn.weather.com.cn/app/api/cn_scw_radar_cloud?type=radar`;
    fetchWeatherData(url).then(result => {
      if (!result.success) {
        console.error(`加载雷达图失败：${result.error}`);
        isLoading.value = false;
        return;
      }

      const data = result.data;
      let imageUrls = [];
      const fileList = data.file_before || data.files_after || [];
      const imgPrefix = data.img_prix || '';
      imageUrls = fileList.map(file => imgPrefix + file);

      if (imageUrls.length > 0) {
        radarImages.value = imageUrls;
        initRadarLayer(imageUrls);
      } else {
        isLoading.value = false;
      }
    }).catch(error => {
      console.error('加载雷达图失败：', error);
      isLoading.value = false;
    });
  }
};

const initSatelliteLayer = (data) => {
  let times = [];
  let imageUrls = [];
  
  data.forEach((item) => {
    times.push(item.l1);
    imageUrls.push(item.l2);
  });
  
  // 不需要反转数组，保持时间顺序从早到晚
  satelliteTimes.value = times;
  satelliteImages.value = imageUrls;
  
  // 创建卫星云图图层
  satelliteLayers = [];
  isLoading.value = true;
  
  // 预加载所有图片
  const loadPromises = imageUrls.map(url => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = resolve;
      img.src = url;
    });
  });
  
  // 所有图片加载完成后再创建图层
  Promise.all(loadPromises).then(() => {
    for (let i = 0, len = imageUrls.length; i < len; i++) {
      const imageryProvider = new Cesium.SingleTileImageryProvider({
        url: imageUrls[i],
        rectangle: Cesium.Rectangle.fromDegrees(63.05754, 4.432541, 136.963346, 54.174859),
      });

      const options = {
        alpha: 0
      };
      const imageryLayer = new Cesium.ImageryLayer(imageryProvider, options);
      viewer.imageryLayers.add(imageryLayer);

      satelliteLayers.push(imageryLayer);
    }
    
    isLoading.value = false;
    // 开始卫星云图动画
    startSatelliteAnimation();
  });
};

const closeAllSatelliteLayers = () => {
  satelliteLayers.forEach((layer) => {
    layer.alpha = 0;
  });
};

const radarLayers = [];

const initRadarLayer = (imageUrls) => {
  // 清除之前的雷达图层
  radarLayers.forEach(layer => {
    if (viewer && viewer.imageryLayers) {
      viewer.imageryLayers.remove(layer);
    }
  });
  radarLayers.length = 0;
  
  // 预加载所有图片
  const loadPromises = imageUrls.map(url => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = resolve;
      img.src = url;
    });
  });
  
  // 所有图片加载完成后再创建图层
  Promise.all(loadPromises).then(() => {
    for (let i = 0, len = imageUrls.length; i < len; i++) {
      const imageryProvider = new Cesium.SingleTileImageryProvider({
        url: imageUrls[i],
        rectangle: Cesium.Rectangle.fromDegrees(73, 18, 135, 53),
      });

      const options = {
        alpha: 0
      };
      const imageryLayer = new Cesium.ImageryLayer(imageryProvider, options);
      viewer.imageryLayers.add(imageryLayer);

      radarLayers.push(imageryLayer);
    }
    
    isLoading.value = false;
    // 开始雷达图动画
    startRadarAnimation();
  }).catch(error => {
    console.error('加载雷达图图片失败：', error);
    isLoading.value = false;
  });
};

const closeAllRadarLayers = () => {
  radarLayers.forEach((layer) => {
    layer.alpha = 0;
  });
};


const startSatelliteAnimation = () => {
  // 停止之前的定时器
  if (satelliteTimer) {
    clearInterval(satelliteTimer);
    satelliteTimer = null;
  }
  
  // 默认显示第一张图片
  if (satelliteLayers.length > 0) {
    closeAllSatelliteLayers();
    satelliteLayers[0].alpha = 1;
    currentTime.value = "当前时间: " + satelliteTimes.value[0];
  }
  
  // 每1000ms切换一张图片
  let currentIndex = 0;
  satelliteTimer = setInterval(() => {
    if (satelliteLayers.length > 0) {
      currentIndex = (currentIndex + 1) % satelliteLayers.length;
      closeAllSatelliteLayers();
      satelliteLayers[currentIndex].alpha = 1;
      currentTime.value = "当前时间: " + satelliteTimes.value[currentIndex];
    }
  }, 1000);
};

const startRadarAnimation = () => {
  // 停止之前的定时器
  if (radarTimer) {
    clearInterval(radarTimer);
    radarTimer = null;
  }
  
  // 默认显示第一张图片
  if (radarLayers.length > 0) {
    closeAllRadarLayers();
    radarLayers[0].alpha = 1;
    currentTime.value = "当前时间: " + parseImageTime(radarImages.value[0]);
  }
  
  // 每1000ms切换一张图片，与卫星云图保持一致的节奏
  let currentIndex = 0;
  radarTimer = setInterval(() => {
    if (radarLayers.length > 0) {
      currentIndex = (currentIndex + 1) % radarLayers.length;
      closeAllRadarLayers();
      radarLayers[currentIndex].alpha = 1;
      currentTime.value = "当前时间: " + parseImageTime(radarImages.value[currentIndex]);
    }
  }, 1000);
};

const toggleLayer = () => {
  // 停止所有动画
  if (satelliteTimer) {
    clearInterval(satelliteTimer);
    satelliteTimer = null;
  }
  
  if (radarTimer) {
    clearInterval(radarTimer);
    radarTimer = null;
  }
  
  // 隐藏所有图层
  satelliteLayers.forEach((layer) => {
    layer.show = false;
  });
  
  radarLayers.forEach((layer) => {
    layer.show = false;
  });
  
  // 显示当前选中的图层
  if (activeLayer.value === 'satellite') {
    satelliteLayers.forEach((layer) => {
      layer.show = true;
    });
    // 开始卫星云图动画
    startSatelliteAnimation();
  } else if (activeLayer.value === 'radar') {
    if (radarLayers.length > 0) {
      radarLayers.forEach((layer) => {
        layer.show = true;
      });
      startRadarAnimation();
    } else {
      // 如果雷达图层还未加载，重新加载
      addWeatherLayer('radar');
    }
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

    addWeatherLayer('satellite');
    // addWeatherLayer('radar');

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(126.63, 45.75, 5000000), // 哈尔滨上空
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
  // 清除定时器
  if (satelliteTimer) {
    clearInterval(satelliteTimer);
    satelliteTimer = null;
  }
  
  if (radarTimer) {
    clearInterval(radarTimer);
    radarTimer = null;
  }
  
  
  if (viewer) {
    viewer.destroy();
    viewer = null;
  }
  
  if (window.cesiumViewer) {
    window.cesiumViewer.destroy();
    delete window.cesiumViewer;
  }
  
  // 清除图层
  satelliteLayers.forEach(layer => {
    if (viewer && viewer.imageryLayers) {
      viewer.imageryLayers.remove(layer);
    }
  });
  
  radarLayers.forEach(layer => {
    if (viewer && viewer.imageryLayers) {
      viewer.imageryLayers.remove(layer);
    }
  });
  
  radarLayer = null;
  satelliteImages.value = [];
  satelliteTimes.value = [];
  radarImages.value = [];
  currentSatelliteIndex.value = 0;
  currentRadarIndex.value = 0;
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
.weather-view-container {
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



.layer-controls {
  position: fixed;
  top: 20px;
  right: 20px;
  /* width: 200px; */
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95));
  backdrop-filter: blur(20px);
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 6px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 
              0 0 30px rgba(185, 197, 218, 0.3);
  z-index: 1000;
  padding: 10px;
  animation: slideIn 0.4s ease-out;
  display: flex;
  flex-direction: column;
  gap:10px;
}

.control-item {
  display: flex;
  align-items: center;
}

.control-item input[type="checkbox"] {
  margin-right: 10px;
  accent-color: #3b82f6;
}

.control-item label {
  font-size: 14px;
  color: #f1f5f9;
  cursor: pointer;
}



@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}



.time-info-panel {
  position: fixed;
  right: 20px;
  bottom: 32px;
  z-index: 100;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95));
  backdrop-filter: blur(20px);
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 12px;
  color: white;
  padding: 8px 12px;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4);
}

.time-info-panel p {
  margin: 3px 0;
  font-size: 12px;
}

.time-info-panel #times {
  font-size: 14px;
  font-weight: 600;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  /* background: rgba(0, 0, 0, 0.7); */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 5px solid rgba(59, 130, 246, 0.3);
  border-radius: 50%;
  border-top-color: #3b82f6;
  animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

:deep(.cesium-viewer-bottom),
:deep(.cesium-viewer-toolbar) {
  display: none !important;
}
</style>