# SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
"""Preflight dentro do Blender: versão, exportador glTF, render mínimo. Escreve preflight.json."""
import json
import os
import sys

import bpy

out = os.environ.get("DOT_OUT", ".")
rep = {"blender": bpy.app.version_string, "python": sys.version.split()[0], "platform": sys.platform}
try:
    import io_scene_gltf2  # noqa: F401

    rep["gltf_addon"] = ".".join(str(x) for x in io_scene_gltf2.bl_info.get("version", ()))
except Exception as e:  # pragma: no cover
    rep["gltf_addon"] = f"indisponível: {e}"
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
rep["gltf_options"] = {k: (k in props) for k in ("export_animation_mode", "export_merge_animation", "export_morph_normal", "export_force_sampling", "export_def_bones")}
rep["engines"] = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
rep["actions_have_slots"] = hasattr(bpy.types.Action, "slots")
try:
    bpy.ops.mesh.primitive_cube_add()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = scene.render.resolution_y = 64
    cam = bpy.data.objects.new("c", bpy.data.cameras.new("c"))
    scene.collection.objects.link(cam)
    cam.location = (4, -4, 3)
    cam.rotation_euler = (1.1, 0, 0.78)
    scene.camera = cam
    scene.render.filepath = os.path.join(out, "preflight.png")
    bpy.ops.render.render(write_still=True)
    rep["render"] = "ok"
except Exception as e:
    rep["render"] = f"falhou: {e}"
with open(os.path.join(out, "preflight.json"), "w", encoding="utf-8") as f:
    json.dump(rep, f, indent=2)
print(json.dumps(rep, indent=2))
