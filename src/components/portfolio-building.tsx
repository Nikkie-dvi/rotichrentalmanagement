import { useEffect, useRef, useState } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export type BuildingUnit = { id: string; unit_number: string; status: string; rent_amount: number };

export function PortfolioBuilding({ units }: { units: BuildingUnit[] }) {
  const host = useRef<HTMLDivElement>(null);
  const turn = useRef(0);
  const [selected, setSelected] = useState<BuildingUnit | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let cleanup = () => {};
    void import("three").then(THREE => {
      if (disposed) return;
      const token = (name: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (!ctx) return new THREE.Color();
        ctx.fillStyle = getComputedStyle(element).getPropertyValue(name).trim();
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return new THREE.Color(`rgb(${r},${g},${b})`);
      };
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
      catch { setUnavailable(true); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      element.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
      camera.position.set(6, 4.5, 8);
      camera.lookAt(0, 0.3, 0);
      scene.add(new THREE.AmbientLight(token("--foreground"), 2.2));
      const light = new THREE.DirectionalLight(token("--foreground"), 4);
      light.position.set(4, 8, 5); scene.add(light);
      const building = new THREE.Group(); scene.add(building);
      const materials: InstanceType<typeof THREE.MeshStandardMaterial>[] = [];
      const geometries: InstanceType<typeof THREE.BoxGeometry>[] = [];
      const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => {
        const geometry = new THREE.BoxGeometry(w, h, d); geometries.push(geometry);
        const material = new THREE.MeshStandardMaterial({ color: token(color), roughness: 0.65 }); materials.push(material);
        const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); building.add(mesh); return mesh;
      };
      box(3.1, 3.7, 2, 0, 0, 0, "--building-wall");
      box(3.5, 0.18, 2.4, 0, 1.93, 0, "--primary");
      box(3.7, 0.2, 2.6, 0, -1.95, 0, "--muted");
      box(0.65, 0.85, 0.08, 0, -1.4, 1.05, "--building-glass");
      const windows: InstanceType<typeof THREE.Mesh>[] = [];
      const slots = Math.max(9, Math.min(units.length, 24));
      const floors = Math.ceil(slots / 3);
      for (let i = 0; i < slots; i++) {
        const unit = units[i];
        const mesh = box(0.58, Math.min(0.58, 2.7 / floors - 0.12), 0.1, (i % 3 - 1) * 0.95, 1.45 - Math.floor(i / 3) * (2.7 / floors), 1.05, unit ? unit.status === "occupied" ? "--primary" : "--warning" : "--building-glass");
        if (unit) { mesh.userData.unit = unit; windows.push(mesh); }
      }
      for (const y of [-0.8, 0.2, 1.2]) box(3.2, 0.07, 2.1, 0, y, 0, "--border");
      const resize = () => { const w = element.clientWidth, h = element.clientHeight; renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); };
      const observer = new ResizeObserver(resize); observer.observe(element); resize();
      const raycaster = new THREE.Raycaster();
      let startX = 0, moved = false;
      const down = (e: PointerEvent) => { startX = e.clientX; moved = false; element.setPointerCapture(e.pointerId); };
      const move = (e: PointerEvent) => { if (!element.hasPointerCapture(e.pointerId)) return; const delta = e.clientX - startX; if (Math.abs(delta) > 2) moved = true; turn.current += delta * 0.008; startX = e.clientX; };
      const up = (e: PointerEvent) => {
        if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
        if (moved) return;
        const rect = element.getBoundingClientRect();
        raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), camera);
        const hit = raycaster.intersectObjects(windows)[0];
        if (hit?.object.userData.unit) setSelected(hit.object.userData.unit);
      };
      element.addEventListener("pointerdown", down); element.addEventListener("pointermove", move); element.addEventListener("pointerup", up);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let frame = 0;
      const animate = () => { building.rotation.y += (turn.current - building.rotation.y) * (reduced ? 1 : 0.12); renderer.render(scene, camera); frame = requestAnimationFrame(animate); }; animate();
      cleanup = () => { cancelAnimationFrame(frame); observer.disconnect(); element.removeEventListener("pointerdown", down); element.removeEventListener("pointermove", move); element.removeEventListener("pointerup", up); materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose()); renderer.dispose(); renderer.domElement.remove(); };
    }).catch(() => setUnavailable(true));
    return () => { disposed = true; cleanup(); };
  }, [units]);

  return <div className="relative min-w-0">
    <div ref={host} className="portfolio-building h-64 w-full sm:h-80" role="img" aria-label="Interactive rental building with occupied and vacant unit windows" />
    {unavailable && <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Building preview unavailable</div>}
    <div className="flex items-center justify-center gap-2">
      <Button variant="ghost" size="icon" aria-label="Rotate building left" title="Rotate building left" onClick={() => { turn.current -= Math.PI / 4; }}><RotateCcw className="h-4 w-4" /></Button>
      <span className="text-xs text-muted-foreground">{selected ? `Unit ${selected.unit_number} · ${selected.status}` : `${units.length} units`}</span>
      <Button variant="ghost" size="icon" aria-label="Rotate building right" title="Rotate building right" onClick={() => { turn.current += Math.PI / 4; }}><RotateCw className="h-4 w-4" /></Button>
    </div>
  </div>;
}