import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Flower2, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../features/auth/AuthContext";
export default function Auth({ mode = "login" }) {
  const isLogin = mode === "login";
  const [form, setForm] = useState({ name: "", email: "", password: "" }),
    [show, setShow] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const { login, register } = useAuth();
  const nav = useNavigate();
  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const u = isLogin
        ? await login({ email: form.email, password: form.password })
        : await register(form);
      nav(u.role === "admin" ? "/admin" : "/shop");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={`auth-page ${isLogin ? "auth-login" : "auth-register"}`}>
      <div className="auth-art">
        <img
          src="https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=1000&q=80"
          alt="Perfume and flowers"
        />
        <div>
          <span className="eyebrow">A MOMENT JUST FOR YOU</span>
          <h2>
            Make room for
            <br />
            <em>beautiful rituals.</em>
          </h2>
        </div>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-topbar">
          <div className="auth-brand">
            <Flower2 />
            <span>DIVINE VIKAS</span>
          </div>
          <Link to="/" className="auth-home-link">
            <ArrowLeft size={15} />
            Back to home
          </Link>
        </div>
        <span className="eyebrow">
          WELCOME {isLogin ? "BACK" : "TO OUR WORLD"}
        </span>
        <h1>{isLogin ? "Good to see you." : "Create your account."}</h1>
        <p>
          {isLogin
            ? "Sign in to continue your fragrance journey."
            : "Join us for thoughtful everyday luxury."}
        </p>
        <form onSubmit={submit} className="form-stack">
          {!isLogin && (
            <label>
              Full name
              <input
                name="name"
                value={form.name}
                onChange={update}
                required
                minLength="2"
                autoComplete="name"
                placeholder="Your name"
              />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={update}
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <div className="password-input">
              <input
                name="password"
                type={show ? "text" : "password"}
                value={form.password}
                onChange={update}
                required
                minLength="8"
                autoComplete={isLogin ? "current-password" : "new-password"}
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label="Toggle password visibility"
              >
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          {error && <p className="notice error">{error}</p>}
          <button className="btn btn-dark btn-full" disabled={busy}>
            {busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="auth-switch">
          {isLogin ? "New to Divine Vikas? " : "Already have an account? "}
          <Link to={isLogin ? "/register" : "/login"}>
            {isLogin ? "Create an account" : "Sign in"}
          </Link>
        </p>
        <small className="auth-note">
          Your account is protected with secure session-based authentication.
        </small>
      </div>
    </section>
  );
}
