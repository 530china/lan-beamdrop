const fs = require('fs');
const path = require('path');
const { getSettings, updateSettings } = require('../../utils/settings');
const config = require('../../config');

const settingsPath = path.join(__dirname, '../../settings.json');

describe('Settings persistence', () => {
  beforeEach(() => {
    // Clean up before each test
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
    }
    // Reset config overrides
    config.shareDir = path.join(require('os').homedir(), 'LANBeamDrop');
  });

  afterAll(() => {
    // Clean up after all tests
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
    }
  });

  it('should return default config if settings.json does not exist', () => {
    const settings = getSettings();
    expect(settings.shareDir).toBe(config.shareDir);
  });

  it('should update shareDir and save to settings.json', () => {
    const newDir = path.join(__dirname, 'test_dir');
    updateSettings({ shareDir: newDir });
    
    // Check in-memory config update
    expect(config.shareDir).toBe(newDir);
    
    // Check file update
    const fileContent = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    expect(fileContent.shareDir).toBe(newDir);
    
    // Check if subsequent getSettings reads it correctly
    const settings = getSettings();
    expect(settings.shareDir).toBe(newDir);
  });

  it('should create the directory if it does not exist', () => {
    const newDir = path.join(__dirname, 'non_existent_test_dir');
    if (fs.existsSync(newDir)) fs.rmdirSync(newDir);
    
    updateSettings({ shareDir: newDir });
    expect(fs.existsSync(newDir)).toBe(true);
    
    // Clean up created dir
    fs.rmdirSync(newDir);
  });
});
