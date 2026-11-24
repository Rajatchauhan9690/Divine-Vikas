export default function ProductGridSkeleton({ count = 8 }) {
  return (
    <div
      className="product-grid product-grid--skeleton"
      role="status"
      aria-label="Loading fragrances"
      aria-busy="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="product-card product-card--skeleton"
          aria-hidden="true"
        >
          <div className="product-image product-skeleton-image skeleton-shimmer" />
          <div className="product-skeleton-content">
            <div className="product-skeleton-line product-skeleton-title skeleton-shimmer" />
            <div className="product-skeleton-line product-skeleton-description skeleton-shimmer" />
            <div className="product-skeleton-footer">
              <div className="product-skeleton-price skeleton-shimmer" />
              <div className="product-skeleton-rating skeleton-shimmer" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
