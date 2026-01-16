"""
Fraud Model Training Module
Trains and evaluates fraud detection models
"""

import pandas as pd
import numpy as np
import pickle
import json
import os
import sys
from datetime import datetime
from typing import Dict, List, Any, Tuple, Optional
import warnings
warnings.filterwarnings('ignore')

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from fraud.feature_extractor import FraudFeatureExtractor
    from fraud.anomaly_detector import AnomalyDetector
except ImportError:
    print("Note: FeatureExtractor and AnomalyDetector not found")

# ML Libraries
try:
    from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
    from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import (classification_report, confusion_matrix, 
                               roc_auc_score, accuracy_score, precision_score, 
                               recall_score, f1_score)
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import Pipeline
    import xgboost as xgb
    ML_AVAILABLE = True
except ImportError as e:
    print(f"ML libraries not available: {e}")
    ML_AVAILABLE = False

class FraudModelTrainer:
    def __init__(self, config: Dict = None):
        """
        Initialize fraud model trainer
        
        Args:
            config: Configuration dictionary
        """
        self.config = config or {
            'test_size': 0.2,
            'random_state': 42,
            'cv_folds': 5,
            'models': {
                'random_forest': {
                    'n_estimators': 100,
                    'max_depth': 10,
                    'min_samples_split': 2
                },
                'gradient_boosting': {
                    'n_estimators': 100,
                    'learning_rate': 0.1,
                    'max_depth': 3
                },
                'logistic_regression': {
                    'C': 1.0,
                    'max_iter': 1000
                }
            },
            'feature_selection': {
                'method': 'importance',
                'threshold': 0.01
            },
            'training': {
                'save_model': True,
                'model_path': 'models/fraud_model.pkl',
                'evaluation_report': True,
                'cross_validation': True
            }
        }
        
        self.feature_extractor = None
        self.models = {}
        self.best_model = None
        self.training_history = []
        
        # Initialize components
        self._initialize_components()
    
    def _initialize_components(self):
        """Initialize all components"""
        # Initialize feature extractor
        try:
            self.feature_extractor = FraudFeatureExtractor()
        except:
            print("Warning: Could not initialize FeatureExtractor")
        
        # Initialize models if ML available
        if ML_AVAILABLE:
            self._initialize_models()
    
    def _initialize_models(self):
        """Initialize machine learning models"""
        rf_config = self.config['models']['random_forest']
        gb_config = self.config['models']['gradient_boosting']
        lr_config = self.config['models']['logistic_regression']
        
        self.models = {
            'random_forest': RandomForestClassifier(
                n_estimators=rf_config['n_estimators'],
                max_depth=rf_config['max_depth'],
                min_samples_split=rf_config['min_samples_split'],
                random_state=self.config['random_state'],
                class_weight='balanced',
                n_jobs=-1
            ),
            'gradient_boosting': GradientBoostingClassifier(
                n_estimators=gb_config['n_estimators'],
                learning_rate=gb_config['learning_rate'],
                max_depth=gb_config['max_depth'],
                random_state=self.config['random_state']
            ),
            'logistic_regression': Pipeline([
                ('scaler', StandardScaler()),
                ('classifier', LogisticRegression(
                    C=lr_config['C'],
                    max_iter=lr_config['max_iter'],
                    random_state=self.config['random_state'],
                    class_weight='balanced'
                ))
            ])
        }
        
        # Try XGBoost if available
        try:
            import xgboost as xgb
            self.models['xgboost'] = xgb.XGBClassifier(
                n_estimators=100,
                max_depth=3,
                learning_rate=0.1,
                random_state=self.config['random_state'],
                use_label_encoder=False,
                eval_metric='logloss'
            )
        except:
            print("XGBoost not available, skipping")
    
    def prepare_training_data(self, transactions: List[Dict], labels: List[int] = None) -> Tuple[pd.DataFrame, pd.Series]:
        """
        Prepare training data from transactions
        
        Args:
            transactions: List of transaction dictionaries
            labels: Optional list of labels (0 for legitimate, 1 for fraud)
        
        Returns:
            Tuple of (features DataFrame, labels Series)
        """
        print(f"Preparing training data from {len(transactions)} transactions...")
        
        if self.feature_extractor:
            # Use feature extractor to prepare data
            X = self.feature_extractor.prepare_training_data(transactions, labels)
            
            if labels is not None:
                y = pd.Series(labels)
                return X, y
            else:
                return X, None
        else:
            # Fallback: basic feature extraction
            return self._prepare_basic_training_data(transactions, labels)
    
    def _prepare_basic_training_data(self, transactions: List[Dict], labels: List[int] = None) -> Tuple[pd.DataFrame, pd.Series]:
        """Prepare basic training data without feature extractor"""
        features_list = []
        
        for i, transaction in enumerate(transactions):
            features = {}
            
            # Basic features
            features['amount'] = transaction.get('amount', 0)
            features['amount_log'] = np.log1p(features['amount'])
            
            # Payment method
            payment_method = transaction.get('payment_method', '')
            features['is_credit_card'] = 1 if payment_method == 'credit_card' else 0
            features['is_digital_wallet'] = 1 if payment_method in ['khalti', 'esewa'] else 0
            
            # Temporal features
            timestamp = transaction.get('timestamp', datetime.now().timestamp())
            if isinstance(timestamp, str):
                try:
                    dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                    timestamp = dt.timestamp()
                except:
                    dt = datetime.now()
            
            dt = datetime.fromtimestamp(timestamp)
            features['hour'] = dt.hour
            features['day_of_week'] = dt.weekday()
            features['is_weekend'] = 1 if dt.weekday() >= 5 else 0
            features['is_night'] = 1 if 0 <= dt.hour < 6 else 0
            
            # Device features
            device_info = transaction.get('device_info', {})
            features['device_mobile'] = 1 if device_info.get('type') == 'mobile' else 0
            
            # Session features
            features['session_duration'] = transaction.get('session_duration', 0)
            features['short_session'] = 1 if features['session_duration'] < 60 else 0
            
            # User features
            user_id = transaction.get('user_id')
            user_transactions = [t for t in transactions[:i] if t.get('user_id') == user_id]
            
            if user_transactions:
                features['user_transaction_count'] = len(user_transactions)
                features['user_avg_amount'] = np.mean([t.get('amount', 0) for t in user_transactions])
                features['amount_deviation'] = features['amount'] / features['user_avg_amount'] if features['user_avg_amount'] > 0 else 10
                
                # Recent transactions
                recent_hour = [t for t in user_transactions if 
                              datetime.fromtimestamp(t.get('timestamp', timestamp)).timestamp() > timestamp - 3600]
                features['recent_transactions'] = len(recent_hour)
            else:
                features['user_transaction_count'] = 0
                features['user_avg_amount'] = 0
                features['amount_deviation'] = 10
                features['recent_transactions'] = 0
            
            features_list.append(features)
        
        X = pd.DataFrame(features_list)
        
        if labels is not None and len(labels) == len(X):
            y = pd.Series(labels)
            return X, y
        else:
            return X, None
    
    def train(self, X: pd.DataFrame, y: pd.Series, model_type: str = 'random_forest') -> Dict:
        """
        Train a fraud detection model
        
        Args:
            X: Feature matrix
            y: Labels
            model_type: Type of model to train
        
        Returns:
            Dictionary with training results
        """
        if not ML_AVAILABLE:
            return {
                'success': False,
                'error': 'ML libraries not available',
                'model_type': model_type
            }
        
        if model_type not in self.models:
            return {
                'success': False,
                'error': f'Unknown model type: {model_type}',
                'available_models': list(self.models.keys())
            }
        
        print(f"Training {model_type} model...")
        
        try:
            # Split data
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, 
                test_size=self.config['test_size'],
                random_state=self.config['random_state'],
                stratify=y
            )
            
            # Handle class imbalance
            fraud_ratio = y_train.mean()
            if fraud_ratio < 0.1:
                print(f"Warning: Severe class imbalance detected ({fraud_ratio:.1%} fraud)")
            
            # Train model
            model = self.models[model_type]
            model.fit(X_train, y_train)
            
            # Evaluate
            y_pred = model.predict(X_test)
            y_pred_proba = model.predict_proba(X_test)[:, 1] if hasattr(model, 'predict_proba') else y_pred
            
            # Calculate metrics
            metrics = self._calculate_metrics(y_test, y_pred, y_pred_proba)
            
            # Cross-validation if configured
            cv_scores = None
            if self.config['training']['cross_validation']:
                try:
                    cv_scores = cross_val_score(
                        model, X_train, y_train,
                        cv=self.config['cv_folds'],
                        scoring='roc_auc'
                    )
                    metrics['cv_roc_auc_mean'] = cv_scores.mean()
                    metrics['cv_roc_auc_std'] = cv_scores.std()
                except:
                    print("Cross-validation failed")
            
            # Feature importance if available
            feature_importance = None
            if hasattr(model, 'feature_importances_'):
                feature_importance = self._extract_feature_importance(model, X.columns)
            
            # Save model if configured
            model_path = None
            if self.config['training']['save_model']:
                model_path = self.config['training']['model_path']
                self._save_model(model, model_path, X.columns)
            
            # Update best model
            if not self.best_model or metrics['roc_auc'] > self.best_model.get('metrics', {}).get('roc_auc', 0):
                self.best_model = {
                    'model_type': model_type,
                    'model': model,
                    'metrics': metrics,
                    'feature_importance': feature_importance,
                    'model_path': model_path,
                    'trained_at': datetime.now().isoformat()
                }
            
            # Save training history
            training_result = {
                'model_type': model_type,
                'metrics': metrics,
                'cv_scores': cv_scores.tolist() if cv_scores is not None else None,
                'feature_importance': feature_importance,
                'model_path': model_path,
                'trained_at': datetime.now().isoformat(),
                'data_info': {
                    'train_samples': len(X_train),
                    'test_samples': len(X_test),
                    'features': len(X.columns),
                    'fraud_ratio': float(fraud_ratio)
                }
            }
            
            self.training_history.append(training_result)
            
            print(f"✅ Training completed for {model_type}")
            print(f"   ROC-AUC: {metrics['roc_auc']:.3f}")
            print(f"   Accuracy: {metrics['accuracy']:.3f}")
            print(f"   Precision: {metrics['precision']:.3f}")
            print(f"   Recall: {metrics['recall']:.3f}")
            
            return {
                'success': True,
                'model_type': model_type,
                'metrics': metrics,
                'feature_importance': feature_importance,
                'model_path': model_path,
                'training_result': training_result
            }
            
        except Exception as e:
            print(f"❌ Training failed: {e}")
            import traceback
            traceback.print_exc()
            
            return {
                'success': False,
                'error': str(e),
                'model_type': model_type
            }
    
    def train_all_models(self, X: pd.DataFrame, y: pd.Series) -> Dict:
        """
        Train all available models and select the best one
        
        Args:
            X: Feature matrix
            y: Labels
        
        Returns:
            Dictionary with results for all models
        """
        if not ML_AVAILABLE:
            return {
                'success': False,
                'error': 'ML libraries not available'
            }
        
        results = {}
        
        for model_type in self.models.keys():
            print(f"\nTraining {model_type}...")
            result = self.train(X, y, model_type)
            results[model_type] = result
        
        # Determine best model
        best_model_type = None
        best_roc_auc = 0
        
        for model_type, result in results.items():
            if result.get('success') and 'metrics' in result:
                roc_auc = result['metrics'].get('roc_auc', 0)
                if roc_auc > best_roc_auc:
                    best_roc_auc = roc_auc
                    best_model_type = model_type
        
        # Save best model info
        if best_model_type:
            self.best_model['is_best'] = True
            
            # Save best model to standard location
            best_model_path = 'models/best_fraud_model.pkl'
            if self.best_model['model']:
                self._save_model(self.best_model['model'], best_model_path, X.columns)
            
            return {
                'success': True,
                'best_model': best_model_type,
                'best_roc_auc': best_roc_auc,
                'results': results,
                'best_model_path': best_model_path,
                'training_history': self.training_history
            }
        else:
            return {
                'success': False,
                'error': 'No model trained successfully',
                'results': results
            }
    
    def hyperparameter_tuning(self, X: pd.DataFrame, y: pd.Series, model_type: str = 'random_forest') -> Dict:
        """
        Perform hyperparameter tuning using GridSearchCV
        
        Args:
            X: Feature matrix
            y: Labels
            model_type: Type of model to tune
        
        Returns:
            Dictionary with tuning results
        """
        if not ML_AVAILABLE:
            return {
                'success': False,
                'error': 'ML libraries not available'
            }
        
        print(f"Performing hyperparameter tuning for {model_type}...")
        
        # Define parameter grids for different models
        param_grids = {
            'random_forest': {
                'n_estimators': [50, 100, 200],
                'max_depth': [5, 10, 20, None],
                'min_samples_split': [2, 5, 10],
                'min_samples_leaf': [1, 2, 4]
            },
            'gradient_boosting': {
                'n_estimators': [50, 100, 200],
                'learning_rate': [0.01, 0.1, 0.2],
                'max_depth': [3, 5, 7]
            },
            'logistic_regression': {
                'classifier__C': [0.1, 1.0, 10.0],
                'classifier__penalty': ['l1', 'l2'],
                'classifier__solver': ['liblinear']
            }
        }
        
        if model_type not in param_grids:
            return {
                'success': False,
                'error': f'No parameter grid defined for {model_type}'
            }
        
        try:
            # Split data
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, 
                test_size=self.config['test_size'],
                random_state=self.config['random_state'],
                stratify=y
            )
            
            # Perform grid search
            model = self.models[model_type]
            grid_search = GridSearchCV(
                model,
                param_grids[model_type],
                cv=self.config['cv_folds'],
                scoring='roc_auc',
                n_jobs=-1,
                verbose=1
            )
            
            grid_search.fit(X_train, y_train)
            
            # Get best model and parameters
            best_model = grid_search.best_estimator_
            best_params = grid_search.best_params_
            best_score = grid_search.best_score_
            
            # Evaluate on test set
            y_pred = best_model.predict(X_test)
            y_pred_proba = best_model.predict_proba(X_test)[:, 1]
            
            metrics = self._calculate_metrics(y_test, y_pred, y_pred_proba)
            
            # Save best model
            model_path = f'models/{model_type}_tuned.pkl'
            self._save_model(best_model, model_path, X.columns)
            
            # Update models dictionary with tuned model
            self.models[f'{model_type}_tuned'] = best_model
            
            return {
                'success': True,
                'model_type': model_type,
                'best_params': best_params,
                'best_cv_score': best_score,
                'test_metrics': metrics,
                'model_path': model_path,
                'grid_search_results': {
                    'mean_test_scores': grid_search.cv_results_['mean_test_score'].tolist(),
                    'params': grid_search.cv_results_['params']
                }
            }
            
        except Exception as e:
            print(f"❌ Hyperparameter tuning failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'model_type': model_type
            }
    
    def _calculate_metrics(self, y_true, y_pred, y_pred_proba=None) -> Dict:
        """Calculate evaluation metrics"""
        metrics = {
            'accuracy': accuracy_score(y_true, y_pred),
            'precision': precision_score(y_true, y_pred, zero_division=0),
            'recall': recall_score(y_true, y_pred, zero_division=0),
            'f1': f1_score(y_true, y_pred, zero_division=0)
        }
        
        if y_pred_proba is not None:
            metrics['roc_auc'] = roc_auc_score(y_true, y_pred_proba)
        
        # Confusion matrix
        cm = confusion_matrix(y_true, y_pred)
        metrics['confusion_matrix'] = {
            'true_negative': int(cm[0, 0]),
            'false_positive': int(cm[0, 1]),
            'false_negative': int(cm[1, 0]),
            'true_positive': int(cm[1, 1])
        }
        
        # Additional derived metrics
        tn, fp, fn, tp = cm.ravel()
        metrics['specificity'] = tn / (tn + fp) if (tn + fp) > 0 else 0
        metrics['false_positive_rate'] = fp / (fp + tn) if (fp + tn) > 0 else 0
        metrics['false_negative_rate'] = fn / (fn + tp) if (fn + tp) > 0 else 0
        
        # Classification report
        report = classification_report(y_true, y_pred, output_dict=True, zero_division=0)
        metrics['classification_report'] = report
        
        return metrics
    
    def _extract_feature_importance(self, model, feature_names) -> List[Dict]:
        """Extract feature importance from model"""
        try:
            if hasattr(model, 'feature_importances_'):
                importances = model.feature_importances_
            elif hasattr(model, 'coef_'):
                importances = np.abs(model.coef_[0])
            elif hasattr(model, 'named_steps') and 'classifier' in model.named_steps:
                # For pipeline models
                classifier = model.named_steps['classifier']
                if hasattr(classifier, 'coef_'):
                    importances = np.abs(classifier.coef_[0])
                else:
                    return []
            else:
                return []
            
            # Create list of feature importance
            importance_list = []
            for name, importance in zip(feature_names, importances):
                importance_list.append({
                    'feature': name,
                    'importance': float(importance),
                    'importance_percentage': float(importance * 100 / importances.sum() if importances.sum() > 0 else 0)
                })
            
            # Sort by importance
            importance_list.sort(key=lambda x: x['importance'], reverse=True)
            
            return importance_list[:20]  # Return top 20 features
            
        except:
            return []
    
    def _save_model(self, model, model_path: str, feature_names) -> bool:
        """Save model to file"""
        try:
            # Create directory if it doesn't exist
            os.makedirs(os.path.dirname(model_path), exist_ok=True)
            
            # Prepare model info
            model_info = {
                'model': model,
                'feature_names': list(feature_names),
                'trained_at': datetime.now().isoformat(),
                'model_type': type(model).__name__,
                'config': self.config
            }
            
            with open(model_path, 'wb') as f:
                pickle.dump(model_info, f)
            
            print(f"✅ Model saved to {model_path}")
            return True
            
        except Exception as e:
            print(f"❌ Error saving model: {e}")
            return False
    
    def load_model(self, model_path: str) -> Dict:
        """Load trained model from file"""
        try:
            with open(model_path, 'rb') as f:
                model_info = pickle.load(f)
            
            model = model_info['model']
            feature_names = model_info.get('feature_names', [])
            trained_at = model_info.get('trained_at')
            
            # Update models dictionary
            model_type = model_info.get('model_type', 'loaded_model')
            self.models[model_type] = model
            
            # Update best model
            self.best_model = {
                'model_type': model_type,
                'model': model,
                'feature_names': feature_names,
                'trained_at': trained_at,
                'model_path': model_path
            }
            
            print(f"✅ Model loaded from {model_path}")
            
            return {
                'success': True,
                'model_type': model_type,
                'feature_names': feature_names,
                'trained_at': trained_at,
                'model': model
            }
            
        except Exception as e:
            print(f"❌ Error loading model: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def generate_training_report(self) -> Dict:
        """Generate comprehensive training report"""
        if not self.training_history:
            return {
                'success': False,
                'error': 'No training history available'
            }
        
        report = {
            'generated_at': datetime.now().isoformat(),
            'total_trainings': len(self.training_history),
            'best_model': None,
            'model_comparison': [],
            'recommendations': []
        }
        
        # Find best model
        best_training = None
        best_roc_auc = 0
        
        for training in self.training_history:
            roc_auc = training['metrics'].get('roc_auc', 0)
            if roc_auc > best_roc_auc:
                best_roc_auc = roc_auc
                best_training = training
        
        if best_training:
            report['best_model'] = {
                'model_type': best_training['model_type'],
                'roc_auc': best_training['metrics']['roc_auc'],
                'accuracy': best_training['metrics']['accuracy'],
                'trained_at': best_training['trained_at']
            }
        
        # Model comparison
        for training in self.training_history:
            report['model_comparison'].append({
                'model_type': training['model_type'],
                'roc_auc': training['metrics'].get('roc_auc', 0),
                'accuracy': training['metrics'].get('accuracy', 0),
                'precision': training['metrics'].get('precision', 0),
                'recall': training['metrics'].get('recall', 0),
                'trained_at': training['trained_at']
            })
        
        # Generate recommendations
        if best_training and best_training['metrics']['roc_auc'] < 0.8:
            report['recommendations'].append({
                'priority': 'HIGH',
                'recommendation': 'Model performance below threshold (ROC-AUC < 0.8). Consider collecting more data or feature engineering.'
            })
        
        if best_training and best_training['data_info']['fraud_ratio'] < 0.1:
            report['recommendations'].append({
                'priority': 'MEDIUM',
                'recommendation': 'Severe class imbalance detected. Consider using different sampling techniques or adjusting class weights.'
            })
        
        # Feature importance if available
        if best_training and 'feature_importance' in best_training:
            top_features = best_training['feature_importance'][:5]
            report['top_features'] = [f['feature'] for f in top_features]
        
        return report
    
    def evaluate_on_new_data(self, X: pd.DataFrame, y: pd.Series, model_type: str = None) -> Dict:
        """
        Evaluate model on new data
        
        Args:
            X: Feature matrix of new data
            y: Labels of new data
            model_type: Specific model to evaluate (uses best model if None)
        
        Returns:
            Dictionary with evaluation results
        """
        if not self.best_model:
            return {
                'success': False,
                'error': 'No model available for evaluation'
            }
        
        model = self.best_model['model']
        if model_type and model_type in self.models:
            model = self.models[model_type]
        
        try:
            # Make predictions
            y_pred = model.predict(X)
            y_pred_proba = model.predict_proba(X)[:, 1] if hasattr(model, 'predict_proba') else None
            
            # Calculate metrics
            metrics = self._calculate_metrics(y, y_pred, y_pred_proba)
            
            # Calculate drift metrics if previous training exists
            drift_metrics = None
            if self.training_history:
                # Compare with best training performance
                best_training = None
                best_roc_auc = 0
                
                for training in self.training_history:
                    roc_auc = training['metrics'].get('roc_auc', 0)
                    if roc_auc > best_roc_auc:
                        best_roc_auc = roc_auc
                        best_training = training
                
                if best_training:
                    drift_metrics = {
                        'roc_auc_drift': metrics.get('roc_auc', 0) - best_training['metrics'].get('roc_auc', 0),
                        'accuracy_drift': metrics.get('accuracy', 0) - best_training['metrics'].get('accuracy', 0),
                        'performance_change': 'improved' if metrics.get('roc_auc', 0) > best_training['metrics'].get('roc_auc', 0) else 'declined'
                    }
            
            return {
                'success': True,
                'model_type': model_type or self.best_model['model_type'],
                'metrics': metrics,
                'drift_metrics': drift_metrics,
                'data_info': {
                    'samples': len(X),
                    'fraud_ratio': float(y.mean()),
                    'evaluated_at': datetime.now().isoformat()
                }
            }
            
        except Exception as e:
            print(f"❌ Evaluation failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }

# Main function for standalone execution
def train_fraud_model(transactions: List[Dict], labels: List[int], 
                     model_type: str = 'random_forest') -> Dict:
    """
    Main function to train fraud detection model
    
    Args:
        transactions: List of transaction dictionaries
        labels: List of labels (0 for legitimate, 1 for fraud)
        model_type: Type of model to train
    
    Returns:
        Dictionary with training results
    """
    if not ML_AVAILABLE:
        return {
            'success': False,
            'error': 'ML libraries not available. Install scikit-learn, xgboost, etc.'
        }
    
    if len(transactions) != len(labels):
        return {
            'success': False,
            'error': f'Mismatched data: {len(transactions)} transactions vs {len(labels)} labels'
        }
    
    print(f"Starting fraud model training with {len(transactions)} samples...")
    
    trainer = FraudModelTrainer()
    
    # Prepare data
    X, y = trainer.prepare_training_data(transactions, labels)
    
    print(f"Prepared {X.shape[0]} samples with {X.shape[1]} features")
    print(f"Fraud ratio: {y.mean():.1%}")
    
    # Train model
    result = trainer.train(X, y, model_type)
    
    if result['success']:
        print(f"\n✅ Training completed successfully!")
        print(f"Best model: {result['model_type']}")
        print(f"ROC-AUC: {result['metrics']['roc_auc']:.3f}")
        print(f"Model saved to: {result.get('model_path', 'Not saved')}")
    
    return result

# Example usage
if __name__ == "__main__":
    # Generate sample data for testing
    print("Generating sample data...")
    
    np.random.seed(42)
    n_samples = 1000
    
    # Generate sample transactions
    transactions = []
    labels = []
    
    for i in range(n_samples):
        # Generate legitimate (0) or fraud (1) with 10% fraud rate
        is_fraud = np.random.random() < 0.1
        labels.append(1 if is_fraud else 0)
        
        # Generate transaction features
        transaction = {
            'id': f'txn_{i}',
            'user_id': f'user_{np.random.randint(1, 100)}',
            'amount': np.random.exponential(100) + 10,
            'payment_method': np.random.choice(['credit_card', 'khalti', 'esewa', 'cash']),
            'timestamp': datetime.now().timestamp() - np.random.exponential(86400),
            'device_info': {
                'type': np.random.choice(['mobile', 'desktop', 'tablet']),
                'browser': np.random.choice(['chrome', 'firefox', 'safari', 'edge'])
            },
            'session_duration': np.random.exponential(300)
        }
        
        # Make fraudulent transactions different
        if is_fraud:
            transaction['amount'] *= np.random.uniform(3, 10)  # Higher amounts
            transaction['session_duration'] = np.random.exponential(30)  # Shorter sessions
        
        transactions.append(transaction)
    
    print(f"Generated {n_samples} transactions ({sum(labels)} fraudulent)")
    
    # Train model
    result = train_fraud_model(transactions, labels, model_type='random_forest')
    
    if result['success']:
        print("\n📊 Training Report:")
        print(f"   Model: {result['model_type']}")
        print(f"   ROC-AUC: {result['metrics']['roc_auc']:.3f}")
        print(f"   Accuracy: {result['metrics']['accuracy']:.3f}")
        print(f"   Precision: {result['metrics']['precision']:.3f}")
        print(f"   Recall: {result['metrics']['recall']:.3f}")
        
        # Show confusion matrix
        cm = result['metrics']['confusion_matrix']
        print(f"\n   Confusion Matrix:")
        print(f"      True Negatives: {cm['true_negative']}")
        print(f"      False Positives: {cm['false_positive']}")
        print(f"      False Negatives: {cm['false_negative']}")
        print(f"      True Positives: {cm['true_positive']}")
        
        # Show top features if available
        if result.get('feature_importance'):
            print(f"\n   Top 5 Features:")
            for feature in result['feature_importance'][:5]:
                print(f"      {feature['feature']}: {feature['importance_percentage']:.1f}%")
    else:
        print(f"\n❌ Training failed: {result.get('error', 'Unknown error')}")