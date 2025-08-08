/**
 * Factory for creating Telegram client strategies
 * Handles strategy selection and creation based on configuration
 */
const BotStrategy = require('./BotStrategy');
const UserbotStrategy = require('./UserbotStrategy');

class StrategyFactory {
  /**
   * Create appropriate strategy based on mode
   * @param {string} mode - Strategy mode ('bot' or 'userbot')
   * @param {Object} config - Configuration object
   * @returns {TelegramClientStrategy} Strategy instance
   * @throws {Error} If mode is invalid
   */
  static createStrategy(mode, config) {
    console.log(`[StrategyFactory] Creating strategy for mode: ${mode}`);
    
    switch (mode) {
      case 'bot':
        return new BotStrategy(config);
        
      case 'userbot':
        return new UserbotStrategy(config);
        
      default:
        throw new Error(`Unknown strategy mode: ${mode}. Supported modes: 'bot', 'nodebot', 'userbot'`);
    }
  }

  /**
   * Get list of supported strategy modes
   * @returns {Array<string>} Array of supported mode names
   */
  static getSupportedModes() {
    return ['bot', 'userbot'];
  }

  /**
   * Validate if mode is supported
   * @param {string} mode - Mode to validate
   * @returns {boolean} True if mode is supported
   */
  static isModeSupported(mode) {
    return this.getSupportedModes().includes(mode);
  }

  /**
   * Get strategy information
   * @param {string} mode - Strategy mode
   * @returns {Object} Strategy information
   */
  static getStrategyInfo(mode) {
    const strategyInfoMap = {
      'bot': {
        name: 'Bot Strategy (GramJS)',
        description: 'Regular Telegram bots using GramJS library',
        requirements: ['botToken', 'apiId', 'apiHash'],
        capabilities: {
          sendMessages: true,
          sendFiles: true,
          readMessages: 'limited',
          accessChannels: 'limited',
          customEmojis: false,
          directMessages: false
        },
        limitations: [
          'Cannot initiate conversations with users',
          'Limited access to chat history',
          'Must be added to groups/channels to send messages',
          'No custom emoji support',
          'Inline buttons may not work properly'
        ]
      },
      'userbot': {
        name: 'Userbot Strategy',
        description: 'Personal Telegram account using session string',
        requirements: ['stringSession', 'apiId', 'apiHash'],
        capabilities: {
          sendMessages: true,
          sendFiles: true,
          readMessages: 'full',
          accessChannels: 'full',
          customEmojis: true,
          directMessages: true
        },
        limitations: [
          'Uses personal account (rate limits apply)',
          'Must comply with Telegram ToS',
          'Account can be banned if misused'
        ]
      }
    };

    return strategyInfoMap[mode] || null;
  }

  /**
   * Create strategy with validation
   * @param {string} mode - Strategy mode
   * @param {Object} config - Configuration object
   * @returns {TelegramClientStrategy} Validated strategy instance
   * @throws {Error} If configuration is invalid
   */
  static createValidatedStrategy(mode, config) {
    if (!this.isModeSupported(mode)) {
      throw new Error(`Unsupported strategy mode: ${mode}. Supported modes: ${this.getSupportedModes().join(', ')}`);
    }

    const strategy = this.createStrategy(mode, config);
    
    try {
      strategy.validateConfig();
      console.log(`[StrategyFactory] Strategy validation passed for mode: ${mode}`);
      return strategy;
    } catch (error) {
      console.error(`[StrategyFactory] Strategy validation failed for mode: ${mode}`, error);
      throw new Error(`Configuration validation failed for ${mode} mode: ${error.message}`);
    }
  }

  /**
   * Get required configuration fields for a mode
   * @param {string} mode - Strategy mode
   * @returns {Array<string>} Required configuration fields
   */
  static getRequiredConfig(mode) {
    const info = this.getStrategyInfo(mode);
    return info ? info.requirements : [];
  }

  /**
   * Validate configuration completeness
   * @param {string} mode - Strategy mode
   * @param {Object} config - Configuration object
   * @returns {Object} Validation result
   */
  static validateConfigCompleteness(mode, config) {
    const required = this.getRequiredConfig(mode);
    const missing = required.filter(field => !config[field]);
    
    return {
      isValid: missing.length === 0,
      missing,
      required,
      provided: Object.keys(config).filter(key => config[key])
    };
  }
}

module.exports = StrategyFactory;