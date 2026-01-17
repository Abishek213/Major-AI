"""
Anomaly Detection for Fraud Detection Agent
Uses unsupervised learning to detect anomalous patterns
"""
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from typing import Dict, List, Any, Tuple
import warnings
warnings.filterwarnings('ignore')

class AnomalyDetector:
    def __init__(self, contamination=0.1, random_state=42):
        self.model = IsolationForest(
            contamination=contamination,
            random_state=random_state,
            n_estimators=100
        )
        self.scaler = StandardScaler()
        self.is_fitted = False
        self.feature_columns = None
        
    def train(self, features: np.ndarray):
        """Train the anomaly detection model"""
        # Scale features
        features_scaled = self.scaler.fit_transform(features)
        
        # Train model
        self.model.fit(features_scaled)
        self.is_fitted = True
        self.feature_columns = list(range(features.shape[1]))
        
        # Calculate threshold (scores < threshold are anomalies)
        scores = self.model.score_samples(features_scaled)
        self.threshold = np.percentile(scores, 10)  # Bottom 10% are anomalies
        
        return self
    
    def detect(self, features: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Detect anomalies in new data"""
        if not self.is_fitted:
            raise ValueError("Model must be trained before detection")
        
        # Scale features
        features_scaled = self.scaler.transform(features)
        
        # Get anomaly scores (lower = more anomalous)
        scores = self.model.score_samples(features_scaled)
        
        # Predict anomalies (1 = normal, -1 = anomaly)
        predictions = self.model.predict(features_scaled)
        
        # Convert to binary (0 = normal, 1 = anomaly)
        anomalies = (predictions == -1).astype(int)
        
        return anomalies, scores
    
    def explain_anomaly(self, features: np.ndarray, feature_names: List[str] = None) -> List[Dict]:
        """Provide explanations for detected anomalies"""
        if not self.is_fitted:
            return []
        
        # Get decision path contributions (simplified)
        # In practice, use SHAP or LIME for proper explanations
        
        explanations = []
        features_scaled = self.scaler.transform(features)
        
        for i in range(features.shape[0]):
            score = self.model.score_samples([features_scaled[i]])[0]
            is_anomaly = score < self.threshold
            
            if is_anomaly:
                explanation = {
                    'index': i,
                    'anomaly_score': float(score),
                    'threshold': float(self.threshold),
                    'is_anomaly': True,
                    'contributing_factors': []
                }
                
                # Simple explanation: features far from 0 (after scaling)
                for j, value in enumerate(features_scaled[i]):
                    if abs(value) > 2:  # More than 2 std deviations
                        factor = {
                            'feature_index': j,
                            'feature_name': feature_names[j] if feature_names else f'feature_{j}',
                            'scaled_value': float(value),
                            'contribution': 'high' if abs(value) > 3 else 'medium'
                        }
                        explanation['contributing_factors'].append(factor)
                
                explanations.append(explanation)
        
        return explanations
    
    def calculate_risk_level(self, score: float) -> str:
        """Convert anomaly score to risk level"""
        if score < self.threshold - 1.0:
            return "CRITICAL"
        elif score < self.threshold - 0.5:
            return "HIGH"
        elif score < self.threshold:
            return "MEDIUM"
        elif score < self.threshold + 0.5:
            return "LOW"
        else:
            return "NORMAL"
    
    def update_model(self, new_data: np.ndarray, labels: np.ndarray = None):
        """Update model with new data (online learning)"""
        if not self.is_fitted:
            return self.train(new_data)
        
        # Combine with existing data (in practice, keep a buffer)
        # This is simplified - in production, use incremental learning
        features_scaled = self.scaler.transform(new_data)
        
        # Partial fit (IsolationForest doesn't support partial_fit)
        # For production, consider using One-Class SVM or autoencoder
        print("Note: IsolationForest doesn't support online learning.")
        print("Consider retraining periodically with accumulated data.")
        
        return self