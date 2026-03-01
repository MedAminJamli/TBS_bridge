require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { createWorker } = require('tesseract.js');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Multer Configuration ────────────────────────────────────
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// ── Middleware ──────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Session Memory Management ───────────────────────────────
// Store conversation history and user profile per session
const SESSION_STORE = {};
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

class StudentProfile {
  constructor() {
    this.name = null;
    this.gpa = null;
    this.interests = [];
    this.favoriteSubjects = [];
    this.major = null;
    this.minor = null;
    this.year = null;
    this.courses = [];
    this.grades = {};
    this.lastUpdate = Date.now();
  }

  update(extractedInfo) {
    if (extractedInfo.name) this.name = extractedInfo.name;
    if (extractedInfo.gpa) this.gpa = extractedInfo.gpa;
    if (extractedInfo.interests) this.interests = [...new Set([...this.interests, ...extractedInfo.interests])];
    if (extractedInfo.favoriteSubjects) this.favoriteSubjects = [...new Set([...this.favoriteSubjects, ...extractedInfo.favoriteSubjects])];
    if (extractedInfo.major) this.major = extractedInfo.major;
    if (extractedInfo.minor) this.minor = extractedInfo.minor;
    if (extractedInfo.year) this.year = extractedInfo.year;
    if (extractedInfo.courses) this.courses = extractedInfo.courses;
    if (extractedInfo.grades) this.grades = { ...this.grades, ...extractedInfo.grades };
    this.lastUpdate = Date.now();
  }

  getSummary() {
    return {
      name: this.name,
      gpa: this.gpa,
      interests: this.interests,
      favoriteSubjects: this.favoriteSubjects,
      major: this.major,
      minor: this.minor,
      year: this.year,
      courses: this.courses
    };
  }
}

class ConversationSession {
  constructor(sessionId, agentId) {
    this.sessionId = sessionId;
    this.agentId = agentId;
    this.messages = [];
    this.studentProfile = new StudentProfile();
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
  }

  addMessage(role, content) {
    this.messages.push({
      role, // 'user' or 'assistant'
      content,
      timestamp: Date.now()
    });
    this.lastActivity = Date.now();
  }

  getConversationContext(maxMessages = 5) {
    // Return last N messages for context
    return this.messages.slice(-maxMessages).map(m => `${m.role}: ${m.content}`).join('\n');
  }

  getFullHistory() {
    return this.messages;
  }

  isExpired() {
    return Date.now() - this.lastActivity > SESSION_TIMEOUT;
  }
}

// Initialize or retrieve session
function getOrCreateSession(sessionId, agentId) {
  if (!SESSION_STORE[sessionId]) {
    SESSION_STORE[sessionId] = new ConversationSession(sessionId, agentId);
  }
  return SESSION_STORE[sessionId];
}

// Clean up expired sessions periodically
setInterval(() => {
  for (const [sessionId, session] of Object.entries(SESSION_STORE)) {
    if (session.isExpired()) {
      delete SESSION_STORE[sessionId];
      console.log(`🗑️ Cleaned up expired session: ${sessionId}`);
    }
  }
}, 60 * 60 * 1000); // Every hour

// Extract student info from user messages
function extractStudentInfo(userMessage) {
  const info = {
    name: null,
    gpa: null,
    interests: [],
    favoriteSubjects: [],
    major: null,
    minor: null,
    year: null,
    courses: [],
    grades: {}
  };

  const lowerMsg = userMessage.toLowerCase();

  // Keywords to avoid capturing as names (emotional/state words)
  const notNames = ['tired', 'stressed', 'overwhelmed', 'happy', 'sad', 'anxious', 'excited', 'confused', 'lost', 'stuck', 'burnout', 'exhausted', 'burnt', 'out', 'good', 'bad', 'ok', 'fine', 'okay'];

  // Name extraction
  const namePatterns = /my name is ([\w\s]+)|i'm ([\w\s]+)|i am ([\w\s]+)|call me ([\w\s]+)/i;
  const nameMatch = userMessage.match(namePatterns);
  if (nameMatch) {
    let extractedName = (nameMatch[1] || nameMatch[2] || nameMatch[3] || nameMatch[4]).trim();
    const lowerName = extractedName.toLowerCase();
    // Only accept if it doesn't contain any of the forbidden tokens
    // and isn't obviously a full sentence or phrase about feeling/ stress.
    const containsBad = notNames.some(tok => lowerName.includes(tok));
    // reject overly long strings (>3 words) or if bad token found
    if (!containsBad && extractedName.split(/\s+/).length <= 3) {
      info.name = extractedName;
    }
  }

  // GPA extraction
  const gpaPattern = /gpa[:\s]*([0-9.]+)|my grade is ([0-9.]+)|cumulative gpa[:\s]*([0-9.]+)/i;
  const gpaMatch = userMessage.match(gpaPattern);
  if (gpaMatch) {
    info.gpa = parseFloat(gpaMatch[1] || gpaMatch[2] || gpaMatch[3]);
  }

  // Year/Level extraction
  if (lowerMsg.includes('freshman') || lowerMsg.includes('first year')) info.year = 'freshman';
  else if (lowerMsg.includes('sophomore') || lowerMsg.includes('second year')) info.year = 'sophomore';
  else if (lowerMsg.includes('junior') || lowerMsg.includes('third year')) info.year = 'junior';
  else if (lowerMsg.includes('senior') || lowerMsg.includes('fourth year')) info.year = 'senior';

  // Major extraction
  const majors = ['accounting', 'finance', 'business analytics', 'information technology', 'it', 'marketing'];
  for (const major of majors) {
    if (lowerMsg.includes(major)) {
      info.major = major;
      break;
    }
  }

  // Interest/Subject extraction
  const subjects = [
    'coding', 'programming', 'python', 'javascript', 'web development',
    'data analysis', 'analytics', 'data', 'statistics', 'numbers',
    'finance', 'money', 'investments', 'accounting', 'audit',
    'marketing', 'branding', 'sales', 'digital marketing', 'social media',
    'business', 'management', 'leadership', 'strategy',
    'cybersecurity', 'security', 'networks', 'systems'
  ];

  for (const subject of subjects) {
    if (lowerMsg.includes(subject)) {
      info.interests.push(subject);
    }
  }

  // Grade extraction (e.g., "got A in accounting", "B+ in finance")
  const gradePattern = /(?:got|received|have|got|score[d]*)\s+([A-F][+-]?)\s+(?:in|for)?\s*(\w+)/gi;
  let gradeMatch;
  while ((gradeMatch = gradePattern.exec(userMessage)) !== null) {
    const grade = gradeMatch[1];
    const course = gradeMatch[2];
    info.grades[course] = grade;
  }

  return info;
}

// ── Agent Configuration ────────────────────────────────────
const AGENTS = {
  'research-analyst': {
    name: 'Academic Support',
    webhookEnv: 'N8N_WEBHOOK_AGENT_1',
  },
  'code-assistant': {
    name: 'Emotional Support',
    webhookEnv: 'N8N_WEBHOOK_AGENT_2',
  },
  'creative-writer': {
    name: 'CV Analyzer',
    webhookEnv: 'N8N_WEBHOOK_AGENT_3',
  },
  'data-analyst': {
    name: 'Career Advisor',
    webhookEnv: 'N8N_WEBHOOK_AGENT_4',
  },
};

// ── Chat Endpoint ──────────────────────────────────────────
// This is the main integration point. Each user message is
// forwarded to the n8n webhook URL configured for that agent.
app.post('/api/chat', async (req, res) => {
  try {
    const { agentId, message, sessionId } = req.body;

    // Validate agent
    const agent = AGENTS[agentId];
    if (!agent) {
      return res.status(400).json({ error: 'Unknown agent ID' });
    }

    // ── GET OR CREATE SESSION ────────────────────────────────
    const session = getOrCreateSession(sessionId, agentId);
    
    // Extract student info from current message and update profile
    const extractedInfo = extractStudentInfo(message);
    console.log(`🔍 Extracted: ${JSON.stringify(extractedInfo)}`);
    session.studentProfile.update(extractedInfo);
    
    // Add user message to history
    session.addMessage('user', message);
    
    console.log(`📝 Session ${sessionId.substring(0, 8)}... | ${agentId} | Student: ${session.studentProfile.name || 'Anonymous'} | GPA: ${session.studentProfile.gpa || 'N/A'} | Year: ${session.studentProfile.year || 'N/A'} | Major: ${session.studentProfile.major || 'N/A'}`);

    // ── CONTEXT-AWARE MESSAGE ────────────────────────────────
    // Build a context-aware message that includes student profile
    let contextAwareMessage = message;
    const profile = session.studentProfile.getSummary();
    
    if (profile.name || profile.gpa || profile.major || profile.interests.length > 0) {
      const contextInfo = [];
      if (profile.name) contextInfo.push(`Name: ${profile.name}`);
      if (profile.gpa) contextInfo.push(`GPA: ${profile.gpa}`);
      if (profile.year) contextInfo.push(`Year: ${profile.year}`);
      if (profile.major) contextInfo.push(`Major: ${profile.major}`);
      if (profile.interests.length > 0) contextInfo.push(`Interests: ${profile.interests.join(', ')}`);
      
      contextAwareMessage = `[STUDENT CONTEXT: ${contextInfo.join(' | ')}]\n[CONVERSATION HISTORY]\n${session.getConversationContext(15)}\n[CURRENT MESSAGE]\n${message}`;
    }

    // Special handling for Research Analyst (formerly split between career & academic support)
    // Route locally when n8n is NOT configured.  We decide inside whether the query
    // is about majors/careers or about courses/concepts and delegate accordingly.
    if (agentId === 'research-analyst') {
      const webhookUrl = process.env['N8N_WEBHOOK_AGENT_1'];
      if (!webhookUrl) {
        // Use the ORIGINAL message (not contextAwareMessage) to make intent decisions
        const msg = message.toLowerCase();

        let response;
        if (
          isMajorSelectionQuery(msg) ||
          msg.includes('college') ||
          msg.includes('major') ||
          msg.includes('career')
        ) {
          // Career/major guidance path
          response = provideCareerSupport(contextAwareMessage, session.studentProfile, message);
        } else {
          // General academic support (courses, studying, concepts, etc.)
          response = provideAcademicSupport(contextAwareMessage, session.studentProfile, message);
        }

        session.addMessage('assistant', response);
        return res.json({
          response,
          studentProfile: profile
        });
      }
    }

    // Special handling for Career Advisor (data-analyst)
    if (agentId === 'data-analyst') {
      const careerAdvice = analyzeCareerMatch(contextAwareMessage, session.studentProfile, message);
      console.log('🧭 CareerAdvice:', careerAdvice.replace(/\n/g, ' | '));
      session.addMessage('assistant', careerAdvice);
      return res.json({ 
        response: careerAdvice,
        studentProfile: profile 
      });
    }

    // Special handling for Emotional Support (code-assistant)
    if (agentId === 'code-assistant') {
      const emotionalSupport = provideEmotionalSupport(contextAwareMessage, session.studentProfile, message);
      session.addMessage('assistant', emotionalSupport);
      return res.json({ 
        response: emotionalSupport,
        studentProfile: profile 
      });
    }

    // Special handling for Academic Support (research-analyst) - Fallback handler
    if (agentId === 'research-analyst') {
      const webhookUrl = process.env['N8N_WEBHOOK_AGENT_1'];
      if (!webhookUrl) {
        // Use local academic support handler if no n8n configured
        const academicSupport = provideAcademicSupport(contextAwareMessage, session.studentProfile, message);
        session.addMessage('assistant', academicSupport);
        return res.json({ 
          response: academicSupport,
          studentProfile: profile 
        });
      }
    }

    // Get the webhook URL from environment variables
    const webhookUrl = process.env[agent.webhookEnv];

    // ────────────────────────────────────────────────────────
    // 🔗 n8n INTEGRATION POINT
    // ────────────────────────────────────────────────────────
    // If a webhook URL is configured, the message is sent to
    // your n8n workflow. Otherwise a fallback response is used
    // so you can test the UI without n8n running.
    // ────────────────────────────────────────────────────────
    if (webhookUrl) {
      console.log(`\n📤 Sending to n8n: ${webhookUrl}`);
      console.log(`   Body: ${JSON.stringify({ message, sessionId, agentId })}`);

      const n8nResponse = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: contextAwareMessage,
          sessionId: sessionId,
          agentId: agentId,
          studentProfile: profile
        }),
      });

      console.log(`📥 n8n status: ${n8nResponse.status}`);

      if (!n8nResponse.ok) {
        const errorBody = await n8nResponse.text();
        console.error(`❌ n8n error body: ${errorBody}`);
        throw new Error(`n8n responded with status ${n8nResponse.status}: ${errorBody}`);
      }

      const rawText = await n8nResponse.text();
      console.log(`📥 n8n raw response: ${rawText}`);

      // Handle empty or whitespace-only responses
      if (!rawText || !rawText.trim()) {
        console.warn('⚠️  n8n returned empty response');
        return res.json({ 
          response: `⚠️ Received an empty response from the n8n workflow. Please check your workflow configuration.` 
        });
      }

      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        // If n8n returns plain text instead of JSON, use it directly
        const trimmedText = rawText.trim();
        if (!trimmedText) {
          return res.json({ 
            response: `⚠️ Received an empty response from the n8n workflow.` 
          });
        }
        return res.json({ response: trimmedText });
      }

      // Handle array responses (n8n sometimes wraps in an array)
      if (Array.isArray(data)) {
        data = data[0] || {};
      }

      // Extract reply from various possible response formats
      const reply = data.response || data.output || data.text || data.message || data.content || data.answer;
      
      // If we found a reply, use it (even if it's an empty string, we'll handle that)
      if (reply !== undefined && reply !== null) {
        const replyStr = String(reply).trim();
        if (replyStr) {
          return res.json({ response: replyStr });
        }
      }

      // If data is an object but not empty, try to stringify it (but not if it's just {})
      if (typeof data === 'object' && Object.keys(data).length > 0) {
        const stringified = JSON.stringify(data);
        if (stringified && stringified !== '{}') {
          return res.json({ response: stringified });
        }
      }

      // Last resort: return a helpful error message
      console.warn('⚠️  Could not extract meaningful response from n8n data:', data);
      return res.json({ 
        response: `⚠️ Received an unexpected response format from the n8n workflow. Please check your workflow output configuration.` 
      });
    }

    // ── Fallback (no n8n configured) ───────────────────────
    const fallbackReplies = {
      'research-analyst': `🎓 [Academic Support — Demo Mode]\n\nI'd normally help you with academic questions and research: "${message}"\n\nConnect my n8n workflow to get real results!`,
      'code-assistant': `💗 [Mental Support — Demo Mode]\n\nI'm here to provide emotional support and guidance: "${message}"\n\nConnect my n8n workflow to get real assistance!`,
      'creative-writer': `📄 [CV Analyzer — Demo Mode]\n\nI'd analyze your CV and provide feedback: "${message}"\n\nConnect my n8n workflow to get real analysis!`,
      'data-analyst': `🎯 [Career Advisor — Demo Mode]\n\nI'd analyze your skills and interests to recommend the perfect career: "${message}"\n\nConnect my n8n workflow to get real career advice!`,
    };

    return res.json({
      response: fallbackReplies[agentId] || 'Agent not configured.',
    });
  } catch (error) {
    console.error('❌ Chat error:', error.message || error);
    return res.status(500).json({
      error: `Failed to get response from agent: ${error.message}`,
    });
  }
});

// ── CV Analysis Endpoint ────────────────────────────────────
app.post('/api/analyze-cv', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { agentId } = req.body;
    
    // Extract text from image using OCR
    console.log(`📄 Processing CV image: ${req.file.originalname}`);
    const extractedText = await extractTextFromImage(req.file.path);
    
    if (!extractedText || extractedText.trim().length < 50) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        error: 'Could not extract sufficient text from the image. Please ensure the CV image is clear and readable.' 
      });
    }
    
    console.log(`📝 Extracted ${extractedText.length} characters from image`);
    
    // Validate if the extracted text is actually a CV
    const cvValidation = validateIsCV(extractedText);
    if (!cvValidation.isCV) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        error: cvValidation.reason || 'The uploaded image does not appear to be a CV/resume. Please upload a clear image of your CV or resume.'
      });
    }
    
    console.log(`✅ CV validation passed - proceeding with analysis`);
    
    // Analyze the CV
    const analysis = analyzeCV(extractedText);
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    return res.json({
      response: analysis,
      extractedText: extractedText.substring(0, 500) + '...' // Preview
    });
  } catch (error) {
    console.error('❌ CV Analysis error:', error.message);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(500).json({
      error: `Failed to analyze CV: ${error.message}`,
    });
  }
});

// ── OCR Text Extraction ──────────────────────────────────────
async function extractTextFromImage(imagePath) {
  try {
    console.log('🔍 Starting OCR extraction...');
    const worker = await createWorker('eng');
    
    const { data: { text } } = await worker.recognize(imagePath);
    await worker.terminate();
    
    console.log('✅ OCR extraction completed');
    return text.trim();
  } catch (error) {
    console.error('❌ OCR extraction failed:', error);
    throw new Error(`Failed to extract text from image: ${error.message}`);
  }
}

// ── Validate if extracted text is a CV (Improved AI Detection) ──────
function validateIsCV(text) {
  const cleanText = text.toLowerCase();
  const upperText = text.toUpperCase();
  const wordCount = text.trim().split(/\s+/).length;
  
  // ─── 1. INITIAL VALIDITY CHECKS ───
  // Check for minimum readable content
  const textQuality = analyzeTextQuality(text);
  if (!textQuality.isValid) {
    return {
      isCV: false,
      score: 0,
      reason: textQuality.reason,
      indicators: { required: [], optional: [], nonCV: ['unreadable content'] }
    };
  }
  
  // ─── 2. CV STRUCTURE INDICATORS ───
  const cvIndicators = {
    // Name detection - improved patterns
    hasName: detectName(text),
    
    // Contact info - expanded patterns
    hasEmail: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text),
    hasPhone: /\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b|phone|tel|mobile|cell/i.test(text),
    hasLinkedIn: /linkedin\.com|linkedin|in\.com/i.test(text),
    hasGitHub: /github\.com|github|github\.io/i.test(text),
    hasPortfolio: /portfolio|website|web\.|\.com|\.io/i.test(cleanText),
    hasContact: /email|phone|address|contact|linkedin|github|@/i.test(cleanText),
    
    // Professional sections
    hasExperience: /experience|work|employment|position|role|job|career|professional summary|work history/i.test(cleanText),
    hasEducation: /education|degree|university|college|bachelor|master|phd|diploma|school|institute|academic/i.test(cleanText),
    hasSkills: /skills|technical|competencies|proficiency|expertise|abilities|qualifications|certifications/i.test(cleanText),
    
    // CV-specific keywords
    hasCVKeywords: /resume|cv\b|curriculum vitae|professional profile|summary|objective|highlights/i.test(cleanText),
    
    // Job/career content
    hasJobTitles: detectJobTitles(text),
    hasCareerKeywords: /engineer|developer|manager|analyst|consultant|director|architect|specialist|coordinator|officer|executive|designer|lead|senior|junior|associate|supervisor/i.test(cleanText),
    
    // Organization/Company patterns
    hasCompanyNames: detectCompanyNames(text),
    
    // Dates and timeline
    hasDates: /\b(19|20)\d{2}\b|present|current|january|february|march|april|may|june|july|august|september|october|november|december/i.test(text),
    hasDateRange: /\d{4}\s*[-–]\s*\d{4}|\d{4}\s*[-–]\s*present|from.*to|start.*end/i.test(text),
    
    // Action verbs and achievements
    hasActionVerbs: /developed|created|implemented|improved|led|managed|designed|built|achieved|delivered|optimized|established|launched|executed|coordinated|supervised|mentored|architected|engineered|contributed|responsible|increased|reduced|enhanced|successful/i.test(cleanText),
    
    // Achievement metrics
    hasMetrics: /\d+%|\d+\+|\d+x|\$\d+k|\d+\s*(million|billion|thousand)|roi|kpi|performance/i.test(text),
  };
  
  // ─── 3. LANGUAGE QUALITY ANALYSIS ───
  const languageQuality = analyzeLanguageQuality(text);
  
  // ─── 4. CALCULATE WEIGHTED SCORE ───
  let score = 0;
  const requiredIndicators = [];
  const optionalIndicators = [];
  
  // TIER 1: Critical indicators (foundation)
  if (cvIndicators.hasName) { score += 4; requiredIndicators.push('name'); }
  if (cvIndicators.hasContact || cvIndicators.hasEmail || cvIndicators.hasPhone) { 
    score += 4; 
    requiredIndicators.push('contact information'); 
  }
  
  // TIER 2: Strong CV indicators
  if (cvIndicators.hasExperience) { score += 3; requiredIndicators.push('work experience'); }
  if (cvIndicators.hasEducation) { score += 3; requiredIndicators.push('education'); }
  if (cvIndicators.hasActionVerbs && languageQuality.professionalLanguage >= 0.7) { 
    score += 3; 
    requiredIndicators.push('professional language/achievements'); 
  }
  
  // TIER 3: Supporting indicators
  if (cvIndicators.hasSkills) { score += 2; optionalIndicators.push('skills section'); }
  if (cvIndicators.hasJobTitles) { score += 2; optionalIndicators.push('job titles'); }
  if (cvIndicators.hasDates) { score += 1; optionalIndicators.push('dates'); }
  if (cvIndicators.hasDateRange) { score += 1; optionalIndicators.push('date ranges'); }
  if (cvIndicators.hasCompanyNames) { score += 2; optionalIndicators.push('company names'); }
  if (cvIndicators.hasMetrics) { score += 2; optionalIndicators.push('quantifiable achievements'); }
  if (cvIndicators.hasCVKeywords) { score += 2; optionalIndicators.push('CV/resume keywords'); }
  if (cvIndicators.hasLinkedIn || cvIndicators.hasGitHub) { 
    score += 1; 
    optionalIndicators.push('professional profiles'); 
  }
  
  // Language quality boost
  score += Math.round(languageQuality.professionalLanguage * 2);
  
  // ─── 5. DETECT NON-CV DOCUMENTS ───
  const nonCVPatterns = detectNonCVPatterns(text, cleanText, wordCount);
  
  let penalty = 0;
  const detectedNonCV = [];
  
  for (const [key, value] of Object.entries(nonCVPatterns)) {
    if (value.detected) {
      penalty += value.penalty;
      detectedNonCV.push(value.name);
    }
  }
  
  // ─── 6. FINAL DECISION LOGIC ───
  const confidenceScore = score - penalty;
  
  // Must have at least 2 required indicators AND positive confidence
  const hasMinimalStructure = requiredIndicators.length >= 2;
  const hasPositiveConfidence = confidenceScore >= 6;
  const isNotSomethingElse = detectedNonCV.length === 0 || penalty < 8;
  
  const isCV = hasMinimalStructure && hasPositiveConfidence && isNotSomethingElse;
  
  let reason = '';
  let confidence = 'low';
  
  if (isCV) {
    if (confidenceScore >= 15) {
      confidence = 'high';
    } else if (confidenceScore >= 10) {
      confidence = 'medium';
    }
  } else {
    if (detectedNonCV.length > 0 && penalty >= 8) {
      reason = `This appears to be a ${detectedNonCV[0]}, not a CV/resume. Please upload a clear image of your actual CV or resume.`;
    } else if (!hasMinimalStructure) {
      reason = `Missing key CV components. A CV should include: your name, contact info, work experience, and education. Found only: ${requiredIndicators.join(', ') || 'insufficient data'}.`;
    } else if (!hasPositiveConfidence) {
      reason = `The document structure doesn't match a typical CV/resume. Please ensure you upload a clear, readable image of your CV with standard sections.`;
    } else {
      reason = 'Unable to confirm this is a CV/resume. Please upload a clear image of your CV or resume.';
    }
  }
  
  console.log(`📊 CV Validation: score=${confidenceScore}, confidence=${confidence}, indicators=${requiredIndicators.length} required, ${optionalIndicators.length} optional`);
  
  return {
    isCV,
    score: confidenceScore,
    confidence,
    reason,
    indicators: {
      required: requiredIndicators,
      optional: optionalIndicators,
      nonCV: detectedNonCV
    }
  };
}

// ── Helper: Analyze text quality and readability ───────────────────
function analyzeTextQuality(text) {
  const cleanText = text.toLowerCase();
  
  // Check for minimum content
  if (text.trim().length < 50) {
    return { isValid: false, reason: 'Image content too short - text extraction may have failed. Please upload a clearer, higher quality image.' };
  }
  
  // Check for readable letters (not just symbols/numbers)
  const letterCount = (text.match(/[a-zA-Z]/g) || []).length;
  const totalChars = text.length;
  const letterRatio = letterCount / totalChars;
  
  if (letterRatio < 0.3) {
    return { isValid: false, reason: 'Low text quality detected - unable to extract readable content. Please ensure the image is clear and well-lit.' };
  }
  
  // Check for corrupted/random characters
  const controlChars = (text.match(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g) || []).length;
  if (controlChars > text.length * 0.1) {
    return { isValid: false, reason: 'Corrupted or unreadable text detected. Please upload a clearer image.' };
  }
  
  return { isValid: true };
}

// ── Helper: Detect person name patterns ───────────────────────────
function detectName(text) {
  // Common name patterns
  const namePatterns = [
    /^[A-Z][a-z]+\s+[A-Z][a-z]+/,  // John Smith
    /^[A-Z][a-z]+\s+[A-Z]\.\s+[A-Z][a-z]+/,  // John Q. Smith
    /^[A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z][a-z]+/,  // John Michael Smith
    /name\s*[:=]\s*[A-Z][a-z]+\s+[A-Z]/i,  // name: John S
  ];
  
  return namePatterns.some(pattern => pattern.test(text));
}

// ── Helper: Detect job titles ────────────────────────────────────
function detectJobTitles(text) {
  const jobTitlePatterns = [
    /software\s+engineer/i,
    /data\s+scientist/i,
    /product\s+manager/i,
    /project\s+manager/i,
    /business\s+analyst/i,
    /frontend\s+developer/i,
    /backend\s+developer/i,
    /full\s+stack\s+developer/i,
    /DevOps\s+engineer/i,
    /solutions\s+architect/i,
    /ux\s+designer/i,
    /senior\s+engineer/i,
    /lead\s+developer/i,
  ];
  
  return jobTitlePatterns.some(pattern => pattern.test(text)) ||
         /engineer|developer|manager|analyst|architect|designer|consultant/i.test(text);
}

// ── Helper: Detect company names ─────────────────────────────────
function detectCompanyNames(text) {
  return /[A-Z][a-z]+\s+(Inc|LLC|Corp|Ltd|Company|Technologies|Systems|Solutions|Co|Media|Group|Labs|Studio)|at\s+[A-Z][a-z]+|worked\s+at/i.test(text);
}

// ── Helper: Analyze language quality for professionalism ──────────
function analyzeLanguageQuality(text) {
  const cleanText = text.toLowerCase();
  
  // Professional terms
  const professionalTerms = /professional|achievement|responsibility|contributed|managed|led|developed|improved|optimized|successful|goal|objective|result|impact/i.test(cleanText);
  
  // Check for coherent sentences (not random words)
  const avgWordLength = text.split(/\s+/).reduce((sum, word) => sum + word.length, 0) / text.split(/\s+/).length;
  const hasCoherentSentences = avgWordLength > 3.5 && avgWordLength < 15;
  
  // Check for proper punctuation
  const punctuationCount = (text.match(/[.!?,;:-]/g) || []).length;
  const wordCount = text.split(/\s+/).length;
  const punctuationRatio = punctuationCount / wordCount;
  const hasGoodPunctuation = punctuationRatio > 0.05 && punctuationRatio < 0.3;
  
  const professionalLanguage = 
    (professionalTerms ? 0.3 : 0) +
    (hasCoherentSentences ? 0.35 : 0) +
    (hasGoodPunctuation ? 0.35 : 0);
  
  return { professionalLanguage };
}

// ── Helper: Detect non-CV document patterns ──────────────────────
function detectNonCVPatterns(text, cleanText, wordCount) {
  return {
    recipe: {
      detected: /recipe|ingredients|instructions|preparation|cooking|baking|serves|cups|tablespoon|oz\.|ml/i.test(cleanText),
      penalty: 12,
      name: 'recipe'
    },
    menu: {
      detected: /menu|appetizer|entree|dessert|beverage|drink|sauce|soup|\$\d+\.\d{2}|\$\d{1,2}\b/i.test(cleanText) && /(price|cost|\$)/i.test(cleanText),
      penalty: 12,
      name: 'restaurant menu'
    },
    invoice: {
      detected: /invoice|bill|amount\s+due|payment|tax|subtotal|total|qty|unit.*price/i.test(cleanText),
      penalty: 12,
      name: 'invoice'
    },
    receipt: {
      detected: /receipt|transaction|card\s+ending|merchant|subtotal|total\s+paid|change/i.test(cleanText),
      penalty: 12,
      name: 'receipt'
    },
    license: {
      detected: /license|driver|expires|issued|height|sex|address|dob|id\s+number|state\s+id/i.test(cleanText),
      penalty: 12,
      name: 'ID/License document'
    },
    passport: {
      detected: /passport|country|nationality|birth\s+place|valid|expir|page\s+of/i.test(cleanText),
      penalty: 11,
      name: 'passport'
    },
    article: {
      detected: /published|journal|magazine|newspaper|byline|abstract|introduction|conclusion|references/i.test(cleanText) && wordCount > 200,
      penalty: 8,
      name: 'article/journal'
    },
    letter: {
      detected: /dear\s+[a-z]+|sincerely|yours\s+truly|regards|closing statement|regards/i.test(cleanText),
      penalty: 10,
      name: 'letter'
    },
    form: {
      detected: /application\s+form|please\s+print|sign\s+here|date\s+of\s+birth|signature|checkbox/i.test(cleanText),
      penalty: 9,
      name: 'form'
    },
    contract: {
      detected: /agreement|contract|terms\s+and\s+conditions|hereby|whereas|indemnif|liability/i.test(cleanText),
      penalty: 10,
      name: 'contract'
    },
    unreadable: {
      detected: (text.match(/\d/g) || []).length > text.length * 0.6 || !/[a-zA-Z]{3,}/.test(text),
      penalty: 15,
      name: 'unreadable content'
    }
  };
}

// ── CV Analysis Logic ───────────────────────────────────────
function analyzeCV(cvText) {
  // Clean and normalize the extracted text
  const cleanText = cvText.replace(/\s+/g, ' ').trim();
  const text = cleanText.toLowerCase();
  const analysis = {
    strengths: [],
    weaknesses: [],
    recommendations: []
  };
  
  // Check if we have enough content
  if (cleanText.length < 100) {
    analysis.weaknesses.push('✗ CV appears to be too short or text extraction may have failed');
    analysis.recommendations.push('💡 Please ensure the CV image is clear and all text is readable');
    return formatAnalysisResponse(analysis);
  }
  
  // Analyze structure and content
  const sections = {
    contact: /email|phone|linkedin|contact|@|tel|mobile/i.test(cvText),
    summary: /summary|objective|profile|about|overview/i.test(cvText),
    experience: /experience|work|employment|history|position|role|job/i.test(cvText),
    education: /education|degree|university|college|bachelor|master|phd|diploma|school/i.test(cvText),
    skills: /skills|technical|competencies|proficiency|expertise|abilities/i.test(cvText),
    certifications: /certification|certificate|certified|license|credential/i.test(cvText)
  };
  
  // Check for strengths
  if (sections.contact) {
    analysis.strengths.push('✓ Contact information is clearly presented');
  } else {
    analysis.weaknesses.push('✗ Missing or unclear contact information');
  }
  
  if (sections.summary) {
    analysis.strengths.push('✓ Professional summary provides a good overview');
  } else {
    analysis.weaknesses.push('✗ Missing professional summary - add a compelling summary section');
  }
  
  // Analyze work experience
  const experienceMatches = cvText.match(/\d+\+?\s*(years?|yrs?)/gi);
  if (experienceMatches && experienceMatches.length > 0) {
    const years = experienceMatches.map(m => parseInt(m)).reduce((a, b) => a + b, 0);
    if (years >= 3) {
      analysis.strengths.push(`✓ Demonstrates ${years}+ years of relevant experience`);
    }
  }
  
  if (sections.experience) {
    const bulletPoints = (cvText.match(/[-•*]\s/g) || []).length;
    if (bulletPoints >= 5) {
      analysis.strengths.push('✓ Work experience includes detailed achievements and responsibilities');
    } else {
      analysis.weaknesses.push('✗ Work experience lacks detail - add more specific achievements and metrics');
    }
  } else {
    analysis.weaknesses.push('✗ Missing work experience section');
  }
  
  // Analyze skills - broader keyword detection
  if (sections.skills) {
    const techKeywords = [
      'javascript', 'python', 'react', 'node', 'sql', 'aws', 'docker', 'git',
      'java', 'c++', 'c#', 'php', 'ruby', 'go', 'rust', 'swift', 'kotlin',
      'angular', 'vue', 'django', 'flask', 'spring', 'express', 'laravel',
      'mongodb', 'postgresql', 'mysql', 'redis', 'elasticsearch',
      'html', 'css', 'typescript', 'sass', 'less',
      'kubernetes', 'jenkins', 'terraform', 'ansible', 'ci/cd'
    ];
    const foundSkills = techKeywords.filter(skill => text.includes(skill));
    if (foundSkills.length >= 5) {
      analysis.strengths.push(`✓ Strong technical skills demonstrated (${foundSkills.length} technologies/technologies mentioned)`);
    } else if (foundSkills.length >= 2) {
      analysis.strengths.push(`✓ Technical skills are present (${foundSkills.length} technologies identified)`);
    } else {
      analysis.weaknesses.push('✗ Technical skills could be more specific - list concrete technologies and tools');
    }
  } else {
    // Check if skills are mentioned even without a dedicated section
    const hasTechMentions = /javascript|python|java|react|node|sql|html|css|programming|software|developer/i.test(cvText);
    if (hasTechMentions) {
      analysis.weaknesses.push('✗ Skills are mentioned but not in a dedicated section - consider organizing them clearly');
    } else {
      analysis.weaknesses.push('✗ Missing dedicated skills section');
    }
  }
  
  // Analyze education
  if (sections.education) {
    if (/bachelor|master|phd|degree/i.test(cvText)) {
      analysis.strengths.push('✓ Education credentials are clearly stated');
    }
  } else {
    analysis.weaknesses.push('✗ Education section is missing or unclear');
  }
  
  // Analyze certifications
  if (sections.certifications) {
    analysis.strengths.push('✓ Professional certifications add credibility');
  } else {
    analysis.recommendations.push('💡 Consider adding relevant certifications to enhance your profile');
  }
  
  // Check for quantifiable achievements
  const metrics = /\d+%|\d+\+|\$\d+|\d+\s*(million|billion|thousand)/gi.test(cvText);
  if (metrics) {
    analysis.strengths.push('✓ Includes quantifiable achievements and metrics');
  } else {
    analysis.weaknesses.push('✗ Lacks quantifiable achievements - add numbers, percentages, and metrics to demonstrate impact');
  }
  
  // Check for action verbs - expanded list
  const actionVerbs = /developed|created|implemented|improved|led|managed|designed|built|achieved|delivered|optimized|established|launched|executed|coordinated|supervised|mentored|architected|engineered/i.test(cvText);
  const actionVerbCount = (cvText.match(/developed|created|implemented|improved|led|managed|designed|built|achieved|delivered|optimized|established|launched|executed|coordinated|supervised|mentored|architected|engineered/gi) || []).length;
  
  if (actionVerbs && actionVerbCount >= 5) {
    analysis.strengths.push(`✓ Uses strong action verbs effectively (${actionVerbCount} action-oriented statements found)`);
  } else if (actionVerbs) {
    analysis.strengths.push('✓ Uses action verbs to describe accomplishments');
    analysis.recommendations.push('💡 Consider using more varied and impactful action verbs');
  } else {
    analysis.weaknesses.push('✗ Use more action-oriented language to describe your achievements (e.g., "Developed", "Led", "Improved")');
  }
  
  // Check for dates and timeline consistency
  const datePattern = /\b(19|20)\d{2}\b/g;
  const dates = cvText.match(datePattern) || [];
  if (dates.length >= 4) {
    analysis.strengths.push('✓ Includes clear timeline with dates for experience and education');
  } else if (dates.length >= 2) {
    analysis.weaknesses.push('✗ Some dates may be missing - ensure all positions and education include dates');
  } else {
    analysis.weaknesses.push('✗ Missing dates - add dates to all work experience and education entries');
  }
  
  // Check CV length (word count)
  const wordCount = cleanText.split(/\s+/).length;
  if (wordCount >= 300 && wordCount <= 800) {
    analysis.strengths.push(`✓ CV length is appropriate (${wordCount} words) - comprehensive yet concise`);
  } else if (wordCount < 200) {
    analysis.weaknesses.push(`✗ CV may be too brief (${wordCount} words) - consider adding more detail`);
  } else if (wordCount > 1000) {
    analysis.weaknesses.push(`✗ CV may be too long (${wordCount} words) - consider condensing to most relevant information`);
  }
  
  // Generate recommendations
  if (analysis.weaknesses.length > analysis.strengths.length) {
    analysis.recommendations.push('💡 Focus on strengthening the weaker areas identified above');
  }
  
  if (!/linkedin|github|portfolio|website|github\.com|linkedin\.com/i.test(cvText)) {
    analysis.recommendations.push('💡 Add links to your LinkedIn, GitHub, or portfolio to provide more context');
  }
  
  // Check for keywords that might indicate good CV practices
  if (/achievement|result|impact|success|award|recognition/i.test(cvText)) {
    analysis.strengths.push('✓ Mentions achievements and results, which strengthens the CV');
  }
  
  return formatAnalysisResponse(analysis);
}

// ── Format Analysis Response ─────────────────────────────────
function formatAnalysisResponse(analysis) {
  let response = '📄 **CV ANALYSIS REPORT**\n\n';
  
  if (analysis.strengths.length > 0) {
    response += '**✅ STRENGTHS:**\n';
    analysis.strengths.forEach(s => response += `${s}\n`);
    response += '\n';
  }
  
  if (analysis.weaknesses.length > 0) {
    response += '**❌ AREAS FOR IMPROVEMENT:**\n';
    analysis.weaknesses.forEach(w => response += `${w}\n`);
    response += '\n';
  }
  
  if (analysis.recommendations.length > 0) {
    response += '**💡 RECOMMENDATIONS:**\n';
    analysis.recommendations.forEach(r => response += `${r}\n`);
  }
  
  response += '\n---\n';
  response += '*This analysis is based on CV structure, content depth, and best practices. Consider these insights to strengthen your CV.*';
  
  return response;
}

// ── TBS (Tunis Business School) Knowledge Base ──────────────
const TBS_INFO = {
  name: 'Tunis Business School (TBS)',
  location: 'University of Tunis, Tunisia',
  degree: 'Bachelor of Science in Business Administration (BSBA)',
  credits_required: 130,
  years: 4,
  semester_based: true,
  
  majors: {
    accounting: {
      name: 'Accounting',
      credits: 36,
      required_courses: ['BCOR 130', 'BCOR 225'],
      min_gpa: 2.0,
      description: 'Financial reporting, auditing, tax accounting, and corporate governance',
      careers: ['Accounting', 'Financial Analyst', 'Auditor', 'Tax Consultant', 'CFO'],
      skills: ['Financial Analysis', 'Excel', 'Attention to Detail', 'Analytical Thinking']
    },
    finance: {
      name: 'Finance',
      credits: 36,
      required_courses: ['BCOR 230', 'BCOR 320'],
      min_gpa: 2.0,
      description: 'Investment management, corporate finance, financial markets, and risk management',
      careers: ['Financial Analyst', 'Investment Manager', 'Portfolio Manager', 'Risk Analyst', 'Trader'],
      skills: ['Financial Modeling', 'Quantitative Analysis', 'Market Knowledge', 'Decision Making']
    },
    business_analytics: {
      name: 'Business Analytics',
      credits: 36,
      required_courses: ['BCOR 210', 'BCOR 310'],
      min_gpa: 2.0,
      description: 'Data analysis, business intelligence, predictive modeling, and decision science',
      careers: ['Business Analyst', 'Data Analyst', 'Data Scientist', 'BI Developer', 'Operations Manager'],
      skills: ['Data Analysis', 'SQL', 'Python', 'Tableau/Power BI', 'Statistical Thinking']
    },
    information_technology: {
      name: 'Information Technology',
      credits: 36,
      required_courses: ['BCOR 120', 'BCOR 220'],
      min_gpa: 2.0,
      description: 'Systems development, database management, cybersecurity, and IT strategy',
      careers: ['Software Developer', 'Systems Analyst', 'IT Manager', 'Cybersecurity Specialist', 'Database Administrator'],
      skills: ['Programming', 'System Design', 'Database Management', 'Problem Solving', 'Technical Communication']
    },
    marketing: {
      name: 'Marketing',
      credits: 36,
      required_courses: ['BCOR 120', 'BCOR 150', 'BCOR 210'],
      min_gpa: 2.0,
      description: 'Consumer behavior, digital marketing, brand management, and market research',
      careers: ['Marketing Manager', 'Digital Marketer', 'Brand Manager', 'Market Research Analyst', 'Product Manager'],
      skills: ['Communication', 'Creativity', 'Data Analysis', 'Strategic Planning', 'Social Media']
    }
  },
  
  minors: [
    'Accounting', 'Business Analytics', 'Finance', 'Information Technology', 'Marketing',
    'International Business Economics'
  ],
  
  academic_requirements: {
    sophomore_major_selection: {
      min_credits: 66,
      min_gpa: 2.0,
      min_specialized_gpa: 2.0,
      description: 'Sophomores must complete 66 credits and maintain 2.0 GPA in both cumulative and specialized courses'
    },
    internship_options: [
      {
        option: 'Full-Time Internship',
        credits: 12,
        duration: 'Full semester',
        description: 'Full-time 12-credit internship experience'
      },
      {
        option: 'Project + Electives',
        credits: 6,
        description: '6-credit capstone project + 2 elective courses'
      }
    ],
    academic_probation: 'GPA below 2.0 triggers probation; dismissal after 2 consecutive semesters on probation',
    attendance: 'Maximum 4 absences per course allowed'
  },
  
  career_pathways: {
    accounting: ['Accountant', 'Auditor', 'Tax Specialist', 'Financial Controller', 'CFO'],
    finance: ['Financial Analyst', 'Investment Manager', 'Risk Manager', 'Treasury Manager', 'CFO'],
    business_analytics: ['Business Analyst', 'Data Scientist', 'Analytics Manager', 'BI Developer', 'Operations Manager'],
    information_technology: ['Software Developer', 'IT Manager', 'Systems Analyst', 'CTO', 'IT Consultant'],
    marketing: ['Marketing Manager', 'Digital Strategist', 'Brand Manager', 'Product Manager', 'CMO']
  }
};

// ── Career Matching Database ────────────────────────────────
const JOB_DATABASE = [
  {
    title: 'Software Engineer',
    category: 'Technology',
    requiredSkills: ['programming', 'coding', 'software development', 'javascript', 'python', 'java', 'c++', 'problem solving', 'algorithms', 'data structures'],
    preferredSkills: ['react', 'node.js', 'git', 'agile', 'testing', 'debugging', 'api', 'database'],
    interests: ['technology', 'computers', 'programming', 'problem solving', 'innovation', 'building', 'creating'],
    personality: ['analytical', 'logical', 'detail-oriented', 'creative', 'collaborative'],
    education: ['computer science', 'software engineering', 'information technology'],
    description: 'Designs, develops, and maintains software applications and systems.',
    salaryRange: '$70,000 - $150,000+',
    growth: 'High demand, 22% growth expected',
    matchKeywords: ['code', 'program', 'software', 'developer', 'app', 'website', 'tech', 'computer']
  },
  {
    title: 'Data Scientist',
    category: 'Technology / Analytics',
    requiredSkills: ['python', 'statistics', 'machine learning', 'data analysis', 'sql', 'mathematics', 'analytics'],
    preferredSkills: ['r', 'pandas', 'numpy', 'tensorflow', 'pytorch', 'tableau', 'power bi', 'big data'],
    interests: ['data', 'analytics', 'statistics', 'research', 'patterns', 'insights', 'ai', 'machine learning'],
    personality: ['analytical', 'curious', 'detail-oriented', 'research-oriented', 'mathematical'],
    education: ['data science', 'statistics', 'mathematics', 'computer science'],
    description: 'Analyzes complex data to extract insights and build predictive models.',
    salaryRange: '$85,000 - $160,000+',
    growth: 'Very high demand, 36% growth expected',
    matchKeywords: ['data', 'analytics', 'statistics', 'numbers', 'research', 'insights', 'ai', 'machine learning']
  },
  {
    title: 'UX/UI Designer',
    category: 'Design / Technology',
    requiredSkills: ['design', 'user experience', 'user interface', 'creativity', 'figma', 'adobe', 'prototyping'],
    preferredSkills: ['sketch', 'adobe xd', 'illustrator', 'photoshop', 'wireframing', 'usability testing', 'user research'],
    interests: ['design', 'creativity', 'user experience', 'aesthetics', 'art', 'visual', 'interface', 'usability'],
    personality: ['creative', 'empathetic', 'detail-oriented', 'user-focused', 'collaborative'],
    education: ['design', 'graphic design', 'human-computer interaction', 'visual arts'],
    description: 'Creates intuitive and visually appealing user interfaces and experiences.',
    salaryRange: '$60,000 - $130,000+',
    growth: 'High demand, 13% growth expected',
    matchKeywords: ['design', 'ui', 'ux', 'creative', 'visual', 'interface', 'user experience', 'aesthetics']
  },
  {
    title: 'Product Manager',
    category: 'Business / Technology',
    requiredSkills: ['leadership', 'strategy', 'communication', 'analytics', 'project management', 'business'],
    preferredSkills: ['agile', 'scrum', 'market research', 'data analysis', 'stakeholder management', 'roadmapping'],
    interests: ['business', 'strategy', 'innovation', 'products', 'market', 'leadership', 'planning'],
    personality: ['strategic', 'leadership', 'communicative', 'analytical', 'organized'],
    education: ['business', 'mba', 'engineering', 'marketing', 'management'],
    description: 'Oversees product development from conception to launch, aligning business and user needs.',
    salaryRange: '$90,000 - $180,000+',
    growth: 'High demand, 10% growth expected',
    matchKeywords: ['product', 'business', 'strategy', 'leadership', 'management', 'planning', 'market']
  },
  // additional roles to enlarge dataset
  {
    title: 'Financial Analyst',
    category: 'Finance / Business',
    requiredSkills: ['excel', 'financial modeling', 'analytics', 'accounting', 'budgeting'],
    preferredSkills: ['cfa', 'sql', 'power bi', 'forecasting'],
    interests: ['finance', 'markets', 'numbers', 'analysis', 'investment'],
    personality: ['analytical', 'detail-oriented', 'organized', 'curious'],
    education: ['finance', 'accounting', 'business'],
    description: 'Evaluates financial data to support business decisions and investment strategies.',
    salaryRange: '$60,000 - $120,000+',
    growth: 'Steady demand, 7% growth expected',
    matchKeywords: ['finance', 'investment', 'budget', 'analysis', 'market']
  },
  {
    title: 'Human Resources Specialist',
    category: 'Business / Operations',
    requiredSkills: ['communication', 'recruiting', 'interpersonal', 'conflict resolution', 'organization'],
    preferredSkills: ['hris', 'talent management', 'training', 'onboarding'],
    interests: ['people', 'culture', 'development', 'support', 'systems'],
    personality: ['empathetic', 'organized', 'approachable', 'ethical'],
    education: ['human resources', 'psychology', 'business'],
    description: 'Manages employee relations, recruitment, and HR processes.',
    salaryRange: '$45,000 - $75,000+',
    growth: 'Average demand, 6% growth expected',
    matchKeywords: ['hr', 'recruiting', 'people', 'employee', 'culture']
  },
  {
    title: 'Civil Engineer',
    category: 'Engineering',
    requiredSkills: ['math', 'design', 'project management', 'autocad', 'analysis'],
    preferredSkills: ['structural', 'geotechnical', 'transportation', 'construction'],
    interests: ['building', 'infrastructure', 'construction', 'design', 'systems'],
    personality: ['analytical', 'methodical', 'detail-oriented', 'creative'],
    education: ['civil engineering', 'structural engineering'],
    description: 'Designs and oversees construction of infrastructure projects like roads and bridges.',
    salaryRange: '$65,000 - $110,000+',
    growth: 'Moderate demand, 8% growth expected',
    matchKeywords: ['civil', 'infrastructure', 'construction', 'design', 'roads']
  },
  {
    title: 'Elementary School Teacher',
    category: 'Education',
    requiredSkills: ['communication', 'lesson planning', 'patience', 'classroom management', 'creativity'],
    preferredSkills: ['certification', 'special education', 'technology integration'],
    interests: ['education', 'children', 'learning', 'development', 'community'],
    personality: ['patient', 'enthusiastic', 'creative', 'caring'],
    education: ['education', 'elementary education'],
    description: 'Teaches young students foundational subjects in a classroom setting.',
    salaryRange: '$40,000 - $60,000+',
    growth: 'Stable demand, 5% growth expected',
    matchKeywords: ['teach', 'students', 'classroom', 'education']
  },
  {
    title: 'Nurse',
    category: 'Healthcare',
    requiredSkills: ['clinical', 'communication', 'empathy', 'critical thinking', 'patient care'],
    preferredSkills: ['rn', 'cpr', 'specialty certifications', 'medical software'],
    interests: ['healthcare', 'helping', 'science', 'people'],
    personality: ['compassionate', 'diligent', 'resilient', 'calm under pressure'],
    education: ['nursing'],
    description: 'Provides patient care and supports medical treatment plans.',
    salaryRange: '$50,000 - $90,000+',
    growth: 'High demand, 9% growth expected',
    matchKeywords: ['nurse', 'patient', 'care', 'health']
  },
  {
    title: 'Graphic Designer',
    category: 'Design / Creative',
    requiredSkills: ['creativity', 'adobe', 'layout', 'typography', 'visual communication'],
    preferredSkills: ['illustrator', 'photoshop', 'branding', 'ux/ui'],
    interests: ['art', 'design', 'visuals', 'creativity'],
    personality: ['creative', 'detail-oriented', 'aesthetic', 'imaginative'],
    education: ['design', 'arts'],
    description: 'Creates visual concepts to communicate ideas that inspire and inform.',
    salaryRange: '$45,000 - $85,000+',
    growth: 'Average demand, 4% growth expected',
    matchKeywords: ['design', 'graphic', 'visual', 'creative']
  },
  {
    title: 'Sales Representative',
    category: 'Business / Sales',
    requiredSkills: ['communication', 'negotiation', 'persuasion', 'crm', 'relationship building'],
    preferredSkills: ['lead generation', 'salesforce', 'networking'],
    interests: ['sales', 'business', 'people', 'targets'],
    personality: ['outgoing', 'motivated', 'persistent', 'friendly'],
    education: ['business', 'marketing'],
    description: 'Sells products or services and maintains client relationships.',
    salaryRange: '$40,000 - $100,000+',
    growth: 'Steady demand, 5% growth expected',
    matchKeywords: ['sales', 'sell', 'client', 'business']
  },
  {
    title: 'Marketing Manager',
    category: 'Marketing / Business',
    requiredSkills: ['marketing', 'communication', 'strategy', 'analytics', 'social media', 'content'],
    preferredSkills: ['seo', 'sem', 'google analytics', 'advertising', 'branding', 'campaign management'],
    interests: ['marketing', 'advertising', 'social media', 'content', 'branding', 'communication', 'creativity'],
    personality: ['creative', 'communicative', 'strategic', 'analytical', 'persuasive'],
    education: ['marketing', 'business', 'communications', 'advertising'],
    description: 'Develops and executes marketing strategies to promote products and services.',
    salaryRange: '$65,000 - $140,000+',
    growth: 'Steady demand, 10% growth expected',
    matchKeywords: ['marketing', 'advertising', 'social media', 'content', 'brand', 'campaign', 'communication']
  },
  {
    title: 'Financial Analyst',
    category: 'Finance',
    requiredSkills: ['finance', 'analytics', 'excel', 'financial modeling', 'accounting', 'mathematics'],
    preferredSkills: ['sql', 'python', 'tableau', 'power bi', 'risk analysis', 'valuation'],
    interests: ['finance', 'numbers', 'analytics', 'investments', 'economics', 'markets'],
    personality: ['analytical', 'detail-oriented', 'numerical', 'risk-aware', 'organized'],
    education: ['finance', 'accounting', 'economics', 'business'],
    description: 'Analyzes financial data to guide investment decisions and business strategy.',
    salaryRange: '$60,000 - $120,000+',
    growth: 'Steady demand, 9% growth expected',
    matchKeywords: ['finance', 'financial', 'money', 'investments', 'analytics', 'numbers', 'accounting', 'economics']
  },
  {
    title: 'Project Manager',
    category: 'Management',
    requiredSkills: ['project management', 'leadership', 'organization', 'communication', 'planning'],
    preferredSkills: ['agile', 'scrum', 'pmp', 'risk management', 'budgeting', 'stakeholder management'],
    interests: ['management', 'organization', 'planning', 'leadership', 'coordination', 'efficiency'],
    personality: ['organized', 'leadership', 'communicative', 'detail-oriented', 'problem-solving'],
    education: ['business', 'management', 'engineering', 'project management'],
    description: 'Plans, executes, and closes projects while managing resources and stakeholders.',
    salaryRange: '$70,000 - $140,000+',
    growth: 'High demand, 7% growth expected',
    matchKeywords: ['project', 'management', 'leadership', 'organization', 'planning', 'coordination', 'team']
  },
  {
    title: 'Business Analyst',
    category: 'Business / Analytics',
    requiredSkills: ['analytics', 'business', 'data analysis', 'requirements', 'documentation', 'communication'],
    preferredSkills: ['sql', 'excel', 'power bi', 'tableau', 'process improvement', 'stakeholder management'],
    interests: ['business', 'analytics', 'process', 'improvement', 'data', 'strategy'],
    personality: ['analytical', 'communicative', 'detail-oriented', 'problem-solving', 'collaborative'],
    education: ['business', 'information systems', 'analytics', 'management'],
    description: 'Analyzes business processes and requirements to improve efficiency and drive decisions.',
    salaryRange: '$65,000 - $130,000+',
    growth: 'High demand, 14% growth expected',
    matchKeywords: ['business', 'analytics', 'process', 'requirements', 'improvement', 'analysis']
  },
  {
    title: 'DevOps Engineer',
    category: 'Technology / Operations',
    requiredSkills: ['linux', 'cloud', 'automation', 'ci/cd', 'docker', 'kubernetes', 'scripting'],
    preferredSkills: ['aws', 'azure', 'gcp', 'terraform', 'ansible', 'jenkins', 'monitoring'],
    interests: ['infrastructure', 'automation', 'cloud', 'systems', 'deployment', 'scalability'],
    personality: ['technical', 'problem-solving', 'efficiency-focused', 'systematic'],
    education: ['computer science', 'information technology', 'systems engineering'],
    description: 'Manages infrastructure, automation, and deployment pipelines for software systems.',
    salaryRange: '$80,000 - $150,000+',
    growth: 'Very high demand, 21% growth expected',
    matchKeywords: ['devops', 'infrastructure', 'cloud', 'automation', 'deployment', 'systems', 'ci/cd']
  },
  {
    title: 'Cybersecurity Analyst',
    category: 'Technology / Security',
    requiredSkills: ['security', 'networking', 'linux', 'penetration testing', 'risk assessment'],
    preferredSkills: ['python', 'wireshark', 'metasploit', 'siem', 'firewall', 'encryption', 'compliance'],
    interests: ['security', 'hacking', 'networking', 'protection', 'cyber', 'threats'],
    personality: ['analytical', 'detail-oriented', 'security-focused', 'ethical', 'vigilant'],
    education: ['cybersecurity', 'computer science', 'information security'],
    description: 'Protects systems and networks from cyber threats and vulnerabilities.',
    salaryRange: '$75,000 - $145,000+',
    growth: 'Very high demand, 33% growth expected',
    matchKeywords: ['security', 'cybersecurity', 'hacking', 'protection', 'networking', 'threats', 'penetration']
  },
  {
    title: 'Content Writer',
    category: 'Writing / Marketing',
    requiredSkills: ['writing', 'communication', 'creativity', 'research', 'seo', 'content'],
    preferredSkills: ['copywriting', 'blogging', 'social media', 'editing', 'cms', 'analytics'],
    interests: ['writing', 'content', 'creativity', 'communication', 'storytelling', 'research'],
    personality: ['creative', 'communicative', 'curious', 'detail-oriented', 'adaptable'],
    education: ['journalism', 'english', 'communications', 'marketing'],
    description: 'Creates engaging written content for websites, blogs, and marketing materials.',
    salaryRange: '$40,000 - $90,000+',
    growth: 'Steady demand, 9% growth expected',
    matchKeywords: ['writing', 'content', 'blog', 'article', 'copywriting', 'creative writing', 'communication']
  },
  {
    title: 'Graphic Designer',
    category: 'Design',
    requiredSkills: ['design', 'creativity', 'adobe', 'illustrator', 'photoshop', 'visual'],
    preferredSkills: ['indesign', 'figma', 'sketch', 'branding', 'typography', 'layout'],
    interests: ['design', 'art', 'visual', 'creativity', 'aesthetics', 'branding'],
    personality: ['creative', 'visual', 'artistic', 'detail-oriented', 'collaborative'],
    education: ['graphic design', 'visual arts', 'design', 'fine arts'],
    description: 'Creates visual concepts and designs for print, digital, and branding materials.',
    salaryRange: '$45,000 - $85,000+',
    growth: 'Steady demand, 3% growth expected',
    matchKeywords: ['design', 'graphic', 'visual', 'art', 'creative', 'illustration', 'branding']
  },
  {
    title: 'Sales Manager',
    category: 'Sales / Business',
    requiredSkills: ['sales', 'communication', 'negotiation', 'relationship building', 'persuasion'],
    preferredSkills: ['crm', 'lead generation', 'account management', 'presentation', 'closing'],
    interests: ['sales', 'business', 'communication', 'relationships', 'negotiation', 'achievement'],
    personality: ['persuasive', 'communicative', 'goal-oriented', 'resilient', 'relationship-focused'],
    education: ['business', 'marketing', 'sales', 'communications'],
    description: 'Leads sales teams and develops strategies to achieve revenue targets.',
    salaryRange: '$60,000 - $150,000+',
    growth: 'Steady demand, 5% growth expected',
    matchKeywords: ['sales', 'selling', 'business', 'communication', 'negotiation', 'relationships', 'revenue']
  },
  {
    title: 'HR Manager',
    category: 'Human Resources',
    requiredSkills: ['human resources', 'recruitment', 'communication', 'employee relations', 'hiring'],
    preferredSkills: ['hris', 'talent management', 'training', 'compensation', 'labor law'],
    interests: ['people', 'recruitment', 'talent', 'employee relations', 'organizational development'],
    personality: ['empathetic', 'communicative', 'organized', 'people-focused', 'confidential'],
    education: ['human resources', 'business', 'psychology', 'organizational development'],
    description: 'Manages recruitment, employee relations, and organizational development.',
    salaryRange: '$65,000 - $130,000+',
    growth: 'Steady demand, 7% growth expected',
    matchKeywords: ['hr', 'human resources', 'recruitment', 'hiring', 'talent', 'people', 'employee']
  },
  {
    title: 'Research Scientist',
    category: 'Research / Science',
    requiredSkills: ['research', 'analytics', 'scientific method', 'data analysis', 'experimentation'],
    preferredSkills: ['python', 'r', 'statistics', 'publication', 'grants', 'lab work'],
    interests: ['research', 'science', 'discovery', 'experimentation', 'analysis', 'innovation'],
    personality: ['curious', 'analytical', 'detail-oriented', 'patient', 'systematic'],
    education: ['science', 'research', 'phd', 'masters', 'laboratory'],
    description: 'Conducts scientific research and experiments to advance knowledge in a field.',
    salaryRange: '$70,000 - $140,000+',
    growth: 'Steady demand, 8% growth expected',
    matchKeywords: ['research', 'science', 'experiment', 'laboratory', 'discovery', 'analysis', 'scientific']
  }
];

// ── TBS Career Advisor: Major Selection & Job Matching ──────
// ── Career Support Handler (major/college guidance) ─────────
function provideCareerSupport(fullInput, studentProfile = null, originalMessage = '') {
  const msg = originalMessage.toLowerCase();
  // Only respond to college/major queries
  if (isMajorSelectionQuery(msg) || msg.includes('college') || msg.includes('major') || msg.includes('career support')) {
    // Pass ONLY the original message to avoid regex parsing issues on accumulated history
    return analyzeMajorSelection(msg, studentProfile);
  }
  return `🎓 **College & Major Guidance**\n\nI specialize in helping students choose majors and plan their college journey. Ask me about which major fits your interests, GPA requirements, or how to balance college options.`;
}

// ── Academic Support Handler (fallback for n8n) ─────────────
function provideAcademicSupport(userInput, studentProfile = null, originalMessage = '') {
  // For simplicity we base all decisions on the **current message**; history
  // is not used in the demo handler.  That avoids accidental mis‑fires and
  // keeps the behaviour predictable.
  const msg = originalMessage.toLowerCase().trim();
  const studentName = studentProfile?.name || 'student';

  // --- keyword / pattern lists ------------------------------------------------
  const conceptPatterns = [
    /what\s+(is|are|does|do)/,
    /how\s+(does|do|to)/,
    /explain/, /define/, /describe/, /why/, /difference/, /theory/, /purpose/
  ];
  const studyPatterns = [/study/, /prepare/, /exam/, /quiz/, /test/, /homework/, /assignment/, /project/, /grade/, /gpa/];
  const coursePatterns = [/course/, /class/, /subject/, /syllabus/, /professor/, /credit/, /requirement/];
  const helpPattern = /help|can you|need help|struggling|how to/;

  const askingForConcept = conceptPatterns.some(r => r.test(msg));
  const aboutStudying = studyPatterns.some(r => r.test(msg));
  const aboutCourse = coursePatterns.some(r => r.test(msg));
  const askingForHelp = helpPattern.test(msg);

  // --- response selection -----------------------------------------------------
  if (askingForConcept) {
    return `Great question! Let me break that down for you, ${studentName}.

Start with the big idea, then follow the steps. What part should I explain first?`;
  }

  if (aboutStudying && aboutCourse) {
    return `${studentName}, let's tackle your studying strategy.

• What topics will the exam/assignment cover?
• Have you practised with past papers?
• When is the deadline?

Tell me a bit more and I'll help you plan.`;
  }

  if (aboutCourse) {
    return `Sounds like you're talking about a course or class, ${studentName}.

Are you:
• Choosing courses to take?
• Struggling with the material?
• Wondering how classes fit together?

Give me a few details so I can assist.`;
  }

  if (askingForHelp) {
    return `I'm happy to help, ${studentName}!

What course/topic are you working on, and what's confusing you? What have you tried already?`;
  }

  if (msg.length < 15) {
    return `Hi ${studentName}! I'm your academic support agent.

Ask me anything about courses, studying, or concepts and I'll do my best to explain.`;
  }

  // fallback generic responses (randomized to keep the conversation natural)
  const academicResponses = [
    `That's a thoughtful question, ${studentName}. Where are you getting stuck?`,
    `I appreciate your curiosity, ${studentName}. Can you share more context?`,
    `Let's break it down together, ${studentName}. What part is most confusing?`,
  ];
  return academicResponses[Math.floor(Math.random() * academicResponses.length)];
}

// ── Emotional Support Handler ────────────────────────────────
function provideEmotionalSupport(userInput, studentProfile = null, originalMessage = '') {
  // make decisions solely based on the current message for demo mode
  const msg = originalMessage.toLowerCase().trim();
  const studentName = studentProfile?.name || 'friend';

  // pattern dictionary for readability
  const patterns = {
    burnout: /burnout|exhausted|tired|fatigue|can't handle|too much|unable|fail|failure|depressed|sad|lonely/,
    stress: /stress|anxious|anxiety|overwhelm|overwhelmed|pressure|burden|struggle|difficult|hard|tough|worried|scared/,
    excitement: /excited|happy|proud|thrilled|amazing|great|wonderful|fantastic|success|achieved|passed|good grade/,
    course: /course|class|exam|assignment|project|test|homework|deadline|paper/,
    social: /friend|social|people|alone|lonely|relationship|family|roommate/,
    health: /sleep|eat|exercise|health|body|physical|sick|energy/,
    career: /career|major|future|job|internship|gpa|grade|path/,
  };

  const detected = {};
  for (const k in patterns) detected[k] = patterns[k].test(msg);

  // ordered branching keeps responses deterministic and context-aware
  if (detected.excitement) {
    const exciteResponses = [
      `🎉 ${studentName}! TELL ME EVERYTHING! What happened? This is amazing!`,
      `YES! ${studentName}! 🌟 You did it! How does it feel? You should let yourself really feel proud.`,
      `✨ This is huge, ${studentName}! What's the story—how did you make this happen? I want to know!`,
    ];
    return exciteResponses[Math.floor(Math.random() * exciteResponses.length)];
  }

  if (detected.burnout) {
    const burnoutResponses = [
      `💙 Burnout is a real signal that something needs to change, ${studentName}.

When you say you're exhausted, what would feel like the quickest win today?

• Skip one thing?
• Ask for help with something?
• Just take a break?

Let's pick one.`,
      `I'm genuinely concerned about how you're feeling, ${studentName}. You can't keep running on empty.

**Right now**: What's ONE task you could remove from your plate this week? Not forever—just this week.

You deserve rest.`,
      `${studentName}, exhaustion is telling you something important. Listen to it.

Let me ask: Are you burned out because of the workload, or because nothing feels meaningful? That changes what we should focus on.`,
    ];
    return burnoutResponses[Math.floor(Math.random() * burnoutResponses.length)];
  }

  if (detected.stress) {
    if (detected.course) {
      return `That course stress is real, ${studentName}.

Talk me through it:
• Is it ONE assignment that's stressing you, or the whole course?
• What deadline is closest?

Let's start with the most urgent thing.`;
    }
    if (detected.career) {
      return `Career stress can feel paralyzing, ${studentName}.

Here's what I'm curious about: Are you stressed about:
1. **Choosing the right path?** (Not sure what you want)
2. **Getting there?** (Know what you want, worried you can't do it)
3. **Competition?** (Worried others are ahead)

That matters for how we tackle this.`;
    }
    if (detected.social) {
      return `Social stress often goes unspoken, ${studentName}. I appreciate you bringing it up.

Is this about:
• Feeling disconnected from people?
• Conflict with someone?
• Loneliness?

What do you need right now?`;
    }
    return `I hear you, ${studentName}. Stress is a sign something matters to you.

**The real question**: What's ONE thing that if it went away today, would change your whole week?

Focus there.`;
  }

  if (detected.health) {
    return `The basics matter SO much right now, ${studentName}.

I'm asking seriously: When's the last time you had a full night's sleep? Or a real meal?

Which one would help you most this week:
• Better sleep?
• Eating more regularly?
• Moving your body?

Pick one to focus on.`;
  }

  if (detected.social) {
    return `Connection is medicine, ${studentName}.

Are you:
• Feeling disconnected?
• Missing close friends?
• Struggling in a relationship?

What would make you feel less alone?`;
  }

  if (detected.career) {
    return `Career stuff weighs heavy, ${studentName}.

What's on your mind right now? Picking a major? Worried about grades? Thinking about after graduation?

Just one thing at a time.`;
  }

  if (msg.length < 10) {
    return `${studentName}, I'm here to listen. You don't have to have it all figured out.

What brought you here today? What's on your heart?`;
  }

  const genericResponses = [
    `💬 Thanks for opening up, ${studentName}. What you're feeling matters.

Can you tell me what would help you most right now?`,
    `👂 I'm really listening, ${studentName}.

Take your time. What's weighing on you the most?`,
    `💭 I appreciate your honesty, ${studentName}.

What would make today feel better—even just a little bit?`,
  ];
  return genericResponses[Math.floor(Math.random() * genericResponses.length)];
}

function analyzeCareerMatch(userInput, studentProfile = null, originalMessage = '') {
  // Career Advisor strictly does job matching now - use original message only
  const input = originalMessage.toLowerCase().trim() || userInput.toLowerCase();
  return analyzeJobMatch(input, studentProfile);
}
  

// ── Helper: Detect if query is about major selection ────────
function isMajorSelectionQuery(input) {
  const majorKeywords = [
    'major', 'specialization', 'choose', 'select', 'which major', 'best major',
    'sophomore', 'second year', 'gpa', 'grade', 'which one to pick',
    'help me choose', 'recommend major'
  ];
  return majorKeywords.some(kw => input.includes(kw));
}

// ── Helper: Detect if query is about courses ────────────────
function isCourseQuery(input) {
  const courseKeywords = [
    'course', 'class', 'subject', 'upload', 'help with', 'understand',
    'assignment', 'exam', 'credit', 'requirement', 'bcor', 'course content'
  ];
  return courseKeywords.some(kw => input.includes(kw));
}

// ── TBS Major Selection Analysis ─────────────────────────────
function analyzeMajorSelection(userInput, studentProfile = null) {
  const input = userInput.toLowerCase();
  // Use passed studentProfile or extract from current input
  const userProfile = studentProfile || extractUserProfile(input);
  
  // Extract GPA if mentioned in current input, or use from studentProfile
  const gpaMatch = userInput.match(/gpa[:\s]*([0-9.]+)/i);
  const userGPA = gpaMatch ? parseFloat(gpaMatch[1]) : (studentProfile?.gpa || null);
  
  // Score each TBS major
  const majorScores = Object.entries(TBS_INFO.majors).map(([key, major]) => {
    let score = 0;
    const reasons = [];
    
    // GPA check (if provided)
    if (userGPA !== null) {
      if (userGPA >= major.min_gpa) {
        score += 10;
        reasons.push(`✓ Your GPA ${userGPA} meets the major requirement (min ${major.min_gpa})`);
      } else {
        score -= 20;
        reasons.push(`✗ Your GPA ${userGPA} is below the major requirement (min ${major.min_gpa})`);
      }
    } else {
      score += 5; // Neutral if no GPA mentioned
    }
    
    // Skill interest matching
    const skillMatches = major.skills.filter(skill => 
      input.includes(skill.toLowerCase()) || 
      userProfile.interests.some(interest => skill.toLowerCase().includes(interest))
    );
    score += skillMatches.length * 8;
    if (skillMatches.length > 0) {
      reasons.push(`📊 Your interests align with: ${skillMatches.join(', ')}`);
    }
    
    // Course-specific keywords
    const courseKeywords = {
      accounting: ['accounting', 'audit', 'tax', 'financial reporting', 'numbers', 'accuracy'],
      finance: ['finance', 'investment', 'money', 'trading', 'markets', 'portfolio'],
      business_analytics: ['analytics', 'data', 'analysis', 'patterns', 'insights', 'business intelligence'],
      information_technology: ['technology', 'coding', 'programming', 'systems', 'it', 'software', 'tech'],
      marketing: ['marketing', 'brand', 'customers', 'social media', 'advertising', 'creative']
    };
    
    const matchingKeywords = courseKeywords[key].filter(kw => input.includes(kw));
    score += matchingKeywords.length * 6;
    if (matchingKeywords.length > 0) {
      reasons.push(`🎯 Related to your interests: ${matchingKeywords.join(', ')}`);
    }
    
    return { key, major, score, reasons };
  });
  
  // Sort by score
  majorScores.sort((a, b) => b.score - a.score);
  
  let response = `🎓 **TBS MAJOR SELECTION GUIDANCE**\n\n`;
  
  if (majorScores[0].score > 0) {
    const top3 = majorScores.slice(0, 3);
    
    response += `**📌 Top Recommendations for You:**\n\n`;
    
    top3.forEach((item, idx) => {
      response += `${idx + 1}. **${item.major.name}** ${idx === 0 ? '⭐' : ''}\n`;
      response += `   ${item.major.description}\n`;
      response += `   📚 Required Courses: ${item.major.required_courses.join(', ')}\n`;
      response += `   💼 Career Paths: ${item.major.careers.slice(0, 3).join(', ')}...\n`;
      response += `   Key Skills: ${item.major.skills.slice(0, 2).join(', ')}\n`;
      item.reasons.forEach(reason => response += `   ${reason}\n`);
      response += `\n`;
    });
  } else {
    response += `I'd love to help! Please share:\n`;
    response += `- Your cumulative GPA\n`;
    response += `- Subjects you enjoy (e.g., "I like coding and data")\n`;
    response += `- Your career interests\n\n`;
  }
  
  response += `**ℹ️ Important Requirements:**\n`;
  response += `- Must complete 66+ credits to declare a major\n`;
  response += `- Maintain 2.0+ GPA in both cumulative and specialized courses\n`;
  response += `- Each major requires specific prerequisite courses\n`;
  
  return response;
}

// ── TBS Course Help ──────────────────────────────────────────
function analyzeCourseHelp(userInput, studentProfile = null) {
  const input = userInput.toLowerCase();
  
  let response = `📚 **TBS COURSE SUPPORT**\n\n`;
  
  // Use student profile if available for personalization
  if (studentProfile && (studentProfile.name || studentProfile.major || studentProfile.year)) {
    response += `Hello ${studentProfile.name || 'there'}!`;
    if (studentProfile.year) response += ` (${studentProfile.year})`;
    response += `\n`;
    if (studentProfile.major) response += `I see you're in ${studentProfile.major}. `;
    response += `\n\n`;
  }
  
  // Check which major they're asking about
  let mentionedMajor = studentProfile?.major || null;
  
  // If not in profile, check current input
  if (!mentionedMajor) {
    for (const [key, major] of Object.entries(TBS_INFO.majors)) {
      if (input.includes(major.name.toLowerCase()) || input.includes(key.replace(/_/g, ' '))) {
        mentionedMajor = key;
        break;
      }
    }
  }
  
  if (mentionedMajor) {
    const major = TBS_INFO.majors[mentionedMajor];
    response += `**${major.name} Program**\n\n`;
    response += `${major.description}\n\n`;
    response += `**Required Foundation Courses:**\n`;
    major.required_courses.forEach(course => response += `- ${course}\n`);
    response += `\n**Total Credits:** ${major.credits}\n`;
    response += `**Essential Skills:** ${major.skills.join(', ')}\n\n`;
  }
  
  response += `**General TBS Program Structure:**\n`;
  response += `- Business Core: 42 credits\n`;
  response += `- Major Courses: 36 credits\n`;
  response += `- Minor Courses: 15 credits (optional)\n`;
  response += `- Non-Business: 13 credits\n`;
  response += `- Computer Science: 12 credits\n`;
  response += `- Senior Project/Internship: 12 credits\n`;
  response += `- **Total: 130 credits**\n\n`;
  
  response += `**📋 Academic Rules:**\n`;
  response += `- Minimum 2.0 GPA to progress\n`;
  response += `- Maximum 4 absences per course\n`;
  response += `- Strict plagiarism/cheating policies\n`;
  response += `- Internship required (12-credit full-time OR 6-credit project + electives)\n`;
  
  if (input.includes('upload') || input.includes('help')) {
    response += `\n**💡 How I Can Help:**\n`;
    response += `You can upload course materials (syllabi, assignments, notes) and I'll:\n`;
    response += `- Explain difficult concepts\n`;
    response += `- Help with assignments and projects\n`;
    response += `- Prepare you for exams\n`;
    response += `- Connect course content to career applications\n`;
  }
  
  return response;
}

// ── Job Matching (aligned with TBS majors) ───────────────────
function analyzeJobMatch(userInput, studentProfile = null) {
  const input = userInput.toLowerCase();
  
  // Use cached studentProfile if available, otherwise extract from input
  // Ensure we always have arrays for skills and interests
  const baseProfile = studentProfile || {};
  const extracted = extractUserProfile(input);
  const userProfile = {
    skills: [],
    interests: [],
    strengths: [],
    experience: [],
    // copy any existing fields from baseProfile
    ...baseProfile,
    // override with extracted lists only if baseProfile doesn't include them
    skills: baseProfile.skills || extracted.skills || [],
    interests: baseProfile.interests || extracted.interests || [],
    strengths: baseProfile.strengths || extracted.strengths || [],
    experience: baseProfile.experience || extracted.experience || []
  };
  
  // First, suggest a TBS major that aligns with their interests
  let majorSuggestion = null;
  const majorMatches = {};
  
  for (const [key, major] of Object.entries(TBS_INFO.majors)) {
    let majorScore = 0;
    const careerMatches = major.careers.filter(career => 
      input.includes(career.toLowerCase())
    );
    majorScore += careerMatches.length * 15;
    
    major.skills.forEach(skill => {
      if (input.includes(skill.toLowerCase())) majorScore += 10;
    });
    
    majorMatches[key] = majorScore;
  }
  
  const bestMajor = Object.entries(majorMatches).reduce((best, [key, score]) => 
    score > best[1] ? [key, score] : best
  );
  
  if (bestMajor[1] > 0) {
    majorSuggestion = bestMajor[0];
  }
  
  // Score each job
  const jobScores = JOB_DATABASE.map(job => {
    let score = 0;
    const matches = [];
    
    // Skill matching (40% weight)
    const skillMatches = job.requiredSkills.filter(skill => 
      input.includes(skill.toLowerCase()) || 
      userProfile.skills.some(us => us.includes(skill.toLowerCase()) || skill.toLowerCase().includes(us))
    );
    const preferredMatches = job.preferredSkills.filter(skill => 
      input.includes(skill.toLowerCase()) || 
      userProfile.skills.some(us => us.includes(skill.toLowerCase()) || skill.toLowerCase().includes(us))
    );
    
    score += skillMatches.length * 10;
    score += preferredMatches.length * 5;
    
    if (skillMatches.length > 0) {
      matches.push(`Skills: ${skillMatches.join(', ')}`);
    }
    
    // Interest matching (25% weight)
    const interestMatches = job.interests.filter(interest => 
      input.includes(interest.toLowerCase()) || 
      userProfile.interests.some(ui => ui.includes(interest.toLowerCase()) || interest.toLowerCase().includes(ui))
    );
    score += interestMatches.length * 8;
    
    if (interestMatches.length > 0) {
      matches.push(`Interests: ${interestMatches.join(', ')}`);
    }
    
    // Keyword matching (20% weight)
    const keywordMatches = job.matchKeywords.filter(keyword => 
      input.includes(keyword.toLowerCase())
    );
    score += keywordMatches.length * 6;
    
    // Personality matching (10% weight)
    const personalityMatches = job.personality.filter(trait => 
      input.includes(trait.toLowerCase())
    );
    score += personalityMatches.length * 3;
    
    // Education matching (5% weight)
    const educationMatches = job.education.filter(edu => 
      input.includes(edu.toLowerCase())
    );
    score += educationMatches.length * 2;
    
    // TBS major alignment bonus
    if (majorSuggestion) {
      const tbsCareers = TBS_INFO.career_pathways[majorSuggestion];
      if (tbsCareers && tbsCareers.some(career => job.title.includes(career) || career.includes(job.title.split(' ')[0]))) {
        score += 15;
        matches.push(`🎓 Aligns with TBS ${TBS_INFO.majors[majorSuggestion].name} major`);
      }
    }
    
    return {
      job,
      score,
      matches,
      skillMatches: skillMatches.length,
      interestMatches: interestMatches.length,
      keywordMatches: keywordMatches.length
    };
  });
  
  // Sort by score
  jobScores.sort((a, b) => b.score - a.score);
  
  // Get top 3 matches
  const topMatches = jobScores.slice(0, 3);
  
  // Generate response
  let response = '🎯 **CAREER MATCHING ANALYSIS**\n\n';
  
  // Personalize intro with student profile if available
  if (studentProfile && studentProfile.name) {
    response += `Hello ${studentProfile.name}! `;
  }
  
  response += `Based on your profile, here are the most suited career paths for you:\n\n`;
  
  topMatches.forEach((match, index) => {
    const { job, score, matches, skillMatches, interestMatches } = match;
    const matchPercentage = Math.min(100, Math.round((score / 100) * 100));
    
    response += `**${index + 1}. ${job.title}** (${matchPercentage}% match)\n`;
    response += `   📋 Category: ${job.category}\n`;
    response += `   💼 Description: ${job.description}\n`;
    response += `   💰 Salary Range: ${job.salaryRange}\n`;
    response += `   📈 Growth: ${job.growth}\n`;
    
    if (skillMatches > 0) {
      response += `   ✅ Skills Match: ${skillMatches} required skills identified\n`;
    }
    if (interestMatches > 0) {
      response += `   ✅ Interests Match: ${interestMatches} interests aligned\n`;
    }
    
    if (matches.length > 0) {
      response += `   🔍 Key Matches: ${matches.slice(0, 2).join(' | ')}\n`;
    }
    
    response += `\n`;
  });
  
  // Add recommendations
  const bestMatch = topMatches[0];
  response += `---\n`;
  response += `**💡 RECOMMENDATION:**\n`;
  response += `Based on my analysis, **${bestMatch.job.title}** appears to be the best fit for you.\n\n`;
  
  // Show what's needed
  const missingSkills = bestMatch.job.requiredSkills.filter(skill => 
    !input.includes(skill.toLowerCase()) && 
    !userProfile.skills.some(us => us.includes(skill.toLowerCase()))
  );
  
  if (missingSkills.length > 0) {
    response += `**To strengthen your profile for this role:**\n`;
    response += `• Consider developing: ${missingSkills.slice(0, 3).join(', ')}\n`;
    response += `• Education: ${bestMatch.job.education.slice(0, 2).join(' or ')} background preferred\n`;
  }
  
  response += `\n*This analysis is based on current job market requirements and your provided profile.*`;
  
  return response;
}

// ── Extract User Profile from Input ─────────────────────────
function extractUserProfile(input) {
  const profile = {
    skills: [],
    interests: [],
    strengths: [],
    experience: []
  };
  
  // Common skill patterns
  const skillPatterns = [
    /(?:i\s+)?(?:am\s+)?(?:good\s+at|know|can|expert\s+in|skilled\s+in|proficient\s+in)\s+([^.,!?]+)/gi,
    /(?:my\s+)?(?:skills?\s+(?:are|include)|i\s+(?:have|know))\s+([^.,!?]+)/gi,
    /(?:i\s+)?(?:work\s+with|use|experience\s+with)\s+([^.,!?]+)/gi
  ];
  
  skillPatterns.forEach(pattern => {
    const matches = input.matchAll(pattern);
    for (const match of matches) {
      const skills = match[1].split(/[,\s]+and\s+|[,\s]+/).map(s => s.trim().toLowerCase());
      profile.skills.push(...skills.filter(s => s.length > 2));
    }
  });
  
  // Interest patterns
  const interestPatterns = [
    /(?:i\s+)?(?:am\s+)?(?:interested\s+in|like|enjoy|love|passionate\s+about)\s+([^.,!?]+)/gi,
    /(?:my\s+)?(?:interests?\s+(?:are|include))\s+([^.,!?]+)/gi
  ];
  
  interestPatterns.forEach(pattern => {
    const matches = input.matchAll(pattern);
    for (const match of matches) {
      const interests = match[1].split(/[,\s]+and\s+|[,\s]+/).map(s => s.trim().toLowerCase());
      profile.interests.push(...interests.filter(s => s.length > 2));
    }
  });
  
  // Extract direct mentions of technologies/skills
  const techKeywords = [
    'javascript', 'python', 'java', 'react', 'node', 'sql', 'html', 'css',
    'design', 'marketing', 'sales', 'finance', 'writing', 'management',
    'analytics', 'data', 'security', 'cloud', 'devops'
  ];
  
  techKeywords.forEach(keyword => {
    if (input.includes(keyword)) {
      profile.skills.push(keyword);
    }
  });
  
  return profile;
}

// ── Serve SPA routes ───────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start Server ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 AI Agent Hub running at http://localhost:${PORT}\n`);
  console.log('Configured webhooks:');
  Object.entries(AGENTS).forEach(([id, agent]) => {
    const url = process.env[agent.webhookEnv];
    console.log(`  ${agent.name}: ${url || '⚠️  NOT SET (fallback mode)'}`);
  });
  console.log('');
});
