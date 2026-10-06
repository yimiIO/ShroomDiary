'use strict';
const crypto = require('node:crypto');
const VERSION = 'nutrition-2026-10-04-v1';
const KEYS = ['kcal','protein','carbs','fat','fiber','totalSugar','freeSugar'];
const SOURCES = [
 { title: 'WHO 健康膳食：食物多样性、纤维与游离糖', url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet' },
 { title: 'EFSA 成人蛋白质参考摄入量', url: 'https://www.efsa.europa.eu/en/press/news/120209' },
 { title: 'Mifflin–St Jeor 静息能量估算研究', url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/' },
 { title: 'ISSN 运动人群蛋白质共识', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/' },
 { title: 'NIDDK 个体能量需求与适用人群', url: 'https://www.niddk.nih.gov/bwp' }
];
function validProfile(input) {
 const p = {};
 for (const [key, min, max] of [['age',1,110],['height',80,230],['weight',20,300]]) {
  const n = Number(input[key]); if (!Number.isFinite(n) || n < min || n > max) throw new Error('请检查年龄、身高和体重'); p[key] = Math.round(n*10)/10;
 }
 for (const [key, allowed] of Object.entries({ sex:['female','male','unspecified'], activity:['low','moderate','high'], goal:['maintain','lose','muscle'], care:['none','pregnant','kidney','diabetes','eating','clinical','unsure'] })) {
  if (!allowed.includes(input[key])) throw new Error('请补齐活动量、目标和健康情况'); p[key]=input[key];
 }
 p.preferences = String(input.preferences || '').trim().slice(0,300);
 return p;
}
function targets(p) {
 if (!p) return { status:'missing', message:'先补齐身体资料，才能给出适合你的每日参考。' };
 const bmi = p.weight / ((p.height/100)**2);
 if (p.age < 18 || p.age >= 65 || p.care !== 'none' || bmi < 18.5 || bmi >= 30) return { status:'clinical', message:'你需要单独制定饮食目标。先保留食物记录，请医生或注册营养师结合身体情况确认；这里不自动给出限食、补充量或治疗方案。' };
 if (p.sex === 'unspecified') return { status:'missing', message:'能量公式需要生理性别；不愿提供也可以继续记录食物。' };
 const resting = 10*p.weight+6.25*p.height-5*p.age+(p.sex==='male'?5:-161);
 const maintenance = resting * {low:1.4,moderate:1.6,high:1.8}[p.activity];
 // Conservative product starting range, not a prescription or the NIDDK dynamic model.
 const adjustment = p.goal==='lose' && bmi>=24 ? .9 : 1;
 const center = Math.max(resting,maintenance*adjustment);
 const exercising = p.goal==='muscle' && p.activity!=='low';
 return { status:'ready', version:VERSION,
  kcal:{low:Math.round(center*.9/50)*50,high:Math.round(center*1.1/50)*50},
  protein:{low:Math.round(p.weight*(exercising?1.4:.83)),high:Math.round(p.weight*(exercising?2:1.2))},
  fiber:25, freeSugarLimit:Math.floor(center*.1/4), freeSugarPreferred:Math.floor(center*.05/4),
  message:p.goal==='lose' && bmi<24 ? '当前体重不自动设置减重缺口，先关注均衡与维持。' : '这是每日起始参考范围；结合数周体重趋势、饥饿感、运动与专业建议调整。',
  method:'Mifflin–St Jeor × 自报活动系数；能量范围 ±10%，并非实测消耗。普通成人蛋白质低值参考 EFSA，高值为产品展示范围；规律增肌训练参考 ISSN。'
 };
}
function fingerprint(meal) { return crypto.createHash('sha256').update(JSON.stringify([meal.name,meal.description,meal.media_ids || []])).digest('hex'); }
function range(v, max) {
 if (v === null || v === undefined) return null;
 if (typeof v !== 'object' || typeof v.low !== 'number' || typeof v.high !== 'number' || !Number.isFinite(v.low) || !Number.isFinite(v.high) || v.low<0 || v.high<v.low || v.high>max) throw new Error('营养估算格式不正确');
 return {low:Math.round(v.low*10)/10,high:Math.round(v.high*10)/10};
}
function normalizeEstimate(raw) {
 if (!raw || typeof raw.isFood !== 'boolean') throw new Error('无法确认照片中的食物');
 if (!raw.isFood) return { version:VERSION,isFood:false, foods:[],nutrients:null,uncertainty:'这张照片无法可靠识别餐食，请换一张清晰食物照片或补充说明。' };
 const foods = (Array.isArray(raw.foods)?raw.foods:[]).slice(0,15).map(x=>({name:String(x.name||'').slice(0,80),portion:String(x.portion||'').slice(0,80)})).filter(x=>x.name);
 if (!foods.length) throw new Error('未识别到可用食物');
 const nutrients={}; for(const key of KEYS) nutrients[key]=range(raw.nutrients?.[key],key==='kcal'?6000:1000);
 if (!nutrients.kcal || !nutrients.protein) throw new Error('营养结果不完整');
 return { version:VERSION,isFood:true,foods,nutrients,
  uncertainty:String(raw.uncertainty||'份量、用油、酱汁和实际吃下多少可能改变估算。').slice(0,400),
  question:String(raw.question||'').slice(0,160), basis:'AI 根据照片及说明估算，未经称重或营养标签核验；不是实测值。' };
}
function summarize(meals, profile, complete) {
 const totals={}; const known={}; for(const key of KEYS){ totals[key]={low:0,high:0}; known[key]=0; }
 let analyzed=0;
 for(const meal of meals){ const result=meal.nutrition; if(!result?.isFood || !result.nutrients) continue; analyzed++;
  for(const key of KEYS){ const r=result.nutrients[key]; if(r){totals[key].low+=r.low;totals[key].high+=r.high;known[key]++;} }
 }
 for(const key of KEYS){ if(!known[key] || known[key]<analyzed) totals[key]=null; else {totals[key].low=Math.round(totals[key].low);totals[key].high=Math.round(totals[key].high);} }
 const target=targets(profile); const usable=Boolean(complete && meals.length && analyzed===meals.length);
 let advice='先拍下这一餐，慢慢留下自己的饮食记录。';
 if(meals.length) advice=usable?'今天的餐食已记录完整。明天继续规律吃饭，不需要补偿性挨饿。':'这里只统计已记录的餐食。补齐正餐、零食和饮料后，再判断全天摄入。';
 const remaining={};
 if(usable && target.status==='ready'){
  for(const key of ['kcal','protein']) if(known[key]===meals.length){ const t=target[key],n=totals[key]; remaining[key]={low:Math.max(0,Math.round(t.low-n.high)),high:Math.max(0,Math.round(t.high-n.low))}; }
  if(totals.protein && totals.protein.high<target.protein.low) advice='按已记录估算，蛋白质可能偏少。下一餐优先安排适合你的蛋白质食物，不必用补剂追数值。';
  else if(totals.fiber && known.fiber===meals.length && totals.fiber.high<target.fiber) advice='按已记录估算，纤维可能偏少。下一餐可增加蔬菜、全谷物或豆类，逐步调整。';
  else if(totals.kcal && totals.kcal.low>target.kcal.high) advice='今天的估算摄入高于起始参考。明天照常规律进餐，结合一周趋势调整，别跳餐补偿。';
 }
 if(profile && target.status==='clinical') advice=target.message;
 return {totals,known,analyzed,mealCount:meals.length,complete:Boolean(complete),usable,target,remaining,advice};
}
function weekSummary(days){
 const complete=days.filter(day=>day.usable);const averages={};
 for(const key of KEYS){const rows=complete.filter(day=>day.totals[key]);averages[key]=rows.length===complete.length&&rows.length?{low:Math.round(rows.reduce((n,d)=>n+d.totals[key].low,0)/rows.length),high:Math.round(rows.reduce((n,d)=>n+d.totals[key].high,0)/rows.length)}:null;}
 return {days:complete.length,averages,message:complete.length>=3?'平均值仅来自已记全的日期，不代表未记录日；观察规律，别用少吃或多吃补偿某一天。':'先留下至少三天完整记录，再讨论饮食趋势。未记录日不算零。'};
}
module.exports={VERSION,KEYS,SOURCES,validProfile,targets,fingerprint,normalizeEstimate,summarize,weekSummary};
