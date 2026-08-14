import { useEffect, useRef, useState } from "react";
import type { Achievement, Player } from "../engine/types";
import { buildShareCaption, buildShareCardData, drawShareCard } from "../engine/shareCard";

/**
 * Sharepic für das Karriereende - eine herunterladbare/teilbare "Spielerkarte"
 * mit Name, Position, Gesamtstärke, Legacy-Titel und den wichtigsten Stats/
 * Erfolgen. Zeichnet auf einen sichtbaren Canvas (dient direkt als Vorschau),
 * damit ein Rechtsklick → "Bild speichern unter" in jeder Umgebung als
 * Fallback funktioniert, auch wenn der Download-Button z.B. in einer
 * sandboxed Umgebung blockiert werden sollte.
 */
export function ShareCard({
  player,
  legacyScore,
  legacyTier,
  achievements,
  careerTitle,
}: {
  player: Player;
  legacyScore?: number;
  legacyTier?: string;
  achievements?: Achievement[];
  careerTitle?: { label: string; description: string };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  const data = buildShareCardData(player, legacyScore, legacyTier, achievements, careerTitle);

  useEffect(() => {
    if (canvasRef.current) drawShareCard(canvasRef.current, data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.name, legacyScore, legacyTier, achievements, careerTitle]);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `footca-${player.name.replace(/\s+/g, "-").toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, "image/png");
  }

  function handleOpenInNewTab() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const win = window.open();
    if (win) {
      win.document.write(
        `<title>Footca - ${player.name}</title><body style="margin:0;background:#0d1117;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${dataUrl}" style="max-width:100%;height:auto;" /></body>`
      );
    }
  }

  async function handleCopyCaption() {
    try {
      await navigator.clipboard.writeText(buildShareCaption(data));
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2500);
    } catch {
      setCopyStatus("failed");
      setTimeout(() => setCopyStatus("idle"), 2500);
    }
  }

  async function handleShare() {
    const canvas = canvasRef.current;
    if (!canvas || !navigator.share) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `footca-${player.name}.png`, { type: "image/png" });
      const shareData = { files: [file], title: "Footca", text: buildShareCaption(data) };
      const canShareFiles = "canShare" in navigator && navigator.canShare?.({ files: [file] });
      try {
        if (canShareFiles) {
          await navigator.share(shareData);
        } else {
          await navigator.share({ title: "Footca", text: buildShareCaption(data) });
        }
      } catch {
        // Nutzer hat den Teilen-Dialog abgebrochen - kein Fehler, einfach ignorieren.
      }
    }, "image/png");
  }

  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="panel share-card-panel">
      <h3>Karriere-Sharepic</h3>
      <p className="muted trait-hint">
        Deine Karriere als Bild zum Teilen - lade es herunter oder öffne es in einem neuen Tab, um es zu speichern.
      </p>
      <div className="share-card-preview">
        <canvas ref={canvasRef} className="share-card-canvas" />
      </div>
      <div className="share-card-actions">
        <button className="btn btn-primary" onClick={handleDownload}>
          Bild herunterladen
        </button>
        <button className="btn btn-ghost" onClick={handleOpenInNewTab}>
          In neuem Tab öffnen
        </button>
        <button className="btn btn-ghost" onClick={handleCopyCaption}>
          {copyStatus === "copied" ? "Text kopiert ✓" : copyStatus === "failed" ? "Kopieren fehlgeschlagen" : "Text zum Teilen kopieren"}
        </button>
        {canNativeShare && (
          <button className="btn btn-ghost" onClick={handleShare}>
            Teilen…
          </button>
        )}
      </div>
    </div>
  );
}
