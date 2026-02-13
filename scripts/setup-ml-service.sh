#!/bin/bash

# Setup script for Python ML Service
# Run this script to set up the Python ML environment

set -e

echo "🚀 Setting up Python ML Service for Eventa AI Agents"
echo "==================================================="

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "Python version: $PYTHON_VERSION"

if [[ "$PYTHON_VERSION" < "3.8" ]]; then
    echo "❌ Python 3.8 or higher is required"
    exit 1
fi

# Create virtual environment
echo "📦 Creating virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Upgrade pip
echo "⬆️  Upgrading pip..."
pip install --upgrade pip

# Install requirements
echo "📥 Installing Python dependencies..."
cd python-ml
pip install -r requirements.txt

# Download pre-trained models
echo "🤖 Downloading pre-trained models..."
mkdir -p models

# Download sentiment model
echo "Downloading sentiment analysis model..."
python -c "
from transformers import pipeline
import os

# Create sentiment pipeline (will download model)
print('Setting up sentiment analyzer...')
sentiment = pipeline('sentiment-analysis')
print('Sentiment analyzer ready')

# Create emotion detection pipeline
print('Setting up emotion detector...')
emotion = pipeline('text-classification', 
                   model='j-hartmann/emotion-english-distilroberta-base',
                   return_all_scores=True)
print('Emotion detector ready')
"

# Create sample fraud model if doesn't exist
if [ ! -f "models/fraud_model.pkl" ]; then
    echo "🧪 Creating sample fraud detection model..."
    python -c "
import pickle
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.datasets import make_classification

# Generate sample data
X, y = make_classification(n_samples=1000, n_features=20, 
                           n_informative=15, n_redundant=5,
                           random_state=42)

# Train a simple model
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X, y)

# Save model
with open('models/fraud_model.pkl', 'wb') as f:
    pickle.dump(model, f)

print('Sample fraud model created with accuracy:', model.score(X, y))
"
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p logs
mkdir -p data/processed
mkdir -p data/raw

# Set up environment variables
echo "🔧 Setting up environment variables..."
cat > .env << EOL
# Python ML Service Configuration
FLASK_DEBUG=True
PORT=5001
MODEL_PATH=./models
LOG_LEVEL=INFO

# Database configuration (if needed)
# DB_HOST=localhost
# DB_PORT=27017
# DB_NAME=eventa_ml

# External APIs
# HUGGINGFACE_TOKEN=your_token_here
EOL

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Activate virtual environment: source venv/bin/activate"
echo "2. Start the ML service: python app.py"
echo "3. The service will run on http://localhost:5001"
echo "4. Test with: curl http://localhost:5001/health"
echo ""
echo "To integrate with Node.js agents, update the agent configurations"
echo "to point to this service endpoint."