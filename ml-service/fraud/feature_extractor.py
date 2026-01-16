"""
Feature extraction for fraud detection model
Extracts relevant features from booking and user data
"""
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, List, Any
import hashlib

class FraudFeatureExtractor:
    def __init__(self):
        self.user_profiles = {}
        self.device_fingerprints = {}
        
    def extract_features(self, transaction_data: Dict, user_history: List[Dict] = None) -> Dict:
        """Extract features for fraud prediction"""
        features = {}
        
        # Transaction features
        features.update(self._extract_transaction_features(transaction_data))
        
        # User behavior features
        if user_history:
            features.update(self._extract_user_behavior_features(transaction_data, user_history))
        
        # Temporal features
        features.update(self._extract_temporal_features(transaction_data))
        
        # Device and network features
        features.update(self._extract_technical_features(transaction_data))
        
        # Derived features
        features.update(self._calculate_derived_features(features))
        
        return features
    
    def _extract_transaction_features(self, transaction: Dict) -> Dict:
        """Extract features from transaction data"""
        features = {}
        
        # Amount-based features
        amount = transaction.get('amount', 0)
        features['transaction_amount'] = amount
        features['amount_log'] = np.log1p(amount)
        
        # Frequency features
        features['is_first_transaction'] = transaction.get('is_first', False)
        features['transaction_count_today'] = transaction.get('daily_count', 0)
        
        # Payment method features
        payment_method = transaction.get('payment_method', '')
        features['payment_method_credit_card'] = 1 if payment_method == 'credit_card' else 0
        features['payment_method_digital'] = 1 if payment_method in ['khalti', 'esewa'] else 0
        
        return features
    
    def _extract_user_behavior_features(self, transaction: Dict, history: List[Dict]) -> Dict:
        """Extract features from user behavior history"""
        if not history:
            return {}
        
        df = pd.DataFrame(history)
        
        features = {}
        
        # Calculate statistics
        if len(df) > 0:
            features['avg_transaction_amount'] = df['amount'].mean()
            features['std_transaction_amount'] = df['amount'].std()
            features['total_transaction_count'] = len(df)
            
            # Current transaction compared to history
            current_amount = transaction.get('amount', 0)
            avg_amount = features['avg_transaction_amount']
            
            if avg_amount > 0:
                features['amount_deviation_ratio'] = current_amount / avg_amount
            else:
                features['amount_deviation_ratio'] = 10  # High ratio for new users
            
            # Time between transactions
            if 'timestamp' in df.columns:
                df['timestamp'] = pd.to_datetime(df['timestamp'])
                time_diffs = df['timestamp'].diff().dt.total_seconds()
                features['avg_time_between_transactions'] = time_diffs.mean() if len(time_diffs) > 1 else 0
            
            # Failure rate
            features['previous_failure_rate'] = (df['status'] == 'failed').mean()
        
        # Velocity features
        now = datetime.now()
        last_hour = now.timestamp() - 3600
        last_24h = now.timestamp() - 86400
        
        recent_hour = [t for t in history if t.get('timestamp', 0) > last_hour]
        recent_day = [t for t in history if t.get('timestamp', 0) > last_24h]
        
        features['transactions_last_hour'] = len(recent_hour)
        features['transactions_last_24h'] = len(recent_day)
        features['hourly_velocity'] = len(recent_hour) / 1  # per hour
        features['daily_velocity'] = len(recent_day) / 24   # per hour
        
        return features
    
    def _extract_temporal_features(self, transaction: Dict) -> Dict:
        """Extract time-based features"""
        features = {}
        
        timestamp = transaction.get('timestamp', datetime.now().timestamp())
        dt = datetime.fromtimestamp(timestamp)
        
        # Time features
        features['hour_of_day'] = dt.hour
        features['day_of_week'] = dt.weekday()
        features['day_of_month'] = dt.day
        features['is_weekend'] = 1 if dt.weekday() >= 5 else 0
        
        # Time-based patterns
        features['is_night_hours'] = 1 if 0 <= dt.hour < 6 else 0
        features['is_business_hours'] = 1 if 9 <= dt.hour < 17 else 0
        
        # Seasonality
        features['month'] = dt.month
        features['is_holiday_season'] = 1 if dt.month in [11, 12] else 0  # Nov-Dec
        
        return features
    
    def _extract_technical_features(self, transaction: Dict) -> Dict:
        """Extract device and network features"""
        features = {}
        
        device_info = transaction.get('device_info', {})
        ip_address = transaction.get('ip_address', '')
        
        # Device features
        features['device_type'] = device_info.get('type', 'unknown')
        features['browser'] = device_info.get('browser', 'unknown')
        features['os'] = device_info.get('os', 'unknown')
        
        # IP-based features (simplified)
        if ip_address:
            # Simple IP grouping
            features['ip_prefix'] = '.'.join(ip_address.split('.')[:2])
            
            # Hash for anonymization
            ip_hash = hashlib.md5(ip_address.encode()).hexdigest()[:8]
            features['ip_hash'] = int(ip_hash, 16) % 10000
        
        # Session features
        session_duration = transaction.get('session_duration', 0)
        features['session_duration'] = session_duration
        features['short_session'] = 1 if session_duration < 60 else 0  # Less than 1 minute
        
        return features
    
    def _calculate_derived_features(self, features: Dict) -> Dict:
        """Calculate derived/engineered features"""
        derived = {}
        
        # Risk score components
        risk_score = 0
        
        # High amount deviation
        if features.get('amount_deviation_ratio', 1) > 3:
            risk_score += 30
            derived['high_amount_deviation'] = 1
        else:
            derived['high_amount_deviation'] = 0
        
        # High velocity
        if features.get('hourly_velocity', 0) > 5:
            risk_score += 25
            derived['high_hourly_velocity'] = 1
        else:
            derived['high_hourly_velocity'] = 0
        
        # Night hours
        if features.get('is_night_hours', 0) == 1:
            risk_score += 15
            derived['night_transaction'] = 1
        else:
            derived['night_transaction'] = 0
        
        # Short session
        if features.get('short_session', 0) == 1:
            risk_score += 20
            derived['short_session_flag'] = 1
        else:
            derived['short_session_flag'] = 0
        
        # Previous failures
        if features.get('previous_failure_rate', 0) > 0.3:
            risk_score += 25
            derived['high_failure_history'] = 1
        else:
            derived['high_failure_history'] = 0
        
        # New user with high amount
        if features.get('is_first_transaction', False) and features.get('transaction_amount', 0) > 100:
            risk_score += 35
            derived['new_user_high_amount'] = 1
        else:
            derived['new_user_high_amount'] = 0
        
        derived['composite_risk_score'] = min(risk_score, 100)
        
        return derived
    
    def prepare_training_data(self, transactions: List[Dict], labels: List[int] = None) -> pd.DataFrame:
        """Prepare data for model training"""
        features_list = []
        
        for i, transaction in enumerate(transactions):
            # Get user history (previous transactions)
            user_id = transaction.get('user_id')
            user_history = []
            
            # In practice, you would fetch user history from database
            # This is simplified
            for j in range(i):
                if transactions[j].get('user_id') == user_id:
                    user_history.append(transactions[j])
            
            features = self.extract_features(transaction, user_history)
            
            if labels is not None and i < len(labels):
                features['is_fraud'] = labels[i]
            
            features_list.append(features)
        
        return pd.DataFrame(features_list)