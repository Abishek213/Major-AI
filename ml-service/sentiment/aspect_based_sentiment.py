"""
Aspect-Based Sentiment Analysis
Analyzes sentiment for specific aspects of events/services
"""
from transformers import pipeline
import re
from typing import Dict, List, Any, Tuple

class AspectSentimentAnalyzer:
    def __init__(self):
        self.aspects = {
            'venue': ['location', 'venue', 'place', 'facility', 'space'],
            'organization': ['organization', 'management', 'staff', 'service', 'support'],
            'content': ['content', 'speaker', 'presentation', 'topic', 'material'],
            'logistics': ['schedule', 'timing', 'duration', 'arrangement'],
            'value': ['price', 'cost', 'value', 'worth', 'expensive', 'cheap'],
            'food': ['food', 'catering', 'meal', 'snack', 'drink']
        }
        
        self.sentiment_analyzer = pipeline(
            "sentiment-analysis",
            model="distilbert-base-uncased-finetuned-sst-2-english"
        )
    
    def extract_aspects(self, text: str) -> List[Tuple[str, str]]:
        """Extract aspects and their context from text"""
        aspects_found = []
        text_lower = text.lower()
        
        for aspect, keywords in self.aspects.items():
            for keyword in keywords:
                if keyword in text_lower:
                    # Find context around the keyword
                    context = self._extract_context(text_lower, keyword)
                    aspects_found.append((aspect, context))
                    break  # Found aspect, move to next
        
        return aspects_found
    
    def _extract_context(self, text: str, keyword: str, window: int = 50) -> str:
        """Extract context around keyword"""
        try:
            idx = text.index(keyword)
            start = max(0, idx - window)
            end = min(len(text), idx + len(keyword) + window)
            return text[start:end]
        except:
            return text[:100]  # Fallback
    
    def analyze_aspect_sentiment(self, text: str) -> Dict:
        """Perform aspect-based sentiment analysis"""
        aspects = self.extract_aspects(text)
        
        if not aspects:
            # General sentiment if no aspects found
            general_sentiment = self.sentiment_analyzer(text[:512])[0]
            return {
                "general_sentiment": {
                    "label": general_sentiment['label'],
                    "score": general_sentiment['score']
                },
                "aspects": [],
                "has_aspects": False
            }
        
        aspect_results = []
        
        for aspect, context in aspects:
            # Analyze sentiment for this aspect context
            sentiment_result = self.sentiment_analyzer(context)[0]
            
            aspect_results.append({
                "aspect": aspect,
                "context": context,
                "sentiment": sentiment_result['label'],
                "confidence": sentiment_result['score'],
                "requires_action": sentiment_result['label'] == 'NEGATIVE' and sentiment_result['score'] > 0.7
            })
        
        # Calculate overall sentiment
        positive_count = sum(1 for a in aspect_results if a['sentiment'] == 'POSITIVE')
        negative_count = sum(1 for a in aspect_results if a['sentiment'] == 'NEGATIVE')
        
        overall_sentiment = 'POSITIVE' if positive_count > negative_count else 'NEGATIVE' if negative_count > positive_count else 'NEUTRAL'
        
        return {
            "general_sentiment": None,
            "aspects": aspect_results,
            "has_aspects": True,
            "overall_sentiment": overall_sentiment,
            "aspect_summary": {
                "positive_aspects": [a['aspect'] for a in aspect_results if a['sentiment'] == 'POSITIVE'],
                "negative_aspects": [a['aspect'] for a in aspect_results if a['sentiment'] == 'NEGATIVE' and a['confidence'] > 0.6],
                "improvement_areas": [a['aspect'] for a in aspect_results if a['requires_action']]
            }
        }
    
    def generate_improvement_suggestions(self, analysis_result: Dict) -> List[str]:
        """Generate suggestions based on aspect sentiment analysis"""
        suggestions = []
        
        if not analysis_result['has_aspects']:
            return ["Consider asking for more specific feedback in future surveys."]
        
        negative_aspects = analysis_result['aspect_summary']['negative_aspects']
        
        suggestion_map = {
            'venue': [
                "Consider surveying multiple venue options for future events",
                "Review venue accessibility and facilities checklist",
                "Negotiate better terms with current venue provider"
            ],
            'organization': [
                "Provide additional staff training",
                "Implement better communication protocols",
                "Create detailed event run sheets for all team members"
            ],
            'content': [
                "Conduct pre-event attendee surveys to tailor content",
                "Invite more engaging speakers",
                "Include more interactive sessions"
            ],
            'logistics': [
                "Review and optimize event schedule",
                "Provide clearer timing information to attendees",
                "Consider different time slots for different attendee demographics"
            ],
            'value': [
                "Re-evaluate pricing strategy",
                "Add more value-add services",
                "Consider tiered pricing options"
            ],
            'food': [
                "Survey dietary preferences in advance",
                "Consider different catering options",
                "Improve food presentation and variety"
            ]
        }
        
        for aspect in negative_aspects:
            if aspect in suggestion_map:
                suggestions.extend(suggestion_map[aspect][:2])  # Top 2 suggestions per aspect
        
        return list(set(suggestions))[:5]  # Return top 5 unique suggestions