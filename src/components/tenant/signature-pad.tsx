import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

export type SignatureValue =
  | { kind: "drawn"; dataUrl: string }
  | { kind: "typed"; typedName: string };

type Props = {
  fullName: string;
  onChange: (value: SignatureValue | null) => void;
};

/**
 * Simple signature capture: draw on canvas OR type name as e-signature.
 * Emits a SignatureValue whenever the user provides input; null when cleared.
 */
export function SignaturePad({ fullName, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [typed, setTyped] = useState("");
  const [mode, setMode] = useState<"draw" | "type">("draw");

  // Size canvas to its parent for crisp lines on hidpi.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(ratio, ratio);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 2;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const emitDrawn = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHasDrawing(true);
    onChange({ kind: "drawn", dataUrl: canvas.toDataURL("image/png") });
  };

  const pointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointer(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDrawing(true);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointer(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const onUp = () => {
    if (!drawing) return;
    setDrawing(false);
    emitDrawn();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
    onChange(null);
  };

  return (
    <Tabs value={mode} onValueChange={(v) => {
      setMode(v as "draw" | "type");
      // Reset when switching modes so parent doesn't have stale value.
      onChange(null);
      clear();
      setTyped("");
    }}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="draw">Draw signature</TabsTrigger>
        <TabsTrigger value="type">Type name</TabsTrigger>
      </TabsList>

      <TabsContent value="draw" className="space-y-2">
        <div className="rounded-md border bg-white">
          <canvas
            ref={canvasRef}
            className="block h-40 w-full touch-none rounded-md"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{hasDrawing ? "Signature captured" : "Sign inside the box"}</span>
          <Button type="button" variant="ghost" size="sm" onClick={clear}>Clear</Button>
        </div>
      </TabsContent>

      <TabsContent value="type" className="space-y-2">
        <Label htmlFor="typed-sig">Type your full legal name as your signature</Label>
        <Input
          id="typed-sig"
          value={typed}
          maxLength={100}
          placeholder={fullName || "Full name"}
          onChange={(e) => {
            const v = e.target.value;
            setTyped(v);
            onChange(v.trim() ? { kind: "typed", typedName: v.trim() } : null);
          }}
        />
        {typed && (
          <div className="rounded-md border bg-muted/40 p-3 font-serif text-2xl italic">
            {typed}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
