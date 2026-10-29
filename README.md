# Divine Vikas — MERN E-commerce Starter

Responsive fragrance storefront and admin dashboard scaffold based on the supplied Divine Vikas PDF.

## Stack
- Frontend: React, JavaScript, Vite, Tailwind CSS, React Router, Axios
- Backend: Node.js, Express, MongoDB, Mongoose
- Auth: short-lived JWT access tokens + rotating refresh tokens in HttpOnly cookies, hashed refresh-token records, session revocation, bcrypt password hashing, customer/admin RBAC
- Security: Helmet, CORS allowlist, CSRF double-submit protection for cookie-backed auth endpoints, IP rate limits, database-backed login lockout, request validation, centralized errors, structured logging

## Requirements
Node.js 20+, MongoDB 7+ (local or Atlas).

## Setup
1. Copy `server/.env.example` to `server/.env` and set secrets + MongoDB URL.
2. Copy `client/.env.example` to `client/.env`.
3. In `server/`: `npm install`, then `npm run seed:admin`, then `npm run dev`.
4. In `client/`: `npm install`, then `npm run dev`.
5. Open the Vite URL. API defaults to `http://localhost:5000/api`.

The seed command creates an admin using `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` from `.env`. Change these before running it.
New product image uploads use Cloudinary and are served from secure Cloudinary URLs. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `server/.env` from your Cloudinary dashboard; keep these credentials on the server and never add them to the client environment. Existing images under `/uploads` remain available. If you use another image host, add its origin to the comma-separated `IMAGE_ORIGINS` setting.

## Security notes
- Cookie-backed authentication mutations (`register`, `login`, `refresh`, `logout`, `logout-all`) require a CSRF token. The client bootstraps it from `GET /api/auth/csrf`, sends it in `X-CSRF-Token`, and the server validates the header against the CSRF cookie using a timing-safe comparison. The server also rejects a mismatched browser `Origin`.
- Login has an IP-level rate limit and a database-backed account lockout after five consecutive failed password attempts. The lockout lasts 15 minutes; a successful login resets the counter. Use a shared persistent rate-limit store when deploying multiple API instances.
- Refresh rotation atomically claims the previous refresh-token record before issuing its replacement, preventing two requests from successfully rotating the same token. Reuse attempts revoke the active session.
- Automated tests use `node:test`, Supertest, and an in-memory MongoDB instance. Run them from `server/` with `npm test`; the first run may need network access to download the MongoDB test binary.
- Refresh tokens are stored only in an HttpOnly cookie and only their SHA-256 hashes are persisted.
- Refresh rotation revokes the prior session token and issues a new one. Reuse of a revoked token revokes the session.
- Access tokens are short-lived. Logout revokes the session and clears the cookie.
- For production, use HTTPS, a strong unique secret, exact frontend origins, a persistent shared rate-limit store, centralized log aggregation, backups, monitoring, and a CSRF strategy appropriate to your deployment.
- This is a starter project, not a security audit. Review it before production use.

## Included
- Product catalogue, search debounce, category filtering, cart, login/register, customer order endpoint
- Lazy-loaded routes, reusable UI, memoized product cards, API response caching for public product list
- Admin dashboard metrics and product CRUD routes guarded by `admin` role
- Loading, empty and error states; responsive navigation and layout

## Project structure
```text
divine-vikas-mern/
├── client/
│   ├── src/
│   │   ├── app/          # router and app shell
│   │   ├── components/   # reusable UI
│   │   ├── features/     # auth, cart, products
│   │   ├── pages/        # storefront, auth, admin
│   │   ├── services/     # API client
│   │   └── styles/
│   └── ...
└── server/
    └── src/
        ├── config/
        ├── controllers/
        ├── middleware/
        ├── models/
        ├── routes/
        ├── services/
        ├── utils/
        └── scripts/
```

## Class seat booking (added)
- Open `/classes` in the React app to view upcoming class sessions and select seats.
- Customers must sign in to book a seat. The API uses the existing access-token authentication.
- Admins can create class sessions from the Admin dashboard. Seats are generated automatically (`S01`, `S02`, ...).
- `GET /api/classes` lists upcoming sessions; `POST /api/classes/:classId/seats/:seatNumber/book` books a seat; `GET /api/classes/my-bookings` lists the current user's bookings.
- Admin endpoint: `POST /api/admin/classes` with `title`, `instructorName`, `startsAt` (future ISO date), and optional `description`, `durationMinutes`, `seatCount` (1–200).

### Concurrency guarantee
Seat booking is a single atomic MongoDB `findOneAndUpdate` filtered by both the class ID and a matching seat whose status is `available`. The same operation marks that seat `booked` and assigns the user. If two users attempt the same seat concurrently, only one update can match; the other receives HTTP `409 SEAT_UNAVAILABLE`. The UI refreshes seat availability after both success and conflict. This is a seat-reservation primitive; payment workflows and cancellation/refund policies are not included.

## Security and concurrency tests
From the `server/` directory:
```bash
npm install
npm test
```
The test suite covers CSRF rejection, refresh-token rotation, repeated-login lockout, and two concurrent users attempting to book the same seat. The concurrent booking test expects exactly one HTTP 201 and one HTTP 409 response. Tests run against an ephemeral in-memory MongoDB instance and do not touch your development database.

## Customer profile, saved addresses, order tracking and Cashfree (added)

### Customer features
- `/profile`: edit display name and phone; save up to 10 delivery addresses; add, edit, delete, and set a default address.
- Checkout requires a valid delivery address, lets the customer choose a saved address or add a new one, and offers Cashfree online checkout or Cash on Delivery.
- `/orders`: view order items, totals, payment status, delivery-address snapshot, status timeline, courier/tracking details, and update the delivery address while the order is still pending/paid/processing and before shipment.
- An order stores a snapshot of its delivery address. Updating a saved address later does not rewrite an existing order's address.

### Cashfree setup
1. Create a Cashfree merchant account and use **Sandbox** credentials for development.
2. Copy `server/.env.example` to `server/.env`. Set `CASHFREE_ENV=sandbox`, `CASHFREE_CLIENT_ID`, and `CASHFREE_CLIENT_SECRET` from Cashfree's sandbox dashboard. Never expose these secrets in `client/.env` or frontend code.
3. For payment webhooks, configure Cashfree to call `https://YOUR_PUBLIC_API/api/orders/cashfree/webhook` and set the same public URL as `CASHFREE_WEBHOOK_URL`. Local webhook testing requires a public HTTPS tunnel or deployed API.
4. Start the server and client as described above. Cashfree checkout uses the hosted Cashfree JS SDK and returns to `/orders`; the frontend then asks the backend to verify the provider's payment status.
5. When ready for live transactions, set `CASHFREE_ENV=production` and replace sandbox credentials with live credentials. Configure the production webhook URL and verify your merchant account is approved before accepting real payments.

The server creates Cashfree payment orders, keeps provider secrets server-side, verifies webhook HMAC signatures against the raw request body, and confirms payments against Cashfree before changing an online order to paid. A browser redirect alone is never considered proof of payment. Cashfree API/version details can change; verify current requirements in the Cashfree PG integration documentation before production rollout.

### Admin fulfilment
- The Admin dashboard now includes Order fulfilment controls to update order status and add courier, tracking number, HTTPS tracking URL, and a customer-facing note.
- Status changes are restricted to admins. Cashfree orders cannot be manually marked paid through the admin status endpoint; provider verification is required.
- Address changes are disabled once an order is shipped or enters a non-editable status. This starter uses manual status/tracking updates; it does **not** provide live courier GPS tracking unless a courier API is separately integrated.

### Payment and inventory notes
- Prices and totals are recalculated from the database; client-provided prices are ignored.
- Stock is reserved at order creation. A verified failed/dropped Cashfree payment webhook cancels the order and releases the reservation. Configure webhooks and add a scheduled expiry/reconciliation job before production so abandoned pending checkouts can be expired and stock released reliably.
- COD orders are created as processing orders with payment status `not_required`; update operational status and collect payment according to your delivery workflow.
- Refund initiation, chargeback handling, shipping-label generation, SMS/email notifications, and live courier tracking are not included.
