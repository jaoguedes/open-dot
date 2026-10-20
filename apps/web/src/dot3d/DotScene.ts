import {
  AmbientLight,
  AnimationMixer,
  Box3,
  Clock,
  Color,
  DirectionalLight,
  HemisphereLight,
  LoopOnce,
  LoopRepeat,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type AnimationAction,
  type AnimationClip,
  type Material,
  type MeshStandardMaterial,
  type Object3D,
} from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { HeartEmitter, type Accessory, type AgentVisual } from "@open-dot/core";
import { FrameGovernor, blendMs, clipsFor, gazeFromPointer, nextBlinkMs, type ClipPlan, type DotManifest } from "./policy.ts";

/**
 * Runtime 3D do Dot (three.js). Um único canvas, render sob demanda e camadas separadas:
 * corpo (body_*), rosto (face_*), olhar (osso FaceAim, limitado), tom do agente/estado
 * (shader do material do corpo), acessório (GLB próprio preso ao socket) e corações
 * (HeartEmitter do núcleo, cada um com ciclo de vida próprio).
 */

const PROP_FOR: Record<Accessory, string | null> = {
  none: null,
  mail_cap: "Prop_MailCap",
  glasses: "Prop_Glasses",
  headphones: "Prop_Headphones",
  antenna: null,
  visor: null,
  beret: null,
  beanie: null,
  bucket: null,
  crown: null,
};
const CONTINUOUS = new Set<AgentVisual["semantic"]>(["thinking", "working"]);
const ASSET_BASE = "/dot/";

export interface DotSceneStats {
  rendered: number;
  skipped: number;
  body: string | null;
  face: string | null;
  hearts: number;
  geometries: number;
  textures: number;
  programs: number;
  accessory: string | null;
}

export interface DotSceneOptions {
  canvas: HTMLCanvasElement;
  manifest: DotManifest;
  onContextLost: () => void;
}

export class DotScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(28, 1, 0.1, 20);
  private readonly clock = new Clock(false);
  private readonly governor: FrameGovernor;
  private readonly emitter: HeartEmitter;
  private readonly loader = new GLTFLoader();
  private readonly manifest: DotManifest;
  private readonly canvas: HTMLCanvasElement;
  private readonly onContextLost: () => void;

  private root: Object3D | null = null;
  private mixer: AnimationMixer | null = null;
  private clips = new Map<string, AnimationClip>();
  private bodyAction: AnimationAction | null = null;
  private faceAction: AnimationAction | null = null;
  private plan: ClipPlan | null = null;
  private faceBone: Object3D | null = null;
  private fxSocket: Object3D | null = null;
  private tintUniforms: { uOdTint: { value: Color }; uOdCov: { value: number }; uOdAmt: { value: number } } | null = null;
  private heartSource: Mesh | null = null;
  private hearts = new Map<string, Mesh>();
  private propCache = new Map<string, Object3D>();
  private currentProp: Object3D | null = null;
  private wantedAccessory: Accessory = "none";
  private visual: AgentVisual | null = null;
  private gaze = { yaw: 0, pitch: 0 };
  private gazeTarget = { yaw: 0, pitch: 0 };
  private raf: number | null = null;
  private blinkTimer: number | null = null;
  private disposed = false;
  private reducedMotion = false;

  constructor(opts: DotSceneOptions) {
    this.canvas = opts.canvas;
    this.manifest = opts.manifest;
    this.onContextLost = opts.onContextLost;
    this.governor = new FrameGovernor(Math.min(30, opts.manifest.limits.fps));
    this.emitter = new HeartEmitter({ maxAlive: opts.manifest.limits.maxHearts });
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: "low-power" });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.manifest.limits.maxDpr));
    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);
    document.addEventListener("visibilitychange", this.handleVisibility);

    this.scene.add(new HemisphereLight(0xffffff, 0xe6ddd0, 1.4));
    this.scene.add(new AmbientLight(0xffffff, 0.35));
    const key = new DirectionalLight(0xffffff, 1.9);
    key.position.set(-1.6, 2.4, 2.0);
    this.scene.add(key);
    const rim = new DirectionalLight(0xffffff, 0.6);
    rim.position.set(0.5, 1.8, -2.2);
    this.scene.add(rim);
  }

  async load(): Promise<void> {
    const gltf = await this.loader.loadAsync(ASSET_BASE + this.manifest.base);
    if (this.disposed) return disposeTree(gltf.scene);
    this.root = gltf.scene;
    this.scene.add(gltf.scene);
    for (const c of gltf.animations) this.clips.set(c.name, c);
    this.mixer = new AnimationMixer(gltf.scene);
    this.mixer.addEventListener("finished", this.handleClipFinished);
    this.faceBone = gltf.scene.getObjectByName("FaceAim") ?? null;
    this.fxSocket = gltf.scene.getObjectByName("Socket_FX") ?? null;
    this.installTint(gltf);
    this.frameCamera(gltf.scene);

    const heartFile = this.manifest.fx.Heart_Source?.file;
    if (heartFile) {
      const h = await this.loader.loadAsync(ASSET_BASE + heartFile);
      if (this.disposed) return disposeTree(h.scene);
      let found: Mesh | null = null;
      h.scene.traverse((o) => {
        if (!found && (o as Mesh).isMesh) found = o as Mesh;
      });
      this.heartSource = found;
    }
    if (this.visual) this.applyState(this.visual, true);
    await this.setAccessory(this.wantedAccessory);
    this.scheduleBlink();
    this.request();
  }

  setVisual(visual: AgentVisual, reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    const prev = this.visual;
    this.visual = visual;
    if (!this.mixer) return;
    if (!prev || prev.semantic !== visual.semantic || prev.agentId !== visual.agentId) this.applyState(visual, false);
    this.applyTint(visual);
    this.request();
  }

  async setAccessory(acc: Accessory): Promise<void> {
    this.wantedAccessory = acc;
    if (!this.root) return;
    const name = PROP_FOR[acc];
    if (this.currentProp && this.currentProp.name !== name) {
      this.currentProp.parent?.remove(this.currentProp);
      this.currentProp = null;
    }
    if (!name || this.currentProp) return this.request();
    const spec = this.manifest.props[name];
    if (!spec) return;
    let obj = this.propCache.get(name);
    if (!obj) {
      const g = await this.loader.loadAsync(ASSET_BASE + spec.file);
      if (this.disposed) return disposeTree(g.scene);
      obj = g.scene;
      obj.name = name;
      this.propCache.set(name, obj);
    }
    if (this.wantedAccessory !== acc) return; // trocou de novo enquanto baixava
    const anchor = this.root.getObjectByName(spec.anchor);
    if (!anchor) return;
    anchor.add(obj);
    this.currentProp = obj;
    this.request();
  }

  /** Carinho: corações independentes; suprimido em erro, aprovação e desconexão. */
  affection(): "ok" | "cooldown" | "suppressed" | "hidden" {
    const v = this.visual;
    const r = this.emitter.emit(performance.now(), { allowCosmetic: v?.allowCosmetic ?? true, reducedMotion: this.reducedMotion });
    if (r.ok) {
      this.playFace("face_happy", false);
      this.governor.keepAlive(performance.now(), 1600);
      this.request();
      return "ok";
    }
    return r.reason;
  }

  touch(): void {
    if (!this.mixer || !this.visual) return;
    const plan = clipsFor(this.visual, this.manifest, "touch");
    this.playBody(plan.body, false);
    this.request();
  }

  pointer(dx: number, dy: number, radius: number): void {
    this.gazeTarget = gazeFromPointer(dx, dy, radius, this.manifest.limits);
    this.request();
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.governor.invalidate();
    this.request();
  }

  stats(): DotSceneStats {
    const info = this.renderer.info;
    return {
      rendered: this.governor.rendered,
      skipped: this.governor.skipped,
      body: this.bodyAction?.getClip().name ?? null,
      face: this.faceAction?.getClip().name ?? null,
      hearts: this.hearts.size,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      accessory: this.currentProp?.name ?? null,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    if (this.blinkTimer !== null) window.clearTimeout(this.blinkTimer);
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.mixer?.stopAllAction();
    this.mixer?.removeEventListener("finished", this.handleClipFinished);
    for (const h of this.hearts.values()) disposeMaterial(h.material);
    this.hearts.clear();
    for (const p of this.propCache.values()) disposeTree(p);
    if (this.heartSource) disposeTree(this.heartSource);
    if (this.root) disposeTree(this.root);
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------ estado e clipes

  private applyState(visual: AgentVisual, immediate: boolean): void {
    const plan = clipsFor(visual, this.manifest);
    this.plan = plan;
    this.playBody(plan.body, plan.loopBody, immediate);
    if (plan.face) this.playFace(plan.face, false, immediate);
    else this.stopFace();
    this.applyTint(visual);
  }

  private playBody(name: string, loop: boolean, immediate = false): void {
    const clip = this.clips.get(name);
    if (!clip || !this.mixer) return;
    const next = this.mixer.clipAction(clip);
    if (next === this.bodyAction && loop) return;
    next.reset();
    next.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    const fade = blendMs() / 1000;
    if (this.bodyAction && this.bodyAction !== next && !immediate) this.bodyAction.crossFadeTo(next, fade, false);
    else if (this.bodyAction && this.bodyAction !== next) this.bodyAction.stop();
    this.bodyAction = next;
    this.governor.keepAlive(performance.now(), loop ? blendMs() + 50 : clip.duration * 1000 + blendMs());
  }

  private playFace(name: string, loop: boolean, immediate = false): void {
    const clip = this.clips.get(name);
    if (!clip || !this.mixer) return;
    const next = this.mixer.clipAction(clip);
    next.reset();
    next.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = true;
    next.play();
    if (this.faceAction && this.faceAction !== next && !immediate) this.faceAction.crossFadeTo(next, blendMs() / 1000, false);
    else if (this.faceAction && this.faceAction !== next) this.faceAction.stop();
    this.faceAction = next;
    this.governor.keepAlive(performance.now(), clip.duration * 1000 + blendMs());
  }

  private stopFace(): void {
    if (!this.faceAction) return;
    this.faceAction.fadeOut(blendMs() / 1000);
    const a = this.faceAction;
    this.faceAction = null;
    this.governor.keepAlive(performance.now(), blendMs() + 50);
    window.setTimeout(() => a.isRunning() || a.stop(), blendMs() + 100);
  }

  private handleClipFinished = (e: { action: AnimationAction }) => {
    // Reação do corpo (toque, sucesso…) terminou: volta ao clipe do estado atual.
    if (e.action === this.bodyAction && this.plan && e.action.getClip().name !== this.plan.body && this.visual) {
      this.playBody(this.plan.body, this.plan.loopBody);
      this.request();
    }
    // Carinho/piscada terminou e o estado não tem expressão própria: rosto volta ao neutro.
    if (e.action === this.faceAction && this.plan && !this.plan.face && e.action.getClip().name !== "face_sleep") {
      this.stopFace();
      this.request();
    }
  };

  private scheduleBlink(): void {
    if (this.disposed) return;
    this.blinkTimer = window.setTimeout(() => {
      if (!document.hidden && this.plan && !this.plan.face && !this.faceAction) {
        this.playFace("face_blink", false);
        this.request();
      }
      this.scheduleBlink();
    }, nextBlinkMs());
  }

  // ------------------------------------------------------------------ tom do agente/estado

  private installTint(gltf: GLTF): void {
    const body = gltf.scene.getObjectByName("Body") as Mesh | undefined;
    const mesh = body && (body as Mesh).isMesh ? body : (body?.children.find((c) => (c as Mesh).isMesh) as Mesh | undefined);
    if (!mesh) return;
    const mat = mesh.material as MeshStandardMaterial;
    const box = new Box3().setFromObject(mesh);
    const uniforms = {
      uOdTint: { value: new Color(1, 1, 1) },
      uOdCov: { value: 0 },
      uOdAmt: { value: 0 },
      uOdMinY: { value: box.min.y },
      uOdHeight: { value: Math.max(0.001, box.max.y - box.min.y) },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying float vOdY;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvOdY = position.y;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vOdY;\nuniform vec3 uOdTint;\nuniform float uOdCov;\nuniform float uOdAmt;\nuniform float uOdMinY;\nuniform float uOdHeight;")
        .replace(
          "#include <color_fragment>",
          "#include <color_fragment>\nfloat odH = (vOdY - uOdMinY) / uOdHeight;\nfloat odT = 1.0 - smoothstep(uOdCov - 0.08, uOdCov + 0.08, odH);\ndiffuseColor.rgb = mix(diffuseColor.rgb, uOdTint, odT * uOdAmt * step(0.001, uOdCov));",
        );
    };
    mat.needsUpdate = true;
    this.tintUniforms = uniforms;
  }

  private applyTint(_v: AgentVisual): void {
    if (!this.tintUniforms) return;
    this.tintUniforms.uOdCov.value = 0;
    // Preservar material original do GLB; cor semântica pertence à interface.
    this.tintUniforms.uOdAmt.value = 0;
    this.governor.invalidate();
  }

  // ------------------------------------------------------------------ loop

  private frameCamera(obj: Object3D): void {
    const box = new Box3().setFromObject(obj);
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const dist = (Math.max(size.x, size.y * 1.15) / 2 / Math.tan(MathUtils.degToRad(this.camera.fov / 2))) * 1.55;
    this.camera.position.set(center.x, center.y + size.y * 0.25, center.z + dist);
    this.camera.lookAt(center.x, center.y, center.z);
  }

  private request(): void {
    if (this.disposed || this.raf !== null || document.hidden) return;
    if (!this.clock.running) this.clock.start();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = null;
    if (this.disposed) return;
    const heartsAlive = this.emitter.aliveCount(now) > 0;
    const gazeMoving = Math.abs(this.gaze.yaw - this.gazeTarget.yaw) + Math.abs(this.gaze.pitch - this.gazeTarget.pitch) > 0.05;
    const continuous = !!this.visual && CONTINUOUS.has(this.visual.semantic);
    const active = heartsAlive || gazeMoving || continuous;
    if (this.governor.shouldRender(now, active)) {
      const dt = Math.min(0.1, this.clock.getDelta());
      this.mixer?.update(dt);
      this.updateGaze(dt);
      this.updateHearts(now);
      this.renderer.render(this.scene, this.camera);
    }
    if (this.governor.wantsLoop(now, active)) this.raf = requestAnimationFrame(this.frame);
    else this.clock.stop();
  };

  private updateGaze(dt: number): void {
    if (!this.faceBone) return;
    const k = 1 - Math.exp(-dt * 10);
    this.gaze.yaw += (this.gazeTarget.yaw - this.gaze.yaw) * k;
    this.gaze.pitch += (this.gazeTarget.pitch - this.gaze.pitch) * k;
    // O clipe do corpo escreve a rotação do FaceAim a cada update; o olhar soma por cima.
    this.faceBone.rotation.y += MathUtils.degToRad(this.gaze.yaw);
    this.faceBone.rotation.x += MathUtils.degToRad(-this.gaze.pitch);
  }

  private updateHearts(now: number): void {
    const frames = this.emitter.frames(now);
    const seen = new Set<string>();
    const origin = new Vector3();
    if (this.fxSocket) this.fxSocket.getWorldPosition(origin);
    for (const f of frames) {
      seen.add(f.id);
      let h = this.hearts.get(f.id);
      if (!h && this.heartSource) {
        h = this.heartSource.clone();
        const m = (this.heartSource.material as Material).clone();
        m.transparent = true;
        h.material = m;
        this.scene.add(h);
        this.hearts.set(f.id, h);
      }
      if (!h) continue;
      h.position.set(origin.x + f.x, origin.y - f.y * 0.8, origin.z);
      h.scale.setScalar(f.scale);
      h.rotation.z = MathUtils.degToRad(-f.rotationDeg);
      (h.material as Material).opacity = f.alpha;
    }
    for (const [id, h] of this.hearts) {
      if (seen.has(id)) continue;
      this.scene.remove(h);
      disposeMaterial(h.material);
      this.hearts.delete(id);
    }
  }

  private handleVisibility = () => {
    const hidden = document.hidden;
    this.governor.setPaused(hidden);
    this.emitter.setHidden(hidden);
    if (hidden) {
      if (this.raf !== null) cancelAnimationFrame(this.raf);
      this.raf = null;
      this.clock.stop();
    } else {
      this.request();
    }
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.onContextLost();
  };
}

function disposeMaterial(m: Material | Material[]): void {
  for (const x of Array.isArray(m) ? m : [m]) x.dispose();
}

function disposeTree(obj: Object3D): void {
  obj.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      disposeMaterial(mesh.material);
    }
  });
}
