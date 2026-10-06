const test=require('node:test'),assert=require('node:assert/strict');
const {prepareMealImage}=require('../../src/utils/meal-image-upload');
test('large phone photos are resized and compressed before upload; temporary URLs are released',async()=>{
 const sizes=[900000,420000],qualities=[],draws=[],revoked=[];
 const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage:(image,x,y,w,h)=>draws.push([w,h])}),toBlob:(cb,type,q)=>{qualities.push(q);assert.equal(type,'image/jpeg');cb({size:sizes.shift(),type})}};
 const result=await prepareMealImage('blob:original',{fetch:async()=>({ok:true,blob:async()=>({size:9000000,type:'image/jpeg'})}),Image:class{constructor(){this.naturalWidth=4032;this.naturalHeight=3024}set src(v){assert.equal(v,'blob:original');this.onload()}},createCanvas:()=>canvas,URL:{createObjectURL:blob=>{assert.ok(blob.size<512*1024);return 'blob:compressed'},revokeObjectURL:url=>revoked.push(url)}});
 assert.equal(result.filePath,'blob:compressed');assert.deepEqual(draws,[[1600,1200]]);assert.deepEqual(qualities,[.82,.68]);assert.equal(canvas.width,0);result.release();assert.deepEqual(revoked,['blob:compressed']);
});
test('small supported images are not enlarged or recompressed',async()=>{
 const result=await prepareMealImage('blob:small',{fetch:async()=>({ok:true,blob:async()=>({size:100000,type:'image/png'})})});assert.equal(result.filePath,'blob:small');result.release();
});
test('unsupported image decoding gives an actionable error instead of attempting upload',async()=>{
 await assert.rejects(prepareMealImage('blob:heic',{fetch:async()=>({ok:true,blob:async()=>({size:3000000,type:'image/heic'})}),Image:class{set src(v){this.onerror()}}}),/JPG/);
});
