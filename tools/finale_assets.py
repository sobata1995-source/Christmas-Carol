"""Lightweight falling gifts and the return-home portal."""
import math
from PIL import Image


def build_finale_assets(bp, rp, write):
    for name, cubes, texture in (
        ('falling_gift', [{'origin':[-12,0,-12],'size':[24,24,24],
            'uv':{face:{'uv':[0,0],'uv_size':[256,256]} for face in
                  ('north','south','east','west','up','down')}}], 'blocks/koledari_red_wool'),
        ('home_portal', [
            {'origin':[-20,0,-2],'size':[4,52,4],'uv':[0,0]},
            {'origin':[16,0,-2],'size':[4,52,4],'uv':[0,0]},
            {'origin':[-16,48,-2],'size':[32,4,4],'uv':[0,0]},
            {'origin':[-16,0,-.5],'size':[32,48,1],
             'uv':{face:{'uv':[0,0],'uv_size':[256,256]} for face in
                   ('north','south','east','west','up','down')}}], 'entity/home_portal'),
        ('warm_drink', [
            {'origin':[-3,0,-3],'size':[6,7,6],'uv':[0,0]},
            {'origin':[3,2,-1.5],'size':[1,1,3],'uv':[0,0]},
            {'origin':[3,5,-1.5],'size':[1,1,3],'uv':[0,0]},
            {'origin':[4,2,-1.5],'size':[1,4,3],'uv':[0,0]},
            {'origin':[-2.5,7,-2.5],'size':[5,.1,5],
             'uv':{face:{'uv':[128,0],'uv_size':[64,64]} for face in
                   ('north','south','east','west','up','down')}}], 'entity/warm_drink')):
        write(bp/f'entities/{name}.json',{'format_version':'1.21.0','minecraft:entity':{
            'description':{'identifier':'koledari:'+name,'is_spawnable':False,'is_summonable':True},
            'components':{'minecraft:physics':{'has_gravity':False,'has_collision':False},
                'minecraft:collision_box':{'width':.01,'height':.01},'minecraft:persistent':{},
                'minecraft:health':{'value':1,'max':1},
                'minecraft:damage_sensor':{'triggers':[{'cause':'all','deals_damage':'no'}]}}}})
        write(rp/f'models/entity/{name}.geo.json',{'format_version':'1.12.0','minecraft:geometry':[{
            'description':{'identifier':'geometry.koledari.'+name,'texture_width':256,'texture_height':256,
                'visible_bounds_width':5,'visible_bounds_height':5,'visible_bounds_offset':[0,1.5,0]},
            'bones':[{'name':'root','pivot':[0,0,0],'cubes':cubes}]}]})
        write(rp/f'entity/{name}.entity.json',{'format_version':'1.10.0','minecraft:client_entity':{
            'description':{'identifier':'koledari:'+name,
                'materials':{'default':'entity_emissive_alpha' if name=='home_portal' else 'entity_alphatest'},
                'textures':{'default':'textures/'+texture},
                'geometry':{'default':'geometry.koledari.'+name},
                'render_controllers':['controller.render.koledari.prop']}}})
    write(rp/'render_controllers/props.json',{'format_version':'1.8.0','render_controllers':{
        'controller.render.koledari.prop':{'geometry':'Geometry.default',
            'materials':[{'*':'Material.default'}],'textures':['Texture.default']}}})
    portal=Image.new('RGBA',(256,256))
    for y in range(256):
        for x in range(256):
            dx,dy=(x-128)/128,(y-128)/128
            angle=math.atan2(dy,dx)
            v=(math.sin(math.hypot(dx,dy)*24-angle*4)+1)/2
            portal.putpixel((x,y),(int(70+100*v),int(20+60*v),int(130+120*v),220))
    portal.save(rp/'textures/entity/home_portal.png')
    drink=Image.new('RGBA',(256,256),(165,25,30,255))
    for y in range(256):
        for x in range(128,256):
            drink.putpixel((x,y),(65,30,15,255))
    drink.save(rp/'textures/entity/warm_drink.png')
    write(rp/'particles/cup_steam.json',{'format_version':'1.10.0','particle_effect':{
        'description':{'identifier':'koledari:cup_steam','basic_render_parameters':{
            'material':'particles_blend','texture':'textures/particle/street_mist'}},
        'components':{
            'minecraft:emitter_rate_instant':{'num_particles':2},
            'minecraft:emitter_lifetime_once':{'active_time':.1},
            'minecraft:emitter_shape_point':{'direction':[0,1,0]},
            'minecraft:particle_lifetime_expression':{'max_lifetime':1.8},
            'minecraft:particle_initial_speed':.15,
            'minecraft:particle_motion_dynamic':{'linear_acceleration':[.025,.04,0]},
            'minecraft:particle_appearance_billboard':{
                'size':['.06 + variable.particle_age * .08','.06 + variable.particle_age * .08'],
                'facing_camera_mode':'lookat_xyz','uv':{'texture_width':128,'texture_height':128,
                    'uv':[0,0],'uv_size':[128,128]}},
            'minecraft:particle_appearance_tinting':{'color':[1,1,1,
                '.45 * (1 - variable.particle_age / variable.particle_lifetime)']}}}})
