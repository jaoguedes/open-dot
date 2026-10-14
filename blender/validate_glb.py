"""
Validação estrutural dos GLB do Dot, em Python puro (sem Blender, sem dependências).
Confere contra o contrato de dot_spec.py: nós, clipes, morphs, triângulos, materiais,
tamanho e ausência de recursos externos. Também gera o manifesto com hashes.

Não substitui o Khronos glTF Validator (B05): rode-o também quando disponível
(npx gltf-validator <arquivo>) — o relatório indica se foi executado.

Uso: python3 blender/validate_glb.py <pasta-de-saida> [--publish assets/dot]
"""
import hashlib
import json
import os
import shutil
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dot_spec as S  # noqa: E402

COMPONENTS = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise ValueError("não é GLB (magic inválido)")
    if version != 2:
        raise ValueError(f"glTF versão {version} não suportada")
    if length != len(data):
        raise ValueError("tamanho declarado difere do arquivo")
    off = 12
    gltf, binlen = None, 0
    while off < len(data):
        clen, ctype = struct.unpack_from("<II", data, off)
        chunk = data[off + 8 : off + 8 + clen]
        if ctype == 0x4E4F534A:
            gltf = json.loads(chunk.decode("utf-8"))
        elif ctype == 0x004E4942:
            binlen = clen
        off += 8 + clen
    if gltf is None:
        raise ValueError("GLB sem chunk JSON")
    return gltf, binlen, len(data)


def triangles(gltf, mesh):
    total = 0
    for prim in mesh.get("primitives", []):
        mode = prim.get("mode", 4)
        if "indices" in prim:
            n = gltf["accessors"][prim["indices"]]["count"]
        else:
            n = gltf["accessors"][prim["attributes"]["POSITION"]]["count"]
        total += n // 3 if mode == 4 else 0
    return total


def inspect(path):
    gltf, binlen, size = read_glb(path)
    nodes = [n.get("name", "") for n in gltf.get("nodes", [])]
    anims = [a.get("name", "") for a in gltf.get("animations", [])]
    meshes = {}
    for n in gltf.get("nodes", []):
        if "mesh" in n:
            m = gltf["meshes"][n["mesh"]]
            meshes[n.get("name", m.get("name", "?"))] = {
                "tris": triangles(gltf, m),
                "morphs": (m.get("extras") or {}).get("targetNames", []),
            }
    external = [b.get("uri") for b in gltf.get("buffers", []) if b.get("uri")] + [i.get("uri") for i in gltf.get("images", []) if i.get("uri")]
    return {
        "file": os.path.basename(path),
        "bytes": size,
        "nodes": nodes,
        "animations": anims,
        "meshes": meshes,
        "materials": [m.get("name", "") for m in gltf.get("materials", [])],
        "textures": len(gltf.get("textures", [])),
        "external_uris": external,
        "skins": len(gltf.get("skins", [])),
        "extensionsRequired": gltf.get("extensionsRequired", []),
        "generator": gltf.get("asset", {}).get("generator"),
    }


def check_base(info):
    errors, warnings = [], []
    for n in S.REQUIRED_NODES:
        if n not in info["nodes"]:
            errors.append(f"nó obrigatório ausente: {n}")
    expected = set(S.BODY_CLIPS) | set(S.FACE_CLIPS)
    got = set(info["animations"])
    missing = sorted(expected - got)
    extra = sorted(got - expected)
    if missing:
        errors.append(f"clipes ausentes: {', '.join(missing)}")
    if extra:
        warnings.append(f"clipes não previstos no manifesto: {', '.join(extra)}")
    eyes = info["meshes"].get("Eyes")
    if not eyes:
        errors.append("malha Eyes ausente")
    else:
        miss = [m for m in S.EYE_MORPHS if m not in eyes["morphs"]]
        if miss:
            errors.append(f"morphs dos olhos ausentes: {', '.join(miss)}")
    tris = sum(m["tris"] for m in info["meshes"].values())
    if tris > S.BUDGET["base_tris_max"]:
        warnings.append(f"base com {tris} triângulos (meta ≤ {S.BUDGET['base_tris_max']})")
    if len(info["materials"]) > S.BUDGET["materials_max"]:
        warnings.append(f"{len(info['materials'])} materiais (meta ≤ {S.BUDGET['materials_max']})")
    kb = info["bytes"] / 1024
    if kb > S.BUDGET["base_glb_kb_target"]:
        warnings.append(f"GLB base com {kb:.0f} KB (meta {S.BUDGET['base_glb_kb_target']} KB — rever morphs/clipes antes de comprimir)")
    if info["external_uris"]:
        errors.append(f"recursos externos: {info['external_uris']}")
    if info["textures"]:
        warnings.append("texturas presentes (o plano inicial evita texturas)")
    if info["skins"] < 1:
        errors.append("GLB sem skin (rig não exportado)")
    # Regra do personagem: nenhum nó de boca/sobrancelha.
    for n in info["nodes"]:
        if any(w in n.lower() for w in ("mouth", "boca", "brow", "sobrancelha")):
            errors.append(f"nó proibido pelo design: {n}")
    return errors, warnings, tris


def check_piece(info, limit, name=None):
    errors, warnings = [], []
    leaked = sorted(set(info["nodes"]) & set(S.REQUIRED_NODES))
    if leaked:
        errors.append(f"{info['file']}: peça contém nós do corpo ({', '.join(leaked)})")
    if info["animations"]:
        errors.append(f"{info['file']}: peça contém {len(info['animations'])} animações (devem ficar só no GLB base)")
    if name and set(info["meshes"]) != {name}:
        errors.append(f"{info['file']}: esperado só a malha {name}, encontrado {sorted(info['meshes'])}")
    tris = sum(m["tris"] for m in info["meshes"].values())
    if tris > limit:
        warnings.append(f"{info['file']}: {tris} triângulos (meta ≤ {limit})")
    if info["external_uris"]:
        errors.append(f"{info['file']}: recursos externos")
    if not info["meshes"]:
        errors.append(f"{info['file']}: sem malha")
    return errors, warnings, tris


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def run(out_dir, publish=None, khronos_ran=False):
    report = {"out": out_dir, "errors": [], "warnings": [], "files": {}, "khronos_validator": "executado" if khronos_ran else "não executado"}
    base = os.path.join(out_dir, "dot-base.glb")
    if not os.path.exists(base):
        report["errors"].append("dot-base.glb não encontrado")
        return report
    info = inspect(base)
    e, w, tris = check_base(info)
    report["errors"] += e
    report["warnings"] += w
    report["files"]["dot-base.glb"] = {**info, "tris_total": tris}
    for name in list(S.PROPS) + list(S.FX):
        fname = f"{'fx' if name in S.FX else 'prop'}-{name}.glb"
        p = os.path.join(out_dir, fname)
        if not os.path.exists(p):
            report["errors"].append(f"{fname} não encontrado")
            continue
        pi = inspect(p)
        limit = S.BUDGET["heart_tris_max"] if name == "Heart_Source" else S.BUDGET["prop_tris_max"]
        e, w, t = check_piece(pi, limit, name)
        report["errors"] += e
        report["warnings"] += w
        report["files"][fname] = {**pi, "tris_total": t}
    report["ok"] = not report["errors"]

    if publish and report["ok"]:
        os.makedirs(publish, exist_ok=True)
        manifest = {
            "assetVersion": "dot-0.1.0",
            "convention": {"units": "1 = largura do corpo", "up": "Y (glTF)", "forward": "+Z (glTF; -Y no Blender)"},
            "base": None,
            "root": "Root_Dot",
            "requiredNodes": S.REQUIRED_NODES,
            "morphs": {"Eyes": S.EYE_MORPHS, "Body": S.BODY_MORPHS},
            "clips": {"body": sorted(S.BODY_CLIPS), "face": sorted(S.FACE_CLIPS)},
            "states": S.STATE_MAP,
            "props": {},
            "fx": {},
            "limits": {"fps": S.FPS, "maxHearts": 6, "maxDpr": 1.5, "gazeYawDeg": S.GAZE_MAX_YAW, "gazePitchDeg": S.GAZE_MAX_PITCH},
            "validation": {"structural": "ok", "khronos": report["khronos_validator"], "runtime": "pendente"},
        }
        for fname in report["files"]:
            src = os.path.join(out_dir, fname)
            digest = sha(src)[:10]
            stem = fname[:-4]
            dst_name = f"{stem}.{digest}.glb"
            shutil.copyfile(src, os.path.join(publish, dst_name))
            if fname == "dot-base.glb":
                manifest["base"] = dst_name
            elif fname.startswith("prop-"):
                key = stem.replace("prop-", "")
                manifest["props"][key] = {"file": dst_name, "anchor": S.PROPS[key]["anchor"]}
            else:
                manifest["fx"][stem.replace("fx-", "")] = {"file": dst_name}
        published = {manifest["base"], *(p["file"] for p in manifest["props"].values()), *(p["file"] for p in manifest["fx"].values())}
        for old in os.listdir(publish):
            # Só GLB com o padrão de nome do próprio pipeline (<peça>.<hash10>.glb).
            if old.endswith(".glb") and old not in published and len(old.split(".")) == 3 and len(old.split(".")[1]) == 10:
                os.remove(os.path.join(publish, old))
        for png in sorted(f for f in os.listdir(out_dir) if f.startswith("poster-") and f.endswith(".png")):
            shutil.copyfile(os.path.join(out_dir, png), os.path.join(publish, png))
        with open(os.path.join(publish, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
        report["published"] = publish
    return report


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    pub = None
    if "--publish" in sys.argv:
        pub = sys.argv[sys.argv.index("--publish") + 1]
    rep = run(sys.argv[1], pub, khronos_ran="--khronos-ok" in sys.argv)
    with open(os.path.join(sys.argv[1], "validate-report.json"), "w", encoding="utf-8") as f:
        json.dump(rep, f, ensure_ascii=False, indent=2)
    for e in rep["errors"]:
        print("ERRO:", e)
    for w in rep["warnings"]:
        print("AVISO:", w)
    print("OK" if rep.get("ok") else "FALHOU")
    sys.exit(0 if rep.get("ok") else 1)
