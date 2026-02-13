import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, accuracy_score
import joblib
import json
from datetime import datetime
import os

class NegotiationAIModel:
    def __init__(self, model_path=None):
        self.price_predictor = RandomForestRegressor(
            n_estimators=100,
            max_depth=10,
            random_state=42
        )
        
        self.acceptance_predictor = GradientBoostingClassifier(
            n_estimators=80,
            max_depth=5,
            learning_rate=0.1,
            random_state=42
        )
        
        self.concession_predictor = RandomForestRegressor(
            n_estimators=100,
            max_depth=8,
            random_state=42
        )
        
        self.scaler = StandardScaler()
        self.label_encoders = {}
        self.model_path = model_path or './models/negotiation'
        
    def extract_features(self, negotiation_data):
        """Extract features from negotiation history"""
        features = []
        
        for negotiation in negotiation_data:
            feature_vector = {
                # Price features
                'initial_user_offer': negotiation.get('initial_user_offer', 0),
                'initial_organizer_offer': negotiation.get('initial_organizer_offer', 0),
                'price_gap': negotiation.get('price_gap', 0),
                'price_gap_percentage': negotiation.get('price_gap_percentage', 0),
                
                # Event features
                'event_type_encoded': self._encode_category(negotiation.get('event_type', 'unknown')),
                'location_encoded': self._encode_category(negotiation.get('location', 'unknown')),
                'guest_count': negotiation.get('guest_count', 100),
                
                # Temporal features
                'month': negotiation.get('month', datetime.now().month),
                'is_wedding_season': 1 if negotiation.get('month', 0) in [11, 12, 1, 2] else 0,
                'is_festival_season': 1 if negotiation.get('month', 0) in [9, 10] else 0,
                
                # User behavior features
                'user_negotiation_history_count': negotiation.get('user_history_count', 0),
                'user_avg_acceptance_rate': negotiation.get('user_acceptance_rate', 0.5),
                'user_avg_concession_rate': negotiation.get('user_concession_rate', 0.15),
                
                # Organizer features
                'organizer_acceptance_rate': negotiation.get('organizer_acceptance_rate', 0.6),
                'organizer_avg_response_time': negotiation.get('organizer_response_time', 24),
                
                # Negotiation dynamics
                'current_round': negotiation.get('current_round', 1),
                'previous_concessions': negotiation.get('previous_concessions', 0),
                'total_concessions_so_far': negotiation.get('total_concessions', 0),
                
                # Market features
                'market_average_price': negotiation.get('market_average', 100000),
                'competitor_offers_count': negotiation.get('competitor_count', 0),
                'competitor_avg_price': negotiation.get('competitor_avg_price', 0),
            }
            
            features.append(feature_vector)
        
        return pd.DataFrame(features)
    
    def _encode_category(self, value):
        """Encode categorical variables"""
        if value not in self.label_encoders:
            self.label_encoders[value] = len(self.label_encoders) + 1
        return self.label_encoders[value]
    
    def train_price_prediction_model(self, historical_data):
        """Train model to predict optimal negotiation price"""
        df = self.extract_features(historical_data)
        
        # Target: final agreed price
        X = df.drop(['final_price'], axis=1, errors='ignore')
        y = df['final_price'] if 'final_price' in df.columns else None
        
        if y is not None:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42
            )
            
            X_train_scaled = self.scaler.fit_transform(X_train)
            X_test_scaled = self.scaler.transform(X_test)
            
            self.price_predictor.fit(X_train_scaled, y_train)
            
            predictions = self.price_predictor.predict(X_test_scaled)
            mae = mean_absolute_error(y_test, predictions)
            
            return {
                'mae': mae,
                'accuracy_score': 1 - (mae / y_test.mean())
            }
        return None
    
    def train_acceptance_model(self, historical_data):
        """Train model to predict if user will accept offer"""
        df = self.extract_features(historical_data)
        
        X = df.drop(['offer_accepted'], axis=1, errors='ignore')
        y = df['offer_accepted'] if 'offer_accepted' in df.columns else None
        
        if y is not None:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42
            )
            
            X_train_scaled = self.scaler.fit_transform(X_train)
            X_test_scaled = self.scaler.transform(X_test)
            
            self.acceptance_predictor.fit(X_train_scaled, y_train)
            
            predictions = self.acceptance_predictor.predict(X_test_scaled)
            accuracy = accuracy_score(y_test, predictions)
            
            return {
                'accuracy': accuracy,
                'feature_importance': dict(zip(
                    df.columns, 
                    self.acceptance_predictor.feature_importances_
                ))
            }
        return None
    
    def predict_optimal_counter(self, negotiation_context):
        """AI-powered counter-offer prediction"""
        # Extract features for this negotiation
        df = self.extract_features([negotiation_context])
        X = df.values
        
        # Scale features
        X_scaled = self.scaler.transform(X)
        
        # Predict optimal price
        predicted_price = self.price_predictor.predict(X_scaled)[0]
        
        # Predict acceptance probability for different price points
        price_points = []
        acceptance_probs = []
        
        base_price = negotiation_context.get('initial_organizer_offer', 0)
        min_price = base_price * 0.7
        max_price = base_price * 1.0
        
        for price in np.linspace(min_price, max_price, 5):
            context_copy = negotiation_context.copy()
            context_copy['current_organizer_offer'] = price
            df_temp = self.extract_features([context_copy])
            X_temp = self.scaler.transform(df_temp)
            
            acceptance_prob = self.acceptance_predictor.predict_proba(X_temp)[0][1]
            price_points.append(round(price))
            acceptance_probs.append(round(acceptance_prob, 3))
        
        # Find optimal price (max acceptance prob with reasonable price)
        optimal_index = np.argmax(acceptance_probs)
        optimal_price = price_points[optimal_index]
        
        # Predict user's concession pattern
        user_concession = self._predict_user_concession(negotiation_context)
        
        return {
            'optimal_price': optimal_price,
            'acceptance_probability': acceptance_probs[optimal_index],
            'price_points': price_points,
            'acceptance_curve': acceptance_probs,
            'recommended_concession': user_concession,
            'ai_confidence': self._calculate_confidence(negotiation_context),
            'strategy': self._determine_strategy(
                acceptance_probs[optimal_index], 
                negotiation_context.get('current_round', 1)
            )
        }
    
    def _predict_user_concession(self, context):
        """Predict how much user will concede"""
        df = self.extract_features([context])
        X_scaled = self.scaler.transform(df)
        
        predicted_concession = self.concession_predictor.predict(X_scaled)[0]
        return min(max(predicted_concession, 0.05), 0.3)  # Bound between 5-30%
    
    def _calculate_confidence(self, context):
        """Calculate AI confidence based on data availability"""
        if context.get('user_history_count', 0) > 5:
            return 'high'
        elif context.get('user_history_count', 0) > 2:
            return 'medium'
        else:
            return 'low'
    
    def _determine_strategy(self, acceptance_prob, round_num):
        """Determine negotiation strategy"""
        if acceptance_prob > 0.7:
            return 'aggressive'  # Push for better price
        elif acceptance_prob > 0.4:
            return 'balanced'    # Fair compromise
        else:
            return 'conservative' # Make attractive offer
    
    def save_models(self):
        """Save trained models"""
        os.makedirs(self.model_path, exist_ok=True)
        
        joblib.dump(self.price_predictor, f'{self.model_path}/price_predictor.pkl')
        joblib.dump(self.acceptance_predictor, f'{self.model_path}/acceptance_predictor.pkl')
        joblib.dump(self.concession_predictor, f'{self.model_path}/concession_predictor.pkl')
        joblib.dump(self.scaler, f'{self.model_path}/scaler.pkl')
        
        with open(f'{self.model_path}/label_encoders.json', 'w') as f:
            json.dump(self.label_encoders, f)
    
    def load_models(self):
        """Load trained models"""
        try:
            self.price_predictor = joblib.load(f'{self.model_path}/price_predictor.pkl')
            self.acceptance_predictor = joblib.load(f'{self.model_path}/acceptance_predictor.pkl')
            self.concession_predictor = joblib.load(f'{self.model_path}/concession_predictor.pkl')
            self.scaler = joblib.load(f'{self.model_path}/scaler.pkl')
            
            with open(f'{self.model_path}/label_encoders.json', 'r') as f:
                self.label_encoders = json.load(f)
            
            return True
        except:
            return False

class NegotiationPatternAnalyzer:
    """Analyze negotiation patterns and user behavior"""
    
    @staticmethod
    def analyze_user_behavior(negotiation_history):
        """Analyze user's negotiation patterns"""
        if not negotiation_history:
            return {}
        
        df = pd.DataFrame(negotiation_history)
        
        analysis = {
            'avg_concession_rate': df['concession_rate'].mean() if 'concession_rate' in df else 0,
            'avg_response_time': df['response_time'].mean() if 'response_time' in df else 0,
            'acceptance_rate': df['accepted'].mean() if 'accepted' in df else 0,
            'preferred_price_range': {
                'min': df['final_price'].min() if 'final_price' in df else 0,
                'max': df['final_price'].max() if 'final_price' in df else 0,
                'avg': df['final_price'].mean() if 'final_price' in df else 0
            },
            'negotiation_style': NegotiationPatternAnalyzer._classify_style(df),
            'price_sensitivity': NegotiationPatternAnalyzer._calculate_price_sensitivity(df),
            'peak_negotiation_times': NegotiationPatternAnalyzer._analyze_temporal_patterns(df)
        }
        
        return analysis
    
    @staticmethod
    def _classify_style(df):
        """Classify user's negotiation style"""
        if 'concession_rate' not in df or len(df) < 2:
            return 'unknown'
        
        avg_concession = df['concession_rate'].mean()
        avg_acceptance = df['accepted'].mean() if 'accepted' in df else 0
        
        if avg_concession > 0.2 and avg_acceptance > 0.7:
            return 'cooperative'  # Concedes well, accepts often
        elif avg_concession < 0.1 and avg_acceptance < 0.3:
            return 'competitive'  # Hard to negotiate, rarely accepts
        elif avg_concession > 0.15:
            return 'flexible'     # Willing to compromise
        else:
            return 'cautious'     # Slow to move
    
    @staticmethod
    def _calculate_price_sensitivity(df):
        """Calculate how price-sensitive the user is"""
        if 'price_gap' not in df or 'accepted' not in df:
            return 'unknown'
        
        correlation = df['price_gap'].corr(df['accepted'])
        
        if correlation < -0.5:
            return 'high'    # Strongly prefers lower prices
        elif correlation < -0.2:
            return 'medium'
        else:
            return 'low'     # Price not primary factor
    
    @staticmethod
    def _analyze_temporal_patterns(df):
        """Analyze when user typically negotiates"""
        if 'hour' not in df:
            return {}
        
        hour_counts = df['hour'].value_counts()
        
        if not hour_counts.empty:
            peak_hour = hour_counts.index[0]
            if 6 <= peak_hour <= 11:
                time_of_day = 'morning'
            elif 12 <= peak_hour <= 16:
                time_of_day = 'afternoon'
            elif 17 <= peak_hour <= 21:
                time_of_day = 'evening'
            else:
                time_of_day = 'night'
            
            return {
                'peak_hour': int(peak_hour),
                'time_of_day': time_of_day,
                'activity_count': int(hour_counts.iloc[0])
            }
        
        return {}