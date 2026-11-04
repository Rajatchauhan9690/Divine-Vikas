import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ShoppingBag,
  UserRound,
  Menu,
  X,
  Flower2,
  House,
  Store,
  ShieldCheck,
  Package,
  LogOut,
  MessageCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { useCart } from "../features/cart/CartContext";
export default function Layout() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const { count } = useCart();
  const { pathname, hash } = useLocation();
  const isAuthPage =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/password-reset";
  const isInvitationPage = pathname === "/sub-admin-invitation";
  const hideFooterOnMobile =
    pathname === "/shop" ||
    pathname === "/classes" ||
    pathname === "/orders" ||
    pathname === "/profile" ||
    pathname === "/support" ||
    pathname === "/cart" ||
    pathname.startsWith("/products/");
  useEffect(() => {
    if (hash !== "#story") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("story")?.scrollIntoView({ behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hash, pathname]);
  const closeMenu = () => setOpen(false);
  const isSubAdmin = user?.role === "sub_admin";
  const isAdmin = user?.role === "admin";
  return (
    <>
      {!isAuthPage && !isInvitationPage && (
        <header className="site-header">
          <Link to="/" className="brand" onClick={closeMenu}>
            <span className="brand-mark">
              <Flower2 size={24} />
            </span>
            <span>
              Divine Vikas<small>FRAGRANCE OF DEVOTION</small>
            </span>
          </Link>
          <button
            className="mobile-menu"
            onClick={() => setOpen(!open)}
            aria-label="Toggle navigation"
            aria-controls="site-navigation"
            aria-expanded={open}
          >
            {open ? <X /> : <Menu />}
          </button>
          <nav id="site-navigation" className={open ? "nav open" : "nav"}>
            <NavLink to="/" onClick={closeMenu}>
              <House size={16} /> Home
            </NavLink>
            {isSubAdmin ? (
              <>
                <NavLink to="/admin" onClick={closeMenu}>
                  <ShieldCheck size={16} /> Subadmin
                </NavLink>
                <NavLink to="/shop" onClick={closeMenu}>
                  <Store size={16} /> Shop
                </NavLink>
                <NavLink to="/cart" className="cart-link" onClick={closeMenu}>
                  <ShoppingBag size={16} /> Cart
                  {count > 0 && (
                    <span className="cart-count" aria-label={`${count} items`}>
                      {count}
                    </span>
                  )}
                </NavLink>
              </>
            ) : (
              <>
                {!isAdmin && (
                  <NavLink to="/shop" onClick={closeMenu}>
                    <Store size={16} /> Shop
                  </NavLink>
                )}
                {(user?.role === "admin") && (
                  <NavLink to="/admin" onClick={closeMenu}>
                    <ShieldCheck size={16} /> Admin
                  </NavLink>
                )}
                {!isAdmin && (
                  <NavLink to="/cart" className="cart-link" onClick={closeMenu}>
                    <ShoppingBag size={16} /> Cart
                    {count > 0 && (
                      <span className="cart-count" aria-label={`${count} items`}>
                        {count}
                      </span>
                    )}
                  </NavLink>
                )}
              </>
            )}
            {user && (
              <>
                {!isSubAdmin && !isAdmin && (
                  <NavLink to="/orders" onClick={closeMenu}>
                    <Package size={16} /> My orders
                  </NavLink>
                )}
                <NavLink to="/profile" onClick={closeMenu}>
                  <UserRound size={16} /> Profile
                </NavLink>
                {!isSubAdmin && (
                  <NavLink
                    to="/support"
                    className="mobile-support-link"
                    onClick={closeMenu}
                  >
                    <MessageCircle size={16} /> Contact support
                  </NavLink>
                )}
                <button
                  className="nav-text nav-signout"
                  onClick={() => {
                    closeMenu();
                    void logout();
                  }}
                >
                  <LogOut size={16} /> Sign out
                </button>
              </>
            )}
            {!user && (
              <>
                <Link to="/login" onClick={closeMenu}>
                  <UserRound size={16} /> Sign in
                </Link>
                <NavLink
                  to="/support"
                  className="mobile-support-link"
                  onClick={closeMenu}
                >
                  <MessageCircle size={16} /> Contact support
                </NavLink>
              </>
            )}
          </nav>
        </header>
      )}
      <main>
        <div
          key={isAuthPage ? "auth-pages" : pathname}
          className="page-transition"
        >
          <Outlet />
        </div>
      </main>
      {!isAuthPage && !isInvitationPage && (
        <footer
          className={`footer${hideFooterOnMobile ? " mobile-hidden-footer" : ""}`}
        >
          <div className="brand footer-brand">
            <Flower2 />
            <span>
              Divine Vikas<small>FRAGRANCE OF DEVOTION</small>
            </span>
          </div>
          <p>Luxury is a feeling. Devotion is the fragrance.</p>
          {!isSubAdmin && !isAdmin && <Link to="/classes">Sessions</Link>}
          {!isAdmin && !isSubAdmin && <Link to="/services">Appointments</Link>}
          {!isAdmin && <Link to="/support">Customer support</Link>}
          <span>© {new Date().getFullYear()} Divine Vikas</span>
        </footer>
      )}
    </>
  );
}
