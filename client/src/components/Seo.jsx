import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=1200&q=85";

function setMeta(attribute, key, content) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

export default function Seo({
  title,
  description,
  robots = "index, follow",
  image = DEFAULT_IMAGE,
  type = "website",
  structuredData,
}) {
  const { pathname } = useLocation();

  useEffect(() => {
    const fullTitle = title.includes("Divine Vikas")
      ? title
      : `${title} | Divine Vikas`;
    const canonicalUrl = `${window.location.origin}${pathname}`;
    const imageUrl = new URL(image, window.location.origin).href;

    document.title = fullTitle;
    setMeta("name", "description", description);
    setMeta("name", "robots", robots);
    setMeta("property", "og:type", type);
    setMeta("property", "og:site_name", "Divine Vikas");
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", canonicalUrl);
    setMeta("property", "og:image", imageUrl);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", imageUrl);

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    let schema = document.getElementById("page-structured-data");
    if (structuredData) {
      if (!schema) {
        schema = document.createElement("script");
        schema.id = "page-structured-data";
        schema.type = "application/ld+json";
        document.head.appendChild(schema);
      }
      schema.textContent = JSON.stringify(structuredData);
    } else {
      schema?.remove();
    }
  }, [description, image, pathname, robots, structuredData, title, type]);

  return null;
}
