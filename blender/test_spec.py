"""Testes do que roda sem Blender: conversão de cor e validador de GLB (com GLB sintético)."""
import json
import os
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dot_spec as S  # noqa: E402
import validate_glb as V  # noqa: E402


def make_glb(path, nodes, animations, eye_morphs, tris=100, skins=1, uri=None):
    # Buffer mínimo: um acessor de índices com tris*3 elementos.
    gltf = {
        "asset": {"version": "2.0", "generator": "teste"},
        "nodes": [{"name": n} for n in nodes],
        "meshes": [],
        "accessors": [{"componentType": 5125, "count": tris * 3, "type": "SCALAR"}, {"componentType": 5126, "count": 10, "type": "VEC3"}],
        "animations": [{"name": a, "channels": [], "samplers": []} for a in animations],
        "materials": [{"name": "M_Body"}],
        "skins": [{"joints": [0]}] * skins,
        "buffers": [{"byteLength": 4, **({"uri": uri} if uri else {})}],
    }
    for i, n in enumerate(gltf["nodes"]):
        if n["name"] in ("Body", "Eyes"):
            gltf["meshes"].append({"name": n["name"], "primitives": [{"attributes": {"POSITION": 1}, "indices": 0}], "extras": {"targetNames": eye_morphs if n["name"] == "Eyes" else []}})
            n["mesh"] = len(gltf["meshes"]) - 1
    js = json.dumps(gltf).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    binc = b"\0\0\0\0"
    total = 12 + 8 + len(js) + 8 + len(binc)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(binc), 0x004E4942) + binc)


class SpecTests(unittest.TestCase):
    def test_srgb_to_linear(self):
        self.assertAlmostEqual(S.srgb_to_linear(0.0), 0.0)
        self.assertAlmostEqual(S.srgb_to_linear(1.0), 1.0)
        self.assertAlmostEqual(S.srgb_to_linear(0.5), 0.21404, places=4)
        r, g, b, a = S.hex_to_linear_rgba("#F3EDE2")
        self.assertTrue(0.89 < r < 0.90 and a == 1.0)

    def test_estado_mapeia_para_clipes_existentes(self):
        for st, m in S.STATE_MAP.items():
            self.assertIn(m["body"], S.BODY_CLIPS, st)
            if m["face"]:
                self.assertIn(m["face"], S.FACE_CLIPS, st)

    def test_validador_aceita_base_completa_e_aponta_metas(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "dot-base.glb")
            make_glb(p, S.REQUIRED_NODES, list(S.BODY_CLIPS) + list(S.FACE_CLIPS), S.EYE_MORPHS, tris=3000)
            e, w, tris = V.check_base(V.inspect(p))
            self.assertEqual(e, [])
            self.assertEqual(tris, 6000)  # Body + Eyes com o mesmo acessor de teste

    def test_validador_recusa_clipe_ausente_boca_e_uri_externa(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "dot-base.glb")
            make_glb(p, S.REQUIRED_NODES + ["Mouth"], ["body_idle_breathe"], S.EYE_MORPHS[:2], uri="dados.bin")
            e, _, _ = V.check_base(V.inspect(p))
            joined = " | ".join(e)
            self.assertIn("clipes ausentes", joined)
            self.assertIn("morphs dos olhos ausentes", joined)
            self.assertIn("nó proibido", joined)
            self.assertIn("recursos externos", joined)

    def test_glb_invalido(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "x.glb")
            open(p, "wb").write(b"not a glb at all")
            with self.assertRaises(ValueError):
                V.read_glb(p)


if __name__ == "__main__":
    unittest.main()
