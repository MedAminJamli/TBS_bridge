# AI Agent Hub

AI Agent Hub — Chat with 4 AI agents powered by n8n workflows.

## 🚀 Quick Start

### 1. Install Dependencies

If you haven't already installed the dependencies:

```bash
npm install
```

### 2. Configure Environment Variables (Optional)

Create a `.env` file in the root directory to configure n8n webhook URLs:

```env
PORT=3000
N8N_WEBHOOK_AGENT_1=https://your-n8n-instance.com/webhook/research-analyst
N8N_WEBHOOK_AGENT_2=https://your-n8n-instance.com/webhook/code-assistant
N8N_WEBHOOK_AGENT_3=https://your-n8n-instance.com/webhook/creative-writer
N8N_WEBHOOK_AGENT_4=https://your-n8n-instance.com/webhook/data-analyst
```

**Note:** If you don't configure the webhook URLs, the app will run in "fallback mode" with demo responses, so you can test the UI without n8n.

### 3. Run the Server

**Production mode:**
```bash
npm start
```

**Development mode (with auto-reload):**
```bash
npm run dev
```

### 4. Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

## 📋 Available Scripts

- `npm start` - Start the server in production mode
- `npm run dev` - Start the server in development mode with auto-reload

## 🧪 Testing the n8n Webhook

To test your n8n webhook configuration:

```bash
node test-n8n-webhook.js
```

This will send a test request to your n8n webhook and show you the response.

## 🏗️ Project Structure

```
Eduployment/
├── server.js              # Express server and API endpoints
├── package.json           # Dependencies and scripts
├── test-n8n-webhook.js    # Webhook testing script
├── public/                # Frontend files
│   ├── index.html         # Main landing page
│   ├── chat.html          # Chat interface
│   ├── css/
│   │   └── styles.css     # Styling
│   └── js/
│       ├── app.js          # Main app logic
│       └── chat.js         # Chat functionality
└── .env                   # Environment variables (create this)
```

## 🤖 Available Agents

1. **Research Analyst** - Deep-dive into topics, papers, and data
2. **Code Assistant** - Write, debug, and explain code
3. **Creative Writer** - Craft stories, marketing copy, and content
4. **Data Analyst** - Analyze datasets and generate insights

## 🔧 Troubleshooting

### Server won't start
- Make sure port 3000 (or your configured PORT) is not already in use
- Check that Node.js is installed: `node --version` (requires Node.js 18+)

### Webhook not working
- Run `node test-n8n-webhook.js` to test your webhook
- Check that your n8n workflow has a "Respond to Webhook" node properly connected
- Verify the webhook URL in your `.env` file is correct

### Dependencies missing
- Run `npm install` to install all required packages

## 📝 Notes

- The app runs on port 3000 by default (configurable via PORT environment variable)
- If webhook URLs are not configured, the app will show demo responses
- The frontend is a single-page application served as static files
