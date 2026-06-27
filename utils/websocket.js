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
 * @param {string} action - Event action (e.g., 'FILE_ADDED')
 * @param {any} data - Optional payload data
 */
function broadcastUpdate(action = 'UPDATE', data = null) {
  if (!wss) return;
  
  const message = JSON.stringify({ action, data });
  let count = 0;
  
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(message);
        count++;
      } catch (err) {
        console.warn('[WebSocket] 广播推送至个别设备失败:', err.message);
      }
    }
  });
  
  if (count > 0) {
    // console.log(`[WebSocket] Broadcasted ${type} to ${count} client(s)`);
  }
}

/**
 * Returns the underlying WebSocket Server instance (for testing/diagnostics)
 */
function getWss() {
  return wss;
}

module.exports = {
  initWebSocketServer,
  broadcastUpdate,
  getWss
};
