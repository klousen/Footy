import type { SaveSlot } from "../engine/storage";
import { overallRating } from "../engine/careerEngine";
import { overallTier } from "../engine/labels";
import { useLanguage } from "./LanguageContext";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Slot-Auswahl (siehe Handoff Abschnitt 3): zeigt für jeden der bis zu 3 Slots
 * eine Karte - belegt (tippen = laden & spielen), frei innerhalb des Limits
 * (tippen = neue Karriere dort starten) oder gesperrt (Free-Tier, tippen =
 * Paywall-Platzhalter).
 */
export function SlotSelectScreen({
  slots,
  slotLimit,
  onSelectSlot,
  onNewCareerInSlot,
  onLockedTap,
  onUpgrade,
  onBack,
}: {
  slots: SaveSlot[];
  slotLimit: number;
  onSelectSlot: (slotId: string) => void;
  onNewCareerInSlot: (slotId: string) => void;
  onLockedTap: () => void;
  onUpgrade: () => void;
  onBack: () => void;
}) {
  const { t } = useLanguage();
  const slotIds = ["slot-1", "slot-2", "slot-3"];
  const anyLocked = slotLimit < slotIds.length;

  return (
    <div className="screen tm-screen">
      <button className="tm-back-link" onClick={onBack}>
        {t("backToTitle")}
      </button>

      <div className="tm-slot-header">
        <div className="tm-slot-eyebrow">{t("slotEyebrow")}</div>
        <h1 className="tm-slot-title">{t("slotTitle")}</h1>
      </div>

      <div className="tm-slot-list">
        {slotIds.map((id, i) => {
          const locked = i + 1 > slotLimit;
          const occupied = slots.find((s) => s.id === id);
          const player = occupied?.state.player ?? null;

          if (locked) {
            return (
              <div key={id} className="tm-slot-card locked" onClick={onLockedTap}>
                <div className="tm-slot-avatar" style={{ opacity: 0.4 }}>
                  +
                </div>
                <div className="tm-slot-info">
                  <div className="tm-slot-name" style={{ opacity: 0.5 }}>
                    {t("emptySlotLabel")} {i + 1}
                  </div>
                  <div className="tm-slot-lock-badge">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M6 10V8a6 6 0 1112 0v2M5 10h14a1 1 0 011 1v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9a1 1 0 011-1z"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                    {t("passBadge")}
                  </div>
                </div>
              </div>
            );
          }

          if (player) {
            const tier = overallTier(overallRating(player));
            return (
              <div key={id} className="tm-slot-card" onClick={() => onSelectSlot(id)}>
                <div className="tm-slot-avatar">{initials(player.name)}</div>
                <div className="tm-slot-info">
                  <div className="tm-slot-name">{player.name}</div>
                  <div className="tm-slot-meta">
                    {player.age} {t("yearsAbbr")} · {overallRating(player)} OVR · {tier.label.toUpperCase()}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={id} className="tm-slot-card" onClick={() => onNewCareerInSlot(id)}>
              <div className="tm-slot-avatar">+</div>
              <div className="tm-slot-info">
                <div className="tm-slot-name">{t("newCareerSlot")}</div>
                <div className="tm-slot-meta">
                  {t("emptySlotLabel")} {i + 1}
                </div>
              </div>
              <div className="tm-slot-add">+</div>
            </div>
          );
        })}
      </div>

      {anyLocked && (
        <div className="tm-pass-banner">
          <div className="tm-pass-banner-text">
            <strong>{t("passBannerTitle")}</strong>
            {t("passBannerText")}
          </div>
          <button className="tm-pass-banner-btn" onClick={onUpgrade}>
            {t("passBannerBtn")}
          </button>
        </div>
      )}
    </div>
  );
}
