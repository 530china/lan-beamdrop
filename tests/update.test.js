const { isNewer } = require('../utils/update');

describe('Update Version Checking', () => {
  describe('isNewer(latest, current)', () => {
    test('should return true when latest patch version is higher', () => {
      expect(isNewer('0.1.4', '0.1.3')).toBe(true);
      expect(isNewer('v0.1.4', '0.1.3')).toBe(true); // handles 'v' prefix
      expect(isNewer('0.1.10', '0.1.9')).toBe(true);
    });

    test('should return true when latest minor version is higher', () => {
      expect(isNewer('0.2.0', '0.1.9')).toBe(true);
      expect(isNewer('1.0.0', '0.9.9')).toBe(true);
    });

    test('should return false when latest version is older or equal', () => {
      expect(isNewer('0.1.3', '0.1.3')).toBe(false);
      expect(isNewer('0.1.2', '0.1.3')).toBe(false);
      expect(isNewer('v0.1.2', '0.1.3')).toBe(false);
      expect(isNewer('1.0.0', '1.0.1')).toBe(false);
    });

    test('should handle missing or invalid inputs gracefully', () => {
      expect(isNewer(null, '0.1.3')).toBe(false);
      expect(isNewer('0.1.4', null)).toBe(false);
      expect(isNewer('', '0.1.3')).toBe(false);
    });
  });

  describe('checkUpdate() Network Handling', () => {
    const { checkUpdate } = require('../utils/update');
    const https = require('https');
    let requestSpy;

    beforeEach(() => {
      // Clear module cache to reset internal cachedUpdate state in update.js
      jest.resetModules();
      requestSpy = jest.spyOn(https, 'request');
    });

    afterEach(() => {
      requestSpy.mockRestore();
    });

    test('should resolve { hasUpdate: false } and cache it on network error', async () => {
      const { checkUpdate } = require('../utils/update');
      
      // Mock https.request to simulate an immediate network error
      requestSpy.mockImplementation((options, callback) => {
        const req = {
          on: jest.fn((event, handler) => {
            if (event === 'error') {
              setTimeout(() => handler(new Error('Network error simulated')), 10);
            }
          }),
          setTimeout: jest.fn(),
          abort: jest.fn(),
          end: jest.fn()
        };
        return req;
      });

      // First call triggers network error
      const result1 = await checkUpdate();
      expect(result1).toEqual({ hasUpdate: false });
      expect(requestSpy).toHaveBeenCalledTimes(1);

      // Second call should return cached { hasUpdate: false } without network request
      const result2 = await checkUpdate();
      expect(result2).toEqual({ hasUpdate: false });
      expect(requestSpy).toHaveBeenCalledTimes(1); // Call count remains 1!
    });
  });
});
