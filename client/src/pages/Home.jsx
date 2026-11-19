import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Leaf,
  Heart,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api";
import { useAuth } from "../features/auth/AuthContext";
import ProductCard from "../components/ProductCard";
import Seo from "../components/Seo";
export default function Home() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const isSubAdmin = user?.role === "sub_admin";
  const isAdmin = user?.role === "admin";
  useEffect(() => {
    api
      .get("/products")
      .then((r) => setProducts(r.data.products || []))
      .catch(() => setProducts([]));
  }, []);
  return (
    <>
      <Seo
        title="Luxury Fragrances Inspired by Devotion"
        description="Discover Divine Vikas fragrances: thoughtful, quality-first scents for everyday luxury, inspired by bhav and bhakti."
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Divine Vikas",
          description:
            "Thoughtful, quality-first fragrances inspired by bhav and bhakti.",
          url: window.location.origin,
        }}
      />
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span /> MADE WITH BHAV & BHAKTI
          </span>
          <h1>
            Luxury &<br />
            <em>Affordability.</em>
          </h1>
          <p>
            Smelling luxurious is not a matter of money, it's a matter of
            quality. Find a fragrance that feels like you.
          </p>
          <div className="hero-actions">
            {!isAdmin && (
              <Link className="btn btn-dark" to="/shop">
                Explore fragrances <ArrowUpRight size={17} />
              </Link>
            )}
            <a className="text-link" href="#story">
              Our philosophy
            </a>
          </div>
          <div className="hero-note">
            <span className="avatar-stack">
              <i>✦</i>
              <i>❋</i>
              <i>✿</i>
            </span>
            <span>
              <b>Made for mindful moments</b>
              <small>Everyday luxury, rooted in devotion</small>
            </span>
          </div>
        </div>
        <div className="hero-art">
          <img
            src="https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=1200&q=85"
            alt="Elegant perfume bottles and botanical ingredients"
          />
          <div className="art-caption">
            <span>01 / SIGNATURE COLLECTION</span>
            <b>Let your presence linger.</b>
          </div>
          <div className="floating-seal">
            PURE
            <br />
            <b>INTENT</b>
            <br />✳
          </div>
        </div>
      </section>
      {!isAdmin && !isSubAdmin && (
        <section className="home-booking-links section">
        <div className="home-booking-heading">
          <span className="eyebrow">MAKE TIME FOR YOURSELF</span>
          <h2>
            Find your <em>next moment.</em>
          </h2>
          <p>Choose an appointment or session at a time that works for you.</p>
        </div>
        <div className="home-booking-actions">
          <Link className="home-booking-card" to="/classes">
            <span className="home-booking-icon">
              <CalendarDays size={21} />
            </span>
            <span className="home-booking-card-copy">
              <strong>Book a session</strong>
              <small>Explore upcoming classes and sessions</small>
            </span>
            <ArrowUpRight size={20} aria-hidden="true" />
          </Link>
          <Link className="home-booking-card" to="/services">
            <span className="home-booking-icon">
              <Clock3 size={21} />
            </span>
            <span className="home-booking-card-copy">
              <strong>Book an appointment</strong>
              <small>Choose a time for a personal visit</small>
            </span>
            <ArrowUpRight size={20} aria-hidden="true" />
          </Link>
        </div>
        </section>
      )}
      <section className="promise-strip">
        <div>
          <span className="promise-icon">
            <Leaf />
          </span>
          <div>
            <b>Thoughtfully crafted</b>
            <p>Fragrance for every day</p>
          </div>
        </div>
        <div>
          <span className="promise-icon">
            <Heart />
          </span>
          <div>
            <b>Rooted in devotion</b>
            <p>Made with care and intention</p>
          </div>
        </div>
        <div>
          <span className="promise-icon">
            <ShieldCheck />
          </span>
          <div>
            <b>Quality first</b>
            <p>Carefully selected ingredients</p>
          </div>
        </div>
        <div>
          <span className="promise-icon">
            <Sparkles />
          </span>
          <div>
            <b>Luxury for all</b>
            <p>Beautifully priced</p>
          </div>
        </div>
      </section>
      <section className="section products-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE COLLECTION</span>
            <h2>
              Find your <em>signature.</em>
            </h2>
          </div>
          {!isAdmin && (
            <Link className="text-link" to="/shop">
              Shop all fragrances <ArrowUpRight size={16} />
            </Link>
          )}
        </div>
        {products.length ? (
          <div className="product-grid">
            {products.slice(0, 4).map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        ) : (
          <div className="empty-products">
            <span>✳</span>
            <h3>A little calm, a little fragrance.</h3>
            <p>
              Our collection will appear here once products are added to the
              database.
            </p>
            {!isAdmin && (
              <Link className="btn btn-outline" to="/shop">
                Explore the shop
              </Link>
            )}
          </div>
        )}
      </section>
      <section className="story-section" id="story">
        <div className="story-image">
          <img
            loading="lazy"
            src="https://images.unsplash.com/photo-1547887538-e3a2f32cb1cc?w=1000&q=80"
            alt="Perfume bottle among roses"
          />
        </div>
        <div className="story-copy">
          <span className="eyebrow">A NOTE FROM DIVINE VIKAS</span>
          <h2>
            Fragrance is a feeling.
            <br />
            <em>Devotion is the soul.</em>
          </h2>
          <p>
            We believe smelling luxurious isn't about spending more. It's about
            choosing quality, finding your own ritual, and carrying a little
            calm into the everyday.
          </p>
          <p>
            Inspired by bhav and bhakti, Divine Vikas brings together mindful
            moments and fragrances made to feel personal.
          </p>
          <Link className="btn btn-dark" to="/shop">
            Discover our scents <ArrowUpRight size={17} />
          </Link>
        </div>
      </section>
      <section className="closing-quote">
        <span>✳</span>
        <p>“A little fragrance. A lot of feeling.”</p>
        <small>THE DIVINE VIKAS PHILOSOPHY</small>
      </section>
    </>
  );
}
