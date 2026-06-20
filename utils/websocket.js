const { WebSocketServer } = require('ws');

let wss = null;

/**
 * Initializes the WebSocket server attached to the existing HTTP server
 * @param {import('http').Server} server 
 */
function initWebSocketServer(server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    // console.log('[WebSocket] Client connected');

    ws.on('error', (err) => {
      console.error('[WebSocket] Error:', err);
    });

    // ws.on('close', () => {
    //   console.log('[WebSocket] Client disconnected');
    // });
  });

  console.log('[WebSocket] Server initialized');
}

/**
 * Broadcasts an event to all connected WebSocket clients.
 * This triggers the frontend to fetch the latest data instantly.
 * @param {string} type - Event type (e.g., 'UPDATE')
 * @param {any} payload - Optional payload data
 */
function broadcastUpdate(type = 'UPDATE', payload = null) {
  if (!wss) return;
  
  const message = JSON.stringify({ type, payload });
  let count = 0;
  
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
      count++;
    }
  });
  
  if (count > 0) {
    // console.log(`[WebSocket] Broadcasted ${type} to ${count} client(s)`);
  }
}

module.exports = {
  initWebSocketServer,
  broadcastUpdate
};
