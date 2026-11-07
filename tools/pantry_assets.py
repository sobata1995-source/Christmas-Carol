"""Small final-only pantry props; the snowy hat sits on the bottom shelf."""
def build_pantry_assets(bp,rp,write):
    def cube(o,s,rotation=None):
        c={'origin':o,'size':s,'uv':{f:{'uv':[0,0],'uv_size':[256,256]} for f in ('north','south','east','west','up','down')}}
        if rotation:c.update(rotation=rotation,pivot=[o[i]+s[i]/2 for i in range(3)])
        return c
    def geo(name,cubes):
        write(rp/f'models/entity/{name}.geo.json',{'format_version':'1.12.0','minecraft:geometry':[{
            'description':{'identifier':'geometry.koledari.'+name,'texture_width':256,'texture_height':256,
                'visible_bounds_width':4,'visible_bounds_height':4,'visible_bounds_offset':[0,1,0]},
            'bones':[{'name':'root','pivot':[0,0,0],'cubes':cubes}]}]})
    shelves=[cube([-22,y,-4],[44,1.5,8]) for y in (4,16,28)]
    for x in (-22,20):
        for z in (-4,2):shelves.append(cube([x,0,z],[2,36,2]))
    hat=[cube([-4,1.5,-3],[8,3,6]),cube([-3,4,-2.5],[6,2.5,5]),
         cube([-1.5,6,-2],[4,2,4],[0,0,-20]),cube([1,6.5,-1.5],[4,2,3],[0,0,-38])]
    snow=[cube([-5,0,-4],[10,1.8,8]),cube([3.8,5,-1.8],[3.2,3.2,3.2]),
          cube([-2.8,6.55,-1.7],[2.2,.35,2.6]),cube([-3.7,4.45,.1],[2.7,.3,2]),cube([.4,8.2,-1],[1.5,.3,1.6])]
    jar=[cube([-2,0,-2],[4,5,4]),cube([-1.6,5,-1.6],[3.2,1.2,3.2])]
    lid=[cube([-2.2,6,-2.2],[4.4,1,4.4])]
    wood=[cube([-5,0,-3],[10,2.4,2.4]),cube([-5,0,0],[10,2.4,2.4]),cube([-4.5,2.5,-1.5],[9,2.4,2.4])]
    sack=[cube([-4,1,-3.5],[8,8,7]),cube([-3,0,-3],[6,2,6]),cube([-3,9,-2.5],[6,2.5,5]),cube([-1.7,11,-1.7],[3.4,2,3.4])]
    sack_tie=[cube([-1.9,10.8,-1.9],[3.8,.7,3.8])]
    basket=[cube([-5,0,-4],[10,1,8]),cube([-5,1,-4],[10,3,1]),cube([-5,1,3],[10,3,1]),cube([-5,1,-3],[1,3,6]),cube([4,1,-3],[1,3,6])]
    apple=[cube([-1.4,0,-1.4],[2.8,2.6,2.8]),cube([-1,2.4,-1],[2,.5,2])]
    stem=[cube([-.25,2.7,-.25],[.5,1,.5])]
    pumpkin=[cube([-3,1,-3],[6,4.5,6]),cube([-2.3,0,-2.3],[4.6,1,4.6]),cube([-2.3,5.5,-2.3],[4.6,1,4.6])]
    pumpkin_stem=[cube([-.6,6,-.6],[1.2,2,1.2])]
    specs=[('shelves',shelves,'koledari_spruce_planks',None,None),
           ('santa_hat',hat,'koledari_red_concrete',snow,'koledari_snow_block'),
           ('jam',jar,'koledari_red_concrete',lid,'koledari_gold_block'),
           ('compote',jar,'koledari_gold_block',lid,'koledari_dark_oak_planks'),
           ('firewood',wood,'koledari_spruce_log',None,None),
           ('sack',sack,'koledari_quartz_pillar',sack_tie,'koledari_dark_oak_planks'),
           ('basket',basket,'koledari_spruce_planks',None,None),
           ('apple',apple,'koledari_red_concrete',stem,'koledari_dark_oak_planks'),
           ('pumpkin',pumpkin,'koledari_gold_block',pumpkin_stem,'koledari_dark_oak_planks')]
    for suffix,cubes,texture,detail,detail_texture in specs:
        name='cozy_pantry_'+suffix;geo(name,cubes)
        write(bp/f'entities/{name}.json',{'format_version':'1.21.0','minecraft:entity':{
            'description':{'identifier':'koledari:'+name,'is_spawnable':False,'is_summonable':True},
            'components':{'minecraft:physics':{'has_gravity':False,'has_collision':False},
            'minecraft:collision_box':{'width':.01,'height':.01},'minecraft:persistent':{},
            'minecraft:health':{'value':1,'max':1},'minecraft:damage_sensor':{
            'triggers':[{'cause':'all','deals_damage':'no'}]}}}})
        client={'identifier':'koledari:'+name,'materials':{'default':'entity_alphatest'},
            'textures':{'default':'textures/blocks/'+texture},'geometry':{'default':'geometry.koledari.'+name},
            'render_controllers':['controller.render.koledari.prop']}
        if detail:
            geo(name+'_detail',detail)
            client['textures']['wood']='textures/blocks/'+detail_texture
            client['geometry']['wood']='geometry.koledari.'+name+'_detail'
            client['render_controllers'].append('controller.render.koledari.cozy_wood')
        write(rp/f'entity/{name}.entity.json',{'format_version':'1.10.0','minecraft:client_entity':{'description':client}})
