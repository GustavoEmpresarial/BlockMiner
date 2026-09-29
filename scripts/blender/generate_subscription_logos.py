#!/usr/bin/env python3
"""
generate_subscription_logos.py — Automated 3D modeling and rendering via Blender 5.0.1
Generates high-fidelity 3D .glb models and transparent 3D .png logo badges for:
1. Contabo (Server VPS / Infrastructure)
2. Claude Code (Anthropic Clawd Mascot — Official 3D Orange Mascot Character)
3. Gemini Pro (Google / AI Tools)
"""

import sys
import os
import math
import bpy

# ─────────────────────────────────────────────────────────────────────────────
# CLAWD (Claude Code Official Mascot) Procedural Geometry (Pre-baked & Centered)
# ─────────────────────────────────────────────────────────────────────────────
CLAWD_PART_1_VERTS = [
    (-0.3038, 0.3571, 0.4493), (0.3038, 0.3571, 0.4493), (-0.3038, -0.2857, 0.4493),
    (0.3038, -0.2857, 0.4493), (-0.3038, 0.3571, 0.0004), (-0.3038, -0.2857, 0.0004),
    (-0.5085, 0.3571, 0.0004), (-0.5085, -0.2857, 0.0004), (-0.5085, 0.3571, 0.4493),
    (-0.5085, -0.2857, 0.4493), (-0.7086, 0.3571, 0.4493), (-0.7086, -0.2857, 0.4493),
    (-0.7086, 0.3571, 0.0004), (-0.7086, -0.2857, 0.0004), (-0.9134, 0.3571, 0.0004),
    (-0.9134, -0.2857, 0.0004), (-0.911, 0.3571, 0.8814), (-0.911, -0.2857, 0.8814),
    (-1.1134, 0.3571, 0.8814), (-1.1134, -0.2857, 0.8814), (-1.1134, 0.3571, 1.3351),
    (-1.1134, -0.2857, 1.3351), (-0.911, 0.3571, 1.3351), (-0.911, -0.2857, 1.3351),
    (-0.911, 0.3571, 1.7696), (-0.911, -0.2857, 1.7696), (0.911, 0.3571, 1.7696),
    (0.911, -0.2857, 1.7696), (0.911, 0.3571, 1.3351), (0.911, -0.2857, 1.3351),
    (1.1134, 0.3571, 1.3351), (1.1134, -0.2857, 1.3351), (1.1134, 0.3571, 0.8814),
    (1.1134, -0.2857, 0.8814), (0.911, 0.3571, 0.8814), (0.911, -0.2857, 0.8814),
    (0.9134, 0.3571, 0.0004), (0.9134, -0.2857, 0.0004), (0.7086, 0.3571, 0.0004),
    (0.7086, -0.2857, 0.0004), (0.7086, 0.3571, 0.4493), (0.7086, -0.2857, 0.4493),
    (0.5086, 0.3571, 0.4493), (0.5086, -0.2857, 0.4493), (0.5086, 0.3571, 0.0004),
    (0.5086, -0.2857, 0.0004), (0.3038, 0.3571, 0.0004), (0.3038, -0.2857, 0.0004)
]
CLAWD_PART_1_TRIS = [
    (0, 1, 2), (2, 1, 3), (4, 0, 5), (5, 0, 2), (6, 4, 7), (7, 4, 5), (8, 6, 9), (9, 6, 7),
    (10, 8, 11), (11, 8, 9), (12, 10, 13), (13, 10, 11), (14, 12, 15), (15, 12, 13),
    (16, 14, 17), (17, 14, 15), (18, 16, 19), (19, 16, 17), (20, 18, 21), (21, 18, 19),
    (22, 20, 23), (23, 20, 21), (24, 22, 25), (25, 22, 23), (26, 24, 27), (27, 24, 25),
    (28, 26, 29), (29, 26, 27), (30, 28, 31), (31, 28, 29), (32, 30, 33), (33, 30, 31),
    (34, 32, 35), (35, 32, 33), (36, 34, 37), (37, 34, 35), (38, 36, 39), (39, 36, 37),
    (40, 38, 41), (41, 38, 39), (42, 40, 43), (43, 40, 41), (44, 42, 45), (45, 42, 43),
    (46, 44, 47), (47, 44, 45), (1, 46, 3), (3, 46, 47), (47, 45, 3), (3, 45, 43),
    (3, 43, 35), (35, 43, 41), (35, 41, 37), (37, 41, 39), (33, 29, 35), (35, 29, 23),
    (35, 23, 17), (17, 23, 21), (17, 21, 19), (33, 31, 29), (27, 25, 29), (29, 25, 23),
    (15, 11, 17), (17, 11, 9), (17, 9, 2), (2, 9, 5), (5, 9, 7), (15, 13, 11),
    (17, 2, 35), (35, 2, 3), (44, 46, 42), (42, 46, 1), (42, 1, 34), (34, 1, 28),
    (34, 28, 30), (1, 0, 28), (28, 0, 16), (28, 16, 22), (22, 16, 18), (22, 18, 20),
    (4, 6, 0), (0, 6, 8), (0, 8, 16), (16, 8, 10), (16, 10, 14), (14, 10, 12),
    (24, 26, 22), (22, 26, 28), (30, 32, 34), (42, 34, 40), (40, 34, 36), (40, 36, 38)
]

CLAWD_PART_2_VERTS = [
    (0.6431, -0.2857, 1.5494), (0.4646, -0.2857, 1.5494), (0.6431, -0.3571, 1.5494),
    (0.4646, -0.3571, 1.5494), (0.6431, -0.2857, 1.1209), (0.6431, -0.3571, 1.1209),
    (0.4646, -0.2857, 1.1209), (0.4646, -0.3571, 1.1209)
]
CLAWD_PART_2_TRIS = [
    (0, 1, 2), (2, 1, 3), (4, 0, 5), (5, 0, 2), (6, 4, 7), (7, 4, 5),
    (1, 6, 3), (3, 6, 7), (7, 5, 3), (3, 5, 2), (1, 0, 6), (6, 0, 4)
]

CLAWD_PART_3_VERTS = [
    (-0.4646, -0.2857, 1.1209), (-0.4646, -0.2857, 1.5494), (-0.4646, -0.3571, 1.1209),
    (-0.4646, -0.3571, 1.5494), (-0.6431, -0.2857, 1.1209), (-0.6431, -0.3571, 1.1209),
    (-0.6431, -0.2857, 1.5494), (-0.6431, -0.3571, 1.5494)
]
CLAWD_PART_3_TRIS = [
    (0, 1, 2), (2, 1, 3), (4, 0, 5), (5, 0, 2), (6, 4, 7), (7, 4, 5),
    (1, 6, 3), (3, 6, 7), (3, 7, 2), (2, 7, 5), (6, 1, 4), (4, 1, 0)
]

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if not bpy.data.scenes:
        bpy.data.scenes.new("Scene")
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    return scene

def setup_lights_and_camera(cam_dist=4.2, cam_z=2.8, target_z=0.0):
    scene = bpy.context.scene
    
    # Camera
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 55
    cam_data.clip_start = 0.1
    cam_data.clip_end = 100.0
    cam_obj = bpy.data.objects.new("Camera", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj
    
    cam_obj.location = (cam_dist * 0.7, -cam_dist * 0.7, cam_z)
    dx = -cam_obj.location.x
    dy = -cam_obj.location.y
    dz = target_z - cam_obj.location.z
    dist_xy = math.hypot(dx, dy)
    cam_obj.rotation_euler = (
        math.pi / 2 - math.atan2(dz, dist_xy),
        0,
        math.atan2(dy, dx) + math.pi / 2
    )

    # Key light (Cool white)
    key_data = bpy.data.lights.new("KeyLight", "AREA")
    key_data.energy = 450
    key_data.size = 2.5
    key_data.color = (0.95, 0.98, 1.0)
    key_obj = bpy.data.objects.new("KeyLight", key_data)
    key_obj.location = (3.0, -3.5, 4.0)
    scene.collection.objects.link(key_obj)

    # Fill light (Warm soft)
    fill_data = bpy.data.lights.new("FillLight", "AREA")
    fill_data.energy = 180
    fill_data.size = 3.0
    fill_data.color = (1.0, 0.95, 0.9)
    fill_obj = bpy.data.objects.new("FillLight", fill_data)
    fill_obj.location = (-3.5, -2.5, 2.0)
    scene.collection.objects.link(fill_obj)

    # Rim light (Accented edge)
    rim_data = bpy.data.lights.new("RimLight", "POINT")
    rim_data.energy = 350
    rim_data.color = (0.6, 0.85, 1.0)
    rim_obj = bpy.data.objects.new("RimLight", rim_data)
    rim_obj.location = (0.0, 4.0, 3.5)
    scene.collection.objects.link(rim_obj)

def create_pbr_material(name, base_color, metallic=0.0, roughness=0.3, emission=(0,0,0,1), emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    nodes = mat.node_tree.nodes
    bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = base_color
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = emission
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat

# ─────────────────────────────────────────────────────────────────────────────
# 1. CONTABO 3D LOGO
# ─────────────────────────────────────────────────────────────────────────────
def build_contabo_scene():
    clear_scene()
    setup_lights_and_camera(cam_dist=3.8, cam_z=2.4)
    
    mat_base = create_pbr_material("ContaboBase", (0.02, 0.05, 0.12, 1.0), metallic=0.85, roughness=0.25)
    mat_server = create_pbr_material("ContaboMetal", (0.08, 0.16, 0.32, 1.0), metallic=0.9, roughness=0.2)
    mat_cyan_glow = create_pbr_material(
        "ContaboCyanLED",
        (0.0, 0.85, 1.0, 1.0),
        metallic=0.1,
        roughness=0.1,
        emission=(0.0, 0.9, 1.0, 1.0),
        emission_strength=4.0
    )
    mat_white_led = create_pbr_material(
        "ContaboWhiteLED",
        (0.9, 0.95, 1.0, 1.0),
        metallic=0.1,
        roughness=0.1,
        emission=(0.9, 0.95, 1.0, 1.0),
        emission_strength=3.0
    )

    # Base Medallion (Hexagonal beveled token)
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=1.4, depth=0.25, location=(0, 0, -0.1))
    base = bpy.context.active_object
    base.name = "ContaboMedallion"
    base.rotation_euler = (0, 0, math.pi / 6)
    base.data.materials.append(mat_base)

    # Outer decorative rim
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=1.45, depth=0.1, location=(0, 0, -0.15))
    rim = bpy.context.active_object
    rim.rotation_euler = (0, 0, math.pi / 6)
    rim.data.materials.append(mat_cyan_glow)

    # Server Stack (3 modular blades)
    blade_height = 0.16
    blade_gap = 0.24
    for i in range(3):
        z = 0.1 + (i - 1) * blade_gap
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, z))
        blade = bpy.context.active_object
        blade.scale = (1.3, 0.8, blade_height)
        blade.data.materials.append(mat_server)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.45, -0.41, z))
        led1 = bpy.context.active_object
        led1.scale = (0.2, 0.03, blade_height * 0.4)
        led1.data.materials.append(mat_cyan_glow)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.35, -0.41, z))
        led2 = bpy.context.active_object
        led2.scale = (0.06, 0.03, blade_height * 0.4)
        led2.data.materials.append(mat_white_led)

    # Contabo "C" Cloud Sweep Arc
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.9,
        minor_radius=0.08,
        major_segments=32,
        minor_segments=12,
        location=(0, 0, 0.45)
    )
    arc = bpy.context.active_object
    arc.scale = (1.0, 0.6, 0.8)
    arc.data.materials.append(mat_cyan_glow)

# ─────────────────────────────────────────────────────────────────────────────
# 2. CLAUDE CODE (OFFICIAL CLAWD MASCOT 3D CHARACTER)
# ─────────────────────────────────────────────────────────────────────────────
def build_claude_scene():
    clear_scene()
    scene = bpy.context.scene

    # Camera configured specifically for character portrait (3/4 perspective)
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = 55
    cam_obj = bpy.data.objects.new("Camera", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj
    cam_obj.location = (1.8, -3.8, 1.4)

    target_obj = bpy.data.objects.new("Target", None)
    target_obj.location = (0, 0, 0.88)
    scene.collection.objects.link(target_obj)

    track = cam_obj.constraints.new(type="TRACK_TO")
    track.target = target_obj
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"

    # Studio Lights for character
    key_data = bpy.data.lights.new("Key", "AREA")
    key_data.energy = 550
    key_data.size = 2.5
    key_data.color = (1.0, 0.98, 0.95)
    key_obj = bpy.data.objects.new("Key", key_data)
    key_obj.location = (3.0, -2.5, 3.5)
    scene.collection.objects.link(key_obj)

    fill_data = bpy.data.lights.new("Fill", "AREA")
    fill_data.energy = 220
    fill_data.size = 3.5
    fill_data.color = (0.95, 0.95, 1.0)
    fill_obj = bpy.data.objects.new("Fill", fill_data)
    fill_obj.location = (-3.5, -2.0, 1.5)
    scene.collection.objects.link(fill_obj)

    rim_data = bpy.data.lights.new("Rim", "POINT")
    rim_data.energy = 450
    rim_data.color = (1.0, 0.85, 0.7)
    rim_obj = bpy.data.objects.new("Rim", rim_data)
    rim_obj.location = (-1.0, 3.0, 2.5)
    scene.collection.objects.link(rim_obj)

    # Materials: Authentic Anthropic Vibrant Orange & Deep Pixel Black
    mat_orange = create_pbr_material("ClawdBody", (0.98, 0.42, 0.12, 1.0), metallic=0.03, roughness=0.28)
    mat_black = create_pbr_material("ClawdEyes", (0.02, 0.02, 0.03, 1.0), metallic=0.1, roughness=0.15)

    # 1. Body Mesh
    mesh_body = bpy.data.meshes.new("ClawdBodyMesh")
    mesh_body.from_pydata(CLAWD_PART_1_VERTS, [], CLAWD_PART_1_TRIS)
    mesh_body.update()
    obj_body = bpy.data.objects.new("ClawdBody", mesh_body)
    obj_body.data.materials.append(mat_orange)
    scene.collection.objects.link(obj_body)

    # 2. Right Pixel Eye
    mesh_eye_r = bpy.data.meshes.new("ClawdEyeRMesh")
    mesh_eye_r.from_pydata(CLAWD_PART_2_VERTS, [], CLAWD_PART_2_TRIS)
    mesh_eye_r.update()
    obj_eye_r = bpy.data.objects.new("ClawdEyeR", mesh_eye_r)
    obj_eye_r.data.materials.append(mat_black)
    scene.collection.objects.link(obj_eye_r)

    # 3. Left Pixel Eye
    mesh_eye_l = bpy.data.meshes.new("ClawdEyeLMesh")
    mesh_eye_l.from_pydata(CLAWD_PART_3_VERTS, [], CLAWD_PART_3_TRIS)
    mesh_eye_l.update()
    obj_eye_l = bpy.data.objects.new("ClawdEyeL", mesh_eye_l)
    obj_eye_l.data.materials.append(mat_black)
    scene.collection.objects.link(obj_eye_l)

# ─────────────────────────────────────────────────────────────────────────────
# 3. GEMINI PRO (GOOGLE) 3D LOGO
# ─────────────────────────────────────────────────────────────────────────────
def build_gemini_scene():
    clear_scene()
    setup_lights_and_camera(cam_dist=3.8, cam_z=2.4)

    mat_base = create_pbr_material("GeminiBase", (0.04, 0.05, 0.09, 1.0), metallic=0.7, roughness=0.3)
    mat_gemini_blue = create_pbr_material(
        "GeminiBlue",
        (0.25, 0.52, 0.98, 1.0),
        metallic=0.8,
        roughness=0.18,
        emission=(0.2, 0.45, 0.95, 1.0),
        emission_strength=1.5
    )
    mat_gemini_purple = create_pbr_material(
        "GeminiPurple",
        (0.58, 0.38, 0.92, 1.0),
        metallic=0.75,
        roughness=0.2,
        emission=(0.55, 0.35, 0.9, 1.0),
        emission_strength=1.2
    )
    mat_core_sparkle = create_pbr_material(
        "GeminiSparkle",
        (0.9, 0.95, 1.0, 1.0),
        metallic=0.2,
        roughness=0.1,
        emission=(0.85, 0.92, 1.0, 1.0),
        emission_strength=3.5
    )

    # Base Medallion
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.35, depth=0.2, location=(0, 0, -0.1))
    base = bpy.context.active_object
    base.data.materials.append(mat_base)

    # Outer cosmic glow ring
    bpy.ops.mesh.primitive_torus_add(
        major_radius=1.36,
        minor_radius=0.04,
        major_segments=64,
        minor_segments=16,
        location=(0, 0, 0.0)
    )
    rim = bpy.context.active_object
    rim.data.materials.append(mat_gemini_purple)

    # Google Gemini signature 4-point curved sparkle star
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.12))
    v_lobe = bpy.context.active_object
    v_lobe.scale = (0.28, 1.45, 0.16)
    v_lobe.rotation_euler = (0, 0, 0)
    v_lobe.data.materials.append(mat_gemini_blue)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.12))
    h_lobe = bpy.context.active_object
    h_lobe.scale = (1.45, 0.28, 0.16)
    h_lobe.rotation_euler = (0, 0, 0)
    h_lobe.data.materials.append(mat_gemini_purple)

    # Center diamond jewel
    bpy.ops.mesh.primitive_cylinder_add(vertices=4, radius=0.42, depth=0.22, location=(0, 0, 0.14))
    diamond = bpy.context.active_object
    diamond.rotation_euler = (0, 0, math.pi / 4)
    diamond.data.materials.append(mat_core_sparkle)

    # Satellite companion sparkles
    bpy.ops.mesh.primitive_cylinder_add(vertices=4, radius=0.14, depth=0.15, location=(0.75, 0.75, 0.12))
    sat1 = bpy.context.active_object
    sat1.rotation_euler = (0, 0, math.pi / 4)
    sat1.data.materials.append(mat_core_sparkle)

    bpy.ops.mesh.primitive_cylinder_add(vertices=4, radius=0.10, depth=0.15, location=(-0.75, -0.65, 0.12))
    sat2 = bpy.context.active_object
    sat2.rotation_euler = (0, 0, math.pi / 4)
    sat2.data.materials.append(mat_gemini_blue)

def export_and_render(name, output_dirs):
    scene = bpy.context.scene
    for out_dir in output_dirs:
        os.makedirs(out_dir, exist_ok=True)
        glb_path = os.path.join(out_dir, f"{name}.glb")
        png_path = os.path.join(out_dir, f"{name}.png")

        print(f"[*] Exporting 3D model to: {glb_path}")
        bpy.ops.export_scene.gltf(
            filepath=glb_path,
            export_format="GLB",
            use_selection=False,
            export_yup=True
        )

        print(f"[*] Rendering 3D badge to: {png_path}")
        scene.render.filepath = png_path
        bpy.ops.render.render(write_still=True)

def main():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    client_dir = os.path.join(root, "client", "public", "media", "transparency")
    storage_dir = os.path.join(root, "storage", "media-seed", "transparency")
    output_dirs = [client_dir, storage_dir]

    print("==========================================================")
    print("   🎨 BLENDER AUTOMATED 3D SUBSCRIPTION LOGO GENERATOR    ")
    print("==========================================================")

    # 1. Contabo
    print("\n[+] Building Contabo 3D Logo...")
    build_contabo_scene()
    export_and_render("contabo", output_dirs)

    # 2. Claude Code (Clawd Mascot Character)
    print("\n[+] Building Claude Code Clawd Mascot 3D Character...")
    build_claude_scene()
    export_and_render("claude", output_dirs)

    # 3. Gemini Pro (Google)
    print("\n[+] Building Gemini Pro 3D Logo...")
    build_gemini_scene()
    export_and_render("gemini", output_dirs)

    print("\n[+] All 3D models and badges generated successfully!")

if __name__ == "__main__":
    main()
