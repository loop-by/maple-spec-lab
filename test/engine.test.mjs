import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_STATS,damage,compare,replaceLines,expectation,poissonBinomial,abilityProbability,fitScale} from '../dist/engine.mjs';
const near=(actual,expected,tol=1e-9)=>assert.ok(Math.abs(actual-expected)<=tol*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);
const base=()=>({...Object.fromEntries(Object.keys(DEFAULT_STATS).map(k=>[k,0])),attack:1200,critDamage:100,minDamage:100,maxDamage:100,mastery:1,other:1,coefficient:100,contentScale:1,target:'boss',attackType:'skill',content:'field'});
test('zero defense retains official 5000/6000 factor',()=>near(damage(base()).expected,1000));
test('damage, amplification, monster and attack type are separate multipliers',()=>{
  near(damage({...base(),damage:20,amplification:30,boss:40,skill:50,statDamage:60,finalDamage:70}).expected,1000*1.2*1.3*1.4*1.5*1.6*1.7);
});
test('normal/basic chooses the applicable factors only',()=>near(damage({...base(),target:'normal',attackType:'basic',normal:20,basic:30,boss:900,skill:900}).expected,1560));
test('critical expectation includes noncritical hits and caps chance',()=>{
  near(damage({...base(),critChance:50,critDamage:200}).expected,1500);
  near(damage({...base(),critChance:150,critResistance:20,critDamage:200}).expected,2000);
  near(damage({...base(),critChance:10,critResistance:20,critDamage:200}).expected,1000);
});
test('penetration reduces defense before the rational defense factor',()=>near(damage({...base(),enemyDefense:8000,penetration:25}).expected,500));
test('minimum over maximum collapses to maximum',()=>near(damage({...base(),minDamage:200,maxDamage:100}).expected,1000));
test('continuous random expectation is averaged after square root',()=>{
  const value=damage({...base(),minDamage:0,maxDamage:100,content:'sqrt'}).expected;
  near(value,Math.sqrt(1000)*2/3);
  assert.ok(value<Math.sqrt(500));
});
test('critical and status mixture are averaged after root transform',()=>{
  near(damage({...base(),content:'sqrt',critChance:50,critDamage:400,statusDamage:300,statusUptime:50}).expected,Math.sqrt(1000)*1.5*1.5);
});
test('skill coefficient is outside content power',()=>near(damage({...base(),content:'sqrt',coefficient:200}).expected,Math.sqrt(1000)*2));
test('cube-root content attenuates an independent 8x improvement to 2x',()=>near(compare({...base(),content:'cbrt'},[],[{type:'finalDamage',value:700}]).gain,100));
test('independent final damage source is removed by division',()=>near(replaceLines({...base(),finalDamage:32},[{type:'finalDamage',value:10}],[{type:'finalDamage',value:20}]).finalDamage,44));
test('penetration source is removed in the remaining proportion',()=>near(replaceLines({...base(),penetration:44},[{type:'penetration',value:20}],[{type:'penetration',value:30}]).penetration,51));
test('100% penetration source cannot be uniquely inverted',()=>assert.throws(()=>replaceLines({...base(),penetration:100},[{type:'penetration',value:100}],[]),/역산/));
test('snapshot replacement avoids adding current option twice',()=>{
  const s={...base(),damage:100};near(compare(s,[{type:'damage',value:5}],[{type:'damage',value:10}]).gain,2.5);
});
test('main-stat percent requires measured conversion; not silently ignored',()=>{
  assert.throws(()=>replaceLines(base(),[],[{type:'mainPercent',value:5}]),/실측/);
  const r=replaceLines(base(),[],[{type:'mainPercent',value:5}],{mainPercent:{attack:10,statDamage:2}});
  near(r.attack,1250);near(r.statDamage,10);
});
test('fixed 1% target has analytical geometric statistics',()=>{
  const e=expectation(.01,{cost:2,budget:100});near(e.attempts,100);near(e.cost,200);near(e.success,1-.99**100);assert.equal(e.median,69);assert.equal(e.p90,230);assert.equal(e.p95,299);
});
test('hard pity at third attempt uses truncated geometric distribution',()=>{
  const e=expectation(.25,{pity:3,budget:2});near(e.attempts,1+.75+.75**2);near(e.success,1-.75**2);assert.equal(e.p95,3);near(e.within(3),1);
});
test('zero and certain probabilities, zero budget and impossible outcomes',()=>{
  assert.equal(expectation(0).attempts,Infinity);assert.equal(expectation(0,{pity:7}).attempts,7);assert.equal(expectation(1,{budget:0}).success,0);assert.equal(expectation(1).attempts,1);assert.equal(expectation(0).p90,Infinity);
});
test('very small probabilities remain numerically stable',()=>{
  near(expectation(1e-14,{pity:100}).attempts,100,1e-10);near(expectation(1e-14,{budget:100}).success,1e-12,1e-14);
});
test('different independent line probabilities use Poisson-binomial',()=>{
  near(poissonBinomial([.1,.2,.3],2),.1*.2*.7+.1*.8*.3+.9*.2*.3+.1*.2*.3);
  near(poissonBinomial([.1,.2,.3],1),1-.9*.8*.7);
});
test('ability numerical endpoints are inclusive and threshold is rounded up',()=>{
  const a=abilityProbability({grade:.5,option:.1,min:1,max:10,step:1,threshold:8});near(a.p,.015);assert.equal(a.total,10);assert.equal(a.qualifying,3);
  near(abilityProbability({grade:1,option:1,min:1,max:10,step:1,threshold:8.1}).p,.2);
  assert.throws(()=>abilityProbability({grade:1,option:1,min:0,max:1,step:.3,threshold:.5}),/간격/);
});
test('least squares recovers a known hidden multiplier from measurements',()=>{
  const f=fitScale([{predicted:10,observed:30},{predicted:20,observed:60}]);near(f.scale,3);near(f.mape,0);
});
test('invalid numerical domains fail instead of producing plausible output',()=>{
  assert.throws(()=>damage({...base(),attack:-1}));assert.throws(()=>expectation(1.01));assert.throws(()=>expectation(.1,{budget:2.5}));assert.throws(()=>poissonBinomial([.1],2));assert.throws(()=>replaceLines(base(),[],[{type:'damage',value:NaN}]));
});
