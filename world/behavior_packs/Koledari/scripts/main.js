import { world, system, GameMode, ItemStack, EquipmentSlot, EntityDamageCause } from '@minecraft/server';

import { LocationInUnloadedChunkError, HudElement, HudVisibility, WeatherType, EasingType } from '@minecraft/server';
import { mazeNavigation } from './navigation.js';

const names = ['The Pursuer', 'The Cold Voice', 'The Heavy One', 'The Choir Keeper', 'The Last Caroler'];
const at = (x,y,z) => ({x,y,z});
const gift = at(504,32,31);
const saveKey = 'koledari:progress';
const victoriesKey = 'koledari:cleared_minibosses';
const actors = 'koledari_actor';
const ids = ['caroler_1','caroler_2','caroler_3','caroler_4','caroler_5','demonic_santa'];
const waveHealth = [110,100,160,125,120];
const wavePositions = [at(492.5,31.0625,12.5),at(516.5,31.0625,12.5),at(492.5,31.0625,32.5),
    at(516.5,31.0625,32.5),at(504.5,31.0625,36.5)];
let playerId, song, age = 0, mark, initialized = false;
let processionTick = 0;
let procession = [];
let secondBossHiddenTicks = 0;
let nextMistTick = 0;
let santaSwing, nextSantaSwing = 0;
let fallingGifts=[];
const GIFT_PHASE_TICKS=1200;
const GIFT_BLAST_RADIUS=3.5;
let lastGiftHit=-100;
let houseFurnishRequest=0;

function streetMist(dimension) {
    if (system.currentTick < nextMistTick) return;
    // Loading can lag behind playerSpawn; an unload can also occur between
    // checking the block and spawning. Retry without interrupting house logic.
    nextMistTick = system.currentTick + 20;
    const location = at(0,91,-25);
    try {
        if (!dimension.getBlock(location)) return;
        dimension.spawnParticle('koledari:street_mist',location);
        nextMistTick = system.currentTick + 160;
    } catch (error) {
        if (!(error instanceof LocationInUnloadedChunkError)) throw error;
    }
}

function processionPosition(index, tick) {
    const angle = tick * .36 / (20 * 5.5) + index * Math.PI * 2 / 5;
    return {location:at(5.5 * Math.cos(angle),90,-22 + 5.5 * Math.sin(angle)),
        rotation:{x:0,y:angle * 180 / Math.PI % 360}};
}

function state(p) {
    return JSON.parse(p.getDynamicProperty(saveKey) ?? '{"stage":0,"phase":"intro"}');
}

function checkpoint(stage) {
    if (stage === 0) return at(0.5,90,4.5);
    if (stage <= 5) return at((stage-1)*96+4.5,33,4.5);
    return at(504.5,32,40.5);
}

function music(p, track) {
    if (song === track) return;
    if (track) p.playMusic('koledari.'+track,{loop:true,fade:0.35,volume:1});
    else p.playMusic('koledari.silence',{loop:true,fade:0.2,volume:1});
    song = track;
}

function maintainWeapons(p) {
    const bag=p.getComponent('minecraft:inventory')?.container;
    if (bag) for (let slot=0;slot<bag.size;slot++) {
        const item=bag.getItem(slot);
        if (!item || !(item.typeId.endsWith('_sword') || item.typeId==='minecraft:shield')) continue;
        const durability=item.getComponent('minecraft:durability');
        if (durability?.damage>0) {
            durability.damage=0;
            bag.setItem(slot,item);
        }
    }
    const equipment=p.getComponent('minecraft:equippable');
    const shield=equipment?.getEquipment(EquipmentSlot.Offhand);
    if (shield?.typeId==='minecraft:shield') {
        const durability=shield.getComponent('minecraft:durability');
        if (durability?.damage>0) {
            durability.damage=0;
            equipment.setEquipment(EquipmentSlot.Offhand,shield);
        }
    }
}

function expectedSong(s) {
    if (s.phase==='awake' || s.phase==='win') return null;
    if (s.stage === 0) return 'choir';
    if (s.stage <= 5 && s.phase === 'hunt') return 'caroler'+s.stage;
    if (s.phase === 'wave') return 'returned_choir';
    if (['santa','santa_mid','santa_final','barrage','rage'].includes(s.phase)) return 'santa';
    return null;
}

function persist(p,s) {
    p.setDynamicProperty(saveKey,JSON.stringify(s));
    music(p,expectedSong(s));
}

function go(p,s) {
    age=0;
    lastGiftHit=-100;
    santaSwing=undefined;
    nextSantaSwing=0;
    for (const drop of fallingGifts) if (drop.entity.isValid) drop.entity.remove();
    fallingGifts=[];
    secondBossHiddenTicks=0;
    mark=undefined;
    const location=s.phase==='awake'?at(-6.5,90.5625,-6.5):checkpoint(s.stage);
    p.setSpawnPoint({...location,dimension:p.dimension});
    p.teleport(location,{rotation:{x:0,y:s.stage===1?-90:s.stage===0 || s.stage>=6?180:0}});
    const hp=p.getComponent('minecraft:health');
    hp.setCurrentValue(hp.effectiveMax);
    p.addEffect('saturation',40,{amplifier:2,showParticles:false});
    persist(p,s);
    if (s.stage>=1 && s.stage<=6) grantDungeonEquipment(p);
    if (s.stage>=1 && s.stage<=5) p.sendMessage('§6Stage '+s.stage+'/5. Find the green marker at the end of the maze.');
    if (s.stage===6) p.sendMessage('§6Break the red present beneath the tree with your axe.');
}

function spawn(p,index,position,role) {
    const entity=p.dimension.spawnEntity('koledari:'+ids[index]+(role==='outside'?'_outside':''),
        position);
    entity.addTag(actors);
    entity.addTag(role);
    if (role==='outside') entity.setRotation({x:0,y:0});
    return entity;
}

function entities(p,tag) {
    return p.dimension.getEntities({tags:[actors,tag]});
}

function inBox(loc,x1,y1,z1,x2,y2,z2) {
    return loc.x>=x1 && loc.x<x2 && loc.y>=y1 && loc.y<y2 && loc.z>=z1 && loc.z<z2;
}

function canSeePlayer(p,location) {
    const origin=at(location.x,location.y+1.6,location.z);
    const target=p.getHeadLocation();
    const distance=Math.hypot(target.x-origin.x,target.y-origin.y,target.z-origin.z);
    if (distance<=.25) return true;
    const direction=at((target.x-origin.x)/distance,(target.y-origin.y)/distance,(target.z-origin.z)/distance);
    return !p.dimension.getBlockFromRay(origin,direction,
        {maxDistance:distance-.25,includePassableBlocks:false,includeLiquidBlocks:false});
}

function ambushPosition(p,stage) {
    const offset=(stage-1)*96;
    const route=mazeNavigation[stage-1];
    if (!route) return;
    let x=Math.floor(p.location.x)-offset,z=Math.floor(p.location.z);
    // A hanging lamp can leave the player's cell too low for a tall boss.
    // Start from an adjacent route cell in that case, without using the camera.
    if (!route[x+','+z]) {
        const adjacent=[[1,0],[-1,0],[0,1],[0,-1]]
            .map(([dx,dz])=>({x:x+dx,z:z+dz,step:route[(x+dx)+','+(z+dz)]}))
            .filter(cell=>cell.step).sort((a,b)=>a.step[2]-b.step[2]);
        if (!adjacent.length) return;
        ({x,z}=adjacent[0]);
    }
    for (let steps=0;steps<=14;steps++) {
        const next=route[x+','+z];
        if (steps>=10 && Math.hypot(offset+x+.5-p.location.x,z+.5-p.location.z)>=4) {
            // Ten to fourteen actual corridor steps toward the exit, including
            // bends. Check the destination at runtime before placing the boss.
            const position=at(offset+x+.5,33,z+.5);
            try {
                if ([33,34,35].every(y=>p.dimension.getBlock(at(offset+x,y,z))?.isAir)) return position;
            } catch (error) {
                if (!(error instanceof LocationInUnloadedChunkError)) throw error;
            }
        }
        if (!next || next[2]===0) break;
        [x,z]=next;
    }
}

function recoverSecondBoss(p,boss) {
    secondBossHiddenTicks=canSeePlayer(p,boss.location) ? 0 : secondBossHiddenTicks+20;
    if (secondBossHiddenTicks>=160) {
        const position=ambushPosition(p,2);
        if (position) boss.teleport(position,{facingLocation:p.getHeadLocation()});
        secondBossHiddenTicks=0;
    }
}

function grantDungeonEquipment(p) {
    if (p.getDynamicProperty('koledari:dungeon_equipped')) return;
    const bag=p.getComponent('minecraft:inventory').container;
    const items=[['iron_sword',1],['bow',1],['arrow',64],['cooked_beef',32],['diamond_axe',1]];
    for (const [type,count] of items) {
        const item=new ItemStack('minecraft:'+type,count);
        if (type==='diamond_axe') {
            item.nameTag='The Gift Key';
            item.setCanDestroy(['minecraft:red_wool']);
        }
        bag.addItem(item);
    }
    const armor=p.getComponent('minecraft:equippable');
    for (const [slot,type] of [[EquipmentSlot.Chest,'iron_chestplate'],
        [EquipmentSlot.Legs,'iron_leggings'],[EquipmentSlot.Feet,'iron_boots'],
        [EquipmentSlot.Offhand,'shield']]) {
        armor.setEquipment(slot,new ItemStack('minecraft:'+type));
    }
    p.setDynamicProperty('koledari:dungeon_equipped',true);
    p.sendMessage('§6You found your equipment.');
}

function begin(p) {
    if (!p.getDynamicProperty(saveKey)) {
        p.getComponent('minecraft:inventory')?.container?.clearAll();
        const equipment=p.getComponent('minecraft:equippable');
        for (const slot of [EquipmentSlot.Head,EquipmentSlot.Chest,EquipmentSlot.Legs,
            EquipmentSlot.Feet,EquipmentSlot.Offhand]) equipment?.setEquipment(slot);
        go(p,state(p));
        p.sendMessage('§6The carolers are outside. Find the basement.');
    }
    p.setGameMode(GameMode.Adventure);
}

world.afterEvents.playerSpawn.subscribe(({player,initialSpawn})=>{
    if (playerId && player.id!==playerId) return;
    playerId=player.id;
    nextMistTick=0;
    player.stopMusic();
    song=undefined;
    mark=undefined;
    age=0;
    secondBossHiddenTicks=0;
    if (!initialSpawn && player.getDynamicProperty(saveKey)) {
        const s=state(player);
        go(player,s);
    }
    begin(player);
    system.runTimeout(()=>{
        if(state(player).stage===0) furnishLoadedHouse(player,()=>{
            if(state(player).phase==='awake') ensureWarmDrink(player);
        });
    },40);
    player.onScreenDisplay.setHudVisibility(HudVisibility.Hide,[HudElement.PaperDoll,HudElement.ToolTips]);
    maintainWeapons(player);
    initialized=true;
    music(player,expectedSong(state(player)));
});


world.beforeEvents.playerInteractWithBlock.subscribe(event=>{
    if (event.block.typeId==='minecraft:bed') event.cancel=true;
    const {x,y,z}=event.block.location;
    if (x===0 && z===-10 && (y===90 || y===91) && state(event.player).phase!=='awake') event.cancel=true;
});

world.beforeEvents.playerBreakBlock.subscribe(event=>{
    const {x,y,z}=event.block.location;
    const atGift=x===gift.x && y===gift.y && z===gift.z;
    if (event.player.getGameMode()===GameMode.Adventure &&
        (!atGift || state(event.player).phase!=='gift')) event.cancel=true;
});

function ensureFourthCompanions(p,boss,s) {
    if ((s.minionSpawnMask ?? 0)===3) return;
    const base=boss.location;
    const y=Math.floor(base.y),origin=[Math.floor(base.x),Math.floor(base.z)];
    const candidates=[],queue=[origin],seen=new Set([origin.join(',')]);
    // Walk connected corridor cells, not just four potentially blocked neighbors.
    for(let index=0;index<queue.length && index<256;index++) {
        const [x,z]=queue[index];
        try {
            if (![y,y+1].every(h=>p.dimension.getBlock(at(x,h,z))?.isAir)) continue;
            const floor=p.dimension.getBlock(at(x,y-1,z));
            if (!floor || floor.isAir) continue;
            if (x!==origin[0] || z!==origin[1]) candidates.push(at(x+.5,y,z+.5));
            for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                const next=[x+dx,z+dz],key=next.join(',');
                if (!seen.has(key) && Math.abs(next[0]-origin[0])+Math.abs(next[1]-origin[1])<=12) {
                    seen.add(key);queue.push(next);
                }
            }
        } catch(error) {
            if (!(error instanceof LocationInUnloadedChunkError) && error.name!=='LocationInUnloadedChunkError') throw error;
        }
    }
    for(let slot=0;slot<2;slot++) {
        const bit=1<<slot;
        if ((s.minionSpawnMask ?? 0)&bit) continue;
        const tag='fourth_support_'+slot;
        const existing=p.dimension.getEntities({tags:[tag]})[0];
        if (existing) {s.minionSpawnMask=(s.minionSpawnMask ?? 0)|bit;persist(p,s);continue;}
        // The boss's own clear cell is a safe fallback even in a dead end.
        const position=candidates[slot] ?? candidates[0] ?? at(base.x+(slot===0?-.18:.18),base.y,base.z);
        try {
            const toy=p.dimension.spawnEntity('koledari:toy',position);
            toy.addTag(actors);toy.addTag('toy');toy.addTag(tag);
            // Commit each successful slot separately: failed second spawn retries
            // later, but dead helpers are never replaced during this encounter.
            s.minionSpawnMask=(s.minionSpawnMask ?? 0)|bit;
            s.minionsSummoned=s.minionSpawnMask===3;
            persist(p,s);
        } catch(error) {
            if (!(error instanceof LocationInUnloadedChunkError) && error.name!=='LocationInUnloadedChunkError') throw error;
        }
    }
}

function hunt(p,s) {
    const offset=(s.stage-1)*96;
    const defeated=(Number(p.getDynamicProperty(victoriesKey) ?? 0) & (1 << (s.stage-1)))!==0;
    if (defeated && s.phase!=='clear') {
        s.phase='clear';
        delete s.bossId;
        persist(p,s);
    }
    if (s.phase==='quiet' && age>=280) {
        s.phase='hunt';
        persist(p,s);
        p.onScreenDisplay.setTitle('§4MINIBOSS '+s.stage+'/5',{subtitle:'§6'+names[s.stage-1],fadeInDuration:5,stayDuration:45,fadeOutDuration:15});
    }
    if (s.phase==='hunt') {
        const candidates=entities(p,'hunt');
        const boss=candidates.find(actor=>actor.id===s.bossId) ?? candidates[0];
        if (boss && boss.getComponent('minecraft:health')?.currentValue<=0) {
            finishHunt(p,s);
            return;
        }
        if (boss && !s.bossId) {
            s.bossId=boss.id;
            persist(p,s);
        }
        if (boss && p.getDynamicProperty('koledari:route_spawn_revision')!==1) {
            const position=ambushPosition(p,s.stage);
            if (position) {
                boss.teleport(position,{facingLocation:p.getHeadLocation()});
                p.setDynamicProperty('koledari:route_spawn_revision',1);
            }
        }
        // A missing entity may be dying or unloaded. Once created, this stage
        // must never create a replacement just because a query cannot find it.
        if (!boss && !s.bossId) {
            const position=ambushPosition(p,s.stage);
            if (position) {
                const actor=spawn(p,s.stage-1,position,'hunt');
                s.bossId=actor.id;
                persist(p,s);
                p.setDynamicProperty('koledari:route_spawn_revision',1);
                actor.teleport(position,{facingLocation:p.getHeadLocation()});
                if (s.stage===4) ensureFourthCompanions(p,actor,s);
            }
            secondBossHiddenTicks=0;
        }
        else if (boss && s.stage===2 && age%20===0) recoverSecondBoss(p,boss);
        else if (boss && s.stage===4) ensureFourthCompanions(p,boss,s);
    }
    if (s.phase==='clear' && inBox(p.location,offset+51,31,51,offset+61,39,61)) {
        go(p,{stage:s.stage+1,phase:s.stage===5?'gift':'quiet'});
    }
}

function finishHunt(p,s) {
    const bit=1 << (s.stage-1);
    const victories=Number(p.getDynamicProperty(victoriesKey) ?? 0);
    // This independent victory marker survives stale progress objects and
    // duplicate/late death callbacks. Save before cleanup and presentation.
    p.setDynamicProperty(victoriesKey,victories | bit);
    s.phase='clear';
    delete s.bossId;
    persist(p,s);
    for (const actor of [...entities(p,'hunt'),...entities(p,'toy')]) actor.remove();
    p.addEffect('instant_health',1,{amplifier:2,showParticles:false});
    p.sendMessage('§6The voice has fallen silent. Find the green marker.');
}

function inSantaStrikeArc(playerLocation,bossLocation,yaw) {
    const dx=playerLocation.x-bossLocation.x,dz=playerLocation.z-bossLocation.z;
    const distance=Math.hypot(dx,dz);
    if (distance<.01 || distance>3.6 || Math.abs(playerLocation.y-bossLocation.y)>2) return false;
    const radians=yaw*Math.PI/180;
    return (-Math.sin(radians)*dx+Math.cos(radians)*dz)/distance>=Math.cos(Math.PI/4);
}

function santaStrike(p,boss,phase) {
    if (boss.getComponent('minecraft:health')?.currentValue<=0) {
        santaSwing=undefined;
        return;
    }
    if (santaSwing && santaSwing.id!==boss.id) santaSwing=undefined;
    if (santaSwing) {
        // Keep the swing facing its announced direction; never snap an attack
        // around to follow a player who successfully dodged behind the boss.
        boss.setRotation({x:0,y:santaSwing.yaw});
        if (system.currentTick<santaSwing.due) return;
        const yaw=santaSwing.yaw;
        santaSwing=undefined;
        if (inSantaStrikeArc(p.location,boss.location,yaw)) {
            const blocking=p.isSneaking && p.getComponent('minecraft:equippable')?.getEquipment(EquipmentSlot.Offhand)?.typeId==='minecraft:shield';
            if (!blocking) {
                const health=p.getComponent('minecraft:health');
                const before=health.currentValue;
                p.applyDamage(phase==='rage'?8:6,
                    {cause:EntityDamageCause.entityAttack,damagingEntity:boss});
                // A connected, unblocked blow must remain noticeable through armor.
                const ceiling=Math.max(0,before-(phase==='rage'?3:2));
                if (health.currentValue>ceiling) health.setCurrentValue(ceiling);
            }
        }
        return;
    }
    if (system.currentTick<nextSantaSwing) return;
    const yaw=boss.getRotation().y;
    if (!inSantaStrikeArc(p.location,boss.location,yaw)) return;
    santaSwing={id:boss.id,yaw,due:system.currentTick+(phase==='rage'?8:12)};
    nextSantaSwing=system.currentTick+(phase==='rage'?27:36);
    p.onScreenDisplay.setActionBar('§cSanta is winding up!');
}

function giftRain(p) {
    // One minute, twelve drops per 3/4 second, at most 48 airborne.
    // The old central-only rectangle left the outer corridors completely safe.
    if (age%15===0 && age<=GIFT_PHASE_TICKS-50) {
        const corners=[[482,2],[526,2],[482,46],[526,46]];
        const wave=Math.floor(age/15);
        for (let i=0;i<12;i++) {
            let target,spawnY=44;
            for (let attempt=0;attempt<30;attempt++) {
                let x,z;
                if (i<2 && attempt<12) {
                    // Telegraph the player's current spot, including near walls.
                    const jitter=attempt===0&&i===0?0:2;
                    x=Math.floor(p.location.x+(Math.random()-.5)*jitter);
                    z=Math.floor(p.location.z+(Math.random()-.5)*jitter);
                } else if (i<6 && i>=2 && attempt<12) {
                    const corner=corners[i-2];
                    x=corner[0]+Math.floor((Math.random()-.5)*3);
                    z=corner[1]+Math.floor((Math.random()-.5)*3);
                } else {
                    // Rotate through a 6x6 grid spanning the full arena.
                    const cell=(wave*6+Math.max(0,i-6)+attempt*7)%36;
                    x=482+Math.floor((cell%6)*8.8+(Math.random()-.5)*3);
                    z=2+Math.floor(Math.floor(cell/6)*8.8+(Math.random()-.5)*3);
                }
                x=Math.max(482,Math.min(526,x));
                z=Math.max(2,Math.min(46,z));
                try {
                    if (![32,33].every(y=>p.dimension.getBlock(at(x,y,z))?.isAir)) continue;
                    spawnY=44;
                    // Drop beneath a low arch rather than skipping that hiding place.
                    for(let y=34;y<=44;y++) {
                        const block=p.dimension.getBlock(at(x,y,z));
                        if (!block) {spawnY=0;break;}
                        if (!block.isAir) {spawnY=y-1.6;break;}
                    }
                    if (!spawnY) continue;
                    target=at(x+.5,31.0625,z+.5);break;
                } catch(error) {
                    if (!(error instanceof LocationInUnloadedChunkError) && error.name!=='LocationInUnloadedChunkError') throw error;
                }
            }
            if (!target) continue;
            try {
                const entity=p.dimension.spawnEntity('koledari:falling_gift',at(target.x,spawnY,target.z));
                entity.addTag(actors);entity.addTag('falling_gift');
                fallingGifts.push({entity,target,start:age,height:spawnY-target.y});
            } catch(error) {
                if (!(error instanceof LocationInUnloadedChunkError) && error.name!=='LocationInUnloadedChunkError') throw error;
            }
        }
    }
    fallingGifts=fallingGifts.filter(drop=>{
        if (!drop.entity.isValid) return false;
        const progress=Math.min(1,(age-drop.start)/50);
        if (progress<1) {
            drop.entity.teleport(at(drop.target.x,drop.target.y+(drop.height ?? 12.94)*(1-progress*progress),drop.target.z));
            p.dimension.spawnParticle('minecraft:basic_flame_particle',at(drop.target.x,31.2,drop.target.z));
            return true;
        }
        drop.entity.remove();
        p.dimension.spawnParticle('minecraft:huge_explosion_emitter',drop.target);
        p.playSound('random.explode',{location:drop.target,volume:.4});
        if (age-lastGiftHit>=20 && Math.hypot(p.location.x-drop.target.x,p.location.z-drop.target.z)<GIFT_BLAST_RADIUS) {
            p.applyDamage(3,{cause:EntityDamageCause.entityExplosion});lastGiftHit=age;
        }
        return false;
    });
}

function furnishLivingRoom(p) {
    const d=p.dimension;
    const set=(x,y,z,type)=>d.getBlock(at(x,y,z))?.setType('minecraft:'+type);
    for(const e of d.getEntities({tags:['home_decor']})) e.remove();
    for(let x=-9;x<=9;x++) for(let z=-9;z<=9;z++) for(let y=90;y<=95;y++) {
        if (x<=-3 && z<=-4) continue;
        if (x>=6 && z>=-5 && z<=-1) continue;
        if (x===0 && z===-9) continue;
        set(x,y,z,'air');
    }
    const prop=(id,x,y,z,yaw=0)=>{
        const e=d.spawnEntity('koledari:'+id,at(x,y,z));
        e.addTag('home_decor');e.setRotation({x:0,y:yaw});
        return e;
    };
    // These furniture models open toward local +Z, opposite Bedrock's model front.
    // Aim each seat at its own table, rather than hand-entering mirrored angles.
    const seat=(id,x,z,tx,tz)=>prop(id,x,90,z,
        Math.atan2(-(tx-x),tz-z)*180/Math.PI+180);
    seat('cozy_sofa',3.3,-3,5,-3);
    seat('cozy_armchair',5.1,-.8,5,-3);
    for(let x=3;x<=5;x++) for(let z=-5;z<=0;z++) set(x,90,z,'white_carpet');
    prop('cozy_coffee_table',5,90,-3);
    // A real tiered Christmas tree, with a separate star and small ornaments.
    prop('cozy_tree',6.5,90,5);
    prop('cozy_tree_lights',6.5,90,5);
    // Mixed-size parcels nestled under the branches and around the tree skirt.
    const parcels=[
        ['small',5.9,4.5,15],['medium',6.7,4.4,-12],['wide',6.4,5.1,8],
        ['tall',7.35,4.65,-18],['small',5.45,5.05,25],['large',5.65,5.8,-8],
        ['medium',6.55,6.05,14],['wide',7.45,5.7,-15],['small',7.65,4.05,12],
        ['tall',5.4,4.05,20],['medium',6.2,3.85,-20],['small',6.95,3.7,8],
        ['small',5.05,5.95,-16],['medium',7.7,6.35,18],['wide',6.15,6.85,-10],
        ['small',7.0,6.85,25],['tall',8.05,5.05,-12],['small',5.4,6.7,10]
    ];
    for(const [size,x,z,yaw] of parcels) prop('cozy_present_'+size,x,90,z,yaw);
    // A bookcase against the solid back wall: 3 wide, 2 high, no window overlap.
    for(let x=3;x<=5;x++) for(let y=90;y<=91;y++) set(x,y,9,'bookshelf');
    for(let x=3;x<=5;x++) set(x,92,9,'spruce_slab');
    // Compact dining corner with the steaming cup and two upholstered chairs.
    prop('cozy_dining_table',-.1,90,6.9);
    seat('cozy_armchair',-1.7,6.9,-.1,6.9);
    seat('cozy_armchair',1.5,6.9,-.1,6.9);
    // Small kitchen counter against the west wall, away from bed and stairs.
    for(let z=-1;z<=1;z++) set(-9,90,z,'spruce_planks');
    set(-9,91,0,'lantern');
    for(const [x,z] of [[-3,0],[3,0],[-3,6],[3,6]]) {
        for(let y=95;y<=97;y++) set(x,y,z,'iron_chain');
        set(x,94,z,'lantern');
        const lamp=d.getBlock(at(x,94,z));
        lamp.setPermutation(lamp.permutation.withState('hanging',true));
    }
    // A restrained garland along the back wall, above the bookcase only.
    for(let x=3;x<=5;x++) {
        set(x,94,9,'spruce_leaves');
        const leaf=d.getBlock(at(x,94,9));
        leaf.setPermutation(leaf.permutation.withState('persistent_bit',true));
    }
}

function furnishFinalPantry(p) {
    if (state(p).phase!=='awake') return;
    const d=p.dimension;
    const prop=(id,x,y,z,yaw=0)=>{
        const e=d.spawnEntity('koledari:'+id,at(x,y,z));
        e.addTag('home_decor');e.addTag('final_pantry');e.setRotation({x:0,y:yaw});
    };
    // Rear-wall shelves keep the doorway and the center of the pantry walkable.
    prop('cozy_pantry_shelves',-6.5,90,8.5);
    // Lowest shelf: a single snowy Santa hat beside neatly stacked firewood.
    prop('cozy_pantry_santa_hat',-7.2,90.34375,8.45,-18);
    prop('cozy_pantry_firewood',-5.85,90.34375,8.5);
    for(const [id,x] of [['cozy_pantry_jam',-7.5],['cozy_pantry_compote',-7.05],
        ['cozy_pantry_jam',-6.6],['cozy_pantry_compote',-6.15],['cozy_pantry_jam',-5.7]]) {
        prop(id,x,91.09375,8.5);
    }
    prop('cozy_present_small',-7.4,91.84375,8.5,8);
    prop('cozy_present_medium',-6.75,91.84375,8.5,-10);
    prop('cozy_present_small',-6.05,91.84375,8.5,15);
    // Floor supplies stand to the side, with a clear route to the lower shelf.
    prop('cozy_pantry_sack',-7.7,90,6.65,12);
    prop('cozy_pantry_basket',-5.65,90,7.1);
    for(const [x,z] of [[-5.8,7],[-5.5,7],[-5.65,7.25]]) prop('cozy_pantry_apple',x,90.18,z);
    prop('cozy_pantry_pumpkin',-7.65,90,7.4,-12);
}

function furnishBasementDoor(p) {
    const d=p.dimension;
    const set=(x,y,z,type)=>d.getBlock(at(x,y,z))?.setType('minecraft:'+type);
    // Enclose the whole shaft, attached to the house corner, not a lone doorframe.
    for(let y=90;y<=92;y++) {
        for(let z=4;z<=9;z++) for(const x of [-9,-5]) set(x,y,z,'dark_oak_planks');
        for(let x=-9;x<=-5;x++) for(const z of [4,9]) set(x,y,z,'dark_oak_planks');
    }
    for(let x=-9;x<=-5;x++) for(let z=4;z<=9;z++) set(x,93,z,'dark_oak_planks');
    // Safe landing behind the door; the ladder starts farther inside the enclosure.
    for(let x=-8;x<=-6;x++) for(let z=4;z<=6;z++) set(x,89,z,'spruce_planks');
    for(let x=-8;x<=-6;x++) for(let z=5;z<=8;z++) for(let y=90;y<=92;y++) set(x,y,z,'air');
    if (state(p).phase==='awake') {
        for(let x=-8;x<=-6;x++) for(let z=7;z<=8;z++) set(x,89,z,'spruce_planks');
    }
    for(const y of [90,91]) {
        const source=d.getBlock(at(0,y,-10));
        if (source?.typeId.endsWith('_door')) d.getBlock(at(-7,y,4))?.setPermutation(source.permutation.withState('open_bit',false));
    }
    set(-6,92,6,'lantern');
    if (state(p).phase==='awake') furnishFinalPantry(p);
}

function furnishBedroom(p) {
    furnishLivingRoom(p);
    furnishBasementDoor(p);
    const d=p.dimension;
    const set=(x,y,z,type)=>d.getBlock(at(x,y,z))?.setType('minecraft:'+type);
    // Save both working bed halves before removing all former bedroom furniture.
    const halves=[-7,-6].map(z=>d.getBlock(at(-7,90,z))?.permutation);
    const valid=halves.every(b=>b && (b.type.id==='minecraft:bed' || b.type.id.endsWith('_bed')));
    // Open corner: no partitions, stacked cupboards, rugs or blocks over windows.
    for(let x=-9;x<=-3;x++) for(let z=-9;z<=-4;z++) for(let y=90;y<=94;y++) {
        if (!valid && x===-7 && y===90 && (z===-7 || z===-6)) continue;
        set(x,y,z,'air');
    }
    if (valid) {
        for(const x of [-7,-6,-5]) for(let i=0;i<2;i++) {
            d.getBlock(at(x,90,[-7,-6][i]))?.setPermutation(halves[i]);
        }
    }
    // One-block-high headboard only; both sides of the bed remain walkable.
    for(let x=-7;x<=-5;x++) set(x,90,-5,'dark_oak_planks');
    set(-8,90,-5,'lantern');
}

function furnishLoadedHouse(p,onReady=()=>{}) {
    const request=++houseFurnishRequest;
    const retry=()=>system.runTimeout(attempt,10);
    const attempt=()=>{
        if (request!==houseFurnishRequest || !p.isValid || state(p).stage!==0) return;
        try {
            // Blocks can be readable before entity spawning is allowed. Probe all
            // four house chunks BEFORE removing/rebuilding any existing furniture.
            for(const x of [-8,8]) for(const z of [-8,8]) {
                if (!p.dimension.getBlock(at(x,90,z))) {retry();return;}
                const probe=p.dimension.spawnEntity('koledari:cozy_present_small',at(x,90,z));
                probe.remove();
            }
            furnishBedroom(p);
            onReady();
        } catch(error) {
            if (!(error instanceof LocationInUnloadedChunkError) && error.name!=='LocationInUnloadedChunkError') throw error;
            retry();
        }
    };
    system.run(attempt);
}

function ensureWarmDrink(p) {
    const existing=p.dimension.getEntities({tags:['warm_drink']});
    if (existing.length) return existing[0];
    const cup=p.dimension.spawnEntity('koledari:warm_drink',at(-.1,90.875,6.9));
    cup.addTag('warm_drink');
    return cup;
}

function awakeChristmas(p) {
    for (const actor of p.dimension.getEntities({tags:[actors]})) actor.remove();
    procession=[];
    persist(p,{stage:0,phase:'awake'});
    p.camera.fade({fadeColor:{red:0,green:0,blue:0},fadeTime:{fadeInTime:.4,holdTime:1,fadeOutTime:1.5}});
    system.runTimeout(()=>{
        p.teleport(at(-6.5,90.5625,-6.5),{rotation:{x:0,y:0}});
        p.getComponent('minecraft:inventory')?.container?.clearAll();
        const equipment=p.getComponent('minecraft:equippable');
        for (const slot of [EquipmentSlot.Head,EquipmentSlot.Chest,EquipmentSlot.Legs,
            EquipmentSlot.Feet,EquipmentSlot.Offhand]) equipment?.setEquipment(slot);
        p.setSpawnPoint({dimension:p.dimension,...at(-6.5,90.5625,-6.5)});
        world.setTimeOfDay(1000);
        p.dimension.setWeather(WeatherType.Rain,120000);
        // The wake-up sequence starts only once the whole room has been restored.
        furnishLoadedHouse(p,()=>{
            ensureWarmDrink(p);
            for(let x=-90;x<=90;x++) for(let z=-25;z<=-20;z++) {
                try {
                    const block=p.dimension.getBlock(at(x,90,z));
                    if (block?.isAir) block.setType('minecraft:snow_layer');
                } catch(error) {
                    if (!(error instanceof LocationInUnloadedChunkError) && error.name!=='LocationInUnloadedChunkError') throw error;
                }
            }
            for(let x=-1;x<=1;x++) for(let y=90;y<=92;y++) {
                p.dimension.getBlock(at(x,y,-11))?.setType('minecraft:air');
            }
            p.camera.setCamera('minecraft:free',{location:at(-5.5,90.85,-6.4),rotation:{x:-75,y:180}});
            system.runTimeout(()=>{
                p.camera.setCamera('minecraft:free',{location:at(-5.5,91.4,-6.4),rotation:{x:35,y:180},easeOptions:{easeTime:1.3,easeType:EasingType.InOutSine}});
            },30);
            system.runTimeout(()=>{
                p.teleport(at(-3.5,90,-6.5),{rotation:{x:25,y:90}});
                p.setSpawnPoint({dimension:p.dimension,...at(-3.5,90,-6.5)});
                p.camera.setCamera('minecraft:free',{location:at(-3.5,91.62,-6.5),rotation:{x:25,y:90},easeOptions:{easeTime:1.4,easeType:EasingType.InOutSine}});
            },64);
            system.runTimeout(()=>{
                p.camera.clear();
                p.onScreenDisplay.setTitle('§6Christmas Evening',{subtitle:'§fIt was only a dream...',fadeInDuration:30,stayDuration:140,fadeOutDuration:60});
            },98);
        });
    },12);
}

function homePortal(p,s) {
    let portal=entities(p,'home_portal')[0];
    if (!portal) {
        const points=[at(492.5,31.0625,40.5),at(516.5,31.0625,40.5),at(504.5,31.0625,8.5)];
        points.sort((a,b)=>Math.hypot(b.x-p.location.x,b.z-p.location.z)-Math.hypot(a.x-p.location.x,a.z-p.location.z));
        portal=p.dimension.spawnEntity('koledari:home_portal',points[0]);
        portal.addTag(actors);portal.addTag('home_portal');
        p.sendMessage('§6Enter the portal. It is time to wake up.');
    }
    if (Math.hypot(p.location.x-portal.location.x,p.location.z-portal.location.z)<1.3) awakeChristmas(p);
}

function finishSanta(p,s) {
    if (s.phase==='win' || s.phase==='awake') return;
    // Commit victory before UI/audio; dying entities may no longer expose tags.
    s.phase='win';s.hp=0;santaSwing=undefined;
    persist(p,s);
    p.onScreenDisplay.setTitle('§6THE SONG IS OVER',{subtitle:'You survived the last Christmas night.',fadeInDuration:5,stayDuration:100,fadeOutDuration:20});
}

function santa(p,s) {
    const arena=at(514.5,32,35.5);
    if (s.phase==='gift') {
        if (p.dimension.getBlock(gift)?.typeId==='minecraft:air') {
            p.dimension.getBlock(at(504,33,31)).setType('minecraft:air');
            s.phase='santa';
            s.santaReturnPending=true;
            s.hp=600;
            age=0;
            persist(p,s);
            p.onScreenDisplay.setTitle('§4DEMONIC SANTA');
        }
        return;
    }
    if (s.phase==='win') {homePortal(p,s);return;}
    if (s.phase==='wave') {
        let active=0;
        for (let i=0;i<5;i++) {
            const existing=entities(p,'wave_'+i)[0];
            if (!existing) continue;
            active++;
            const feet=p.dimension.getBlock(existing.location);
            if (feet && !feet.isAir && !feet.typeId.endsWith('_carpet')) {
                existing.teleport(wavePositions[i],{facingLocation:p.getHeadLocation()});
            }
        }
        const batch=(s.wave&3)!==3 ? [0,1] : (s.wave&12)!==12 ? [2,3] : [4];
        for (const i of batch) {
            if (active>=2) break;
            if (s.wave & (1<<i)) continue;
            if (entities(p,'wave_'+i).length) continue;
            if ((s.waveSpawned ?? 0) & (1<<i)) continue;
            const position=wavePositions[i];
            if (![32,33,34].every(y=>p.dimension.getBlock(at(Math.floor(position.x),y,Math.floor(position.z)))?.isAir)) continue;
            const entity=spawn(p,i,position,'wave_'+i);
            s.waveSpawned=(s.waveSpawned ?? 0) | (1<<i);
            persist(p,s);
            entity.getComponent('minecraft:health').setCurrentValue(waveHealth[i]);
            active++;
        }
        return;
    }
    if (s.phase==='barrage') {
        giftRain(p);
        if (age>=GIFT_PHASE_TICKS) {
            s.phase='santa_mid';
            s.santaReturnPending=true;
            persist(p,s);
            p.sendMessage('§4Santa has returned.');
        }
        return;
    }
    if (!['santa','santa_mid','santa_final','rage'].includes(s.phase)) return;
    let boss=entities(p,'santa')[0];
    if (!boss) {
        if (s.santaId && !s.santaReturnPending) return;
        s.santaReturnPending=false;
        boss=spawn(p,5,s.phase==='rage'?arena:at(494.5,32,35.5),'santa');
        s.santaId=boss.id;
        persist(p,s);
        if (s.phase==='rage') boss.triggerEvent('koledari:rage');
        boss.getComponent('minecraft:health').setCurrentValue(
            Math.min(s.hp ?? 600,600));
    }
    const hp=boss.getComponent('minecraft:health').currentValue;
    if (hp<=0) {finishSanta(p,s);return;}
    santaStrike(p,boss,s.phase);
    if (s.phase==='santa' && hp<=420) {
        s.hp=Math.max(hp,1);
        s.phase='barrage';
        lastGiftHit=-100;
        boss.remove();
        santaSwing=undefined;
        age=0;
        persist(p,s);
        p.onScreenDisplay.setTitle('§4Phase 1',{subtitle:'§fThe Presents',fadeInDuration:5,stayDuration:45,fadeOutDuration:15});
    } else if (s.phase==='santa_mid' && hp<=300) {
        s.hp=Math.max(hp,1);
        s.phase='wave';
        s.wave=0;
        s.waveSpawned=0;
        boss.remove();
        santaSwing=undefined;
        age=0;
        persist(p,s);
        p.addEffect('instant_health',1,{amplifier:1,showParticles:false});
        p.onScreenDisplay.setTitle('§4Phase 2',{subtitle:'§fThe Five Voices',fadeInDuration:5,stayDuration:45,fadeOutDuration:15});
    } else if (s.phase==='santa_final' && hp<=120) {
        s.phase='rage';s.hp=Math.max(hp,1);
        boss.triggerEvent('koledari:rage');
        persist(p,s);
        p.onScreenDisplay.setTitle('§4Phase 3',{subtitle:'§cEnrage',fadeInDuration:5,stayDuration:45,fadeOutDuration:15});
    }
}

world.afterEvents.entityHurt.subscribe(({hurtEntity})=>{
    const p=world.getAllPlayers().find(candidate=>candidate.id===playerId);
    if (!p || !hurtEntity.typeId.startsWith('koledari:caroler_')) return;
    const s=state(p);
    if (s.phase==='hunt' && s.stage>=1 && s.stage<=5 &&
        (hurtEntity.id===s.bossId || hurtEntity.typeId==='koledari:'+ids[s.stage-1]) &&
        hurtEntity.getComponent('minecraft:health')?.currentValue<=0) finishHunt(p,s);
});

world.afterEvents.entityDie.subscribe(({deadEntity})=>{
    const p=world.getAllPlayers().find(candidate=>candidate.id===playerId);
    if (!p || deadEntity.id===p.id) {
        song=undefined;
        return;
    }
    const s=state(p);
    if (!deadEntity.typeId.startsWith('koledari:')) return;
    // Resolve the miniboss by saved identity/type, not tags on a dying entity.
    // Commit victory before effects, cleanup or messages can fail.
    if (s.phase==='hunt' && s.stage>=1 && s.stage<=5 &&
        (deadEntity.id===s.bossId || deadEntity.typeId==='koledari:'+ids[s.stage-1])) {
        finishHunt(p,s);
        return;
    }
    if (deadEntity.typeId==='koledari:demonic_santa' && s.stage===6 && ['santa','santa_mid','santa_final','rage'].includes(s.phase)) {
        finishSanta(p,s);
        return;
    }
    const tags=deadEntity.getTags();
    if (s.phase==='wave') {
        const index=tags.find(tag=>/^wave_[0-4]$/.test(tag));
        if (!index) return;
        s.wave|=1<<Number(index.at(-1));
        if (s.wave===31) {
            s.phase='santa_final';
            s.santaReturnPending=true;
            p.sendMessage('§4Santa has returned.');
        }
    } else if (tags.includes('santa') && ['santa','santa_mid','santa_final','rage'].includes(s.phase)) {
        s.phase='win';
        p.onScreenDisplay.setTitle('§6THE SONG IS OVER',{subtitle:'You survived the last Christmas night.',fadeInDuration:5,stayDuration:100,fadeOutDuration:20});
    } else return;
    persist(p,s);
});

system.runInterval(()=>{
    const p=world.getAllPlayers().find(candidate=>candidate.id===playerId);
    if (!p || !initialized || p.getComponent('minecraft:health')?.currentValue<=0) return;
    const s=state(p);
    age+=5;
    if (s.stage===0) {
        if (s.phase==='awake') {
            if (age%60===0) p.playSound('block.campfire.crackle',{location:at(8.5,91,-3),volume:1.5,pitch:.9});
            if (age%20===0) for (const cup of p.dimension.getEntities({tags:['warm_drink']})) {
                p.dimension.spawnParticle('koledari:cup_steam',at(cup.location.x,cup.location.y+.45,cup.location.z));
            }
            return;
        }
        streetMist(p.dimension);
        if (age%20===0) {
            const present=entities(p,'outside');
            procession=[];
            for (let i=0;i<5;i++) {
                const actor=present.find(entity=>entity.typeId==='koledari:'+ids[i]+'_outside') ??
                    spawn(p,i,processionPosition(i,processionTick).location,'outside');
                procession.push(actor);
            }
            for (const y of [90,91]) {
                const door=p.dimension.getBlock(at(0,y,-10));
                if (door?.permutation.getState('open_bit')) {
                    door.setPermutation(door.permutation.withState('open_bit',false));
                }
            }
        }
        if (inBox(p.location,-9,82,5,-4,88,10)) {
            procession=[];
            go(p,{stage:1,phase:'quiet'});
        }
    } else if (s.stage<=5) hunt(p,s);
    else santa(p,s);
},5);

system.runInterval(()=>{
    const p=world.getAllPlayers().find(candidate=>candidate.id===playerId);
    if (p && initialized) maintainWeapons(p);
    if (!procession.length) return;
    processionTick++;
    for (let i=0;i<procession.length;i++) {
        const actor=procession[i];
        if (!actor.isValid) continue;
        const {location,rotation}=processionPosition(i,processionTick);
        actor.teleport(location,{rotation});
    }
},1);

