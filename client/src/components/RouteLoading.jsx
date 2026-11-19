import { useLocation } from "react-router-dom";
import {
  CalendarDays,
  ClipboardList,
  Headset,
  KeyRound,
  LayoutDashboard,
  LogIn,
  Package,
  ShoppingBag,
  Sparkles,
  Tag,
  UserPlus,
  UserRound,
} from "lucide-react";

const loadingPages = [
  {
    match: /^\/$/,
    title: "A moment of calm",
    detail: "Preparing your Divine Vikas experience",
    Icon: Sparkles,
  },
  {
    match: /^\/shop\/?$/,
    title: "Curating the collection",
    detail: "Finding fragrances for you",
    Icon: ShoppingBag,
  },
  {
    match: /^\/products\/[^/]+\/?$/,
    title: "Unveiling your fragrance",
    detail: "Preparing the product details",
    Icon: Sparkles,
  },
  {
    match: /^\/cart\/?$/,
    title: "Preparing your bag",
    detail: "Getting checkout ready",
    Icon: ShoppingBag,
  },
  {
    match: /^\/classes\/?$/,
    title: "Opening sessions",
    detail: "Finding available classes",
    Icon: CalendarDays,
  },
  {
    match: /^\/services\/?$/,
    title: "Preparing appointments",
    detail: "Finding services for you",
    Icon: CalendarDays,
  },
  {
    match: /^\/login\/?$/,
    title: "Welcome back",
    detail: "Preparing your sign-in",
    Icon: LogIn,
  },
  {
    match: /^\/register\/?$/,
    title: "Join Divine Vikas",
    detail: "Preparing your account",
    Icon: UserPlus,
  },
  {
    match: /^\/password-reset\/?$/,
    title: "Account recovery",
    detail: "Preparing password reset",
    Icon: KeyRound,
  },
  {
    match: /^\/profile\/?$/,
    title: "Your account",
    detail: "Loading your profile",
    Icon: UserRound,
  },
  {
    match: /^\/orders(?:\/[^/]+)?\/?$/,
    title: "Your orders",
    detail: "Preparing order details",
    Icon: Package,
  },
  {
    match: /^\/support\/?$/,
    title: "Here to help",
    detail: "Opening customer support",
    Icon: Headset,
  },
  {
    match: /^\/admin\/orders\/?$/,
    title: "Order management",
    detail: "Preparing your fulfillment workspace",
    Icon: ClipboardList,
  },
  {
    match: /^\/admin\/coupons\/?$/,
    title: "Coupon management",
    detail: "Preparing your offers",
    Icon: Tag,
  },
  {
    match: /^\/admin(?:\/.*)?$/,
    title: "Admin workspace",
    detail: "Loading your management tools",
    Icon: LayoutDashboard,
  },
];

export default function RouteLoading() {
  const { pathname } = useLocation();
  const page = loadingPages.find(({ match }) => match.test(pathname));
  const Icon = page?.Icon || Sparkles;
  const isAuthPage = /^\/(login|register|password-reset)\/?$/.test(pathname);
  return (
    <section
      className={`route-loading${isAuthPage ? " route-loading--auth" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="route-loading-card">
        <div className="route-loading-mark" aria-hidden="true">
          <span className="route-loading-ring" />
          <Icon size={24} strokeWidth={1.6} />
        </div>
        <span className="route-loading-brand">DIVINE VIKAS</span>
        <h1>{page?.title || "Finding your way"}</h1>
        <p>{page?.detail || "Preparing the page for you"}</p>
        <span className="route-loading-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
    </section>
  );
}
