#!/usr/bin/env python3
"""
generate_subscription_logos.py — Automated 3D modeling and rendering via Blender 5.0.1
Generates high-fidelity 3D .glb models and transparent 3D .png logo badges for:
1. Contabo (Server VPS / Infrastructure)
2. Claude Code (Anthropic / Developer Tools)
3. Gemini Pro (Google / AI Tools)
"""

import sys
import os
import math
import bpy

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Ensure scene exists
    if not bpy.data.scenes:
        bpy.data.scenes.new("Scene")
    scene = bpy.context.scene
    # Set camera and rendering defaults
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
    # Point at target
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
    key_data.energy = 220
    key_data.size = 2.5
    key_data.color = (0.95, 0.98, 1.0)
    key_obj = bpy.data.objects.new("KeyLight", key_data)
    key_obj.location = (3.0, -3.5, 4.0)
    scene.collection.objects.link(key_obj)

    # Fill light (Warm soft)
    fill_data = bpy.data.lights.new("FillLight", "AREA")
    fill_data.energy = 80
    fill_data.size = 3.0
    fill_data.color = (1.0, 0.95, 0.9)
    fill_obj = bpy.data.objects.new("FillLight", fill_data)
    fill_obj.location = (-3.5, -2.5, 2.0)
    scene.collection.objects.link(fill_obj)

    # Rim light (Accented edge)
    rim_data = bpy.data.lights.new("RimLight", "POINT")
    rim_data.energy = 160
    rim_data.color = (0.6, 0.85, 1.0)
    rim_obj = bpy.data.objects.new("RimLight", rim_data)
    rim_obj.location = (0.0, 4.0, 3.5)
    scene.collection.objects.link(rim_obj)

def create_pbr_material(name, base_color, metallic=0.0, roughness=0.3, emission=(0,0,0,1), emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
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
    
    # Materials
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
        # Server chassis
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, z))
        blade = bpy.context.active_object
        blade.scale = (1.3, 0.8, blade_height)
        blade.data.materials.append(mat_server)

        # LED status strips on front edge
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(-0.45, -0.41, z))
        led1 = bpy.context.active_object
        led1.scale = (0.2, 0.03, blade_height * 0.4)
        led1.data.materials.append(mat_cyan_glow)

        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.35, -0.41, z))
        led2 = bpy.context.active_object
        led2.scale = (0.06, 0.03, blade_height * 0.4)
        led2.data.materials.append(mat_white_led)

    # Contabo "C" Cloud Sweep Arc (Torus segment in front)
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
# 2. CLAUDE CODE (ANTHROPIC) 3D LOGO
# ─────────────────────────────────────────────────────────────────────────────
def build_claude_scene():
    clear_scene()
    setup_lights_and_camera(cam_dist=3.8, cam_z=2.4)

    # Materials
    mat_base = create_pbr_material("ClaudeBase", (0.08, 0.07, 0.06, 1.0), metallic=0.3, roughness=0.5)
    mat_gold_rim = create_pbr_material("ClaudeGoldRim", (0.85, 0.55, 0.35, 1.0), metallic=0.7, roughness=0.25)
    mat_coral = create_pbr_material(
        "ClaudeCoral",
        (0.85, 0.42, 0.28, 1.0),
        metallic=0.15,
        roughness=0.32,
        emission=(0.85, 0.42, 0.28, 1.0),
        emission_strength=0.8
    )

    # Base Medallion (Circular beveled token)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.35, depth=0.2, location=(0, 0, -0.1))
    base = bpy.context.active_object
    base.data.materials.append(mat_base)

    # Beveled Outer Accent Ring
    bpy.ops.mesh.primitive_torus_add(
        major_radius=1.35,
        minor_radius=0.05,
        major_segments=64,
        minor_segments=16,
        location=(0, 0, 0.0)
    )
    rim = bpy.context.active_object
    rim.data.materials.append(mat_gold_rim)

    # Central Core Hub
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.24, depth=0.22, location=(0, 0, 0.11))
    hub = bpy.context.active_object
    hub.data.materials.append(mat_coral)

    # The Iconic Claude/Anthropic 14-Point Stylized Radial Asterisk
    num_rays = 14
    for i in range(num_rays):
        angle = (2 * math.pi / num_rays) * i
        # Alternating ray lengths
        length = 0.95 if i % 2 == 0 else 0.72
        width = 0.09 if i % 2 == 0 else 0.07
        
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.12))
        ray = bpy.context.active_object
        ray.scale = (width, length, 0.12)
        
        # Position offset along angle
        offset_dist = length * 0.5 + 0.12
        ray.location = (
            math.sin(angle) * offset_dist,
            math.cos(angle) * offset_dist,
            0.12
        )
        ray.rotation_euler = (0, 0, -angle)
        ray.data.materials.append(mat_coral)

# ─────────────────────────────────────────────────────────────────────────────
# 3. GEMINI PRO (GOOGLE) 3D LOGO
# ─────────────────────────────────────────────────────────────────────────────
def build_gemini_scene():
    clear_scene()
    setup_lights_and_camera(cam_dist=3.8, cam_z=2.4)

    # Materials
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
    # Modeled via intersecting tapered elliptic diamond lobes
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

        # Export GLTF / GLB
        print(f"[*] Exporting 3D model to: {glb_path}")
        bpy.ops.export_scene.gltf(
            filepath=glb_path,
            export_format="GLB",
            use_selection=False,
            export_yup=True
        )

        # Render 2D Transparent PNG Badge
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

    # 2. Claude Code (Anthropic)
    print("\n[+] Building Claude Code 3D Logo...")
    build_claude_scene()
    export_and_render("claude", output_dirs)

    # 3. Gemini Pro (Google)
    print("\n[+] Building Gemini Pro 3D Logo...")
    build_gemini_scene()
    export_and_render("gemini", output_dirs)

    print("\n[+] All 3D models and badges generated successfully!")

if __name__ == "__main__":
    main()
