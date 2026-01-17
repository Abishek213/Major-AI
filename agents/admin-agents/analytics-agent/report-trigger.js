const logger = require('../../../config/logger');
const fs = require('fs').promises;
const path = require('path');

class ReportTrigger {
  constructor() {
    this.reportsDir = path.join(__dirname, '../../../reports');
    this.scheduledReports = new Map();
  }

  async initialize() {
    try {
      // Ensure reports directory exists
      await fs.mkdir(this.reportsDir, { recursive: true });
      logger.agent('ReportTrigger', 'Initialized reports directory');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize ReportTrigger: ${error.message}`);
      return false;
    }
  }

  async deliverReport(reportData, reportType, format = 'json') {
    try {
      logger.agent('ReportTrigger', `Delivering ${reportType} report in ${format} format`);
      
      let reportContent;
      let filename;
      
      switch (format) {
        case 'json':
          reportContent = JSON.stringify(reportData, null, 2);
          filename = `${reportType}_${Date.now()}.json`;
          break;
          
        case 'csv':
          reportContent = this.convertToCSV(reportData);
          filename = `${reportType}_${Date.now()}.csv`;
          break;
          
        case 'html':
          reportContent = this.convertToHTML(reportData);
          filename = `${reportType}_${Date.now()}.html`;
          break;
          
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
      
      // Save report file
      const filePath = path.join(this.reportsDir, filename);
      await fs.writeFile(filePath, reportContent, 'utf-8');
      
      // Log delivery
      logger.success(`Report saved: ${filename}`);
      
      // In production, would also:
      // 1. Send email notifications
      // 2. Upload to cloud storage
      // 3. Update dashboard
      
      return {
        success: true,
        filename: filename,
        filePath: filePath,
        size: Buffer.byteLength(reportContent, 'utf-8'),
        generated_at: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to deliver report: ${error.message}`);
      throw error;
    }
  }

  convertToCSV(reportData) {
    let csv = '';
    
    // Simple CSV conversion for summary data
    if (reportData.summary) {
      csv += 'Category,Metric,Value\n';
      
      Object.entries(reportData.summary).forEach(([category, data]) => {
        if (typeof data === 'object') {
          Object.entries(data).forEach(([metric, value]) => {
            csv += `${category},${metric},${value}\n`;
          });
        } else {
          csv += `${category},value,${data}\n`;
        }
      });
    }
    
    return csv;
  }

  convertToHTML(reportData) {
    const title = reportData.title || 'Analytics Report';
    const period = reportData.period || 'N/A';
    
    let html = `<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1 { color: #333; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .metric { margin: 10px 0; }
        .positive { color: green; }
        .warning { color: orange; }
        .critical { color: red; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <p><strong>Period:</strong> ${period}</p>
    <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
    <hr>`;
    
    // Add sections based on report data
    if (reportData.highlights) {
      html += `<div class="section">
        <h2>Highlights</h2>`;
      
      Object.entries(reportData.highlights).forEach(([key, value]) => {
        html += `<div class="metric"><strong>${key}:</strong> ${JSON.stringify(value)}</div>`;
      });
      
      html += `</div>`;
    }
    
    if (reportData.recommendations) {
      html += `<div class="section">
        <h2>Recommendations</h2>
        <ul>`;
      
      reportData.recommendations.forEach(rec => {
        html += `<li><strong>${rec.priority.toUpperCase()}:</strong> ${rec.action} - ${rec.details}</li>`;
      });
      
      html += `</ul></div>`;
    }
    
    html += `
</body>
</html>`;
    
    return html;
  }

  async scheduleReport(reportType, schedule, recipients = []) {
    try {
      const scheduleId = `schedule_${Date.now()}`;
      
      const scheduleConfig = {
        id: scheduleId,
        reportType: reportType,
        schedule: schedule,
        recipients: recipients,
        lastRun: null,
        nextRun: this.calculateNextRun(schedule),
        enabled: true
      };
      
      this.scheduledReports.set(scheduleId, scheduleConfig);
      
      logger.agent('ReportTrigger', `Scheduled ${reportType} report with ID: ${scheduleId}`);
      
      // Start scheduler if not already running
      if (this.scheduledReports.size === 1) {
        this.startScheduler();
      }
      
      return {
        success: true,
        scheduleId: scheduleId,
        nextRun: scheduleConfig.nextRun,
        message: `Report scheduled to run ${schedule}`
      };
    } catch (error) {
      logger.error(`Failed to schedule report: ${error.message}`);
      throw error;
    }
  }

  calculateNextRun(schedule) {
    const now = new Date();
    let nextRun = new Date(now);
    
    switch (schedule) {
      case 'daily':
        nextRun.setDate(nextRun.getDate() + 1);
        nextRun.setHours(6, 0, 0, 0); // 6 AM
        break;
        
      case 'weekly':
        nextRun.setDate(nextRun.getDate() + 7);
        nextRun.setHours(6, 0, 0, 0);
        break;
        
      case 'monthly':
        nextRun.setMonth(nextRun.getMonth() + 1);
        nextRun.setDate(1);
        nextRun.setHours(6, 0, 0, 0);
        break;
        
      default:
        throw new Error(`Unsupported schedule: ${schedule}`);
    }
    
    return nextRun.toISOString();
  }

  startScheduler() {
    logger.agent('ReportTrigger', 'Starting report scheduler');
    
    // Check every minute for scheduled reports
    this.schedulerInterval = setInterval(() => {
      this.checkScheduledReports();
    }, 60 * 1000); // Every minute
  }

  async checkScheduledReports() {
    const now = new Date();
    
    for (const [scheduleId, config] of this.scheduledReports) {
      if (config.enabled && config.nextRun && new Date(config.nextRun) <= now) {
        try {
          logger.agent('ReportTrigger', `Running scheduled report: ${scheduleId}`);
          
          // Run the report
          await this.executeScheduledReport(config);
          
          // Update schedule
          config.lastRun = new Date().toISOString();
          config.nextRun = this.calculateNextRun(config.schedule);
          this.scheduledReports.set(scheduleId, config);
          
        } catch (error) {
          logger.error(`Failed to execute scheduled report ${scheduleId}: ${error.message}`);
        }
      }
    }
  }

  async executeScheduledReport(config) {
    // In production, this would trigger the actual report generation
    // For now, just log it
    logger.agent('ReportTrigger', `Executing ${config.reportType} report for ${config.recipients.length} recipients`);
    
    // Simulate report generation delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    logger.success(`Scheduled report ${config.reportType} completed`);
    
    return {
      success: true,
      scheduleId: config.id,
      executedAt: new Date().toISOString(),
      recipients: config.recipients
    };
  }

  async getScheduledReports() {
    const reports = Array.from(this.scheduledReports.values());
    
    return {
      success: true,
      count: reports.length,
      reports: reports.map(report => ({
        id: report.id,
        type: report.reportType,
        schedule: report.schedule,
        nextRun: report.nextRun,
        lastRun: report.lastRun,
        enabled: report.enabled
      }))
    };
  }

  async disableSchedule(scheduleId) {
    const config = this.scheduledReports.get(scheduleId);
    
    if (!config) {
      throw new Error(`Schedule ${scheduleId} not found`);
    }
    
    config.enabled = false;
    this.scheduledReports.set(scheduleId, config);
    
    logger.agent('ReportTrigger', `Disabled schedule: ${scheduleId}`);
    
    return {
      success: true,
      scheduleId: scheduleId,
      enabled: false
    };
  }

  async cleanupOldReports(daysToKeep = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const files = await fs.readdir(this.reportsDir);
      let deletedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(this.reportsDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
      
      logger.agent('ReportTrigger', `Cleaned up ${deletedCount} old reports`);
      
      return {
        success: true,
        deletedCount: deletedCount,
        cutoffDate: cutoffDate.toISOString()
      };
    } catch (error) {
      logger.error(`Failed to cleanup old reports: ${error.message}`);
      throw error;
    }
  }
}

module.exports = ReportTrigger;