import { useState } from "react";
import { ArrowLeft, Flower2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import Seo from "../components/Seo";

export default function PasswordReset() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [step, setStep] = useState("request");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function requestCode(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    setBusy(true);
    try {
      await api.post("/auth/password-reset/request", { email });
      setStep("verify");
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "We could not send a reset code. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/auth/password-reset/confirm", {
        email,
        otp,
        password,
      });
      setMessage(data.message);
      setStep("complete");
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "We could not reset your password. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`auth-form-wrap${step === "verify" ? " auth-form-wrap--verify" : ""}`}
    >
      <Seo
        title="Reset Your Password"
        description="Securely reset the password for your Divine Vikas account."
        robots="noindex, nofollow"
      />
      <div className="auth-topbar">
        <div className="auth-brand">
          <Flower2 />
          <span>DIVINE VIKAS</span>
        </div>
        <Link to="/login" className="auth-home-link">
          <ArrowLeft size={15} />
          Back to sign in
        </Link>
      </div>
      <div
        key={step}
        className={`password-reset-stage${step === "verify" ? " password-reset-stage--verify" : ""}`}
      >
        {step !== "verify" && (
          <span className="eyebrow">ACCOUNT RECOVERY</span>
        )}
        <h1>
          {step === "complete"
            ? "Password updated."
            : step === "verify"
              ? "Check your messages."
              : "Forgot-Password?"}
        </h1>
        <p className={step === "verify" ? "password-reset-instructions" : ""}>
          {step === "request"
            ? "We’ll send a six-digit code to your account email."
            : step === "verify"
              ? "Enter the code and choose a new password. The code expires in 10 minutes."
              : "Your password has been changed. Sign in with your new password."}
        </p>

        {message && <p className="notice">{message}</p>}
        {error && <p className="notice error">{error}</p>}

        {step === "request" && (
          <form onSubmit={requestCode} className="form-stack">
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                placeholder="you@example.com"
              />
            </label>
            <button className="btn btn-dark btn-full" disabled={busy}>
              {busy ? "Sending code…" : "Send reset code"}
            </button>
          </form>
        )}

        {step === "verify" && (
          <form onSubmit={resetPassword} className="form-stack">
            <label>
              Six-digit code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                required
                placeholder="000000"
              />
            </label>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                placeholder="At least 8 characters"
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                placeholder="Enter the password again"
              />
            </label>
            <button className="btn btn-dark btn-full" disabled={busy}>
              {busy ? "Updating password…" : "Reset password"}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-full"
              disabled={busy}
              onClick={() => {
                setStep("request");
                setOtp("");
                setPassword("");
                setConfirmation("");
                setMessage("");
                setError("");
              }}
            >
              Use a different email
            </button>
          </form>
        )}

        {step === "complete" && (
          <button
            className="btn btn-dark btn-full"
            onClick={() => navigate("/login")}
          >
            Go to sign in
          </button>
        )}

        {step === "request" && (
          <small className="auth-note">
            Make sure you can access the email address linked to your account.
          </small>
        )}
      </div>
    </div>
  );
}
