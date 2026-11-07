const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/../world/behavior_packs/Koledari/scripts/main.js','utf8');
const code=source.slice(source.indexOf('function furnishLoadedHouse('),source.indexOf('function homePortal('));
class LocationInUnloadedChunkError extends Error {constructor(){super('chunk not ticking');this.name='LocationInUnloadedChunkError'}}
let tick=0,queue=[],furnished=0,readyAt=-1,spawned=[],cameras=[],titleAt=-1,phase='intro';
const context={houseFurnishRequest:0,actors:'battle',procession:[],at:(x,y,z)=>({x,y,z}),LocationInUnloadedChunkError,
 state:()=>({stage:0,phase}),persist:(p,s)=>phase=s.phase,furnishBedroom:()=>{furnished++;assert(tick>=50);readyAt=tick},
 system:{run:fn=>queue.push({fn,t:tick+1}),runTimeout:(fn,delay)=>queue.push({fn,t:tick+delay})},
 world:{setTimeOfDay(){}},WeatherType:{Rain:'rain'},EasingType:{InOutSine:'sine'},
 EquipmentSlot:{Head:'h',Chest:'c',Legs:'l',Feet:'f',Offhand:'o'}};
const player={isValid:true,dimension:{
 getEntities:()=>[],getBlock:pos=>{if(tick<25)return undefined;return{isAir:false,setType(){}}},
 spawnEntity:(id,pos)=>{if(tick<50)throw new LocationInUnloadedChunkError();spawned.push(id);return{remove(){},addTag(){}}},setWeather(){}},
 camera:{fade(){},setCamera:()=>cameras.push(tick),clear(){}},teleport(){},setSpawnPoint(){},
 getComponent:name=>name==='minecraft:inventory'?{container:{clearAll(){}}}:{setEquipment(){}},
 onScreenDisplay:{setTitle:()=>titleAt=tick}};
vm.createContext(context);vm.runInContext(code,context);
function drain(){let iterations=0;while(queue.length){assert(++iterations<100);queue.sort((a,b)=>a.t-b.t);const job=queue.shift();tick=job.t;job.fn()}}
context.awakeChristmas(player);drain();assert.equal(furnished,1);assert(readyAt>=50);assert(cameras.every(t=>t>=readyAt));assert.equal(titleAt,readyAt+98);assert.equal(spawned.filter(id=>id==='koledari:warm_drink').length,1);
// A newer request cancels an older pending one, avoiding duplicate rebuilds.
queue=[];tick=0;furnished=0;context.furnishLoadedHouse(player);context.furnishLoadedHouse(player);drain();assert.equal(furnished,1);
// Unexpected failures remain visible to development checks rather than being swallowed.
queue=[];tick=60;context.furnishBedroom=()=>{throw new Error('unexpected')};context.furnishLoadedHouse(player);assert.throws(drain,/unexpected/);
assert(!source.includes("e.addTag(actors);e.addTag('home_decor')"));
console.log('PASS: unreadable chunks, loaded-but-not-ticking chunks, retry, deferred finale, duplicate cancellation, furniture cleanup isolation.');
