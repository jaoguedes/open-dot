import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

/** Lê os tokens do theme.css: escuro em `:root`, claro em `:root[data-theme="light"]`. */
function tokens(): { dark: Record<string, string>; light: Record<string, string> } {
  const css = readFileSync(new URL("../apps/web/src/theme.css", import.meta.url), "utf8");
  const block = (re: RegExp) => {
    const m = re.exec(css);
    assert.ok(m, `bloco não achado: ${re}`);
    const out: Record<string, string> = {};
    for (const d of m[1]!.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[d[1]!] = d[2]!.trim();
    return out;
  };
  const dark = block(/:root\s*\{([^}]*)\}/);
  const light = { ...dark, ...block(/:root\[data-theme="light"\]\s*\{([^}]*)\}/) };
  return { dark, light };
}

function rgb(c: string): [number, number, number] {
  const h = c.replace("#", "").toLowerCase();
  assert.match(h, /^[0-9a-f]{6}$/, `cor não é hex de 6 dígitos: ${c}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function lum([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a: [number, number, number], b: [number, number, number]): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}
/** Cor do vidro: `surface` com opacidade `alpha` sobre o pior fundo que passe por baixo. */
function glassOver(surface: string, alpha: number, under: [number, number, number]): [number, number, number] {
  const s = rgb(surface);
  return s.map((v, i) => Math.round(v * alpha + under[i]! * (1 - alpha))) as [number, number, number];
}

for (const mode of ["dark", "light"] as const) {
  test(`contraste WCAG dos tokens no modo ${mode === "dark" ? "escuro" : "claro"}`, () => {
    const t = tokens()[mode];
    const pairs: Array<[string, string, number]> = [
      ["text", "bg", 4.5],
      ["text-2", "surface", 4.5],
      ["on-accent", "accent", 4.5],
      ["link", "surface", 4.5],
      ["link", "bg", 4.5],
      ["warn", "surface", 4.5],
      ["text", "surface-2", 4.5],
      ["focus", "bg", 3],
      ["focus", "surface", 3],
    ];
    const bad = pairs.map(([fg, bg, min]) => ({ fg, bg, min, r: ratio(rgb(t[fg]!), rgb(t[bg]!)) })).filter((p) => p.r < p.min);
    assert.deepEqual(
      bad.map((p) => `${p.fg}/${p.bg} ${p.r.toFixed(2)} < ${p.min}`),
      [],
    );
  });

  test(`texto e placeholder sobre o vidro passam 4,5:1 no pior fundo (${mode})`, () => {
    const t = tokens()[mode];
    const alpha = Number(t["glass-alpha"]);
    assert.ok(alpha > 0 && alpha <= 1, "falta --glass-alpha");
    // Pior caso: o conteúdo mais contrastante com o texto do vidro passando por baixo
    // (no escuro, o corpo branco do Dot; no claro, texto quase preto).
    const under: [number, number, number] = mode === "dark" ? [255, 255, 255] : [18, 20, 26];
    const glass = glassOver(t.surface!, alpha, under);
    for (const fg of ["text", "text-2"]) {
      const r = ratio(rgb(t[fg]!), glass);
      assert.ok(r >= 4.5, `${fg} sobre o vidro: ${r.toFixed(2)}`);
    }
  });
}

test("acento amarelo, fundo escuro e laranja de alerta como decidido", () => {
  const { dark, light } = tokens();
  assert.equal(dark.accent!.toLowerCase(), "#ffbc03");
  assert.equal(light.accent!.toLowerCase(), "#ffbc03");
  assert.equal(dark["on-accent"]!.toLowerCase(), "#1a1400");
  assert.equal(dark.bg!.toLowerCase(), "#050608");
  assert.notEqual(dark.warn!.toLowerCase(), dark.accent!.toLowerCase());
  assert.notEqual(light.warn!.toLowerCase(), light.accent!.toLowerCase());
});

test("nenhum azul antigo fora dos tokens no app (CSS, TSX, SVG, scripts, Blender)", () => {
  let out = "";
  try {
    out = execFileSync("git", ["grep", "-n", "-i", "-E", "#3361ff|#6e95ff|#2f56e0|rgba\\(51, ?97, ?255", "--", "apps", "packages", "scripts", "blender", "assets", "tests/*.ts", ":!tests/theme-rodada4.test.ts"], { encoding: "utf8" }).trim();
  } catch (e) {
    if ((e as { status?: number }).status !== 1) throw e; // 1 = nada encontrado
  }
  assert.equal(out, "");
});

test("vidro com fallback sólido sem backdrop-filter e com transparência reduzida", () => {
  const css = readFileSync(new URL("../apps/web/src/styles.css", import.meta.url), "utf8");
  assert.match(css, /backdrop-filter:\s*blur\(16px\)\s*saturate\(1\.5\)/);
  assert.match(css, /-webkit-backdrop-filter:\s*blur\(16px\)\s*saturate\(1\.5\)/);
  assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)\s*\{[^}]*\.composer[^}]*\.dock/);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)\s*\{[^}]*\.composer[^}]*\.dock/);
  // No claro, preenchimento amarelo (1,55:1 sobre o fundo) ganha contorno em --link para o estado não depender só da cor.
  assert.match(css, /:root\[data-theme="light"\][^{]*\.nav-item\[aria-current="page"\][^{]*\{[^}]*box-shadow:\s*inset 0 0 0 1px var\(--link\)/);
  assert.match(css, /::selection\s*\{[^}]*background:\s*#ffbc03;[^}]*color:\s*#1a1400/i);
});

test("manifest: ícones existem, tamanhos certos, maskable presente, theme-color e fundo #050608", () => {
  const m = JSON.parse(readFileSync(new URL("../apps/web/public/manifest.webmanifest", import.meta.url), "utf8")) as { theme_color: string; background_color: string; icons: Array<{ src: string; sizes: string; purpose?: string }> };
  assert.equal(m.theme_color.toLowerCase(), "#050608");
  assert.equal(m.background_color.toLowerCase(), "#050608");
  assert.ok(m.icons.some((i) => i.purpose === "maskable"));
  for (const i of m.icons) {
    const buf = readFileSync(new URL(`../apps/web/public${i.src.split("?")[0]}`, import.meta.url));
    const [w, h] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    assert.equal(`${w}x${h}`, i.sizes, i.src);
  }
  const html = readFileSync(new URL("../apps/web/index.html", import.meta.url), "utf8");
  assert.match(html, /<meta name="theme-color" content="#050608"/i);
  assert.match(html, /rel="icon"[^>]*favicon-32\.png/);
  assert.match(html, /rel="apple-touch-icon"[^>]*apple-touch-icon\.png/);
});
