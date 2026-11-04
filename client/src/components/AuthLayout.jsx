import { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";

const authImage =
  "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=1000&q=80";

export default function AuthLayout() {
  const { pathname } = useLocation();
  const pageClass =
    pathname === "/login"
      ? "auth-login"
      : pathname === "/register"
        ? "auth-register"
        : "auth-password-reset";

  return (
    <section className={`auth-page ${pageClass}`}>
      <div className="auth-art">
        <img src={authImage} alt="Perfume and flowers" />
        <div>
          <span className="eyebrow">A MOMENT JUST FOR YOU</span>
          <h2>
            Make room for
            <br />
            <em>beautiful rituals.</em>
          </h2>
        </div>
      </div>
      <div className="auth-panel">
        <Suspense fallback={<div className="auth-route-loading" />}>
          <div key={pathname} className="auth-route-transition">
            <Outlet />
          </div>
        </Suspense>
      </div>
    </section>
  );
}
