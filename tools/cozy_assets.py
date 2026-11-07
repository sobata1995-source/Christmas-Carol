"""Human-scale 3D furniture and a decorated evergreen, using existing HD textures."""
import copy

def build_cozy_assets(bp,rp,write):
    faces=('north','south','east','west','up','down')
    def cube(origin,size,rotation=None):
        value={'origin':origin,'size':size,'uv':{f:{'uv':[0,0],'uv_size':[256,256]} for f in faces}}
        if rotation:
            value.update(rotation=rotation,pivot=[origin[0]+size[0]/2,origin[1]+size[1]/2,origin[2]+size[2]/2])
        return value
    def geometry(name,cubes):
        write(rp/f'models/entity/{name}.geo.json',{'format_version':'1.12.0','minecraft:geometry':[{
            'description':{'identifier':'geometry.koledari.'+name,'texture_width':256,'texture_height':256,
                'visible_bounds_width':6,'visible_bounds_height':5,'visible_bounds_offset':[0,1.5,0]},
            'bones':[{'name':'root','pivot':[0,0,0],'cubes':cubes}]}]})
    sofa=[cube([-20,5,-8],[40,3,15]),cube([-21,7,-8],[42,10,3]),
          cube([-22,5,-8],[3,7,16]),cube([19,5,-8],[3,7,16])]
    for x in (-18,-6,6):sofa.append(cube([x,8,-4.5],[11.5,1.5,10.5]))
    sofa_wood=[cube([-20,3,-7],[40,2,13])]
    for x in (-18,16):
        for z in (-5,4):sofa_wood.append(cube([x,0,z],[2,4,2]))
    chair=[cube([-8,5,-7],[16,3,14]),cube([-9,7,-7],[18,10,3]),cube([-10,5,-7],[2,7,15]),cube([8,5,-7],[2,7,15]),cube([-7,8,-3.5],[14,1.5,9])]
    chair_wood=[cube([-8,3,-6],[16,2,12])]
    for x in (-7,5):
        for z in (-5,4):chair_wood.append(cube([x,0,z],[2,4,2]))
    tree=[]
    for y,w in [(5,30),(12,27),(19,23),(26,18),(33,13),(40,7)]:
        tree.append(cube([-w/2,y,-w/2],[w,7,w]))
        tree.append(cube([-w/2+1,y+2,-w/2+1],[w-2,3,w-2],[0,45,0]))
    trunk=[cube([-2,0,-2],[4,13,4]),cube([-5,0,-5],[10,2,10])]
    lights=[cube([-2,48,-1],[4,4,2],[0,0,45])]
    for x,y,z in [(-12,9,-9),(11,10,8),(-9,17,10),(9,20,-9),(-6,27,-7),(7,29,5),(-4,36,5),(3,40,-3)]:
        lights.append(cube([x,y,z],[2.2,2.2,2.2],[0,0,25]))
    gift=[cube([-3.5,0,-3.5],[7,6,7])]
    # Thin tabletops with visible space underneath and four separate legs.
    coffee=[cube([-10,7,-7],[20,2,14])]
    for x in (-8.5,7):
        for z in (-5.5,4):coffee.append(cube([x,0,z],[1.5,7,1.5]))
    dining=[cube([-12,12,-10],[24,2,20])]
    for x in (-10,8):
        for z in (-8,6):dining.append(cube([x,0,z],[2,12,2]))
    specs=[('cozy_coffee_table',coffee,'blocks/koledari_spruce_planks',None),
           ('cozy_dining_table',dining,'blocks/koledari_dark_oak_planks',None),
           ('cozy_sofa',sofa,'blocks/koledari_red_concrete',sofa_wood),
           ('cozy_armchair',chair,'blocks/koledari_red_concrete',chair_wood),
           ('cozy_tree',tree,'blocks/koledari_spruce_leaves',trunk),
           ('cozy_tree_lights',lights,'blocks/koledari_gold_block',None),
           ('cozy_present',gift,'blocks/koledari_red_wool',None),
           ('cozy_present_small',[cube([-2.5,0,-2.5],[5,4.5,5])],'blocks/koledari_red_wool',None),
           ('cozy_present_medium',[cube([-3.5,0,-3.5],[7,6,7])],'blocks/koledari_red_wool',None),
           ('cozy_present_large',[cube([-5,0,-4.5],[10,8,9])],'blocks/koledari_red_wool',None),
           ('cozy_present_tall',[cube([-3,0,-3],[6,11,6])],'blocks/koledari_red_wool',None),
           ('cozy_present_wide',[cube([-5.5,0,-3],[11,4,6])],'blocks/koledari_red_wool',None)]
    for name,cubes,texture,wood in specs:
        geometry(name,cubes)
        components={'minecraft:physics':{'has_gravity':False,'has_collision':False},
            'minecraft:collision_box':{'width':.01,'height':.01},'minecraft:persistent':{},
            'minecraft:health':{'value':1,'max':1},
            'minecraft:damage_sensor':{'triggers':[{'cause':'all','deals_damage':'no'}]}}
        write(bp/f'entities/{name}.json',{'format_version':'1.21.0','minecraft:entity':{
            'description':{'identifier':'koledari:'+name,'is_spawnable':False,'is_summonable':True},'components':components}})
        client={'identifier':'koledari:'+name,'materials':{'default':'entity_alphatest'},
            'textures':{'default':'textures/'+texture},'geometry':{'default':'geometry.koledari.'+name},
            'render_controllers':['controller.render.koledari.prop']}
        if wood:
            geometry(name+'_wood',wood)
            client['textures']['wood']='textures/blocks/koledari_dark_oak_planks'
            client['geometry']['wood']='geometry.koledari.'+name+'_wood'
            client['render_controllers'].append('controller.render.koledari.cozy_wood')
        if name=='cozy_tree_lights':client['materials']['default']='entity_emissive_alpha'
        write(rp/f'entity/{name}.entity.json',{'format_version':'1.10.0','minecraft:client_entity':{'description':client}})
    write(rp/'render_controllers/cozy.json',{'format_version':'1.8.0','render_controllers':{
        'controller.render.koledari.cozy_wood':{'geometry':'Geometry.wood','materials':[{'*':'Material.default'}],'textures':['Texture.wood']}}})

    from pantry_assets import build_pantry_assets
    build_pantry_assets(bp,rp,write)
