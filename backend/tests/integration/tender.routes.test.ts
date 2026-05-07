import request from 'supertest';
import { createApp } from '../../src/server';

describe('tender routes', () => {
  it('exposes health endpoint', async () => {
    const app = createApp();
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });
});
