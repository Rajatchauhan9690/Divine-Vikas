import { memo } from "react";
import { Star } from "lucide-react";
import { Link } from "react-router-dom";
function ProductCard({ product }) {
  const discountPercentage =
    product.mrp > product.price
      ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
      : 0;

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
          <div className="product-price-row">
            <strong>₹{product.price}</strong>
            {discountPercentage > 0 && (
              <>
                <s>₹{product.mrp}</s>
                <span>{discountPercentage}% OFF</span>
              </>
            )}
          </div>
          <span className="rating">
            <Star size={13} fill="currentColor" /> {product.rating || "4.8"}
          </span>
        </div>
      </div>
    </article>
  );
}
export default memo(ProductCard);
