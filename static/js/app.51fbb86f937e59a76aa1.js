webpackJsonp([1],{"51fW":function(e,t){},NHnr:function(e,t,i){"use strict";Object.defineProperty(t,"__esModule",{value:!0});var n=i("7+uW"),o={render:function(){var e=this.$createElement,t=this._self._c||e;return t("div",{attrs:{id:"app"}},[t("router-view")],1)},staticRenderFns:[]};var r=i("VU/8")({name:"App"},o,!1,function(e){i("ltNK")},null,null).exports,s=i("/ocq"),a=i("pFYg"),l=i.n(a),d=i("mtWM"),c=i.n(d),u={data:function(){return{logo:"../static/img/logo.jpeg",mapJson:"../static/json/map.json",url:"http://api.lkmao.com/v1/register",phoneNumber:"",invCode:"",province:"",sheng:"",shi:"",shi1:[],qu:"",qu1:[],city:"",block:"",E:"",URL:""}},methods:{startReg:function(){""==this.phoneNumber?this.$notify({title:"提示",message:"请输入手机号",offset:100,type:"error",duration:1e3}):1!=/^[1][3,4,5,7,8][0-9]{9}$/.test(this.phoneNumber)?this.$notify({title:"提示",message:"请输入正确手机号",offset:100,type:"error",duration:1e3}):""==this.sheng?this.$notify({title:"提示",message:"请选择地区",offset:100,type:"error",duration:1e3}):this.submitData()},submitData:function(){var e=this,t=new FormData;t.set("mobile",this.phoneNumber),t.set("invite_code",this.invCode),c()({method:"post",url:this.url,data:t,config:{headers:{"Content-Type":"application/x-www-form-urlencoded"}}}).then(function(t){1===t.data.success?e.$notify({title:"提示",message:"邀请验证成功,短信验证已发送",offset:100,type:"error",duration:3e3}):e.$router.push({name:"registertwo",params:{mobile:e.phoneNumber,invite_code:e.invCode,address_id:e.E}})}).catch(function(e){console.log(e)})},getCityData:function(){var e=this;c.a.get(this.mapJson).then(function(t){if(200==t.status){var i=t.data;e.province=[],e.city=[],e.block=[];for(var n in i)n.match(/0000$/)?e.province.push({id:n,value:i[n],children:[]}):n.match(/00$/)?e.city.push({id:n,value:i[n],children:[]}):e.block.push({id:n,value:i[n]});for(var o in e.province)for(var r in e.city)e.province[o].id.slice(0,2)===e.city[r].id.slice(0,2)&&e.province[o].children.push(e.city[r]);for(var s in e.city)for(var a in e.block)e.block[a].id.slice(0,4)===e.city[s].id.slice(0,4)&&e.city[s].children.push(e.block[a])}else console.log(t.status)}).catch(function(e){console.log(l()(+e))})},choseProvince:function(e){for(var t in this.province)e===this.province[t].id&&(this.shi1=this.province[t].children,this.shi=this.province[t].children[0].value,this.qu1=this.province[t].children[0].children,this.qu=this.province[t].children[0].children[0].value,this.E=this.qu1[0].id)},choseCity:function(e){for(var t in this.city)e===this.city[t].id&&(this.qu1=this.city[t].children,this.qu=this.city[t].children[0].value,this.E=this.qu1[0].id,console.log(this.E))},choseBlock:function(e){this.E=e},getUrl:function(){this.invCode=window.location.href,console.log(this.invCode)}},created:function(){this.getCityData(),this.getUrl()}},v={render:function(){var e=this,t=e.$createElement,i=e._self._c||t;return i("div",{attrs:{id:"register"}},[i("div",{attrs:{id:"title"}},[e._v("\n    注册（1/2）\n  ")]),e._v(" "),i("div",{attrs:{id:"div_img"}},[i("img",{attrs:{src:e.logo,alt:""}}),e._v(" "),i("p",[e._v("使用邀请码注册")])]),e._v(" "),i("div",{attrs:{id:"sure"}},[i("ul",[i("li",[i("input",{directives:[{name:"model",rawName:"v-model",value:e.phoneNumber,expression:"phoneNumber"}],attrs:{type:"number",placeholder:"输入手机号"},domProps:{value:e.phoneNumber},on:{input:function(t){t.target.composing||(e.phoneNumber=t.target.value)}}})]),e._v(" "),i("li",[i("input",{directives:[{name:"model",rawName:"v-model",value:e.invCode,expression:"invCode"}],attrs:{type:"text",readonly:"readonly"},domProps:{value:e.invCode},on:{input:function(t){t.target.composing||(e.invCode=t.target.value)}}})])])]),e._v(" "),e._m(0),e._v(" "),i("div",{attrs:{id:"option"}},[i("el-row",[i("el-col",{attrs:{span:8}},[i("el-select",{attrs:{placeholder:"请选择地区"},on:{change:e.choseProvince},model:{value:e.sheng,callback:function(t){e.sheng=t},expression:"sheng"}},e._l(e.province,function(e){return i("el-option",{key:e.id,attrs:{label:e.value,value:e.id}})}))],1),e._v(" "),i("el-col",{attrs:{span:8}},[i("el-select",{attrs:{placeholder:"请选择地区"},on:{change:e.choseCity},model:{value:e.shi,callback:function(t){e.shi=t},expression:"shi"}},e._l(e.shi1,function(e){return i("el-option",{key:e.id,attrs:{label:e.value,value:e.id}})}))],1),e._v(" "),i("el-col",{attrs:{span:8}},[i("el-select",{attrs:{placeholder:"请选择地区"},on:{change:e.choseBlock},model:{value:e.qu,callback:function(t){e.qu=t},expression:"qu"}},e._l(e.qu1,function(e){return i("el-option",{key:e.id,attrs:{label:e.value,value:e.id}})}))],1)],1)],1),e._v(" "),i("div",{attrs:{id:"btn"}},[i("button",{on:{click:e.startReg}},[e._v("开始注册")]),e._v(" "),i("p",[e._v("下一步输入短信验证码")])])])},staticRenderFns:[function(){var e=this,t=e.$createElement,i=e._self._c||t;return i("div",{attrs:{id:"area"}},[i("span",[e._v("当前所在地：")]),e._v("     "),i("span",[e._v("(请如实选择，这决定您的分润利益!)")])])}]};var h=i("VU/8")(u,v,!1,function(e){i("51fW")},"data-v-6333056f",null).exports,p={data:function(){return{telNumber:"",invCode:"",sureCode:"",addressId:"",loading:!1,url:"http://api.lkmao.com/v1/register_validate",urlCode:"http://api.lkmao.com/v1/register"}},methods:{endReg:function(){""==this.sureCode?this.$notify({title:"提示",message:"请输入验证码",offset:100,type:"error",duration:1e3}):6!=this.sureCode.length?this.$notify({title:"提示",message:"验证码长度为6位",offset:100,type:"error",duration:1e3}):this.sendData()},send:function(){var e=10,t=document.querySelector("#resend"),i=setInterval(function(){e--,t.innerText=e+"s重发",t.setAttribute("disabled","disabled"),t.style.background="#6d9fa6",1==e&&(clearInterval(i),e=10,t.innerText="重新发送",t.removeAttribute("disabled"),t.style.background="#00bcd5")},1e3)},reSend:function(){this.reSendData()},reSendData:function(){var e=this,t=new FormData;t.set("mobile",this.telNumber),t.set("invite_code",this.invCode),c()({method:"post",url:this.urlCode,data:t,config:{headers:{"Content-Type":"application/x-www-form-urlencoded"}}}).then(function(t){1==t.data.success?(e.send(),e.$notify({title:"提示",message:"短信验证已发送",offset:100,type:"error",duration:3e3}),console.log(t.data.msg)):(e.$notify({title:"提示",message:"邀请码不存在",offset:100,type:"error",duration:4e3}),console.log(t.data.msg))}).catch(function(e){console.log(l()(+e))})},receiveData:function(){this.telNumber=this.$route.params.mobile,this.invCode=this.$route.params.invite_code,this.addressId=this.$route.params.address_id},sendData:function(){var e=this,t=new FormData;t.set("mobile",this.telNumber),t.set("code",this.sureCode),t.set("invite_code",this.invCode),t.set("address_id",this.addressId),c()({method:"post",url:this.url,data:t,config:{headers:{"Content-Type":"application/x-www-form-urlencoded"}}}).then(function(t){console.log(t.data),e.loading=!0,1==t.data.success?(e.loading=!1,e.$notify({title:"提示",message:t.data.msg,offset:100,type:"success",duration:3e3})):(e.loading=!1,e.$notify({title:"提示",message:t.data.msg,offset:100,type:"error",duration:3e3}))}).catch(function(e){console.log(l()(+e))})}},mounted:function(){this.send()},created:function(){this.receiveData()}},m={render:function(){var e=this,t=e.$createElement,i=e._self._c||t;return i("div",{directives:[{name:"loading",rawName:"v-loading",value:e.loading,expression:"loading"}],attrs:{id:"registertwo","element-loading-text":"注册中请稍后","element-loading-spinner":"el-icon-loading","element-loading-background":"rgba(0, 0, 0, 0.8)"}},[i("div",{attrs:{id:"title"}},[e._v("\n      注册（2/2）\n    ")]),e._v(" "),e._m(0),e._v(" "),i("div",{attrs:{id:"tel"}},[i("input",{directives:[{name:"model",rawName:"v-model",value:e.telNumber,expression:"telNumber"}],attrs:{type:"text",readonly:"readonly"},domProps:{value:e.telNumber},on:{input:function(t){t.target.composing||(e.telNumber=t.target.value)}}}),i("input",{directives:[{name:"model",rawName:"v-model",value:e.invCode,expression:"invCode"}],attrs:{type:"text",readonly:"readonly"},domProps:{value:e.invCode},on:{input:function(t){t.target.composing||(e.invCode=t.target.value)}}})]),e._v(" "),i("div",{attrs:{id:"code"}},[i("input",{directives:[{name:"model",rawName:"v-model",value:e.sureCode,expression:"sureCode"}],attrs:{type:"number",placeholder:"输入短信验证码"},domProps:{value:e.sureCode},on:{input:function(t){t.target.composing||(e.sureCode=t.target.value)}}}),i("button",{attrs:{id:"resend"},on:{click:e.reSend}},[e._v("立即发送")])]),e._v(" "),i("div",{attrs:{id:"end"}},[i("button",{on:{click:e.endReg}},[e._v("确定注册")])])])},staticRenderFns:[function(){var e=this.$createElement,t=this._self._c||e;return t("div",{attrs:{id:"tel_fa"}},[t("input",{attrs:{type:"text",value:"手机号",readonly:"readonly"}}),t("input",{attrs:{value:"邀请码",type:"text",readonly:"readonly"}})])}]};var f=i("VU/8")(p,m,!1,function(e){i("zRtn")},"data-v-22835696",null).exports;n.default.use(s.a);var g=new s.a({mode:"history",routes:[{path:"/",redirect:"/register"},{path:"/register",name:"register",component:h},{path:"/registertwo",name:"registertwo",component:f}]}),y=i("zL8q"),b=i.n(y);i("tvR6");n.default.use(b.a),n.default.config.productionTip=!1,new n.default({el:"#app",router:g,components:{App:r},template:"<App/>"})},ltNK:function(e,t){},tvR6:function(e,t){},zRtn:function(e,t){}},["NHnr"]);
//# sourceMappingURL=app.51fbb86f937e59a76aa1.js.map