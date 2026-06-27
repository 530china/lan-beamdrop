const http = require('http');
const WebSocket = require('ws');
const { initWebSocketServer, broadcastUpdate, getWss } = require('../../utils/websocket');

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

  test('should isolate client.send errors and continue broadcasting to other clients', (done) => {
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}`);
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}`);
    let openCount = 0;

    const cleanup = () => {
      if (ws1.readyState === WebSocket.OPEN) ws1.close();
      if (ws2.readyState === WebSocket.OPEN) ws2.close();
    };

    const onOpen = () => {
      openCount++;
      if (openCount === 2) {
        const wss = getWss();
        expect(wss).toBeDefined();
        const clientsArray = Array.from(wss.clients);
        const activeClients = clientsArray.filter(c => c.readyState === 1);
        expect(activeClients.length).toBeGreaterThanOrEqual(2);

        // Stub the first active client to throw an error on send
        const badClient = activeClients[0];
        badClient.send = jest.fn().mockImplementation(() => {
          throw new Error('Socket send error');
        });

        let ws1Received = false;
        let ws2Received = false;

        ws1.on('message', () => {
          ws1Received = true;
          checkCompletion();
        });

        ws2.on('message', () => {
          ws2Received = true;
          checkCompletion();
        });

        const checkCompletion = () => {
          setTimeout(() => {
            try {
              expect(ws1Received || ws2Received).toBe(true);
              expect(badClient.send).toHaveBeenCalled();
              cleanup();
              done();
            } catch (err) {
              cleanup();
              done(err);
            }
          }, 50);
        };

        expect(() => {
          broadcastUpdate('TEST_FAULT_TOLERANCE', { ok: true });
        }).not.toThrow();
      }
    };

    ws1.on('open', onOpen);
    ws2.on('open', onOpen);
  });
});
