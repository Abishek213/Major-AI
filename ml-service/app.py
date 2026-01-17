"""
Main Flask application for Python ML services
Integrates with Node.js AI agents
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import sys
import os

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import modules
from analytics.generate_reports import generate_event_analytics_report
from analytics.chart_generator import ChartGenerator
from analytics.insights_engine import InsightsEngine
from fraud.predict import FraudPredictor
from fraud.train import FraudModelTrainer
from fraud.feature_extractor import FraudFeatureExtractor
from fraud.anomaly_detector import AnomalyDetector
from sentiment.sentiment_model import SentimentAnalyzer
from sentiment.emotion_detector import EmotionDetector
from sentiment.aspect_based_sentiment import AspectSentimentAnalyzer

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize components
chart_generator = ChartGenerator()
insights_engine = InsightsEngine()
fraud_predictor = FraudPredictor()
feature_extractor = FraudFeatureExtractor()
sentiment_analyzer = SentimentAnalyzer()
emotion_detector = EmotionDetector()
aspect_analyzer = AspectSentimentAnalyzer()

# Load models (in production, use lazy loading)
try:
    fraud_predictor.load_model()
    print("Fraud detection model loaded successfully")
except Exception as e:
    print(f"Error loading fraud model: {e}")

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'services': {
            'analytics': 'available',
            'fraud_detection': 'available' if fraud_predictor.model_loaded else 'unavailable',
            'sentiment_analysis': 'available',
            'emotion_detection': 'available',
            'aspect_analysis': 'available'
        }
    })

@app.route('/api/analytics/generate-report', methods=['POST'])
def generate_report():
    """Generate analytics report"""
    try:
        data = request.json
        event_data = data.get('event_data', [])
        user_data = data.get('user_data', [])
        
        # Generate report
        report = generate_event_analytics_report(event_data, user_data)
        
        # Generate charts
        charts = {}
        if event_data:
            charts['booking_trends'] = chart_generator.generate_booking_trends_chart(event_data)
            
        if user_data:
            engagement_data = {
                'metrics': user_data,
                'feature_usage': data.get('feature_usage', {}),
                'conversion_funnel': data.get('conversion_funnel', {})
            }
            charts['user_engagement'] = chart_generator.generate_user_engagement_chart(engagement_data)
        
        # Generate insights
        insights = insights_engine.analyze_event_performance(event_data)
        
        # Future predictions
        predictions = insights_engine.predict_future_performance(event_data)
        
        return jsonify({
            'success': True,
            'report': report,
            'charts': charts,
            'insights': insights,
            'predictions': predictions,
            'timestamp': data.get('timestamp')
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/fraud/detect', methods=['POST'])
def detect_fraud():
    """Detect fraudulent transactions"""
    try:
        data = request.json
        transactions = data.get('transactions', [])
        
        results = []
        
        for transaction in transactions:
            # Extract features
            user_history = data.get('user_history', {}).get(transaction.get('user_id'), [])
            features = feature_extractor.extract_features(transaction, user_history)
            
            # Predict fraud
            prediction = fraud_predictor.predict(features)
            
            # Get confidence and explanation
            confidence = fraud_predictor.predict_proba(features)
            explanation = fraud_predictor.explain_prediction(features)
            
            result = {
                'transaction_id': transaction.get('id'),
                'user_id': transaction.get('user_id'),
                'amount': transaction.get('amount'),
                'is_fraud': bool(prediction),
                'fraud_probability': float(confidence[1]) if len(confidence) > 1 else 0.0,
                'risk_score': features.get('composite_risk_score', 0),
                'explanation': explanation,
                'recommended_action': 'BLOCK' if prediction else 'ALLOW',
                'features': {k: float(v) for k, v in features.items() if isinstance(v, (int, float))}
            }
            
            results.append(result)
        
        # Batch anomaly detection
        if transactions and fraud_predictor.model_loaded:
            feature_matrix = feature_extractor.prepare_training_data(transactions)
            anomalies, scores = fraud_predictor.detect_anomalies(feature_matrix)
            
            for i, result in enumerate(results):
                if i < len(anomalies):
                    result['is_anomaly'] = bool(anomalies[i])
                    result['anomaly_score'] = float(scores[i])
        
        return jsonify({
            'success': True,
            'results': results,
            'summary': {
                'total_transactions': len(results),
                'fraudulent_count': sum(1 for r in results if r['is_fraud']),
                'anomaly_count': sum(1 for r in results if r.get('is_anomaly', False)),
                'risk_distribution': {
                    'high': sum(1 for r in results if r['risk_score'] > 70),
                    'medium': sum(1 for r in results if 30 <= r['risk_score'] <= 70),
                    'low': sum(1 for r in results if r['risk_score'] < 30)
                }
            }
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/sentiment/analyze', methods=['POST'])
def analyze_sentiment():
    """Analyze sentiment of feedback text"""
    try:
        data = request.json
        feedback_list = data.get('feedback', [])
        analysis_type = data.get('analysis_type', 'basic')  # basic, emotion, aspect
        
        results = []
        
        for feedback in feedback_list:
            text = feedback.get('text', '')
            if not text:
                continue
            
            analysis_result = {}
            
            # Basic sentiment analysis
            if analysis_type in ['basic', 'emotion', 'aspect']:
                sentiment_result = sentiment_analyzer.analyze(text)
                analysis_result['sentiment'] = sentiment_result
            
            # Emotion detection
            if analysis_type in ['emotion', 'aspect']:
                emotion_result = emotion_detector.detect_emotions(text)
                analysis_result['emotion'] = emotion_result
            
            # Aspect-based analysis
            if analysis_type == 'aspect':
                aspect_result = aspect_analyzer.analyze_aspect_sentiment(text)
                analysis_result['aspect'] = aspect_result
                
                # Generate improvement suggestions
                suggestions = aspect_analyzer.generate_improvement_suggestions(aspect_result)
                analysis_result['suggestions'] = suggestions
            
            result = {
                'feedback_id': feedback.get('id'),
                'user_id': feedback.get('user_id'),
                'event_id': feedback.get('event_id'),
                'text_preview': text[:100] + '...' if len(text) > 100 else text,
                'analysis': analysis_result,
                'requires_attention': analysis_result.get('sentiment', {}).get('label') == 'NEGATIVE',
                'priority': feedback.get('priority', 1)
            }
            
            results.append(result)
        
        # Sort by priority and negative sentiment
        results.sort(key=lambda x: (
            x['requires_attention'],
            -x.get('analysis', {}).get('sentiment', {}).get('confidence', 0)
        ), reverse=True)
        
        # Generate summary
        if results:
            negative_count = sum(1 for r in results if r['requires_attention'])
            positive_count = sum(1 for r in results if r.get('analysis', {}).get('sentiment', {}).get('label') == 'POSITIVE')
            
            summary = {
                'total_feedback': len(results),
                'negative_feedback': negative_count,
                'positive_feedback': positive_count,
                'negative_percentage': (negative_count / len(results)) * 100 if results else 0,
                'top_issues': self._extract_top_issues(results) if analysis_type == 'aspect' else []
            }
        else:
            summary = {}
        
        return jsonify({
            'success': True,
            'results': results,
            'summary': summary,
            'analysis_type': analysis_type
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/sentiment/batch-analyze', methods=['POST'])
def batch_analyze_sentiment():
    """Batch analyze sentiment with emotion detection"""
    try:
        data = request.json
        feedback_list = data.get('feedback', [])
        
        results = emotion_detector.analyze_feedback_batch(feedback_list)
        
        return jsonify({
            'success': True,
            'results': results,
            'total_analyzed': len(results),
            'requires_attention': sum(1 for r in results if r['requires_attention']),
            'priority_distribution': {
                'high': sum(1 for r in results if r['priority'] > 0.7),
                'medium': sum(1 for r in results if 0.3 <= r['priority'] <= 0.7),
                'low': sum(1 for r in results if r['priority'] < 0.3)
            }
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/models/train', methods=['POST'])
def train_model():
    """Retrain ML models with new data"""
    try:
        data = request.json
        model_type = data.get('model_type')  # fraud, sentiment
        
        if model_type == 'fraud':
            training_data = data.get('training_data', [])
            labels = data.get('labels', [])
            
            if len(training_data) < 100:
                return jsonify({
                    'success': False,
                    'error': 'Insufficient training data (min 100 samples required)'
                }), 400
            
            # Prepare features
            feature_extractor = FraudFeatureExtractor()
            X = feature_extractor.prepare_training_data(training_data, labels)
            
            # Train model
            success = fraud_predictor.train(X, labels)
            
            if success:
                return jsonify({
                    'success': True,
                    'message': 'Fraud detection model trained successfully',
                    'model_info': fraud_predictor.get_model_info()
                })
            else:
                return jsonify({
                    'success': False,
                    'error': 'Model training failed'
                }), 500
        
        else:
            return jsonify({
                'success': False,
                'error': f'Unsupported model type: {model_type}'
            }), 400
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def _extract_top_issues(self, results: List[Dict]) -> List[str]:
    """Extract top issues from aspect analysis results"""
    issues = []
    
    for result in results:
        if result.get('analysis', {}).get('aspect', {}).get('has_aspects', False):
            aspects = result['analysis']['aspect']['aspect_summary']['improvement_areas']
            issues.extend(aspects)
    
    # Count frequencies
    from collections import Counter
    issue_counts = Counter(issues)
    
    return [{'issue': issue, 'count': count} for issue, count in issue_counts.most_common(5)]

if __name__ == '__main__':
    # Configuration
    port = int(os.environ.get('PORT', 5001))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    
    print(f"Starting Python ML Service on port {port}")
    print("Available endpoints:")
    print("  GET  /health")
    print("  POST /api/analytics/generate-report")
    print("  POST /api/fraud/detect")
    print("  POST /api/sentiment/analyze")
    print("  POST /api/sentiment/batch-analyze")
    print("  POST /api/models/train")
    
    app.run(host='0.0.0.0', port=port, debug=debug)