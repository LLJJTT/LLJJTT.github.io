<template>
  <div class="home-page">
    <!-- 左侧菜单 -->
    <div class="sidebar" :class="{ 'collapsed': isCollapsed }">
      <div class="logo" @click="goToHome">
        <div class="logo-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            <path d="M2 12h20"></path>
          </svg>
        </div>
        <div class="logo-text">Cesium 3D</div>
      </div>
      
      <nav class="menu">
        <router-link 
          v-for="item in menuItems" 
          :key="item.path"
          :to="item.path"
          class="menu-item"
          active-class="active"
        >
          <div class="menu-icon">
            <component :is="item.icon" />
          </div>
          <div class="menu-text">{{ item.title }}</div>
        </router-link>
      </nav>
      
      <div class="sidebar-footer">
        <div class="version">v1.0.0</div>
      </div>
    </div>
    
    <!-- 独立的折叠按钮 -->
    <div class="collapse-btn" @click="toggleCollapse" :class="{ 'collapsed': isCollapsed }">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    </div>
    
    <!-- 右侧内容区域 -->
    <div class="content" :class="{ 'sidebar-collapsed': isCollapsed }">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

// 侧边栏折叠状态
const isCollapsed = ref(false);

// 切换侧边栏折叠状态
const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
};

// 返回首页
const goToHome = () => {
  router.push('/');
};

// 菜单图标映射
const iconMap = {
  wall: {
    template: `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 9l6 6 6-6"></path>
        <path d="M12 3v18"></path>
      </svg>
    `
  },
  droneSpray: {
    template: `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 12c-3 0-6 3-6 6v3l6-3 6 3v-3c0-3-3-6-6-6z"></path>
        <path d="M12 12V9"></path>
        <path d="M12 9V6"></path>
        <path d="M16 9h-8"></path>
      </svg>
    `
  },
  pointClustering: {
    template: `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <circle cx="12" cy="12" r="4"></circle>
        <circle cx="8" cy="8" r="2"></circle>
        <circle cx="16" cy="16" r="2"></circle>
        <circle cx="8" cy="16" r="2"></circle>
        <circle cx="16" cy="8" r="2"></circle>
      </svg>
    `
  },
  heatmap: {
    template: `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
      </svg>
    `
  },
  suspendedIsland: {
    template: `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
        <path d="M12 7V2"></path>
        <path d="M12 17V22"></path>
      </svg>
    `
  },
  pointPopup: {
    template: `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3"></circle>
      </svg>
    `
  },
  heightFog: {
    template: `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
        <path d="M12 7v10"></path>
      </svg>
    `
  }
};

// 从路由配置自动生成菜单
const menuItems = computed(() => {
  const routes = router.options.routes;
  if (routes && routes.length > 0) {
    const children = routes[0].children;
    if (children) {
      return children
        .filter(child => child.path && child.path !== '') // 排除默认路由
        .map(child => ({
          path: child.path,
          title: child.meta?.title || child.name,
          icon: iconMap[child.name] || {
            template: `
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 22V12"></path>
                <path d="M12 6h.01"></path>
              </svg>
            `
          }
        }));
    }
  }
  return [];
});
</script>

<style scoped>
/* 主容器布局 */
.home-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  overflow: hidden;
}

/* 左侧侧边栏 */
.sidebar {
  width: 180px;
  height: 100vh;
  background: rgba(15, 23, 42, 0.9);
  backdrop-filter: blur(15px);
  border-right: 1px solid rgba(59, 130, 246, 0.3);
  display: flex;
  flex-direction: column;
  padding: 20px 0;
  box-shadow: 2px 0 20px rgba(0, 0, 0, 0.5);
  z-index: 100;
  position: relative;
  overflow: hidden;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  transform: translateX(0);
}

/* 侧边栏折叠状态 */
.sidebar.collapsed {
  transform: translateX(-100%);
  width: 180px;
}

/* 独立的折叠按钮 */
.collapse-btn {
  position: fixed;
  left: 160px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 60px;
  background: rgba(59, 130, 246, 0.2);
  backdrop-filter: blur(15px);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 12px 0 0 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.7);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 101;
}

.collapse-btn:hover {
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.9);
}

/* 折叠状态下的按钮样式 */
.collapse-btn.collapsed {
  left: 0;
  background: rgba(59, 130, 246, 0.2);
  backdrop-filter: blur(15px);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 0 12px 12px 0;
  box-shadow: 2px 0 15px rgba(59, 130, 246, 0.7);
}

.collapse-btn.collapsed:hover {
  left: 2px;
}

/* 按钮图标 */
.collapse-btn svg {
  color: white;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 折叠状态下的图标旋转 */
.collapse-btn.collapsed svg {
  transform: rotate(180deg);
}

/* 确保侧边栏内容完全在容器内 */
.sidebar {
  overflow: hidden;
  white-space: nowrap;
  position: absolute;
  left: 0;
  top: 0;
}

/* 侧边栏背景光效 */
.sidebar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.1) 0%, rgba(99, 102, 241, 0.05) 100%);
  pointer-events: none;
}

/* Logo 区域 */
.logo {
  display: flex;
  align-items: center;
  padding: 0 20px 20px;
  border-bottom: 1px solid rgba(59, 130, 246, 0.2);
  margin-bottom: 20px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  z-index: 1;
}

.logo:hover {
  transform: translateX(5px);
}

.logo-icon {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.7);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.logo-icon::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transform: rotate(45deg);
  animation: shine 3s infinite;
}

@keyframes shine {
  0% { transform: translateX(-100%) rotate(45deg); }
  100% { transform: translateX(100%) rotate(45deg); }
}

.logo-icon svg {
  color: white;
  position: relative;
  z-index: 1;
}

.logo-text {
  font-size: 16px;
  font-weight: 700;
  color: white;
  background: linear-gradient(135deg, #ffffff, #3b82f6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  position: relative;
  z-index: 1;
}

/* 菜单区域 */
.menu {
  flex: 1;
  padding: 0 10px;
  position: relative;
  z-index: 1;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  margin-bottom: 8px;
  border-radius: 10px;
  color: #94a3b8;
  text-decoration: none;
  transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(59, 130, 246, 0.1);
}

.menu-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.2), transparent);
  transition: left 0.5s;
}

.menu-item:hover::before {
  left: 100%;
}

.menu-item:hover {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
  /*transform: translateX(8px);*/
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.3);
}

.menu-item.active {
  background: rgba(59, 130, 246, 0.25);
  color: white;
  border-color: rgba(59, 130, 246, 0.6);
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
}

.menu-item.active::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.8);
}

.menu-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  z-index: 1;
}

.menu-item:hover .menu-icon {
  transform: scale(1.2) rotate(5deg);
  color: #3b82f6;
}

.menu-item.active .menu-icon {
  color: #3b82f6;
  transform: scale(1.1);
}

.menu-text {
  font-size: 13px;
  font-weight: 500;
  flex: 1;
  position: relative;
  z-index: 1;
  letter-spacing: 0.5px;
}

/* 侧边栏底部 */
.sidebar-footer {
  padding: 16px 20px 0 20px;
  border-top: 1px solid rgba(59, 130, 246, 0.2);
  margin-top: auto;
  position: relative;
  z-index: 1;
}

.version {
  font-size: 11px;
  color: #64748b;
  text-align: center;
  letter-spacing: 1px;
}



/* 右侧内容区域 */
.content {
  height: 100vh;
  overflow: hidden;
  position: relative;
  margin-left: 180px;
  transition: margin-left 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 侧边栏折叠时的内容区域 */
.content.sidebar-collapsed {
  margin-left: 0;
}

/* 页面过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .sidebar {
    width: 64px;
  }
  
  .logo-text,
  .menu-text,
  .version {
    display: none;
  }
  
  .logo {
    justify-content: center;
    padding: 0 10px 20px;
  }
  
  .menu-item {
    justify-content: center;
    padding: 14px;
  }
  
  .menu-icon {
    margin-right: 0;
  }
}
</style>