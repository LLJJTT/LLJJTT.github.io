<template>
    <div class="tools-container">
        <AreaDrawing
        />
        <div style="height: 10px;"></div>
        <GetCameraInfo
        />
    </div>
</template>

<script setup>
    import AreaDrawing from '../components/AreaDrawing.vue';
    import GetCameraInfo from '../components/GetCameraInfo.vue';
</script>

<style scoped>
.tools-container {
    position: fixed;
    top: 100px;
    right: 20px;
    z-index: 1000;
}
</style>
