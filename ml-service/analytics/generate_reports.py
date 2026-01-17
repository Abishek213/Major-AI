"""
Generate Reports Module for Analytics Agent
Generates comprehensive analytics reports from event data
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import json
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from analytics.chart_generator import ChartGenerator
    from analytics.insights_engine import InsightsEngine
except ImportError:
    # Fallback if modules aren't available
    print("Note: ChartGenerator and InsightsEngine not found, using basic functionality")

class ReportGenerator:
    def __init__(self):
        """Initialize report generator with components"""
        try:
            self.chart_generator = ChartGenerator()
            self.insights_engine = InsightsEngine()
        except:
            self.chart_generator = None
            self.insights_engine = None
            
        self.report_templates = self._load_report_templates()
    
    def _load_report_templates(self) -> Dict:
        """Load report templates"""
        return {
            'event_performance': {
                'title': 'Event Performance Report',
                'sections': ['summary', 'metrics', 'trends', 'recommendations']
            },
            'user_engagement': {
                'title': 'User Engagement Report',
                'sections': ['summary', 'activity', 'retention', 'conversion']
            },
            'financial_analysis': {
                'title': 'Financial Analysis Report',
                'sections': ['revenue', 'expenses', 'profitability', 'forecast']
            },
            'comprehensive': {
                'title': 'Comprehensive Analytics Report',
                'sections': ['executive_summary', 'detailed_analysis', 'insights', 'action_items']
            }
        }
    
    def generate_event_analytics_report(self, 
                                      event_data: List[Dict], 
                                      user_data: List[Dict] = None,
                                      report_type: str = 'comprehensive',
                                      include_charts: bool = True) -> Dict:
        """
        Generate comprehensive event analytics report
        
        Args:
            event_data: List of event dictionaries
            user_data: Optional user engagement data
            report_type: Type of report to generate
            include_charts: Whether to include chart data
        
        Returns:
            Dictionary containing complete report
        """
        print(f"Generating {report_type} analytics report for {len(event_data)} events...")
        
        try:
            # Convert to DataFrame
            df_events = pd.DataFrame(event_data)
            
            # Initialize report structure
            report = {
                'metadata': {
                    'report_id': f'report_{int(datetime.now().timestamp())}',
                    'generated_at': datetime.now().isoformat(),
                    'report_type': report_type,
                    'event_count': len(event_data),
                    'time_period': self._detect_time_period(df_events)
                },
                'summary': {},
                'analysis': {},
                'insights': {},
                'recommendations': [],
                'charts': {}
            }
            
            # Generate summary statistics
            report['summary'] = self._generate_summary_statistics(df_events)
            
            # Generate detailed analysis
            report['analysis'] = self._generate_detailed_analysis(df_events)
            
            # Generate insights if engine available
            if self.insights_engine:
                report['insights'] = self.insights_engine.analyze_event_performance(event_data)
                
                # Add predictions
                if len(event_data) >= 10:  # Need sufficient data for predictions
                    predictions = self.insights_engine.predict_future_performance(event_data)
                    report['insights']['predictions'] = predictions
            
            # Generate recommendations
            report['recommendations'] = self._generate_recommendations(report['analysis'], report['insights'])
            
            # Generate charts if requested and generator available
            if include_charts and self.chart_generator and len(event_data) > 0:
                report['charts'] = self._generate_charts(df_events, user_data)
            
            # Add executive summary
            report['executive_summary'] = self._generate_executive_summary(report)
            
            # Calculate report confidence score
            report['metadata']['confidence_score'] = self._calculate_confidence_score(report)
            
            print(f"✅ Report generated successfully (confidence: {report['metadata']['confidence_score']}%)")
            
            return {
                'success': True,
                'report': report,
                'metadata': report['metadata']
            }
            
        except Exception as e:
            print(f"❌ Error generating report: {e}")
            import traceback
            traceback.print_exc()
            
            return {
                'success': False,
                'error': str(e),
                'report': {
                    'metadata': {
                        'report_id': f'error_{int(datetime.now().timestamp())}',
                        'generated_at': datetime.now().isoformat(),
                        'error': True
                    },
                    'summary': {},
                    'analysis': {},
                    'insights': {},
                    'recommendations': []
                }
            }
    
    def _detect_time_period(self, df: pd.DataFrame) -> Dict:
        """Detect the time period covered by the data"""
        time_period = {
            'start': None,
            'end': None,
            'duration_days': 0
        }
        
        # Try different date column names
        date_columns = ['date', 'start_date', 'createdAt', 'timestamp', 'event_date']
        
        for col in date_columns:
            if col in df.columns:
                try:
                    df[col] = pd.to_datetime(df[col])
                    time_period['start'] = df[col].min().isoformat()
                    time_period['end'] = df[col].max().isoformat()
                    time_period['duration_days'] = (df[col].max() - df[col].min()).days
                    break
                except:
                    continue
        
        return time_period
    
    def _generate_summary_statistics(self, df: pd.DataFrame) -> Dict:
        """Generate summary statistics from event data"""
        summary = {
            'total_events': len(df),
            'total_revenue': 0,
            'total_attendees': 0,
            'average_rating': 0,
            'success_rate': 0,
            'top_performing_category': None
        }
        
        # Calculate revenue if available
        revenue_columns = ['revenue', 'total_amount', 'price', 'ticket_sales']
        for col in revenue_columns:
            if col in df.columns:
                summary['total_revenue'] = float(df[col].sum())
                summary['average_revenue_per_event'] = float(df[col].mean())
                break
        
        # Calculate attendees if available
        attendee_columns = ['attendees', 'participants', 'ticket_count', 'capacity_filled']
        for col in attendee_columns:
            if col in df.columns:
                summary['total_attendees'] = int(df[col].sum())
                summary['average_attendees_per_event'] = float(df[col].mean())
                break
        
        # Calculate ratings if available
        if 'rating' in df.columns:
            summary['average_rating'] = float(df['rating'].mean())
            summary['rating_distribution'] = {
                '5_star': int((df['rating'] >= 4.5).sum()),
                '4_star': int(((df['rating'] >= 3.5) & (df['rating'] < 4.5)).sum()),
                '3_star': int(((df['rating'] >= 2.5) & (df['rating'] < 3.5)).sum()),
                '2_star': int(((df['rating'] >= 1.5) & (df['rating'] < 2.5)).sum()),
                '1_star': int((df['rating'] < 1.5).sum())
            }
        
        # Calculate success rate based on status or completion
        if 'status' in df.columns:
            success_statuses = ['completed', 'successful', 'published', 'active']
            summary['success_rate'] = float((df['status'].isin(success_statuses)).mean() * 100)
        
        # Find top performing category
        if 'category' in df.columns:
            category_stats = df.groupby('category').agg({
                'revenue': 'sum' if 'revenue' in df.columns else None,
                'attendees': 'sum' if 'attendees' in df.columns else None,
                'rating': 'mean' if 'rating' in df.columns else None
            }).reset_index()
            
            if not category_stats.empty:
                # Find category with highest revenue or attendees
                if 'revenue' in category_stats.columns:
                    top_category = category_stats.loc[category_stats['revenue'].idxmax()]
                    summary['top_performing_category'] = {
                        'category': top_category['category'],
                        'revenue': float(top_category['revenue']),
                        'event_count': int((df['category'] == top_category['category']).sum())
                    }
        
        return summary
    
    def _generate_detailed_analysis(self, df: pd.DataFrame) -> Dict:
        """Generate detailed analysis from event data"""
        analysis = {
            'temporal_analysis': {},
            'category_analysis': {},
            'financial_analysis': {},
            'performance_metrics': {}
        }
        
        # Temporal analysis (if date column exists)
        date_columns = ['date', 'start_date', 'createdAt']
        for col in date_columns:
            if col in df.columns:
                try:
                    df['date_parsed'] = pd.to_datetime(df[col])
                    df['month'] = df['date_parsed'].dt.month
                    df['day_of_week'] = df['date_parsed'].dt.day_name()
                    
                    # Monthly trends
                    monthly_trends = df.groupby('month').agg({
                        'revenue': 'sum' if 'revenue' in df.columns else None,
                        'attendees': 'sum' if 'attendees' in df.columns else None
                    }).reset_index()
                    
                    analysis['temporal_analysis']['monthly_trends'] = monthly_trends.to_dict('records')
                    
                    # Day of week analysis
                    dow_analysis = df.groupby('day_of_week').size().reset_index(name='count')
                    analysis['temporal_analysis']['day_of_week_distribution'] = dow_analysis.to_dict('records')
                    
                    break
                except:
                    continue
        
        # Category analysis
        if 'category' in df.columns:
            category_stats = df.groupby('category').agg({
                'revenue': 'sum' if 'revenue' in df.columns else None,
                'attendees': 'sum' if 'attendees' in df.columns else None,
                'rating': 'mean' if 'rating' in df.columns else None
            }).reset_index()
            
            analysis['category_analysis'] = category_stats.to_dict('records')
        
        # Financial analysis
        if 'revenue' in df.columns and 'cost' in df.columns:
            df['profit'] = df['revenue'] - df['cost']
            df['profit_margin'] = (df['profit'] / df['revenue'] * 100).fillna(0)
            
            analysis['financial_analysis'] = {
                'total_revenue': float(df['revenue'].sum()),
                'total_cost': float(df['cost'].sum()),
                'total_profit': float(df['profit'].sum()),
                'average_profit_margin': float(df['profit_margin'].mean()),
                'profitable_events': int((df['profit'] > 0).sum()),
                'loss_making_events': int((df['profit'] < 0).sum())
            }
        
        # Performance metrics
        performance_metrics = {}
        
        # ROI calculation if cost and revenue available
        if 'revenue' in df.columns and 'cost' in df.columns:
            df['roi'] = ((df['revenue'] - df['cost']) / df['cost'] * 100).fillna(0)
            performance_metrics['average_roi'] = float(df['roi'].mean())
            performance_metrics['roi_distribution'] = {
                'high_roi': int((df['roi'] > 100).sum()),
                'medium_roi': int(((df['roi'] >= 20) & (df['roi'] <= 100)).sum()),
                'low_roi': int(((df['roi'] >= 0) & (df['roi'] < 20)).sum()),
                'negative_roi': int((df['roi'] < 0).sum())
            }
        
        # Capacity utilization if capacity and attendees available
        if 'capacity' in df.columns and 'attendees' in df.columns:
            df['capacity_utilization'] = (df['attendees'] / df['capacity'] * 100).fillna(0)
            performance_metrics['average_capacity_utilization'] = float(df['capacity_utilization'].mean())
            performance_metrics['utilization_distribution'] = {
                'overbooked': int((df['capacity_utilization'] > 100).sum()),
                'optimal': int(((df['capacity_utilization'] >= 80) & (df['capacity_utilization'] <= 100)).sum()),
                'underutilized': int((df['capacity_utilization'] < 80).sum())
            }
        
        analysis['performance_metrics'] = performance_metrics
        
        return analysis
    
    def _generate_recommendations(self, analysis: Dict, insights: Dict) -> List[Dict]:
        """Generate actionable recommendations based on analysis and insights"""
        recommendations = []
        
        # Check financial performance
        financial_analysis = analysis.get('financial_analysis', {})
        if financial_analysis:
            loss_making = financial_analysis.get('loss_making_events', 0)
            if loss_making > 0:
                recommendations.append({
                    'category': 'Financial',
                    'priority': 'HIGH',
                    'title': 'Reduce Loss-Making Events',
                    'description': f'{loss_making} events are making losses. Review pricing and costs.',
                    'action': 'Analyze cost structure of loss-making events',
                    'expected_impact': 'Increase profitability'
                })
            
            avg_margin = financial_analysis.get('average_profit_margin', 0)
            if avg_margin < 20:
                recommendations.append({
                    'category': 'Financial',
                    'priority': 'MEDIUM',
                    'title': 'Improve Profit Margins',
                    'description': f'Average profit margin is {avg_margin:.1f}%, below target of 20%',
                    'action': 'Review pricing strategy and cost optimization',
                    'expected_impact': 'Increase margins by 5-10%'
                })
        
        # Check capacity utilization
        performance_metrics = analysis.get('performance_metrics', {})
        if performance_metrics:
            utilization = performance_metrics.get('utilization_distribution', {})
            underutilized = utilization.get('underutilized', 0)
            if underutilized > 0:
                recommendations.append({
                    'category': 'Operations',
                    'priority': 'MEDIUM',
                    'title': 'Improve Event Attendance',
                    'description': f'{underutilized} events have low attendance (<80% capacity)',
                    'action': 'Enhance marketing for underperforming events',
                    'expected_impact': 'Increase attendance by 15-20%'
                })
        
        # Check category performance
        category_analysis = analysis.get('category_analysis', [])
        if category_analysis:
            # Find best and worst performing categories
            if 'revenue' in category_analysis[0]:
                sorted_categories = sorted(category_analysis, key=lambda x: x.get('revenue', 0), reverse=True)
                if len(sorted_categories) >= 2:
                    best = sorted_categories[0]
                    worst = sorted_categories[-1]
                    
                    recommendations.append({
                        'category': 'Strategy',
                        'priority': 'MEDIUM',
                        'title': 'Focus on High-Performing Categories',
                        'description': f"{best.get('category', 'Unknown')} generates {best.get('revenue', 0):.0f} vs {worst.get('category', 'Unknown')} at {worst.get('revenue', 0):.0f}",
                        'action': 'Allocate more resources to high-performing categories',
                        'expected_impact': 'Optimize resource allocation'
                    })
        
        # Add insights-based recommendations
        if insights and 'recommendations' in insights:
            for insight_rec in insights['recommendations']:
                recommendations.append({
                    'category': 'Insights',
                    'priority': 'MEDIUM',
                    'title': 'Data-Driven Insight',
                    'description': insight_rec,
                    'action': 'Review and implement',
                    'expected_impact': 'Performance improvement'
                })
        
        # Sort by priority
        priority_order = {'HIGH': 3, 'MEDIUM': 2, 'LOW': 1}
        recommendations.sort(key=lambda x: priority_order.get(x['priority'], 0), reverse=True)
        
        return recommendations[:10]  # Return top 10 recommendations
    
    def _generate_charts(self, df: pd.DataFrame, user_data: List[Dict] = None) -> Dict:
        """Generate chart data for visualization"""
        charts = {}
        
        try:
            if self.chart_generator:
                # Generate booking trends chart
                if 'date' in df.columns and 'attendees' in df.columns:
                    try:
                        df['date'] = pd.to_datetime(df['date'])
                        chart_data = df[['date', 'attendees']].copy()
                        chart_data = chart_data.sort_values('date')
                        
                        charts['booking_trends'] = self.chart_generator.generate_booking_trends_chart(
                            chart_data.to_dict('records')
                        )
                    except:
                        pass
                
                # Generate revenue chart if revenue data available
                if 'revenue' in df.columns:
                    try:
                        revenue_data = {
                            'sources': self._extract_revenue_sources(df),
                            'monthly': self._extract_monthly_revenue(df)
                        }
                        charts['revenue_analysis'] = self.chart_generator.generate_revenue_chart(revenue_data)
                    except:
                        pass
                
                # Generate user engagement chart if user data provided
                if user_data and len(user_data) > 0:
                    try:
                        engagement_data = {
                            'metrics': user_data,
                            'feature_usage': self._extract_feature_usage(user_data),
                            'conversion_funnel': self._extract_conversion_funnel(user_data)
                        }
                        charts['user_engagement'] = self.chart_generator.generate_user_engagement_chart(engagement_data)
                    except:
                        pass
        except Exception as e:
            print(f"Chart generation error: {e}")
        
        return charts
    
    def _extract_revenue_sources(self, df: pd.DataFrame) -> Dict:
        """Extract revenue by source/category"""
        sources = {}
        
        if 'category' in df.columns and 'revenue' in df.columns:
            category_revenue = df.groupby('category')['revenue'].sum()
            for category, revenue in category_revenue.items():
                sources[category] = float(revenue)
        
        return sources
    
    def _extract_monthly_revenue(self, df: pd.DataFrame) -> Dict:
        """Extract monthly revenue"""
        monthly = {}
        
        if 'date' in df.columns and 'revenue' in df.columns:
            try:
                df['month'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m')
                monthly_revenue = df.groupby('month')['revenue'].sum()
                for month, revenue in monthly_revenue.items():
                    monthly[month] = float(revenue)
            except:
                pass
        
        return monthly
    
    def _extract_feature_usage(self, user_data: List[Dict]) -> Dict:
        """Extract feature usage from user data"""
        features = {}
        
        if user_data and len(user_data) > 0:
            df_users = pd.DataFrame(user_data)
            
            # Example feature extraction (customize based on your data)
            feature_columns = ['events_attended', 'reviews_written', 'messages_sent', 'bookings_made']
            
            for col in feature_columns:
                if col in df_users.columns:
                    features[col] = int(df_users[col].sum())
        
        return features
    
    def _extract_conversion_funnel(self, user_data: List[Dict]) -> Dict:
        """Extract conversion funnel data"""
        funnel = {
            'Visitors': 100,  # Base value
            'Registered': 70,
            'Active': 40,
            'Converted': 25,
            'Retained': 15
        }
        
        # This is a simplified version - customize based on actual data
        if user_data and len(user_data) > 0:
            df_users = pd.DataFrame(user_data)
            
            if 'status' in df_users.columns:
                status_counts = df_users['status'].value_counts()
                
                # Map statuses to funnel stages
                funnel_mapping = {
                    'active': 'Active',
                    'registered': 'Registered',
                    'converted': 'Converted',
                    'retained': 'Retained'
                }
                
                for status, count in status_counts.items():
                    if status in funnel_mapping:
                        funnel[funnel_mapping[status]] = int(count)
        
        return funnel
    
    def _generate_executive_summary(self, report: Dict) -> Dict:
        """Generate an executive summary of the report"""
        summary = {
            'key_findings': [],
            'opportunities': [],
            'risks': [],
            'recommended_actions': []
        }
        
        # Extract key findings from summary
        report_summary = report.get('summary', {})
        if report_summary:
            summary['key_findings'].append(f"Total events analyzed: {report_summary.get('total_events', 0)}")
            summary['key_findings'].append(f"Total revenue: ${report_summary.get('total_revenue', 0):,.0f}")
            summary['key_findings'].append(f"Success rate: {report_summary.get('success_rate', 0):.1f}%")
        
        # Extract opportunities from recommendations
        recommendations = report.get('recommendations', [])
        for rec in recommendations[:3]:  # Top 3
            if rec['priority'] in ['HIGH', 'MEDIUM']:
                summary['recommended_actions'].append(rec['title'])
        
        # Extract risks from analysis
        analysis = report.get('analysis', {})
        financial = analysis.get('financial_analysis', {})
        if financial.get('loss_making_events', 0) > 0:
            summary['risks'].append(f"{financial['loss_making_events']} events are making losses")
        
        performance = analysis.get('performance_metrics', {})
        utilization = performance.get('utilization_distribution', {})
        if utilization.get('underutilized', 0) > 0:
            summary['opportunities'].append(f"Improve attendance for {utilization['underutilized']} underutilized events")
        
        return summary
    
    def _calculate_confidence_score(self, report: Dict) -> float:
        """Calculate confidence score for the report"""
        score = 0.0
        
        # Base score for having data
        if report['metadata']['event_count'] > 0:
            score += 30
        
        # Score for completeness
        sections_present = 0
        total_sections = 5  # summary, analysis, insights, recommendations, charts
        
        if report.get('summary'): sections_present += 1
        if report.get('analysis'): sections_present += 1
        if report.get('insights'): sections_present += 1
        if report.get('recommendations'): sections_present += 1
        if report.get('charts'): sections_present += 1
        
        score += (sections_present / total_sections) * 40
        
        # Score for data quality (simplified)
        if report['metadata']['event_count'] >= 10:
            score += 15
        elif report['metadata']['event_count'] >= 5:
            score += 10
        else:
            score += 5
        
        # Cap at 100
        return min(score, 100)
    
    def export_report(self, report: Dict, format: str = 'json') -> Dict:
        """Export report in different formats"""
        if format == 'json':
            return {
                'success': True,
                'format': 'json',
                'content': json.dumps(report, indent=2, default=str),
                'size': len(json.dumps(report))
            }
        elif format == 'csv':
            # Create simplified CSV version
            try:
                df_summary = pd.DataFrame([report.get('summary', {})])
                csv_content = df_summary.to_csv(index=False)
                
                return {
                    'success': True,
                    'format': 'csv',
                    'content': csv_content,
                    'size': len(csv_content)
                }
            except:
                return {
                    'success': False,
                    'error': 'Failed to generate CSV',
                    'format': 'csv'
                }
        else:
            return {
                'success': False,
                'error': f'Unsupported format: {format}',
                'supported_formats': ['json', 'csv']
            }

# Main function for standalone execution
def generate_event_analytics_report(event_data: List[Dict], user_data: List[Dict] = None) -> Dict:
    """Main function to generate event analytics report"""
    generator = ReportGenerator()
    return generator.generate_event_analytics_report(event_data, user_data)

# Example usage
if __name__ == "__main__":
    # Sample data for testing
    sample_events = [
        {
            'id': 'event_1',
            'name': 'Tech Conference',
            'category': 'Technology',
            'date': '2024-01-15',
            'revenue': 50000,
            'cost': 30000,
            'attendees': 500,
            'capacity': 600,
            'rating': 4.5,
            'status': 'completed'
        },
        {
            'id': 'event_2',
            'name': 'Music Festival',
            'category': 'Music',
            'date': '2024-02-20',
            'revenue': 80000,
            'cost': 50000,
            'attendees': 2000,
            'capacity': 2500,
            'rating': 4.2,
            'status': 'completed'
        }
    ]
    
    sample_users = [
        {'date': '2024-01-15', 'active_users': 150, 'events_attended': 500, 'bookings_made': 550},
        {'date': '2024-02-20', 'active_users': 200, 'events_attended': 2000, 'bookings_made': 2100}
    ]
    
    print("Generating sample report...")
    result = generate_event_analytics_report(sample_events, sample_users)
    
    if result['success']:
        print(f"✅ Report generated successfully!")
        print(f"Report ID: {result['report']['metadata']['report_id']}")
        print(f"Confidence Score: {result['report']['metadata']['confidence_score']}%")
        print(f"Total Events: {result['report']['summary']['total_events']}")
        print(f"Total Revenue: ${result['report']['summary']['total_revenue']:,.0f}")
    else:
        print(f"❌ Failed to generate report: {result['error']}")