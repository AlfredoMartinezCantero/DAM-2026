"""Genera y hornea una simulación Mantaflow. Se ejecuta dentro de Blender."""

import argparse
import json
import math
from pathlib import Path
import sys


def material(bpy, name, color, transmission=0, roughness=.3, ior=1.45, metallic=0):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    for name, value in {"Base Color": (*color, 1), "Roughness": roughness,
                        "Transmission Weight": transmission, "IOR": ior,
                        "Metallic": metallic}.items():
        shader.inputs[name].default_value = value
    return result


def cube(bpy, name, location, dimensions):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def cup(bpy):
    """Paredes y fondo forman un volumen cerrado; la boca queda abierta."""
    count = 96
    vertices, faces = [], []
    for radius, height in ((.48, .12), (.48, .68), (.395, .68), (.395, .21)):
        vertices.extend((radius * math.cos(2 * math.pi * i / count),
                         radius * math.sin(2 * math.pi * i / count), height)
                        for i in range(count))
    for ring in range(3):
        for i in range(count):
            j = (i + 1) % count
            faces.append((ring * count + i, ring * count + j,
                          (ring + 1) * count + j, (ring + 1) * count + i))
    vertices.extend(((0, 0, .12), (0, 0, .21)))
    for i in range(count):
        j = (i + 1) % count
        faces.append((j, i, 4 * count))
        faces.append((3 * count + i, 3 * count + j, 4 * count + 1))
    mesh = bpy.data.meshes.new("Recipiente hueco")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Recipiente transparente", mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = polygon.index < 3 * count
    bevel = obj.modifiers.new("Bordes redondeados", "BEVEL")
    bevel.width, bevel.segments = .012, 3
    return obj


def effector(obj):
    modifier = obj.modifiers.new("Colisión del líquido", "FLUID")
    modifier.fluid_type = "EFFECTOR"
    modifier.effector_settings.effector_type = "COLLISION"
    modifier.effector_settings.surface_distance = .001


def build(bpy, args):
    from mathutils import Vector

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, args.frames
    scene.render.fps, scene.render.fps_base = args.fps, 1
    scene.gravity = (0, 0, -9.81)
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.max_bounces = 12
    scene.cycles.transmission_bounces = 10
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 640, 360
    scene.render.resolution_percentage = 100
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.16, .2, .26, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .35
    glass = material(bpy, "Vidrio transparente", (.95, .98, 1), 1, .035, 1.45)
    water = material(bpy, "Agua azul", (.27, .72, .93), .96, .055, 1.333)
    floor_mat = material(bpy, "Superficie de estudio", (.24, .28, .34), roughness=.3)
    metal = material(bpy, "Boquilla", (.11, .14, .17), metallic=.85, roughness=.22)

    vessel = cup(bpy)
    vessel.data.materials.append(glass)
    effector(vessel)
    floor = cube(bpy, "Suelo", (0, 0, .035), (8, 8, .07))
    floor.data.materials.append(floor_mat)
    effector(floor)

    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=args.radius + .02, depth=.3,
                                        end_fill_type="NOTHING", location=(0, 0, 1.92))
    nozzle = bpy.context.object
    nozzle.name = "Boquilla del chorro"
    nozzle.data.materials.append(metal)
    nozzle.modifiers.new("Espesor de la boquilla", "SOLIDIFY").thickness = .025

    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=args.radius,
                                       location=(0, 0, 1.68))
    source = bpy.context.object
    source.name = "Entrada continua de agua"
    source.hide_render = True
    source.display_type = "WIRE"
    flow_mod = source.modifiers.new("Fuente Mantaflow", "FLUID")
    flow_mod.fluid_type = "FLOW"
    flow = flow_mod.flow_settings
    flow.flow_type, flow.flow_behavior = "LIQUID", "INFLOW"
    flow.use_initial_velocity = True
    flow.velocity_coord = (0, 0, -args.velocity)
    flow.surface_distance = .5
    flow.subframes = 2

    domain = cube(bpy, "Dominio de agua", (0, 0, 1.15), (2.4, 2.4, 2.3))
    domain.data.materials.append(water)
    modifier = domain.modifiers.new("Simulación Mantaflow", "FLUID")
    modifier.fluid_type = "DOMAIN"
    settings = modifier.domain_settings
    settings.domain_type = "LIQUID"
    settings.resolution_max = args.resolution
    settings.cache_type = "ALL"
    settings.cache_frame_start, settings.cache_frame_end = 1, args.frames
    settings.cache_directory = str((args.output / "cache").resolve())
    settings.cache_data_format = "UNI"
    settings.cache_mesh_format = "BOBJECT"
    settings.cache_resumable = False
    settings.use_mesh = True
    settings.mesh_scale = 1
    settings.mesh_particle_radius = 1.6
    settings.timesteps_min, settings.timesteps_max = 1, 8
    settings.use_collision_border_bottom = True
    settings.use_collision_border_top = False
    for side in ("front", "back", "left", "right"):
        setattr(settings, "use_collision_border_" + side, False)
    for polygon in domain.data.polygons:
        polygon.use_smooth = True

    bpy.ops.object.camera_add(location=(3.1, -4.2, 2.5))
    camera = bpy.context.object
    camera.name = "Cámara principal"
    camera.rotation_euler = (Vector((0, 0, .83)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type, camera.data.ortho_scale = "ORTHO", 3.55
    scene.camera = camera
    for name, location, power, color, size in (
        ("Luz principal", (1.8, -3, 4), 700, (1, .9, .78), 3),
        ("Reflejo lateral", (-2.5, -1, 2.4), 500, (.65, .8, 1), 2),
        ("Contraluz del agua", (0, 2.3, 3.2), 1000, (.75, .9, 1), 2),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy, light.data.color, light.data.size = power, color, size
        light.rotation_euler = (Vector((0, 0, .6)) - light.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.select_all(action="DESELECT")
    domain.select_set(True)
    bpy.context.view_layer.objects.active = domain
    return domain, settings


def main():
    import bpy

    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--frames", type=int, default=120)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--resolution", type=int, default=64)
    parser.add_argument("--radius", type=float, default=.10)
    parser.add_argument("--velocity", type=float, default=1.2)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    args.output = args.output.resolve()
    if args.output.exists() and any(args.output.iterdir()):
        raise ValueError("La carpeta de salida debe estar vacía para no mezclar cachés")
    args.output.mkdir(parents=True, exist_ok=True)
    domain, settings = build(bpy, args)
    path = args.output / "scene.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    print(f"Horneando líquido: {args.frames} fotogramas, resolución {args.resolution}", flush=True)
    status = bpy.ops.fluid.bake_all()
    if status != {"FINISHED"} or not settings.has_cache_baked_mesh:
        raise RuntimeError("Blender no ha completado la caché de malla del líquido")
    # Esta ruta relativa se conserva al mover o distribuir la escena y la caché juntas.
    settings.cache_directory = "//cache"
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    manifest = {"version": 1, "scene": "scene.blend", "cache": "cache", "kind": "liquid",
                "start": 1, "end": args.frames, "fps": args.fps,
                "blender_version": bpy.app.version_string, "resolution": args.resolution,
                "source_radius": args.radius, "source_velocity": args.velocity}
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"ESCENA Y CACHÉ LISTAS: {path}", flush=True)


if __name__ == "__main__":
    main()
