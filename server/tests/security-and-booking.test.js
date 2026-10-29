import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
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

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  ({ default: app } = await import('../src/app.js'));
  ({ default: User } = await import('../src/models/User.js'));
  ({ default: Session } = await import('../src/models/Session.js'));
  ({ default: ClassSession } = await import('../src/models/ClassSession.js'));
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Session.deleteMany({}), ClassSession.deleteMany({})]);
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
  const session = await ClassSession.create({
    title: 'Concurrency Test Class', instructorName: 'Instructor', startsAt: new Date(Date.now() + 60 * 60 * 1000),
    durationMinutes: 60, seats: [{ seatNumber: 'S01', status: 'available' }]
  });
  const book = user => request(app).post(`/api/classes/${session._id}/seats/S01/book`)
    .set('Authorization', `Bearer ${user.accessToken}`).set('Origin', 'http://localhost:5173');
  const results = await Promise.all([book(first), book(second)]);
  assert.equal(results.filter(result => result.status === 201).length, 1, 'exactly one booking must succeed');
  assert.equal(results.filter(result => result.status === 409 && result.body.code === 'SEAT_UNAVAILABLE').length, 1, 'other request must conflict');
  const stored = await ClassSession.findById(session._id).lean();
  assert.equal(stored.seats[0].status, 'booked');
  assert.ok(stored.seats[0].bookedBy);
});
