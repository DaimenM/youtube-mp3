(()=>{var e={};e.id=442,e.ids=[442],e.modules={846:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},4870:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},3295:e=>{"use strict";e.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},9294:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-async-storage.external.js")},3033:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},2412:e=>{"use strict";e.exports=require("assert")},4297:e=>{"use strict";e.exports=require("async_hooks")},9428:e=>{"use strict";e.exports=require("buffer")},9646:e=>{"use strict";e.exports=require("child_process")},4287:e=>{"use strict";e.exports=require("console")},5511:e=>{"use strict";e.exports=require("crypto")},6686:e=>{"use strict";e.exports=require("diagnostics_channel")},4735:e=>{"use strict";e.exports=require("events")},1630:e=>{"use strict";e.exports=require("http")},3496:e=>{"use strict";e.exports=require("http2")},1645:e=>{"use strict";e.exports=require("net")},3873:e=>{"use strict";e.exports=require("path")},4998:e=>{"use strict";e.exports=require("perf_hooks")},1723:e=>{"use strict";e.exports=require("querystring")},7910:e=>{"use strict";e.exports=require("stream")},4175:e=>{"use strict";e.exports=require("stream/web")},1204:e=>{"use strict";e.exports=require("string_decoder")},4631:e=>{"use strict";e.exports=require("tls")},9551:e=>{"use strict";e.exports=require("url")},8354:e=>{"use strict";e.exports=require("util")},3440:e=>{"use strict";e.exports=require("util/types")},3566:e=>{"use strict";e.exports=require("worker_threads")},4075:e=>{"use strict";e.exports=require("zlib")},8474:e=>{"use strict";e.exports=require("node:events")},7075:e=>{"use strict";e.exports=require("node:stream")},7975:e=>{"use strict";e.exports=require("node:util")},6371:(e,r,t)=>{"use strict";t.r(r),t.d(r,{patchFetch:()=>P,routeModule:()=>g,serverHooks:()=>N,workAsyncStorage:()=>y,workUnitAsyncStorage:()=>O});var s={};t.r(s),t.d(s,{GET:()=>T,OPTIONS:()=>f,POST:()=>h,config:()=>q});var o=t(2706),i=t(8203),n=t(5994),a=t(9187),u=t(9646),c=t(3873),l=t.n(c);let p=require("fs");var d=t.n(p);let m=require("os");var x=t.n(m),A=t(6774);let w=null;async function T(){return a.NextResponse.json({fileName:w||null,success:!0})}async function h(e){try{let r=await e.formData(),t=r.get("downloadUrl"),s={fileName:r.get("fileName"),artistName:r.get("artistName"),albumName:r.get("albumName")};w=s.fileName?.toString()||null;let o=await fetch(t),i=await o.arrayBuffer(),n=Buffer.from(i),c=x().tmpdir(),p=l().join(c,"temp.mp3");await d().promises.writeFile(p,n);let m=r.get("coverArt");if(m){let e=Buffer.from(await m.arrayBuffer()),r=l().join(c,"cover.jpg");await d().promises.writeFile(r,e),s.coverArt=r}let T=l().join(process.cwd(),"src","scripts","edit_mp3.py"),h=(0,u.spawn)("python",[T,p,JSON.stringify(s)],{});return new Promise((e,r)=>{h.on("close",async r=>{if(0===r)try{let r=await (0,A.yJ)(`${s.fileName}.mp3`,await d().promises.readFile(p),{access:"public",addRandomSuffix:!0,contentType:"audio/mpeg"});await d().promises.unlink(p),s.coverArt&&await d().promises.unlink(s.coverArt),e(a.NextResponse.json({success:!0,downloadUrl:r.url,fileName:s.fileName,artistName:s.artistName,albumName:s.albumName},{headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, PUT, DELETE, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"}}))}catch(r){console.error("Blob upload error:",r),e(a.NextResponse.json({success:!1,error:"Failed to upload edited MP3"},{status:500,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, PUT, DELETE, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"}}))}else e(a.NextResponse.json({success:!1,error:"Failed to edit MP3"},{status:500,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, PUT, DELETE, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"}}))}),h.on("error",e=>{console.error("Process error:",e),r(e)})})}catch(e){return console.error("Request error:",e),a.NextResponse.json({error:"Error processing request",details:e instanceof Error?e.message:String(e)},{status:500,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, PUT, DELETE, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"}})}}async function f(){return new a.NextResponse(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, PUT, DELETE, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"}})}let q={type:"setting",settings:{"http.cors":!0,"http.corsAllowOrigins":["*"],"http.corsAllowMethods":["GET, POST, PUT, DELETE, OPTIONS"],"http.corsAllowHeaders":["Content-Type, Authorization"]}},g=new o.AppRouteRouteModule({definition:{kind:i.RouteKind.APP_ROUTE,page:"/api/edit/route",pathname:"/api/edit",filename:"route",bundlePath:"app/api/edit/route"},resolvedPagePath:"C:\\Users\\mdaim\\youtube-mp3\\src\\app\\api\\edit\\route.ts",nextConfigOutput:"",userland:s}),{workAsyncStorage:y,workUnitAsyncStorage:O,serverHooks:N}=g;function P(){return(0,n.patchFetch)({workAsyncStorage:y,workUnitAsyncStorage:O})}},6487:()=>{},8335:()=>{}};var r=require("../../../webpack-runtime.js");r.C(e);var t=e=>r(r.s=e),s=r.X(0,[638,452,774],()=>t(6371));module.exports=s})();