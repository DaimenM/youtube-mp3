(()=>{var e={};e.id=442,e.ids=[442],e.modules={846:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},4870:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},3295:e=>{"use strict";e.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},9294:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-async-storage.external.js")},3033:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},2412:e=>{"use strict";e.exports=require("assert")},4297:e=>{"use strict";e.exports=require("async_hooks")},9428:e=>{"use strict";e.exports=require("buffer")},9646:e=>{"use strict";e.exports=require("child_process")},4287:e=>{"use strict";e.exports=require("console")},5511:e=>{"use strict";e.exports=require("crypto")},6686:e=>{"use strict";e.exports=require("diagnostics_channel")},4735:e=>{"use strict";e.exports=require("events")},1630:e=>{"use strict";e.exports=require("http")},3496:e=>{"use strict";e.exports=require("http2")},1645:e=>{"use strict";e.exports=require("net")},3873:e=>{"use strict";e.exports=require("path")},4998:e=>{"use strict";e.exports=require("perf_hooks")},1723:e=>{"use strict";e.exports=require("querystring")},7910:e=>{"use strict";e.exports=require("stream")},4175:e=>{"use strict";e.exports=require("stream/web")},1204:e=>{"use strict";e.exports=require("string_decoder")},4631:e=>{"use strict";e.exports=require("tls")},9551:e=>{"use strict";e.exports=require("url")},8354:e=>{"use strict";e.exports=require("util")},3440:e=>{"use strict";e.exports=require("util/types")},3566:e=>{"use strict";e.exports=require("worker_threads")},4075:e=>{"use strict";e.exports=require("zlib")},8474:e=>{"use strict";e.exports=require("node:events")},7075:e=>{"use strict";e.exports=require("node:stream")},7975:e=>{"use strict";e.exports=require("node:util")},6371:(e,r,t)=>{"use strict";t.r(r),t.d(r,{patchFetch:()=>N,routeModule:()=>y,serverHooks:()=>j,workAsyncStorage:()=>v,workUnitAsyncStorage:()=>h});var s={};t.r(s),t.d(s,{GET:()=>g,POST:()=>w});var i=t(2706),o=t(8203),u=t(5994),a=t(9187),n=t(9646),p=t(3873),c=t.n(p);let l=require("fs");var d=t.n(l);let x=require("os");var m=t.n(x),q=t(6774);let f=null;async function g(){return a.NextResponse.json({fileName:f||null})}async function w(e){try{let r=await e.formData(),t=r.get("downloadUrl"),s={fileName:r.get("fileName"),artistName:r.get("artistName"),albumName:r.get("albumName")};f=s.fileName?.toString()||null;let i=await fetch(t),o=await i.arrayBuffer(),u=Buffer.from(o),p=m().tmpdir(),l=c().join(p,"temp.mp3");await d().promises.writeFile(l,u);let x=r.get("coverArt");if(x){let e=Buffer.from(await x.arrayBuffer()),r=c().join(p,"cover.jpg");await d().promises.writeFile(r,e),s.coverArt=r}let g=c().join("src","scripts","edit_mp3.py");console.log(process.cwd());let w=(0,n.spawn)("python",[g,l,JSON.stringify(s)],{});return new Promise(e=>{w.on("close",async r=>{if(0===r)try{let r=await (0,q.yJ)(`${s.fileName}.mp3`,await d().promises.readFile(l),{access:"public",addRandomSuffix:!0,contentType:"audio/mpeg"});await d().promises.unlink(l),s.coverArt&&await d().promises.unlink(s.coverArt),e(a.NextResponse.json({success:!0,downloadUrl:r.url}))}catch(r){console.error("Blob upload error:",r),e(a.NextResponse.json({error:"Failed to upload edited MP3"},{status:500}))}else e(a.NextResponse.json({error:"Failed to edit MP3"},{status:500}))})})}catch(e){return a.NextResponse.json({error:"Error processing request",details:e instanceof Error?e.message:String(e)},{status:500})}}let y=new i.AppRouteRouteModule({definition:{kind:o.RouteKind.APP_ROUTE,page:"/api/edit/route",pathname:"/api/edit",filename:"route",bundlePath:"app/api/edit/route"},resolvedPagePath:"C:\\Users\\mdaim\\youtube-mp3\\src\\app\\api\\edit\\route.ts",nextConfigOutput:"",userland:s}),{workAsyncStorage:v,workUnitAsyncStorage:h,serverHooks:j}=y;function N(){return(0,u.patchFetch)({workAsyncStorage:v,workUnitAsyncStorage:h})}},6487:()=>{},8335:()=>{}};var r=require("../../../webpack-runtime.js");r.C(e);var t=e=>r(r.s=e),s=r.X(0,[638,452,774],()=>t(6371));module.exports=s})();