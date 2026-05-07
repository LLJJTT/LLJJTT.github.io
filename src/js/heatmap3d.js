/**
 * 世界坐标转经纬度
 * @param {Cesium.Cartesian3 } cartesian 世界坐标
 * @param {Cesium.Viewer} viewer 当前viewer对象
 * @returns { Array } 经纬度坐标s
 */
function cartesianToLnglat(cartesian, viewer) {
    if (!cartesian) return [];
    viewer = viewer || window.viewer;
    var lnglat = Cesium.Cartographic.fromCartesian(cartesian);
    var lat = Cesium.Math.toDegrees(lnglat.latitude);
    var lng = Cesium.Math.toDegrees(lnglat.longitude);
    var hei = lnglat.height;
    return [lng, lat, hei];
}

/**
 * 世界坐标数组转经纬度数组
 * @param {Cesium.Cartesian3[]} cartesians 世界坐标数组
 * @param {Cesium.Viewer} viewer 当前viewer对象
 * @returns { Array } 经纬度坐标数组
 */
function cartesiansToLnglats(cartesians, viewer) {
    if (!cartesians || cartesians.length < 1) return;
    viewer = viewer || window.viewer;
    if (!viewer) {
        console.log('cartesiansToLnglats方法缺少viewer对象');
        return;
    }
    var arr = [];
    for (var i = 0; i < cartesians.length; i++) {
        arr.push(cartesianToLnglat(cartesians[i], viewer));
    }
    return arr;
}

/**
 * @description 三维热力图类，基于h337类扩展
 * @class
 */
class Heatmap3d {
    /**
     * @param {Cesium.Viewer} viewer 地图viewer对象 
     * @param {Object} opt 基础参数
     * @param {Array} opt.list 热力值数组
     * @param {Array} opt.raduis 热力点半径
     * @param {Array} opt.baseHeight 最低高度 
     * @param {Array} opt.gradient 颜色配置
     */
    constructor(viewer, opt) {
        this.viewer = viewer;
        this.opt = opt || {};
        this.list = this.opt.list || [];
        
        // 问题5修复：判断条件和提示文字统一（不少于3个）
        if (!this.list || this.list.length < 3) {
            console.error("热力图点位不得少于3个！");
            return;
        }
        
        this.dom = undefined;
        this.id = Number((new Date()).getTime() + "" + Number(Math.random() * 1000).toFixed(0));
        // 问题2修复：统一变量名为canvasW（驼峰命名，大写W）
        this.canvasW = 200;

        this.bound = undefined; // 四角坐标
        this.rect = {}; // 经纬度范围

        this.x_axios = undefined; // x 轴
        this.y_axios = undefined; // y 轴
        this.girthX = 0; // x轴长度
        this.girthY = 0; // y轴长度

        this.baseHeight = this.opt.baseHeight || 0;

        this.createDom();
        let config = {
            container: document.getElementById(`easy3d-heatmap-${this.id}`),
            radius: this.opt.raduis || 20,
            maxOpacity: .85,
            minOpacity: .45,
            blur: .75,
            gradient: this.opt.gradient || {
                '.1': 'blue',
                '.5': 'yellow',
                '.7': 'red',
                '.99': 'white'
            }
        };
        this.primitiveType = opt.primitiveType || "TRIANGLES";
        this.heatmapInstance = h337.create(config);
        /**
         *@property {Cesium.Primitive} primitive 热力图图元
         */
        this.primitive = undefined;
        this.init();
    }

    init() {
        this.hierarchy = []
        for (let ind = 0; ind < this.list.length; ind++) {
            let position = Cesium.Cartesian3.fromDegrees(this.list[ind].lnglat[0], this.list[ind].lnglat[1], 0);
            this.hierarchy.push(position);
        }
        
        this.computeBound(this.hierarchy);
        
        // 先判断bound和girth是否有效，避免后续报错
        if (!this.bound || this.girthX <= 0 || this.girthY <= 0) {
            console.error("坐标范围计算失败，无法生成热力图");
            return;
        }
        
        let points = [];
        for (let i = 0; i < this.hierarchy.length; i++) {
            let p1 = this.hierarchy[i];
            const rete = this.computeRateInBound(p1);
            
            // 问题3修复：过滤异常坐标，限制x/y在0~canvasW范围内
            if (rete && !isNaN(rete.x) && !isNaN(rete.y)) {
                const x = Math.max(0, Math.min(this.canvasW, rete.x));
                const y = Math.max(0, Math.min(this.canvasW, rete.y));
                points.push({
                    x: x,
                    y: y,
                    value: this.list[i].value
                })
            }
        }
        
        // 确保points有有效数据再添加
        if (points.length < 3) {
            console.error("有效热力点不足3个，无法渲染热力图");
            return;
        }
        this.heatmapInstance.addData(points);

        let instance = new Cesium.GeometryInstance({
            geometry: this.createGeometry(),
        });

        this.primitive = this.viewer.scene.primitives.add(new Cesium.Primitive({
            geometryInstances: instance,
            appearance: new Cesium.MaterialAppearance({
                material: new Cesium.Material({
                    fabric: {
                        type: 'Image',
                        uniforms: {
                            image: this.heatmapInstance.getDataURL()
                        }
                    }
                }),
                translucent: true,
                flat: true
            }),
            asynchronous: false
        }));
        this.primitive.id = "heatmap3d";
    }

    /**
     * 销毁
     */
    destroy() {
        let dom = document.getElementById(`easy3d-heatmap-${this.id}`);
        if (dom) dom.remove();
        if (this.primitive) {
            this.viewer.scene.primitives.remove(this.primitive);
            this.primitive = undefined;
        }
    }

    // 计算当前坐标在范围中位置 换算为canvas中的像素坐标
    computeRateInBound(position) {
        if (!position || this.girthX <= 0 || this.girthY <= 0) return null; // 问题4修复：增加非零判断
        
        let ctgc = Cesium.Cartographic.fromCartesian(position.clone());
        ctgc.height = 0;
        position = Cesium.Cartographic.toCartesian(ctgc.clone());

        const p_origin = Cesium.Cartesian3.subtract(position.clone(), this.bound.leftTop, new Cesium.Cartesian3());
        const diffX = Cesium.Cartesian3.dot(p_origin, this.x_axios);
        const diffY = Cesium.Cartesian3.dot(p_origin, this.y_axios);
        
        // 计算后返回整数，避免小数导致canvas坐标异常
        return {
            x: Number((diffX / this.girthX * this.canvasW).toFixed(0)),
            y: Number((diffY / this.girthY * this.canvasW).toFixed(0))
        }
    }

    computeBound(positions) {
        // 先转化为正方形
        if (!positions || positions.length < 3) return;
        
        let boundingSphere = Cesium.BoundingSphere.fromPoints(positions, new Cesium.BoundingSphere());
        let center = boundingSphere.center;
        const radius = boundingSphere.radius;

        let modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(center.clone());
        let modelMatrix_inverse = Cesium.Matrix4.inverse(modelMatrix.clone(), new Cesium.Matrix4());
        let roate_y = new Cesium.Cartesian3(0, 1, 0);

        let rect = [];
        for (let i = 45; i <= 360; i += 90) {
            let roateZ_mtx = Cesium.Matrix3.fromRotationZ(Cesium.Math.toRadians(i), new Cesium.Matrix3());
            let yaix_roate = Cesium.Matrix3.multiplyByVector(roateZ_mtx, roate_y, new Cesium.Cartesian3());
            yaix_roate = Cesium.Cartesian3.normalize(yaix_roate, new Cesium.Cartesian3());
            let third = Cesium.Cartesian3.multiplyByScalar(yaix_roate, radius, new Cesium.Cartesian3());
            let poi = Cesium.Matrix4.multiplyByPoint(modelMatrix, third.clone(), new Cesium.Cartesian3());

            rect.push(poi);
        }

        let lnglats = cartesiansToLnglats(rect, this.viewer);
        let minLat = Number.MAX_VALUE, maxLat = Number.MIN_VALUE, minLng = Number.MAX_VALUE, maxLng = Number.MIN_VALUE;
        const length = rect.length;
        for (let i = 0; i < length; i++) {
            const lnglat = lnglats[i];
            if (!lnglat || lnglat.length < 2) continue; // 过滤无效经纬度
            
            if (lnglat[0] < minLng) {
                minLng = lnglat[0];
            }
            if (lnglat[0] > maxLng) {
                maxLng = lnglat[0];
            }

            if (lnglat[1] < minLat) {
                minLat = lnglat[1];
            }
            if (lnglat[1] > maxLat) {
                maxLat = lnglat[1];
            }
        }

        const diff_lat = maxLat - minLat;
        const diff_lng = maxLng - minLng;

        // 放大正方形轮廓，避免点在边界上
        this.rect.minLat = minLat - diff_lat / length;
        this.rect.maxLat = maxLat + diff_lat / length;
        this.rect.minLng = minLng - diff_lng / length;
        this.rect.maxLng = maxLng + diff_lng / length;

        this.bound = {
            leftTop: Cesium.Cartesian3.fromDegrees(this.rect.minLng, this.rect.maxLat),
            leftBottom: Cesium.Cartesian3.fromDegrees(this.rect.minLng, this.rect.minLat),
            rightTop: Cesium.Cartesian3.fromDegrees(this.rect.maxLng, this.rect.maxLat),
            rightBottom: Cesium.Cartesian3.fromDegrees(this.rect.maxLng, this.rect.minLat),
        }

        // 计算坐标轴和长度，增加非空判断
        if (this.bound.leftTop && this.bound.rightTop && this.bound.leftBottom) {
            this.x_axios = Cesium.Cartesian3.subtract(this.bound.rightTop, this.bound.leftTop, new Cesium.Cartesian3());
            this.x_axios = Cesium.Cartesian3.normalize(this.x_axios, new Cesium.Cartesian3());
            this.y_axios = Cesium.Cartesian3.subtract(this.bound.leftBottom, this.bound.leftTop, new Cesium.Cartesian3());
            this.y_axios = Cesium.Cartesian3.normalize(this.y_axios, new Cesium.Cartesian3());
            
            this.girthX = Cesium.Cartesian3.distance(this.bound.rightTop, this.bound.leftTop);
            this.girthY = Cesium.Cartesian3.distance(this.bound.leftBottom, this.bound.leftTop);
        }
    }

    createGeometry() {
        let opt = this.getGrain();
        // 避免无效geometry导致报错
        if (!opt || !opt.positions || opt.positions.length === 0) {
            console.error("无法创建有效几何图形");
            return new Cesium.Geometry();
        }
        
        let geometry = new Cesium.Geometry({
            attributes: new Cesium.GeometryAttributes({
                position: new Cesium.GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.DOUBLE,
                    componentsPerAttribute: 3,
                    values: opt.positions,
                }),
                st: new Cesium.GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.FLOAT,
                    componentsPerAttribute: 2,
                    values: new Float32Array(opt.st)
                })
            }),
            indices: new Uint16Array(opt.indices),
            primitiveType: Cesium.PrimitiveType[this.primitiveType],
            boundingSphere: Cesium.BoundingSphere.fromVertices(opt.positions),
        })
        return geometry;
    }

    // 根据经纬度跨度和canvas的宽高 来计算顶点坐标及顶点法向量
    getGrain(opt) {
        // 问题2修复：统一使用this.canvasW（大写W）
        let canvasW = this.canvasW || 200;
        let canvasH = this.canvasW || 200;
        let maxLng = this.rect.maxLng;
        let maxLat = this.rect.maxLat;
        let minLng = this.rect.minLng;
        let minLat = this.rect.minLat;

        // 增加经纬度范围有效性判断，避免除法报错
        if (maxLng === minLng || maxLat === minLat) {
            console.error("经纬度范围无效，无法生成网格");
            return { positions: [], st: [], indices: [] };
        }
        
        const granLng_w = (maxLng - minLng) / canvasW; // 经度粒度
        const granLat_H = (maxLat - minLat) / canvasH; // 纬度粒度（注释笔误修正：这里是纬度）
        let positions = [];
        let st = [];
        let indices = [];

        for (let i = 0; i < canvasW; i++) {
            let nowLng = minLng + granLng_w * i;

            for (let j = 0; j < canvasH; j++) {
                let nowLat = minLat + granLat_H * j;
                const value = this.heatmapInstance.getValueAt({
                    x: i,
                    y: j
                });
                let cartesian3 = Cesium.Cartesian3.fromDegrees(nowLng, nowLat, this.baseHeight + (value || 0));
                positions.push(cartesian3.x, cartesian3.y, cartesian3.z);
                st.push(i / canvasW, j / canvasH); 
                if (j != canvasH - 1 && i != canvasW - 1) {
                    indices.push(i * canvasH + j, i * canvasH + j + 1, (i + 1) * canvasH + j);
                    indices.push((i + 1) * canvasH + j, (i + 1) * canvasH + j + 1, i * canvasH + j + 1);
                }
            }
        }

        return {
            positions: positions,
            st: st,
            indices: indices
        }
    }

    createDom() {
        this.dom = window.document.createElement("div");
        this.dom.id = `easy3d-heatmap-${this.id}`;
        this.dom.className = `easy3d-heatmap`;
        // 问题2修复：统一使用this.canvasW（大写W）
        this.dom.style.width = this.canvasW + "px";
        this.dom.style.height = this.canvasW + "px";
        this.dom.style.position = "absolute";
        // 问题1修复：替换display: none为visibility: hidden + 移出视口，保证canvas正常初始化
        this.dom.style.visibility = "hidden";
        this.dom.style.left = "-9999px";
        this.dom.style.top = "-9999px";
        
        let mapDom = window.document.getElementById(this.viewer.container.id);
        if (mapDom) mapDom.appendChild(this.dom);
    }
}

export default Heatmap3d