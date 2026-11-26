import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  ShoppingBag,
  ShoppingCart,
  ArrowLeft,
  Leaf,
  ShieldCheck,
} from "lucide-react";
import { api } from "../services/api";
import { useCart } from "../features/cart/CartContext";
import { useAuth } from "../features/auth/AuthContext";
import ErrorToast from "../components/ErrorToast";
import Seo from "../components/Seo";

const productCache = new Map();
const productCacheLimit = 20;

function cacheProduct(id, product) {
  productCache.delete(id);
  productCache.set(id, product);
  if (productCache.size > productCacheLimit)
    productCache.delete(productCache.keys().next().value);
}

export default function Product() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [productState, setProductState] = useState(() => ({
      id,
      product: productCache.get(id) || null,
    })),
    [error, setError] = useState(""),
    [added, setAdded] = useState(false);
  const p = productState.id === id ? productState.product : null;
  const discountPercentage =
    p?.mrp > p?.price
      ? Math.round(((p.mrp - p.price) / p.mrp) * 100)
      : 0;
  const { add } = useCart();
  const { user, ready } = useAuth();
  const isAdmin = user?.role === "admin";
  const canPurchase = ready && !isAdmin;
  function addToCart() {
    add(p);
    setAdded(true);
  }
  function buyNow() {
    add(p);
    navigate("/cart");
  }
  useEffect(() => {
    setAdded(false);
    setError("");
    const cachedProduct = productCache.get(id);
    setProductState({ id, product: cachedProduct || null });
    if (cachedProduct) return;

    const controller = new AbortController();
    api
      .get(`/products/${id}`, { signal: controller.signal })
      .then((r) => {
        const product = r.data.product;
        cacheProduct(id, product);
        setProductState({ id, product });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("This fragrance could not be found.");
      });
    return () => controller.abort();
  }, [id]);
  if (error)
    return (
      <section className="section">
        <Seo
          title="Fragrance Not Found"
          description="This Divine Vikas fragrance could not be found. Browse the collection to discover other scents."
          robots="noindex, follow"
        />
        <ErrorToast error={error} onDismiss={() => setError("")} />
        <p>{error}</p>
        <Link to="/shop">Back to shop</Link>
      </section>
    );
  if (!p)
    return (
      <>
        <Seo
          title="Discover Our Fragrances"
          description="Explore thoughtful, quality-first fragrances from Divine Vikas."
        />
        <section
          className="section product-detail product-detail--skeleton"
          role="status"
          aria-label="Loading product details"
          aria-busy="true"
        >
          <div className="detail-image skeleton-shimmer" aria-hidden="true" />
          <div className="detail-copy" aria-hidden="true">
            <div className="product-detail-skeleton-line product-detail-skeleton-category skeleton-shimmer" />
            <div className="product-detail-skeleton-line product-detail-skeleton-title skeleton-shimmer" />
            <div className="product-detail-skeleton-line product-detail-skeleton-rating skeleton-shimmer" />
            <div className="product-detail-skeleton-line product-detail-skeleton-price skeleton-shimmer" />
            <div className="product-detail-skeleton-line product-detail-skeleton-description skeleton-shimmer" />
            <div className="product-detail-skeleton-line product-detail-skeleton-description product-detail-skeleton-description--short skeleton-shimmer" />
            <div className="product-detail-skeleton-benefits">
              <div className="product-detail-skeleton-line skeleton-shimmer" />
              <div className="product-detail-skeleton-line skeleton-shimmer" />
            </div>
            <div className="product-detail-skeleton-actions">
              <div className="skeleton-shimmer" />
              <div className="skeleton-shimmer" />
            </div>
          </div>
        </section>
      </>
    );
  return (
    <>
      <Seo
        title={`${p.name} Fragrance`}
        description={(p.description || p.shortDescription ||
          `Discover ${p.name}, a thoughtful Divine Vikas fragrance for your everyday ritual.`).slice(
          0,
          160,
        )}
        image={p.image || undefined}
        type="product"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: p.name,
          description:
            p.description ||
            p.shortDescription ||
            `A thoughtful Divine Vikas fragrance for your everyday ritual.`,
          image: p.image
            ? [new URL(p.image, window.location.origin).href]
            : undefined,
          category: p.category || undefined,
          brand: { "@type": "Brand", name: "Divine Vikas" },
          offers: {
            "@type": "Offer",
            priceCurrency: "INR",
            price: p.price,
            availability:
              p.stock > 0
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
            url: `${window.location.origin}${window.location.pathname}`,
          },
        }}
      />
      <section className="section product-detail">
      <div className="detail-image">
        <Link className="product-image-back-link" to="/shop">
          <ArrowLeft size={16} /> Back to collection
        </Link>
        {p.image && <img src={p.image} alt={p.name} />}
      </div>
      <div className="detail-copy">
        <span className="eyebrow">{p.category || "THE COLLECTION"}</span>
        <h1>{p.name}</h1>
        <div className="detail-rating">
          ★★★★★ <span>{p.rating || "4.8"} / 5</span>
        </div>
        <div className="detail-pricing">
          <strong className="detail-price">₹{p.price}</strong>
          {discountPercentage > 0 && (
            <>
              <s>₹{p.mrp}</s>
              <span>{discountPercentage}% OFF</span>
            </>
          )}
        </div>
        <p>
          {p.description ||
            p.shortDescription ||
            "A thoughtful fragrance made to bring a little beauty to your everyday ritual."}
        </p>
        <p className="product-return-policy">
          {p.returnable === false || !p.returnWindowDays
            ? "This product is non-returnable."
            : `Return requests are accepted within ${p.returnWindowDays} ${
                p.returnWindowDays === 1 ? "day" : "days"
              } after delivery. For multi-item orders, all items must still be within their return windows.`}
        </p>
        <div className="detail-benefits">
          <span>
            <Leaf /> Thoughtfully selected ingredients
          </span>
          <span>
            <ShieldCheck /> Quality-first fragrance
          </span>
        </div>
        <p className={p.stock > 0 ? "stock" : "stock out"}>
          {p.stock > 0
            ? "In stock"
            : "Currently out of stock"}
        </p>
        {canPurchase && <div className="product-purchase-actions">
          <PurchaseButtons
            stock={p.stock}
            addToCart={addToCart}
            buyNow={buyNow}
          />
        </div>}
        {canPurchase && added && (
          <p className="cart-confirmation" role="status">
            Added to your bag. <Link to="/cart">View bag</Link>
          </p>
        )}
      </div>
      {canPurchase && createPortal(
        <div className="product-purchase-actions product-purchase-actions-mobile">
          <PurchaseButtons
            stock={p.stock}
            addToCart={addToCart}
            buyNow={buyNow}
          />
        </div>,
        document.body,
      )}
      </section>
    </>
  );
}

function PurchaseButtons({ stock, addToCart, buyNow }) {
  return (
    <>
      <button className="btn btn-outline" disabled={!stock} onClick={addToCart}>
        <ShoppingBag size={17} /> Add to cart
      </button>
      <button className="btn btn-dark" disabled={!stock} onClick={buyNow}>
        <ShoppingCart size={17} /> Buy now
      </button>
    </>
  );
}
