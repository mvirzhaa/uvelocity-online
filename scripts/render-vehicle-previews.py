"""Offline inspection renders of the actual shipped GLB meshes, not browser screenshots.

blender -b -t 4 --python scripts/render-vehicle-previews.py -- \
  --models honda-crv-rs,mitsubishi-pajero-sport,toyota-fortuner,toyota-innova-zenix \
  --output docs/previews --views front,rear,side --samples 48
"""
import argparse
import math
import os
import sys
from pathlib import Path
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument('--models', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--views', default='front,rear,side')
parser.add_argument('--samples', type=int, default=48)
parser.add_argument('--width', type=int, default=1200)
parser.add_argument('--height', type=int, default=760)
options = parser.parse_args(argv)
project = Path(__file__).resolve().parent.parent
output = Path(options.output).resolve()
output.mkdir(parents=True, exist_ok=True)

def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

def area(name, location, energy, size, target=(0, 0, 0.8), color=(1, 1, 1)):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.shape = 'RECTANGLE'
    data.size = size
    data.size_y = size * .55
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    point_at(obj, target)
    return obj

for model in options.models.split(','):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = options.samples
    # Portable CPU builds may not include OpenImageDenoise.
    scene.cycles.use_denoising = False
    scene.render.resolution_x = options.width
    scene.render.resolution_y = options.height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = 0
    world = bpy.data.worlds.new('Neutral studio')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.20, .24, .30, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .35
    file = project / 'public/game/assets/cars' / (model + '.glb')
    if not file.is_file():
        raise FileNotFoundError(file)
    bpy.ops.import_scene.gltf(filepath=str(file))
    car_objects = [obj for obj in scene.objects if obj.type == 'MESH']
    corners = [obj.matrix_world @ Vector(c) for obj in car_objects for c in obj.bound_box]
    min_z = min(p.z for p in corners)
    # Importer converts glTF +Y up/+Z forward to Blender +Z up/-Y forward.
    for obj in car_objects:
        if obj.type == 'MESH':
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, min_z-.009))
    floor = bpy.context.object
    floor.name = 'Studio floor'
    mat = bpy.data.materials.new('Neutral grey floor')
    mat.diffuse_color = (.28, .31, .35, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (.28, .31, .35, 1)
    bsdf.inputs['Roughness'].default_value = .62
    floor.data.materials.append(mat)
    area('Front softbox', (1, -5.5, 6), 850, 5.2, color=(1, .95, .88))
    area('Side softbox', (-4, -.8, 4.7), 600, 4.5, color=(.82, .91, 1))
    area('Roof softbox', (2, 3.4, 5.7), 950, 5)
    area('Rear fill', (-1.5, 5.3, 3), 450, 3.8)
    camera_data = bpy.data.cameras.new('Inspection camera')
    camera = bpy.data.objects.new('Inspection camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 6.9
    for view in options.views.split(','):
        locations = {'front': (6.1, -8.2, 3.8), 'rear': (-6.1, 8.2, 3.8), 'side': (8.8, -.001, 2.1), 'front-straight': (0, -9, 2.35), 'rear-straight': (0, 9, 2.35)}
        camera.location = locations[view]
        point_at(camera, (0, 0, .92))
        camera_data.ortho_scale = 6.9 if view in ['front', 'rear', 'side'] else 4.1
        scene.render.filepath = str(output / (model + '-' + view + '.png'))
        bpy.ops.render.render(write_still=True)
        print('UVELOCITY_PREVIEW_SAVED', scene.render.filepath, flush=True)
