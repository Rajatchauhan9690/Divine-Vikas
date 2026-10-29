import { Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import Layout from "../components/Layout";
import Home from "../pages/Home";
const Shop = lazy(() => import("../pages/Shop"));
const Product = lazy(() => import("../pages/Product"));
const Auth = lazy(() => import("../pages/Auth"));
const Cart = lazy(() => import("../pages/Cart"));
const Admin = lazy(() => import("../pages/Admin"));
const ClassBookings = lazy(() => import("../pages/ClassBookings"));
const Profile = lazy(() => import("../pages/Profile"));
const Orders = lazy(() => import("../pages/Orders"));
function Loading() {
  return <div className="loading-state">Loading Divine Vikas…</div>;
}
export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="shop" element={<Shop />} />
          <Route path="classes" element={<ClassBookings />} />
          <Route path="products/:id" element={<Product />} />
          <Route path="cart" element={<Cart />} />
          <Route path="profile" element={<Profile />} />
          <Route path="orders" element={<Orders />} />
          <Route path="login" element={<Auth mode="login" />} />
          <Route path="register" element={<Auth mode="register" />} />
          <Route path="admin" element={<Admin />} />
          <Route
            path="*"
            element={
              <section className="section">
                <h1>Page not found</h1>
                <a className="text-link" href="/">
                  Return home
                </a>
              </section>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  );
}
