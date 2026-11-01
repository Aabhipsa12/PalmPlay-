import { spawn, ChildProcess } from 'child_process';
import http from 'http';

function request(options: http.RequestOptions, body?: any): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode || 0, data: raw });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  console.log('=== PALMPLAY REST INTEGRATION AUDIT TEST ===');
  
  // 1. Health check
  const health = await request({ host: 'localhost', port: 5050, path: '/api/health', method: 'GET' });
  console.log('1. GET /api/health:', health.status, JSON.stringify(health.data));

  // 2. POST /api/palmplay/sessions (create session)
  const createRes = await request(
    { host: 'localhost', port: 5050, path: '/api/palmplay/sessions', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { call_id: 'call-audit-100' }
  );
  console.log('2. POST /api/palmplay/sessions (Valid):', createRes.status, JSON.stringify(createRes.data));

  // 3. POST /api/palmplay/sessions (empty call_id)
  const invalidSessionRes = await request(
    { host: 'localhost', port: 5050, path: '/api/palmplay/sessions', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { call_id: '' }
  );
  console.log('3. POST /api/palmplay/sessions (Invalid Empty ID):', invalidSessionRes.status, JSON.stringify(invalidSessionRes.data));

  // 4. GET /api/palmplay/sessions/:call_id/state (existing session)
  const stateRes = await request({ host: 'localhost', port: 5050, path: '/api/palmplay/sessions/call-audit-100/state', method: 'GET' });
  console.log('4. GET /api/palmplay/sessions/call-audit-100/state:', stateRes.status, JSON.stringify(stateRes.data));

  // 5. GET /api/palmplay/sessions/:call_id/state (nonexistent session)
  const missingStateRes = await request({ host: 'localhost', port: 5050, path: '/api/palmplay/sessions/nonexistent-call-999/state', method: 'GET' });
  console.log('5. GET /api/palmplay/sessions/nonexistent-call-999/state (404 test):', missingStateRes.status, JSON.stringify(missingStateRes.data));

  // 6. POST /api/palmplay/sessions/:call_id/launch (invalid player)
  const badPlayerLaunch = await request(
    { host: 'localhost', port: 5050, path: '/api/palmplay/sessions/call-audit-100/launch', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { player: 'invalid_hacker' }
  );
  console.log('6. POST /api/palmplay/sessions/.../launch (Invalid Player):', badPlayerLaunch.status, JSON.stringify(badPlayerLaunch.data));

  // 7. POST /api/palmplay/sessions/:call_id/launch (valid launch)
  const validLaunch = await request(
    { host: 'localhost', port: 5050, path: '/api/palmplay/sessions/call-audit-100/launch', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { player: 'player1', start_y: 0.50 }
  );
  console.log('7. POST /api/palmplay/sessions/.../launch (Valid Launch):', validLaunch.status, JSON.stringify(validLaunch.data));

  // 8. POST /api/palmplay/sessions/:call_id/launch (duplicate launch while ball is in flight -> 409)
  const duplicateLaunch = await request(
    { host: 'localhost', port: 5050, path: '/api/palmplay/sessions/call-audit-100/launch', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { player: 'player1', start_y: 0.50 }
  );
  console.log('8. POST /api/palmplay/sessions/.../launch (Duplicate Launch Conflict 409):', duplicateLaunch.status, JSON.stringify(duplicateLaunch.data));

  // 9. POST /api/palmplay/sessions/:call_id/hit (out of range fingertip -> 400)
  const outOfRangeHit = await request(
    { host: 'localhost', port: 5050, path: '/api/palmplay/sessions/call-audit-100/hit', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { player: 'player2', tip_x: 0.99, tip_y: 0.01 }
  );
  console.log('9. POST /api/palmplay/sessions/.../hit (Out of Range):', outOfRangeHit.status, JSON.stringify(outOfRangeHit.data));

  // 10. POST /api/palmplay/sessions/:call_id/hit (valid in-range fingertip bat -> 200)
  // Ball is at x: 0.20, y: 0.50
  const validHit = await request(
    { host: 'localhost', port: 5050, path: '/api/palmplay/sessions/call-audit-100/hit', method: 'POST', headers: { 'Content-Type': 'application/json' } },
    { player: 'player2', tip_x: 0.22, tip_y: 0.50 }
  );
  console.log('10. POST /api/palmplay/sessions/.../hit (Valid In-Range Hit):', validHit.status, JSON.stringify(validHit.data));

  // 11. State check after hit
  const postHitState = await request({ host: 'localhost', port: 5050, path: '/api/palmplay/sessions/call-audit-100/state', method: 'GET' });
  console.log('11. GET /api/palmplay/sessions/call-audit-100/state (Post Hit):', postHitState.status, JSON.stringify(postHitState.data));

  console.log('=== REST AUDIT COMPLETE ===');
}

run().catch((err) => {
  console.error('Error during REST audit test:', err);
  process.exit(1);
});
