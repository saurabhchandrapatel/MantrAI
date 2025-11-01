Perfect addition ✅ — you’re turning your **Floating AI Assistant** into not just a contextual LLM helper, but also a **personal productivity intelligence system** that can **analyze your daily computer usage** and generate **AI summaries/reports** on how you spend your time.

Let’s add this feature properly into the PRD so it fits the architecture and MVP roadmap.

---

# 🧠 **Updated PRD — Floating AI Assistant (MVP + Productivity Tracker)**

### 📄 Document Version

**Version:** 1.0 (MVP Extended)
**Date:** Oct 2025
**Owner:** Saurabh Patel
**Platform:** Windows (Electron-based)

---

## 🎯 **1. Goal**

To build a **floating AI assistant** that allows users to:

1. Invoke a **transparent floating search/input bar** centered on the screen.
2. Ask natural-language questions powered by **local or cloud LLMs** with screen context.
3. Automatically **track system productivity** — monitoring app usage, focus time, and activity patterns — and generate **AI-based productivity reports and improvement tips**.

---

## 🧱 **2. Core MVP Features**

### 2.1 Floating Transparent Input UI

*(Same as before)*

* Center-screen transparent overlay with blur, rounded corners, and shadow.
* Input accepts queries or commands (like “Summarize what I worked on today”).

---

### 2.2 LLM Integration

*(Same as before)*

* Connects to local (Ollama/LM Studio) or remote (OpenAI, Gemini) LLMs.
* Used for both contextual Q&A and productivity analysis.

---

### 2.3 Context Awareness

*(Same as before + future ready for screen capture or clipboard context)*

---

## 🧭 **3. NEW FEATURE: System Productivity Tracker**

### 3.1 Purpose

Enable the assistant to automatically monitor and summarize user activity:

* Track which applications are used, for how long.
* Measure periods of focused work vs distraction.
* Generate daily/weekly reports visualized as text or charts.
* Let the LLM suggest improvements (e.g., “You spent 3h on VS Code, 1h on social media — want to set a focus reminder?”).

---

### 3.2 Data to Track

| Category         | Example Data                              | Source                                    |
| ---------------- | ----------------------------------------- | ----------------------------------------- |
| Active App       | `Chrome.exe`, `VSCode.exe`                | Windows API (`active-window` npm package) |
| Duration         | Time spent per app/window                 | Background timer                          |
| Idle Time        | No keyboard/mouse input                   | `system-idle-time`                        |
| Productive Score | Tag apps as “productive” or “distracting” | Configurable JSON                         |
| Queries to LLM   | Count of questions asked                  | Internal logs                             |

---

### 3.3 Productivity Report Generator

**Functionality:**

* Summarizes activity daily or weekly.
* Uses the LLM to convert raw data → human-readable insights.
* Example output:

```
🗓️ Productivity Report — Oct 30, 2025

You worked for 6h 40m today.
Top productive apps: VSCode (3h), Notion (2h)
Top distractions: YouTube (40m), WhatsApp Web (30m)

⚙️ AI Suggestion:
"Try setting 25-min focus sessions using Pomodoro technique.
You're most productive between 10AM–1PM."
```

**Storage:**

* Local SQLite database or JSON logs in `/data/activity.db`.
* Each record = { date, appName, duration, active, idle }.

---

### 3.4 Commands for the Assistant

Users can directly ask:

* “Show my productivity report for today.”
* “What did I do yesterday?”
* “How can I improve focus?”
* “Summarize my week’s activity.”

The assistant fetches from activity logs → sends to LLM → formats response.

---

### 3.5 System Tray Integration

* Small tray icon with:

  * “Show Productivity Report”
  * “Start Focus Mode”
  * “Pause Tracking”
  * “Quit”

---

### 3.6 Privacy Controls

* All data is stored **locally only**.
* User can clear activity logs anytime.
* No cloud syncing unless explicitly enabled.

---

## ⚙️ **4. Technical Architecture (Updated)**

**New Modules**

| Module          | Description                                                    |
| --------------- | -------------------------------------------------------------- |
| `/src/tracker/` | Background activity tracker (monitors window focus, idle time) |
| `/src/llm/`     | LLM API adapters                                               |
| `/src/ui/`      | Floating search UI and result view                             |
| `/src/reports/` | Productivity summary generator and LLM prompt builder          |
| `/src/data/`    | SQLite or JSON logs                                            |

---

**Workflow Example:**

1. Background tracker logs active app every 10s.
2. Data saved locally.
3. When user types “show my report”, assistant aggregates daily data.
4. Sends formatted context → LLM prompt:

   ```
   Summarize this activity log into a concise productivity report with suggestions.
   ```
5. Displays AI-generated summary in the floating window.

---

## 🗓️ **5. Updated Milestones**

| Phase | Description                           | Deliverable          | ETA    |
| ----- | ------------------------------------- | -------------------- | ------ |
| 1     | Floating UI + Shortcut + Transparency | Base UI              | Week 1 |
| 2     | LLM API connection (Ollama/OpenAI)    | Query & Response     | Week 2 |
| 3     | Activity Tracker Service              | Logs app usage       | Week 3 |
| 4     | Productivity Report Generator         | Daily report command | Week 4 |
| 5     | Polish + System Tray + Local Storage  | MVP Ready            | Week 5 |

---

## ✅ **6. Success Criteria**

* Floating UI loads in <1s
* LLM responds within 3s
* Activity tracking accuracy >95%
* Productivity report generates correctly
* All data stored locally

---

Would you like me to now generate the **folder structure + stub files** (main.js, tracker.js, llm.js, report.js, etc.) so you can directly initialize this Electron project with productivity tracking built in?
