import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { createPortal } from "react-dom";

function ToastItem({ toast, onDismiss, duration }) {
  useEffect(() => {
    if (duration === null) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDismiss, toast.id]);

  const isError = toast.type === "error";
  const Icon = isError ? XCircle : CheckCircle2;

  return (
    <div
      className={`admin-toast ${isError ? "error" : "success"}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      <Icon size={19} aria-hidden="true" />
      <span>{toast.text}</span>
      <button
        type="button"
        className="admin-toast-dismiss"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
      >
        <X size={17} />
      </button>
    </div>
  );
}

export default function AdminToast({ toast, onDismiss, duration = 4500 }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const lastToast = useRef(null);
  const latestId = useRef(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!toast) {
      lastToast.current = null;
      return;
    }
    if (lastToast.current === toast) return;
    lastToast.current = toast;
    const id = ++nextId.current;
    latestId.current = id;
    setToasts((current) => [...current, { ...toast, id }]);
  }, [toast]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    if (latestId.current === id) {
      latestId.current = null;
      onDismissRef.current?.();
    }
  }, []);

  if (!toasts.length) return null;

  return createPortal(
    <div className="admin-toast-stack">
      {toasts.map((item) => (
        <ToastItem
          key={item.id}
          toast={item}
          onDismiss={dismiss}
          duration={duration}
        />
      ))}
    </div>,
    document.body,
  );
}
