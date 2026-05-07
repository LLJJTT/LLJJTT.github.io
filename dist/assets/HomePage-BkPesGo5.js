import{c as d,a as t,b as x,F as M,r as _,n as c,d as v,w as n,e as C,f as y,g as u,u as B,o as l,h,i as g,t as b,T as V}from"./index-DHpSOtqe.js";import{_ as z}from"./_plugin-vue_export-helper-DlAUqK2U.js";const L={class:"home-page"},D={class:"menu"},F={class:"menu-icon"},H={class:"menu-text"},I={__name:"HomePage",setup(N){const p=B(),s=y(!1),f=()=>{s.value=!s.value},m=()=>{p.push("/")},w={wall:{template:`
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 9l6 6 6-6"></path>
        <path d="M12 3v18"></path>
      </svg>
    `},droneSpray:{template:`
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 12c-3 0-6 3-6 6v3l6-3 6 3v-3c0-3-3-6-6-6z"></path>
        <path d="M12 12V9"></path>
        <path d="M12 9V6"></path>
        <path d="M16 9h-8"></path>
      </svg>
    `},pointClustering:{template:`
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <circle cx="12" cy="12" r="4"></circle>
        <circle cx="8" cy="8" r="2"></circle>
        <circle cx="16" cy="16" r="2"></circle>
        <circle cx="8" cy="16" r="2"></circle>
        <circle cx="16" cy="8" r="2"></circle>
      </svg>
    `},heatmap:{template:`
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
      </svg>
    `},suspendedIsland:{template:`
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
        <path d="M12 7V2"></path>
        <path d="M12 17V22"></path>
      </svg>
    `},pointPopup:{template:`
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3"></circle>
      </svg>
    `},heightFog:{template:`
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
        <path d="M12 7v10"></path>
      </svg>
    `}},k=C(()=>{const r=p.options.routes;if(r&&r.length>0){const e=r[0].children;if(e)return e.filter(a=>a.path&&a.path!=="").map(a=>{var i;return{path:a.path,title:((i=a.meta)==null?void 0:i.title)||a.name,icon:w[a.name]||{template:`
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 22V12"></path>
                <path d="M12 6h.01"></path>
              </svg>
            `}}})}return[]});return(r,e)=>{const a=u("router-link"),i=u("router-view");return l(),d("div",L,[t("div",{class:c(["sidebar",{collapsed:s.value}])},[t("div",{class:"logo",onClick:m},[...e[0]||(e[0]=[x('<div class="logo-icon" data-v-1ef44afb><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" data-v-1ef44afb><circle cx="12" cy="12" r="10" data-v-1ef44afb></circle><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" data-v-1ef44afb></path><path d="M2 12h20" data-v-1ef44afb></path></svg></div><div class="logo-text" data-v-1ef44afb>Cesium 3D</div>',2)])]),t("nav",D,[(l(!0),d(M,null,_(k.value,o=>(l(),h(a,{key:o.path,to:o.path,class:"menu-item","active-class":"active"},{default:n(()=>[t("div",F,[(l(),h(g(o.icon)))]),t("div",H,b(o.title),1)]),_:2},1032,["to"]))),128))]),e[1]||(e[1]=t("div",{class:"sidebar-footer"},[t("div",{class:"version"},"v1.0.0")],-1))],2),t("div",{class:c(["collapse-btn",{collapsed:s.value}]),onClick:f},[...e[2]||(e[2]=[t("svg",{width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2"},[t("polyline",{points:"15 18 9 12 15 6"})],-1)])],2),t("div",{class:c(["content",{"sidebar-collapsed":s.value}])},[v(i,null,{default:n(({Component:o})=>[v(V,{name:"fade",mode:"out-in"},{default:n(()=>[(l(),h(g(o)))]),_:2},1024)]),_:1})],2)])}}},T=z(I,[["__scopeId","data-v-1ef44afb"]]);export{T as default};
