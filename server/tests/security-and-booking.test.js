import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/test-placeholder';
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret-that-is-long-enough-123456';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-that-is-long-enough-123456';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';

let mongo;
let app;
let User;
let Session;
let ClassSession;
let Product;
let Order;
let ProductPaymentAttempt;
let RateLimitBucket;
let ClassPaymentHold;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  ({ default: app } = await import('../src/app.js'));
  ({ default: User } = await import('../src/models/User.js'));
  ({ default: Session } = await import('../src/models/Session.js'));
  ({ default: ClassSession } = await import('../src/models/ClassSession.js'));
  ({ default: Product } = await import('../src/models/Product.js'));
  ({ default: Order } = await import('../src/models/Order.js'));
  ({ default: ProductPaymentAttempt } = await import('../src/models/ProductPaymentAttempt.js'));
  ({ default: RateLimitBucket } = await import('../src/models/RateLimitBucket.js'));
  ({ default: ClassPaymentHold } = await import('../src/models/ClassPaymentHold.js'));
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Session.deleteMany({}),
    ClassSession.deleteMany({}),
    Product.deleteMany({}),
    Order.deleteMany({}),
    ProductPaymentAttempt.deleteMany({}),
    RateLimitBucket.deleteMany({}),
    ClassPaymentHold.deleteMany({}),
  ]);
});

async function getCsrf(agent) {
  const response = await agent.get('/api/auth/csrf').expect(200);
  return response.body.csrfToken;
}

async function registerUser(email) {
  const agent = request.agent(app);
  const csrfToken = await getCsrf(agent);
  const response = await agent.post('/api/auth/register')
    .set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', csrfToken)
    .send({ name: 'Test User', email, password: 'StrongPass123!' })
    .expect(201);
  return { agent, csrfToken, accessToken: response.body.accessToken, user: response.body.user, refreshCookie: response.headers['set-cookie'].find(value => value.startsWith('refreshToken=')) };
}

test('customers can save at most three delivery addresses', async () => {
  const customer = await registerUser('address-limit@example.com');
  const addAddress = index =>
    request(app)
      .post('/api/profile/addresses')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        label: `Home ${index}`,
        fullName: 'Test User',
        phone: '9876543210',
        line1: `${index} Main Street`,
        city: 'Pune',
        state: 'Maharashtra',
        postalCode: '411001',
      });

  for (let index = 1; index <= 3; index++)
    await addAddress(index).expect(201);
  const fourthAddress = await addAddress(4).expect(400);

  assert.equal(fourthAddress.body.code, 'ADDRESS_LIMIT');
  const user = await User.findById(customer.user.id);
  assert.equal(user.addresses.length, 3);
});

test('cookie-backed authentication rejects unsafe requests without a valid CSRF token', async () => {
  const agent = request.agent(app);
  await getCsrf(agent);
  await agent.post('/api/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({ email: 'nobody@example.com', password: 'incorrect' })
    .expect(403);
});

test('refresh token rotation revokes the old token and creates a different active token', async () => {
  const user = await registerUser('rotation@example.com');
  assert.ok(user.refreshCookie, 'registration should set HttpOnly refresh cookie');
  const originalToken = decodeURIComponent(user.refreshCookie.split(';')[0].slice('refreshToken='.length));
  const originalHash = (await import('../src/utils/tokens.js')).hashToken(originalToken);

  const response = await user.agent.post('/api/auth/refresh')
    .set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Token', user.csrfToken)
    .expect(200);
  assert.ok(response.body.accessToken);

  const oldSession = await Session.findOne({ refreshHash: originalHash });
  assert.ok(oldSession?.revokedAt, 'old refresh token must be revoked');
  assert.ok(oldSession?.replacedByHash, 'old token must point to replacement hash');
  const replacementCookie = response.headers['set-cookie'].find(value => value.startsWith('refreshToken='));
  assert.ok(replacementCookie);
  const replacementToken = decodeURIComponent(replacementCookie.split(';')[0].slice('refreshToken='.length));
  assert.notEqual(replacementToken, originalToken);
  const replacementHash = (await import('../src/utils/tokens.js')).hashToken(replacementToken);
  assert.ok(await Session.findOne({ refreshHash: replacementHash, revokedAt: null }));
});

test('five failed logins lock the account and correct password is rejected during lockout', async () => {
  const user = await registerUser('lockout@example.com');
  const agent = request.agent(app);
  const csrfToken = await getCsrf(agent);
  for (let i = 0; i < 4; i++) {
    await agent.post('/api/auth/login').set('Origin', 'http://localhost:5173').set('X-CSRF-Token', csrfToken)
      .send({ email: 'lockout@example.com', password: 'wrong-password' }).expect(401);
  }
  await agent.post('/api/auth/login').set('Origin', 'http://localhost:5173').set('X-CSRF-Token', csrfToken)
    .send({ email: 'lockout@example.com', password: 'wrong-password' }).expect(423);
  await agent.post('/api/auth/login').set('Origin', 'http://localhost:5173').set('X-CSRF-Token', csrfToken)
    .send({ email: 'lockout@example.com', password: 'StrongPass123!' }).expect(423);
});

test('two concurrent users cannot book the same class seat', async () => {
  const first = await registerUser('first@example.com');
  const second = await registerUser('second@example.com');
  await User.updateMany(
    { _id: { $in: [first.user.id, second.user.id] } },
    { $set: { phone: '9876543210' } },
  );
  const session = await ClassSession.create({
    title: 'Concurrency Test Class', instructorName: 'Instructor', startsAt: new Date(Date.now() + 60 * 60 * 1000),
    price: 500, durationMinutes: 60, seats: [{ seatNumber: 'S01', status: 'available' }]
  });
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.CASHFREE_CLIENT_ID;
  const originalClientSecret = process.env.CASHFREE_CLIENT_SECRET;
  let cashfreeOrderExpiry;
  let cashfreeCustomerPhone;
  process.env.CASHFREE_CLIENT_ID = 'test-client-id';
  process.env.CASHFREE_CLIENT_SECRET = 'test-client-secret';
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    cashfreeOrderExpiry = body.order_expiry_time;
    cashfreeCustomerPhone = body.customer_details.customer_phone;
    return new Response(JSON.stringify({
      order_id: body.order_id,
      payment_session_id: 'test-payment-session',
    }), { status: 200 });
  };
  try {
    const users = [first, second];
    const book = user => request(app).post(`/api/classes/${session._id}/seats/S01/payment`)
      .set('Authorization', `Bearer ${user.accessToken}`).set('Origin', 'http://localhost:5173')
      .send({});
    const results = await Promise.all(users.map(book));
    assert.equal(results.filter(result => result.status === 201).length, 1, 'exactly one payment session may reserve the seat');
    assert.equal(results.filter(result => result.status === 409 && result.body.code === 'SEAT_UNAVAILABLE').length, 1, 'other request must conflict');
    const winnerIndex = results.findIndex(result => result.status === 201);
    const stored = await ClassSession.findById(session._id).lean();
    assert.equal(stored.seats[0].status, 'pending_payment');
    assert.equal(stored.seats[0].bookedBy.toString(), users[winnerIndex].user.id);
    assert.ok(stored.seats[0].paymentSessionId);
    assert.equal(cashfreeCustomerPhone, '9876543210');
    const expiryMs = Date.parse(cashfreeOrderExpiry);
    assert.ok(expiryMs - Date.now() > 15 * 60 * 1000, 'Cashfree expiry must be more than 15 minutes away');
    assert.ok(expiryMs - Date.now() < 30 * 24 * 60 * 60 * 1000, 'Cashfree expiry must be less than 30 days away');
    assert.equal(expiryMs, new Date(stored.seats[0].holdExpiresAt).getTime());
  } finally {
    globalThis.fetch = originalFetch;
    if (originalClientId === undefined) delete process.env.CASHFREE_CLIENT_ID;
    else process.env.CASHFREE_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.CASHFREE_CLIENT_SECRET;
    else process.env.CASHFREE_CLIENT_SECRET = originalClientSecret;
  }
});

test('verified class payment confirms the seat', async () => {
  const customer = await registerUser('class-payment@example.com');
  await User.findByIdAndUpdate(customer.user.id, {
    phone: '9876543210',
    whatsappOptIn: true,
  });
  const session = await ClassSession.create({
    title: 'Paid Class', instructorName: 'Instructor', startsAt: new Date(Date.now() + 60 * 60 * 1000),
    price: 500, durationMinutes: 60, seats: [{ seatNumber: 'S01', status: 'available' }]
  });
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.CASHFREE_CLIENT_ID;
  const originalClientSecret = process.env.CASHFREE_CLIENT_SECRET;
  const originalPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const originalWhatsAppToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const originalClassTemplate = process.env.WHATSAPP_CLASS_TEMPLATE;
  process.env.CASHFREE_CLIENT_ID = 'test-client-id';
  process.env.CASHFREE_CLIENT_SECRET = 'test-client-secret';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-id';
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-whatsapp-token';
  process.env.WHATSAPP_CLASS_TEMPLATE = 'class_confirmation';
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('graph.facebook.com'))
      return new Response(
        JSON.stringify({ messages: [{ id: 'wamid.class-confirmation' }] }),
        { status: 200 },
      );
    if (String(url).endsWith('/payments'))
      return new Response(JSON.stringify([
        { payment_status: 'SUCCESS', payment_amount: 500, cf_payment_id: 'test-payment-id' },
      ]), { status: 200 });
    const body = JSON.parse(options.body);
    return new Response(JSON.stringify({
      order_id: body.order_id,
      payment_session_id: 'test-payment-session',
    }), { status: 200 });
  };
  try {
    await request(app).post(`/api/classes/${session._id}/seats/S01/payment`)
      .set('Authorization', `Bearer ${customer.accessToken}`).set('Origin', 'http://localhost:5173')
      .send({}).expect(201);
    const response = await request(app)
      .post(`/api/classes/${session._id}/seats/S01/verify-payment`)
      .set('Authorization', `Bearer ${customer.accessToken}`).set('Origin', 'http://localhost:5173')
      .expect(200);
    assert.equal(response.body.paymentStatus, 'paid');
    assert.equal((await ClassSession.findById(session._id)).seats[0].status, 'booked');
    for (let attempt = 0; attempt < 20; attempt++) {
      const current = await ClassSession.findById(session._id);
      if (current.seats[0].whatsapp.status === 'sent') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const confirmedSeat = (await ClassSession.findById(session._id)).seats[0];
    assert.equal(confirmedSeat.whatsapp.status, 'sent');
    assert.equal(confirmedSeat.whatsapp.messageId, 'wamid.class-confirmation');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalClientId === undefined) delete process.env.CASHFREE_CLIENT_ID;
    else process.env.CASHFREE_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.CASHFREE_CLIENT_SECRET;
    else process.env.CASHFREE_CLIENT_SECRET = originalClientSecret;
    if (originalPhoneId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
    if (originalWhatsAppToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = originalWhatsAppToken;
    if (originalClassTemplate === undefined) delete process.env.WHATSAPP_CLASS_TEMPLATE;
    else process.env.WHATSAPP_CLASS_TEMPLATE = originalClassTemplate;
  }
});

test('customer can hold and pay for up to three class seats in one order', async () => {
  const customer = await registerUser('class-group-payment@example.com');
  await User.findByIdAndUpdate(customer.user.id, { phone: '9876543210' });
  const session = await ClassSession.create({
    title: 'Group Booking Class',
    instructorName: 'Instructor',
    startsAt: new Date(Date.now() + 60 * 60 * 1000),
    price: 250,
    durationMinutes: 45,
    seats: ['S01', 'S02', 'S03', 'S04'].map((seatNumber) => ({
      seatNumber,
      status: 'available',
    })),
  });
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.CASHFREE_CLIENT_ID;
  const originalClientSecret = process.env.CASHFREE_CLIENT_SECRET;
  let orderAmount;
  let paymentStatus = 'SUCCESS';
  process.env.CASHFREE_CLIENT_ID = 'test-client-id';
  process.env.CASHFREE_CLIENT_SECRET = 'test-client-secret';
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/payments'))
      return new Response(JSON.stringify([
        { payment_status: paymentStatus, payment_amount: orderAmount, cf_payment_id: 'group-payment-id' },
      ]), { status: 200 });
    const body = JSON.parse(options.body);
    orderAmount = body.order_amount;
    return new Response(JSON.stringify({
      order_id: body.order_id,
      payment_session_id: 'group-payment-session',
    }), { status: 200 });
  };
  try {
    const headers = {
      Authorization: `Bearer ${customer.accessToken}`,
      Origin: 'http://localhost:5173',
    };
    const payment = await request(app)
      .post(`/api/classes/${session._id}/seats/payment`)
      .set(headers)
      .send({ seatNumbers: ['S01', 'S02', 'S03'] })
      .expect(201);
    assert.equal(orderAmount, 750);
    assert.deepEqual(payment.body.payment.seatNumbers, ['S01', 'S02', 'S03']);
    const heldSession = await ClassSession.findById(session._id).lean();
    const heldSeats = heldSession.seats.filter(
      (seat) => seat.paymentOrderId === payment.body.payment.paymentOrderId,
    );
    assert.equal(heldSeats.length, 3);
    assert.ok(heldSeats.every((seat) => seat.status === 'pending_payment'));
    assert.ok(heldSeats.every((seat) => seat.holdExpiresAt.getTime() === heldSeats[0].holdExpiresAt.getTime()));
    const otherSession = await ClassSession.create({
      title: 'Second Group Session',
      instructorName: 'Instructor',
      startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      price: 250,
      durationMinutes: 45,
      seats: [{ seatNumber: 'S01', status: 'available' }],
    });
    const activeHold = await request(app)
      .post(`/api/classes/${otherSession._id}/seats/payment`)
      .set(headers)
      .send({ seatNumbers: ['S01'] })
      .expect(409);
    assert.equal(activeHold.body.code, 'CLASS_PAYMENT_IN_PROGRESS');
    assert.equal(
      (await ClassSession.findById(otherSession._id)).seats[0].status,
      'available',
    );
    const { processClassPaymentWebhook } = await import('../src/controllers/classSessionController.js');
    assert.equal(await processClassPaymentWebhook({
      paymentOrderId: payment.body.payment.paymentOrderId,
      paymentStatus: 'SUCCESS',
      paymentId: 'group-payment-id',
      paymentAmount: 750,
    }), true);
    assert.equal(await ClassPaymentHold.countDocuments({ accountId: customer.user.id }), 0);

    await request(app)
      .post(`/api/classes/${session._id}/seats/payment`)
      .set(headers)
      .send({ seatNumbers: ['S01', 'S04'] })
      .expect(409);
    assert.equal(
      (await ClassSession.findById(session._id)).seats.find(
        (seat) => seat.seatNumber === 'S04',
      ).status,
      'available',
      'a group reservation must not partially hold seats',
    );

    await request(app)
      .post(`/api/classes/${session._id}/seats/payment`)
      .set(headers)
      .send({ seatNumbers: ['S01', 'S02', 'S03', 'S04'] })
      .expect(400);

    const verification = await request(app)
      .post(`/api/classes/${session._id}/payments/${payment.body.payment.paymentOrderId}/verify`)
      .set(headers)
      .expect(200);
    assert.equal(verification.body.paymentStatus, 'paid');
    assert.deepEqual(verification.body.booking.seatNumbers, ['S01', 'S02', 'S03']);
    const bookedSession = await ClassSession.findById(session._id).lean();
    assert.ok(
      bookedSession.seats
        .filter((seat) => ['S01', 'S02', 'S03'].includes(seat.seatNumber))
        .every((seat) => seat.status === 'booked'),
    );
    assert.equal(bookedSession.seats.find((seat) => seat.seatNumber === 'S04').status, 'available');

    paymentStatus = 'FAILED';
    const failedSession = await ClassSession.create({
      title: 'Failed Group Booking',
      instructorName: 'Instructor',
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
      price: 250,
      durationMinutes: 45,
      seats: ['S01', 'S02'].map((seatNumber) => ({
        seatNumber,
        status: 'available',
      })),
    });
    const failedPayment = await request(app)
      .post(`/api/classes/${failedSession._id}/seats/payment`)
      .set(headers)
      .send({ seatNumbers: ['S01', 'S02'] })
      .expect(201);
    const failedVerification = await request(app)
      .post(`/api/classes/${failedSession._id}/payments/${failedPayment.body.payment.paymentOrderId}/verify`)
      .set(headers)
      .expect(200);
    assert.equal(failedVerification.body.paymentStatus, 'failed');
    assert.ok(
      (await ClassSession.findById(failedSession._id))
        .seats.every((seat) => seat.status === 'available'),
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalClientId === undefined) delete process.env.CASHFREE_CLIENT_ID;
    else process.env.CASHFREE_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.CASHFREE_CLIENT_SECRET;
    else process.env.CASHFREE_CLIENT_SECRET = originalClientSecret;
  }
});

test('class payment creation is rate-limited per account', async () => {
  const customer = await registerUser('class-rate-limit@example.com');
  const headers = {
    Authorization: `Bearer ${customer.accessToken}`,
    Origin: 'http://localhost:5173',
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    await request(app)
      .post('/api/classes/not-a-class-id/seats/payment')
      .set(headers)
      .send({ seatNumbers: ['S01'] })
      .expect(400);
  }
  const limited = await request(app)
    .post('/api/classes/not-a-class-id/seats/payment')
    .set(headers)
    .send({ seatNumbers: ['S01'] })
    .expect(429);
  assert.equal(limited.body.code, 'CLASS_BOOKING_RATE_LIMITED');
  assert.ok(Number(limited.headers['retry-after']) > 0);
});

test('terminal failed class payment webhook immediately releases every held seat', async () => {
  const customer = await registerUser('class-webhook-failed@example.com');
  const paymentOrderId = `CLS${crypto.randomUUID().replace(/-/g, '')}`;
  const session = await ClassSession.create({
    title: 'Failed Webhook Class',
    instructorName: 'Instructor',
    startsAt: new Date(Date.now() + 60 * 60 * 1000),
    price: 250,
    durationMinutes: 45,
    seats: ['S01', 'S02'].map((seatNumber) => ({
      seatNumber,
      status: 'pending_payment',
      bookedBy: customer.user.id,
      holdExpiresAt: new Date(Date.now() + 20 * 60 * 1000),
      paymentOrderId,
      paymentSessionId: 'failed-webhook-session',
    })),
  });
  await ClassPaymentHold.create({
    accountId: customer.user.id,
    classId: session._id,
    paymentOrderId,
    seatNumbers: ['S01', 'S02'],
    expiresAt: new Date(Date.now() + 20 * 60 * 1000),
  });

  const { processClassPaymentWebhook } = await import('../src/controllers/classSessionController.js');
  assert.equal(
    await processClassPaymentWebhook({
      paymentOrderId,
      paymentStatus: 'FAILED',
      paymentId: 'failed-payment-id',
      paymentAmount: 500,
    }),
    true,
  );
  const released = await ClassSession.findById(session._id).lean();
  assert.ok(released.seats.every((seat) => seat.status === 'available'));
  assert.ok(released.seats.every((seat) => seat.bookedBy === null));
  assert.equal(await ClassPaymentHold.countDocuments({ accountId: customer.user.id }), 0);
});

test('failed class payment releases the held seat without booking it', async () => {
  const customer = await registerUser('class-payment-failed@example.com');
  await User.findByIdAndUpdate(customer.user.id, { phone: '9876543210' });
  const session = await ClassSession.create({
    title: 'Unpaid Class', instructorName: 'Instructor', startsAt: new Date(Date.now() + 60 * 60 * 1000),
    price: 250, durationMinutes: 45, seats: [{ seatNumber: 'S01', status: 'available' }]
  });
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.CASHFREE_CLIENT_ID;
  const originalClientSecret = process.env.CASHFREE_CLIENT_SECRET;
  process.env.CASHFREE_CLIENT_ID = 'test-client-id';
  process.env.CASHFREE_CLIENT_SECRET = 'test-client-secret';
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/payments'))
      return new Response(JSON.stringify([
        { payment_status: 'FAILED', payment_amount: 250 },
      ]), { status: 200 });
    const body = JSON.parse(options.body);
    return new Response(JSON.stringify({
      order_id: body.order_id,
      payment_session_id: 'test-payment-session',
    }), { status: 200 });
  };
  try {
    await request(app).post(`/api/classes/${session._id}/seats/S01/payment`)
      .set('Authorization', `Bearer ${customer.accessToken}`).set('Origin', 'http://localhost:5173')
      .send({}).expect(201);
    const response = await request(app)
      .post(`/api/classes/${session._id}/seats/S01/verify-payment`)
      .set('Authorization', `Bearer ${customer.accessToken}`).set('Origin', 'http://localhost:5173')
      .expect(200);
    assert.equal(response.body.paymentStatus, 'failed');
    const stored = await ClassSession.findById(session._id).lean();
    assert.equal(stored.seats[0].status, 'available');
    assert.equal(stored.seats[0].bookedBy, null);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalClientId === undefined) delete process.env.CASHFREE_CLIENT_ID;
    else process.env.CASHFREE_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.CASHFREE_CLIENT_SECRET;
    else process.env.CASHFREE_CLIENT_SECRET = originalClientSecret;
  }
});

test('pending class payment keeps the seat held and does not book it', async () => {
  const customer = await registerUser('class-payment-pending@example.com');
  await User.findByIdAndUpdate(customer.user.id, { phone: '9876543210' });
  const session = await ClassSession.create({
    title: 'Pending Class', instructorName: 'Instructor', startsAt: new Date(Date.now() + 60 * 60 * 1000),
    price: 250, durationMinutes: 45, seats: [{ seatNumber: 'S01', status: 'available' }]
  });
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.CASHFREE_CLIENT_ID;
  const originalClientSecret = process.env.CASHFREE_CLIENT_SECRET;
  process.env.CASHFREE_CLIENT_ID = 'test-client-id';
  process.env.CASHFREE_CLIENT_SECRET = 'test-client-secret';
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/payments'))
      return new Response(JSON.stringify([
        { payment_status: 'PENDING', payment_amount: 250 },
      ]), { status: 200 });
    const body = JSON.parse(options.body);
    return new Response(JSON.stringify({
      order_id: body.order_id,
      payment_session_id: 'test-payment-session',
    }), { status: 200 });
  };
  try {
    await request(app).post(`/api/classes/${session._id}/seats/S01/payment`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .set('Origin', 'http://localhost:5173')
      .send({}).expect(201);
    const response = await request(app)
      .post(`/api/classes/${session._id}/seats/S01/verify-payment`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .set('Origin', 'http://localhost:5173')
      .expect(200);
    assert.equal(response.body.paymentStatus, 'pending');
    const stored = await ClassSession.findById(session._id).lean();
    assert.equal(stored.seats[0].status, 'pending_payment');
    assert.notEqual(stored.seats[0].status, 'booked');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalClientId === undefined) delete process.env.CASHFREE_CLIENT_ID;
    else process.env.CASHFREE_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.CASHFREE_CLIENT_SECRET;
    else process.env.CASHFREE_CLIENT_SECRET = originalClientSecret;
  }
});

test('customers can safely resume their own active class payment hold', async () => {
  const customer = await registerUser('resume-class-payment@example.com');
  const otherCustomer = await registerUser('other-resume-class-payment@example.com');
  const paymentOrderId = `CLS${crypto.randomUUID().replace(/-/g, '')}`;
  const paymentSessionId = 'resumable-cashfree-session';
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const session = await ClassSession.create({
    title: 'Resume Payment Class',
    instructorName: 'Instructor',
    startsAt: new Date(Date.now() + 60 * 60 * 1000),
    price: 250,
    durationMinutes: 45,
    seats: [
      {
        seatNumber: 'S01',
        status: 'pending_payment',
        bookedBy: customer.user.id,
        holdExpiresAt: expiresAt,
        paymentOrderId,
        paymentSessionId,
      },
    ],
  });
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.CASHFREE_CLIENT_ID;
  const originalClientSecret = process.env.CASHFREE_CLIENT_SECRET;
  process.env.CASHFREE_CLIENT_ID = 'test-client-id';
  process.env.CASHFREE_CLIENT_SECRET = 'test-client-secret';
  globalThis.fetch = async () =>
    new Response(JSON.stringify([]), { status: 200 });
  try {
    const holds = await request(app)
      .get('/api/classes/my-payment-holds')
      .set({ Authorization: `Bearer ${customer.accessToken}` })
      .expect(200);
    assert.equal(holds.body.holds.length, 1);
    assert.equal(holds.body.holds[0].classId, session._id.toString());
    assert.deepEqual(holds.body.holds[0].seatNumbers, ['S01']);
    assert.equal(holds.body.holds[0].paymentSessionId, undefined);
    const publicSessions = await request(app).get('/api/classes').expect(200);
    const publicSeat = publicSessions.body.sessions
      .find((item) => item._id === session._id.toString())
      .seats[0];
    assert.deepEqual(publicSeat, { seatNumber: 'S01', status: 'pending_payment' });

    const hiddenFromOtherUser = await request(app)
      .get('/api/classes/my-payment-holds')
      .set({ Authorization: `Bearer ${otherCustomer.accessToken}` })
      .expect(200);
    assert.deepEqual(hiddenFromOtherUser.body.holds, []);
    await request(app)
      .post(`/api/classes/${session._id}/payments/${paymentOrderId}/resume`)
      .set({ Authorization: `Bearer ${otherCustomer.accessToken}` })
      .expect(404);

    const resumed = await request(app)
      .post(`/api/classes/${session._id}/payments/${paymentOrderId}/resume`)
      .set({ Authorization: `Bearer ${customer.accessToken}` })
      .expect(200);
    assert.equal(resumed.body.paymentStatus, 'pending');
    assert.equal(resumed.body.payment.paymentSessionId, paymentSessionId);
    assert.equal(resumed.body.payment.environment, 'sandbox');
    assert.deepEqual(resumed.body.booking.seatNumbers, ['S01']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalClientId === undefined) delete process.env.CASHFREE_CLIENT_ID;
    else process.env.CASHFREE_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined) delete process.env.CASHFREE_CLIENT_SECRET;
    else process.env.CASHFREE_CLIENT_SECRET = originalClientSecret;
  }
});

test('admin can price an existing upcoming class before any seat is reserved', async () => {
  const administrator = await registerUser('class-price-admin@example.com');
  await User.updateOne({ _id: administrator.user.id }, { $set: { role: 'admin' } });
  const session = await ClassSession.create({
    title: 'Legacy Class', instructorName: 'Instructor', startsAt: new Date(Date.now() + 60 * 60 * 1000),
    price: 0, durationMinutes: 45, seats: [{ seatNumber: 'S01', status: 'available' }]
  });
  const response = await request(app)
    .patch(`/api/admin/classes/${session._id}/price`)
    .set('Authorization', `Bearer ${administrator.accessToken}`)
    .set('Origin', 'http://localhost:5173')
    .send({ price: 350 })
    .expect(200);
  assert.equal(response.body.session.price, 350);
  assert.equal((await ClassSession.findById(session._id)).price, 350);
});

test('admin can edit an upcoming class only before any seat is held or booked', async () => {
  const administrator = await registerUser('class-edit-admin@example.com');
  await User.updateOne({ _id: administrator.user.id }, { $set: { role: 'admin' } });
  const session = await ClassSession.create({
    title: 'Editable Class',
    instructorName: 'Old Instructor',
    startsAt: new Date(Date.now() + 60 * 60 * 1000),
    price: 250,
    durationMinutes: 45,
    seats: [{ seatNumber: 'S01', status: 'available' }],
  });
  const headers = {
    Authorization: `Bearer ${administrator.accessToken}`,
    Origin: 'http://localhost:5173',
  };
  const updated = await request(app)
    .put(`/api/admin/classes/${session._id}`)
    .set(headers)
    .send({
      title: 'Updated Class',
      description: 'Updated details',
      instructorName: 'New Instructor',
      startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      price: 375,
      durationMinutes: 90,
      seatCount: 2,
    })
    .expect(200);
  assert.equal(updated.body.session.title, 'Updated Class');
  assert.equal(updated.body.session.instructorName, 'New Instructor');
  assert.equal(updated.body.session.seats.length, 2);

  await ClassSession.updateOne(
    { _id: session._id },
    { $set: { 'seats.0.status': 'booked' } },
  );
  await request(app)
    .put(`/api/admin/classes/${session._id}`)
    .set(headers)
    .send({
      title: 'Blocked Edit',
      instructorName: 'New Instructor',
      startsAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      price: 400,
      durationMinutes: 60,
      seatCount: 1,
    })
    .expect(409);
});

test('admin can edit product details without replacing its image', async () => {
  const administrator = await registerUser('product-edit-admin@example.com');
  await User.updateOne({ _id: administrator.user.id }, { $set: { role: 'admin' } });
  const product = await Product.create({
    name: 'Old Product',
    price: 100,
    category: 'Other',
    shortDescription: 'Old short description',
    description: 'Old description',
    image: 'https://example.com/product.png',
    stock: 5,
  });
  const response = await request(app)
    .put(`/api/admin/products/${product._id}`)
    .set({
      Authorization: `Bearer ${administrator.accessToken}`,
      Origin: 'http://localhost:5173',
    })
    .field('name', 'Updated Product')
    .field('price', '250')
    .field('category', 'Mood uplifters')
    .field('shortDescription', 'Updated short description')
    .field('description', 'Updated description')
    .field('stock', '12')
    .field('returnWindowDays', '3')
    .expect(200);
  assert.equal(response.body.product.name, 'Updated Product');
  assert.equal(response.body.product.stock, 12);
  assert.equal(response.body.product.returnable, true);
  assert.equal(response.body.product.returnWindowDays, 3);
  assert.equal(response.body.product.image, 'https://example.com/product.png');

  await request(app)
    .put(`/api/admin/products/${product._id}`)
    .set({
      Authorization: `Bearer ${administrator.accessToken}`,
      Origin: 'http://localhost:5173',
    })
    .field('name', 'Updated Product')
    .field('price', '250')
    .field('category', 'Mood uplifters')
    .field('shortDescription', 'Updated short description')
    .field('description', 'Updated description')
    .field('stock', '12')
    .field('returnWindowDays', '91')
    .expect(400);
  assert.equal((await Product.findById(product._id)).returnWindowDays, 3);

  const nonReturnable = await request(app)
    .put(`/api/admin/products/${product._id}`)
    .set({
      Authorization: `Bearer ${administrator.accessToken}`,
      Origin: 'http://localhost:5173',
    })
    .field('name', 'Updated Product')
    .field('price', '250')
    .field('category', 'Mood uplifters')
    .field('shortDescription', 'Updated short description')
    .field('description', 'Updated description')
    .field('stock', '12')
    .field('returnable', 'false')
    .expect(200);
  assert.equal(nonReturnable.body.product.returnable, false);
  assert.equal(nonReturnable.body.product.returnWindowDays, null);
});

test('non-returnable products are disclosed and block returns for their orders', async () => {
  const customer = await registerUser('non-returnable-customer@example.com');
  const administrator = await registerUser('non-returnable-admin@example.com');
  await User.updateOne(
    { _id: administrator.user.id },
    { $set: { role: 'admin' } },
  );
  const product = await Product.create({
    name: 'Final Sale Product',
    price: 250,
    stock: 1,
    returnable: false,
  });
  const details = await request(app)
    .get(`/api/products/${product._id}`)
    .expect(200);
  assert.equal(details.body.product.returnable, false);
  assert.equal(details.body.product.returnWindowDays, null);

  const customerHeaders = {
    Authorization: `Bearer ${customer.accessToken}`,
  };
  const order = await Order.create({
    user: customer.user.id,
    items: [{
      product: product._id,
      name: product.name,
      price: product.price,
      quantity: 1,
      returnable: false,
      returnWindowDays: null,
    }],
    total: product.price,
    shippingAddress: {
      fullName: 'Test User',
      phone: '9876543210',
      line1: 'Test Road',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
    },
    paymentMethod: 'cashfree',
    paymentStatus: 'paid',
    status: 'delivered',
    deliveredAt: new Date(),
    payment: { providerOrderId: `DV${new mongoose.Types.ObjectId()}` },
  });
  const response = await request(app)
    .post(`/api/orders/${order._id}/return`)
    .set(customerHeaders)
    .send({ reason: 'Requesting an exception' })
    .expect(409);
  assert.equal(response.body.code, 'NON_RETURNABLE_ITEM');
  assert.equal((await Order.findById(order._id)).returnRequest.status, 'none');
});

test('admin class creation accepts up to 600 seats and rejects more', async () => {
  const administrator = await registerUser('class-seat-limit-admin@example.com');
  await User.updateOne({ _id: administrator.user.id }, { $set: { role: 'admin' } });
  const headers = {
    Authorization: `Bearer ${administrator.accessToken}`,
    Origin: 'http://localhost:5173',
  };
  const sessionData = {
    title: 'Large Class',
    instructorName: 'Instructor',
    price: 250,
    startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    durationMinutes: 45,
    seatCount: 600,
  };

  const response = await request(app)
    .post('/api/admin/classes')
    .set(headers)
    .send(sessionData)
    .expect(201);
  assert.equal(response.body.session.seats.length, 600);
  assert.equal(response.body.session.seats.at(-1).seatNumber, 'S600');

  await request(app)
    .post('/api/admin/classes')
    .set(headers)
    .send({ ...sessionData, title: 'Too Many Seats', seatCount: 601 })
    .expect(400);
});

test('admin can delete an upcoming class only when it has no held or booked seats', async () => {
  const administrator = await registerUser('class-delete-admin@example.com');
  await User.updateOne({ _id: administrator.user.id }, { $set: { role: 'admin' } });
  const removable = await ClassSession.create({
    title: 'Removable Class',
    instructorName: 'Instructor',
    startsAt: new Date(Date.now() + 60 * 60 * 1000),
    price: 250,
    durationMinutes: 45,
    seats: [{ seatNumber: 'S01', status: 'available' }],
  });
  const booked = await ClassSession.create({
    title: 'Booked Class',
    instructorName: 'Instructor',
    startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    price: 250,
    durationMinutes: 45,
    seats: [{
      seatNumber: 'S01',
      status: 'booked',
      bookedBy: administrator.user.id,
    }],
  });
  const held = await ClassSession.create({
    title: 'Held Class',
    instructorName: 'Instructor',
    startsAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
    price: 250,
    durationMinutes: 45,
    seats: [{
      seatNumber: 'S01',
      status: 'pending_payment',
      bookedBy: administrator.user.id,
      holdExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      paymentOrderId: 'held-payment-order',
    }],
  });
  const headers = {
    Authorization: `Bearer ${administrator.accessToken}`,
    Origin: 'http://localhost:5173',
  };

  await request(app)
    .delete(`/api/admin/classes/${booked._id}`)
    .set(headers)
    .expect(409);
  assert.ok(await ClassSession.exists({ _id: booked._id }));
  await request(app)
    .delete(`/api/admin/classes/${held._id}`)
    .set(headers)
    .expect(409);
  assert.ok(await ClassSession.exists({ _id: held._id }));

  await request(app)
    .delete(`/api/admin/classes/${removable._id}`)
    .set(headers)
    .expect(200);
  assert.equal(await ClassSession.exists({ _id: removable._id }), null);
});

test('admin product and order list endpoints return paginated results', async () => {
  const administrator = await registerUser('admin-pagination@example.com');
  await User.updateOne({ _id: administrator.user.id }, { $set: { role: 'admin' } });
  await Product.create(Array.from({ length: 23 }, (_, index) => ({
    name: `Pagination Product ${index}`,
    price: 100 + index,
    stock: 5,
    active: true,
  })));
  const address = {
    fullName: 'Test User',
    phone: '9876543210',
    line1: 'Test Road',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '411001',
  };
  await Order.create(Array.from({ length: 12 }, (_, index) => ({
    user: administrator.user.id,
    items: [],
    total: 100 + index,
    shippingAddress: address,
  })));
  const headers = { Authorization: `Bearer ${administrator.accessToken}` };

  const products = await request(app)
    .get('/api/admin/products?page=2&limit=10')
    .set(headers)
    .expect(200);
  assert.equal(products.body.products.length, 10);
  assert.deepEqual(products.body.pagination, {
    page: 2,
    limit: 10,
    total: 23,
    pages: 3,
  });

  const orders = await request(app)
    .get('/api/admin/orders?page=2&limit=10')
    .set(headers)
    .expect(200);
  assert.equal(orders.body.orders.length, 2);
  assert.deepEqual(orders.body.pagination, {
    page: 2,
    limit: 10,
    total: 12,
    pages: 2,
  });

  const byName = await request(app)
    .get('/api/admin/orders?search=Test%20User')
    .set(headers)
    .expect(200);
  assert.equal(byName.body.pagination.total, 12);

  const byAmount = await request(app)
    .get('/api/admin/orders?search=10')
    .set(headers)
    .expect(200);
  assert.ok(byAmount.body.orders.some((order) => order.total === 105));

  const orderIdSuffix = String(byAmount.body.orders[0]._id).slice(-8);
  const byOrderId = await request(app)
    .get(`/api/admin/orders?search=${orderIdSuffix.slice(-4)}`)
    .set(headers)
    .expect(200);
  assert.ok(
    byOrderId.body.orders.some(
      (order) => String(order._id).slice(-8) === orderIdSuffix,
    ),
  );
});

test('customers may cancel eligible orders within six hours and stock is restored once', async () => {
  const customer = await registerUser('order-cancel-customer@example.com');
  const product = await Product.create({
    name: 'Cancellation Test Product',
    price: 250,
    stock: 3,
  });
  const order = await Order.create({
    user: customer.user.id,
    items: [{ product: product._id, name: product.name, price: 250, quantity: 2 }],
    total: 500,
    shippingAddress: {
      fullName: 'Test User',
      phone: '9876543210',
      line1: 'Test Road',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
    },
    paymentMethod: 'cod',
    status: 'processing',
  });
  const headers = { Authorization: `Bearer ${customer.accessToken}` };

  const cancelled = await request(app)
    .post(`/api/orders/${order._id}/cancel`)
    .set(headers)
    .expect(200);
  assert.equal(cancelled.body.order.status, 'cancelled');
  assert.ok(cancelled.body.order.inventoryReleasedAt);
  assert.equal((await Product.findById(product._id)).stock, 5);

  await request(app)
    .post(`/api/orders/${order._id}/cancel`)
    .set(headers)
    .expect(409);
  assert.equal((await Product.findById(product._id)).stock, 5);

  const expiredOrder = await Order.create({
    user: customer.user.id,
    items: [{ product: product._id, name: product.name, price: 250, quantity: 1 }],
    total: 250,
    shippingAddress: {
      fullName: 'Test User',
      phone: '9876543210',
      line1: 'Test Road',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
    },
    paymentMethod: 'cod',
    status: 'processing',
    createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
  });
  await request(app)
    .post(`/api/orders/${expiredOrder._id}/cancel`)
    .set(headers)
    .expect(409);
  assert.equal((await Product.findById(product._id)).stock, 5);

  const paidOrder = await Order.create({
    user: customer.user.id,
    items: [{ product: product._id, name: product.name, price: 250, quantity: 1 }],
    total: 250,
    shippingAddress: {
      fullName: 'Test User',
      phone: '9876543210',
      line1: 'Test Road',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
    },
    paymentMethod: 'cashfree',
    paymentStatus: 'paid',
    status: 'paid',
  });
  await Product.updateOne({ _id: product._id }, { $inc: { stock: -1 } });
  const paidCancellation = await request(app)
    .post(`/api/orders/${paidOrder._id}/cancel`)
    .set(headers)
    .expect(200);
  assert.equal(paidCancellation.body.order.status, 'cancelled');
  assert.equal(paidCancellation.body.order.paymentStatus, 'paid');
  assert.match(
    paidCancellation.body.order.statusHistory.at(-1).note,
    /refund must be handled manually/i,
  );
  assert.equal((await Product.findById(product._id)).stock, 5);
});

test('customers may enter a new order address until shipment, but not after shipping', async () => {
  const customer = await registerUser('order-address-change@example.com');
  const order = await Order.create({
    user: customer.user.id,
    items: [],
    total: 250,
    shippingAddress: {
      fullName: 'Test User',
      phone: '9876543210',
      line1: 'Old Road',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
    },
    paymentMethod: 'cashfree',
    paymentStatus: 'paid',
    status: 'processing',
  });
  const headers = { Authorization: `Bearer ${customer.accessToken}` };
  const nextAddress = {
    fullName: 'Test User',
    phone: '9876543210',
    line1: 'New Road',
    line2: 'Apartment 4',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400001',
    country: 'India',
  };
  const updated = await request(app)
    .patch(`/api/orders/${order._id}/address`)
    .set(headers)
    .send({ shippingAddress: nextAddress })
    .expect(200);
  assert.equal(updated.body.order.shippingAddress.line1, 'New Road');
  assert.equal(updated.body.order.shippingAddress.city, 'Mumbai');

  await Order.updateOne(
    { _id: order._id },
    { $set: { status: 'shipped', addressChangeAllowed: false } },
  );
  await request(app)
    .patch(`/api/orders/${order._id}/address`)
    .set(headers)
    .send({ shippingAddress: { ...nextAddress, line1: 'Third Road' } })
    .expect(409);
});

test('admin can cancel paid Cashfree orders and a late success does not restore stock twice', async () => {
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.CASHFREE_CLIENT_ID;
  const originalClientSecret = process.env.CASHFREE_CLIENT_SECRET;
  process.env.CASHFREE_CLIENT_ID = 'test-client-id';
  process.env.CASHFREE_CLIENT_SECRET = 'test-cashfree-webhook-secret';
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /\/refunds$/);
    const body = JSON.parse(options.body);
    assert.equal(body.refund_amount, 600);
    assert.ok(options.headers['x-idempotency-key']);
    return new Response(
      JSON.stringify({
        refund_status: 'SUCCESS',
        cf_refund_id: 'cf-refund-123',
      }),
      { status: 200 },
    );
  };
  const customer = await registerUser('paid-cancel-customer@example.com');
  const administrator = await registerUser('order-cancel-admin@example.com');
  const adminHeaders = {
    Authorization: `Bearer ${administrator.accessToken}`,
  };
  await User.updateOne(
    { _id: administrator.user.id },
    { $set: { role: 'admin' } },
  );
  const product = await Product.create({
    name: 'Paid Cancellation Product',
    price: 300,
    stock: 3,
  });
  const address = {
    fullName: 'Test User',
    phone: '9876543210',
    line1: 'Test Road',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '411001',
  };
  const order = await Order.create({
    user: customer.user.id,
    items: [{ product: product._id, name: product.name, price: 300, quantity: 2 }],
    total: 600,
    shippingAddress: address,
    paymentMethod: 'cashfree',
    paymentStatus: 'paid',
    status: 'paid',
    payment: { providerOrderId: `DV${new mongoose.Types.ObjectId()}` },
  });

  const cancelled = await request(app)
    .post(`/api/admin/orders/${order._id}/cancel`)
    .set({ Authorization: `Bearer ${administrator.accessToken}` })
    .expect(200);
  assert.equal(cancelled.body.order.status, 'cancelled');
  assert.equal(cancelled.body.order.paymentStatus, 'refunded');
  assert.equal(cancelled.body.order.refund.status, 'success');
  assert.match(
    cancelled.body.order.statusHistory.at(-1).note,
    /cashfree refund success/i,
  );
  const adminOrderList = await request(app)
    .get('/api/admin/orders')
    .set(adminHeaders)
    .expect(200);
  const auditedOrder = adminOrderList.body.orders.find(
    (listedOrder) => listedOrder._id === String(order._id),
  );
  assert.equal(
    auditedOrder.statusHistory.at(-1).by.name,
    administrator.user.name,
  );
  assert.equal((await Product.findById(product._id)).stock, 5);

  const retryProduct = await Product.create({
    name: 'Refund Retry Product',
    price: 300,
    stock: 2,
  });
  const retryOrder = await Order.create({
    user: customer.user.id,
    items: [{ product: retryProduct._id, name: retryProduct.name, price: 300, quantity: 1 }],
    total: 300,
    shippingAddress: address,
    paymentMethod: 'cashfree',
    paymentStatus: 'paid',
    status: 'paid',
    payment: { providerOrderId: `DV${new mongoose.Types.ObjectId()}` },
  });
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: 'Provider unavailable' }), {
      status: 503,
    });
  await request(app)
    .post(`/api/admin/orders/${retryOrder._id}/cancel`)
    .set(adminHeaders)
    .expect(502);
  const failedRefund = await Order.findById(retryOrder._id);
  assert.equal(failedRefund.status, 'paid');
  assert.equal(failedRefund.refund.status, 'failed');
  const retryKey = failedRefund.refund.idempotencyKey;
  assert.equal((await Product.findById(retryProduct._id)).stock, 2);

  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers['x-idempotency-key'], retryKey);
    return new Response(
      JSON.stringify({
        refund_status: 'PENDING',
        cf_refund_id: 'cf-refund-retry',
      }),
      { status: 200 },
    );
  };
  const retriedCancellation = await request(app)
    .post(`/api/admin/orders/${retryOrder._id}/cancel`)
    .set(adminHeaders)
    .expect(200);
  assert.equal(retriedCancellation.body.order.status, 'cancelled');
  assert.equal(retriedCancellation.body.order.refund.status, 'pending');
  assert.equal((await Product.findById(retryProduct._id)).stock, 3);

  async function sendWebhook(providerOrderId, paymentStatus, paymentId) {
    const timestamp = String(Date.now());
    const payload = JSON.stringify({
      data: {
        order: { order_id: providerOrderId },
        payment: { payment_status: paymentStatus, cf_payment_id: paymentId },
      },
    });
    const signature = crypto
      .createHmac('sha256', process.env.CASHFREE_CLIENT_SECRET)
      .update(timestamp + payload)
      .digest('base64');
    await request(app)
      .post('/api/orders/cashfree/webhook')
      .set('content-type', 'application/json')
      .set('x-webhook-timestamp', timestamp)
      .set('x-webhook-signature', signature)
      .send(payload)
      .expect(200);
  }
  try {
    const refundTimestamp = String(Date.now());
    const refundPayload = JSON.stringify({
      type: 'REFUND_STATUS_WEBHOOK',
      data: {
        order: { order_id: retryOrder.payment.providerOrderId },
        refund: {
          refund_id: retriedCancellation.body.order.refund.refundId,
          cf_refund_id: 'cf-refund-retry',
          refund_status: 'SUCCESS',
        },
      },
    });
    const refundSignature = crypto
      .createHmac('sha256', process.env.CASHFREE_CLIENT_SECRET)
      .update(refundTimestamp + refundPayload)
      .digest('base64');
    await request(app)
      .post('/api/orders/cashfree/webhook')
      .set('content-type', 'application/json')
      .set('x-webhook-timestamp', refundTimestamp)
      .set('x-webhook-signature', refundSignature)
      .send(refundPayload)
      .expect(200);
    assert.equal(
      (await Order.findById(retryOrder._id)).paymentStatus,
      'refunded',
    );

    await Product.updateOne({ _id: product._id }, { $inc: { stock: -1 } });
    const failedOrder = await Order.create({
      user: customer.user.id,
      items: [{ product: product._id, name: product.name, price: 300, quantity: 1 }],
      total: 300,
      shippingAddress: address,
      paymentMethod: 'cashfree',
      paymentStatus: 'pending',
      status: 'pending',
      payment: { providerOrderId: `DV${new mongoose.Types.ObjectId()}` },
    });
    await request(app)
      .post(`/api/orders/${failedOrder._id}/cancel`)
      .set({ Authorization: `Bearer ${customer.accessToken}` })
      .expect(200);
    await sendWebhook(failedOrder.payment.providerOrderId, 'FAILED', 'failed-id');
    assert.equal((await Product.findById(product._id)).stock, 5);

    await Product.updateOne({ _id: product._id }, { $inc: { stock: -1 } });
    const pendingOrder = await Order.create({
      user: customer.user.id,
      items: [{ product: product._id, name: product.name, price: 300, quantity: 1 }],
      total: 300,
      shippingAddress: address,
      paymentMethod: 'cashfree',
      paymentStatus: 'pending',
      status: 'pending',
      payment: { providerOrderId: `DV${new mongoose.Types.ObjectId()}` },
    });
    await request(app)
      .post(`/api/orders/${pendingOrder._id}/cancel`)
      .set({ Authorization: `Bearer ${customer.accessToken}` })
      .expect(200);
    await sendWebhook(
      pendingOrder.payment.providerOrderId,
      'SUCCESS',
      'late-payment-id',
    );
    const latePaidOrder = await Order.findById(pendingOrder._id);
    assert.equal(latePaidOrder.status, 'cancelled');
    assert.equal(latePaidOrder.paymentStatus, 'paid');
    assert.match(latePaidOrder.statusHistory.at(-1).note, /refund manually/i);
    assert.equal((await Product.findById(product._id)).stock, 5);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalClientId === undefined) delete process.env.CASHFREE_CLIENT_ID;
    else process.env.CASHFREE_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined)
      delete process.env.CASHFREE_CLIENT_SECRET;
    else process.env.CASHFREE_CLIENT_SECRET = originalClientSecret;
  }
});

test('product return windows are shown in details and all items must remain eligible for a return', async () => {
  const customer = await registerUser('product-return-window-customer@example.com');
  const administrator = await registerUser('product-return-window-admin@example.com');
  await User.updateOne(
    { _id: administrator.user.id },
    { $set: { role: 'admin' } },
  );
  const adminHeaders = {
    Authorization: `Bearer ${administrator.accessToken}`,
  };
  const oneDayProduct = await Product.create({
    name: 'One Day Return Product',
    price: 100,
    returnWindowDays: 1,
  });
  const fiveDayProduct = await Product.create({
    name: 'Five Day Return Product',
    price: 100,
    returnWindowDays: 5,
  });
  const noPolicyProduct = await Product.create({
    name: 'No Return Policy Product',
    price: 100,
  });
  const customerHeaders = {
    Authorization: `Bearer ${customer.accessToken}`,
  };
  const createDeliveredOrder = (products, deliveredDaysAgo) =>
    Order.create({
      user: customer.user.id,
      items: products.map((product) => ({
        product: product._id,
        name: product.name,
        price: product.price,
        quantity: 1,
        returnable: product.returnable !== false &&
          Number.isInteger(product.returnWindowDays),
        returnWindowDays: product.returnWindowDays,
      })),
      total: products.reduce((sum, product) => sum + product.price, 0),
      shippingAddress: {
        fullName: 'Test User',
        phone: '9876543210',
        line1: 'Test Road',
        city: 'Pune',
        state: 'Maharashtra',
        postalCode: '411001',
      },
      paymentMethod: 'cashfree',
      paymentStatus: 'paid',
      status: 'delivered',
      deliveredAt: new Date(Date.now() - deliveredDaysAgo * 24 * 60 * 60 * 1000),
      payment: { providerOrderId: `DV${new mongoose.Types.ObjectId()}` },
    });

  const productDetails = await request(app)
    .get(`/api/products/${fiveDayProduct._id}`)
    .expect(200);
  assert.equal(productDetails.body.product.returnWindowDays, 5);
  const noPolicyDetails = await request(app)
    .get(`/api/products/${noPolicyProduct._id}`)
    .expect(200);
  assert.equal(noPolicyDetails.body.product.returnable, false);
  assert.equal(noPolicyDetails.body.product.returnWindowDays, null);

  const mixedOrder = await createDeliveredOrder(
    [oneDayProduct, fiveDayProduct],
    2,
  );
  await request(app)
    .post(`/api/orders/${mixedOrder._id}/return`)
    .set(customerHeaders)
    .send({ reason: 'One item is outside its return window' })
    .expect(409);

  const noPolicyOrder = await createDeliveredOrder([noPolicyProduct], 0);
  const noPolicyReturn = await request(app)
    .post(`/api/orders/${noPolicyOrder._id}/return`)
    .set(customerHeaders)
    .send({ reason: 'Item has no return policy' })
    .expect(409);
  assert.equal(noPolicyReturn.body.code, 'NON_RETURNABLE_ITEM');

  const fiveDayOrder = await createDeliveredOrder([fiveDayProduct], 4);
  await request(app)
    .post(`/api/orders/${fiveDayOrder._id}/return`)
    .set(customerHeaders)
    .send({ reason: 'Within the product return window' })
    .expect(201);
});

test('customers may request an in-window return and Admin refunds after receipt', async () => {
  const customer = await registerUser('return-customer@example.com');
  const administrator = await registerUser('return-admin@example.com');
  await User.updateOne(
    { _id: administrator.user.id },
    { $set: { role: 'admin' } },
  );
  const customerHeaders = {
    Authorization: `Bearer ${customer.accessToken}`,
  };
  const adminHeaders = {
    Authorization: `Bearer ${administrator.accessToken}`,
  };
  const product = await Product.create({
    name: 'Returnable Product',
    price: 250,
    stock: 1,
    returnable: true,
    returnWindowDays: 2,
  });
  const order = await Order.create({
    user: customer.user.id,
    items: [{
      product: product._id,
      name: product.name,
      price: 250,
      quantity: 1,
      returnable: true,
      returnWindowDays: 2,
    }],
    total: 250,
    shippingAddress: {
      fullName: 'Test User',
      phone: '9876543210',
      line1: 'Test Road',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
    },
    paymentMethod: 'cashfree',
    paymentStatus: 'paid',
    status: 'delivered',
    deliveredAt: new Date(),
    payment: { providerOrderId: `DV${new mongoose.Types.ObjectId()}` },
  });
  const expired = await Order.create({
    user: customer.user.id,
    items: [{
      product: product._id,
      name: product.name,
      price: 250,
      quantity: 1,
      returnable: true,
      returnWindowDays: 2,
    }],
    total: 250,
    shippingAddress: order.shippingAddress,
    paymentMethod: 'cashfree',
    paymentStatus: 'paid',
    status: 'delivered',
    deliveredAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    payment: { providerOrderId: `DV${new mongoose.Types.ObjectId()}` },
  });
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.CASHFREE_CLIENT_ID;
  const originalClientSecret = process.env.CASHFREE_CLIENT_SECRET;
  process.env.CASHFREE_CLIENT_ID = 'test-client-id';
  process.env.CASHFREE_CLIENT_SECRET = 'test-cashfree-secret';
  try {
    await request(app)
      .post(`/api/orders/${expired._id}/return`)
      .set(customerHeaders)
      .send({ reason: 'Too late' })
      .expect(409);
    const requested = await request(app)
      .post(`/api/orders/${order._id}/return`)
      .set(customerHeaders)
      .send({ reason: 'Item arrived damaged' })
      .expect(201);
    assert.equal(requested.body.order.returnRequest.status, 'requested');
    await request(app)
      .patch(`/api/admin/orders/${order._id}/return`)
      .set(adminHeaders)
      .send({ status: 'approved' })
      .expect(200);
    globalThis.fetch = async (url, options) => {
      assert.match(String(url), /\/refunds$/);
      assert.equal(JSON.parse(options.body).refund_amount, 250);
      return new Response(
        JSON.stringify({
          refund_status: 'SUCCESS',
          cf_refund_id: 'cf-return-refund',
        }),
        { status: 200 },
      );
    };
    const received = await request(app)
      .patch(`/api/admin/orders/${order._id}/return`)
      .set(adminHeaders)
      .send({ status: 'received' })
      .expect(200);
    assert.equal(received.body.order.returnRequest.status, 'refunded');
    assert.equal(received.body.order.paymentStatus, 'refunded');
    assert.equal(received.body.order.refund.reason, 'customer_return');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalClientId === undefined) delete process.env.CASHFREE_CLIENT_ID;
    else process.env.CASHFREE_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined)
      delete process.env.CASHFREE_CLIENT_SECRET;
    else process.env.CASHFREE_CLIENT_SECRET = originalClientSecret;
  }
});

test('WhatsApp confirmations use approved templates and only send to opted-in users', async () => {
  const customer = await registerUser('whatsapp-opt-in@example.com');
  await User.updateOne(
    { _id: customer.user.id },
    { $set: { phone: '9876543210', whatsappOptIn: true } },
  );
  const product = await Product.create({
    name: 'WhatsApp Product',
    price: 250,
    stock: 1,
  });
  const order = await Order.create({
    user: customer.user.id,
    items: [{ product: product._id, name: product.name, price: 250, quantity: 1 }],
    total: 250,
    shippingAddress: {
      fullName: 'Test User',
      phone: '9876543210',
      line1: 'Test Road',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
    },
    paymentMethod: 'cashfree',
    paymentStatus: 'paid',
    status: 'paid',
    payment: { providerOrderId: `DV${new mongoose.Types.ObjectId()}` },
  });
  const { sendOrderWhatsApp, sendClassWhatsApp } = await import('../src/services/whatsappService.js');
  const originalFetch = globalThis.fetch;
  const originalPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const originalToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const originalTemplate = process.env.WHATSAPP_ORDER_TEMPLATE;
  const originalClassTemplate = process.env.WHATSAPP_CLASS_TEMPLATE;
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-id';
  process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token';
  process.env.WHATSAPP_ORDER_TEMPLATE = 'order_confirmation';
  process.env.WHATSAPP_CLASS_TEMPLATE = 'class_confirmation';
  const outgoingBodies = [];
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /\/messages$/);
    outgoingBodies.push(JSON.parse(options.body));
    return new Response(
      JSON.stringify({ messages: [{ id: 'wamid.test-message' }] }),
      { status: 200 },
    );
  };
  try {
    await sendOrderWhatsApp(order._id);
    const sentOrder = await Order.findById(order._id);
    assert.equal(sentOrder.whatsapp.status, 'sent');
    assert.equal(sentOrder.whatsapp.messageId, 'wamid.test-message');
    assert.equal(outgoingBodies[0].to, '919876543210');
    assert.equal(outgoingBodies[0].template.name, 'order_confirmation');
    assert.equal(outgoingBodies[0].template.components[0].parameters.length, 3);
    const classSession = await ClassSession.create({
      title: 'WhatsApp Class',
      instructorName: 'Instructor',
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      price: 250,
      seats: [
        {
          seatNumber: 'A1',
          status: 'booked',
          bookedBy: customer.user.id,
          paymentOrderId: `CLS${'a'.repeat(32)}`,
        },
      ],
    });
    await sendClassWhatsApp(classSession._id, `CLS${'a'.repeat(32)}`);
    const notifiedClass = await ClassSession.findById(classSession._id);
    assert.equal(notifiedClass.seats[0].whatsapp.status, 'sent');
    assert.equal(outgoingBodies[1].template.name, 'class_confirmation');
    assert.equal(outgoingBodies[1].template.components[0].parameters.length, 4);

    await User.updateOne(
      { _id: customer.user.id },
      { $set: { whatsappOptIn: false } },
    );
    const optedOutOrder = await Order.create({
      user: customer.user.id,
      items: [{ product: product._id, name: product.name, price: 250, quantity: 1 }],
      total: 250,
      shippingAddress: order.shippingAddress,
      paymentMethod: 'cashfree',
      paymentStatus: 'paid',
      status: 'paid',
      payment: { providerOrderId: `DV${new mongoose.Types.ObjectId()}` },
    });
    await sendOrderWhatsApp(optedOutOrder._id);
    assert.equal((await Order.findById(optedOutOrder._id)).whatsapp.status, 'not_requested');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalPhoneId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
    if (originalToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = originalToken;
    if (originalTemplate === undefined) delete process.env.WHATSAPP_ORDER_TEMPLATE;
    else process.env.WHATSAPP_ORDER_TEMPLATE = originalTemplate;
    if (originalClassTemplate === undefined) delete process.env.WHATSAPP_CLASS_TEMPLATE;
    else process.env.WHATSAPP_CLASS_TEMPLATE = originalClassTemplate;
  }
});

test('Shiprocket tracking webhook records delivery and missing setup fails clearly', async () => {
  const administrator = await registerUser('shiprocket-admin@example.com');
  await User.updateOne(
    { _id: administrator.user.id },
    { $set: { role: 'admin' } },
  );
  const adminHeaders = {
    Authorization: `Bearer ${administrator.accessToken}`,
  };
  const product = await Product.create({
    name: 'Shiprocket Product',
    price: 250,
    stock: 1,
  });
  const order = await Order.create({
    user: administrator.user.id,
    items: [{ product: product._id, name: product.name, price: 250, quantity: 1 }],
    total: 250,
    shippingAddress: {
      fullName: 'Test User',
      phone: '9876543210',
      line1: 'Test Road',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
    },
    paymentMethod: 'cashfree',
    paymentStatus: 'paid',
    status: 'shipped',
    tracking: { trackingNumber: 'SR-TEST-AWB' },
    payment: { providerOrderId: `DV${new mongoose.Types.ObjectId()}` },
  });
  const originalWebhookToken = process.env.SHIPROCKET_WEBHOOK_TOKEN;
  const originalPickupCode = process.env.SHIPROCKET_PICKUP_POSTCODE;
  const originalEmail = process.env.SHIPROCKET_EMAIL;
  const originalPassword = process.env.SHIPROCKET_PASSWORD;
  const originalPickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION;
  process.env.SHIPROCKET_WEBHOOK_TOKEN = 'test-webhook-token';
  process.env.SHIPROCKET_PICKUP_POSTCODE = '';
  process.env.SHIPROCKET_EMAIL = '';
  process.env.SHIPROCKET_PASSWORD = '';
  process.env.SHIPROCKET_PICKUP_LOCATION = '';
  try {
    await request(app)
      .post('/api/courier-updates')
      .set('x-api-key', 'test-webhook-token')
      .send({ awb: 'SR-TEST-AWB', current_status: 'OUT FOR DELIVERY' })
      .expect(200);
    const outForDelivery = await Order.findById(order._id);
    assert.equal(outForDelivery.status, 'shipped');
    assert.equal(outForDelivery.deliveredAt, null);
    await request(app)
      .post('/api/courier-updates')
      .set('x-api-key', 'test-webhook-token')
      .send({ awb: 'SR-TEST-AWB', current_status: 'DELIVERED' })
      .expect(200);
    const delivered = await Order.findById(order._id);
    assert.equal(delivered.status, 'delivered');
    assert.ok(delivered.deliveredAt);
    assert.match(delivered.statusHistory.at(-1).note, /Shiprocket tracking update/);
    const shipmentOrder = await Order.create({
      user: administrator.user.id,
      items: [{ product: product._id, name: product.name, price: 250, quantity: 1 }],
      total: 250,
      shippingAddress: order.shippingAddress,
      paymentMethod: 'cashfree',
      paymentStatus: 'paid',
      status: 'processing',
      payment: { providerOrderId: `DV${new mongoose.Types.ObjectId()}` },
    });
    await request(app)
      .post(`/api/admin/orders/${shipmentOrder._id}/shipment`)
      .set(adminHeaders)
      .send({ weight: 0.5, length: 10, breadth: 10, height: 10, courierId: 1 })
      .expect(503);
  } finally {
    if (originalWebhookToken === undefined) delete process.env.SHIPROCKET_WEBHOOK_TOKEN;
    else process.env.SHIPROCKET_WEBHOOK_TOKEN = originalWebhookToken;
    if (originalPickupCode === undefined) delete process.env.SHIPROCKET_PICKUP_POSTCODE;
    else process.env.SHIPROCKET_PICKUP_POSTCODE = originalPickupCode;
    if (originalEmail === undefined) delete process.env.SHIPROCKET_EMAIL;
    else process.env.SHIPROCKET_EMAIL = originalEmail;
    if (originalPassword === undefined) delete process.env.SHIPROCKET_PASSWORD;
    else process.env.SHIPROCKET_PASSWORD = originalPassword;
    if (originalPickupLocation === undefined) delete process.env.SHIPROCKET_PICKUP_LOCATION;
    else process.env.SHIPROCKET_PICKUP_LOCATION = originalPickupLocation;
  }
});

test('Cashfree product checkout creates an order only after successful payment', async () => {
  const customer = await registerUser('product-payment-checkout@example.com');
  const product = await Product.create({
    name: 'Deferred Order Product',
    price: 250,
    stock: 3,
    returnWindowDays: 5,
  });
  const address = {
    fullName: 'Test User',
    phone: '9876543210',
    line1: 'Test Road',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '411001',
  };
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.CASHFREE_CLIENT_ID;
  const originalClientSecret = process.env.CASHFREE_CLIENT_SECRET;
  process.env.CASHFREE_CLIENT_ID = 'test-client-id';
  process.env.CASHFREE_CLIENT_SECRET = 'test-cashfree-webhook-secret';
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/payments'))
      return new Response(
        JSON.stringify([
          {
            payment_status: 'SUCCESS',
            payment_amount: 250,
            cf_payment_id: 'successful-payment',
          },
        ]),
        { status: 200 },
      );
    const body = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        order_id: body.order_id,
        payment_session_id: 'deferred-order-payment-session',
      }),
      { status: 200 },
    );
  };
  async function sendWebhook(providerOrderId, paymentStatus, paymentId) {
    const timestamp = String(Date.now());
    const payload = JSON.stringify({
      data: {
        order: { order_id: providerOrderId },
        payment: {
          payment_status: paymentStatus,
          cf_payment_id: paymentId,
        },
      },
    });
    const signature = crypto
      .createHmac('sha256', process.env.CASHFREE_CLIENT_SECRET)
      .update(timestamp + payload)
      .digest('base64');
    await request(app)
      .post('/api/orders/cashfree/webhook')
      .set('content-type', 'application/json')
      .set('x-webhook-timestamp', timestamp)
      .set('x-webhook-signature', signature)
      .send(payload)
      .expect(200);
  }
  try {
    await request(app)
      .post('/api/orders')
      .set({ Authorization: `Bearer ${customer.accessToken}` })
      .send({
        items: [{ product: product._id.toString(), quantity: 1 }],
        shippingAddress: address,
        paymentMethod: 'cod',
      })
      .expect(400);
    assert.equal((await Product.findById(product._id)).stock, 3);
    assert.equal(await ProductPaymentAttempt.countDocuments(), 0);

    const checkout = await request(app)
      .post('/api/orders')
      .set({ Authorization: `Bearer ${customer.accessToken}` })
      .send({
        items: [{ product: product._id.toString(), quantity: 1 }],
        shippingAddress: address,
        paymentMethod: 'cashfree',
      })
      .expect(201);
    assert.ok(checkout.body.attemptId);
    assert.equal(checkout.body.order, undefined);
    assert.equal(
      checkout.body.payment.paymentSessionId,
      'deferred-order-payment-session',
    );
    assert.equal(await Order.countDocuments({ user: customer.user.id }), 0);
    assert.equal((await Product.findById(product._id)).stock, 2);

    const attempt = await ProductPaymentAttempt.findById(
      checkout.body.attemptId,
    );
    assert.ok(attempt);
    assert.equal(attempt.items[0].returnWindowDays, 5);
    assert.equal(attempt.items[0].returnable, true);
    await sendWebhook(attempt.providerOrderId, 'FAILED', 'failed-product-payment');
    assert.equal(await Order.countDocuments({ user: customer.user.id }), 0);
    assert.equal((await Product.findById(product._id)).stock, 3);
    assert.equal((await ProductPaymentAttempt.findById(attempt._id)).status, 'failed');

    const nextCheckout = await request(app)
      .post('/api/orders')
      .set({ Authorization: `Bearer ${customer.accessToken}` })
      .send({
        items: [{ product: product._id.toString(), quantity: 1 }],
        shippingAddress: address,
        paymentMethod: 'cashfree',
      })
      .expect(201);
    const paidAttempt = await ProductPaymentAttempt.findById(
      nextCheckout.body.attemptId,
    );
    const verification = await request(app)
      .post(`/api/orders/${paidAttempt._id}/verify-payment`)
      .set({ Authorization: `Bearer ${customer.accessToken}` })
      .expect(200);
    assert.equal(verification.body.paymentStatus, 'paid');
    assert.ok(verification.body.order);
    await sendWebhook(paidAttempt.providerOrderId, 'SUCCESS', 'successful-payment');
    await sendWebhook(paidAttempt.providerOrderId, 'SUCCESS', 'successful-payment');

    const orders = await Order.find({ user: customer.user.id });
    assert.equal(orders.length, 1);
    assert.equal(orders[0].paymentStatus, 'paid');
    assert.equal(orders[0].status, 'paid');
    assert.equal(orders[0].items[0].returnWindowDays, 5);
    assert.equal(orders[0].items[0].returnable, true);
    assert.equal((await Product.findById(product._id)).stock, 2);
    assert.equal(
      (await ProductPaymentAttempt.findById(paidAttempt._id)).status,
      'order_created',
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalClientId === undefined) delete process.env.CASHFREE_CLIENT_ID;
    else process.env.CASHFREE_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined)
      delete process.env.CASHFREE_CLIENT_SECRET;
    else process.env.CASHFREE_CLIENT_SECRET = originalClientSecret;
  }
});

test('expired unpaid product payment reservations restore inventory without creating orders', async () => {
  const customer = await registerUser('expired-product-payment@example.com');
  const product = await Product.create({
    name: 'Expired Reservation Product',
    price: 200,
    stock: 1,
  });
  const attempt = await ProductPaymentAttempt.create({
    user: customer.user.id,
    items: [{ product: product._id, name: product.name, price: 200, quantity: 1 }],
    total: 200,
    shippingAddress: {
      fullName: 'Test User',
      phone: '9876543210',
      line1: 'Test Road',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
    },
    providerOrderId: `DV${crypto.randomBytes(16).toString('hex')}`,
    paymentSessionId: 'expired-payment-session',
    expiresAt: new Date(Date.now() - 1000),
  });
  await Product.updateOne({ _id: product._id }, { $inc: { stock: -1 } });
  const {
    createOrderForPaidAttempt,
    releaseExpiredProductPaymentAttempts,
  } = await import('../src/services/productPaymentService.js');
  await releaseExpiredProductPaymentAttempts();
  await releaseExpiredProductPaymentAttempts();
  const expired = await ProductPaymentAttempt.findById(attempt._id);
  assert.equal(expired.status, 'expired');
  assert.ok(expired.inventoryReleasedAt);
  assert.equal((await Product.findById(product._id)).stock, 1);
  assert.equal(await Order.countDocuments({ user: customer.user.id }), 0);

  const recoveredOrder = await createOrderForPaidAttempt(
    expired,
    'late-successful-payment',
  );
  assert.ok(recoveredOrder);
  assert.equal(recoveredOrder.paymentStatus, 'paid');
  assert.equal((await Product.findById(product._id)).stock, 0);
});
