const fs=require('fs'),vm=require('vm'),assert=require('assert');const source=fs.readFileSync(__dirname+'/../world/behavior_packs/Koledari/scripts/main.js','utf8');const code=source.slice(source.indexOf('function giftRain('),source.indexOf('function furnishLivingRoom('));
function simulate(x,z,arch=false){let hits=0,total=0,maxAir=0,minX=999,maxX=0,minZ=999,maxZ=0,maxSpawnY=0;
const rng=Object.create(Math);rng.random=()=>.5;
const c={Math:rng,GIFT_PHASE_TICKS:1200,GIFT_BLAST_RADIUS:3.5,age:0,lastGiftHit:-100,fallingGifts:[],actors:'a',at:(x,y,z)=>({x,y,z}),EntityDamageCause:{entityExplosion:'explosion'}};
const p={location:{x,y:31.0625,z},dimension:{getBlock:q=>({isAir:!arch||q.y!==38}),spawnEntity:(id,q)=>{total++;maxSpawnY=Math.max(maxSpawnY,q.y);return{isValid:true,addTag(){},teleport(){},remove(){this.isValid=false}}},spawnParticle(){}},playSound(){},applyDamage(){hits++}};
vm.createContext(c);vm.runInContext(code,c);
for(let t=5;t<=1200;t+=5){c.age=t;c.giftRain(p);maxAir=Math.max(maxAir,c.fallingGifts.length);for(const drop of c.fallingGifts){minX=Math.min(minX,drop.target.x);maxX=Math.max(maxX,drop.target.x);minZ=Math.min(minZ,drop.target.z);maxZ=Math.max(maxZ,drop.target.z)}}
assert.equal(total,912);assert(maxAir<=48);assert.equal(c.fallingGifts.length,0);assert(hits>20,'stationary corner remained safe');assert(minX<=482.5&&maxX>=526.5&&minZ<=2.5&&maxZ>=46.5);if(arch)assert(maxSpawnY<38);return hits}
for(const [x,z] of [[481.5,1.5],[527,1.5],[481.5,47],[527,47]])simulate(x,z);simulate(482.5,2.5,true);
console.log('PASS: every corner covered for 60 seconds; 912 drops; full arena bounds; low arches cannot be used as shelter; 48-airborne cap.');
