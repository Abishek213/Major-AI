const fs = require('fs').promises;
const path = require('path');
const logger = require('../../../config/logger');

class FAQLoader {
  constructor() {
    this.faqData = [];
    this.faqPath = path.join(__dirname, '../../../shared/prompts/faq-chat.md');
  }

  async loadFAQs() {
    try {
      // Check if file exists
      try {
        await fs.access(this.faqPath);
      } catch {
        logger.warning('FAQ file not found, creating default');
        await this.createDefaultFAQs();
      }

      // Load FAQ content
      const content = await fs.readFile(this.faqPath, 'utf-8');
      this.faqData = this.parseFAQContent(content);
      
      logger.success(`Loaded ${this.faqData.length} FAQ entries`);
      return this.faqData;
    } catch (error) {
      logger.error(`Failed to load FAQs: ${error.message}`);
      return this.getDefaultFAQs();
    }
  }

  parseFAQContent(content) {
    const faqs = [];
    const lines = content.split('\n');
    let currentQuestion = '';
    let currentAnswer = '';
    let inAnswer = false;

    for (const line of lines) {
      if (line.startsWith('## Q:')) {
        // Save previous FAQ if exists
        if (currentQuestion && currentAnswer) {
          faqs.push({
            question: currentQuestion.trim(),
            answer: currentAnswer.trim(),
            category: 'general'
          });
        }
        // Start new FAQ
        currentQuestion = line.replace('## Q:', '').trim();
        currentAnswer = '';
        inAnswer = true;
      } else if (line.startsWith('**Category:**')) {
        // Category line
        continue;
      } else if (inAnswer && line.trim() && !line.startsWith('---')) {
        // Add to answer
        currentAnswer += line + '\n';
      }
    }

    // Add last FAQ
    if (currentQuestion && currentAnswer) {
      faqs.push({
        question: currentQuestion.trim(),
        answer: currentAnswer.trim(),
        category: 'general'
      });
    }

    return faqs;
  }

  async createDefaultFAQs() {
    const defaultFAQs = `# Event Management FAQ

## Q: How do I book an event?
**Category:** Booking
Book events through the platform by selecting your desired event, choosing tickets, and completing payment.

## Q: Can I cancel my booking?
**Category:** Cancellation
Yes, bookings can be cancelled up to 48 hours before the event for a full refund.

## Q: How do I get event recommendations?
**Category:** Recommendations
Our AI system analyzes your preferences and booking history to suggest events you might like.

## Q: What payment methods do you accept?
**Category:** Payment
We accept eSewa, Khalti, credit/debit cards, and bank transfers.

## Q: Can I request a custom event?
**Category:** Custom Events
Yes! Use our Event Request Assistant to describe what you're looking for.

## Q: How do I contact event organizers?
**Category:** Communication
You can message organizers directly through the event page messaging system.`;

    // Ensure directory exists
    const dir = path.dirname(this.faqPath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.writeFile(this.faqPath, defaultFAQs, 'utf-8');
    logger.success('Created default FAQ file');
  }

  getDefaultFAQs() {
    return [
      {
        question: "How do I book an event?",
        answer: "Select your event, choose tickets, and complete payment through our secure checkout.",
        category: "booking"
      },
      {
        question: "Can I get a refund?",
        answer: "Refunds are available up to 48 hours before the event. Contact support for assistance.",
        category: "refund"
      },
      {
        question: "How do event recommendations work?",
        answer: "Our AI analyzes your interests and past bookings to suggest relevant events.",
        category: "recommendations"
      }
    ];
  }

  async searchFAQ(query, category = null) {
    if (this.faqData.length === 0) {
      await this.loadFAQs();
    }

    const queryLower = query.toLowerCase();
    const results = this.faqData.filter(faq => {
      const questionMatch = faq.question.toLowerCase().includes(queryLower);
      const answerMatch = faq.answer.toLowerCase().includes(queryLower);
      const categoryMatch = !category || faq.category === category;
      
      return (questionMatch || answerMatch) && categoryMatch;
    });

    return results;
  }

  async addFAQ(question, answer, category = 'general') {
    this.faqData.push({ question, answer, category });
    
    // Update file
    await this.saveFAQs();
    
    return { success: true, id: this.faqData.length };
  }

  async saveFAQs() {
    let content = '# Event Management FAQ\n\n';
    
    this.faqData.forEach(faq => {
      content += `## Q: ${faq.question}\n`;
      content += `**Category:** ${faq.category}\n`;
      content += `${faq.answer}\n\n`;
      content += '---\n\n';
    });

    await fs.writeFile(this.faqPath, content, 'utf-8');
  }
}

module.exports = new FAQLoader();