# TBS (Tunis Business School) Integration - Complete

## Overview
The Eduployment AI platform has been successfully customized for Tunis Business School students with TBS-specific knowledge and intelligent career/academic guidance.

---

## 🎓 TBS Agents Customization

### 1. **Career Support Agent** (Pink - Mental Support Renamed)
**New Role**: Help TBS students understand their courses, major selection, and academic guidance

#### Features:
- **Major Selection Guidance**: Helps sophomores choose their specialization based on:
  - Current GPA and required prerequisites
  - Favorite subjects and interests
  - Career aspirations
  
- **Course Understanding**: Provides details on:
  - TBS 5 available majors and their requirements
  - Core courses and prerequisites
  - Credit structure (130 total credits)
  - Specialization requirements

- **Academic Support**: Explains:
  - GPA requirements for major selection
  - Internship options (12-credit full-time OR 6-credit project + electives)
  - Academic probation policies
  - Attendance rules (max 4 absences per course)

- **Course Upload**: Students can upload course materials and get personalized help

#### TBS Majors Covered:
1. **Accounting** - Financial reporting, auditing, tax accounting
2. **Finance** - Investment management, corporate finance, financial markets
3. **Business Analytics** - Data analysis, business intelligence, predictive modeling
4. **Information Technology** - Systems development, cybersecurity, database management
5. **Marketing** - Consumer behavior, digital marketing, brand management

---

### 2. **Career Advisor Agent** (Orange - Data Analyst Enhanced)
**Enhanced Role**: TBS-aligned career matching based on majors and job suitability

#### Features:
- **TBS Major-to-Career Mapping**: Intelligent matching between:
  - Student's grades and favorite subjects
  - TBS major specializations
  - Career paths aligned with each major
  
- **Smart Job Recommendations**: Uses:
  - TBS career pathways database
  - Student interests and skills
  - Regional job market (Tunisia-focused)
  - Major requirements and typical career outcomes

#### Career Pathways by Major:
- **Accounting** → Accountant, Auditor, Tax Specialist, Financial Controller, CFO
- **Finance** → Financial Analyst, Investment Manager, Risk Manager, Treasury Manager, CFO
- **Business Analytics** → Business Analyst, Data Scientist, BI Developer, Operations Manager, Analytics Manager
- **Information Technology** → Software Developer, IT Manager, Systems Analyst, CTO, IT Consultant
- **Marketing** → Marketing Manager, Digital Strategist, Brand Manager, Product Manager, CMO

---

## 📚 TBS Knowledge Base Integrated

### Academic Structure:
- **Degree**: Bachelor of Science in Business Administration (BSBA)
- **Duration**: 4 years (semester-based)
- **Total Credits**: 130
- **Language**: English (US system)

### Credit Distribution:
- Business Core: 42 credits
- Major Courses: 36 credits  
- Minor Courses: 15 credits (optional)
- Non-Business: 13 credits
- Computer Science: 12 credits
- Senior Project/Internship: 12 credits

### Sophomore Major Selection Requirements:
- Minimum 66 credits completed
- Cumulative GPA ≥ 2.0
- Specialized GPA ≥ 2.0 in prerequisite courses
- Each major has specific prerequisite courses

### Academic Rules:
- Minimum 2.0 GPA to progress (below triggers probation)
- Dismissal after 2 consecutive semesters on probation
- Maximum 4 absences per course
- Strict plagiarism/cheating policies

### Internship Options:
- **Option I**: 12-credit full-time internship
- **Option II**: 6-credit capstone project + 2 elective courses

---

## 🔄 How It Works

### Career Support Agent Interaction Flow:
1. Student enters major selection query (or GPA)
2. Agent detects query type (major selection vs. course help)
3. Recommends top 3 majors based on interests and grades
4. Explains requirements and career paths
5. Can help with course understanding and assignments

**Example Queries**:
- "Help me choose my major, my GPA is 3.5 and I love coding"
- "I'm interested in marketing, what should I do?"
- "Upload my accounting assignment for help"

### Career Advisor Agent Interaction Flow:
1. Student shares interests, grades, and favorite subjects
2. Agent identifies matching TBS major
3. Recommends aligned career paths
4. Explains skills needed for each career
5. Connects to job opportunities

**Example Queries**:
- "I'm good with numbers and like finance"
- "What job should I pursue based on my IT skills?"
- "Best career after completing Business Analytics?"

---

## 🎨 Visual Updates

### Agent Colors Aligned:
- **Career Support** (Cyan/Teal): Pink (#ff6b9d)
- **Career Advisor** (Orange): Orange (#ffa726)
- **CV Analyzer**: Green (#10b981)
- **Academic Support**: Blue (#6c63ff)

All colors consistent across:
- Home page agent cards
- Chat interface backgrounds
- Header borders and glows
- Input fields and buttons

---

## 📋 Implementation Details

### Files Modified:
1. **server.js**
   - Added `TBS_INFO` knowledge base with all programs, requirements, and career pathways
   - Enhanced `analyzeCareerMatch()` function with TBS-specific logic
   - Added helper functions:
     - `isMajorSelectionQuery()` - Detects major selection requests
     - `isCourseQuery()` - Detects course help requests
     - `analyzeMajorSelection()` - TBS major recommendation engine
     - `analyzeCourseHelp()` - TBS course guidance
     - `analyzeJobMatch()` - TBS-aligned career matching

2. **public/js/chat.js**
   - Updated Career Support agent welcome message
   - Updated Career Advisor agent welcome message
   - Updated CV Analyzer agent welcome message
   - Fixed color references to match new color scheme

3. **public/index.html**
   - Updated agent card descriptions
   - Changed "Mental Support" to "Career Support"
   - Updated Career Advisor description to highlight TBS focus

4. **public/css/styles.css**
   - Added `--accent-green` color variable
   - Updated Career Support to use pink
   - Updated CV Analyzer to use green
   - All agents have matching outer colors, borders, and glows

---

## ✨ Key Features

### 1. **Intelligent Major Selection**
- Analyzes student interests and GPA
- Recommends top 3 majors with detailed explanations
- Shows required courses and career outcomes for each major
- Explains GPA requirements and prerequisite courses

### 2. **Course Support**
- Students can upload course materials
- Agent provides explanations of course content
- Helps with assignments and exam preparation
- Connects course knowledge to career applications

### 3. **Career Pathways**
- Each major has clear career paths
- Job matching considers TBS-specific education
- Recommends roles suited to major and grades
- Explains required skills for each career

### 4. **GPA-Aware Guidance**
- Considers student's GPA for major viability
- Explains minimum requirements for each major
- Provides guidance on academic performance
- Offers support for struggling students

---

## 🚀 Next Steps (Optional Enhancements)

1. **Add TBS Alumni Network Integration**: Track successful graduates by major
2. **Employer Partnerships**: Connect with companies hiring TBS graduates
3. **Course Database**: Add detailed syllabus for each TBS course
4. **Internship Matching**: Help students find relevant internships
5. **Resume Builder**: TBS-specific resume templates aligned with each major
6. **GPA Calculator**: Help students understand cumulative vs. specialized GPA
7. **Industry Insights**: Add regional job market data for Tunisia

---

## 📊 Testing the Integration

### Test Queries for Career Support:
```
"Help me choose my major, my GPA is 3.2 and I love data analysis"
"I'm a sophomore and interested in accounting"
"What major suits someone who likes coding?"
"Can you help me understand my marketing courses?"
```

### Test Queries for Career Advisor:
```
"I'm graduating with a Finance major, what should I do?"
"Best career for IT major with high grades?"
"How can my accounting background help me get a job?"
"What companies hire TBS graduates in marketing?"
```

---

**Status**: ✅ Complete and Ready for TBS Students
**Last Updated**: March 1, 2026
