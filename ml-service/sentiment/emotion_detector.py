"""
Emotion Detection for Feedback Sentiment Agent
Detects specific emotions in feedback text
"""
from transformers import pipeline
from typing import Dict, List, Any
import numpy as np

class EmotionDetector:
    def __init__(self, model_name="j-hartmann/emotion-english-distilroberta-base"):
        self.emotion_classifier = pipeline(
            "text-classification",
            model=model_name,
            return_all_scores=True
        )
        self.emotion_labels = ['anger', 'disgust', 'fear', 'joy', 'neutral', 'sadness', 'surprise']
        
    def detect_emotions(self, text: str) -> Dict:
        """Detect emotions in text"""
        try:
            results = self.emotion_classifier(text[:512])[0]  # Truncate for model limits
            
            # Convert to dictionary
            emotions = {}
            for result in results:
                emotions[result['label']] = result['score']
            
            # Get dominant emotion
            dominant_emotion = max(emotions.items(), key=lambda x: x[1])
            
            return {
                "emotions": emotions,
                "dominant_emotion": dominant_emotion[0],
                "dominant_score": dominant_emotion[1],
                "sentiment": self._map_emotion_to_sentiment(dominant_emotion[0])
            }
            
        except Exception as e:
            print(f"Emotion detection error: {e}")
            return {
                "emotions": {},
                "dominant_emotion": "neutral",
                "dominant_score": 1.0,
                "sentiment": "neutral"
            }
    
    def _map_emotion_to_sentiment(self, emotion: str) -> str:
        """Map emotion to sentiment category"""
        positive_emotions = ['joy', 'surprise']
        negative_emotions = ['anger', 'disgust', 'fear', 'sadness']
        
        if emotion in positive_emotions:
            return "positive"
        elif emotion in negative_emotions:
            return "negative"
        else:
            return "neutral"
    
    def analyze_feedback_batch(self, feedback_list: List[Dict]) -> List[Dict]:
        """Analyze multiple feedback entries"""
        results = []
        
        for feedback in feedback_list:
            text = feedback.get('text', '')
            if not text:
                continue
                
            emotion_result = self.detect_emotions(text)
            
            result = {
                "feedback_id": feedback.get('id'),
                "user_id": feedback.get('user_id'),
                "event_id": feedback.get('event_id'),
                "text": text[:200],  # Truncated for response
                "emotion_analysis": emotion_result,
                "requires_attention": emotion_result['sentiment'] == 'negative' and emotion_result['dominant_score'] > 0.7,
                "priority": self._calculate_priority(emotion_result)
            }
            
            results.append(result)
        
        # Sort by priority (high to low)
        results.sort(key=lambda x: x['priority'], reverse=True)
        
        return results
    
    def _calculate_priority(self, emotion_result: Dict) -> float:
        """Calculate attention priority based on emotion analysis"""
        priority = 0.0
        
        # Negative emotions get higher priority
        if emotion_result['sentiment'] == 'negative':
            priority += 0.6
        
        # High confidence scores increase priority
        priority += emotion_result['dominant_score'] * 0.4
        
        # Specific high-impact emotions
        high_impact_emotions = ['anger', 'disgust']
        if emotion_result['dominant_emotion'] in high_impact_emotions:
            priority += 0.2
        
        return min(priority, 1.0)  # Cap at 1.0