# Exact n8n Node Configuration to Fix Empty Response

## Problem
Your workflow returns HTTP 200 but with an empty body. This happens when the webhook response node is not properly configured.

## Solution: Add/Configure "Respond to Webhook" Node

### Step 1: Check Your Current Workflow Structure

Your workflow should look something like:
```
[Webhook] → [Your Processing Nodes] → [??? Missing Response Node ???]
```

### Step 2: Add "Respond to Webhook" Node

1. **Click the "+" button** at the end of your workflow
2. **Search for**: "Respond to Webhook"
3. **Add the node** and connect it to your last processing node

### Step 3: Configure "Respond to Webhook" Node

Open the "Respond to Webhook" node and configure it as follows:

#### Basic Settings:
- **Response Code**: `200`
- **Response Headers**: Leave default (or add if needed)
- **Response Body**: Select **"JSON"**
- **Response Data**: Use one of the options below

#### Option 1: Simple Static Response (For Testing)
In the **Response Data** field, enter:
```json
{
  "response": "Hello! I received: {{ $('Webhook').first().json.body.message }}"
}
```

#### Option 2: Dynamic Response from Previous Node
If your processing node outputs data, use:
```json
{
  "response": "{{ $json.response || $json.output || $json.text || $json.message || 'No response generated' }}"
}
```

#### Option 3: Reference Specific Node Output
If you know which node has your data:
```json
{
  "response": "{{ $('YourNodeName').first().json.yourField }}"
}
```

### Step 4: Configure Webhook Node (If Not Already Set)

Your **Webhook** node (first node) should have:
- **HTTP Method**: `POST`
- **Path**: `from-vscode` (this matches your URL: `/webhook/from-vscode`)
- **Response Mode**: **"When Last Node Finishes"** (IMPORTANT!)
  - OR use **"Using 'Respond to Webhook' Node"** if you added the Respond node

### Step 5: Example Workflow Configurations

#### Minimal Working Example:
```
┌─────────────┐     ┌──────────┐     ┌─────────────────────┐
│   Webhook   │────▶│   Set    │────▶│ Respond to Webhook  │
└─────────────┘     └──────────┘     └─────────────────────┘
```

**Set Node Configuration:**
- Add field: `response`
- Value: `{{ $json.body.message }}`

**Respond to Webhook Node:**
- Response Code: `200`
- Response Body: `JSON`
- Response Data: `{{ $json }}`

#### With AI/Processing:
```
┌─────────────┐     ┌──────────┐     ┌─────────────┐     ┌─────────────────────┐
│   Webhook   │────▶│   Set    │────▶│  OpenAI/    │────▶│ Respond to Webhook  │
│             │     │          │     │  Processing │     │                     │
└─────────────┘     └──────────┘     └─────────────┘     └─────────────────────┘
```

**Set Node** (to extract message):
- Field: `message`
- Value: `{{ $json.body.message }}`

**OpenAI/Processing Node** (example):
- Use the message from Set node
- Output will be in `$json.choices[0].message.content` or similar

**Respond to Webhook Node:**
- Response Data:
```json
{
  "response": "{{ $json.choices[0].message.content || $json.content || $json.text || $json.message }}"
}
```

## Common Issues and Fixes

### Issue 1: "Response Mode" Not Set Correctly
**Symptom**: Empty response even with Respond to Webhook node
**Fix**: In Webhook node, set Response Mode to "When Last Node Finishes" or "Using 'Respond to Webhook' Node"

### Issue 2: Data Not Available in Response Node
**Symptom**: Response node shows empty `$json`
**Fix**: 
- Check execution logs: Click on previous nodes to see their output
- Use full node reference: `{{ $('NodeName').first().json.field }}`
- Add a "Set" node before Respond to Webhook to structure the data

### Issue 3: Wrong Data Path
**Symptom**: Response contains `{}` or wrong data
**Fix**: 
- Webhook data is in `$json.body.message` (not `$json.message`)
- Use `{{ $('Webhook').first().json.body.message }}` to access webhook input
- Use `{{ $json }}` to see all available data in the Respond node

## Testing Your Fix

1. **Save** the workflow
2. **Activate** the workflow (toggle switch)
3. **Run test**: `node test-n8n-webhook.js`
4. You should see a response like:
   ```json
   {
     "response": "Your actual response here"
   }
   ```

## Quick Reference: Data Access Patterns

In n8n expressions, use:
- `{{ $json }}` - Current node's output
- `{{ $('NodeName').first().json }}` - Specific node's output
- `{{ $json.body.message }}` - Access nested fields
- `{{ $json.field || 'fallback' }}` - Use fallback if field missing

## Verification Checklist

- [ ] Webhook node has Response Mode set correctly
- [ ] Respond to Webhook node is the last node
- [ ] Respond to Webhook has Response Code = 200
- [ ] Respond to Webhook has Response Body = JSON
- [ ] Response Data contains `{ "response": "..." }`
- [ ] Workflow is saved and activated
- [ ] Test script shows non-empty response
