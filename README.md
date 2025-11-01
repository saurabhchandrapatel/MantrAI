# Floating AI Assistant with Productivity Tracker

A Windows desktop application built with Electron that provides a floating AI assistant interface and automatic productivity tracking.

## Features

- **Floating Transparent UI**: Center-screen overlay with blur effects
- **AI Integration**: Supports local (Ollama) and cloud (OpenAI) LLM providers
- **Activity Tracking**: Monitors app usage and categorizes productivity
- **Productivity Reports**: AI-generated daily/weekly insights
- **Global Shortcuts**: Alt+Space to show/hide, Ctrl+Alt+R for reports
- **System Tray**: Quick access to features and controls

## Installation

1. Install dependencies:
```bash
npm install
```

2. For activity tracking, install additional Windows-specific packages:
```bash
npm install active-win@8.0.0 better-sqlite3@9.0.0
```

3. (Optional) Set up Ollama for local LLM:
   - Download and install Ollama from https://ollama.ai
   - Run: `ollama pull llama2`

4. (Optional) Set OpenAI API key:
```bash
set OPENAI_API_KEY=your_api_key_here
```

## Usage

### Start the Application
```bash
npm start
```

### Keyboard Shortcuts
- `Alt + Space`: Show/hide floating assistant
- `Ctrl + Alt + R`: Show productivity report
- `Escape`: Hide window when focused

### Commands
- "show my report" - Display today's productivity report
- "yesterday's activity" - Show yesterday's stats
- "weekly summary" - Generate week overview
- Any general question - Processed by AI

## Architecture

```
src/
├── main.js              # Main Electron process
├── preload.js           # IPC bridge
├── ui/                  # Frontend interface
│   ├── index.html
│   ├── styles.css
│   └── renderer.js
├── tracker/             # Activity monitoring
│   └── ActivityTracker.js
├── llm/                 # AI service integration
│   └── LLMService.js
├── reports/             # Report generation
│   └── ReportGenerator.js
├── data/                # Database layer
│   └── Database.js
└── assets/              # Icons and resources
```

## Configuration

The app automatically categorizes applications:

**Productive Apps**: VS Code, IDEs, development tools
**Distracting Apps**: Social media, games, entertainment
**Neutral Apps**: System utilities, general productivity tools

## Data Storage

All activity data is stored locally in SQLite database at `src/data/activity.db`. No cloud syncing unless explicitly configured.

## Development

Run in development mode:
```bash
npm run dev
```

Build for distribution:
```bash
npm run build
```

## Privacy

- All tracking data stays on your local machine
- No telemetry or external data transmission
- User can clear activity logs anytime through system tray

## Requirements

- Windows 10/11
- Node.js 16+
- Electron 39+
- (Optional) Ollama for local AI
- (Optional) OpenAI API key for cloud AI