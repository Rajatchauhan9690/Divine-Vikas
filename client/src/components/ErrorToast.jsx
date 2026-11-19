import { useMemo } from "react";
import AdminToast from "./AdminToast";

export default function ErrorToast({ error, onDismiss }) {
  const toast = useMemo(
    () =>
      typeof error === "string" && error.trim()
        ? { type: "error", text: error }
        : null,
    [error],
  );

  return <AdminToast toast={toast} onDismiss={onDismiss} />;
}
