"""Script ejecutado DENTRO de Blender para renderizar un único fotograma."""

import argparse
import math
from pathlib import Path
import sys


def demo(bpy, phase):
    from mathutils import Vector

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    def material(name, color, metallic=0, roughness=.35):
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Base Color"].default_value = (*color, 1)
        shader.inputs["Metallic"].default_value = metallic
        shader.inputs["Roughness"].default_value = roughness
        return mat

    teal = material("Turquesa", (.025, .55, .47), .65, .23)
    gold = material("Cobre", (.85, .30, .075), .6, .27)
    silver = material("Núcleo", (.55, .67, .83), .8, .18)
    dark = material("Base", (.025, .04, .075), .35)
    floor = material("Suelo", (.055, .075, .11))

    bpy.ops.mesh.primitive_plane_add(size=200)
    bpy.context.object.data.materials.append(floor)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=2.4, depth=.35, location=(0, 0, .18))
    bpy.context.object.data.materials.append(dark)
    bevel = bpy.context.object.modifiers.new("Bordes suaves", "BEVEL")
    bevel.width = .12
    bevel.segments = 3

    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=.65,
                                       location=(0, 0, 2.05))
    bpy.context.object.data.materials.append(silver)
    bpy.ops.object.shade_smooth()
    for index, radius in enumerate((1.1, 1.45, 1.8)):
        bpy.ops.mesh.primitive_torus_add(major_segments=64, minor_segments=12,
                                        major_radius=radius, minor_radius=.055,
                                        location=(0, 0, 2.05))
        ring = bpy.context.object
        ring.rotation_euler = (.55 + index * .65, phase * (1 if index % 2 else -1),
                               index * .8 + phase)
        ring.data.materials.append(teal if index % 2 == 0 else gold)
        bpy.ops.object.shade_smooth()
    for index in range(3):
        angle = phase + index * 2 * math.pi / 3
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=.19,
            location=(1.85 * math.cos(angle), 1.85 * math.sin(angle),
                      2.05 + .55 * math.sin(2 * angle)))
        bpy.context.object.data.materials.append(gold if index % 2 else teal)
        bpy.ops.object.shade_smooth()

    bpy.ops.object.camera_add(location=(7, -10, 6.5))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0, 0, 1.7)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 8.2
    bpy.context.scene.camera = camera
    for name, location, energy, color, size in (
        ("Principal", (2, -4, 8), 1500, (1, .88, .72), 5),
        ("Relleno", (-4, -1, 5), 1100, (.4, .7, 1), 4),
        ("Contraluz", (1, 5, 6), 1800, (.5, 1, .85), 3),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.color = color
        light.data.shape = "DISK"
        light.data.size = size
        light.rotation_euler = (Vector((0, 0, 1.5)) - light.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.world.color = (.12, .12, .12)


def main():
    import bpy

    parser = argparse.ArgumentParser()
    parser.add_argument("--frame", type=int, required=True)
    parser.add_argument("--start", type=int, required=True)
    parser.add_argument("--end", type=int, required=True)
    parser.add_argument("--fps", type=int, required=True)
    parser.add_argument("--width", type=int, required=True)
    parser.add_argument("--height", type=int, required=True)
    parser.add_argument("--samples", type=int, required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--scene")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    if args.scene:
        bpy.ops.wm.open_mainfile(filepath=args.scene, load_ui=False, use_scripts=False)
    else:
        phase = 2 * math.pi * (args.frame - args.start) / (args.end - args.start + 1)
        demo(bpy, phase)
    scene = bpy.context.scene
    if scene.camera is None:
        raise ValueError("La escena .blend necesita una cámara activa")
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.cycles.seed = args.frame
    scene.render.resolution_x = args.width
    scene.render.resolution_y = args.height
    scene.render.resolution_percentage = 100
    scene.render.fps = args.fps
    scene.render.fps_base = 1
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.filepath = str(Path(args.output).resolve())
    # El compositor de un .blend no debe escribir salidas adicionales fuera del trabajo.
    scene.render.use_compositing = False
    scene.render.use_sequencer = False
    scene.frame_set(args.frame)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
