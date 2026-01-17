"""
Insights Engine for Analytics Agent
Generates business insights from event data
"""
import pandas as pd
import numpy as np
from typing import Dict, List, Any, Tuple
from datetime import datetime, timedelta
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import PolynomialFeatures
import json

class InsightsEngine:
    def __init__(self):
        self.regression_model = LinearRegression()
        
    def analyze_event_performance(self, events_data: List[Dict]) -> Dict:
        """Analyze event performance metrics"""
        df = pd.DataFrame(events_data)
        
        insights = {
            "top_performing_events": [],
            "trends": {},
            "recommendations": [],
            "risk_alerts": []
        }
        
        # Calculate key metrics
        df['profit_margin'] = (df['revenue'] - df['cost']) / df['revenue'] * 100
        df['occupancy_rate'] = df['attendees'] / df['capacity'] * 100
        df['roi'] = (df['revenue'] - df['cost']) / df['cost'] * 100
        
        # Identify top performers
        top_events = df.nlargest(5, 'roi')
        insights["top_performing_events"] = top_events[['event_name', 'roi', 'profit_margin', 'attendees']].to_dict('records')
        
        # Analyze trends
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)
            
            # Monthly trends
            monthly_revenue = df['revenue'].resample('M').sum()
            insights["trends"]["monthly_revenue_growth"] = self._calculate_growth_rate(monthly_revenue)
            
            # Seasonal patterns
            insights["trends"]["seasonality"] = self._detect_seasonality(df)
        
        # Generate recommendations
        insights["recommendations"] = self._generate_recommendations(df)
        
        # Risk alerts
        insights["risk_alerts"] = self._identify_risks(df)
        
        return insights
    
    def _calculate_growth_rate(self, series: pd.Series) -> float:
        """Calculate growth rate"""
        if len(series) > 1:
            return ((series.iloc[-1] - series.iloc[0]) / series.iloc[0]) * 100
        return 0
    
    def _detect_seasonality(self, df: pd.DataFrame) -> Dict:
        """Detect seasonal patterns in event data"""
        seasonality = {}
        
        if 'month' in df.columns:
            monthly_avg = df.groupby('month')['revenue'].mean()
            peak_month = monthly_avg.idxmax()
            seasonality["peak_month"] = peak_month
            seasonality["peak_revenue"] = monthly_avg.max()
            
        if 'day_of_week' in df.columns:
            weekday_avg = df.groupby('day_of_week')['attendees'].mean()
            best_day = weekday_avg.idxmax()
            seasonality["best_day"] = best_day
        
        return seasonality
    
    def _generate_recommendations(self, df: pd.DataFrame) -> List[str]:
        """Generate business recommendations"""
        recommendations = []
        
        # Pricing recommendations
        avg_price = df['ticket_price'].mean()
        optimal_price = self._calculate_optimal_price(df)
        
        if avg_price < optimal_price * 0.8:
            recommendations.append(f"Consider increasing average ticket price from ${avg_price:.2f} to ${optimal_price:.2f}")
        
        # Capacity optimization
        avg_occupancy = df['occupancy_rate'].mean()
        if avg_occupancy > 85:
            recommendations.append("High occupancy rates detected. Consider increasing venue capacity or adding more events.")
        elif avg_occupancy < 50:
            recommendations.append("Low occupancy rates. Review marketing strategy and consider price adjustments.")
        
        # Event type optimization
        if 'event_type' in df.columns:
            event_type_performance = df.groupby('event_type')['roi'].mean()
            best_type = event_type_performance.idxmax()
            worst_type = event_type_performance.idxmin()
            
            recommendations.append(f"Focus on organizing more '{best_type}' events (ROI: {event_type_performance[best_type]:.1f}%)")
            recommendations.append(f"Review strategy for '{worst_type}' events or consider discontinuation")
        
        return recommendations
    
    def _calculate_optimal_price(self, df: pd.DataFrame) -> float:
        """Calculate optimal ticket price using elasticity analysis"""
        if len(df) < 10:
            return df['ticket_price'].mean() * 1.1
        
        # Simple elasticity model
        price_demand_corr = df['ticket_price'].corr(df['attendees'])
        
        if price_demand_corr > -0.3:  # Inelastic demand
            return df['ticket_price'].mean() * 1.15
        else:  # Elastic demand
            return df['ticket_price'].mean() * 1.05
    
    def _identify_risks(self, df: pd.DataFrame) -> List[str]:
        """Identify potential risks"""
        risks = []
        
        # Financial risks
        negative_roi = df[df['roi'] < 0]
        if len(negative_roi) > 0:
            risks.append(f"{len(negative_roi)} events with negative ROI detected")
        
        # Capacity risks
        overbooked = df[df['attendees'] > df['capacity']]
        if len(overbooked) > 0:
            risks.append(f"{len(overbooked)} events overbooked. Review capacity planning.")
        
        # Customer satisfaction risks
        if 'rating' in df.columns:
            low_rated = df[df['rating'] < 3]
            if len(low_rated) > 0:
                risks.append(f"{len(low_rated)} events with low ratings (<3). Quality improvement needed.")
        
        return risks
    
    def predict_future_performance(self, historical_data: List[Dict], periods: int = 6) -> Dict:
        """Predict future event performance"""
        df = pd.DataFrame(historical_data)
        
        if len(df) < 4:
            return {"error": "Insufficient data for prediction"}
        
        # Prepare data for time series prediction
        df['date'] = pd.to_datetime(df['date'])
        df = df.sort_values('date')
        df['time_index'] = range(len(df))
        
        # Simple linear regression for revenue prediction
        X = df[['time_index']].values
        y = df['revenue'].values
        
        self.regression_model.fit(X, y)
        
        # Predict next periods
        future_indices = np.array(range(len(df), len(df) + periods)).reshape(-1, 1)
        predictions = self.regression_model.predict(future_indices)
        
        # Generate confidence intervals
        residuals = y - self.regression_model.predict(X)
        std_error = np.std(residuals)
        confidence_interval = 1.96 * std_error  # 95% confidence
        
        return {
            "predictions": predictions.tolist(),
            "confidence_interval": confidence_interval,
            "growth_rate": self.regression_model.coef_[0],
            "next_period_forecast": predictions[0] if len(predictions) > 0 else 0
        }