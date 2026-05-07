<template>
    <div id="mapContainer">
        <div class="toolbar">
            <button 
                v-for="type in heatmapTypes" 
                :key="type.value"
                :class="['toolbar-btn', { active: currentType === type.value }]"
                @click="switchHeatmapType(type.value)"
            >
                {{ type.label }}
            </button>
        </div>
    </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import Heatmap3d from "../js/heatmap3d.js"
import { TD_MAP_KEY } from '../config.js';
let viewer = undefined;
let mapContainer = ref();
let heatmapInstance = undefined;
let currentType = ref("LINES");
let heatmapData = ref([]);

const heatmapTypes = [
    { label: "网状热力图", value: "LINES" },
    { label: "3D面热力图", value: "TRANGLE" }
];

// 切换热力图类型
function switchHeatmapType(type) {
    currentType.value = type;
    createHeatmap(type, heatmapData.value);
}

// 创建热力图
function createHeatmap(type, data) {
    // 清除之前的热力图实例
    if (heatmapInstance) {
        // 这里需要根据Heatmap3d的实现添加清除方法
        // 如果没有提供清除方法，可以尝试从场景中移除相关的图元
        if (viewer && viewer.scene && viewer.scene.primitives) {
            // 简单清理：移除所有图元（注意：这会移除所有场景中的图元，包括其他可能存在的）
            // 实际项目中应该实现更精确的清理方法
            viewer.scene.primitives.removeAll();
        }
    }

    // 创建新的热力图实例
    heatmapInstance = new Heatmap3d(viewer, {
        list: data,
        raduis: 15,//聚合热力半径
        baseHeight: 1000,//基于地面高度
        primitiveType: type, //TRANGLE（面）、LINES（网格）
        gradient: {
            ".3": "blue",
            ".5": "green",
            ".7": "yellow",
            ".95": "red"
        }
    });
}

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
onMounted(() => {
    // 初始化 Cesium Viewer
    viewer = new Cesium.Viewer('mapContainer', {
        timeline: false,
        animation: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        baseLayerPicker: false,
        infoBox: false,
        selectionIndicator: true,
        navigationInstructionsInitiallyVisible: false,
        fullscreenButton: false,
        imageryProvider: false,
        geocoder: false
    });

    // 将viewer实例存储到window对象中
    window.cesiumViewer = viewer;

    // 创建并配置天地图图层
    createTDLayer(viewer, 'satellite');
    createTDLayer(viewer, 'label');

    document.getElementsByClassName("cesium-viewer-bottom")[0].style.display = "none";
    
    // 设置相机初始位置到平原地区
    setTimeout(() => {
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(116.0, 35.5, 300000),
            orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-60),
            roll: 0
            },
            duration: 3
        });
    },2000)

    // 模拟热力图点位数据 100个
    let list = [];
    for (let i = 0; i < 100; i++) {
        list.push({
            "lnglat": [
                116.0 + Math.random() * 1.0 * (Math.random() > 0.5 ? 1 : -1),
                36.5 + Math.random() * 1.0 * (Math.random() > 0.5 ? 1 : -1)
            ],
            "value": 8000 * Math.random()
        })
    }
    
    // 存储热力图数据
    heatmapData.value = list;
    
    // 创建热力图实例
    createHeatmap("LINES", heatmapData.value);
})



</script>

<style scoped>
.toolbar {
    position: absolute;
    top: 20px;
    left: 20px;
    z-index: 999;
    display: flex;
    gap: 10px;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    padding: 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
}

.toolbar-btn {
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.3s ease;
}

.toolbar-btn:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: translateY(-2px);
}

.toolbar-btn.active {
    background: rgba(59, 130, 246, 0.8);
    border-color: rgba(59, 130, 246, 1);
    font-weight: bold;
}

#mapContainer {
    margin: 0;
    padding: 0;
    height: 100%;
    position: relative;
}
</style>