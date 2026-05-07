<template>
  <div class="app-container">
    <!-- 配置面板 -->
    <div class="config-panel">
      
    </div>
    
    <!-- Cesium 容器 -->
    <div ref="cesiumContainer" class="cesium-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
// 引入配置文件
import { TD_MAP_KEY } from '../config.js';
// 引入点位数据
import chinaPointsData from '../data/china-points.json';

// 核心配置参数
// 这些配置参数用于控制Cesium地图和点位聚合的行为
const clusterConfig = ref({
  // 聚合配置
  pixelRange: 50,  // 聚合半径
  enabled: true,   // 是否启用聚合
  // 聚合点颜色配置：根据聚合数量显示不同颜色和大小
  colorArr: [      
    {
      num: 1,      // 聚合数量阈值
      size: 30,    // 聚合点大小（像素）
      color: "#67c23a",  // 聚合点颜色（不带透明度）
      opacity: 0.8,  // 聚合点透明度（0-1）
    },
    {
      num: 50,     // 当聚合数量超过50时使用此配置
      size: 38,
      color: "#e6a23c",
      opacity: 0.8,
    },
    {
      num: 200,    // 当聚合数量超过200时使用此配置
      size: 40,
      color: "#f56c6c",
      opacity: 0.8,
    }
  ],
  img: "/src/assets/marker6.png"  // 单个点位的图标路径
});

// Cesium 相关变量
const cesiumContainer = ref(null);
let viewer = null;
let dataSource = null;
let entities = [];

/**
 * 创建天地图图层（增加容错，无效key给出提示）
 */
const createTDLayer = (viewer, layerType) => {
  // 容错：检查TD_MAP_KEY是否有效
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

/**
 * 点位聚合类
 */
class pointCluster {
  constructor(opt) {
    this.options = Object.assign({}, clusterConfig, opt);
    this.viewer = opt.viewer;
    this.dataSources = null;
    this.clustericon = {};
    if (this.options.dataOrUrl && this.options.dataOrUrl != "") {
      this.loadjson();
    }
  }
  loadjson() {
    var this_ = this;
    new Cesium.GeoJsonDataSource()
      .load(this_.options.dataOrUrl)
      .then((geoJsonDataSource) => {
        this_.showcluster(geoJsonDataSource);
      });
  }
  showcluster(geoJsonDataSource) {
    var this_ = this;
    this.dataSources = geoJsonDataSource;
    this.viewer.dataSources.add(this.dataSources);

    var pixelRange = this.options.pixelRange;
    var minimumClusterSize = 1;
    var enabled = this.options.enabled;
    //开启聚合
    this.dataSources.clustering.enabled = enabled;
    this.dataSources.clustering.pixelRange = pixelRange;
    this.dataSources.clustering.minimumClusterSize = minimumClusterSize;

    // 处理聚合禁用时的单个点位图标
    if (!enabled) {
      // 遍历所有实体，为每个点位设置图标
      this.dataSources.entities.values.forEach(function(entity) {
        if (entity.position) {
          // 隐藏标签，显示广告牌
          if (entity.label) {
            entity.label.show = false;
          }
          if (!entity.billboard) {
            entity.billboard = new Cesium.BillboardGraphics({
              image: this_.options.img,
              width: 32,
              height: 32,
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
              horizontalOrigin: Cesium.HorizontalOrigin.CENTER
            });
          } else {
            entity.billboard.image = this_.options.img;
            entity.billboard.width = 32;
            entity.billboard.height = 32;
            entity.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
            entity.billboard.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
            entity.billboard.show = true;
          }
        }
      });
    } else {
      // 聚合启用时的处理
      var removeListener;
      function customStyle() {
        if (Cesium.defined(removeListener)) {
          removeListener();
          removeListener = undefined;
        } else {
          removeListener = 
            this_.dataSources.clustering.clusterEvent.addEventListener(
              function (clusteredEntities, cluster) {
                cluster.label.show = false;
                cluster.billboard.show = true;
                cluster.billboard.id = cluster.label.id;
                cluster.billboard.verticalOrigin = 
                  Cesium.VerticalOrigin.CENTER;

                var xx = -1;
                for (var i = 0; i < this_.options.colorArr.length; i++) {
                  if (
                    clusteredEntities.length > this_.options.colorArr[i].num
                  ) {
                    xx = i;
                  }
                }
                if (xx == -1) {
                  cluster.billboard.image = this_.options.img;
                  // 设置单个点位图标的大小
                  cluster.billboard.width = 32;
                  cluster.billboard.height = 32;
                } else {
                  cluster.billboard.image = this_.drawImage(
                    clusteredEntities.length,
                    this_.options.colorArr[xx].size,
                    this_.options.colorArr[xx].color,
                    this_.options.colorArr[xx].opacity
                  );
                  // 设置聚合图标的大小
                  cluster.billboard.width = this_.options.colorArr[xx].size;
                  cluster.billboard.height = this_.options.colorArr[xx].size;
                }
              }
            );
        }

        // force a re-cluster with the new styling
        var pixelRange = this_.dataSources.clustering.pixelRange;
        this_.dataSources.clustering.pixelRange = 0;
        this_.dataSources.clustering.pixelRange = pixelRange;
      }
      customStyle();
    }
  }

  drawImage(text, size, color, opacity = 1) {
    if (this.clustericon[text + "_" + size + "_" + color + "_" + opacity]) {
      return this.clustericon[text + "_" + size + "_" + color + "_" + opacity];
    }
    
    // 创建一个Canvas元素来绘制
    var canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    
    // 绘制背景
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = opacity;
    ctx.fill();
    ctx.globalAlpha = 1;
    
    // 绘制文字
    ctx.font = "bold 16px 楷体, 'Microsoft YaHei', sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, size / 2, size / 2);
    
    // 转换为data URL
    var canvasUrl = canvas.toDataURL();
    
    // 保存到缓存
    this.clustericon[text + "_" + size + "_" + color + "_" + opacity] = canvasUrl;
    return canvasUrl;
  }
  remove() {
    this.viewer.dataSources.remove(this.dataSources);
    this.dataSources = null;
    this.clustericon = {};
  }
}

/**
 * 初始化点位聚合（使用pointCluster类）
 */
const initPointClustering = () => {
  if (!viewer) return;
  
  // 清除之前的数据源
  if (dataSource) {
    viewer.dataSources.remove(dataSource);
    dataSource = null;
  }
  
  // 直接使用导入的JSON文件数据
  const geoJsonData = chinaPointsData;
  
  // 创建pointCluster实例
  const cluster = new pointCluster({
    viewer: viewer,
    dataOrUrl: geoJsonData,
    pixelRange: clusterConfig.value.pixelRange,
    enabled: clusterConfig.value.enabled,
    colorArr: clusterConfig.value.colorArr,
    img: clusterConfig.value.img
  });
  
  // 保存数据源引用
  dataSource = cluster.dataSources;
  
  // 设置相机初始位置到中国区域

    setTimeout(() => {
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(120.0, 45.0, 5000000),
            orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-90),
            roll: 0
            },
            duration: 3
        });
    },2000)
};

/**
 * 更新聚合配置（修复生效逻辑，强制重新聚合）
 */
const updateClustering = () => {
  if (!dataSource || !dataSource.clustering) {
    console.warn('聚合数据源未初始化，无法更新配置');
    return;
  }
  
  try {
    // 移除旧的聚合配置
    dataSource.clustering = null;
    
    // 重新配置聚合参数
    const newClusteringOptions = {
      enabled: clusterConfig.value.enabled,
      pixelRange: clusterConfig.value.pixelRange,
      minimumClusterSize: 2,
      clusterBillboards: true,
      clusterLabels: true,
      clusterPoints: false,
      customClusterStyling: (cluster, labels, billboards, points) => {
        let color;
        const objectCount = cluster.objectCount || 0;
        
        if (objectCount < 10) {
          color = Cesium.Color.GREEN;
        } else if (objectCount < 100) {
          color = Cesium.Color.YELLOW;
        } else {
          color = Cesium.Color.RED;
        }
        
        // 确保数量标签显示
        labels.show = true;
        labels.text = objectCount.toString();
        labels.font = 'bold 14px sans-serif';
        labels.fillColor = Cesium.Color.WHITE;
        labels.outlineColor = Cesium.Color.BLACK;
        labels.outlineWidth = 2;
        labels.pixelOffset = new Cesium.Cartesian2(0, 0);
        labels.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
        labels.verticalOrigin = Cesium.VerticalOrigin.CENTER;
        labels.scaleByDistance = new Cesium.NearFarScalar(1000, 1, 500000, 0.5);
        labels.zIndex = 10;
        
        if (billboards) {
          billboards.image = createClusterImage(color);
          billboards.width = 70;
          billboards.height = 70;
          billboards.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
          billboards.verticalOrigin = Cesium.VerticalOrigin.CENTER;
          billboards.scaleByDistance = new Cesium.NearFarScalar(1000, 1, 500000, 0.5);
          billboards.zIndex = 1;
        }
        
        // 复用createClusterImage函数
        function createClusterImage(color) {
          const targetColor = color || Cesium.Color.GREEN;
          const canvas = document.createElement('canvas');
          const size = 100;
          canvas.width = size;
          canvas.height = size;
          
          const ctx = canvas.getContext('2d');
          const centerX = size / 2;
          const centerY = size / 2;
          const radius = size / 3;
          
          const gradient = ctx.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, radius * 1.5
          );
          gradient.addColorStop(0, targetColor.withAlpha(0.6).toCssColorString());
          gradient.addColorStop(0.5, targetColor.withAlpha(0.3).toCssColorString());
          gradient.addColorStop(1, targetColor.withAlpha(0).toCssColorString());
          
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius * 1.5, 0, 2 * Math.PI);
          ctx.fillStyle = gradient;
          ctx.fill();
          
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
          ctx.fillStyle = targetColor.toCssColorString();
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.stroke();
          
          const result = canvas.toDataURL();
          ctx.clearRect(0, 0, size, size);
          return result;
        }
      }
    };
    
    // 重新应用聚合配置
    dataSource.clustering = new Cesium.EntityCluster(newClusteringOptions);
    
    // 强制刷新场景
    viewer.scene.requestRender();
    viewer.dataSources.update(dataSource);
  } catch (error) {
    console.error('更新聚合配置失败：', error);
  }
};



/**
 * 初始化 Cesium
 */
const initCesium = () => {
  try {
    // 初始化前先清空之前的viewer实例
    if (window.cesiumViewer) {
      window.cesiumViewer.destroy();
      delete window.cesiumViewer;
    }
    
    // 初始化 Cesium Viewer
    viewer = new Cesium.Viewer(cesiumContainer.value, {
      timeline: false,
      animation: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      baseLayerPicker: false,
      infoBox: true,
      selectionIndicator: true,
      navigationInstructionsInitiallyVisible: false,
      fullscreenButton: false,
      imageryProvider: false
    });

    // 将viewer实例存储到window对象中
    window.cesiumViewer = viewer;

    // 创建并配置天地图图层
    createTDLayer(viewer, 'satellite');
    createTDLayer(viewer, 'label');

    // 初始化点位聚合
    initPointClustering();
  } catch (error) {
    console.error('Cesium 初始化失败：', error);
  }
};

/**
 * 销毁 Cesium 资源（修复内存泄漏）
 */
const destroyCesium = () => {
  if (dataSource && viewer) {
    if (dataSource.entities) {
      dataSource.entities.removeAll();
    }
    viewer.dataSources.remove(dataSource);
    dataSource = null;
  }
  
  if (viewer) {
    viewer.destroy();
    viewer = null;
  }
  
  // 清空window上的引用
  if (window.cesiumViewer) {
    window.cesiumViewer.destroy();
    delete window.cesiumViewer;
  }
  
  entities = [];
};

// Vue 生命周期钩子
onMounted(() => {
  // 确保容器已完全挂载
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
/* 主容器样式 */
.app-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
/* Cesium 容器样式 */
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