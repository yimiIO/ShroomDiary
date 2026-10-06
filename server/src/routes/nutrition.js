'use strict';
const express=require('express');
const crypto=require('node:crypto');
const db=require('../db');
const config=require('../config');
const {ok,fail,asyncRoute}=require('../http');
const {createMediaSignature}=require('../security');
const {SOURCES,validProfile,fingerprint,summarize,weekSummary}=require('../nutrition-policy');
const {estimateMeal,processor,model}=require('../nutrition-vision');
const router=express.Router();
// Parent /snapshot is authenticated; existing broad API tokens do not gain health-profile access.
router.use((req,res,next)=>{req.body=req.body||{};return req.authKind==='session'?next():fail(res,403,'请在本人登录会话中管理饮食资料');});
function dayOf(value){const day=String(value||new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}));if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;const d=new Date(`${day}T00:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===day?day:null;}
function mapMeal(row){
 const meal=row.meal; const valid=row.input_hash===fingerprint(meal);
 const fraction=Number(row.confirmed_fraction);const confirmed=valid && row.status==='done' && fraction>0;
 const nutrition=confirmed&&row.result?.nutrients?{...row.result,nutrients:Object.fromEntries(Object.entries(row.result.nutrients).map(([k,v])=>[k,v?{low:v.low*fraction,high:v.high*fraction}:null]))}:null;
 const expires=Math.floor(Date.now()/1000)+3600;
 return {...meal,day:row.day,media:(meal.media_ids||[]).map(id=>({id,url:`${config.publicOrigin}/api/media/v1/${id}?expires=${expires}&signature=${createMediaSignature(id,expires)}`})),
  nutrition,estimate:valid?row.result:null,confirmedFraction:confirmed?fraction:null,generation:row.generation,nutritionStatus:valid?(row.status==='running'&&Date.now()-new Date(row.nutrition_updated_at).getTime()>180000?'failed':row.status):'none',nutritionError:valid?row.error:'',nutritionUpdatedAt:row.nutrition_updated_at};
}
router.get('/',asyncRoute(async(req,res)=>{
 const day=dayOf(req.query.date);if(!day)return fail(res,400,'日期格式不正确');
 const [profiles,rows,checks,consents]=await Promise.all([
  db.query('SELECT profile,updated_at FROM nutrition_profiles WHERE user_id=$1',[req.user.id]),
  db.query(`SELECT row_to_json(m) AS meal,s.day::text AS day,n.input_hash,n.status,n.result,n.error,n.confirmed_fraction,n.generation,n.updated_at AS nutrition_updated_at FROM snapshot_meals m JOIN snapshots s ON s.id=m.snapshot_id LEFT JOIN meal_nutrition n ON n.meal_id=m.id AND n.user_id=s.user_id WHERE s.user_id=$1 AND s.day BETWEEN $2::date-6 AND $2::date ORDER BY s.day DESC,m.created_at`,[req.user.id,day]),
  db.query('SELECT day::text,complete FROM nutrition_day_checks WHERE user_id=$1 AND day BETWEEN $2::date-6 AND $2::date',[req.user.id,day]),
  db.query('SELECT enabled FROM nutrition_consents WHERE user_id=$1',[req.user.id])]);
 const profile=profiles.rows[0]?.profile||null; const meals=rows.rows.map(mapMeal);
 const days=[]; for(let i=6;i>=0;i--){const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-i);const key=d.toISOString().slice(0,10);const complete=checks.rows.find(x=>x.day===key)?.complete||false;days.push({date:key,...summarize(meals.filter(x=>x.day===key),profile,complete)});}
 return ok(res,{date:day,profile,profileUpdatedAt:profiles.rows[0]?.updated_at||null,visionConsent:consents.rows[0]?.enabled===true,visionConsentKnown:Boolean(consents.rowCount),meals:meals.filter(x=>x.day===day),summary:days[6],days,week:weekSummary(days),sources:SOURCES,processor:processor(),analysisEnabled:Boolean(config.aiApiBaseUrl&&config.aiApiKey&&model())});
}));
router.put('/consent',asyncRoute(async(req,res)=>{await db.query('INSERT INTO nutrition_consents(user_id,enabled) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled,vision_consent_at=now()',[req.user.id,req.body.enabled===true]);return ok(res);}));
router.put('/meals/:id/portion',asyncRoute(async(req,res)=>{
 const fraction=Number(req.body.fraction);if(![.25,.5,.75,1].includes(fraction)||!/^[0-9a-f-]{36}$/i.test(req.body.generation||''))return fail(res,400,'请选择本次识别对应的实际份量');
 const saved=await db.transaction(async client=>{
  const result=await client.query('SELECT m.* FROM snapshot_meals m JOIN snapshots s ON s.id=m.snapshot_id WHERE m.id=$1 AND s.user_id=$2 FOR UPDATE OF m',[req.params.id,req.user.id]);if(!result.rowCount)return null;
  return client.query(`UPDATE meal_nutrition SET confirmed_fraction=$3 WHERE meal_id=$1 AND user_id=$2 AND status='done' AND input_hash=$4 AND generation=$5 RETURNING meal_id`,[req.params.id,req.user.id,fraction,fingerprint(result.rows[0]),req.body.generation]);
 });if(!saved?.rowCount)return fail(res,409,'记录已更新，请刷新后确认份量');return ok(res);
}));
router.put('/profile',asyncRoute(async(req,res)=>{
 if(req.body.consent!==true)return fail(res,400,'请确认保存身体资料，仅用于你的饮食参考');
 let profile;try{profile=validProfile(req.body);}catch(error){return fail(res,400,error.message);}
 await db.query(`INSERT INTO nutrition_profiles(user_id,profile) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET profile=EXCLUDED.profile,consent_at=now(),updated_at=now()`,[req.user.id,JSON.stringify(profile)]);
 return ok(res,{profile});
}));
router.delete('/profile',asyncRoute(async(req,res)=>{await db.query('DELETE FROM nutrition_profiles WHERE user_id=$1',[req.user.id]);return ok(res);}));
router.put('/day',asyncRoute(async(req,res)=>{
 const day=dayOf(req.body.date);if(!day)return fail(res,400,'日期格式不正确');
 await db.query('INSERT INTO nutrition_day_checks(user_id,day,complete) VALUES($1,$2,$3) ON CONFLICT(user_id,day) DO UPDATE SET complete=EXCLUDED.complete,updated_at=now()',[req.user.id,day,req.body.complete===true]);return ok(res);
}));
router.post('/meals/:id/analyze',asyncRoute(async(req,res)=>{
 if(!/^[0-9a-f-]{36}$/i.test(req.params.id))return fail(res,400,'记录编号不正确');
 if(req.body.consent!==true)return fail(res,400,'确认后会将这餐照片和说明交给 AI 服务识别，不发送身体资料');
 if(!(await db.query('SELECT user_id FROM nutrition_consents WHERE user_id=$1 AND enabled=true',[req.user.id])).rowCount)return fail(res,403,'请先开启照片识别授权');
 const claim=await db.transaction(async client=>{
  await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.user.id]);
  const result=await client.query(`SELECT m.* FROM snapshot_meals m JOIN snapshots s ON s.id=m.snapshot_id WHERE m.id=$1 AND s.user_id=$2 FOR UPDATE OF m`,[req.params.id,req.user.id]);
  const meal=result.rows[0];if(!meal)return {missing:true};
  const old=(await client.query('SELECT * FROM meal_nutrition WHERE meal_id=$1 AND user_id=$2',[meal.id,req.user.id])).rows[0];
  const hash=fingerprint(meal);
  if(old?.input_hash===hash){if(old.status==='running'&&Date.now()-new Date(old.updated_at).getTime()<180000)return {existing:true};if(old.result&&req.body.regenerate!==true)return {existing:true};}
  const active=await client.query("SELECT count(*)::int AS count FROM meal_nutrition WHERE user_id=$1 AND status='running' AND updated_at>now()-interval '3 minutes'",[req.user.id]);if(active.rows[0].count>=2)return {busy:true};
  if(!meal.media_ids?.length&&(!meal.name||meal.name==='照片记录'))return {empty:true};
  const media=await client.query('SELECT id FROM media_assets WHERE user_id=$1 AND id=ANY($2::uuid[]) AND mime_type LIKE $3',[req.user.id,meal.media_ids||[],'image/%']);
  if(media.rowCount!==(meal.media_ids||[]).length)return {badMedia:true};
  const generation=crypto.randomUUID();
  await client.query(`INSERT INTO meal_nutrition(meal_id,user_id,input_hash,generation,model) VALUES($1,$2,$3,$4,$5) ON CONFLICT(meal_id) DO UPDATE SET input_hash=EXCLUDED.input_hash,generation=EXCLUDED.generation,model=EXCLUDED.model,status='running',error='',result=CASE WHEN meal_nutrition.input_hash=EXCLUDED.input_hash THEN meal_nutrition.result ELSE NULL END,updated_at=now()`,[meal.id,req.user.id,hash,generation,model()]);
  await client.query('UPDATE nutrition_day_checks c SET complete=false FROM snapshots s WHERE s.id=$1 AND c.user_id=s.user_id AND c.day=s.day',[meal.snapshot_id]);
  return {meal,generation};
 });
 if(claim.missing)return fail(res,404,'这餐记录不存在');if(claim.empty)return fail(res,400,'先添加食物照片或说明');if(claim.badMedia)return fail(res,403,'照片不可用于这餐分析');if(claim.busy)return fail(res,429,'已有两餐在识别，稍后再试');
 if(claim.meal){setImmediate(async()=>{try{const result=await estimateMeal(claim.meal,req.user.id);await db.query(`UPDATE meal_nutrition SET result=$3::jsonb,status='done',error='',confirmed_fraction=NULL,updated_at=now() WHERE meal_id=$1 AND generation=$2`,[claim.meal.id,claim.generation,JSON.stringify(result)]);}catch(error){await db.query(`UPDATE meal_nutrition SET status=CASE WHEN result IS NULL THEN 'failed' ELSE 'done' END,error=$3,updated_at=now() WHERE meal_id=$1 AND generation=$2`,[claim.meal.id,claim.generation,'本次识别未完成，照片和已有结果仍保留。请稍后重试。']).catch(()=>{});console.error('Meal nutrition analysis failed',{code:error.code||'NUTRITION_FAILED'});}});}
 return ok(res,{reused:Boolean(claim.existing),status:'accepted'});
}));
module.exports=router;
