# Session Memory Architecture Diagrams

## 1. Overall System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         BROWSER / FRONTEND                      │
│                      (public/js/chat.js)                        │
│                                                                 │
│  User Input → [Generate/Use sessionId] → Send Message           │
│                                                                 │
│  Request Body:                                                  │
│  {                                                              │
│    sessionId: "abc-123-def-456",                               │
│    agentId: "data-analyst",                                    │
│    message: "I'm Sarah with 3.5 GPA"                           │
│  }                                                              │
└────────────────────┬────────────────────────────────────────────┘
                     │ POST /api/chat
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│                    NODE.JS BACKEND (server.js)                  │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  /api/chat Endpoint                                        │ │
│  │  1. Get or Create Session (from SESSION_STORE)           │ │
│  │  2. Extract Info (extractStudentInfo)                    │ │
│  │  3. Update Profile (studentProfile.update)              │ │
│  │  4. Store Message (session.addMessage)                  │ │
│  │  5. Build Context (profile + history + message)         │ │
│  │  6. Analyze (with studentProfile parameter)            │ │
│  │  7. Return Response (+ profile summary)                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  SESSION_STORE (In-Memory Database)                       │ │
│  │                                                            │ │
│  │  {                                                         │ │
│  │    "abc-123-def-456": ConversationSession {              │ │
│  │      sessionId: "abc-123-def-456",                       │ │
│  │      agentId: "data-analyst",                           │ │
│  │      studentProfile: StudentProfile {                   │ │
│  │        name: "Sarah",                                   │ │
│  │        gpa: 3.5,                                        │ │
│  │        major: "finance",                                │ │
│  │        interests: ["finance"]                           │ │
│  │      },                                                  │ │
│  │      messages: [                                         │ │
│  │        {role: "user", content: "..."},                 │ │
│  │        {role: "assistant", content: "..."}             │ │
│  │      ]                                                   │ │
│  │    },                                                    │ │
│  │    "xyz-789-abc-123": ConversationSession { ... }       │ │
│  │  }                                                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Auto-Cleanup (Every Hour):                                    │
│  Remove sessions where (now - lastActivityAt) > 24 hours       │
│                                                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │ Response
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│                         BROWSER / FRONTEND                      │
│                                                                 │
│  Response:                                                      │
│  {                                                              │
│    response: "Sarah, with your 3.5 GPA...",                   │
│    studentProfile: {                                           │
│      name: "Sarah",                                           │
│      gpa: 3.5,                                               │
│      major: "finance",                                       │
│      interests: ["finance"]                                 │
│    }                                                          │
│  }                                                            │
│                                                               │
│  Display response & profile to user                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Flow Within Single Message

```
User Message: "I'm Ahmed, 3.5 GPA, interested in Finance"
        ↓
┌─────────────────────────────────────┐
│  extractStudentInfo()               │
│  (Regex-based parsing)              │
└────────────────┬────────────────────┘
        ↓
  Extracted: {
    name: "Ahmed",
    gpa: 3.5,
    interests: ["finance"]
  }
        ↓
┌─────────────────────────────────────┐
│  studentProfile.update(extracted)   │
│  Merges with existing profile       │
└────────────────┬────────────────────┘
        ↓
  Updated Profile: {
    name: "Ahmed",
    gpa: 3.5,
    major: null,
    interests: ["finance"],
    year: null,
    ...
  }
        ↓
┌─────────────────────────────────────┐
│  session.addMessage()               │
│  Stores in conversation history     │
└────────────────┬────────────────────┘
        ↓
  Messages: [
    {user message},
    {old assistant message},
    {old user message}
  ]
        ↓
┌─────────────────────────────────────┐
│  buildContextAwareMessage()         │
│  Combines profile + history + msg   │
└────────────────┬────────────────────┘
        ↓
  Context: "[STUDENT CONTEXT: Name: Ahmed | GPA: 3.5 | 
             Interests: finance]
             [CONVERSATION HISTORY]
             Previous messages...
             [CURRENT MESSAGE]
             I'm Ahmed, 3.5 GPA..."
        ↓
┌─────────────────────────────────────┐
│  analyzeCareerMatch(context, profile)
│  Uses profile for routing           │
└────────────────┬────────────────────┘
        ↓
  Response: "Ahmed, with your 3.5 GPA 
             and finance interests, ..."
        ↓
┌─────────────────────────────────────┐
│  session.addMessage('assistant', msg)
│  Stores response                    │
└────────────────┬────────────────────┘
        ↓
  Return to browser
```

---

## 3. StudentProfile Object Structure

```
StudentProfile {
  ├─ name: String | null
  │   └─ Extracted from: "my name is", "i'm", "call me"
  │
  ├─ gpa: Number | null
  │   └─ Extracted from: "gpa: 3.5", "my gpa is"
  │
  ├─ year: String | null
  │   ├─ freshman
  │   ├─ sophomore
  │   ├─ junior
  │   └─ senior
  │
  ├─ major: String | null
  │   ├─ accounting
  │   ├─ finance
  │   ├─ it
  │   ├─ business_analytics
  │   └─ marketing
  │
  ├─ minor: String | null
  │   └─ Optional secondary major
  │
  ├─ interests: String[]
  │   ├─ "finance"
  │   ├─ "coding"
  │   ├─ "data"
  │   └─ ... (multiple interests)
  │
  ├─ courses: String[]
  │   ├─ "Intro to Accounting"
  │   ├─ "Financial Analysis"
  │   └─ ... (completed courses)
  │
  ├─ grades: Object
  │   ├─ "Accounting": "A"
  │   ├─ "Finance": "B+"
  │   └─ ... (course grades)
  │
  └─ skills: String[]
      ├─ "analytical"
      ├─ "coding"
      └─ ... (identified skills)

Methods:
├─ update(extractedInfo)
│   └─ Merge new data into profile
└─ getSummary()
    └─ Return formatted profile object
```

---

## 4. ConversationSession Object Structure

```
ConversationSession {
  ├─ sessionId: String (UUID)
  │   └─ Unique identifier for browser session
  │
  ├─ agentId: String
  │   ├─ data-analyst
  │   ├─ code-assistant
  │   ├─ research-analyst
  │   └─ creative-writer
  │
  ├─ studentProfile: StudentProfile
  │   └─ Stores accumulated student info
  │
  ├─ messages: Array<Message>
  │   ├─ Message {
  │   │   ├─ role: "user" | "assistant"
  │   │   ├─ content: String
  │   │   └─ timestamp: Number
  │   │ }
  │   └─ ... (all messages in order)
  │
  ├─ createdAt: Number (timestamp)
  │   └─ When session was created
  │
  └─ lastActivityAt: Number (timestamp)
      └─ When last message was received

Methods:
├─ addMessage(role, content)
│   └─ Append message to history
├─ getConversationContext(lastN)
│   └─ Get last N messages as string
└─ isExpired()
    └─ Check if > 24 hours old
```

---

## 5. Message Flow Sequence Diagram

```
Browser                 Server              SESSION_STORE
   │                       │                      │
   │ POST /api/chat        │                      │
   ├──────sessionId────────→│                      │
   │                       │                      │
   │                       │ getOrCreateSession() │
   │                       ├─────────────────────→│
   │                       │ Returns session or   │
   │                       │ creates new one      │
   │                       │←────────────────────┤
   │                       │                      │
   │                       │ extractStudentInfo()│
   │                       │ Parse message       │
   │                       │                      │
   │                       │ studentProfile.update()
   │                       │ Merge data          │
   │                       │                      │
   │                       │ addMessage(user)    │
   │                       │ Store input         │
   │                       │                      │
   │                       │ buildContext()      │
   │                       │ Profile + history   │
   │                       │                      │
   │                       │ analyzeCareerMatch()│
   │                       │ With studentProfile │
   │                       │                      │
   │                       │ addMessage(assistant)
   │                       │ Store response      │
   │                       │                      │
   │ ← response + profile ─┤                      │
   │                       │                      │
Display response & profile │                      │
with personalization      │                      │
```

---

## 6. Session Lifetime Timeline

```
TIME: 0 seconds
User opens chat
sessionId = crypto.randomUUID()
│
├─ POST /api/chat (sessionId)
│  ├─ SESSION_STORE["abc-123..."] = new ConversationSession()
│  ├─ studentProfile = {}
│  └─ messages = []
│
├─ Message 1: "I'm Sarah"
│  ├─ Extract: {name: "Sarah"}
│  ├─ Profile updates: {name: "Sarah"}
│  └─ Messages: [{user}, {assistant}]
│
├─ Message 2: "3.5 GPA"
│  ├─ Extract: {gpa: 3.5}
│  ├─ Profile updates: {name: "Sarah", gpa: 3.5}
│  └─ Messages: [{user}, {assistant}, {user}, {assistant}]
│
├─ Message 3: "Finance interests"
│  ├─ Extract: {interests: ["finance"]}
│  ├─ Profile updates: {name: "Sarah", gpa: 3.5, interests: ["finance"]}
│  └─ Messages grows to 6 items

TIME: 1 hour
Auto-cleanup runs
└─ Session still active (lastActivityAt updated)

TIME: 24 hours
No new messages
├─ SESSION_STORE["abc-123..."].lastActivityAt = old timestamp
└─ Session marked for removal

TIME: 25 hours
Auto-cleanup runs
├─ if (now - lastActivityAt > 24 hours)
│  └─ delete SESSION_STORE["abc-123..."]
└─ Session removed from memory
```

---

## 7. Information Extraction Pattern Matching

```
Input: "My name is Ahmed and I have a 3.5 GPA. 
         I'm a sophomore interested in Finance and coding"

         ↓

Regex Pattern Matching:

1. NAME PATTERNS:
   ✓ "my name is Ahmed" → "Ahmed"
   ✓ "i'm Ahmed" → "Ahmed"
   ✓ "call me Ahmed" → "Ahmed"

2. GPA PATTERNS:
   ✓ "have a 3.5 GPA" → 3.5
   ✓ "gpa: 3.5" → 3.5
   ✓ "my gpa is 3.5" → 3.5

3. YEAR PATTERNS:
   ✓ "sophomore" → "sophomore"
   ✓ "year 2" → "sophomore"
   ✓ "second year" → "sophomore"

4. MAJOR PATTERNS:
   ✓ "Finance" → matches TBS major → "finance"

5. INTEREST PATTERNS:
   ✓ "Finance" → ["finance"]
   ✓ "coding" → ["coding"]

         ↓

Extracted Data:
{
  name: "Ahmed",
  gpa: 3.5,
  year: "sophomore",
  major: "finance",
  interests: ["finance", "coding"],
  skills: [],
  courses: [],
  grades: {}
}

         ↓

StudentProfile Updated:
profile = {
  name: "Ahmed",           ← NEW
  gpa: 3.5,                ← NEW
  year: "sophomore",       ← NEW
  major: "finance",        ← NEW
  interests: ["finance", "coding"],  ← NEW
  skills: [],
  courses: [],
  grades: {},
  minor: null
}
```

---

## 8. Analysis Function Call Chain

```
/api/chat Endpoint receives message
         ↓
         ├─ Session retrieved/created
         ├─ Student info extracted
         ├─ Profile updated
         ├─ Message stored
         ├─ Context built
         ↓
    analyzeCareerMatch(contextMessage, studentProfile)
         │
         ├─ Check if major selection query
         │  ├─ YES → analyzeMajorSelection(msg, profile)
         │  │        Uses: profile.gpa, profile.interests
         │  │        Returns: Major recommendations
         │  └─
         │
         ├─ Check if course help query
         │  ├─ YES → analyzeCourseHelp(msg, profile)
         │  │        Uses: profile.major, profile.year
         │  │        Returns: Course guidance
         │  └─
         │
         └─ Otherwise → analyzeJobMatch(msg, profile)
                        Uses: profile.gpa, profile.interests, profile.major
                        Returns: Career recommendations

         ↓

Response sent back to browser with:
- Generated response text
- Student profile summary
```

---

## 9. Multi-Message Conversation Example

```
MESSAGE 1: "Hi, I'm Jordan, 3.7 GPA"
   Input → Extract {name: "Jordan", gpa: 3.7}
   Profile: {name: "Jordan", gpa: 3.7, ...}
   Response: "Hi Jordan! What can I help you with?"
   ✓ SESSION_STORE updated

MESSAGE 2: "I'm a junior interested in IT"
   Input → Extract {year: "junior", major: "it", interests: ["it"]}
   Profile: {name: "Jordan", gpa: 3.7, year: "junior", major: "it", interests: ["it"], ...}
   Context built: [STUDENT CONTEXT: Name: Jordan | GPA: 3.7 | Year: junior | Major: it]
   Response: "Jordan, as a junior IT major with 3.7 GPA, you're well-positioned for..."
   ✓ SESSION_STORE updated
   ✓ Session learns more about Jordan

MESSAGE 3: "What jobs are best for me?"
   Input: "What jobs are best for me?"
   Profile NOT extracted (no new info in this message)
   Profile REMAINS: {name: "Jordan", gpa: 3.7, year: "junior", major: "it", interests: ["it"]}
   Context: [STUDENT CONTEXT: Name: Jordan | GPA: 3.7 | Year: junior | Major: it | Interests: it]
   Response: "Jordan, with your IT major and 3.7 GPA, here are the best opportunities:
             [Recommendations based on all three previous pieces of info]"
   ✓ Profile is used even though not mentioned in this message
   ✓ No need to repeat "I'm Jordan", etc.

MESSAGE 4: "I also like data analysis"
   Input → Extract {interests: ["data"]} (added to existing)
   Profile: {name: "Jordan", gpa: 3.7, year: "junior", major: "it", interests: ["it", "data"], ...}
   Response: "Great! Adding data analysis to your interests. For IT majors with 
             data skills and 3.7 GPA, you might consider..."
   ✓ Profile grows with each message
   ✓ Recommendations become more accurate
```

---

## 10. Session Cleanup Process

```
Every Hour (setInterval, 60 * 60 * 1000)
   ↓
Scan all sessions in SESSION_STORE
   ├─ Session 1: Created 2 hours ago, Active 1 minute ago
   │   └─ Not expired (< 24 hours) → KEEP
   ├─ Session 2: Created 24.5 hours ago, Active 24.5 hours ago
   │   └─ Expired (> 24 hours) → DELETE
   ├─ Session 3: Created 12 hours ago, Active 10 minutes ago
   │   └─ Not expired → KEEP
   └─ Session 4: Created 30 hours ago, Active 30 hours ago
      └─ Expired → DELETE

   ↓

Delete expired sessions:
   delete SESSION_STORE["session-id-2"]
   delete SESSION_STORE["session-id-4"]

   ↓

Log result:
   console.log('🧹 Cleaned up 2 expired sessions')

   ↓

Continue running
(Next cleanup in 1 hour)
```

---

## 11. TBS Major Selection With Memory

```
Message: "Should I choose accounting or finance?"
Profile: {name: "Sarah", gpa: 3.5, interests: ["finance"]}

         ↓

analyzeMajorSelection(message, profile)
         │
         ├─ userGPA = profile.gpa || extracted GPA
         │  └─ userGPA = 3.5
         │
         ├─ For each TBS major:
         │  ├─ Accounting: min GPA 2.0 ✓ qualify
         │  │  Interest match: ✗ not mentioned
         │  │  Score: 15
         │  │
         │  └─ Finance: min GPA 2.0 ✓ qualify
         │     Interest match: ✓ in profile interests
         │     Score: 55
         │
         ├─ Compare scores: Finance (55) > Accounting (15)
         └─ Top recommendation: Finance

         ↓

Response: "Sarah, with your 3.5 GPA and interest in Finance,
          I strongly recommend the Finance major!"

[Uses profile data to personalize and prioritize]
```

---

These diagrams visualize how the session memory system works from multiple perspectives: overall architecture, data flow, object structures, message sequences, and practical examples.

