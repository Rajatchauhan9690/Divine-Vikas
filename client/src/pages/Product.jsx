import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ShoppingBag, ArrowLeft, Leaf, ShieldCheck } from "lucide-react";
import { api } from "../services/api";
import { useCart } from "../features/cart/CartContext";
export default function Product() {
  const { id } = useParams();
  const [p, setP] = useState(null),
    [error, setError] = useState("");
  const { add } = useCart();
  useEffect(() => {
    api
      .get(`/products/${id}`)
      .then((r) => setP(r.data.product))
      .catch(() => setError("This fragrance could not be found."));
  }, [id]);
  if (error)
    return (
      <section className="section">
        <p>{error}</p>
        <Link to="/shop">Back to shop</Link>
      </section>
    );
  if (!p) return <div className="loading-state">Finding your fragrance…</div>;
  return (
    <section className="section product-detail">
      <div className="detail-image">
        {p.image && <img src={p.image} alt={p.name} />}
      </div>
      <div className="detail-copy">
        <Link className="back-link" to="/shop">
          <ArrowLeft size={16} /> Back to collection
        </Link>
        <span className="eyebrow">{p.category || "THE COLLECTION"}</span>
        <h1>{p.name}</h1>
        <div className="detail-rating">
          ★★★★★ <span>{p.rating || "4.8"} / 5</span>
        </div>
        <strong className="detail-price">₹{p.price}</strong>
        <p>
          {p.description ||
            p.shortDescription ||
            "A thoughtful fragrance made to bring a little beauty to your everyday ritual."}
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
            ? `In stock · ${p.stock} available`
            : "Currently out of stock"}
        </p>
        <button
          className="btn btn-dark btn-full"
          disabled={!p.stock}
          onClick={() => add(p)}
        >
          <ShoppingBag size={17} /> Add to bag — ₹{p.price}
        </button>
      </div>
    </section>
  );
}
