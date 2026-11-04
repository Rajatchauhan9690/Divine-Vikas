import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function AdminConfirmDialog({
  title,
  description,
  confirmLabel = "Delete",
  busy = false,
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
      className="confirm-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        className="confirm-dialog admin-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        aria-describedby="admin-confirm-description"
      >
        <h2 id="admin-confirm-title">{title}</h2>
        <p id="admin-confirm-description">{description}</p>
        <div className="inline-actions admin-confirm-actions">
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy}
            autoFocus
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
