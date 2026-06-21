const http = require('http');
const WebSocket = require('ws');
const { initWebSocketServer, broadcastUpdate } = require('../../utils/websocket');

describe('WebSocket Engine', () => {
  let server;
  let port;
  let client;

  beforeAll((done) => {
    // Create a dummy HTTP server
    server = http.createServer((req, res) => {
      res.writeHead(200);
      res.end('ok');
    });

    // Initialize WebSocket server on it
    initWebSocketServer(server);

    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    if (client && client.readyState === WebSocket.OPEN) {
      client.close();
    }
    server.close(done);
  });

  afterEach(() => {
    if (client && client.readyState === WebSocket.OPEN) {
      client.close();
    }
  });

  test('should broadcast message to connected clients', (done) => {
    const wsClient = new WebSocket(`ws://127.0.0.1:${port}`);
    client = wsClient; // track for cleanup

    wsClient.on('open', () => {
      broadcastUpdate('TEST_EVENT', { hello: 'world' });
    });

    wsClient.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.action === 'TEST_EVENT') {
        expect(msg.data).toEqual({ hello: 'world' });
        done();
      }
    });
  });

  test('should safely handle broadcast when no clients are connected', () => {
    // Ensuring this doesn't throw an error when wss.clients is empty
    expect(() => {
      broadcastUpdate('SILENT_EVENT');
    }).not.toThrow();
  });
});
