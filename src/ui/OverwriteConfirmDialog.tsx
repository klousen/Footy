import { useLanguage } from "./LanguageContext";

/** Bestätigungsdialog fürs Überschreiben eines belegten Slots (Free-Tier, siehe
 * Handoff Abschnitt 3: "Neue Karriere starten bei vorhandenem Slot → Bestätigungsdialog"). */
export function OverwriteConfirmDialog({
  playerName,
  onConfirm,
  onCancel,
}: {
  playerName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t("overwriteTitle")}</h3>
        </div>
        <p className="muted">{t("overwriteText").replace("{name}", playerName)}</p>
        <div className="end-career-actions">
          <button className="btn btn-primary" onClick={onConfirm}>
            {t("overwriteConfirm")}
          </button>
          <button className="btn btn-ghost" onClick={onCancel}>
            {t("overwriteCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
