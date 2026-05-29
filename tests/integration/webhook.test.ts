import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ─── Mock ALL external dependencies BEFORE importing anything ───────────────

// Mock Supabase
const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  ilike: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  not: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  range: vi.fn().mockReturnThis(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
  then: vi.fn().mockImplementation((resolve) => resolve({ data: [], error: null })),
};

vi.mock('../../src/db/client', () => ({
  getSupabase: () => mockSupabase,
}));

// Mock Redis
const mockRedis = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
};

vi.mock('../../src/db/redis', () => ({
  getRedis: () => mockRedis,
}));

// Mock Sentry
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

// Mock node-cron
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(),
  },
}));

// Mock Gemini AI
vi.mock('../../src/services/nlp/geminiParser', () => ({
  callGemini: vi.fn(async () => null),
}));

// Mock Groq AI
vi.mock('../../src/services/nlp/groqParser', () => ({
  callGroq: vi.fn(async () => null),
}));

// Mock CurrencyService
vi.mock('../../src/services/currency', () => ({
  CurrencyService: {
    convert: vi.fn(async (amount: number) => amount),
    getRate: vi.fn(async () => 1.0),
    refreshRates: vi.fn(),
  }
}));

// ─── Set environment variables ──────────────────────────────────────────────

process.env.TELEGRAM_BOT_TOKEN = 'mock:test_token_12345';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-xyz';
process.env.OWNER_TELEGRAM_ID = '123456789';
process.env.NODE_ENV = 'test';

// ─── Import app after mocks ────────────────────────────────────────────────

import { app } from '../../src/server';

// Helper to make webhook POST requests (Hono fetch-based testing)
async function postWebhook(body: object, secret?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (secret !== undefined) {
    headers['X-Telegram-Bot-Api-Secret-Token'] = secret;
  }

  const req = new Request('http://localhost/webhook/telegram', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  return app.fetch(req);
}

function buildTelegramUpdate(text: string, fromId: number = 123456789) {
  return {
    update_id: Math.floor(Math.random() * 100000),
    message: {
      message_id: 1,
      from: {
        id: fromId,
        is_bot: false,
        first_name: 'Test',
      },
      chat: {
        id: fromId,
        type: 'private',
      },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  };
}

describe('Webhook Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock behavior
    mockSupabase.from.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.delete.mockReturnValue(mockSupabase);
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.neq.mockReturnValue(mockSupabase);
    mockSupabase.ilike.mockReturnValue(mockSupabase);
    mockSupabase.or.mockReturnValue(mockSupabase);
    mockSupabase.gte.mockReturnValue(mockSupabase);
    mockSupabase.lte.mockReturnValue(mockSupabase);
    mockSupabase.not.mockReturnValue(mockSupabase);
    mockSupabase.limit.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.range.mockReturnValue(mockSupabase);
    mockSupabase.upsert.mockReturnValue(mockSupabase);
    mockSupabase.then.mockImplementation((resolve) => resolve({ data: [], error: null }));
  });

  it('POST /webhook with wrong secret → 403', async () => {
    const res = await postWebhook(
      buildTelegramUpdate('/ping'),
      'wrong-secret'
    );
    expect(res.status).toBe(403);
  });

  it('POST /webhook with no secret header → 403', async () => {
    const res = await postWebhook(buildTelegramUpdate('/ping'));
    expect(res.status).toBe(403);
  });

  it('POST /webhook with correct secret → 200 OK', async () => {
    const res = await postWebhook(
      buildTelegramUpdate('/ping'),
      'test-secret-xyz'
    );
    // Bot.handleUpdate is async and may not reply in test env, but the HTTP response should be OK
    expect(res.status).toBe(200);
  });

  it('POST /webhook with message from unknown user → 200 but owner gate drops it', async () => {
    const res = await postWebhook(
      buildTelegramUpdate('hello', 999999999), // Unknown user
      'test-secret-xyz'
    );
    // HTTP should still return OK (webhook received), but bot internally drops the message
    expect(res.status).toBe(200);
  });
});

describe('Health Endpoint', () => {
  it('GET /health returns ok status with uptime', async () => {
    const req = new Request('http://localhost/health');
    const res = await app.fetch(req);

    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.timestamp).toBeDefined();
  });
});
