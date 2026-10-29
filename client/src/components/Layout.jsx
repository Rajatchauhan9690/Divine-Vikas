import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ShoppingBag,
  UserRound,
  Menu,
  X,
  Flower2,
  House,
  Store,
  CalendarDays,
  BookOpen,
  ShieldCheck,
  Package,
  LogOut,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../features/auth/AuthContext";
export default function Layout() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const { pathname, hash } = useLocation();
  const isAuthPage = pathname === "/login" || pathname === "/register";
  useEffect(() => {
    if (hash !== "#story") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("story")?.scrollIntoView({ behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hash, pathname]);
  const closeMenu = () => setOpen(false);
  return (
    <>
      {!isAuthPage && (
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
          >
            {open ? <X /> : <Menu />}
          </button>
          <nav className={open ? "nav open" : "nav"}>
            <NavLink to="/" onClick={closeMenu}>
              <House size={16} /> Home
            </NavLink>
            <NavLink to="/shop" onClick={closeMenu}>
              <Store size={16} /> Shop
            </NavLink>
            <NavLink to="/classes" onClick={closeMenu}>
              <CalendarDays size={16} /> Sessions
            </NavLink>
            <Link to="/#story" onClick={closeMenu}>
              <BookOpen size={16} /> Our-Story
            </Link>
            {user?.role === "admin" && (
              <NavLink to="/admin" onClick={closeMenu}>
                <ShieldCheck size={16} /> Admin
              </NavLink>
            )}
            <Link to="/cart" className="cart-link" onClick={closeMenu}>
              <ShoppingBag size={16} /> Cart
            </Link>
            {user && (
              <>
                <NavLink to="/orders" onClick={closeMenu}>
                  <Package size={16} /> My orders
                </NavLink>
                <NavLink to="/profile" onClick={closeMenu}>
                  <UserRound size={16} /> Profile
                </NavLink>
                <button
                  className="nav-text"
                  onClick={() => {
                    closeMenu();
                    logout();
                  }}
                >
                  <LogOut size={16} /> Sign out
                </button>
              </>
            )}
            {!user && (
              <Link to="/login" onClick={closeMenu}>
                <UserRound size={16} /> Sign in
              </Link>
            )}
          </nav>
        </header>
      )}
      <main>
        <Outlet />
      </main>
      {!isAuthPage && (
        <footer className="footer">
          <div className="brand footer-brand">
            <Flower2 />
            <span>
              Divine Vikas<small>FRAGRANCE OF DEVOTION</small>
            </span>
          </div>
          <p>Luxury is a feeling. Devotion is the fragrance.</p>
          <span>© {new Date().getFullYear()} Divine Vikas</span>
        </footer>
      )}
    </>
  );
}
