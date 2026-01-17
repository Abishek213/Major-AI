"""
Fraud Prediction Module
Predicts fraudulent transactions using trained ML models
"""

import pickle
import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional, Tuple
import json
import os
import sys
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from fraud.feature_extractor import FraudFeatureExtractor
    from fraud.anomaly_detector import AnomalyDetector
except ImportError:
    print("Note: FeatureExtractor and AnomalyDetector not found, using basic functionality")

class FraudPredictor:
    def __init__(self, model_path: str = None, config: Dict = None):
        """
        Initialize fraud predictor
        
        Args:
            model_path: Path to trained model file
            config: Configuration dictionary
        """
        self.config = config or {
            'threshold': 0.8,
            'risk_categories': {
                'LOW': 0.0,
                'MEDIUM': 0.3,
                'HIGH': 0.7,
                'CRITICAL': 0.9
            },
            'feature_config': {
                'include_user_history': True,
                'include_temporal_features': True,
                'include_device_features': True
            }
        }
        
        self.model = None
        self.model_loaded = False
        self.feature_extractor = None
        self.anomaly_detector = None
        
        # Initialize components
        self._initialize_components(model_path)
    
    def _initialize_components(self, model_path: str = None):
        """Initialize all components"""
        # Initialize feature extractor
        try:
            self.feature_extractor = FraudFeatureExtractor()
        except:
            print("Warning: Could not initialize FeatureExtractor")
        
        # Initialize anomaly detector
        try:
            self.anomaly_detector = AnomalyDetector()
        except:
            print("Warning: Could not initialize AnomalyDetector")
        
        # Load model
        if model_path and os.path.exists(model_path):
            self.load_model(model_path)
        else:
            # Try default paths
            default_paths = [
                os.path.join(os.path.dirname(__file__), 'models', 'fraud_model.pkl'),
                os.path.join(os.path.dirname(__file__), 'fraud_model.pkl'),
                'fraud_model.pkl'
            ]
            
            for path in default_paths:
                if os.path.exists(path):
                    self.load_model(path)
                    break
        
        if not self.model_loaded:
            print("Warning: No model loaded, using rule-based detection")
    
    def load_model(self, model_path: str) -> bool:
        """
        Load trained model from file
        
        Args:
            model_path: Path to model file
        
        Returns:
            Boolean indicating success
        """
        try:
            with open(model_path, 'rb') as f:
                self.model = pickle.load(f)
            
            self.model_loaded = True
            self.model_path = model_path
            print(f"✅ Model loaded from {model_path}")
            
            # Initialize anomaly detector with model if available
            if self.anomaly_detector and hasattr(self.model, 'feature_importances_'):
                # Get feature importances for anomaly detection
                pass
            
            return True
            
        except Exception as e:
            print(f"❌ Error loading model: {e}")
            self.model_loaded = False
            return False
    
    def save_model(self, model_path: str) -> bool:
        """
        Save current model to file
        
        Args:
            model_path: Path to save model
        
        Returns:
            Boolean indicating success
        """
        if not self.model:
            print("No model to save")
            return False
        
        try:
            # Create directory if it doesn't exist
            os.makedirs(os.path.dirname(model_path), exist_ok=True)
            
            with open(model_path, 'wb') as f:
                pickle.dump(self.model, f)
            
            print(f"✅ Model saved to {model_path}")
            return True
            
        except Exception as e:
            print(f"❌ Error saving model: {e}")
            return False
    
    def predict(self, features: Dict) -> Tuple[bool, float, Dict]:
        """
        Predict if transaction is fraudulent
        
        Args:
            features: Dictionary of transaction features
        
        Returns:
            Tuple of (is_fraud, probability, explanation)
        """
        try:
            # If model is loaded, use it
            if self.model_loaded and self.model:
                # Convert features to DataFrame
                feature_df = pd.DataFrame([features])
                
                # Ensure all required features are present
                feature_df = self._ensure_feature_columns(feature_df)
                
                # Make prediction
                if hasattr(self.model, 'predict_proba'):
                    probabilities = self.model.predict_proba(feature_df)[0]
                    fraud_probability = float(probabilities[1])  # Assuming index 1 is fraud
                else:
                    prediction = self.model.predict(feature_df)[0]
                    fraud_probability = 1.0 if prediction == 1 else 0.0
                
                is_fraud = fraud_probability >= self.config['threshold']
                
                # Generate explanation
                explanation = self.explain_prediction(features, fraud_probability)
                
                return is_fraud, fraud_probability, explanation
            
            else:
                # Fallback to rule-based prediction
                return self._rule_based_prediction(features)
                
        except Exception as e:
            print(f"Prediction error: {e}")
            # Fallback to rule-based
            return self._rule_based_prediction(features)
    
    def predict_batch(self, transactions: List[Dict], user_history: Dict = None) -> List[Dict]:
        """
        Predict fraud for multiple transactions
        
        Args:
            transactions: List of transaction dictionaries
            user_history: Optional dictionary of user transaction history
        
        Returns:
            List of prediction results
        """
        results = []
        
        for i, transaction in enumerate(transactions):
            try:
                # Get user history for this transaction
                user_id = transaction.get('user_id')
                history = []
                
                if user_history and user_id and user_id in user_history:
                    history = user_history[user_id]
                
                # Extract features
                if self.feature_extractor:
                    features = self.feature_extractor.extract_features(transaction, history)
                else:
                    features = self._extract_basic_features(transaction, history)
                
                # Make prediction
                is_fraud, probability, explanation = self.predict(features)
                
                # Calculate risk score
                risk_score = self._calculate_risk_score(features, probability)
                risk_level = self._determine_risk_level(risk_score)
                
                # Generate result
                result = {
                    'transaction_id': transaction.get('id', f'txn_{i}'),
                    'user_id': user_id,
                    'amount': transaction.get('amount'),
                    'timestamp': transaction.get('timestamp', datetime.now().isoformat()),
                    'prediction': {
                        'is_fraud': bool(is_fraud),
                        'probability': float(probability),
                        'confidence': min(probability * 100, 100)
                    },
                    'risk_assessment': {
                        'score': float(risk_score),
                        'level': risk_level,
                        'factors': explanation.get('risk_factors', [])
                    },
                    'explanation': explanation,
                    'recommended_action': self._get_recommended_action(is_fraud, risk_level),
                    'features': self._sanitize_features(features)
                }
                
                # Add anomaly detection if available
                if self.anomaly_detector and self.model_loaded:
                    try:
                        # Convert features to array for anomaly detection
                        feature_array = self._features_to_array(features)
                        if feature_array is not None:
                            anomalies, scores = self.anomaly_detector.detect(feature_array.reshape(1, -1))
                            result['anomaly_detection'] = {
                                'is_anomaly': bool(anomalies[0]),
                                'anomaly_score': float(scores[0])
                            }
                    except:
                        pass
                
                results.append(result)
                
            except Exception as e:
                print(f"Error processing transaction {i}: {e}")
                # Add error result
                results.append({
                    'transaction_id': transaction.get('id', f'txn_{i}'),
                    'error': str(e),
                    'success': False
                })
        
        return results
    
    def _rule_based_prediction(self, features: Dict) -> Tuple[bool, float, Dict]:
        """
        Rule-based fraud prediction (fallback when model is not available)
        
        Args:
            features: Dictionary of features
        
        Returns:
            Tuple of (is_fraud, probability, explanation)
        """
        risk_factors = []
        risk_score = 0
        
        # Rule 1: High amount deviation
        amount_deviation = features.get('amount_deviation_ratio', 1)
        if amount_deviation > 5:
            risk_score += 40
            risk_factors.append('EXTREME_AMOUNT_DEVIATION')
        elif amount_deviation > 3:
            risk_score += 25
            risk_factors.append('HIGH_AMOUNT_DEVIATION')
        
        # Rule 2: High velocity
        hourly_velocity = features.get('hourly_velocity', 0)
        if hourly_velocity > 10:
            risk_score += 35
            risk_factors.append('EXTREME_TRANSACTION_VELOCITY')
        elif hourly_velocity > 5:
            risk_score += 20
            risk_factors.append('HIGH_TRANSACTION_VELOCITY')
        
        # Rule 3: Night hours
        if features.get('is_night_hours', 0) == 1:
            risk_score += 15
            risk_factors.append('NIGHT_TRANSACTION')
        
        # Rule 4: Short session
        if features.get('short_session', 0) == 1:
            risk_score += 20
            risk_factors.append('SHORT_SESSION')
        
        # Rule 5: New user with high amount
        if features.get('is_first_transaction', False) and features.get('transaction_amount', 0) > 100:
            risk_score += 30
            risk_factors.append('NEW_USER_HIGH_AMOUNT')
        
        # Rule 6: Multiple payment failures
        failure_rate = features.get('previous_failure_rate', 0)
        if failure_rate > 0.5:
            risk_score += 25
            risk_factors.append('HIGH_FAILURE_HISTORY')
        
        # Calculate probability (0 to 1)
        probability = min(risk_score / 100, 1.0)
        
        # Determine if fraud
        is_fraud = probability >= self.config['threshold']
        
        # Generate explanation
        explanation = {
            'method': 'rule_based',
            'risk_factors': risk_factors,
            'risk_score': risk_score,
            'rules_applied': len(risk_factors),
            'confidence': probability * 100
        }
        
        return is_fraud, probability, explanation
    
    def _extract_basic_features(self, transaction: Dict, history: List[Dict] = None) -> Dict:
        """Extract basic features without feature extractor"""
        features = {}
        
        # Transaction features
        features['transaction_amount'] = transaction.get('amount', 0)
        features['amount_log'] = np.log1p(features['transaction_amount'])
        
        # Payment method
        payment_method = transaction.get('payment_method', '')
        features['payment_method_credit_card'] = 1 if payment_method == 'credit_card' else 0
        features['payment_method_digital'] = 1 if payment_method in ['khalti', 'esewa'] else 0
        
        # Temporal features
        timestamp = transaction.get('timestamp', datetime.now().timestamp())
        if isinstance(timestamp, str):
            try:
                dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                timestamp = dt.timestamp()
            except:
                dt = datetime.now()
        
        dt = datetime.fromtimestamp(timestamp)
        features['hour_of_day'] = dt.hour
        features['day_of_week'] = dt.weekday()
        features['is_weekend'] = 1 if dt.weekday() >= 5 else 0
        features['is_night_hours'] = 1 if 0 <= dt.hour < 6 else 0
        
        # Device features
        device_info = transaction.get('device_info', {})
        features['device_type_mobile'] = 1 if device_info.get('type') == 'mobile' else 0
        features['browser_chrome'] = 1 if device_info.get('browser') == 'chrome' else 0
        
        # Session features
        features['session_duration'] = transaction.get('session_duration', 0)
        features['short_session'] = 1 if features['session_duration'] < 60 else 0
        
        # User history features
        if history:
            features['total_transaction_count'] = len(history)
            
            # Calculate average amount
            amounts = [h.get('amount', 0) for h in history if h.get('amount')]
            if amounts:
                features['avg_transaction_amount'] = np.mean(amounts)
                current_amount = transaction.get('amount', 0)
                if features['avg_transaction_amount'] > 0:
                    features['amount_deviation_ratio'] = current_amount / features['avg_transaction_amount']
                else:
                    features['amount_deviation_ratio'] = 10
            else:
                features['amount_deviation_ratio'] = 10
            
            # Count recent transactions
            now = datetime.now().timestamp()
            recent_hour = [h for h in history if h.get('timestamp', 0) > now - 3600]
            recent_day = [h for h in history if h.get('timestamp', 0) > now - 86400]
            
            features['transactions_last_hour'] = len(recent_hour)
            features['transactions_last_24h'] = len(recent_day)
            features['hourly_velocity'] = len(recent_hour) / 1
            features['daily_velocity'] = len(recent_day) / 24
            
            # Failure rate
            failures = [h for h in history if h.get('status') == 'failed']
            features['previous_failure_rate'] = len(failures) / len(history) if history else 0
        else:
            features['is_first_transaction'] = 1
            features['total_transaction_count'] = 0
            features['amount_deviation_ratio'] = 10
            features['transactions_last_hour'] = 0
            features['transactions_last_24h'] = 0
            features['hourly_velocity'] = 0
            features['daily_velocity'] = 0
            features['previous_failure_rate'] = 0
        
        # Derived features
        risk_score = 0
        if features.get('amount_deviation_ratio', 1) > 3:
            risk_score += 30
            features['high_amount_deviation'] = 1
        else:
            features['high_amount_deviation'] = 0
        
        if features.get('hourly_velocity', 0) > 5:
            risk_score += 25
            features['high_hourly_velocity'] = 1
        else:
            features['high_hourly_velocity'] = 0
        
        if features.get('is_night_hours', 0) == 1:
            risk_score += 15
            features['night_transaction'] = 1
        else:
            features['night_transaction'] = 0
        
        if features.get('short_session', 0) == 1:
            risk_score += 20
            features['short_session_flag'] = 1
        else:
            features['short_session_flag'] = 0
        
        if features.get('previous_failure_rate', 0) > 0.3:
            risk_score += 25
            features['high_failure_history'] = 1
        else:
            features['high_failure_history'] = 0
        
        if features.get('is_first_transaction', 0) == 1 and features.get('transaction_amount', 0) > 100:
            risk_score += 35
            features['new_user_high_amount'] = 1
        else:
            features['new_user_high_amount'] = 0
        
        features['composite_risk_score'] = min(risk_score, 100)
        
        return features
    
    def _ensure_feature_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Ensure all required feature columns are present"""
        # Define expected columns (simplified)
        expected_columns = [
            'transaction_amount', 'amount_log', 'hour_of_day', 'day_of_week',
            'is_weekend', 'is_night_hours', 'session_duration', 'short_session',
            'total_transaction_count', 'amount_deviation_ratio', 'hourly_velocity',
            'previous_failure_rate', 'composite_risk_score'
        ]
        
        for col in expected_columns:
            if col not in df.columns:
                df[col] = 0
        
        return df
    
    def explain_prediction(self, features: Dict, probability: float = None) -> Dict:
        """
        Explain the prediction with human-readable reasons
        
        Args:
            features: Feature dictionary
            probability: Prediction probability
        
        Returns:
            Dictionary with explanation
        """
        explanation = {
            'factors': [],
            'contributions': [],
            'risk_factors': [],
            'confidence': probability * 100 if probability else 0
        }
        
        # Analyze features for explanations
        if features.get('high_amount_deviation', 0) == 1:
            deviation = features.get('amount_deviation_ratio', 1)
            explanation['factors'].append(f"Amount is {deviation:.1f}x higher than user's average")
            explanation['contributions'].append(30)
            explanation['risk_factors'].append('HIGH_AMOUNT_DEVIATION')
        
        if features.get('high_hourly_velocity', 0) == 1:
            velocity = features.get('hourly_velocity', 0)
            explanation['factors'].append(f"High transaction frequency ({velocity:.1f}/hour)")
            explanation['contributions'].append(25)
            explanation['risk_factors'].append('HIGH_TRANSACTION_VELOCITY')
        
        if features.get('night_transaction', 0) == 1:
            hour = features.get('hour_of_day', 0)
            explanation['factors'].append(f"Transaction occurred during unusual hours ({hour}:00)")
            explanation['contributions'].append(15)
            explanation['risk_factors'].append('NIGHT_TRANSACTION')
        
        if features.get('short_session_flag', 0) == 1:
            duration = features.get('session_duration', 0)
            explanation['factors'].append(f"Very short session duration ({duration}s)")
            explanation['contributions'].append(20)
            explanation['risk_factors'].append('SHORT_SESSION')
        
        if features.get('high_failure_history', 0) == 1:
            failure_rate = features.get('previous_failure_rate', 0)
            explanation['factors'].append(f"High previous failure rate ({failure_rate:.0%})")
            explanation['contributions'].append(25)
            explanation['risk_factors'].append('HIGH_FAILURE_HISTORY')
        
        if features.get('new_user_high_amount', 0) == 1:
            amount = features.get('transaction_amount', 0)
            explanation['factors'].append(f"New user with high amount (${amount:.2f})")
            explanation['contributions'].append(35)
            explanation['risk_factors'].append('NEW_USER_HIGH_AMOUNT')
        
        # Add device anomalies if available
        if features.get('device_anomaly', 0) == 1:
            explanation['factors'].append("Unusual device or location pattern")
            explanation['contributions'].append(20)
            explanation['risk_factors'].append('DEVICE_ANOMALY')
        
        # Calculate total contribution
        total_contribution = sum(explanation['contributions'])
        if total_contribution > 0:
            # Normalize contributions to percentage of risk score
            explanation['contributions'] = [
                (c / total_contribution) * 100 for c in explanation['contributions']
            ]
        
        # Add summary
        if probability:
            if probability >= 0.9:
                explanation['summary'] = "Very high fraud risk"
            elif probability >= 0.7:
                explanation['summary'] = "High fraud risk"
            elif probability >= 0.5:
                explanation['summary'] = "Moderate fraud risk"
            else:
                explanation['summary'] = "Low fraud risk"
        
        return explanation
    
    def _calculate_risk_score(self, features: Dict, probability: float) -> float:
        """Calculate comprehensive risk score"""
        base_score = probability * 100
        
        # Adjust based on transaction amount
        amount = features.get('transaction_amount', 0)
        if amount > 1000:
            base_score *= 1.2
        elif amount > 500:
            base_score *= 1.1
        
        # Adjust based on user history
        if features.get('is_first_transaction', 0) == 1:
            base_score *= 1.3
        
        # Cap at 100
        return min(base_score, 100)
    
    def _determine_risk_level(self, risk_score: float) -> str:
        """Determine risk level based on score"""
        if risk_score >= 90:
            return 'CRITICAL'
        elif risk_score >= 70:
            return 'HIGH'
        elif risk_score >= 30:
            return 'MEDIUM'
        else:
            return 'LOW'
    
    def _get_recommended_action(self, is_fraud: bool, risk_level: str) -> Dict:
        """Get recommended action based on fraud prediction and risk level"""
        if is_fraud or risk_level == 'CRITICAL':
            return {
                'action': 'BLOCK',
                'reason': 'High fraud probability',
                'steps': ['Block transaction', 'Flag account', 'Notify security team']
            }
        elif risk_level == 'HIGH':
            return {
                'action': 'REVIEW',
                'reason': 'Suspicious activity detected',
                'steps': ['Require additional verification', 'Review manually', 'Monitor account']
            }
        elif risk_level == 'MEDIUM':
            return {
                'action': 'MONITOR',
                'reason': 'Moderate risk detected',
                'steps': ['Allow transaction', 'Monitor for patterns', 'Update risk profile']
            }
        else:
            return {
                'action': 'ALLOW',
                'reason': 'Low risk transaction',
                'steps': ['Process normally']
            }
    
    def _sanitize_features(self, features: Dict) -> Dict:
        """Sanitize features for output (remove sensitive/verbose data)"""
        sanitized = {}
        
        for key, value in features.items():
            # Skip complex objects
            if isinstance(value, (dict, list)):
                continue
            
            # Skip sensitive patterns
            sensitive_patterns = ['password', 'token', 'secret', 'key', 'cvv', 'pin']
            if any(pattern in key.lower() for pattern in sensitive_patterns):
                sanitized[key] = '[REDACTED]'
            else:
                # Convert numpy types to Python types
                if hasattr(value, 'item'):
                    sanitized[key] = value.item()
                else:
                    sanitized[key] = value
        
        return sanitized
    
    def _features_to_array(self, features: Dict) -> Optional[np.ndarray]:
        """Convert features dictionary to numpy array"""
        try:
            # Convert to DataFrame
            df = pd.DataFrame([features])
            
            # Select numeric columns
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            
            if len(numeric_cols) > 0:
                return df[numeric_cols].values
            else:
                return None
                
        except:
            return None
    
    def get_model_info(self) -> Dict:
        """Get information about the loaded model"""
        if not self.model_loaded:
            return {
                'model_loaded': False,
                'method': 'rule_based',
                'threshold': self.config['threshold']
            }
        
        info = {
            'model_loaded': True,
            'model_path': getattr(self, 'model_path', 'unknown'),
            'model_type': type(self.model).__name__ if self.model else 'unknown',
            'threshold': self.config['threshold'],
            'feature_extractor_available': self.feature_extractor is not None,
            'anomaly_detector_available': self.anomaly_detector is not None
        }
        
        # Add model-specific info
        if self.model:
            if hasattr(self.model, 'n_features_in_'):
                info['n_features'] = self.model.n_features_in_
            
            if hasattr(self.model, 'feature_importances_'):
                info['has_feature_importances'] = True
            
            if hasattr(self.model, 'classes_'):
                info['classes'] = self.model.classes_.tolist()
        
        return info

# Main function for standalone execution
def predict_fraud(transaction: Dict, user_history: List[Dict] = None) -> Dict:
    """
    Main function to predict fraud for a single transaction
    
    Args:
        transaction: Transaction dictionary
        user_history: Optional user transaction history
    
    Returns:
        Dictionary with prediction results
    """
    predictor = FraudPredictor()
    results = predictor.predict_batch([transaction], 
                                     {transaction.get('user_id', 'unknown'): user_history or []})
    
    if results and 'error' not in results[0]:
        return results[0]
    else:
        return {
            'error': 'Prediction failed',
            'transaction_id': transaction.get('id', 'unknown')
        }

# Example usage
if __name__ == "__main__":
    # Sample transaction for testing
    sample_transaction = {
        'id': 'test_txn_1',
        'user_id': 'user_123',
        'amount': 999.99,
        'payment_method': 'credit_card',
        'timestamp': datetime.now().isoformat(),
        'device_info': {
            'type': 'mobile',
            'browser': 'chrome',
            'os': 'android'
        },
        'session_duration': 45,
        'ip_address': '192.168.1.100'
    }
    
    # Sample user history
    sample_history = [
        {'amount': 50.00, 'timestamp': datetime.now().timestamp() - 3600, 'status': 'completed'},
        {'amount': 75.00, 'timestamp': datetime.now().timestamp() - 7200, 'status': 'completed'},
        {'amount': 1000.00, 'timestamp': datetime.now().timestamp() - 10800, 'status': 'failed'}
    ]
    
    print("Testing fraud prediction...")
    result = predict_fraud(sample_transaction, sample_history)
    
    if 'error' not in result:
        print(f"✅ Prediction completed")
        print(f"Transaction ID: {result['transaction_id']}")
        print(f"Fraud Prediction: {result['prediction']['is_fraud']}")
        print(f"Probability: {result['prediction']['probability']:.3f}")
        print(f"Risk Level: {result['risk_assessment']['level']}")
        print(f"Recommended Action: {result['recommended_action']['action']}")
        
        if result['explanation']['factors']:
            print("\nExplanation Factors:")
            for factor in result['explanation']['factors']:
                print(f"  - {factor}")
    else:
        print(f"❌ Prediction failed: {result['error']}")