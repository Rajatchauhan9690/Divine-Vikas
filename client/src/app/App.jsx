import { lazy, Suspense, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "../components/Layout";
import AuthLayout from "../components/AuthLayout";
import Seo from "../components/Seo";
import RouteLoading from "../components/RouteLoading";
import Home from "../pages/Home";
import { api } from "../services/api";
const routeLoaders = {
  play: () => import("../features/offering-game/OfferingGame"),
  shop: () => import("../pages/Shop"),
  product: () => import("../pages/Product"),
  auth: () => import("../pages/Auth"),
  cart: () => import("../pages/Cart"),
  admin: () => import("../pages/Admin"),
  classes: () => import("../pages/ClassBookings"),
  services: () => import("../pages/ServiceBookings"),
  "sub-admin-invitation": () => import("../pages/SubAdminInvitation"),
  profile: () => import("../pages/Profile"),
  orders: () => import("../pages/Orders"),
  support: () => import("../pages/Support"),
  "password-reset": () => import("../pages/PasswordReset"),
};
const prefetchedRoutes = new Map();
const prefetchedData = new Map();

function getRouteKey(pathname) {
  if (pathname.startsWith("/products/")) return "product";
  if (pathname === "/orders" || pathname.startsWith("/orders/")) return "orders";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/login" || pathname === "/register") return "auth";
  return pathname.replace(/^\/+|\/+$/g, "");
}

function prefetchRoute(pathname) {
  const routeKey = getRouteKey(pathname);
  const loadRoute = routeLoaders[routeKey];
  if (!loadRoute || prefetchedRoutes.has(routeKey)) return;

  const loading = loadRoute().catch((error) => {
    prefetchedRoutes.delete(routeKey);
    console.error(`Failed to prefetch the "${routeKey}" route.`, error);
  });
  prefetchedRoutes.set(routeKey, loading);
}

function prefetchData(key, request) {
  if (prefetchedData.has(key)) return;

  const loading = request()
    .catch((error) => {
      console.error(`Failed to prefetch "${key}".`, error);
    })
    .finally(() => {
      prefetchedData.delete(key);
    });
  prefetchedData.set(key, loading);
}

const routeDataPrefetchers = {
  shop: () =>
    prefetchData("shop products", () =>
      api.get("/products", { params: { search: "", category: "" } }),
    ),
  product: (pathname) => {
    const productId = pathname.slice("/products/".length);
    if (!productId) return;

    prefetchData(`product ${productId}`, () =>
      api.get(`/products/${productId}`),
    );
  },
};

const Shop = lazy(routeLoaders.shop);
const Product = lazy(routeLoaders.product);
const Auth = lazy(routeLoaders.auth);
const Cart = lazy(routeLoaders.cart);
const Admin = lazy(routeLoaders.admin);
const ClassBookings = lazy(routeLoaders.classes);
const ServiceBookings = lazy(routeLoaders.services);
const SubAdminInvitation = lazy(routeLoaders["sub-admin-invitation"]);
const Profile = lazy(routeLoaders.profile);
const Orders = lazy(routeLoaders.orders);
const Support = lazy(routeLoaders.support);
const PasswordReset = lazy(routeLoaders["password-reset"]);
const OfferingGame = lazy(routeLoaders.play);

function withRouteLoading(element) {
  return (
    <Suspense fallback={<RouteLoading />}>{element}</Suspense>
  );
}

export default function App() {
  useEffect(() => {
    const prefetchLinkRoute = (event) => {
      const link = event.target.closest("a[href]");
      if (!link || link.target || link.hasAttribute("download")) return;

      const destination = new URL(link.href, window.location.href);
      if (destination.origin === window.location.origin) {
        prefetchRoute(destination.pathname);
        routeDataPrefetchers[getRouteKey(destination.pathname)]?.(
          destination.pathname,
        );
      }
    };

    document.addEventListener("mouseover", prefetchLinkRoute);
    document.addEventListener("touchstart", prefetchLinkRoute, {
      passive: true,
    });
    document.addEventListener("focusin", prefetchLinkRoute);
    return () => {
      document.removeEventListener("mouseover", prefetchLinkRoute);
      document.removeEventListener("touchstart", prefetchLinkRoute);
      document.removeEventListener("focusin", prefetchLinkRoute);
    };
  }, []);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="play" element={withRouteLoading(<OfferingGame />)} />
        <Route path="shop" element={withRouteLoading(<Shop />)} />
        <Route path="classes" element={withRouteLoading(<ClassBookings />)} />
        <Route path="services" element={withRouteLoading(<ServiceBookings />)} />
        <Route path="products/:id" element={withRouteLoading(<Product />)} />
        <Route path="cart" element={withRouteLoading(<Cart />)} />
        <Route path="profile" element={withRouteLoading(<Profile />)} />
        <Route path="orders" element={withRouteLoading(<Orders />)} />
        <Route path="orders/:id" element={withRouteLoading(<Orders />)} />
        <Route path="support" element={withRouteLoading(<Support />)} />
        <Route
          path="sub-admin-invitation"
          element={withRouteLoading(<SubAdminInvitation />)}
        />
        <Route element={<AuthLayout />}>
          <Route
            path="login"
            element={withRouteLoading(<Auth mode="login" />)}
          />
          <Route
            path="register"
            element={withRouteLoading(<Auth mode="register" />)}
          />
          <Route
            path="password-reset"
            element={withRouteLoading(<PasswordReset />)}
          />
        </Route>
        <Route path="admin/*" element={withRouteLoading(<Admin />)} />
        <Route
          path="*"
          element={
            <section className="section">
              <Seo
                title="Page Not Found"
                description="The page you are looking for could not be found. Explore Divine Vikas fragrances and services."
                robots="noindex, follow"
              />
              <h1>Page not found</h1>
              <a className="text-link" href="/">
                Return home
              </a>
            </section>
          }
        />
      </Route>
    </Routes>
  );
}
