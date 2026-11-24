import { useEffect, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { api } from "../services/api";
import ProductCard from "../components/ProductCard";
import ErrorToast from "../components/ErrorToast";
import Seo from "../components/Seo";

const productCache = new Map();
const productCacheLimit = 20;

function getProductCacheKey(search, category) {
  return JSON.stringify([search, category === "All" ? "" : category]);
}

function cacheProducts(key, products) {
  productCache.delete(key);
  productCache.set(key, products);
  if (productCache.size > productCacheLimit)
    productCache.delete(productCache.keys().next().value);
}

export default function Shop() {
  const initialCacheKey = getProductCacheKey("", "All");
  const [products, setProducts] = useState(
      () => productCache.get(initialCacheKey) || [],
    ),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("All"),
    [loading, setLoading] = useState(
      () => !productCache.has(initialCacheKey),
    ),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const cacheKey = getProductCacheKey(search, category);
    const cachedProducts = productCache.get(cacheKey);
    if (productCache.has(cacheKey)) {
      setProducts(cachedProducts);
      setLoading(false);
    } else {
      setProducts([]);
      setLoading(true);
    }
    const timer = setTimeout(() => {
      setError("");
      api
        .get("/products", {
          params: { search, category: category === "All" ? "" : category },
          signal: controller.signal,
        })
        .then((r) => {
          const nextProducts = r.data.products || [];
          cacheProducts(cacheKey, nextProducts);
          setProducts(nextProducts);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError(
              "Could not load products. Check that the API server is running.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, category]);
  return (
    <section className="section shop-page">
      <Seo
        title="Shop Fragrances"
        description="Explore Divine Vikas fragrances and find an everyday favourite or a thoughtful gift. Discover quality-first scents inspired by bhav and bhakti."
      />
      <ErrorToast error={error} onDismiss={() => setError("")} />
      <div className="shop-intro">
        <span className="eyebrow">SOMETHING FOR EVERY MOOD</span>
        <h1>
          Shop <em>fragrance.</em>
        </h1>
        <p>Find your everyday favourite or a thoughtful gift.</p>
      </div>
      <div className="shop-controls">
        <label className="search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fragrances..."
            aria-label="Search fragrances"
          />
        </label>
        <div className="category-tabs">
          <SlidersHorizontal size={17} />
          {["All", "Devoted to god", "Mood uplifters"].map((c) => (
            <button
              key={c}
              className={category === c ? "active" : ""}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="notice error">{error}</p>}
      {loading ? (
        <p className="loading-state" role="status">
          Loading fragrances…
        </p>
      ) : products.length ? (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p._id} product={p} />
          ))}
        </div>
      ) : (
        <div className="empty-products">
          <span>✳</span>
          <h3>No fragrances found</h3>
          <p>
            Try another search or category, or add products from the admin
            panel.
          </p>
        </div>
      )}
    </section>
  );
}
