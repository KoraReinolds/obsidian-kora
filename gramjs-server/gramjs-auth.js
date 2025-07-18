#!/usr/bin/env node

/**
 * GramJS Authentication Script
 * Run this script once to generate a session string for your userbot
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');

// Your API credentials (same as in gramjs-server.js)
const API_ID = 27782052;
const API_HASH = '68a4d2fd1466ab6faccfb81bd4b68255';

// Create readline interface for input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to get user input
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function authenticate() {
  console.log('🚀 GramJS Authentication Setup');
  console.log('===============================');
  
  // Start with empty session
  const stringSession = new StringSession('');
  
  const client = new TelegramClient(stringSession, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  try {
    console.log('📱 Starting authentication process...');
    
    await client.start({
      phoneNumber: async () => {
        const phone = await askQuestion('📞 Enter your phone number (with country code, e.g., +1234567890): ');
        return phone;
      },
      password: async () => {
        const password = await askQuestion('🔒 Enter your 2FA password (if enabled): ');
        return password;
      },
      phoneCode: async () => {
        const code = await askQuestion('📨 Enter the verification code sent to your phone: ');
        return code;
      },
      onError: (err) => {
        console.error('❌ Authentication error:', err);
      },
    });

    console.log('✅ Authentication successful!');
    
    // Get user info
    const me = await client.getMe();
    console.log(`👤 Logged in as: ${me.firstName} ${me.lastName || ''} (@${me.username || 'N/A'})`);
    
    // Get and display session string
    const sessionString = client.session.save();
    console.log('\n🔑 Your Session String:');
    console.log('='.repeat(50));
    console.log(sessionString);
    console.log('='.repeat(50));
    
    console.log('\n📝 Next steps:');
    console.log('1. Copy the session string above');
    console.log('2. Update gramjs-server.js CONFIG.stringSession with this value');
    console.log('3. Or set environment variable: TELEGRAM_SESSION="your_session_string"');
    console.log('4. Run: npm run gramjs-server');
    
    await client.disconnect();
    
  } catch (error) {
    console.error('❌ Authentication failed:', error);
    
    if (error.message.includes('PHONE_CODE_INVALID')) {
      console.log('💡 Tip: Make sure to enter the verification code correctly');
    } else if (error.message.includes('PHONE_NUMBER_INVALID')) {
      console.log('💡 Tip: Make sure to include country code (e.g., +1234567890)');
    } else if (error.message.includes('PASSWORD_HASH_INVALID')) {
      console.log('💡 Tip: Check your 2FA password');
    }
    
  } finally {
    rl.close();
  }
}

// Run authentication
authenticate().catch(console.error);