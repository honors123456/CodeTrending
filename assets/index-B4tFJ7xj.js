(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))s(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const c of i.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&s(c)}).observe(document,{childList:!0,subtree:!0});function a(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function s(n){if(n.ep)return;n.ep=!0;const i=a(n);fetch(n.href,i)}})();const $=[{id:"python",display:"Python",trendingSlug:"python",ghName:"Python"},{id:"javascript",display:"JavaScript",trendingSlug:"javascript",ghName:"JavaScript"},{id:"typescript",display:"TypeScript",trendingSlug:"typescript",ghName:"TypeScript"},{id:"go",display:"Go",trendingSlug:"go",ghName:"Go"},{id:"rust",display:"Rust",trendingSlug:"rust",ghName:"Rust"},{id:"java",display:"Java",trendingSlug:"java",ghName:"Java"},{id:"cpp",display:"C++",trendingSlug:"c%2B%2B",ghName:"C++"},{id:"c",display:"C",trendingSlug:"c",ghName:"C"},{id:"csharp",display:"C#",trendingSlug:"c%23",ghName:"C#"},{id:"kotlin",display:"Kotlin",trendingSlug:"kotlin",ghName:"Kotlin"},{id:"swift",display:"Swift",trendingSlug:"swift",ghName:"Swift"},{id:"php",display:"PHP",trendingSlug:"php",ghName:"PHP"}];function F(t,e=110,a=28){const s=[];if(t.forEach((o,h)=>{o!==null&&s.push({i:h,v:o})}),s.length<2)return'<span class="pending-data">—</span>';const n=Math.min(...s.map(o=>o.v)),i=Math.max(...s.map(o=>o.v)),c=3,T=t.length-1,u=o=>c+o/T*(e-c*2),C=o=>i===n?a/2:a-c-(o-n)/(i-n)*(a-c*2),m=s.map((o,h)=>`${h===0?"M":"L"}${u(o.i).toFixed(1)},${C(o.v).toFixed(1)}`).join(""),M=s[0],v=s[s.length-1],j=`${m}L${u(v.i).toFixed(1)},${a-1}L${u(M.i).toFixed(1)},${a-1}Z`,y=`近14天 star：${n.toLocaleString()} → ${v.v.toLocaleString()}`;return`<svg class="spark" width="${e}" height="${a}" viewBox="0 0 ${e} ${a}" role="img" aria-label="${y}"><title>${y}</title><path class="fill" d="${j}"/><path class="line" d="${m}"/></svg>`}const l=document.getElementById("app");function r(t){return t?t.replace(/[&<>"']/g,e=>`&#${e.charCodeAt(0)};`):""}function d(t){return t>=1e4?`${(t/1e3).toFixed(1)}k`:t.toLocaleString()}function b(t){const e=Math.abs(t)>=100?Math.round(t).toLocaleString():t.toFixed(1);return t>0?`+${e}`:`${e}`}function S(t){return new Date(t).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:!1})}const A={lt1y:"<1年",y1to3:"1-3年",gt3y:">3年"};async function w(t){try{const e=await fetch(t);return e.ok?await e.json():null}catch{return null}}function E(t){const e=[];return t.flags.suspectedFake&&e.push('<span class="badge fake" title="短时间大量疑似新注册账号加星，请谨慎看待其热度">⚠ 疑似刷量</span>'),t.flags.oneOffSpike&&e.push('<span class="badge spike" title="上过热搜后回落，非持续增长">⚡ 一次性热点</span>'),t.flags.steadyGrowth&&e.push('<span class="badge steady" title="连续 7 天稳定正增长">↗ 稳定增长</span>'),e.push(`<span class="badge age">${A[t.ageBucket]}</span>`),`<span class="badges">${e.join("")}</span>`}function P(t,e){var n;const a=e?`<span class="num-sub">${r(((n=$.find(i=>i.id===t.language))==null?void 0:n.display)??t.language)} · </span>`:"",s=t.descriptionZh??t.description;return`<td class="left repo-name">
    <div>${a}<a href="https://github.com/${r(t.repo)}" target="_blank" rel="noopener">${r(t.repo)}</a>${E(t)}</div>
    <div class="repo-desc" title="${r(t.description)}">${r(s)||"&nbsp;"}</div>
  </td>`}function x(t){if(t.starVelocity===null)return'<td><span class="pending-data">积累中</span></td>';const e=t.velocityWindowDays<7?`<div class="num-sub">${t.velocityWindowDays}天窗口</div>`:"";return`<td><span class="num-main pos">+${d(Math.round(t.starVelocity))}/天</span>${e}</td>`}function G(t){return t.acceleration===null?'<td><span class="pending-data" title="加速度需要至少 6 天历史数据">积累中</span></td>':`<td><span class="num-main ${t.acceleration>0?"pos":t.acceleration<0?"neg":""}">${b(t.acceleration)}</span></td>`}function H(t){if(t.contributorCount===null)return'<td><span class="pending-data">—</span></td>';const e=t.contributorGrowth7d!==null&&t.contributorGrowth7d!==0?` <span class="pos">${b(t.contributorGrowth7d)}</span>`:"",a=t.busFactorTop1Share!==null?`<div class="num-sub" title="top1 贡献者 commit 占比，越高单点风险越大">Top1 占 ${Math.round(t.busFactorTop1Share*100)}%</div>`:"";return`<td>${d(t.contributorCount)}${e}${a}</td>`}function g(t,e=!1){return t.length===0?'<div class="empty">暂无数据</div>':`<div class="table-wrap"><table class="board-table">
    <thead><tr>
      <th></th><th class="left">仓库</th><th>增速</th><th>加速度</th><th>近14天</th>
      <th>Star</th><th>Fork/Star</th><th>贡献者</th><th>维护分</th>
    </tr></thead>
    <tbody>${t.map((s,n)=>`<tr>
        <td class="rank">${n+1}</td>
        ${P(s,e)}
        ${x(s)}
        ${G(s)}
        <td>${F(s.sparkline)}</td>
        <td>${d(s.stars)}<div class="num-sub">fork ${d(s.forks)}</div></td>
        <td title="fork/star 比，过低可能是围观热度">${(s.forkStarRatio*100).toFixed(1)}%</td>
        ${H(s)}
        <td title="commit 近因 + 提交频率 + issue 健康 + release 节奏的 0-100 合成分">${s.maintenanceScore??"—"}</td>
      </tr>`).join("")}</tbody>
  </table></div>`}function D(t){return`<nav class="langs container">${[`<a href="#/" class="${t==="home"?"active":""}">综合</a>`,...$.map(a=>`<a href="#/lang/${a.id}" class="${t===a.id?"active":""}">${a.display}</a>`)].join("")}</nav>`}function p(t,e,a){return`
  <header class="site">
    <div class="container">
      <div class="site-title"><span class="logo">📈</span> CodeTrending · 开源趋势雷达</div>
      <div class="site-sub">用变化率发现正在流行的开源项目 —— 看增速与加速度，不看累计 star</div>
      <div class="site-meta">${e}</div>
    </div>
    ${D(t)}
  </header>
  <main class="container">${a}</main>
  <footer class="site"><div class="container">
    <p>指标口径：增速 = 近 7 天日均新增 star；加速度 = 近 3 天增速 − 前 3 天增速（需 6 天以上历史，不足显示「积累中」）；维护分为 commit 近因、提交频率、issue 健康、release 节奏的 0-100 合成分。</p>
    <p>榜单在语言内按百分位归一化并按仓库年龄分桶，跨语言不比 star 绝对值；「疑似刷量」由尖峰检测 + 加星账号抽样标注，仅供参考。</p>
    <p>数据来源：GitHub Trending（Firecrawl 抓取）+ GitHub API，每天北京时间 8:05 / 12:05 / 19:05 更新。</p>
  </div></footer>`}const k='<div class="empty">暂无数据。请先运行采集：npm run collect（详见 README）</div>';async function O(){const t=await w("./data/summary.json");if(!t){l.innerHTML=p("home","等待首次采集",k);return}const e=t.languages.map(s=>`<a class="lang-card" href="#/lang/${s.language}">
        <div class="name">${s.display}</div>
        <div class="count">${s.repoCount} 个在榜仓库</div>
        <div class="top">${s.topRepo?`🔥 ${r(s.topRepo.split("/")[1]??s.topRepo)} +${d(Math.round(s.topVelocity??0))}/天`:"暂无数据"}</div>
      </a>`).join(""),a=t.historyDays<7?`<section class="board"><div class="desc">⏳ 数据积累中：当前仅 ${t.historyDays} 天快照历史，加速度与趋势分类将在 6-7 天后完整可用。</div></section>`:"";l.innerHTML=p("home",`数据更新于 ${S(t.generatedAt)} · 快照历史 ${t.historyDays} 天`,`${a}
    <section class="board">
      <h2>按语言浏览</h2>
      <div class="desc">12 种主流语言，点击进入语言榜单</div>
      <div class="lang-grid">${e}</div>
    </section>
    <section class="board">
      <h2>🐎 全局黑马榜</h2>
      <div class="desc">star 增速正在变快的项目（按语言内加速度百分位排序）—— 比排行榜更早发现爆发点</div>
      ${g(t.darkHorses,!0)}
    </section>
    <section class="board">
      <h2>🚀 全局增速榜</h2>
      <div class="desc">语言内增速百分位最高的项目（年龄分桶归一化，跨语言可比）</div>
      ${g(t.globalVelocity,!0)}
    </section>`)}let f="velocity";async function L(t){const e=$.find(i=>i.id===t);if(!e){location.hash="#/";return}const a=await w(`./data/lang/${t}.json`);if(!a){l.innerHTML=p(t,"等待首次采集",k);return}const s=[{key:"velocity",label:"增速榜",desc:"近 7 天日均新增 star 最高",repos:a.velocityTop},{key:"acceleration",label:"黑马榜",desc:"增速变化最大（正在爆发）",repos:a.accelerationTop},{key:"stars",label:"Star 排行",desc:"按 star 总数排序",repos:a.starsTop},{key:"new",label:"新星榜",desc:"创建不满 90 天的新项目按增速排序",repos:a.newStars}],n=s.find(i=>i.key===f)??s[0];l.innerHTML=p(t,`数据更新于 ${S(a.generatedAt)}`,`<section class="board">
      <h2>${e.display} 趋势榜</h2>
      <div class="desc">${n.desc}</div>
      <div class="tabs">${s.map(i=>`<button data-tab="${i.key}" class="${i.key===n.key?"active":""}">${i.label}</button>`).join("")}</div>
      ${g(n.repos)}
    </section>`),l.querySelectorAll(".tabs button").forEach(i=>{i.addEventListener("click",()=>{f=i.dataset.tab,L(t)})})}function N(){const e=(location.hash||"#/").match(/^#\/lang\/([\w#+-]+)/);e?L(e[1]):(f="velocity",O()),window.scrollTo(0,0)}window.addEventListener("hashchange",N);N();
