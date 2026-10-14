"""
Constrói o Dot do zero dentro do Blender e exporta GLB + poster + relatório.
NÃO rode diretamente: use `python3 blender/run_blender.py build` (define caminhos e flags).

Saídas (pasta blender/out/<timestamp>/):
  dot_master.blend          arquivo editável (fonte)
  dot-base.glb              corpo + rosto + rig + sockets + clipes
  prop-*.glb, fx-*.glb      acessórios e efeitos, um arquivo por peça
  poster-*.png              renders de conferência (frente, 3/4, lado, 32/64/160 px)
  build-report.json         o que foi criado, versões e avisos

Rodar duas vezes produz o mesmo resultado (cena é recriada; nomes fixos).
"""
import json
import math
import os
import sys
import time
import traceback

import bpy
import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dot_spec as S  # noqa: E402

OUT = os.environ.get("DOT_OUT") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "manual")
os.makedirs(OUT, exist_ok=True)
REPORT = {"blender": bpy.app.version_string, "started": time.strftime("%Y-%m-%dT%H:%M:%S"), "warnings": [], "objects": {}, "exports": {}, "renders": []}


def warn(msg):
    REPORT["warnings"].append(msg)
    print("AVISO:", msg)


# --------------------------------------------------------------------------- cena limpa

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "Dot"
    scene.render.fps = S.FPS
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    return scene


def collection(name, parent=None):
    col = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(col)
    return col


def material(name):
    spec = S.MATERIALS[name]
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = S.hex_to_linear_rgba(spec["hex"])
    bsdf.inputs["Roughness"].default_value = spec["roughness"]
    bsdf.inputs["Metallic"].default_value = spec["metallic"]
    # Cor também no viewport/workbench.
    mat.diffuse_color = S.hex_to_linear_rgba(spec["hex"])
    return mat


def mesh_object(name, bm, col, mat_names):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, me)
    col.objects.link(obj)
    for m in mat_names:
        me.materials.append(material(m))
    return obj


# --------------------------------------------------------------------------- geometria

def superellipse_radius(d: Vector) -> float:
    """Raio ao longo da direção d para a superelipse com expoentes diferentes em cima/baixo."""
    a, b = S.WIDTH / 2, S.DEPTH / 2
    c = S.HEIGHT / 2
    nz = S.EXP_TOP if d.z >= 0 else S.EXP_BOTTOM
    n = S.EXP_SIDE
    # mistura simples: expoente lateral para x/y e vertical para z
    val = (abs(d.x) / a) ** n + (abs(d.y) / b) ** n
    val = val ** (nz / n) + (abs(d.z) / c) ** nz
    return val ** (-1.0 / nz)


def build_body(col):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=S.SUBDIV, use_grid_fill=True)
    for v in bm.verts:
        d = v.co.normalized()
        r = superellipse_radius(d)
        p = d * r
        # leve assimetria: topo um pouco para trás (silhueta macia, não simétrica perfeita)
        p.y += 0.015 * max(0.0, p.z / (S.HEIGHT / 2))
        v.co = p
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    # origem na base central
    zmin = min(v.co.z for v in bm.verts)
    for v in bm.verts:
        v.co.z -= zmin
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return mesh_object("Body", bm, col, ["M_Body"])


def surface_point(body, x, z):
    """Ponto na frente do corpo (lado -Y) por raycast ao longo de +Y."""
    origin = Vector((x, -S.DEPTH * 2, z))
    hit, loc, normal, _ = body.ray_cast(origin, Vector((0, 1, 0)))
    if not hit:
        raise RuntimeError(f"raycast falhou em x={x} z={z}")
    return loc, normal


def disc(bm, center, normal, rx, rz, thickness, segments=24, lift=0.0015):
    """Disco elíptico fino assentado na superfície (lente), voltado para a normal."""
    rot = normal.to_track_quat("-Y", "Z").to_matrix().to_4x4()
    m = Matrix.Translation(center + normal * lift) @ rot
    ring_front, ring_back = [], []
    for i in range(segments):
        t = 2 * math.pi * i / segments
        x, z = rx * math.cos(t), rz * math.sin(t)
        ring_front.append(bm.verts.new(m @ Vector((x, -thickness, z))))
        ring_back.append(bm.verts.new(m @ Vector((x * 0.96, thickness * 0.5, z * 0.96))))
    cf = bm.verts.new(m @ Vector((0, -thickness * 1.6, 0)))
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new((cf, ring_front[i], ring_front[j]))
        bm.faces.new((ring_front[i], ring_back[i], ring_back[j], ring_front[j]))
    bm.faces.new(list(reversed(ring_back)))
    return ring_front + ring_back + [cf]


def build_face(body, col):
    # Olhos (uma malha, dois olhos) — escuros, ovais, baixos.
    bm = bmesh.new()
    sides = {}
    for side, sx in (("L", 1), ("R", -1)):
        # Personagem olha para -Y; o olho esquerdo do personagem fica em +X.
        loc, nrm = surface_point(body, sx * S.EYE_X, S.EYE_Z)
        sides[side] = (loc, nrm, disc(bm, loc, nrm, S.EYE_RX, S.EYE_RZ, 0.006))
    bm.verts.ensure_lookup_table()
    eyes = mesh_object("Eyes", bm, col, ["M_Eyes"])

    # Bochechas — discretas, levemente acima da superfície (evita z-fighting).
    bm = bmesh.new()
    for sx in (1, -1):
        loc, nrm = surface_point(body, sx * S.CHEEK_X, S.CHEEK_Z)
        disc(bm, loc, nrm, S.CHEEK_RX, S.CHEEK_RZ, 0.001, segments=20, lift=0.0025)
    cheeks = mesh_object("Cheeks", bm, col, ["M_Cheek"])

    # Tracinho de absorção no alto da face frontal. Não é boca.
    # Cápsula fina com tampa frontal um pouco acima da superfície: uma tampa só por trás
    # ficaria dentro do corpo e o tracinho sumiria nos posters.
    bm = bmesh.new()
    loc, nrm = surface_point(body, 0.0, S.SLOT_Z)
    rot = nrm.to_track_quat("-Y", "Z").to_matrix().to_4x4()
    m = Matrix.Translation(loc + nrm * 0.0012) @ rot
    pts = []
    seg = 10
    r = S.SLOT_HALF_H
    for cx, a0 in ((S.SLOT_HALF_W - r, -90), (-(S.SLOT_HALF_W - r), 90)):
        for i in range(seg + 1):
            t = math.radians(a0 + 180 * i / seg)
            pts.append((cx + r * math.cos(t), r * math.sin(t)))
    front = [bm.verts.new(m @ Vector((x, -0.0015, z))) for x, z in pts]
    back = [bm.verts.new(m @ Vector((x * 1.04, 0.004, z * 1.1))) for x, z in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    slot = mesh_object("Slot", bm, col, ["M_Slot"])
    return eyes, cheeks, slot, sides


def add_eye_shape_keys(eyes, sides):
    eyes.shape_key_add(name="Basis", from_mix=False)
    base = [v.co.copy() for v in eyes.data.vertices]
    # vértices por lado: os primeiros N são do olho L, os seguintes do R (ordem de criação)
    per = len(base) // 2
    groups = {"L": range(0, per), "R": range(per, 2 * per)}
    centers = {k: sides[k][0] for k in sides}

    def key(name, side, fn):
        sk = eyes.shape_key_add(name=f"{name}_{side}", from_mix=False)
        c = centers[side]
        for i in groups[side]:
            p = base[i] - c
            sk.data[i].co = c + fn(p)

    for side in ("L", "R"):
        key("Blink", side, lambda p: Vector((p.x, p.y, p.z * 0.08 - S.EYE_RZ * 0.25)))
        key("Squint", side, lambda p: Vector((p.x, p.y, p.z * 0.55 - S.EYE_RZ * 0.12)))
        key("Surprise", side, lambda p: Vector((p.x * 1.12, p.y, p.z * 1.15)))
        # Arco "feliz" (∩) e "dormindo" (‿): achata e curva. Sem boca, só olhos.
        key("Happy", side, lambda p: Vector((p.x, p.y, p.z * 0.22 + S.EYE_RZ * 0.55 * (1 - (p.x / S.EYE_RX) ** 2) - S.EYE_RZ * 0.2)))
        key("Sleep", side, lambda p: Vector((p.x, p.y, p.z * 0.18 - S.EYE_RZ * 0.45 * (1 - (p.x / S.EYE_RX) ** 2))))


def add_body_shape_keys(body):
    body.shape_key_add(name="Basis", from_mix=False)
    sq = body.shape_key_add(name="Body_Squash", from_mix=False)
    for v, k in zip(body.data.vertices, sq.data):
        k.co = Vector((v.co.x * 1.06, v.co.y * 1.06, v.co.z * 0.91))
    ab = body.shape_key_add(name="Absorb_Receive", from_mix=False)
    # Depressão temporária ao redor do tracinho (recebimento visual do arquivo).
    for v, k in zip(body.data.vertices, ab.data):
        d = (Vector((v.co.x, v.co.y, v.co.z)) - Vector((0, -S.DEPTH / 2, S.SLOT_Z))).length
        fall = max(0.0, 1.0 - d / 0.16)
        k.co = v.co + Vector((0, 0.02 * fall * fall, 0))


# --------------------------------------------------------------------------- rig e sockets

def build_rig(col, body, eyes, cheeks, slot):
    arm = bpy.data.armatures.new("Rig_Dot")
    rig = bpy.data.objects.new("Rig_Dot", arm)
    col.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    root = arm.edit_bones.new("Root")
    root.head, root.tail = (0, 0, 0), (0, 0.15, 0)
    bodyb = arm.edit_bones.new("Body")
    bodyb.head, bodyb.tail = (0, 0, 0), (0, 0, S.HEIGHT * 0.5)
    bodyb.parent = root
    face = arm.edit_bones.new("FaceAim")
    face.head, face.tail = (0, 0, S.EYE_Z), (0, -0.12, S.EYE_Z)
    face.parent = bodyb
    for b in (root, bodyb, face):
        b.use_deform = b.name != "Root"
    bpy.ops.object.mode_set(mode="OBJECT")

    def skin(obj, bone):
        vg = obj.vertex_groups.new(name=bone)
        vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = rig
        obj.parent = rig

    skin(body, "Body")
    skin(slot, "Body")
    skin(eyes, "FaceAim")
    skin(cheeks, "FaceAim")
    return rig


def socket(name, rig, bone, world, col):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = "PLAIN_AXES"
    e.empty_display_size = 0.08
    col.objects.link(e)
    e.parent = rig
    e.parent_type = "BONE"
    e.parent_bone = bone
    bpy.context.view_layer.update()
    e.matrix_world = Matrix.Translation(world)
    return e


# --------------------------------------------------------------------------- acessórios e efeitos

def build_mail_cap():
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=8, radius=0.2)
    for v in bm.verts:
        v.co.z = max(0.0, v.co.z) * 0.45
        v.co.x *= 1.0
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    visor = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.17, radius2=0.17, depth=0.012)
    for v in visor["verts"]:
        v.co.y = v.co.y * 0.55 - 0.16
        v.co.z += 0.01
    return bm


def torus(bm, center, R, r, seg=24, minor=6, plane="XZ"):
    rings = []
    for i in range(seg):
        t = 2 * math.pi * i / seg
        ring = []
        for j in range(minor):
            s_ = 2 * math.pi * j / minor
            a = (R + r * math.cos(s_)) * math.cos(t)
            b = (R + r * math.cos(s_)) * math.sin(t)
            c = r * math.sin(s_)
            co = Vector((a, c, b)) if plane == "XZ" else Vector((a, b, c))
            ring.append(bm.verts.new(center + co))
        rings.append(ring)
    for i in range(seg):
        A, B = rings[i], rings[(i + 1) % seg]
        for j in range(minor):
            k = (j + 1) % minor
            bm.faces.new((A[j], A[k], B[k], B[j]))


def box(bm, center, half):
    res = bmesh.ops.create_cube(bm, size=1.0)
    for v in res["verts"]:
        v.co = Vector((center.x + v.co.x * 2 * half.x, center.y + v.co.y * 2 * half.y, center.z + v.co.z * 2 * half.z))


def build_glasses():
    """Armação fina, sem lente (modo econômico). Origem = Socket_Face (centro dos olhos, à frente)."""
    bm = bmesh.new()
    R = S.EYE_RX * 1.75
    for sx in (1, -1):
        torus(bm, Vector((sx * S.EYE_X, -0.004, 0.0)), R, 0.0055, seg=24, minor=6, plane="XZ")
        # haste lateral indo para trás
        box(bm, Vector((sx * (S.EYE_X + R + 0.01), 0.12, 0.01)), Vector((0.005, 0.13, 0.005)))
    box(bm, Vector((0.0, -0.004, 0.012)), Vector((S.EYE_X - R, 0.005, 0.005)))
    return bm


def build_headphones():
    bm = bmesh.new()
    seg = 24
    R = S.WIDTH * 0.53
    prev = None
    for i in range(seg + 1):
        t = math.pi * i / seg
        c = Vector((R * math.cos(t), 0.0, R * math.sin(t) * 0.85))
        ring = bmesh.ops.create_circle(bm, cap_ends=False, segments=6, radius=0.022)["verts"]
        rot = Vector((math.cos(t), 0, math.sin(t))).to_track_quat("Z", "Y").to_matrix()
        for v in ring:
            v.co = c + rot @ Vector((v.co.x, v.co.y, 0))
        if prev:
            for a in range(6):
                b = (a + 1) % 6
                bm.faces.new((prev[a], prev[b], ring[b], ring[a]))
        prev = ring
    for sx in (1, -1):
        cup = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.08, radius2=0.08, depth=0.07)
        for v in cup["verts"]:
            v.co = Vector((v.co.z + sx * (R + 0.01), v.co.y, v.co.x * 1.4))
    return bm


def build_heart():
    bm = bmesh.new()
    pts = []
    for i in range(28):
        t = 2 * math.pi * i / 28
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x / 17 * 0.06, z / 17 * 0.06))
    front = [bm.verts.new((x, -0.012, z)) for x, z in pts]
    back = [bm.verts.new((x, 0.012, z)) for x, z in pts]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[j], front[i], back[i], back[j]))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    return bm


def build_ring():
    bm = bmesh.new()
    torus(bm, Vector((0, 0, 0)), 0.34, 0.012, seg=32, minor=6, plane="XY")
    return bm


# --------------------------------------------------------------------------- animação

def key_bone(rig, bone, frame, loc=None, rot=None, scale=None):
    pb = rig.pose.bones[bone]
    pb.rotation_mode = "XYZ"
    if loc is not None:
        pb.location = loc
        pb.keyframe_insert("location", frame=frame)
    if rot is not None:
        pb.rotation_euler = [math.radians(a) for a in rot]
        pb.keyframe_insert("rotation_euler", frame=frame)
    if scale is not None:
        pb.scale = scale
        pb.keyframe_insert("scale", frame=frame)


def reset_pose(rig):
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)
        pb.scale = (1, 1, 1)


def new_action(id_owner, name):
    id_owner.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    id_owner.animation_data.action = act
    return act


def push_nla(id_owner, act):
    track = id_owner.animation_data.nla_tracks.new()
    track.name = act.name
    track.strips.new(act.name, 1, act)
    track.mute = True
    id_owner.animation_data.action = None


def body_clips(rig):
    B = "Body"
    F = "FaceAim"
    one = (1, 1, 1)
    clips = {
        "body_idle_breathe": [(1, {}, one), (70, {}, (0.995, 0.995, 1.01)), (138, {}, one)],
        "body_think": [(1, {"rot": (0, 0, 0)}, one), (42, {"rot": (0, 3, 0), "face": (4, 0, 2)}, one), (84, {"rot": (0, 0, 0), "face": (0, 0, 0)}, one)],
        "body_work": [(1, {"rot": (-2, 0, 0)}, one), (40, {"rot": (-2, 0, 0)}, (1.0, 1.0, 1.006)), (81, {"rot": (-2, 0, 0)}, one)],
        "body_wait_ok": [(1, {}, one), (2, {}, one)],
        "body_success": [(1, {"loc": (0, 0, 0)}, one), (10, {"loc": (0, 0, 0.04)}, (0.99, 0.99, 1.02)), (27, {"loc": (0, 0, 0)}, one)],
        "body_error": [(1, {}, one), (15, {"face": (-5, 0, 0)}, (1.02, 1.02, 0.96))],
        "body_sleep_enter": [(1, {}, one), (24, {}, (1.01, 1.01, 0.98))],
        "body_sleep_idle": [(1, {}, (1.01, 1.01, 0.98)), (90, {}, (1.012, 1.012, 0.985)), (180, {}, (1.01, 1.01, 0.98))],
        "body_wake": [(1, {}, (1.01, 1.01, 0.98)), (18, {}, one)],
        "body_touch_squash": [(1, {}, one), (6, {}, (1.06, 1.06, 0.91)), (12, {}, (0.98, 0.98, 1.04)), (18, {}, one)],
        "body_surprised": [(1, {"rot": (0, 0, 0)}, one), (6, {"rot": (4, 0, 0)}, (0.99, 0.99, 1.03)), (15, {"rot": (2, 0, 0)}, one)],
        "body_absorb_receive": [(1, {"face": (0, 0, 0)}, one), (6, {"face": (6, 0, 0)}, one), (15, {"face": (6, 0, 0)}, (1.01, 1.01, 0.97)), (24, {}, (0.995, 0.995, 1.01)), (30, {"face": (0, 0, 0)}, one)],
    }
    for name, keys in clips.items():
        reset_pose(rig)
        new_action(rig, name)
        for frame, extra, scale in keys:
            key_bone(rig, B, frame, loc=extra.get("loc", (0, 0, 0)), rot=extra.get("rot", (0, 0, 0)), scale=scale)
            key_bone(rig, F, frame, rot=extra.get("face", (0, 0, 0)))
        push_nla(rig, bpy.data.actions[name])
    reset_pose(rig)


def face_clips(eyes):
    key = eyes.data.shape_keys
    names = [kb.name for kb in key.key_blocks]

    def setk(frame, values):
        for kb in key.key_blocks[1:]:
            kb.value = values.get(kb.name, 0.0)
            kb.keyframe_insert("value", frame=frame)

    both = lambda base, v: {f"{base}_L": v, f"{base}_R": v}  # noqa: E731
    clips = {
        "face_blink": [(1, {}), (3, both("Blink", 1.0)), (5, {})],
        "face_wink": [(1, {}), (5, {"Blink_L": 1.0}), (9, {"Blink_L": 1.0}), (12, {})],
        "face_happy": [(1, {}), (6, both("Happy", 1.0)), (27, both("Happy", 1.0))],
        "face_sleep": [(1, {}), (24, both("Sleep", 1.0))],
        "face_wake": [(1, both("Sleep", 1.0)), (18, {})],
        "face_squint": [(1, {}), (15, both("Squint", 0.6))],
        "face_surprised": [(1, {}), (5, both("Surprise", 1.0)), (15, both("Surprise", 0.3))],
    }
    for name, frames in clips.items():
        new_action(key, name)
        for frame, vals in frames:
            setk(frame, vals)
        push_nla(key, bpy.data.actions[name])
    for kb in key.key_blocks[1:]:
        kb.value = 0.0
    return names


# --------------------------------------------------------------------------- exportação

def export_glb(path, objects, animations=True):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if sorted(o.name for o in bpy.context.selected_objects) != sorted(o.name for o in objects):
        raise RuntimeError(f"seleção para {os.path.basename(path)} difere do pedido")
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    wanted = {
        "filepath": path,
        "export_format": "GLB",
        "use_selection": True,
        "export_apply": False,
        "export_yup": True,
        "export_texcoords": False,
        "export_normals": True,
        "export_materials": "EXPORT",
        "export_extras": True,
        "export_cameras": False,
        "export_lights": False,
        "export_animations": animations,
        "export_animation_mode": "ACTIONS",
        "export_merge_animation": "ACTION",
        "export_force_sampling": True,
        "export_frame_range": False,
        "export_def_bones": True,
        "export_morph": True,
        "export_morph_normal": False,
        "export_morph_tangent": False,
        "export_skins": True,
        "export_all_influences": False,
        "export_image_format": "NONE",
    }
    use = {k: v for k, v in wanted.items() if k in props}
    skipped = sorted(set(wanted) - set(use))
    if skipped:
        warn(f"opções do exportador indisponíveis nesta versão: {', '.join(skipped)}")
    bpy.ops.export_scene.gltf(**use)
    REPORT["exports"][os.path.basename(path)] = {"bytes": os.path.getsize(path), "options": sorted(use)}


def export_standalone(name, bm_builder, mat_name, col):
    """Exporta uma peça na origem (coordenadas locais do socket), só ela e sem animações.
    Em --background não há window para trocar de cena, por isso a peça nasce na cena principal."""
    obj = mesh_object(name, bm_builder(), col, [mat_name])
    path = os.path.join(OUT, f"{'fx' if name in S.FX else 'prop'}-{name}.glb")
    export_glb(path, [obj], animations=False)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    REPORT["objects"][name] = {"tris": tris}
    return obj


# --------------------------------------------------------------------------- render de conferência

def setup_preview(col_preview, target_z):
    scene = bpy.context.scene
    # Cycles na CPU: o EEVEE depende da GPU (Metal) e travou em segundo plano com a tela do Mac bloqueada.
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    REPORT["render_engine"] = f"{scene.render.engine} (CPU, {scene.cycles.samples} amostras)"
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Standard"  # fixado por versão; comparar com o runtime
    world = bpy.data.worlds.new("Preview")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.02, 0.025, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    scene.world = world
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 85
    cam = bpy.data.objects.new("Cam", cam_data)
    col_preview.objects.link(cam)
    scene.camera = cam
    for name, (loc, energy, size) in {"Key": ((-1.6, -2.0, 2.4), 260, 2.0), "Fill": ((2.0, -1.5, 1.0), 60, 3.0), "FillSide": ((-2.6, 0.6, 1.2), 70, 3.0), "Rim": ((0.5, 2.2, 1.8), 120, 1.0)}.items():
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy = energy
        ld.size = size
        lo = bpy.data.objects.new(name, ld)
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, target_z)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        col_preview.objects.link(lo)
    return cam


def render_views(cam, target_z):
    scene = bpy.context.scene
    views = {"frente": 0, "tres-quartos": -35, "lado": -90}
    for label, yaw in views.items():
        t = math.radians(yaw)
        dist = 4.2
        cam.location = (dist * math.sin(t), -dist * math.cos(t), target_z + 0.25)
        cam.rotation_euler = (Vector((0, 0, target_z)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.resolution_x = scene.render.resolution_y = 512
        path = os.path.join(OUT, f"poster-{label}-512.png")
        scene.render.filepath = path
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        REPORT["renders"].append({"file": os.path.basename(path), "seconds": round(time.time() - t0, 1)})
    # Legibilidade em tamanhos pequenos: reduz o poster de frente (mesma imagem, sem novo render).
    for px in (160, 64, 32):
        img = bpy.data.images.load(os.path.join(OUT, "poster-frente-512.png"), check_existing=False)
        img.scale(px, px)
        small = os.path.join(OUT, f"poster-frente-{px}.png")
        img.filepath_raw = small
        img.file_format = "PNG"
        img.save()
        bpy.data.images.remove(img)
        REPORT["renders"].append({"file": os.path.basename(small), "seconds": 0})


# --------------------------------------------------------------------------- principal

def main():
    reset_scene()
    c_src = collection("DOT_SOURCE")
    c_exp = collection("DOT_EXPORT")
    c_att = collection("DOT_ATTACHMENTS")
    c_props = collection("DOT_PROPS")
    c_fx = collection("DOT_FX")
    c_prev = collection("DOT_PREVIEW")
    c_src.hide_render = True

    root = bpy.data.objects.new("Root_Dot", None)
    c_exp.objects.link(root)
    body = build_body(c_exp)
    eyes, cheeks, slot, sides = build_face(body, c_exp)
    add_eye_shape_keys(eyes, sides)
    add_body_shape_keys(body)
    rig = build_rig(c_exp, body, eyes, cheeks, slot)
    rig.parent = root

    front_y = -S.DEPTH / 2
    sockets = [
        socket("Socket_Head", rig, "Body", Vector((0, 0.02, S.HEIGHT - 0.01)), c_att),
        socket("Socket_Face", rig, "FaceAim", Vector((0, front_y - 0.01, S.EYE_Z)), c_att),
        socket("Socket_Sides", rig, "Body", Vector((0, 0, S.HEIGHT * 0.55)), c_att),
        socket("Socket_FX", rig, "Body", Vector((0.32, 0, S.HEIGHT * 0.95)), c_att),
    ]

    body_clips(rig)
    face_names = face_clips(eyes)
    REPORT["eye_shape_keys"] = face_names
    REPORT["body_shape_keys"] = [kb.name for kb in body.data.shape_keys.key_blocks]
    for o in (body, eyes, cheeks, slot):
        REPORT["objects"][o.name] = {"tris": sum(len(p.vertices) - 2 for p in o.data.polygons), "verts": len(o.data.vertices)}

    # Prévia dos acessórios no .blend (instâncias presas aos sockets; desativadas por padrão).
    blend_path = os.path.join(OUT, "dot_master.blend")
    export_glb(os.path.join(OUT, "dot-base.glb"), [root, rig, body, eyes, cheeks, slot, *sockets])

    pieces = []
    for name, spec in S.PROPS.items():
        builder = {"Prop_MailCap": build_mail_cap, "Prop_Glasses": build_glasses, "Prop_Headphones": build_headphones}[name]
        pieces.append(export_standalone(name, builder, spec["material"], c_props))
    for name, mat in S.FX.items():
        builder = {"Heart_Source": build_heart, "Ring_Source": build_ring}[name]
        pieces.append(export_standalone(name, builder, mat, c_fx))

    # Prévias desligadas no .blend: acessórios presos aos sockets; nada aparece nos posters.
    for o in pieces:
        anchor = S.PROPS.get(o.name, {}).get("anchor")
        if anchor:
            o.parent = bpy.data.objects[anchor]
        o.hide_render = True
        o.hide_viewport = True

    try:
        cam = setup_preview(c_prev, S.HEIGHT * 0.45)
        render_views(cam, S.HEIGHT * 0.45)
    except Exception as e:  # render é conferência; não bloqueia a exportação
        warn(f"render de conferência falhou: {e}")

    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
    REPORT["blend"] = os.path.basename(blend_path)
    REPORT["finished"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    REPORT["ok"] = True


if __name__ == "__main__":
    try:
        main()
    except Exception:
        REPORT["ok"] = False
        REPORT["error"] = traceback.format_exc()
        raise
    finally:
        with open(os.path.join(OUT, "build-report.json"), "w", encoding="utf-8") as f:
            json.dump(REPORT, f, ensure_ascii=False, indent=2)
