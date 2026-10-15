import { round2, type EyeShape } from "@open-dot/core";

const INK = "#120F1E";

export function brush(pts: Array<[number, number]>, W: number, taper = 0.4): string {
  const n = pts.length;
  const Ls: Array<[number, number]> = [];
  const Rs: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(i - 1, 0)]!;
    const b = pts[Math.min(i + 1, n - 1)]!;
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len,
      ny = dx / len,
      t = i / (n - 1);
    const w = (W / 2) * (taper + (1 - taper) * Math.sin(Math.PI * t));
    Ls.push([pts[i]![0] + nx * w, pts[i]![1] + ny * w]);
    Rs.push([pts[i]![0] - nx * w, pts[i]![1] - ny * w]);
  }
  let d = "M" + round2(Ls[0]![0]) + " " + round2(Ls[0]![1]);
  for (let i = 1; i < n; i++) d += " L" + round2(Ls[i]![0]) + " " + round2(Ls[i]![1]);
  const e = Rs[n - 1]!;
  const wEnd = (W / 2) * taper;
  d += " A" + round2(wEnd) + " " + round2(wEnd) + " 0 0 1 " + round2(e[0]) + " " + round2(e[1]);
  for (let i = n - 2; i >= 0; i--) d += " L" + round2(Rs[i]![0]) + " " + round2(Rs[i]![1]);
  d += " A" + round2(wEnd) + " " + round2(wEnd) + " 0 0 1 " + round2(Ls[0]![0]) + " " + round2(Ls[0]![1]) + " Z";
  return d;
}

export function qb(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, n = 20): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      u = 1 - t;
    out.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
  }
  return out;
}

export function seg(pts: Array<[number, number]>, n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 0; k < pts.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const t = i / n;
      out.push([pts[k]![0] + (pts[k + 1]![0] - pts[k]![0]) * t, pts[k]![1] + (pts[k + 1]![1] - pts[k]![1]) * t]);
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

export function spiralPts(cx: number, cy: number, r0: number, turns: number, dir: number, start: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const N = 70;
  for (let i = 0; i <= N; i++) {
    const p = i / N,
      a = start + dir * p * Math.PI * 2 * turns,
      r = r0 * (1 - p * 0.88);
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

function ellD(rx: number, ry: number, oy = 0): string {
  return "M" + -rx + " " + oy + " A" + rx + " " + ry + " 0 1 0 " + rx + " " + oy + " A" + rx + " " + ry + " 0 1 0 " + -rx + " " + oy + " Z";
}

function angryD(side: number): string {
  const rx = 6.6,
    ry = 9.8,
    cy = 2,
    pts: Array<[number, number]> = [];
  const outerX = -side * rx,
    innerX = side * rx,
    yO = cy - ry * 0.92,
    yI = cy - ry * 0.3;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2,
      x = rx * Math.cos(a),
      y = cy + ry * Math.sin(a);
    const t = (x - outerX) / (innerX - outerX);
    pts.push([x, Math.max(y, yO + t * (yI - yO))]);
  }
  return "M" + pts.map((p) => round2(p[0]) + " " + round2(p[1])).join(" L") + " Z";
}

export const EYE: Record<EyeShape, () => string> = {
  open: () => ellD(6, 10.2),
  focused: () => ellD(6.4, 6.4, 2),
  attentive: () => ellD(6.6, 11.4),
  big: () => ellD(7.6, 12.4),
  serious: () => ellD(6, 8.4, 2),
  half: () => ellD(6, 4, 4),
  happy: () => brush(qb(-9, 3, 0, -10, 9, 3), 5.2, 0.45),
  closed: () => brush(qb(-9.5, -1, 0, 9, 9.5, -1), 4.6, 0.45),
  gt: () =>
    brush(
      seg(
        [
          [-5, -8],
          [5, 0],
          [-5, 8],
        ],
        10,
      ),
      4.8,
      0.5,
    ),
  lt: () =>
    brush(
      seg(
        [
          [5, -8],
          [-5, 0],
          [5, 8],
        ],
        10,
      ),
      4.8,
      0.5,
    ),
  angryL: () => angryD(1),
  angryR: () => angryD(-1),
  spiralL: () => brush(spiralPts(0, 0, 8.4, 2.25, 1, -Math.PI / 2), 3.8, 0.5),
  spiralR: () => brush(spiralPts(0, 0, 8.4, 2.25, -1, -Math.PI / 2), 3.8, 0.5),
};

export const INK_COLOR = INK;

function lg(id: string, a: string, b: string): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
}

export function artDefs(uid: string): string {
  const g = (name: string, a: string, b: string) => lg(`${uid}-${name}`, a, b);
  return (
    g("gCyan", "#8BE9FF", "#23B2F0") +
    g("gAmber", "#FFD877", "#FF9F1C") +
    g("gRed", "#FF95A6", "#FF3D5C") +
    g("gGreen", "#86F2BC", "#1FBF73") +
    g("gHeart", "#FFA9C6", "#FF4D84") +
    g("gHeartBack", "#C98AAB", "#94506F") +
    g("gBall", "#93EDFF", "#3D97FF") +
    g("gStarY", "#FFF2A6", "#FFC53D") +
    g("gStarG", "#C2FFDF", "#38D68D") +
    g("gStarB", "#D6F3FF", "#6CBDFF") +
    g("gPurple", "#CDB0FF", "#8B5CF6") +
    g("gPinkS", "#FF9CBC", "#FF3F78") +
    g("gCloud", "#FFFFFF", "#D9D2F6") +
    g("gSquare", "#9CF0FF", "#36C2EE") +
    g("gDrop", "#B9EBFF", "#5DB8F5") +
    g("gZ", "#B9CCFF", "#7C98F5") +
    g("gWave", "#7FE6FF", "#2CB6EE") +
    `<linearGradient id="${uid}-eBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="#FBF8FF"/><stop offset=".72" stop-color="#EDE8FC"/><stop offset=".9" stop-color="#D8D8FA"/><stop offset="1" stop-color="#BCC6F8"/></linearGradient>` +
    `<radialGradient id="${uid}-eEdge" cx=".5" cy=".44" r=".6"><stop offset="0" stop-color="#8D8BDA" stop-opacity="0"/><stop offset=".66" stop-color="#8D8BDA" stop-opacity="0"/><stop offset="1" stop-color="#8382D4" stop-opacity=".46"/></radialGradient>` +
    `<radialGradient id="${uid}-eKey" cx=".36" cy=".2" r=".46"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".95"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${uid}-eGlow"><stop offset="0" stop-color="var(--g)" stop-opacity=".95"/><stop offset="1" stop-color="var(--g)" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${uid}-eTint"><stop offset="0" stop-color="var(--t)" stop-opacity="1"/><stop offset=".7" stop-color="var(--t)" stop-opacity=".6"/><stop offset="1" stop-color="var(--t)" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${uid}-eSpec"><stop offset="0" stop-color="#FFFFFF" stop-opacity="1"/><stop offset=".6" stop-color="#FFFFFF" stop-opacity=".55"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${uid}-eShadow"><stop offset="0" stop-color="#05070F" stop-opacity=".7"/><stop offset="1" stop-color="#05070F" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${uid}-odCheek"><stop offset="0" stop-color="#FF8FB8" stop-opacity=".8"/><stop offset="1" stop-color="#FF8FB8" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="${uid}-odLowerG" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>` +
    `<mask id="${uid}-odLower" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#${uid}-odLowerG)"/></mask>` +
    `<filter id="${uid}-odB3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>` +
    `<filter id="${uid}-odB12" x="-60%" y="-200%" width="220%" height="500%"><feGaussianBlur stdDeviation="12"/></filter>` +
    `<filter id="${uid}-odGrey"><feColorMatrix type="saturate" values=".1"/></filter>` +
    accDefs(uid)
  );
}

function accDefs(uid: string): string {
  return (
    `<radialGradient id="${uid}-aCrown" cx=".36" cy=".22" r=".95"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#F0ECFC"/><stop offset="1" stop-color="#C4C0EE"/></radialGradient>` +
    `<radialGradient id="${uid}-aBtn" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#B9C0F2"/></radialGradient>` +
    `<linearGradient id="${uid}-aVisor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9CBCFF"/><stop offset=".55" stop-color="#5E8DFA"/><stop offset="1" stop-color="#3F6EE6"/></linearGradient>` +
    `<linearGradient id="${uid}-aFrame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4C4980"/><stop offset="1" stop-color="#15142A"/></linearGradient>` +
    `<radialGradient id="${uid}-aLens" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".30"/><stop offset="1" stop-color="#C9C4F6" stop-opacity=".14"/></radialGradient>` +
    `<linearGradient id="${uid}-aBand" gradientUnits="userSpaceOnUse" x1="0" y1="30" x2="0" y2="96"><stop offset="0" stop-color="#E6DCFF"/><stop offset=".5" stop-color="#B9A0FA"/><stop offset="1" stop-color="#8F70EC"/></linearGradient>` +
    `<radialGradient id="${uid}-aCup" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#DCCFFF"/><stop offset=".55" stop-color="#9C7FF0"/><stop offset="1" stop-color="#6649CF"/></radialGradient>` +
    `<radialGradient id="${uid}-aPlate" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#F2EDFF"/><stop offset="1" stop-color="#B49BF6"/></radialGradient>` +
    `<linearGradient id="${uid}-aCushL" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#F8F5FF"/><stop offset="1" stop-color="#C9BAF4"/></linearGradient>` +
    `<linearGradient id="${uid}-aCushR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F8F5FF"/><stop offset="1" stop-color="#C9BAF4"/></linearGradient>` +
    `<linearGradient id="${uid}-aRing" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D4FFF1"/><stop offset=".5" stop-color="#5FE8C5"/><stop offset="1" stop-color="#20B88E"/></linearGradient>` +
    hatShade(uid, "bn", "#E3EDFF", "#3F5FA8") +
    hatShade(uid, "bk", "#E6F2E1", "#4D6A49") +
    `<linearGradient id="${uid}-aVs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9CF0C4" stop-opacity=".95"/><stop offset="1" stop-color="#16B26A" stop-opacity=".9"/></linearGradient>` +
    `<radialGradient id="${uid}-aBr" cx=".38" cy=".25" r=".85"><stop offset="0" stop-color="#FF9CBF"/><stop offset=".6" stop-color="#F0457F"/><stop offset="1" stop-color="#B92260"/></radialGradient>` +
    `<radialGradient id="${uid}-aAnt" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FFD9A8"/><stop offset="1" stop-color="#FF7A1F"/></radialGradient>` +
    `<linearGradient id="${uid}-aGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF4B8"/><stop offset=".45" stop-color="#FFD24D"/><stop offset="1" stop-color="#E8A317"/></linearGradient>` +
    `<linearGradient id="${uid}-aGoldIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C98410"/><stop offset="1" stop-color="#A86A08"/></linearGradient>` +
    `<radialGradient id="${uid}-aRuby" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FFC2D8"/><stop offset="1" stop-color="#E23F7A"/></radialGradient>` +
    `<radialGradient id="${uid}-aSap" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#C8F4FF"/><stop offset="1" stop-color="#2BA9E8"/></radialGradient>`
  );
}

function hatShade(uid: string, key: string, lite: string, dark: string): string {
  return (
    `<radialGradient id="${uid}-h${key}k" cx=".3" cy=".18" r=".75"><stop offset="0" stop-color="${lite}" stop-opacity=".95"/><stop offset=".55" stop-color="${lite}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="${uid}-h${key}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${dark}" stop-opacity=".55"/><stop offset=".22" stop-color="${dark}" stop-opacity="0"/><stop offset=".72" stop-color="${dark}" stop-opacity="0"/><stop offset="1" stop-color="${dark}" stop-opacity=".7"/></linearGradient>` +
    `<linearGradient id="${uid}-h${key}v" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="${dark}" stop-opacity="0"/><stop offset="1" stop-color="${dark}" stop-opacity=".45"/></linearGradient>`
  );
}

export function glyph(k: "?" | "!" | "x" | "v"): string {
  const st = ' fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-linejoin="round"';
  if (k === "?") return `<path d="M -3.4 -3.2 C -3.4 -7.4, 3.6 -7.4, 3.6 -3.4 C 3.6 -0.8, 0 -.6, 0 2"${st} stroke-width="2.8"/><circle cy="5.6" r="1.7" fill="#FFFFFF"/>`;
  if (k === "!") return `<path d="M0 -6 L0 1.4"${st} stroke-width="3"/><circle cy="5.4" r="1.7" fill="#FFFFFF"/>`;
  if (k === "x") return `<path d="M-3.8 -3.8 L3.8 3.8 M3.8 -3.8 L-3.8 3.8"${st} stroke-width="2.9"/>`;
  return `<path data-r="ck" d="M-4.4 .2 L-1.3 3.3 L4.6 -3.4"${st} stroke-width="2.9" stroke-dasharray="16" stroke-dashoffset="16"/>`;
}

export function badgeInner(uid: string, grad: string, g: "?" | "!" | "x" | "v"): string {
  return `<circle r="11" fill="#0D0F17"/><circle r="9.2" fill="url(#${uid}-${grad})"/>${glyph(g)}`;
}

export function star4(r: number, gradUrl: string): string {
  const d = `M0 ${-r} C ${round2(r * 0.16)} ${round2(-r * 0.3)}, ${round2(r * 0.3)} ${round2(-r * 0.16)}, ${r} 0 C ${round2(r * 0.3)} ${round2(r * 0.16)}, ${round2(r * 0.16)} ${round2(r * 0.3)}, 0 ${r} C ${round2(-r * 0.16)} ${round2(r * 0.3)}, ${round2(-r * 0.3)} ${round2(r * 0.16)}, ${-r} 0 C ${round2(-r * 0.3)} ${round2(-r * 0.16)}, ${round2(-r * 0.16)} ${round2(-r * 0.3)}, 0 ${-r} Z`;
  return `<path d="${d}" fill="${gradUrl}"/>`;
}

export function heartPath(): string {
  return "M0 9 C -14 0, -12 -12, -5.5 -12 C -2 -12, 0 -9, 0 -7 C 0 -9, 2 -12, 5.5 -12 C 12 -12, 14 0, 0 9 Z";
}

export function rgbCss(c: [number, number, number]): string {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}
