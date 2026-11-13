export default function AdminCardSkeleton({
  count = 4,
  className = "",
  layout = "grid",
}) {
  return (
    <div
      className={`admin-card-skeletons admin-card-skeletons--${layout} ${className}`.trim()}
      role="status"
      aria-label="Loading cards"
    >
      {Array.from({ length: count }, (_, index) => (
        <article className="admin-card-skeleton" key={index}>
          <div className="admin-card-skeleton-head">
            <span className="admin-card-skeleton-line is-short" />
            <span className="admin-card-skeleton-pill" />
          </div>
          <span className="admin-card-skeleton-line is-title" />
          <span className="admin-card-skeleton-line is-medium" />
          <div className="admin-card-skeleton-badges">
            <span className="admin-card-skeleton-pill" />
            <span className="admin-card-skeleton-pill is-small" />
          </div>
          <div className="admin-card-skeleton-foot">
            <span className="admin-card-skeleton-line is-medium" />
            <span className="admin-card-skeleton-line is-action" />
          </div>
        </article>
      ))}
    </div>
  );
}
