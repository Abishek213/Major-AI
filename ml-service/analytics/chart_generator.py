import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import io
import base64
from typing import Dict, List, Any, Optional
import json

class ChartGenerator:
    def __init__(self):
        plt.style.use('seaborn-v0_8-darkgrid')
        sns.set_palette("husl")
        
    def generate_booking_trends_chart(self, data: List[Dict]) -> str:
        """Generate booking trends chart for analytics agent"""
        try:
            df = pd.DataFrame(data)
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date')
            
            fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
            
            # Line chart for bookings over time
            ax1.plot(df['date'], df['bookings'], marker='o', linewidth=2)
            ax1.set_title('Daily Bookings Trend', fontsize=14, fontweight='bold')
            ax1.set_xlabel('Date')
            ax1.set_ylabel('Number of Bookings')
            ax1.grid(True, alpha=0.3)
            
            # Bar chart for booking types
            booking_types = df.groupby('event_type')['bookings'].sum()
            ax2.bar(booking_types.index, booking_types.values)
            ax2.set_title('Bookings by Event Type', fontsize=14, fontweight='bold')
            ax2.set_xlabel('Event Type')
            ax2.set_ylabel('Total Bookings')
            ax2.tick_params(axis='x', rotation=45)
            
            plt.tight_layout()
            
            # Convert to base64
            buf = io.BytesIO()
            plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
            buf.seek(0)
            img_str = base64.b64encode(buf.read()).decode('utf-8')
            plt.close()
            
            return f"data:image/png;base64,{img_str}"
            
        except Exception as e:
            print(f"Chart generation error: {e}")
            return ""
    
    def generate_revenue_chart(self, revenue_data: Dict) -> str:
        """Generate revenue breakdown charts"""
        try:
            fig, axes = plt.subplots(1, 2, figsize=(14, 6))
            
            # Pie chart for revenue sources
            sources = revenue_data.get('sources', {})
            labels = list(sources.keys())
            values = list(sources.values())
            
            axes[0].pie(values, labels=labels, autopct='%1.1f%%', startangle=90)
            axes[0].set_title('Revenue by Source', fontsize=12, fontweight='bold')
            
            # Bar chart for monthly revenue
            monthly = revenue_data.get('monthly', {})
            months = list(monthly.keys())
            revenue = list(monthly.values())
            
            axes[1].bar(months, revenue, color='skyblue')
            axes[1].set_title('Monthly Revenue', fontsize=12, fontweight='bold')
            axes[1].set_xlabel('Month')
            axes[1].set_ylabel('Revenue ($)')
            axes[1].tick_params(axis='x', rotation=45)
            
            plt.tight_layout()
            
            buf = io.BytesIO()
            plt.savefig(buf, format='png', dpi=100)
            buf.seek(0)
            img_str = base64.b64encode(buf.read()).decode('utf-8')
            plt.close()
            
            return f"data:image/png;base64,{img_str}"
            
        except Exception as e:
            print(f"Revenue chart error: {e}")
            return ""
    
    def generate_user_engagement_chart(self, engagement_data: Dict) -> str:
        """Generate user engagement metrics chart"""
        try:
            df = pd.DataFrame(engagement_data['metrics'])
            
            fig, axes = plt.subplots(2, 2, figsize=(12, 10))
            
            # User activity over time
            axes[0, 0].plot(df['date'], df['active_users'], color='green')
            axes[0, 0].set_title('Active Users')
            axes[0, 0].grid(True, alpha=0.3)
            
            # Session duration
            axes[0, 1].hist(df['avg_session_duration'], bins=20, color='orange', alpha=0.7)
            axes[0, 1].set_title('Session Duration Distribution')
            
            # Feature usage
            features = engagement_data.get('feature_usage', {})
            axes[1, 0].bar(features.keys(), features.values())
            axes[1, 0].set_title('Feature Usage')
            axes[1, 0].tick_params(axis='x', rotation=45)
            
            # Conversion funnel
            funnel = engagement_data.get('conversion_funnel', {})
            stages = list(funnel.keys())
            conversions = list(funnel.values())
            axes[1, 1].plot(stages, conversions, marker='s', linewidth=2)
            axes[1, 1].set_title('Conversion Funnel')
            axes[1, 1].grid(True, alpha=0.3)
            
            plt.tight_layout()
            
            buf = io.BytesIO()
            plt.savefig(buf, format='png', dpi=100)
            buf.seek(0)
            img_str = base64.b64encode(buf.read()).decode('utf-8')
            plt.close()
            
            return f"data:image/png;base64,{img_str}"
            
        except Exception as e:
            print(f"Engagement chart error: {e}")
            return ""