// Test script for n8n webhook
// Run with: node test-n8n-webhook.js

const WEBHOOK_URL = 'https://mamoun21.app.n8n.cloud/webhook-test/from-vscode';

async function testWebhook() {
  console.log('🧪 Testing n8n webhook...\n');
  console.log(`URL: ${WEBHOOK_URL}\n`);

  const testData = {
    message: 'Hello, this is a test message',
    sessionId: 'test-session-123',
    agentId: 'research-analyst'
  };

  console.log('📤 Sending request:');
  console.log(JSON.stringify(testData, null, 2));
  console.log('');

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    console.log(`📥 Response Status: ${response.status} ${response.statusText}`);
    console.log(`📥 Content-Type: ${response.headers.get('content-type')}`);
    console.log(`📥 Content-Length: ${response.headers.get('content-length') || 'Not specified'}`);
    console.log('');

    const responseText = await response.text();
    console.log('📥 Response Body:');
    
    if (!responseText || responseText.trim() === '') {
      console.log('❌ EMPTY RESPONSE - This is the problem!');
      console.log('');
      console.log('🔧 Fix needed:');
      console.log('   1. Open your n8n workflow');
      console.log('   2. Add a "Respond to Webhook" node at the end');
      console.log('   3. Set Response Data to: { "response": "Your message here" }');
      console.log('   4. See N8N_WORKFLOW_FIX.md for detailed instructions');
    } else {
      console.log(responseText);
      console.log('');

      // Try to parse as JSON
      try {
        const json = JSON.parse(responseText);
        console.log('✅ Valid JSON response:');
        console.log(JSON.stringify(json, null, 2));
        console.log('');

        // Check for expected fields
        const hasResponse = json.response || json.output || json.text || json.message || json.content || json.answer;
        if (hasResponse) {
          console.log('✅ Response contains expected field!');
          console.log(`   Found: ${Object.keys(json).find(k => ['response', 'output', 'text', 'message', 'content', 'answer'].includes(k))}`);
        } else {
          console.log('⚠️  Response JSON does not contain expected fields (response, output, text, message, content, or answer)');
          console.log('   Available fields:', Object.keys(json).join(', '));
        }
      } catch (e) {
        console.log('⚠️  Response is not valid JSON (but it\'s not empty, which is good)');
      }
    }

    if (!response.ok) {
      console.log(`\n❌ Error: HTTP ${response.status}`);
    }

  } catch (error) {
    console.error('❌ Request failed:', error.message);
    if (error.cause) {
      console.error('   Cause:', error.cause);
    }
  }
}

testWebhook();
