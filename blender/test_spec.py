# SPDX-License-Identifier: LicenseRef-OpenDot-Mascot-All-Rights-Reserved
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


def make_glb(path, nodes, animations, eye_morphs, tris=100, skins=1, uri=None, mesh_nodes=("Body", "Eyes")):
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
        if n["name"] in mesh_nodes:
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

    def test_peca_com_corpo_ou_clipes_vazados_e_recusada(self):
        # Regressão: em --background o exportador levava a cena inteira para cada acessório.
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "prop-Prop_Glasses.glb")
            make_glb(p, ["Prop_Glasses"] + S.REQUIRED_NODES, ["body_idle_breathe"], [])
            e, _, _ = V.check_piece(V.inspect(p), 1000, "Prop_Glasses")
            joined = " | ".join(e)
            self.assertIn("nós do corpo", joined)
            self.assertIn("animações", joined)
            self.assertIn("esperado só a malha", joined)

    def test_publicacao_remove_glb_antigo_do_pipeline_e_preserva_o_resto(self):
        with tempfile.TemporaryDirectory() as out, tempfile.TemporaryDirectory() as pub:
            make_glb(os.path.join(out, "dot-base.glb"), S.REQUIRED_NODES, list(S.BODY_CLIPS) + list(S.FACE_CLIPS), S.EYE_MORPHS)
            for name in list(S.PROPS) + list(S.FX):
                make_glb(os.path.join(out, f"{'fx' if name in S.FX else 'prop'}-{name}.glb"), [name], [], [], skins=0, mesh_nodes=(name,))
            for keep in ("README.md", "meu-modelo.glb"):
                with open(os.path.join(pub, keep), "w") as f:
                    f.write("x")
            with open(os.path.join(pub, "prop-Prop_MailCap.0123456789.glb"), "w") as f:
                f.write("antigo")
            rep = V.run(out, pub)
            self.assertTrue(rep["ok"], rep["errors"])
            left = set(os.listdir(pub))
            self.assertNotIn("prop-Prop_MailCap.0123456789.glb", left)
            self.assertIn("README.md", left)
            self.assertIn("meu-modelo.glb", left)
            with open(os.path.join(pub, "manifest.json"), encoding="utf-8") as f:
                m = json.load(f)
            self.assertIn(m["base"], left)
            self.assertTrue(all(p["file"] in left for p in m["props"].values()))

    def test_glb_invalido(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "x.glb")
            with open(p, "wb") as f:
                f.write(b"not a glb at all")
            with self.assertRaises(ValueError):
                V.read_glb(p)


if __name__ == "__main__":
    unittest.main()
