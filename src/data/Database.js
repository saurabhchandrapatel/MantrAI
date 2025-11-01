const path = require('path');
const fs = require('fs');

let Database;
try {
  Database = require('better-sqlite3');
} catch (error) {
  console.warn('⚠️ better-sqlite3 not available — using in-memory mock DB');
  Database = class MockDatabase {
    exec() {}
    prepare() {
      return {
        run: () => {},
        get: () => null,
        all: () => [],
      };
    }
    close() {}
  };
}

class ActivityDatabase {
  constructor(basePath = __dirname) {
    try {
      const { app } = require('electron');
      this.dbPath = path.join(app.getPath('userData'), 'activity.db');
    } catch {
      this.dbPath = path.join(basePath, 'activity.db');
    }

    this.db = null;
  }

  async initialize() {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      this.db = new Database(this.dbPath);
      this.createTables();

      console.log(`✅ Database initialized at ${this.dbPath}`);
    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
      this.db = new Database(':memory:');
      this.createTables();
    }
  }

    createTables() {
        try {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            app_name TEXT NOT NULL,
            duration INTEGER NOT NULL,
            category TEXT NOT NULL,
            productive INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date);
            CREATE INDEX IF NOT EXISTS idx_activities_app ON activities(app_name);
            CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(category);

            CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        } catch (error) {
        console.error('Error creating tables:', error);
        }
    }

    
    // createTables() {
    //     // Activity tracking table
    //     this.db.exec(`
    //         CREATE TABLE IF NOT EXISTS activities (
    //             id INTEGER PRIMARY KEY AUTOINCREMENT,
    //             date TEXT NOT NULL,
    //             timestamp TEXT NOT NULL,
    //             app_name TEXT NOT NULL,
    //             duration INTEGER NOT NULL,
    //             category TEXT NOT NULL,
    //             productive BOOLEAN NOT NULL,
    //             created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    //         )
    //     `);

    //     // Create indexes for better performance
    //     this.db.exec(`
    //         CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date);
    //         CREATE INDEX IF NOT EXISTS idx_activities_app ON activities(app_name);
    //         CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(category);
    //     `);

    //     // Settings table for user preferences
    //     this.db.exec(`
    //         CREATE TABLE IF NOT EXISTS settings (
    //             key TEXT PRIMARY KEY,
    //             value TEXT NOT NULL,
    //             updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    //         )
    //     `);
    // }

    async saveActivity(activityData) {
        const stmt = this.db.prepare(`
            INSERT INTO activities (date, timestamp, app_name, duration, category, productive)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        try {
            stmt.run(
                activityData.date,
                activityData.timestamp,
                activityData.appName,
                activityData.duration,
                activityData.category,
                activityData.productive ? 1 : 0
            );
        } catch (error) {
            console.error('Error saving activity:', error);
            throw error;
        }
    }

    async getActivityByDate(date) {
        const stmt = this.db.prepare(`
            SELECT 
                app_name,
                SUM(duration) as total_duration,
                category,
                productive,
                COUNT(*) as session_count
            FROM activities 
            WHERE date = ?
            GROUP BY app_name, category, productive
            ORDER BY total_duration DESC
        `);

        return stmt.all(date);
    }

    async getActivityByDateRange(startDate, endDate) {
        const stmt = this.db.prepare(`
            SELECT 
                date,
                app_name,
                SUM(duration) as total_duration,
                category,
                productive,
                COUNT(*) as session_count
            FROM activities 
            WHERE date BETWEEN ? AND ?
            GROUP BY date, app_name, category, productive
            ORDER BY date DESC, total_duration DESC
        `);

        return stmt.all(startDate, endDate);
    }

    async getDailySummary(date) {
        const stmt = this.db.prepare(`
            SELECT 
                category,
                SUM(duration) as total_duration,
                COUNT(DISTINCT app_name) as app_count,
                COUNT(*) as session_count
            FROM activities 
            WHERE date = ?
            GROUP BY category
        `);

        return stmt.all(date);
    }

    async getSessionBounds(date) {
        const stmt = this.db.prepare(`
            SELECT 
                MIN(timestamp) as first_ts,
                MAX(timestamp) as last_ts
            FROM activities
            WHERE date = ?
        `);

        return stmt.get(date) || { first_ts: null, last_ts: null };
    }

    async getTopApps(date, limit = 10) {
        const stmt = this.db.prepare(`
            SELECT 
                app_name,
                SUM(duration) as total_duration,
                category,
                productive
            FROM activities 
            WHERE date = ?
            GROUP BY app_name
            ORDER BY total_duration DESC
            LIMIT ?
        `);

        return stmt.all(date, limit);
    }

    async getProductivityScore(date) {
        const stmt = this.db.prepare(`
            SELECT 
                SUM(CASE WHEN productive = 1 THEN duration ELSE 0 END) as productive_time,
                SUM(CASE WHEN productive = 0 THEN duration ELSE 0 END) as unproductive_time,
                SUM(duration) as total_time
            FROM activities 
            WHERE date = ?
        `);

        const result = stmt.get(date);
        
        if (!result || result.total_time === 0) {
            return { score: 0, productive_time: 0, unproductive_time: 0, total_time: 0 };
        }

        const score = Math.round((result.productive_time / result.total_time) * 100);
        
        return {
            score,
            productive_time: result.productive_time,
            unproductive_time: result.unproductive_time,
            total_time: result.total_time
        };
    }

    async clearOldData(daysToKeep = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

        const stmt = this.db.prepare('DELETE FROM activities WHERE date < ?');
        const result = stmt.run(cutoffDateStr);
        
        console.log(`Cleared ${result.changes} old activity records`);
        return result.changes;
    }

    async getSetting(key) {
        const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
        const result = stmt.get(key);
        return result ? result.value : null;
    }

    async setSetting(key, value) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO settings (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `);
        stmt.run(key, value);
    }

    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

module.exports = ActivityDatabase;