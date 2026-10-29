# Features added to Divine Vikas

## Customer profile and address book
- Profile details can be viewed/updated (name and phone; email is read-only).
- Up to 10 saved addresses, including add/edit/delete/default selection.
- Server-side address and phone validation.

## Checkout
- Checkout selects a saved address or saves a new address.
- Server recalculates item prices/totals and checks/reserves stock.
- Cashfree online checkout or Cash on Delivery.

## Cashfree payments
- Server-side Cashfree payment order/session creation; credentials remain in server environment variables.
- Cashfree hosted JS checkout.
- Raw-body HMAC webhook signature verification and provider-side payment verification after redirect.
- Payment status states, payment reference storage, and duplicate-success protection.
- Failed/dropped payment webhook cancels the pending order and releases reserved stock.

## Order tracking and address changes
- Customer order history with item list, total, payment status, shipping address snapshot, and status timeline.
- Address changes while order is pending/paid/processing, closed after shipment.
- Admin order fulfilment UI for status, courier, tracking number, HTTPS tracking URL, and note.
- Customer tracking link when the admin enters a carrier URL.

## Security and operational notes
- Customer endpoints are authenticated and order reads/address changes are scoped to the owner.
- Admin status/tracking endpoint requires admin role.
- Cashfree orders cannot be manually marked paid via admin status updates.
- See README for environment setup and limitations. Live courier location, refunds, notifications, and automatic expiry of abandoned checkouts require additional provider/business integrations.
