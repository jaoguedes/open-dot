"""
Especificação do Dot usada pelo build no Blender e pelo validador (Python puro).
Fonte: catálogo visual (Anexo C) + capítulos 17-25 do PDF + correções do João.

Convenção: Blender Z para cima, personagem olhando para -Y, lateral X, 1 unidade = largura do corpo.
O exportador glTF converte para Y-up. Não somar rotação corretiva no código do app.
"""

# Proporções (catálogo prevalece; o PDF dá 0,62 de profundidade, o catálogo lateral sugere ~0,7).
WIDTH = 1.00
HEIGHT = 0.80
DEPTH = 0.70
# Expoentes da superelipse: topo em arco amplo, base mais achatada. 2 = esfera; >3 = caixa macia.
EXP_TOP = 2.7
EXP_BOTTOM = 4.0
EXP_SIDE = 3.0
SUBDIV = 15  # cortes por aresta do cubo-base (≈ 3k triângulos no corpo)

# Rosto (frente = -Y)
EYE_X = 0.15            # meia distância entre centros (0,30 da largura)
EYE_Z = 0.30 * HEIGHT   # 30% da altura a partir da base
EYE_RX = 0.043          # semi-largura
EYE_RZ = 0.050          # semi-altura
CHEEK_X = 0.29
CHEEK_Z = EYE_Z - 0.005  # na linha dos olhos, um pouco abaixo (catálogo)
CHEEK_RX = 0.055
CHEEK_RZ = 0.030
# Tracinho de absorção (entrada de arquivos) — preservado conforme o catálogo. Não é boca.
SLOT_Z = 0.82 * HEIGHT
SLOT_HALF_W = 0.10
SLOT_HALF_H = 0.018

# Limite do olhar (graus)
GAZE_MAX_YAW = 8.0
GAZE_MAX_PITCH = 5.0

# Materiais em sRGB (convertidos para linear no Blender).
MATERIALS = {
    "M_Body": {"hex": "#F3EDE2", "roughness": 0.64, "metallic": 0.0},
    "M_Eyes": {"hex": "#292628", "roughness": 0.38, "metallic": 0.0},
    "M_Cheek": {"hex": "#EAB6B2", "roughness": 0.7, "metallic": 0.0},
    "M_Slot": {"hex": "#8F8475", "roughness": 0.6, "metallic": 0.0},  # contraste suficiente para o tracinho aparecer a 64 px
    "M_Glasses": {"hex": "#44414A", "roughness": 0.48, "metallic": 0.0},
    "M_Cloth": {"hex": "#A8BED8", "roughness": 0.75, "metallic": 0.0},
    "M_ClothLav": {"hex": "#B6ACD4", "roughness": 0.75, "metallic": 0.0},
    "M_Heart": {"hex": "#EEB5C1", "roughness": 0.7, "metallic": 0.0},
    "M_Ring": {"hex": "#59CFC6", "roughness": 0.5, "metallic": 0.0},
}

# Nós exigidos no GLB base.
REQUIRED_NODES = ["Root_Dot", "Rig_Dot", "Body", "Eyes", "Cheeks", "Slot", "Socket_Head", "Socket_Face", "Socket_Sides", "Socket_FX"]
# Morph targets da malha "Eyes" (um único datablock de shape keys para os dois olhos).
EYE_MORPHS = ["Blink_L", "Blink_R", "Happy_L", "Happy_R", "Sleep_L", "Sleep_R", "Squint_L", "Squint_R", "Surprise_L", "Surprise_R"]
BODY_MORPHS = ["Body_Squash", "Absorb_Receive"]

FPS = 30
# Clipes em camadas disjuntas: body_* anima o rig; face_* anima os morphs dos olhos.
BODY_CLIPS = {
    "body_idle_breathe": 138,
    "body_think": 84,
    "body_work": 81,
    "body_wait_ok": 2,
    "body_success": 27,
    "body_error": 15,
    "body_sleep_enter": 24,
    "body_sleep_idle": 180,
    "body_wake": 18,
    "body_touch_squash": 18,
    "body_surprised": 15,
    "body_absorb_receive": 30,
}
FACE_CLIPS = {
    "face_blink": 5,
    "face_wink": 12,
    "face_happy": 27,
    "face_sleep": 24,
    "face_wake": 18,
    "face_squint": 15,
    "face_surprised": 15,
}
# Estado semântico → combinação de camadas (contrato com o runtime).
STATE_MAP = {
    "idle": {"body": "body_idle_breathe", "face": None},
    "thinking": {"body": "body_think", "face": None},
    "working": {"body": "body_work", "face": None},
    "waiting": {"body": "body_wait_ok", "face": None},
    "success": {"body": "body_success", "face": "face_happy"},
    "error": {"body": "body_error", "face": "face_squint"},
    "sleep": {"body": "body_sleep_idle", "face": "face_sleep"},
    "touch": {"body": "body_touch_squash", "face": None},
    "surprised": {"body": "body_surprised", "face": "face_surprised"},
    "affection": {"body": "body_success", "face": "face_happy"},
    "absorb": {"body": "body_absorb_receive", "face": None},
}

PROPS = {
    "Prop_MailCap": {"anchor": "Socket_Head", "material": "M_Cloth"},
    "Prop_Glasses": {"anchor": "Socket_Face", "material": "M_Glasses"},
    "Prop_Headphones": {"anchor": "Socket_Sides", "material": "M_ClothLav"},
}
FX = {"Heart_Source": "M_Heart", "Ring_Source": "M_Ring"}

# Metas (PDF cap. 25) — metas, não resultados medidos.
BUDGET = {
    "base_tris_max": 6000,
    "prop_tris_max": 1000,
    "heart_tris_max": 200,
    "materials_max": 6,
    "base_glb_kb_target": 250,
    "props_kb_target": 350,
}


def srgb_to_linear(c: float) -> float:
    """Converte um canal sRGB (0..1) para linear. Testado em blender/test_spec.py."""
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear_rgba(hex_color: str, alpha: float = 1.0):
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), alpha)
