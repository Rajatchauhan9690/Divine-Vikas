import { useEffect, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { api } from "../services/api";
import ProductCard from "../components/ProductCard";
export default function Shop() {
  const [products, setProducts] = useState([]),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("All"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      api
        .get("/products", {
          params: { search, category: category === "All" ? "" : category },
        })
        .then((r) => {
          if (active) setProducts(r.data.products || []);
        })
        .catch(() => {
          if (active)
            setError(
              "Could not load products. Check that the API server is running.",
            );
        })
        .finally(() => active && setLoading(false));
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, category]);
  return (
    <section className="section shop-page">
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
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="notice error">{error}</p>}
      {loading ? (
        <div className="loading-state">Preparing your collection…</div>
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
