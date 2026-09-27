import { useEffect, useRef, type CSSProperties } from "react";
import { Mesh, Program, Renderer, Triangle, Vec2 } from "ogl";
import "./MoltenMetal.css";

export interface MoltenMetalProps {
  color1?: string;
  color2?: string;
  color3?: string;
  speed?: number;
  scale?: number;
  detail?: number;
  glow?: number;
  coreSize?: number;
  swirl?: number;
  fold?: number;
  blackPoint?: number;
  brightness?: number;
  grain?: boolean;
  grainIntensity?: number;
  mouseInteraction?: boolean;
  mouseStrength?: number;
  opacity?: number;
  className?: string;
}

const vertex = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uScale;
uniform float uDetail;
uniform float uGlow;
uniform float uCoreSize;
uniform float uSwirl;
uniform float uFold;
uniform float uBlackPoint;
uniform float uBrightness;
uniform float uGrainIntensity;
uniform float uMouseStrength;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= uDetail + 2.0) break;
    v += a * noise(p);
    p *= 2.03;
    a *= 0.52;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  vec2 p = (uv - 0.5) * aspect;
  vec2 mouse = (uMouse - 0.5) * aspect;

  p += (mouse - p) * uMouseStrength * 0.14;
  float r = length(p);
  float angle = atan(p.y, p.x);
  angle += (0.42 - r) * uSwirl + uTime * 0.16;

  vec2 q = vec2(cos(angle), sin(angle)) * r;
  q.x += sin(q.y * 3.0 + uTime * 0.42) * uFold;
  q.y += cos(q.x * 2.7 - uTime * 0.3) * uFold;

  float field = fbm(q * uScale + vec2(uTime * 0.08, -uTime * 0.05));
  float filament = smoothstep(0.45 - uCoreSize, 0.66 + uCoreSize, field);
  float halo = smoothstep(0.78, 0.02, r) * uGlow;
  float core = smoothstep(0.36, 0.0, abs(field - 0.62)) * halo;

  float value = max(filament * halo, core);
  value = max(value - uBlackPoint, 0.0) * uBrightness;

  vec3 color = mix(uColor1, uColor2, clamp(value, 0.0, 1.0));
  color = mix(color, uColor3, smoothstep(0.78, 1.25, value));

  float vignette = smoothstep(1.1, 0.22, length(p));
  float grain = (hash(uv * uResolution + uTime) - 0.5) * uGrainIntensity;
  gl_FragColor = vec4(color + grain, clamp(value * vignette, 0.0, 1.0));
}
`;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(
    clean.length === 3
      ? clean
          .split("")
          .map((char) => char + char)
          .join("")
      : clean,
    16,
  );
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

export function MoltenMetal({
  color1 = "#003F46",
  color2 = "#00E6C3",
  color3 = "#FFFFFF",
  speed = 0.25,
  scale = 4,
  detail = 3,
  glow = 1.3,
  coreSize = 0.08,
  swirl = 0.8,
  fold = -0.18,
  blackPoint = 0.08,
  brightness = 1.15,
  grain = true,
  grainIntensity = 0.025,
  mouseInteraction = true,
  mouseStrength = 0.18,
  opacity = 0.75,
  className = "",
}: MoltenMetalProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    let visible = true;
    let inView = true;
    let disposed = false;
    const mouse = new Vec2(0.5, 0.5);
    const targetMouse = new Vec2(0.5, 0.5);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        alpha: true,
        antialias: false,
        dpr,
        depth: false,
      });
    } catch {
      return;
    }
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    root.appendChild(gl.canvas);

    const geometry = new Triangle(gl);
    const uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new Vec2(1, 1) },
      uMouse: { value: mouse },
      uColor1: { value: hexToRgb(color1) },
      uColor2: { value: hexToRgb(color2) },
      uColor3: { value: hexToRgb(color3) },
      uScale: { value: scale },
      uDetail: { value: detail },
      uGlow: { value: glow },
      uCoreSize: { value: coreSize },
      uSwirl: { value: swirl },
      uFold: { value: fold },
      uBlackPoint: { value: blackPoint },
      uBrightness: { value: brightness },
      uGrainIntensity: { value: grain ? grainIntensity : 0 },
      uMouseStrength: { value: mouseInteraction ? mouseStrength : 0 },
    };
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new Mesh(gl, { geometry, program });

    const resize = () => {
      const rect = root.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      renderer.setSize(width, height);
      uniforms.uResolution.value.set(width * dpr, height * dpr);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    resize();

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true;
    });
    intersectionObserver.observe(root);

    const handlePointerMove = (event: PointerEvent) => {
      if (!mouseInteraction) return;
      const rect = root.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      targetMouse.set(
        (event.clientX - rect.left) / rect.width,
        1 - (event.clientY - rect.top) / rect.height,
      );
    };

    const handleVisibility = () => {
      visible = document.visibilityState === "visible";
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);

    let lastTime = performance.now();
    const render = (time: number) => {
      if (disposed) return;
      frame = requestAnimationFrame(render);

      const delta = Math.min(50, time - lastTime);
      lastTime = time;
      if (!visible || !inView) return;

      mouse.set(
        mouse.x + (targetMouse.x - mouse.x) * 0.045,
        mouse.y + (targetMouse.y - mouse.y) * 0.045,
      );
      uniforms.uTime.value += (delta / 1000) * speed;
      renderer.render({ scene: mesh });
    };
    frame = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("visibilitychange", handleVisibility);
      program.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      gl.canvas.remove();
    };
  }, [
    blackPoint,
    brightness,
    color1,
    color2,
    color3,
    coreSize,
    detail,
    fold,
    glow,
    grain,
    grainIntensity,
    mouseInteraction,
    mouseStrength,
    scale,
    speed,
    swirl,
  ]);

  return (
    <div
      ref={rootRef}
      className={`molten-metal ${className}`}
      style={{ "--molten-opacity": opacity } as CSSProperties}
      aria-hidden="true"
    />
  );
}

export default MoltenMetal;
