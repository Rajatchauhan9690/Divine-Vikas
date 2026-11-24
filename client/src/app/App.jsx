import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "../components/Layout";
import AuthLayout from "../components/AuthLayout";
import Seo from "../components/Seo";
import RouteLoading from "../components/RouteLoading";
import Home from "../pages/Home";
const Shop = lazy(() => import("../pages/Shop"));
const Product = lazy(() => import("../pages/Product"));
const Auth = lazy(() => import("../pages/Auth"));
const Cart = lazy(() => import("../pages/Cart"));
const Admin = lazy(() => import("../pages/Admin"));
const ClassBookings = lazy(() => import("../pages/ClassBookings"));
const ServiceBookings = lazy(() => import("../pages/ServiceBookings"));
const SubAdminInvitation = lazy(() => import("../pages/SubAdminInvitation"));
const Profile = lazy(() => import("../pages/Profile"));
const Orders = lazy(() => import("../pages/Orders"));
const Support = lazy(() => import("../pages/Support"));
const PasswordReset = lazy(() => import("../pages/PasswordReset"));
const OfferingGame = lazy(() =>
  import("../features/offering-game/OfferingGame"),
);

function withRouteLoading(element) {
  return (
    <Suspense fallback={<RouteLoading />}>{element}</Suspense>
  );
}

export default function App() {
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
