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
- Open `/classes` in the React app to view class summaries. Selecting a card opens its seat map.
- Customers must sign in and can select 1–3 seats for one Cashfree payment. All selected seats are held atomically for up to 20 minutes and become booked only after server-side payment verification. Group holds stay together if checkout is pending or fails.
- Admins create sessions from the Admin dashboard with a per-seat price. Seats are generated automatically (`S01`, `S02`, ...).
- `GET /api/classes` lists upcoming sessions; `POST /api/classes/:classId/seats/payment` accepts `{ "seatNumbers": ["S01", "S02"] }`, atomically reserves 1–3 seats, and creates a single Cashfree payment session; `POST /api/classes/:classId/payments/:paymentOrderId/verify` confirms or releases the entire group hold. The single-seat payment and verification routes remain supported for compatibility; `GET /api/classes/my-bookings` lists confirmed bookings.
- Admin endpoint: `POST /api/admin/classes` with `title`, `instructorName`, `price` (INR per seat), `startsAt` (future ISO date), and optional `description`, `durationMinutes`, `seatCount` (1–600).
- Admins can delete an upcoming session with `DELETE /api/admin/classes/:classId` only while it has no pending payment holds or booked seats. The session form uses one native date-and-time picker for easy local scheduling.
- Admin routes include an overview (`/admin`) and separate Products, Classes, and Orders pages. Product and order lists are paginated; class creation and per-order fulfillment controls are expandable to keep the pages compact.

### Concurrency guarantee
Seat holds and payment confirmation use atomic MongoDB updates filtered by class, selected seats, owner, and payment order. If two users attempt overlapping seats concurrently, only one can create a payment session; the other receives HTTP `409 SEAT_UNAVAILABLE`, and group reservations never partially hold seats. A customer can have only one active group checkout at a time, but may book another group after payment completes. A verified Cashfree success atomically books every seat in that payment order. Failed or expired holds become available again. Payment creation is rate-limited to 5 attempts per account and 20 per IP address per 15 minutes using MongoDB-backed counters shared across server instances. Cashfree order expiry is set to the same 20-minute hold window, safely above Cashfree's 15-minute minimum.

## Security and concurrency tests
From the `server/` directory:
```bash
npm install
npm test
```
The test suite covers CSRF rejection, refresh-token rotation, repeated-login lockout, and two concurrent users attempting to reserve the same seat. The concurrent reservation test expects exactly one HTTP 201 and one HTTP 409 response. Tests run against an ephemeral in-memory MongoDB instance and do not touch your development database.

## Customer profile, saved addresses, order tracking and Cashfree (added)

### Customer features
- `/profile`: edit display name and phone; save up to 3 delivery addresses; add, edit, delete, and set a default address.
- Product checkout requires a valid delivery address, lets the customer choose a saved address or add a new one, and accepts Cashfree online payment only.
- An unpaid Cashfree checkout is a temporary payment attempt, not an order. Stock is reserved for up to 20 minutes; a confirmed payment creates the order, while a failed or expired attempt releases stock. Only paid online orders appear in customer order history.
- `/orders`: view order items, totals, payment status, delivery-address snapshot, status timeline, courier/tracking details, and update the delivery address while the order is still pending/paid/processing and before shipment.
- An order stores a snapshot of its delivery address. Updating a saved address later does not rewrite an existing order's address.
- `/support`: get help with orders, payments, products, class bookings, and other questions. Configure `VITE_SUPPORT_WHATSAPP`, `VITE_SUPPORT_EMAIL`, and `VITE_SUPPORT_PHONE` in `client/.env`; restart the client after changing these values.

### Cashfree setup
1. Create/sign in to a Cashfree merchant account and switch to **Test/Sandbox** mode.
2. In the Payment Gateway API keys section, generate the sandbox Client ID (App ID) and Client Secret. These are separate from Payouts credentials.
3. Set `CASHFREE_ENV=sandbox`, `CASHFREE_CLIENT_ID`, and `CASHFREE_CLIENT_SECRET` in `server/.env`, then restart the backend. Keep the secret out of `client/.env`, frontend code, source control, and chat.
4. Start the server and client. Test a product checkout or create a priced class in Admin and book a seat from `/classes`. Complete checkout using a payment method/test details provided in Cashfree's current sandbox documentation. Product checkout returns to `/orders`; class checkout returns to `/classes`. The backend verifies payment status with Cashfree before confirming the order or seat.
5. To test webhooks locally, expose the backend at port 5000 through a public HTTPS tunnel or deploy it. Configure that exact URL plus `/api/orders/cashfree/webhook` in the Cashfree dashboard, enable payment and refund status events, and set the same URL as `CASHFREE_WEBHOOK_URL`; restart the backend. Leave it blank if you are testing only the browser-return verification.
6. For live payments, switch to `CASHFREE_ENV=production`, use production Payment Gateway credentials, configure the production HTTPS webhook, and verify your merchant account before accepting transactions.

The server creates Cashfree payment orders, keeps provider secrets server-side, verifies webhook HMAC signatures against the raw request body, and confirms payments against Cashfree before marking an order paid or a class seat booked. A browser redirect alone is never considered proof of payment. Class seats are temporarily held for 20 minutes during checkout; expired holds are released when class availability is requested. Cashfree API/version details can change; verify current requirements in the Cashfree PG integration documentation before production rollout.

### Admin fulfilment
- The Admin dashboard now includes Order fulfilment controls to update order status and add courier, tracking number, HTTPS tracking URL, and a customer-facing note.
- Status changes are restricted to admins. Cashfree orders cannot be manually marked paid through the admin status endpoint; provider verification is required.
- Address changes are disabled once an order is shipped or enters a non-editable status.
- Admin cancellation of a paid Cashfree order first initiates an idempotent Cashfree refund. If Cashfree rejects/fails the request, the order remains active and stock is unchanged so an Admin can retry. A pending Cashfree refund is recorded separately from a completed refund.
- Customers can request a product return after delivery; an Admin reviews the request, marks approved items received, and the backend then initiates the Cashfree refund. Return and refund status are visible in Admin and customer order history.
- Admins must set each product as non-returnable or configure its 1–90 day return window when creating or editing it. The product detail page shows the policy. Returnability and the window are saved to each order item at checkout, so later product-policy edits do not change existing orders. A whole-order return is unavailable if any item is non-returnable or outside its return window. Products and historical order items without a saved return window are treated as non-returnable.

### Shiprocket setup
1. Create a Shiprocket API user with access to orders, courier, and shipment modules.
2. Set `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION`, and `SHIPROCKET_PICKUP_POSTCODE` in `server/.env`. The pickup location name must already exist in Shiprocket.
3. In Admin Orders, enter the actual packaged weight (kg) and dimensions (cm), find available couriers, choose one, and create its shipment/label. Shipment creation is restricted to paid orders.
4. Configure Shiprocket's tracking webhook to call `https://<your-backend-host>/api/courier-updates` and set the same secret in `SHIPROCKET_WEBHOOK_TOKEN` as the webhook's `x-api-key`. Tracking events update the order status and delivery time.
5. Review [Shiprocket's API documentation](https://apidocs.shiprocket.in/) and test with your account before enabling live fulfillment.

### WhatsApp Business setup
1. Configure a WhatsApp Cloud API phone number and a long-lived server-side access token.
2. Create and approve utility templates for order and class confirmations. The order template must have three body parameters (order reference, items, total); the class template must have four (class, seats, start time, total).
3. Set `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_ORDER_TEMPLATE`, `WHATSAPP_CLASS_TEMPLATE`, and `WHATSAPP_TEMPLATE_LANGUAGE` in `server/.env`.
4. Customers must explicitly opt in from their profile before automated WhatsApp messages are sent. Delivery status is stored; missing configuration or provider rejection is reported in the Admin order details. Never put access tokens in client environment files.
5. Refer to [WhatsApp Cloud API message documentation](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages) for template and opt-in requirements.

### Payment and inventory notes
- Prices and totals are recalculated from the database; client-provided prices are ignored.
- Product stock is temporarily reserved during Cashfree checkout. Failed payments release the reservation, and the backend periodically expires unpaid attempts after 20 minutes. If a late payment arrives after stock release, the system attempts to reserve the items again; if unavailable, the payment requires refund follow-up.
- Cashfree refunds are initiated for paid Admin cancellations and accepted returns; monitor provider refund status until it completes. Chargeback handling and SMS/email notifications are not included.
- See [Cashfree's Create Refund API](https://www.cashfree.com/docs/api-reference/payments/latest/refunds/create-refund) for provider-side refund constraints and statuses.
