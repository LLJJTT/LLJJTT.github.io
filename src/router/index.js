import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('../views/HomePage.vue'),
      children: [
        {
          path: '',
          name: 'default',
          component: () => import('../views/DefaultEarth.vue'),
          meta: { title: 'Cesium 3D 可视化平台' }
        },
        {
          path: 'wall',
          name: 'wall',
          component: () => import('../views/AnimateWall.vue'),
          meta: { title: '动态墙体' }
        },
        {
          path: 'drone-spray',
          name: 'droneSpray',
          component: () => import('../views/DroneSpray.vue'),
          meta: { title: '无人机喷洒' }
        },
        {
          path: 'point-clustering',
          name: 'pointClustering',
          component: () => import('../views/PointClustering.vue'),
          meta: { title: '点位聚合' }
        },
        {
          path: 'heatmap',
          name: 'heatmap',
          component: () => import('../views/Heatmap.vue'),
          meta: { title: '热力图' }
        },
        {
          path: 'suspended-island',
          name: 'suspendedIsland',
          component: () => import('../views/SuspendedIsland.vue'),
          meta: { title: '悬浮岛' }
        },
        {
          path: 'point-popup',
          name: 'pointPopup',
          component: () => import('../views/PointPopup.vue'),
          meta: { title: '气泡弹框' }
        },
        {
          path: 'weather',
          name: 'weather',
          component: () => import('../views/WeatherView.vue'),
          meta: { title: '卫星云图' }
        },
        {
          path: 'waterfenxi',
          name: 'waterFenxi',
          component: () => import('../views/WaterFenxi.vue'),
          meta: { title: '水淹分析' }
        },
        {
          path: 'animate-line',
          name: 'animateLine',
          component: () => import('../views/AnimateLine.vue'),
          meta: { title: '流动线路' }
        },
        {
          path: 'animate-white-model',
          name: 'whiteModel',
          component: () => import('../views/AnimateWhiteMode.vue'),
          meta: { title: '白模特效' }
        },
        {
          path: 'map-style-switch',
          name: 'mapSwitch',
          component: () => import('../views/MapStyleSwitch.vue'),
          meta: { title: '瓦片底图风格切换' }
        },
        {
          path: 'artemis-flight',
          name: 'artemisFlight',
          component: () => import('../views/ArtemisFlight.vue'),
          meta: { title: 'Artemis II 任务轨迹' }
        }
      ]
    }
  ]
})

// 全局前置守卫，设置页面标题
router.beforeEach((to, from, next) => {
  // 设置页面标题
  if (to.meta.title) {
    document.title = to.meta.title
  }
  next()
})

export default router