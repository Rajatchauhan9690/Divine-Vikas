import { memo } from "react";
import { ShoppingBag, Star } from "lucide-react";
import { useCart } from "../features/cart/CartContext";
import { Link } from "react-router-dom";
function ProductCard({ product }) {
  const { add } = useCart();
  return (
    <article className="product-card">
      <Link to={`/products/${product._id}`} className="product-image">
        {product.image && (
          <img loading="lazy" src={product.image} alt={product.name} />
        )}
        <span className="product-tag">{product.category || "Fragrance"}</span>
      </Link>
      <div className="product-info">
        <div>
          <Link to={`/products/${product._id}`}>
            <h3>{product.name}</h3>
          </Link>
          <p>
            {product.shortDescription ||
              "A thoughtful fragrance for every day."}
          </p>
        </div>
        <div className="product-bottom">
          <strong>₹{product.price}</strong>
          <span className="rating">
            <Star size={13} fill="currentColor" /> {product.rating || "4.8"}
          </span>
        </div>
        <button
          className="btn btn-dark btn-full"
          disabled={product.stock === 0}
          onClick={() => add(product)}
        >
          <ShoppingBag size={16} />
          {product.stock === 0 ? "Sold out" : "Add to bag"}
        </button>
      </div>
    </article>
  );
}
export default memo(ProductCard);
