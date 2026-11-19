import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function AdminConfirmDialog({
  title,
  description,
  confirmLabel = "Delete",
  busyLabel = "Deleting…",
  busy = false,
  eyebrow,
  icon,
  overlayClassName = "confirm-overlay",
  dialogClassName = "confirm-dialog admin-confirm-dialog",
  actionsClassName = "inline-actions admin-confirm-actions",
  cancelLabel = "Cancel",
  cancelClassName = "btn btn-outline",
  confirmClassName = "btn btn-danger",
  role = "dialog",
  onCancel,
  onConfirm,
}) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  return createPortal(
    <div
      className={overlayClassName}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        className={dialogClassName}
        role={role}
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        aria-describedby="admin-confirm-description"
      >
        {icon && <div className="class-exit-icon" aria-hidden="true">{icon}</div>}
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2 id="admin-confirm-title">{title}</h2>
        <p id="admin-confirm-description">{description}</p>
        <div className={actionsClassName}>
          <button
            type="button"
            className={cancelClassName}
            disabled={busy}
            autoFocus
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={confirmClassName}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
