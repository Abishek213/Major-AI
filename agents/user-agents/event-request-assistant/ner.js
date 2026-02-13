const { OpenAI } = require('openai');
const { logger } = require('../../../shared/utils/logger');

class NERProcessor {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        this.entityTypes = [
            'event_type',
            'location',
            'date',
            'budget',
            'guests',
            'theme',
            'requirements'
        ];
    }

    /**
     * Process natural language and extract entities
     */
    async processNaturalLanguage(text) {
        try {
            const prompt = `
            Extract the following entities from the event request:
            "${text}"
            
            Extract as JSON with these keys:
            - event_type: Type of event (wedding, birthday, corporate, etc.)
            - locations: Array of location mentions
            - date: Preferred date (YYYY-MM-DD format if available)
            - budget: Budget amount in numbers
            - guests: Number of guests if mentioned
            - theme: Event theme or style
            - requirements: Special requirements
            - description: Clean description of the event
            
            Return ONLY valid JSON.
            `;

            // if (process.env.OPENAI_API_KEY) {
            //     const prompt = `Extract event details: "${text}"`;

            if (!process.env.OPENAI_API_KEY) {
                console.log("No OpenAI key detected, running fallback NLP");
                return this.fallbackExtraction(text);
            }

            const response = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: "You are an event planning assistant. Extract structured information from event requests." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 500
            });


            // console.log('DEBUG NER: OpenAI response received');

            const result = response.choices[0].message.content;
            console.log('DEBUG NER: Raw OpenAI response:', result);
            return this.parseAndValidateEntities(result);

            // }
            // else {
            //     // Fallback to simple extraction
            //     console.log('No OpenAI API key, using fallback extraction');
            //     return this.fallbackExtraction(text);
            // }

        } catch (error) {
            console.error('DEBUG NER: Error in processNaturalLanguage:', error.message);
            // logger.error(`NER processing failed: ${error.message}`);

            try {
                return this.fallbackExtraction(text);
            }
            catch (fallbackError) {
                console.error("Fallback extraction also failed:", fallbackError);
                // ✅ FIX: Return a minimum valid object
                return {
                    eventType: 'general',
                    locations: [],
                    date: null,
                    budget: null,
                    guests: null,
                    theme: '',
                    requirements: '',
                    description: text
                };
            }

            // Fallback to regex-based extraction if OpenAI fails
            // return this.fallbackExtraction(text);
        }
    }

    parseAndValidateEntities(jsonString) {
        try {
            const entities = JSON.parse(jsonString);

            // Validate and clean entities
            const validated = {
                eventType: entities.event_type || 'general',
                locations: Array.isArray(entities.locations) ? entities.locations :
                    entities.locations ? [entities.locations] : [],
                date: this.parseDate(entities.date),
                budget: this.extractBudget(entities.budget),
                guests: this.extractNumber(entities.guests),
                theme: entities.theme || '',
                requirements: entities.requirements || '',
                description: entities.description || ''
            };

            // Clean locations
            validated.locations = validated.locations
                .map(loc => loc.trim())
                .filter(loc => loc.length > 0);

            return validated;
        } catch (error) {
            logger.error(`Failed to parse NER results: ${error.message}`);
            return this.fallbackExtraction(jsonString);
        }
    }

    fallbackExtraction(text) {

        const lowerText = text.toLowerCase();

        console.log('DEBUG NER: Running fallback extraction for:', text);
        // Ensure text is a string
        const textStr = text || '';
        // const textLower = textStr.toLowerCase();
        const entities = {
            eventType: 'general',
            locations: [],
            date: null,
            budget: null,
            guests: null,
            theme: '',
            requirements: '',
            description: text
        };


        const eventKeywords = ["wedding", "birthday", "conference", "meeting", "seminar", "business", "party", "anniversary", "workshop", "concert", "festival"];
        // entities.eventType = eventKeywords.find(kw => text.toLowerCase().includes(kw)) || "general";
        for (const keyword of eventKeywords) {
            if (lowerText.includes(keyword)) {
                entities.eventType = keyword;
                break;
            }
        }
        const locationKeywords = ["Kathmandu", "Pokhara", "Lalitpur", "Biratnagar", "Birgunj", "Dharan", "Nepalgunj", "Hetauda","Chitwan", "Janakpur", "Butwal", "Dhangadhi", "Itahari", "Ghorahi", "Bharatpur", "Tulsipur"];
        // entities.locations = cities.filter(city => text.toLowerCase().includes(city.toLowerCase()));
        // Debug: Show what we're looking for
        console.log("Looking for locations in:", lowerText);

        locationKeywords.forEach(location => {
            // Use regex for better matching (case insensitive, whole word)
            const regex = new RegExp(`\\b${location}\\b`, 'i');
            if (regex.test(lowerText)) {
                console.log(`✅ Found location: ${location}`);
                entities.locations.push(location);
            }
        });

        // If still no locations found, try harder

        if (entities.locations.length === 0) {
            // Check for location-like words (capitalized, common city names)
            const locationWords = text.split(/\s+/).filter(word =>
                /^[A-Z][a-z]+$/.test(word) && word.length > 3
            );
            console.log("Potential location words:", locationWords);

            // Add first capitalized word as potential location
            if (locationWords.length > 0) {
                entities.locations.push(locationWords[0].toLowerCase());
            }
        }


        // Simple regex patterns for fallback
        const patterns = {
            budget: /(\$|₹|Rs\.?|USD\s*)?(\d+(?:,\d{3})*(?:\.\d{2})?)/i,
            guests: /(\d+)\s*(?:guests?|people|persons|attendees)/i,
            date: /(\d{4}-\d{2}-\d{2})|(\d{1,2}\/\d{1,2}\/\d{4})/

        };

        // Fix budget extraction - look for "budget" keyword specifically
        const budgetRegex = /budget\s*(?:of|is|:)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i;
        const budgetMatch = text.match(budgetRegex);

        if (budgetMatch) {
            entities.budget = parseInt(budgetMatch[1].replace(/,/g, ''));
            console.log(`✅ Extracted budget: ${entities.budget}`);
        } else {
            // Look for numbers after currency indicators
            const currencyRegex = /(?:rs\.?|npr|usd|\$)\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i;
            const currencyMatch = text.match(currencyRegex);

            if (currencyMatch) {
                entities.budget = parseInt(currencyMatch[1].replace(/,/g, ''));
                console.log(`✅ Extracted budget via currency: ${entities.budget}`);
            } else {
                // Find the largest number that's NOT the guest count
                const allNumbers = text.match(/\d+(?:,\d{3})*(?:\.\d{2})?/g) || [];
                const numbers = allNumbers.map(num => parseInt(num.replace(/,/g, '')));

                if (numbers.length > 0) {
                    // Sort descending, pick the largest (likely budget)
                    numbers.sort((a, b) => b - a);
                    entities.budget = numbers[0];
                    console.log(`✅ Extracted largest number as budget: ${entities.budget}`);
                }
            }
        }

        // Extract guests - fix to avoid conflict with budget
        const guestsRegex = /(\d+)\s*(?:guests?|people|persons|attendees|participants|individuals)\b/i;
        const guestsMatch = text.match(guestsRegex);

        if (guestsMatch) {
            entities.guests = parseInt(guestsMatch[1]);
            console.log(`✅ Extracted guests: ${entities.guests}`);
        } else {
            // Alternative pattern: "for X people"
            const altGuestsRegex = /for\s+(\d+)\s+(?:people|guests|persons)\b/i;
            const altMatch = text.match(altGuestsRegex);
            if (altMatch) {
                entities.guests = parseInt(altMatch[1]);
                console.log(`✅ Extracted guests (alt): ${entities.guests}`);
            }
        }

        // Extract date
        const dateMatch = text.match(patterns.date);
        if (dateMatch) {
            entities.date = dateMatch[0];

        }

        return entities;


        // return {
        //     success: true,
        //     extractedEntities: entities,
        //     error: null
        // };
    }

    parseDate(dateString) {
        if (!dateString) return null;

        try {
            const date = new Date(dateString);
            return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
        } catch (error) {
            return null;
        }
    }

    extractBudget(budgetString) {
        if (!budgetString) return null;

        // Extract numbers from budget string
        const matches = budgetString.match(/\d+(?:,\d{3})*(?:\.\d{2})?/);
        if (matches) {
            return parseFloat(matches[0].replace(/,/g, ''));
        }
        return null;
    }

    extractNumber(text) {
        if (!text) return null;
        const match = text.match(/\d+/);
        return match ? parseInt(match[0]) : null;
    }
}

// Create singleton instance
const nerProcessor = new NERProcessor();

module.exports = {
    processNaturalLanguage: (text) => nerProcessor.processNaturalLanguage(text),
    NERProcessor
};