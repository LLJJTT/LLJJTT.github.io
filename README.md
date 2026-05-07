# Cesium WebGL 项目

这是一个基于 Vue 3 + Vite + Cesium 的 WebGL 项目，用于展示和开发 Cesium 相关的地理信息系统应用。

## 项目特点

- Vue 3 框架
- Vite 构建工具
- Vue Router 路由管理
- Cesium WebGL 库

## 环境要求

- Node.js 16+ 
- npm 或 yarn 或 cnpm

## 安装依赖

```bash
# 使用 npm
npm install

# 或使用 yarn
yarn install

# 或使用 cnpm
cnpm install
```

## 开发运行

```bash
npm run dev
```

项目将在 http://localhost:2026 启动，并自动打开浏览器。

## 构建生产版本

```bash
npm run build
```

构建产物将生成在 `dist` 目录中。

## 预览生产版本

```bash
npm run preview
```

## 项目结构

```
src/
├── assets/          # 静态资源
├── components/      # Vue 组件
├── router/          # 路由配置
├── views/           # 视图页面
├── App.vue          # 根组件
├── main.js          # 入口文件
└── style.css        # 全局样式
```

## Cesium 相关

本项目集成了 Cesium 库，用于开发 3D 地理信息系统应用。后续将添加 Cesium 相关的功能和组件。

## 许可证

MIT