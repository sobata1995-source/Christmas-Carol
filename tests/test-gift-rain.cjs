const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../world/behavior_packs/Koledari/scripts/main.js','utf8');const fn=source.slice(source.indexOf('function giftRain('),source.indexOf('function furnishLivingRoom('));
let created=0,hits=0;const c={GIFT_PHASE_TICKS:1200,GIFT_BLAST_RADIUS:3.5,age:0,lastGiftHit:-100,fallingGifts:[],actors:'actors',at:(x,y,z)=>({x,y,z}),EntityDamageCause:{entityExplosion:'explosion'}};
const make=()=>({isValid:true,addTag(){},teleport(){},remove(){this.isValid=false}});
const p={location:{x:0,y:32,z:0},dimension:{getBlock:()=>({isAir:true}),spawnEntity:()=>{created++;return make()},spawnParticle(){}},playSound(){},applyDamage(){hits++}};
vm.createContext(c);vm.runInContext(fn,c);let maximum=0;
for(let tick=5;tick<=1200;tick+=5){c.age=tick;c.giftRain(p);maximum=Math.max(maximum,c.fallingGifts.length)}
assert.equal(created,912);assert(maximum<=48);assert.equal(c.fallingGifts.length,0);
function impact(distance){c.age=50;c.lastGiftHit=-100;c.fallingGifts=[{entity:make(),start:0,target:{x:distance,y:31,z:0}}];hits=0;c.giftRain(p);return hits}
assert.equal(impact(3.4),1);assert.equal(impact(3.6),0);
c.age=50;c.lastGiftHit=-100;c.fallingGifts=Array.from({length:8},()=>({entity:make(),start:0,target:{x:0,y:31,z:0}}));hits=0;c.giftRain(p);assert.equal(hits,1);
assert(source.includes("if (age>=GIFT_PHASE_TICKS) {"));assert(/age=0;\s+lastGiftHit=-100;/.test(source));
console.log('PASS: 60-second phase; 912 possible drops; at most 48 airborne; all landed before return; 3.5-block blast radius; stacked hits limited; respawn cooldown reset.');
