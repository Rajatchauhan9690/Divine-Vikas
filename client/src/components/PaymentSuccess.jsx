import { useEffect, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { createPortal } from "react-dom";

export default function PaymentSuccess({
  title = "Payment successful",
  message,
  details = [],
  returnTo,
  onClose,
}) {
  const [secondsLeft, setSecondsLeft] = useState(60);
  const secondsRef = useRef(60);
  const onCloseRef = useRef(onClose);
  const completed = useRef(false);
  onCloseRef.current = onClose;

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = secondsRef.current - 1;
      secondsRef.current = next;
      setSecondsLeft(next);
      if (next <= 0) {
        window.clearInterval(timer);
        if (!completed.current) {
          completed.current = true;
          onCloseRef.current();
        }
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  function close() {
    if (completed.current) return;
    completed.current = true;
    onCloseRef.current();
  }

  return createPortal(
    <div className="payment-success-overlay">
      <section
        className="payment-success-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-success-title"
        aria-describedby="payment-success-description"
      >
        <button
          type="button"
          className="payment-success-close"
          onClick={close}
          aria-label={`Return to ${returnTo}`}
        >
          <X size={21} />
        </button>
        <header className="payment-success-hero">
          <div className="payment-success-icon" aria-hidden="true">
            <CheckCircle2 size={34} />
          </div>
          <div className="payment-success-copy">
            <span className="eyebrow">PAYMENT CONFIRMED</span>
            <h1 id="payment-success-title">{title}</h1>
            <p id="payment-success-description">{message}</p>
          </div>
        </header>
        {details.length > 0 && (
          <dl className="payment-success-details">
            {details.map(({ label, value }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="payment-success-footer">
          <span className="payment-success-footer-icon" aria-hidden="true">
            <CheckCircle2 size={18} />
          </span>
          <p role="status" aria-live="polite">
            Returning to <strong>{returnTo}</strong> in{" "}
            <strong>{secondsLeft} seconds</strong>. Close this screen to return
            now.
          </p>
        </div>
      </section>
    </div>,
    document.body,
  );
}
