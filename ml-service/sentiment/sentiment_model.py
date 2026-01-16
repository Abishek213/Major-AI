"""
Sentiment Analysis Model
Analyzes sentiment in text using ML models
"""

import sys
import os
import json
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
import numpy as np

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from sentiment.emotion_detector import EmotionDetector
    from sentiment.aspect_based_sentiment import AspectSentimentAnalyzer
except ImportError:
    print("Note: EmotionDetector and AspectSentimentAnalyzer not found")

# Try to import ML libraries
try:
    from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
    from transformers import logging as transformers_logging
    transformers_logging.set_verbosity_error()
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    print("Transformers library not available")
    TRANSFORMERS_AVAILABLE = False

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    print("PyTorch not available")
    TORCH_AVAILABLE = False

class SentimentAnalyzer:
    def __init__(self, config: Dict = None):
        """
        Initialize sentiment analyzer
        
        Args:
            config: Configuration dictionary
        """
        self.config = config or {
            'model_name': 'distilbert-base-uncased-finetuned-sst-2-english',
            'model_type': 'transformers',  # transformers, huggingface, custom
            'thresholds': {
                'positive': 0.6,
                'negative': 0.4,
                'neutral_lower': 0.4,
                'neutral_upper': 0.6
            },
            'features': {
                'detect_emotions': True,
                'aspect_based_analysis': True,
                'extract_keywords': True,
                'calculate_intensity': True
            },
            'performance': {
                'batch_size': 32,
                'max_length': 512,
                'truncation': True
            }
        }
        
        self.model = None
        self.tokenizer = None
        self.emotion_detector = None
        self.aspect_analyzer = None
        self.model_loaded = False
        
        # Initialize components
        self._initialize_components()
    
    def _initialize_components(self):
        """Initialize all components"""
        # Initialize emotion detector
        if self.config['features']['detect_emotions']:
            try:
                self.emotion_detector = EmotionDetector()
                print("✅ Emotion detector initialized")
            except:
                print("❌ Could not initialize emotion detector")
        
        # Initialize aspect analyzer
        if self.config['features']['aspect_based_analysis']:
            try:
                self.aspect_analyzer = AspectSentimentAnalyzer()
                print("✅ Aspect analyzer initialized")
            except:
                print("❌ Could not initialize aspect analyzer")
        
        # Load sentiment model
        self._load_sentiment_model()
    
    def _load_sentiment_model(self):
        """Load sentiment analysis model"""
        model_name = self.config['model_name']
        
        if self.config['model_type'] == 'transformers' and TRANSFORMERS_AVAILABLE:
            try:
                print(f"Loading transformers model: {model_name}...")
                
                # Load tokenizer and model
                self.tokenizer = AutoTokenizer.from_pretrained(model_name)
                self.model = AutoModelForSequenceClassification.from_pretrained(model_name)
                
                # Create pipeline
                self.pipeline = pipeline(
                    "sentiment-analysis",
                    model=self.model,
                    tokenizer=self.tokenizer,
                    device=-1  # Use CPU
                )
                
                self.model_loaded = True
                print(f"✅ Transformers model loaded: {model_name}")
                
            except Exception as e:
                print(f"❌ Error loading transformers model: {e}")
                self._load_fallback_model()
        
        elif self.config['model_type'] == 'huggingface' and TRANSFORMERS_AVAILABLE:
            try:
                print(f"Loading Hugging Face pipeline: {model_name}...")
                self.pipeline = pipeline("sentiment-analysis", model=model_name)
                self.model_loaded = True
                print(f"✅ Hugging Face pipeline loaded: {model_name}")
                
            except Exception as e:
                print(f"❌ Error loading Hugging Face pipeline: {e}")
                self._load_fallback_model()
        
        else:
            self._load_fallback_model()
    
    def _load_fallback_model(self):
        """Load fallback model when primary fails"""
        print("Loading fallback sentiment model...")
        
        # Simple rule-based fallback
        self.model_loaded = True
        self.model_type = 'rule_based'
        
        print("✅ Fallback rule-based model loaded")
    
    def analyze(self, text: str, context: Dict = None) -> Dict:
        """
        Analyze sentiment of a single text
        
        Args:
            text: Text to analyze
            context: Optional context information
        
        Returns:
            Dictionary with sentiment analysis results
        """
        if not text or not isinstance(text, str):
            return self._create_error_result("Invalid text input")
        
        print(f"Analyzing sentiment for text: {text[:50]}...")
        
        try:
            # Base sentiment analysis
            if self.model_loaded and hasattr(self, 'pipeline'):
                # Use loaded model
                result = self.pipeline(text[:self.config['performance']['max_length']])[0]
                base_sentiment = {
                    'label': result['label'],
                    'score': result['score'],
                    'method': 'transformers'
                }
            else:
                # Use rule-based analysis
                base_sentiment = self._rule_based_sentiment(text)
            
            # Initialize result structure
            analysis = {
                'text': text,
                'base_sentiment': base_sentiment,
                'overall_sentiment': self._determine_overall_sentiment(base_sentiment),
                'metadata': {
                    'analyzed_at': datetime.now().isoformat(),
                    'text_length': len(text),
                    'model_used': base_sentiment.get('method', 'unknown')
                }
            }
            
            # Emotion detection
            if self.emotion_detector:
                try:
                    emotion_result = self.emotion_detector.detect_emotions(text)
                    analysis['emotion_analysis'] = emotion_result
                    
                    # Update overall sentiment based on emotion
                    if emotion_result.get('sentiment'):
                        analysis['overall_sentiment']['emotion_informed'] = True
                        analysis['overall_sentiment']['primary_emotion'] = emotion_result['dominant_emotion']
                except Exception as e:
                    print(f"Emotion detection error: {e}")
                    analysis['emotion_analysis'] = {'error': str(e)}
            
            # Aspect-based analysis
            if self.aspect_analyzer and len(text) > 20:  # Only for longer texts
                try:
                    aspect_result = self.aspect_analyzer.analyze_aspect_sentiment(text)
                    analysis['aspect_analysis'] = aspect_result
                    
                    # Generate improvement suggestions
                    if aspect_result.get('has_aspects'):
                        suggestions = self.aspect_analyzer.generate_improvement_suggestions(aspect_result)
                        analysis['improvement_suggestions'] = suggestions
                except Exception as e:
                    print(f"Aspect analysis error: {e}")
                    analysis['aspect_analysis'] = {'error': str(e)}
            
            # Extract keywords
            if self.config['features']['extract_keywords']:
                analysis['keywords'] = self._extract_keywords(text)
            
            # Calculate intensity
            if self.config['features']['calculate_intensity']:
                analysis['intensity'] = self._calculate_intensity(text, base_sentiment)
            
            # Add context if provided
            if context:
                analysis['context'] = context
                analysis['context_aware'] = self._apply_context(text, base_sentiment, context)
            
            # Calculate confidence
            analysis['confidence'] = self._calculate_confidence(analysis)
            
            # Determine if attention is needed
            analysis['requires_attention'] = self._requires_attention(analysis)
            
            print(f"✅ Sentiment analysis completed: {analysis['overall_sentiment']['label']}")
            
            return {
                'success': True,
                'analysis': analysis
            }
            
        except Exception as e:
            print(f"❌ Sentiment analysis error: {e}")
            import traceback
            traceback.print_exc()
            
            return {
                'success': False,
                'error': str(e),
                'analysis': {
                    'text': text[:100] + '...' if len(text) > 100 else text,
                    'error': True,
                    'metadata': {'analyzed_at': datetime.now().isoformat()}
                }
            }
    
    def analyze_batch(self, texts: List[str], contexts: List[Dict] = None) -> List[Dict]:
        """
        Analyze sentiment for multiple texts
        
        Args:
            texts: List of texts to analyze
            contexts: Optional list of context dictionaries
        
        Returns:
            List of analysis results
        """
        print(f"Analyzing {len(texts)} texts in batch...")
        
        results = []
        
        for i, text in enumerate(texts):
            context = contexts[i] if contexts and i < len(contexts) else None
            
            result = self.analyze(text, context)
            results.append(result)
            
            # Progress indicator
            if (i + 1) % 10 == 0:
                print(f"  Processed {i + 1}/{len(texts)} texts")
        
        # Generate batch statistics
        if results:
            batch_stats = self._generate_batch_statistics(results)
            print(f"✅ Batch analysis completed: {batch_stats}")
        
        return results
    
    def _rule_based_sentiment(self, text: str) -> Dict:
        """Rule-based sentiment analysis as fallback"""
        text_lower = text.lower()
        
        # Positive words
        positive_words = [
            'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic',
            'awesome', 'love', 'like', 'happy', 'pleased', 'satisfied', 'perfect'
        ]
        
        # Negative words
        negative_words = [
            'bad', 'poor', 'terrible', 'awful', 'horrible', 'hate', 'dislike',
            'worst', 'angry', 'disappointed', 'frustrated', 'unhappy', 'broken'
        ]
        
        # Intensifiers
        intensifiers = ['very', 'really', 'extremely', 'absolutely', 'completely']
        
        # Count occurrences
        pos_count = sum(1 for word in positive_words if word in text_lower)
        neg_count = sum(1 for word in negative_words if word in text_lower)
        
        # Check for intensifiers
        intensity = 1.0
        for intensifier in intensifiers:
            if intensifier in text_lower:
                intensity += 0.2
        
        # Determine sentiment
        if pos_count > neg_count:
            score = min(0.5 + (pos_count / 10) * intensity, 0.95)
            label = 'POSITIVE'
        elif neg_count > pos_count:
            score = min(0.5 + (neg_count / 10) * intensity, 0.95)
            label = 'NEGATIVE'
        else:
            score = 0.5
            label = 'NEUTRAL'
        
        # Adjust for negations
        if 'not' in text_lower or "n't" in text_lower:
            if label == 'POSITIVE':
                label = 'NEGATIVE'
                score = 1 - score
            elif label == 'NEGATIVE':
                label = 'POSITIVE'
                score = 1 - score
        
        return {
            'label': label,
            'score': score,
            'method': 'rule_based',
            'positive_words': pos_count,
            'negative_words': neg_count,
            'intensity': intensity
        }
    
    def _determine_overall_sentiment(self, base_sentiment: Dict) -> Dict:
        """Determine overall sentiment with confidence"""
        label = base_sentiment.get('label', 'NEUTRAL')
        score = base_sentiment.get('score', 0.5)
        
        # Map to our sentiment categories
        if label in ['POSITIVE', 'LABEL_1', '1']:
            sentiment_label = 'positive'
        elif label in ['NEGATIVE', 'LABEL_0', '0']:
            sentiment_label = 'negative'
        else:
            sentiment_label = 'neutral'
        
        # Calculate confidence
        if sentiment_label == 'neutral':
            confidence = 1 - abs(score - 0.5) * 2
        else:
            confidence = score
        
        # Determine strength
        if confidence > 0.8:
            strength = 'strong'
        elif confidence > 0.6:
            strength = 'moderate'
        else:
            strength = 'weak'
        
        return {
            'label': sentiment_label,
            'confidence': confidence,
            'strength': strength,
            'raw_label': label,
            'raw_score': score
        }
    
    def _extract_keywords(self, text: str, max_keywords: int = 10) -> List[str]:
        """Extract important keywords from text"""
        # Simple keyword extraction (can be enhanced with NLP)
        words = text.lower().split()
        
        # Remove common stopwords
        stopwords = {'the', 'and', 'is', 'in', 'to', 'of', 'a', 'for', 'on', 'with', 'as', 'by', 'at'}
        keywords = [word for word in words if word not in stopwords and len(word) > 3]
        
        # Count frequencies
        from collections import Counter
        keyword_counts = Counter(keywords)
        
        # Get most common keywords
        common_keywords = [word for word, count in keyword_counts.most_common(max_keywords)]
        
        return common_keywords
    
    def _calculate_intensity(self, text: str, sentiment: Dict) -> Dict:
        """Calculate sentiment intensity"""
        # Basic intensity calculation
        intensity_score = sentiment.get('score', 0.5)
        
        # Adjust based on text features
        text_features = {
            'length': len(text),
            'exclamation_count': text.count('!'),
            'question_count': text.count('?'),
            'capital_words': sum(1 for word in text.split() if word.isupper()),
            'emotive_words': self._count_emotive_words(text)
        }
        
        # Increase intensity for emotional text
        if text_features['exclamation_count'] > 0:
            intensity_score = min(intensity_score + 0.1, 1.0)
        
        if text_features['capital_words'] > 0:
            intensity_score = min(intensity_score + 0.05, 1.0)
        
        # Determine intensity level
        if intensity_score > 0.8:
            level = 'high'
        elif intensity_score > 0.6:
            level = 'medium'
        else:
            level = 'low'
        
        return {
            'score': intensity_score,
            'level': level,
            'features': text_features
        }
    
    def _count_emotive_words(self, text: str) -> int:
        """Count emotive/emotional words"""
        emotive_words = {
            'love', 'hate', 'angry', 'happy', 'sad', 'excited', 'disappointed',
            'furious', 'joy', 'rage', 'ecstatic', 'miserable', 'thrilled', 'devastated'
        }
        
        words = set(text.lower().split())
        return len(words.intersection(emotive_words))
    
    def _apply_context(self, text: str, sentiment: Dict, context: Dict) -> Dict:
        """Apply context to sentiment analysis"""
        context_aware = {
            'original_sentiment': sentiment,
            'adjusted': False,
            'adjustments': []
        }
        
        # Adjust based on context
        if context.get('domain') == 'customer_feedback':
            # Customer feedback often has stronger sentiment
            if sentiment['score'] > 0.7:
                context_aware['adjustments'].append('amplified_for_customer_feedback')
                context_aware['adjusted'] = True
        
        if context.get('user_type') == 'repeat_customer':
            # Repeat customers might have different expectations
            context_aware['adjustments'].append('considered_repeat_customer')
            context_aware['adjusted'] = True
        
        if context.get('product_price') and float(context.get('product_price', 0)) > 100:
            # High-priced items might have higher expectations
            if sentiment['label'] == 'NEGATIVE':
                context_aware['adjustments'].append('amplified_for_high_price')
                context_aware['adjusted'] = True
        
        return context_aware
    
    def _calculate_confidence(self, analysis: Dict) -> float:
        """Calculate confidence score for the analysis"""
        confidence = 0.0
        
        # Base confidence from model
        base_sentiment = analysis.get('base_sentiment', {})
        if base_sentiment.get('method') == 'transformers':
            confidence += 0.4
        elif base_sentiment.get('method') == 'rule_based':
            confidence += 0.2
        
        # Add score confidence
        score = base_sentiment.get('score', 0.5)
        confidence += min(abs(score - 0.5) * 0.4, 0.2)
        
        # Add text length confidence
        text_length = analysis.get('metadata', {}).get('text_length', 0)
        if text_length > 100:
            confidence += 0.2
        elif text_length > 50:
            confidence += 0.1
        else:
            confidence += 0.05
        
        # Add emotion detection confidence if available
        if analysis.get('emotion_analysis') and 'error' not in analysis['emotion_analysis']:
            confidence += 0.1
        
        # Add aspect analysis confidence if available
        if analysis.get('aspect_analysis') and 'error' not in analysis['aspect_analysis']:
            confidence += 0.1
        
        return min(confidence, 1.0)
    
    def _requires_attention(self, analysis: Dict) -> bool:
        """Determine if this analysis requires human attention"""
        overall_sentiment = analysis.get('overall_sentiment', {})
        
        # Negative sentiment with high confidence
        if (overall_sentiment.get('label') == 'negative' and 
            overall_sentiment.get('confidence', 0) > 0.7):
            return True
        
        # High intensity negative emotion
        emotion_analysis = analysis.get('emotion_analysis', {})
        if (emotion_analysis.get('dominant_emotion') in ['anger', 'disgust'] and
            emotion_analysis.get('dominant_score', 0) > 0.7):
            return True
        
        # Multiple negative aspects
        aspect_analysis = analysis.get('aspect_analysis', {})
        if aspect_analysis.get('has_aspects'):
            negative_aspects = aspect_analysis.get('aspect_summary', {}).get('negative_aspects', [])
            if len(negative_aspects) >= 2:
                return True
        
        return False
    
    def _generate_batch_statistics(self, results: List[Dict]) -> Dict:
        """Generate statistics for batch analysis"""
        successful = [r for r in results if r.get('success')]
        
        if not successful:
            return {'total': len(results), 'successful': 0}
        
        sentiments = []
        attention_required = 0
        
        for result in successful:
            analysis = result.get('analysis', {})
            overall = analysis.get('overall_sentiment', {})
            
            if overall:
                sentiments.append(overall.get('label', 'neutral'))
            
            if analysis.get('requires_attention'):
                attention_required += 1
        
        # Count sentiment distribution
        from collections import Counter
        sentiment_counts = Counter(sentiments)
        
        return {
            'total': len(results),
            'successful': len(successful),
            'sentiment_distribution': dict(sentiment_counts),
            'attention_required': attention_required,
            'success_rate': len(successful) / len(results) * 100
        }
    
    def _create_error_result(self, error_message: str) -> Dict:
        """Create error result"""
        return {
            'success': False,
            'error': error_message,
            'analysis': {
                'error': True,
                'metadata': {'analyzed_at': datetime.now().isoformat()}
            }
        }
    
    def get_model_info(self) -> Dict:
        """Get information about the loaded model"""
        info = {
            'model_loaded': self.model_loaded,
            'model_type': self.config['model_type'],
            'model_name': self.config['model_name'],
            'features': self.config['features'],
            'components': {
                'emotion_detector': self.emotion_detector is not None,
                'aspect_analyzer': self.aspect_analyzer is not None,
                'transformers_available': TRANSFORMERS_AVAILABLE,
                'pytorch_available': TORCH_AVAILABLE
            }
        }
        
        if hasattr(self, 'pipeline'):
            info['pipeline_loaded'] = True
            info['max_length'] = self.config['performance']['max_length']
        
        return info

# Main function for standalone execution
def analyze_sentiment(text: str, context: Dict = None) -> Dict:
    """
    Main function to analyze sentiment of text
    
    Args:
        text: Text to analyze
        context: Optional context information
    
    Returns:
        Dictionary with sentiment analysis
    """
    analyzer = SentimentAnalyzer()
    return analyzer.analyze(text, context)

# Example usage
if __name__ == "__main__":
    # Test with sample texts
    sample_texts = [
        "I absolutely loved this event! The speakers were amazing and the organization was perfect.",
        "Terrible experience. The venue was dirty and the staff was unhelpful.",
        "It was okay. The food could have been better but overall not bad.",
        "Worst event ever! Complete waste of time and money.",
        "Good value for the price. Will attend again next year."
    ]
    
    sample_contexts = [
        {'domain': 'event_feedback', 'user_type': 'first_time'},
        {'domain': 'event_feedback', 'user_type': 'repeat_customer'},
        {'domain': 'event_feedback', 'product_price': '50'},
        {'domain': 'event_feedback', 'product_price': '200'},
        {'domain': 'event_feedback', 'user_type': 'regular'}
    ]
    
    print("Testing sentiment analyzer...\n")
    
    for i, (text, context) in enumerate(zip(sample_texts, sample_contexts)):
        print(f"Sample {i + 1}:")
        print(f"  Text: {text[:50]}...")
        
        result = analyze_sentiment(text, context)
        
        if result['success']:
            analysis = result['analysis']
            overall = analysis['overall_sentiment']
            
            print(f"  Sentiment: {overall['label'].upper()} (confidence: {overall['confidence']:.2f})")
            print(f"  Strength: {overall['strength']}")
            
            if analysis.get('requires_attention'):
                print(f"  ⚠️  Requires attention!")
            
            if analysis.get('emotion_analysis'):
                emotion = analysis['emotion_analysis']
                print(f"  Emotion: {emotion.get('dominant_emotion', 'unknown')}")
            
            print()
        else:
            print(f"  ❌ Error: {result.get('error', 'Unknown error')}\n")
    
    # Test batch analysis
    print("\nTesting batch analysis...")
    batch_results = analyze_sentiment_batch(sample_texts, sample_contexts)
    
    if isinstance(batch_results, list):
        print(f"✅ Batch analysis completed: {len(batch_results)} results")
        
        # Count sentiments
        sentiments = []
        for result in batch_results:
            if result.get('success'):
                analysis = result['analysis']
                sentiments.append(analysis['overall_sentiment']['label'])
        
        from collections import Counter
        sentiment_counts = Counter(sentiments)
        print(f"Sentiment distribution: {dict(sentiment_counts)}")
    else:
        print(f"❌ Batch analysis failed: {batch_results.get('error', 'Unknown error')}")

def analyze_sentiment_batch(texts: List[str], contexts: List[Dict] = None) -> List[Dict]:
    """Batch sentiment analysis wrapper"""
    analyzer = SentimentAnalyzer()
    return analyzer.analyze_batch(texts, contexts)