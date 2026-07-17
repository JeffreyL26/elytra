// Laufzeit-Handles zwischen den Marketing-Client-Components.
//
// HeroScene (three.js) und ScrollChoreography (GSAP) mounten unabhaengig und
// initialisieren asynchron (dynamischer three-Import). Dieses Modul entkoppelt
// die beiden: die Szene publiziert ihre Shader-Uniforms, die Choreographie
// abonniert sie -- egal, wer zuerst fertig ist. Kein window-Global, kein
// Render-Pfad-Zugriff.

export type HeroUniforms = {
  uProgress: { value: number };
  uScatter: { value: number };
  uOpacity: { value: number };
};

let heroUniforms: HeroUniforms | null = null;
const uniformSubscribers = new Set<(u: HeroUniforms) => void>();

export function publishHeroUniforms(uniforms: HeroUniforms): void {
  heroUniforms = uniforms;
  for (const notify of uniformSubscribers) {
    notify(uniforms);
  }
}

export function clearHeroUniforms(): void {
  heroUniforms = null;
}

// Liefert eine Unsubscribe-Funktion. Ist die Szene schon da, feuert der
// Callback sofort (synchron) -- der Abonnent muss damit rechnen.
export function onHeroUniforms(subscriber: (u: HeroUniforms) => void): () => void {
  if (heroUniforms) {
    subscriber(heroUniforms);
  }
  uniformSubscribers.add(subscriber);
  return () => {
    uniformSubscribers.delete(subscriber);
  };
}

// Lenis-Instanz der Choreographie. Die Nav braucht sie, um das Scrolling bei
// geoeffnetem Mobile-Menu anzuhalten. Typ bewusst strukturell statt Import,
// damit dieses Modul keine lenis-Abhaengigkeit in Server-Bundles zieht.
type LenisLike = { stop: () => void; start: () => void };

let lenisInstance: LenisLike | null = null;

export function setLenis(lenis: LenisLike | null): void {
  lenisInstance = lenis;
}

export function getLenis(): LenisLike | null {
  return lenisInstance;
}
