import { useEffect, useRef, useState } from "react";
import { AGENTS, type Accessory, type AgentVisual } from "@open-dot/core";
import { Dot2D } from "./Dot2D.tsx";
import { FALLBACK_TEXT, chooseRenderer, validateManifest, type DotManifest, type FallbackReason } from "../dot3d/policy.ts";
import type { DotScene } from "../dot3d/DotScene.ts";

interface Props {
  visual: AgentVisual;
  accessory: Accessory;
  size: number;
  reducedMotion: boolean;
  label?: string;
  affectionSignal?: number;
  onAffection?: (result: "ok" | "cooldown" | "suppressed" | "hidden") => void;
}

/** Só um canvas WebGL no app inteiro; uma segunda instância usa o 2D. */
let canvasOwner: symbol | null = null;

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

let manifestPromise: Promise<DotManifest | null> | null = null;
function loadManifest(): Promise<DotManifest | null> {
  manifestPromise ??= fetch("/dot/manifest.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((m: unknown) => (validateManifest(m) ? m : null))
    .catch(() => null);
  return manifestPromise;
}

declare global {
  interface Window {
    __openDot3d?: () => ReturnType<DotScene["stats"]> | null;
  }
}

export function Dot3D({ visual, accessory, size, reducedMotion, label, affectionSignal, onAffection }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DotScene | null>(null);
  const [mode, setMode] = useState<{ kind: "loading" } | { kind: "3d" } | { kind: "2d"; reason: FallbackReason }>(() => {
    const pre = chooseRenderer({ webgl: true, reducedMotion, contextLost: false, manifestOk: null, loadFailed: false, canvasFree: canvasOwner === null });
    return pre.kind === "2d" ? pre : { kind: "loading" };
  });
  const latest = useRef({ visual, accessory, reducedMotion });
  latest.current = { visual, accessory, reducedMotion };

  // Uma tentativa de 3D por montagem; movimento reduzido encerra a cena e volta ao 2D na hora.
  useEffect(() => {
    if (reducedMotion) {
      setMode({ kind: "2d", reason: "reduced-motion" });
      return;
    }
    setMode({ kind: "loading" });
    const token = Symbol("dot3d");
    let cancelled = false;
    let scene: DotScene | null = null;
    let ro: ResizeObserver | null = null;
    const teardown = () => {
      ro?.disconnect();
      ro = null;
      scene?.dispose();
      scene = null;
      sceneRef.current = null;
      if (canvasOwner === token) canvasOwner = null;
      if (window.__openDot3d) delete window.__openDot3d;
    };
    const fail = (reason: FallbackReason) => {
      if (cancelled) return;
      teardown();
      setMode({ kind: "2d", reason });
    };

    (async () => {
      const webgl = hasWebGL();
      const free = canvasOwner === null;
      const pre = chooseRenderer({ webgl, reducedMotion: latest.current.reducedMotion, contextLost: false, manifestOk: null, loadFailed: false, canvasFree: free });
      if (pre.kind === "2d") return fail(pre.reason);
      canvasOwner = token;
      const manifest = await loadManifest();
      if (cancelled) return;
      if (!manifest) return fail("manifest");
      try {
        const { DotScene: Impl } = await import("../dot3d/DotScene.ts");
        if (cancelled || !canvas.current) return;
        scene = new Impl({ canvas: canvas.current, manifest, onContextLost: () => fail("context-lost") });
        sceneRef.current = scene;
        scene.setVisual(latest.current.visual, latest.current.reducedMotion);
        void scene.setAccessory(latest.current.accessory);
        await scene.load();
        if (cancelled) return;
        const el = wrap.current;
        if (el) {
          ro = new ResizeObserver(() => scene?.resize(el.clientWidth, el.clientHeight));
          ro.observe(el);
          scene.resize(el.clientWidth, el.clientHeight);
        }
        window.__openDot3d = () => scene?.stats() ?? null;
        setMode({ kind: "3d" });
      } catch (e) {
        console.warn("Dot 3D indisponível, usando a prévia 2D:", e instanceof Error ? e.message : e);
        fail("load-failed");
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [reducedMotion]);

  useEffect(() => sceneRef.current?.setVisual(visual, reducedMotion), [visual, reducedMotion]);
  useEffect(() => void sceneRef.current?.setAccessory(accessory), [accessory]);

  const lastSignal = useRef(affectionSignal ?? 0);
  const [twoDSignal, setTwoDSignal] = useState(0);
  useEffect(() => {
    if (affectionSignal === undefined || affectionSignal === lastSignal.current) return;
    lastSignal.current = affectionSignal;
    const s = sceneRef.current;
    if (s && mode.kind === "3d") onAffection?.(s.affection());
    else setTwoDSignal((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affectionSignal]);

  const name = label ?? `${AGENTS[visual.agentId].name} — ${visual.label}`;
  const show3d = mode.kind === "3d";
  return (
    <div className="dot3d" data-dot-renderer={mode.kind} data-dot-fallback={mode.kind === "2d" ? mode.reason : undefined} style={{ width: size }}>
      {mode.kind !== "2d" && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- caminho GLB legado (DOT_RENDERER=glb); o motor SVG padrão não usa
        <div
          ref={wrap}
          className="dot3d-stage"
          style={{ width: size, height: Math.round(size * 0.9) }}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            sceneRef.current?.pointer(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2), r.width / 2);
          }}
          onPointerLeave={() => sceneRef.current?.pointer(0, 0, 1)}
          onClick={() => sceneRef.current?.touch()}
        >
          <canvas ref={canvas} role="img" aria-label={name} style={{ width: "100%", height: "100%", visibility: show3d ? "visible" : "hidden" }} />
          {mode.kind === "loading" && (
            <div className="dot3d-loading" aria-hidden="true">
              <Dot2D visual={visual} accessory={accessory} size={size} animate={false} reducedMotion />
            </div>
          )}
        </div>
      )}
      {mode.kind === "2d" && (
        <>
          <Dot2D visual={visual} accessory={accessory} size={size} animate reducedMotion={reducedMotion} interactive showBadge label={name} affectionSignal={twoDSignal} onAffection={onAffection} />
          <p className="tiny dot3d-reason">{FALLBACK_TEXT[mode.reason]}</p>
        </>
      )}
      {show3d && <span className="badge-3d" title="Modelo 3D exportado do Blender. Aprovação artística pendente.">3D</span>}
    </div>
  );
}
