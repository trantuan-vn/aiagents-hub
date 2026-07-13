# PROMPTS FOR AI AGENT WORKFLOW
# Thêm Google Login vào Next.js

---

## PROMPT 1: SYSTEM INITIALIZATION
---
You are a professional AI assistant specializing in Next.js development.
You must think step by step and use available tools to complete tasks.

Rules:
1. Always analyze the request carefully
2. Plan your actions step by step
3. Use tools to gather information before making changes
4. Validate each step before proceeding
5. Provide clear explanations for every action

Chain of Thought Protocol:
- THOUGHT: What you are thinking
- ACTION: What you will do
- OBSERVE: What you observed from the action
- ANALYZE: What you learned from the observation
- DECIDE: What to do next

Available Tools:
1. read_file(filePath) - Read file content
2. write_file(filePath, content) - Create/overwrite file
3. edit_file(filePath, old_content, new_content) - Edit specific content
4. search_codebase(query) - Search codebase
5. run_terminal_command(command) - Execute terminal commands
6. web_search(query) - Search the web

Context:
- OS: macOS
- Workspace: /project/my-nextjs-app
- Framework: Next.js 14
- Project Structure:
  /project/my-nextjs-app
  ├── pages/
  │   └── api/
  │       └── auth/
  │           └── nextauth.ts
  ├── components/
  │   └── LoginForm.tsx
  ├── package.json
  └── .env.local (not exists)

User Request:
Thêm chức năng đăng nhập bằng Google vào ứng dụng Next.js của tôi

Your Task:
Analyze the request and create a step-by-step plan to implement Google Login.
Use the available tools to gather information and make changes.

Response Format:
THOUGHT: [Your reasoning process]
NEXT_ACTION: [What you will do next]
REASON: [Why you chose this action]

---

## PROMPT 2: THOUGHT 1 - CHECK DEPENDENCIES
---
Context:
User request: Thêm chức năng đăng nhập bằng Google vào ứng dụng Next.js
Current status: New task, no information gathered yet

Knowledge Base:
- Most Next.js apps (85%) use NextAuth for authentication
- NextAuth is the recommended solution for Next.js
- To check if NextAuth is installed, read package.json
- If not installed, need to run `npm install next-auth`
- If installed, need to check configuration

Your Task:
Think about what information you need first to add Google Login.

Questions to Answer:
1. What is the first thing you need to check?
2. Why is this information important?
3. What tool will you use?
4. What will you do after getting this information?

Response Format:
THOUGHT: [Your reasoning process]
NEXT_ACTION: [What you will do next]
REASON: [Why you chose this action]

---

## PROMPT 3: ANALYSIS 1 - PARSE PACKAGE.JSON
---
Tool Result (from read_file):
{
  "name": "my-nextjs-app",
  "version": "1.0.0",
  "dependencies": {
    "next": "14.0.4",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "next-auth": "^4.24.5",
    "tailwindcss": "^3.3.0"
  }
}

Your Task:
Analyze this result and determine the current status.

Questions to Answer:
1. Is NextAuth installed? (Yes/No)
2. What version is it?
3. What does this mean for our next step?
4. What should we do next?

Response Format:
PARSE: [What you found in the JSON]
COMPARE: [Compare with the goal]
STATUS: [Current status]
NEXT_ACTION: [What to do next]

---

## PROMPT 4: THOUGHT 2 - CHECK CONFIG
---
Context:
- User wants: Google Login
- NextAuth is installed: YES (version 4.24.5)
- Previous action: read_file('package.json') ✓
- Result: NextAuth found in dependencies

Knowledge Base:
Google Provider in NextAuth requires:
1. Import: `import GoogleProvider from "next-auth/providers/google"`
2. In providers array: 
   GoogleProvider({
     clientId: process.env.GOOGLE_CLIENT_ID,
     clientSecret: process.env.GOOGLE_CLIENT_SECRET,
   })
3. Environment variables needed:
   - GOOGLE_CLIENT_ID
   - GOOGLE_CLIENT_SECRET
   - NEXTAUTH_SECRET
   - NEXTAUTH_URL

Your Task:
Based on the fact that NextAuth is installed, plan the next steps.

Questions to Answer:
1. What do you need to check next?
2. What should you look for in the config file?
3. What are the possible scenarios?
4. What will you do in each scenario?

Response Format:
THOUGHT: [Your analysis]
NEXT_ACTION: [What to do]
REASONING: [Why you chose this action]

---

## PROMPT 5: ANALYSIS 2 - PARSE NEXTAUTH.TS
---
Tool Result (from read_file):
import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

export default NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        // ... custom logic
        return user
      }
    })
  ],
  session: {
    strategy: 'jwt'
  },
  pages: {
    signIn: '/login'
  }
})

Your Task:
Analyze this configuration and identify what's missing.

Questions to Answer:
1. What providers are currently configured?
2. Is Google Provider present? (Yes/No)
3. What needs to be added?
4. What's the plan?

Response Format:
CURRENT_PROVIDERS: [List of providers]
GOOGLE_PROVIDER: [Present/Missing]
MISSING_ELEMENTS: [What needs to be added]
NEXT_ACTION: [What to do]

---

## PROMPT 6: THOUGHT 3 - ADD GOOGLE PROVIDER
---
Context:
- Current config: Only CredentialsProvider in providers array
- Goal: Add Google Provider
- Previous action: read_file('nextauth.ts') ✓

Knowledge Base:
Google Provider Template:
GoogleProvider({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
})

Required Imports:
import GoogleProvider from 'next-auth/providers/google'

Environment Variables Template:
# NextAuth
NEXTAUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

Your Task:
Create a detailed edit plan for nextauth.ts.

Response Format:
CHANGES_NEEDED: [List specific changes]
OLD_CODE: [Current code section]
NEW_CODE: [Updated code]
EDIT_PLAN: [Step by step instructions]
PREVIEW: [Show what it will look like]

---

## PROMPT 7: THOUGHT 4 - CREATE .ENV.LOCAL
---
Context:
- Config updated: ✅ Google Provider added
- Previous action: edit_file('nextauth.ts') ✓
- Result: File updated successfully

Knowledge Base:
Environment Variables Needed:
1. NEXTAUTH_SECRET - Required for encryption
   Generate: `openssl rand -base64 32`
2. NEXTAUTH_URL - Required for redirects
   Development: `http://localhost:3000`
3. GOOGLE_CLIENT_ID - From Google Cloud Console
4. GOOGLE_CLIENT_SECRET - From Google Cloud Console

.env.local File Format:
# NextAuth Configuration
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=http://localhost:3000

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

Your Task:
Create a complete .env.local file with placeholders.

Response Format:
FILE_CONTENT: [Complete content]
EXPLANATION: [Explain each variable]
INSTRUCTIONS: [How to get real values]

---

## PROMPT 8: THOUGHT 5 - FIND UI
---
Context:
- Config updated: ✅ Google Provider added
- .env.local created: ✅ With placeholders
- Previous actions: edit_file, write_file ✓

Knowledge Base:
Where to find login UI in Next.js projects:
1. components/LoginForm.tsx - Most common
2. components/auth/LoginForm.tsx - Auth folder
3. pages/login.tsx - Pages router
4. app/login/page.tsx - App router

Search Strategy:
1. Search for "login", "signin", "sign in"
2. Search for form elements
3. Search for button components

Your Task:
Find the login UI component in the codebase.

Response Format:
THOUGHT: [Your reasoning]
SEARCH_QUERY: [What to search for]
EXPECTED_RESULT: [What you hope to find]

---

## PROMPT 9: THOUGHT 6 - ADD UI BUTTON
---
Context:
- Config updated: ✅
- .env.local created: ✅
- UI file found: components/LoginForm.tsx ✓
- Previous action: search_codebase ✓

Knowledge Base:
How to add Google Sign In button:

Import:
import { signIn } from 'next-auth/react'

Button Component:
<button 
  onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
  className="google-signin-btn"
>
  Sign in with Google
</button>

Complete Google Button Component:
const GoogleSignInButton = () => {
  const [isLoading, setIsLoading] = useState(false)
  
  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    await signIn('google', { callbackUrl: '/dashboard' })
    setIsLoading(false)
  }
  
  return (
    <button
      onClick={handleGoogleSignIn}
      disabled={isLoading}
      className="google-signin-btn"
    >
      {isLoading ? 'Loading...' : 'Sign in with Google'}
    </button>
  )
}

Your Task:
Add Sign in with Google button to LoginForm.tsx.

Response Format:
CURRENT_CODE: [Current code]
MODIFIED_CODE: [Code after changes]
CHANGES_DESCRIPTION: [What changed]

---

## PROMPT 10: COMPLETION CHECK
---
Completion Checklist:

Required Changes:
| # | Task | Status |
|---|------|--------|
| 1 | Check NextAuth installation | ✅/❌ |
| 2 | Add Google Provider to config | ✅/❌ |
| 3 | Create .env.local | ✅/❌ |
| 4 | Find login UI | ✅/❌ |
| 5 | Add Sign in with Google button | ✅/❌ |

Files Modified/Created:
| File | Type | Changes |
|------|------|---------|
| pages/api/auth/nextauth.ts | Modified | + GoogleProvider |
| .env.local | Created | + Environment variables |
| components/LoginForm.tsx | Modified | + Google Sign In button |

Your Task:
Determine if the task is complete and provide final output.

Response Format:
STATUS: [Complete/Incomplete]
SUMMARY: [What was done]
NEXT_STEPS: [What user should do]
WARNINGS: [Any important notes]

---

## PROMPT 11: FINAL OUTPUT TO USER
---
Your Task:
Provide the final summary to the user with all changes made.

Response Format:
## ✅ TASK COMPLETED SUCCESSFULLY

### 1. 📄 nextauth.ts (Modified)
[Show diff with + lines]

### 2. 📄 .env.local (Created)
[Show content]

### 3. 📄 LoginForm.tsx (Modified)
[Show diff with + lines]

## 🚀 NEXT STEPS FOR USER

### Step 1: Get Google OAuth Credentials
1. Go to Google Cloud Console
2. Create OAuth Client ID
3. Add redirect URI: http://localhost:3000/api/auth/callback/google

### Step 2: Update Environment Variables
1. Generate secret: `openssl rand -base64 32`
2. Replace placeholders in .env.local

### Step 3: Test the Application
1. Run `npm run dev`
2. Visit http://localhost:3000/login
3. Click "Sign in with Google"

## ⚠️ IMPORTANT NOTES
- Never commit .env.local to version control
- Keep GOOGLE_CLIENT_SECRET secret
- Use different credentials for production

## 📊 STATISTICS
- Total Iterations: 6
- Tool Calls: 6
- Files Modified: 2
- Files Created: 1
- Execution Time: ~5-10 seconds

---