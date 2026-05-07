import{j as $,k as F,c as A,a as o,v as w,y as C,n as b,f as g,o as H}from"./index-DHpSOtqe.js";import{T as _}from"./config-xtcUmDwc.js";import{_ as z}from"./_plugin-vue_export-helper-DlAUqK2U.js";const B={class:"app-container"},P={class:"top-left-controls"},k={class:"color-control-group"},O={class:"color-row"},U={class:"color-row"},D={class:"liquid-btn-group"},N={__name:"AnimateWhiteMode",setup(W){const c=g(null),r=g(0),u=g("#00aaff"),d=g("#ffffff");let a=null,m=150,h=null,v=null;class T extends Cesium.UrlTemplateImageryProvider{constructor(e){super(e),this._tilingScheme=new Cesium.WebMercatorTilingScheme,this.colorMode=e.colorMode||"normal",this.customColorRGB=e.customColorRGB||{r:58,g:134,b:255}}get tilingScheme(){return this._tilingScheme}}const I=t=>{const e=t.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({url:`https://t{s}.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${_}`,subdomains:["0","1","2","3","4","5","6","7"],credit:"天地图",maximumLevel:18,minimumLevel:0,maximumScreenSpaceError:0,disableDepthTestAgainstTerrain:!0}));return e.zIndex=1,e},y=t=>{h=new T({url:`https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILECOL={x}&TILEROW={y}&TILEMATRIX={z}&tk=${_}`,subdomains:["0","1","2","3","4","5","6","7"],colorMode:"normal",customColorRGB:{r:58,g:134,b:255},credit:"天地图",maximumLevel:18,minimumLevel:0}),v=t.imageryLayers.addImageryProvider(h),v.zIndex=0,I(t)},f=t=>{const e=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(t);return e?{r:parseInt(e[1],16)/255,g:parseInt(e[2],16)/255,b:parseInt(e[3],16)/255}:{r:0,g:.67,b:1}},M=async t=>{try{await t.readyPromise;let e=155;const i=t.root;if(i&&i.boundingVolume){const s=i.boundingVolume;if(s.box){const n=s.box[2],l=s.box[11];e=n+l}else if(s.region)e=s.region[5];else if(s.sphere){const n=s.sphere[2],l=s.sphere[3];e=n+l}(isNaN(e)||e<=75)&&(e=155)}return e=Math.max(e+5,95),console.log(`模型最大高度: ${e.toFixed(2)} 米`),e}catch(e){return console.warn("获取模型最大高度失败，使用默认值:",e),155}},R=()=>{try{if(!c.value){console.error("Cesium容器DOM元素不存在");return}window.cesiumViewer&&(window.cesiumViewer.destroy(),window.cesiumViewer=null);const t=new Cesium.Viewer(c.value,{timeline:!1,animation:!1,homeButton:!1,sceneModePicker:!1,navigationHelpButton:!1,baseLayerPicker:!1,infoBox:!1,selectionIndicator:!1,navigationInstructionsInitiallyVisible:!1,fullscreenButton:!1,geocoder:!1,imageryProvider:!1,shouldAnimate:!0});window.cesiumViewer=t,y(t),S(t)}catch(t){console.error("Cesium 初始化失败：",t)}},S=async t=>{try{a=await Cesium.Cesium3DTileset.fromUrl("/data/tileset.json"),t.scene.primitives.add(a),m=await M(a),t.zoomTo(a)}catch(e){console.error("加载3DTiles失败：",e)}},x=()=>{r.value=1;const t=f(u.value),e=f(d.value),i=new Cesium.CustomShader({fragmentShaderText:`
      void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        vec3 positionMC = fsInput.attributes.positionMC;
        float height = positionMC.y;
        float maxHeight = ${m.toFixed(2)};
        float heightRatio = clamp(height / maxHeight, 0.0, 1.0);
        
        vec3 baseColor = vec3(${t.r.toFixed(3)}, ${t.g.toFixed(3)}, ${t.b.toFixed(3)});
        vec3 gradientColor = vec3(${e.r.toFixed(3)}, ${e.g.toFixed(3)}, ${e.b.toFixed(3)});
        
        material.diffuse = mix(baseColor, gradientColor, heightRatio);
      }
    `});a.customShader=i},E=()=>{r.value=2;const t=f(u.value),e=f(d.value),i=0,s=60,n=m-i,l=new Cesium.CustomShader({fragmentShaderText:`
      void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        vec3 positionMC = fsInput.attributes.positionMC;
        float height = positionMC.y;
        float maxHeight = ${m.toFixed(2)};
        float heightRatio = clamp(height / maxHeight, 0.0, 1.0);
        
        vec3 baseColor = vec3(${t.r.toFixed(3)}, ${t.g.toFixed(3)}, ${t.b.toFixed(3)});
        vec3 gradientColor = vec3(${e.r.toFixed(3)}, ${e.g.toFixed(3)}, ${e.b.toFixed(3)});
        
        material.diffuse = mix(baseColor, gradientColor, heightRatio);

        if (height >= ${i}.0) {
          float _baseHeight = ${i}.0;
          float _heightRange = ${s}.0;
          float _glowRange = ${n.toFixed(2)};

          float vtxf_height = height - _baseHeight;
          float vtxf_a11 = fract(czm_frameNumber / 360.0) * 3.14159265 * 2.0;
          float vtxf_a12 = vtxf_height / _heightRange + sin(vtxf_a11) * 0.1;
          material.diffuse *= vec3(vtxf_a12, vtxf_a12, vtxf_a12);

          float vtxf_a13 = fract(czm_frameNumber / 360.0);
          float vtxf_h = clamp(vtxf_height / _glowRange, 0.0, 1.0);
          vtxf_a13 = abs(vtxf_a13 - 0.5) * 2.0;
          float vtxf_diff = step(0.01, abs(vtxf_h - vtxf_a13));
          material.diffuse += material.diffuse * (1.0 - vtxf_diff);
        }
      }
    `});a.customShader=l},L=()=>{r.value=3,p()},p=()=>{a&&(a.customShader=void 0)},V=()=>{p(),a&&window.cesiumViewer&&(window.cesiumViewer.scene.primitives.remove(a),a=null),window.cesiumViewer&&(window.cesiumViewer.destroy(),window.cesiumViewer=null)};return $(()=>{c.value&&R()}),F(()=>{V()}),(t,e)=>(H(),A("div",B,[o("div",P,[o("div",k,[o("div",O,[e[2]||(e[2]=o("label",{class:"color-label"},"渐变颜色:",-1)),w(o("input",{type:"color","onUpdate:modelValue":e[0]||(e[0]=i=>u.value=i),class:"color-input",onInput:x},null,544),[[C,u.value]])]),o("div",U,[e[3]||(e[3]=o("label",{class:"color-label"},"到",-1)),w(o("input",{type:"color","onUpdate:modelValue":e[1]||(e[1]=i=>d.value=i),class:"color-input",onInput:x},null,544),[[C,d.value]])])]),o("div",D,[o("button",{onClick:E,class:b(["liquid-btn",r.value===2?"active":""])},[...e[4]||(e[4]=[o("span",null,"动态光圈扫描",-1)])],2),o("button",{onClick:L,class:b(["liquid-btn",r.value===3?"active":""])},[...e[5]||(e[5]=[o("span",null,"清除效果",-1)])],2)])]),o("div",{ref_key:"cesiumContainer",ref:c,class:"cesium-container"},null,512)]))}},q=z(N,[["__scopeId","data-v-8a1b8179"]]);export{q as default};
