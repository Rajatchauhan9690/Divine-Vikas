# Divine Vikas

Divine Vikas is a fragrance storefront with customer accounts, product checkout, paid class-seat bookings, and an admin dashboard for managing products, classes, and order fulfilment.

## Technology

- **Client:** React 18, Vite, React Router, Tailwind CSS, Axios
- **Server:** Node.js, Express, MongoDB, Mongoose
- **Authentication:** short-lived access tokens, rotating refresh tokens in HttpOnly cookies, bcrypt password hashing, customer/admin roles
- **Payments:** Cashfree Payment Gateway for products and class bookings
- **Optional integrations:** Cloudinary image uploads, Shiprocket fulfilment, WhatsApp Business notifications

## Requirements

- Node.js 20 or later
- MongoDB 7 or later (local or MongoDB Atlas)
- Cashfree credentials to accept online payments

## Local setup

1. Copy `server/.env.example` to `server/.env`.
2. Set `MONGODB_URI`, `ACCESS_TOKEN_SECRET`, and `REFRESH_TOKEN_SECRET` in `server/.env`. Use separate, randomly generated secrets; production secrets must be at least 32 characters.
3. Copy `client/.env.example` to `client/.env`. The defaults connect the client to the local API.
4. In `server/`, install dependencies and create the initial admin:

   ```sh
   npm install
   npm run seed:admin
   npm run dev
   ```

   Set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` before running the seed command.
5. In another terminal, start the client:

   ```sh
   cd client
   npm install
   npm run dev
   ```

6. Open the Vite URL printed in the client terminal. The API defaults to `http://localhost:5000/api`; the health endpoint is `http://localhost:5000/health`.

Run the server commands from `server/` and the client commands from `client/`.

## Configuration

The server loads settings from `server/.env`. Required values are `MONGODB_URI`, `ACCESS_TOKEN_SECRET`, and `REFRESH_TOKEN_SECRET`. The examples in `server/.env.example` document all supported settings.

| Setting | Purpose |
| --- | --- |
| `PORT` | API port; defaults to `5000`. |
| `CLIENT_ORIGIN` | Allowed browser origin; defaults to `http://localhost:5173`. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Optional credentials for product image uploads. Keep these server-side. Existing files in `server/uploads/` are also served by the API. |
| `IMAGE_ORIGINS` | Optional comma-separated image origins allowed by the server's content security policy. |
| `CASHFREE_ENV`, `CASHFREE_CLIENT_ID`, `CASHFREE_CLIENT_SECRET` | Cashfree Payment Gateway mode and credentials. Use sandbox credentials for development; credentials must never be placed in the client environment. |
| `CASHFREE_WEBHOOK_URL` | Optional public webhook URL configured for Cashfree. |
| `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION`, `SHIPROCKET_PICKUP_POSTCODE`, `SHIPROCKET_WEBHOOK_TOKEN` | Optional Shiprocket shipping, label, and tracking integration. |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_ORDER_TEMPLATE`, `WHATSAPP_CLASS_TEMPLATE` | Optional WhatsApp Business message integration. Requires approved templates and customer opt-in. |

Client-only settings belong in `client/.env`:

| Setting | Purpose |
| --- | --- |
| `VITE_API_URL` | API base URL; defaults to `http://localhost:5000/api`. |
| `VITE_SUPPORT_WHATSAPP`, `VITE_SUPPORT_EMAIL`, `VITE_SUPPORT_PHONE` | Optional contact information shown on the support page. |

Restart the relevant development server after changing environment settings. Do not commit `.env` files or put provider secrets in client variables.

## Application features

### Storefront and accounts

- Browse products, search and filter the catalogue, view product details, and manage a cart.
- Register, sign in, view and update a profile, and manage up to **three** saved delivery addresses.
- Review order history, payment and fulfilment status, tracking information, and return status.
- Contact support using the configured contact details.

### Product orders

- Checkout uses a saved or newly entered delivery address and Cashfree online payment.
- The server calculates prices and totals from stored product data; client-provided totals are not trusted.
- Inventory is reserved while payment is pending. A confirmed payment creates the order; failed or expired attempts release reserved stock.
- A confirmed order sends a confirmation email to the customer's account email using the configured SMTP settings.
- Customers can update an eligible order's delivery address, cancel an order, or request a return when the order and item return policies allow it.
- Return eligibility is stored with each purchased item so later product-policy changes do not rewrite order terms.

### Class bookings

- Browse upcoming class sessions and reserve one or two seats using custom Cashfree UPI or card checkout.
- Seat holds are atomic, last up to 20 minutes, and become confirmed bookings only after server-side payment verification.
- A confirmed booking sends a confirmation email to the customer's account email using the configured SMTP settings.
- Customers can review active payment holds and confirmed bookings.
- Admins can create, edit, price, and delete eligible upcoming sessions. Seats are generated by the server.

### Admin

- Dashboard metrics and separate product, class, and order management views.
- Product creation and editing, including image upload and return-policy settings.
- Order fulfilment, cancellations, returns, refunds, and shipping operations.
- Cashfree orders cannot be marked paid manually; payment status is verified with Cashfree.

## API areas

- `/api/auth` — registration, login, refresh, logout, and current-user endpoints
- `/api/products` — public product catalogue and product details
- `/api/profile` — customer profile and saved addresses
- `/api/orders` — customer checkout, orders, cancellation, returns, and payment verification
- `/api/classes` — class sessions, seat payments, payment holds, and bookings
- `/api/admin` — admin dashboard and product, class, and order management
- `/api/orders/cashfree/webhook` — Cashfree payment/refund webhook
- `/api/courier-updates` — Shiprocket tracking webhook

Admin API routes require an authenticated admin account. Customer order and profile endpoints are authenticated and scoped to the signed-in customer.

## Payments and optional integrations

### Cashfree

Set `CASHFREE_ENV=sandbox`, `CASHFREE_CLIENT_ID`, and `CASHFREE_CLIENT_SECRET` in `server/.env` to enable sandbox payments. The same Cashfree integration handles product checkout and class-seat booking. The server creates the payment order and verifies payment status with Cashfree; a browser redirect alone does not confirm payment.

For webhooks, configure the Cashfree dashboard to send events to the public HTTPS address ending in `/api/orders/cashfree/webhook`, then set that address in `CASHFREE_WEBHOOK_URL`. Local webhook testing requires an HTTPS tunnel or deployed server. Use production credentials and a production webhook URL only after merchant setup and verification.

Product payment attempts reserve inventory temporarily and are cleaned up by a server-side periodic task. Class seat holds are released when class availability is requested after their hold expires. Refunds for eligible paid-order cancellations and accepted returns are initiated through Cashfree; provider refund processing can remain pending and should be monitored.

### Cloudinary

Set the three `CLOUDINARY_*` server variables to enable Cloudinary product image uploads. Keep credentials on the server. Existing images under `/uploads` remain available.

### Shiprocket

Set the `SHIPROCKET_*` credentials and pickup settings to use courier discovery and shipment creation from Admin Orders. Configure the provider's tracking webhook to call `/api/courier-updates` and use the same secret for `SHIPROCKET_WEBHOOK_TOKEN`. Shipment creation is restricted to paid orders.

### WhatsApp Business

Set the `WHATSAPP_*` server variables and configure approved utility templates before enabling notifications. The order template requires three body parameters; the class template requires four. Customers must opt in before automated messages are sent. Provider access tokens must remain server-side.

## Security

- Helmet security headers, an explicit CORS origin, request-size limits, and centralized error handling.
- CSRF protection for cookie-backed authentication mutations and browser-origin checks.
- Hashed refresh-token records, refresh-token rotation, session revocation, and short-lived access tokens.
- Authentication and rate limits, including account lockout after repeated failed logins.
- Server-side validation and role checks for customer and admin operations.
- Cashfree webhook HMAC verification and provider-side payment verification.

Use HTTPS, strong unique production secrets, exact allowed origins, backups, monitoring, and persistent shared rate-limit storage when deploying multiple API instances. This project is not a security audit; review the deployment and integrations before production use.

## Tests

From `server/`:

```sh
npm test
```

Tests use Node's test runner, Supertest, and an in-memory MongoDB instance. The first run may need network access to download the MongoDB test binary.

To build the client, run from `client/`:

```sh
npm run build
```
