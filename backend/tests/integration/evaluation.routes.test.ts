import request from 'supertest';
import { createApp } from '../../src/server';

describe('evaluation routes', () => {
  it('returns 404 for missing session status', async () => {
    const app = createApp();
    const response = await request(app).get('/api/evaluate/sess_missing/status');
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('SESSION_NOT_FOUND');
  });
});
