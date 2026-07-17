"use client";

// Hero-Partikelszene: ~7000 Punkte formen sich aus dem Chaos zum
// Marken-Schluesselloch. 1:1-Port von ELYTRA Website/js/scene.js.
//
// three wird dynamisch im Effect importiert (kein three-Code im
// Server-Bundle, kein window-Zugriff im Render-Pfad). Der Effect raeumt
// vollstaendig auf (rAF, Listener, IntersectionObserver, geometry/material/
// renderer.dispose) und uebersteht damit den StrictMode-Doppel-Mount ohne
// Leak oder doppelte Szene.

import { useEffect, useRef } from "react";
import { clearHeroUniforms, publishHeroUniforms } from "./runtime";

const COUNT = 7000;

// Punkt in der Schluesselloch-Silhouette samplen.
// Kreis: Zentrum (0, 0.55), r 0.62 - Schaft: Trapez y in [-1.15, 0.18].
function sampleKeyhole(): [number, number] {
  const circleArea = Math.PI * 0.62 * 0.62;
  const stemArea = ((0.46 + 1.1) / 2) * 1.33;
  const pickCircle = Math.random() < circleArea / (circleArea + stemArea);

  if (pickCircle) {
    const r = 0.62 * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    return [Math.cos(a) * r, 0.55 + Math.sin(a) * r];
  }
  const t = Math.random();
  const y = 0.18 - t * 1.33;
  const halfW = 0.23 + t * (0.55 - 0.23);
  return [(Math.random() * 2 - 1) * halfW, y];
}

export function HeroScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let disposed = false;
    let cleanupScene: (() => void) | null = null;

    (async () => {
      const THREE = await import("three");
      // StrictMode: der erste Effect-Lauf kann waehrend des Imports schon
      // wieder abgeraeumt worden sein -- dann nichts initialisieren.
      if (disposed) {
        return;
      }

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
      camera.position.set(0, 0, 7.2);

      const starts = new Float32Array(COUNT * 3);
      const targets = new Float32Array(COUNT * 3);
      const rands = new Float32Array(COUNT);

      for (let i = 0; i < COUNT; i++) {
        // Streuwolke: breites, flaches Ellipsoid um den Kamerablick
        const r = 6 + Math.random() * 9;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        starts[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta) * 1.4;
        starts[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.8;
        starts[i * 3 + 2] = r * Math.cos(phi) * 0.5 - 2;

        const [x, y] = sampleKeyhole();
        const s = 2.15;
        targets[i * 3 + 0] = x * s;
        targets[i * 3 + 1] = y * s + 0.25;
        targets[i * 3 + 2] = (Math.random() * 2 - 1) * 0.22;

        rands[i] = Math.random();
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(starts.slice(), 3));
      geo.setAttribute("aStart", new THREE.BufferAttribute(starts, 3));
      geo.setAttribute("aTarget", new THREE.BufferAttribute(targets, 3));
      geo.setAttribute("aRand", new THREE.BufferAttribute(rands, 1));

      const uniforms = {
        uTime: { value: 0 },
        uProgress: { value: 0 }, // 0 verstreut -> 1 Schluesselloch
        uScatter: { value: 0 }, // Scroll-out-Aufloesung
        uOpacity: { value: 1 },
        uGlobalAlpha: { value: 1 },
        uSize: { value: 1 },
      };

      const material = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute vec3 aStart;
          attribute vec3 aTarget;
          attribute float aRand;
          uniform float uTime;
          uniform float uProgress;
          uniform float uScatter;
          uniform float uSize;
          varying float vAlpha;
          varying float vTone;

          void main() {
            float delay = aRand * 0.55;
            float t = clamp((uProgress - delay) / (1.0 - delay), 0.0, 1.0);
            t = 1.0 - pow(1.0 - t, 3.0);

            vec3 pos = mix(aStart, aTarget, t);

            float w = uTime * 0.55 + aRand * 40.0;
            pos.x += sin(w * 0.9) * 0.035 * (1.0 + (1.0 - t) * 6.0);
            pos.y += cos(w * 0.7) * 0.035 * (1.0 + (1.0 - t) * 6.0);
            pos.z += sin(w * 0.5) * 0.03;

            vec3 dir = normalize(aStart - aTarget + 0.0001);
            pos += dir * uScatter * (1.5 + aRand * 3.0);

            vec4 mv = modelViewMatrix * vec4(pos, 1.0);
            gl_Position = projectionMatrix * mv;

            float size = (0.7 + aRand * 1.6) * uSize;
            gl_PointSize = size * (46.0 / -mv.z);

            vAlpha = 0.22 + t * 0.65;
            vTone = aRand;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uOpacity;
          uniform float uGlobalAlpha;
          varying float vAlpha;
          varying float vTone;

          void main() {
            vec2 uv = gl_PointCoord - 0.5;
            float d = length(uv);
            if (d > 0.5) discard;
            float soft = smoothstep(0.5, 0.05, d);

            vec3 paper = vec3(0.96, 0.95, 0.92);
            vec3 gray = vec3(0.45, 0.46, 0.50);
            vec3 col = mix(paper, gray, smoothstep(0.35, 0.9, vTone));

            gl_FragColor = vec4(col, soft * vAlpha * uOpacity * uGlobalAlpha);
          }
        `,
      });

      const points = new THREE.Points(geo, material);
      const group = new THREE.Group();
      group.add(points);
      scene.add(group);

      // Responsive Platzierung: Schluesselloch rechts neben der Copy.
      const layout = () => {
        const w = canvas.clientWidth || window.innerWidth;
        const h = canvas.clientHeight || window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        if (w > 1000) {
          group.position.set(2.6, 0.1, 0);
          uniforms.uSize.value = 1;
          uniforms.uGlobalAlpha.value = 1;
        } else if (w > 640) {
          group.position.set(1.6, 0.4, -1);
          uniforms.uSize.value = 0.85;
          uniforms.uGlobalAlpha.value = 0.75;
        } else {
          group.position.set(0, 1.35, -3.6);
          uniforms.uSize.value = 0.6;
          uniforms.uGlobalAlpha.value = 0.45;
        }
      };
      layout();
      window.addEventListener("resize", layout);

      const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
      const onPointerMove = (e: PointerEvent) => {
        mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
      };
      window.addEventListener("pointermove", onPointerMove);

      const clock = new THREE.Clock();
      let running = true;
      let rafId = 0;

      function frame() {
        if (!running) {
          return;
        }
        uniforms.uTime.value = clock.getElapsedTime();
        mouse.x += (mouse.tx - mouse.x) * 0.04;
        mouse.y += (mouse.ty - mouse.y) * 0.04;
        group.rotation.y = mouse.x * 0.22 + Math.sin(uniforms.uTime.value * 0.18) * 0.07;
        group.rotation.x = -mouse.y * 0.12;
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(frame);
      }

      if (reduceMotion) {
        uniforms.uProgress.value = 1;
        renderer.render(scene, camera);
        running = false;
      } else {
        frame();
      }

      // Pausieren, wenn der Hero aus dem Viewport ist
      const io = new IntersectionObserver(([entry]) => {
        if (reduceMotion) {
          return;
        }
        if (entry.isIntersecting && !running) {
          running = true;
          frame();
        } else if (!entry.isIntersecting) {
          running = false;
        }
      });
      io.observe(canvas);

      // Choreographie (Preloader-Timeline, Scroll-Scatter) abonniert diese
      // Uniforms ueber das runtime-Handle.
      publishHeroUniforms(uniforms);

      cleanupScene = () => {
        running = false;
        cancelAnimationFrame(rafId);
        io.disconnect();
        window.removeEventListener("resize", layout);
        window.removeEventListener("pointermove", onPointerMove);
        clearHeroUniforms();
        geo.dispose();
        material.dispose();
        renderer.dispose();
      };

      // Effect wurde waehrend der Initialisierung abgeraeumt (StrictMode).
      if (disposed) {
        cleanupScene();
        cleanupScene = null;
      }
    })();

    return () => {
      disposed = true;
      cleanupScene?.();
      cleanupScene = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="hero__canvas"
      id="hero-canvas"
      role="img"
      aria-label="Dekorative Partikelanimation: ein Schlüsselloch aus Lichtpunkten"
    />
  );
}
