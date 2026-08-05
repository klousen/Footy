import { useState } from "react";
import type { AttributeKey, Position } from "../engine/types";
import { POSITION_OPTIONS } from "../engine/data";
import { ATTRIBUTE_LABEL } from "./labels";

const FOCUS_OPTIONS: { value: AttributeKey; hint: string }[] = [
  { value: "technik", hint: "Ballgefühl, Dribbling, Präzision" },
  { value: "tempo", hint: "Antritt, Sprintstärke" },
  { value: "physis", hint: "Kraft, Zweikampf, Ausdauer" },
  { value: "mentalitaet", hint: "Nervenstärke, Wille" },
];

export function CreatePlayer({ onCreate }: { onCreate: (name: string, position: Position, focus: AttributeKey) => void }) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState<Position>("ZM");
  const [focus, setFocus] = useState<AttributeKey>("technik");

  const canSubmit = name.trim().length >= 2;

  return (
    <div className="screen create-screen">
      <h2>Dein Spieler mit 14 Jahren</h2>
      <p className="muted">Lege den Grundstein für deine Karriere. Diese Wahl beeinflusst deinen frühen Spielstil.</p>

      <label className="field">
        <span>Name</span>
        <input
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          placeholder="z.B. Jonas Berger"
        />
      </label>

      <div className="field">
        <span>Position</span>
        <div className="option-grid">
          {POSITION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={"option-card" + (position === opt.value ? " selected" : "")}
              onClick={() => setPosition(opt.value)}
            >
              <strong>{opt.label}</strong>
              <span>{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Frühe Stärke</span>
        <div className="option-grid">
          {FOCUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={"option-card" + (focus === opt.value ? " selected" : "")}
              onClick={() => setFocus(opt.value)}
            >
              <strong>{ATTRIBUTE_LABEL[opt.value]}</strong>
              <span>{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <button className="btn btn-primary" disabled={!canSubmit} onClick={() => onCreate(name.trim(), position, focus)}>
        Karriere beginnen
      </button>
    </div>
  );
}
