const authMiddleware = require('../../middleware/auth');
const config = require('../../config');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      path: '/',
      query: {},
      cookies: {},
      originalUrl: '/',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn(),
      redirect: jest.fn(),
      cookie: jest.fn(),
    };
    next = jest.fn();

    // Reset config and globals
    config.accessPassword = '';
    global.ACCESS_TOKEN = null;
    global.CURRENT_PIN = null;
  });

  it('should pass if accessPassword is empty (bare mode)', () => {
    config.accessPassword = '';
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should pass exempt paths even with password set', () => {
    config.accessPassword = '1234';
    req.path = '/login.html';
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should redirect to clean url and set cookie if correct token in query', () => {
    config.accessPassword = '1234';
    global.ACCESS_TOKEN = 'secret-token';
    req.query.token = 'secret-token';
    req.originalUrl = '/?token=secret-token';

    authMiddleware(req, res, next);

    expect(res.cookie).toHaveBeenCalledWith('beamdrop_auth', 'secret-token', expect.any(Object));
    expect(res.redirect).toHaveBeenCalledWith('/');
    expect(next).not.toHaveBeenCalled();
  });

  it('should pass if valid cookie is present', () => {
    config.accessPassword = '1234';
    global.ACCESS_TOKEN = 'secret-token';
    req.cookies.beamdrop_auth = 'secret-token';

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should redirect to /login.html for unauthorized access to root', () => {
    config.accessPassword = '1234';
    global.ACCESS_TOKEN = 'secret-token';
    req.path = '/';

    authMiddleware(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith('/login.html');
  });

  it('should return 401 JSON for unauthorized access to /api/*', () => {
    config.accessPassword = '1234';
    global.ACCESS_TOKEN = 'secret-token';
    req.path = '/api/files';

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Unauthorized', redirect: '/login.html' });
  });

  it('should return 401 text for unauthorized access to other static files', () => {
    config.accessPassword = '1234';
    global.ACCESS_TOKEN = 'secret-token';
    req.path = '/app.js';

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
  });
});
