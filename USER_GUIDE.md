# 🧠 MantrAI Assstant Assistant - User Guide

## Quick Start

1. **Launch**: Run `npm start` or double-click the app
2. **Show Assistant**: Press `Alt + Space` anywhere on your desktop
3. **Ask Questions**: Type your query and press Enter
4. **Hide**: Press `Escape` or click outside the window

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt + Space` | Show/hide floating assistant |
| `Ctrl + Alt + R` | Show productivity report |
| `Enter` | Submit query |
| `Escape` | Hide window |

## Core Features

### 🎯 Floating Interface
- Transparent overlay appears at screen center
- Auto-hides when you click elsewhere
- Resizes based on content

### 🤖 AI Queries
Ask anything:
- `"What's the weather like?"`
- `"Help me write an email"`
- `"Explain this code"`

### 📊 Productivity Tracking
Commands:
- `"show my report"` - Today's activity
- `"yesterday's activity"` - Previous day stats
- `"weekly summary"` - 7-day overview

## System Tray

Right-click the tray icon for:
- Show Assistant
- Productivity Report
- Start Focus Mode
- Pause Tracking
- Quit

## Productivity Reports

### What's Tracked
- **Productive Apps**: VS Code, IDEs, development tools
- **Distracting Apps**: Social media, games, entertainment
- **Neutral Apps**: System utilities, browsers

### Report Contents
- Total active time
- Top applications used
- Productivity score (0-100%)
- AI-generated insights and suggestions

## Privacy & Data

- All data stored locally in `src/data/activity.db`
- No cloud syncing unless configured
- Clear logs anytime via system tray

## AI Configuration

### Local AI (Ollama)
1. Install Ollama from https://ollama.ai
2. Run: `ollama pull llama2`
3. App auto-detects local server

### Cloud AI (OpenAI)
1. Set environment variable: `OPENAI_API_KEY=your_key`
2. Restart app
3. Queries route to OpenAI when local unavailable

## Troubleshooting

### App Won't Start
- Check Node.js version (16+ required)
- Run `npm install` to fix dependencies
- Try `npm run dev` for debug mode

### Shortcuts Not Working
- Run as administrator
- Check for conflicting global shortcuts
- Restart app to re-register shortcuts

### No Activity Data
- Install: `npm install active-win better-sqlite3`
- Grant app permissions to monitor windows
- Check database at `src/data/activity.db`

### AI Not Responding
- **Local**: Ensure Ollama is running (`ollama serve`)
- **Cloud**: Verify API key is set correctly
- Check internet connection

## Commands Reference

### Productivity Queries
- `"report"` / `"show report"` - Today's summary
- `"yesterday"` - Previous day activity
- `"week"` / `"weekly"` - 7-day overview
- `"focus"` - Productivity tips

### General Queries
- Any natural language question
- Code explanations
- Writing assistance
- General knowledge

## Tips

- **Focus Mode**: Minimizes distractions, tracks time more strictly
- **Break Reminders**: Ask "remind me to take breaks"
- **Goal Setting**: "help me set productivity goals"
- **Time Blocking**: "how to use time blocking effectively"

## File Locations

- **Database**: `src/data/activity.db`
- **Logs**: Console output (run with `npm run dev`)
- **Config**: Environment variables
- **UI**: `src/ui/` folder