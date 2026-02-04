# ============================================================

# PHASE 1 VERIFICATION SUITE - User Recommendation Agent

# Run each test ONE AT A TIME. Do not run the whole file.

# Each test block is clearly separated. Copy-paste one block

# into your PowerShell terminal at a time.

# ============================================================

# BEFORE YOU START:

# Make sure both servers are running:

# Terminal A: cd Backend && npm start (port 4001)

# Terminal B: cd Ai_Agent && npm start (port 3002)

# ============================================================

# ============================================================

# TEST 1 - AI Agent microservice is alive

# VERIFIES: getHealth() method exists and responds

# RUN THIS FIRST. Everything else depends on port 3002 being up.

# ============================================================

Invoke-RestMethod -Uri "http://localhost:3002/api/health" -Method GET | ConvertTo-Json -Depth 5

# --- WHAT SUCCESS LOOKS LIKE: ------------------------------

# {

# "success": true,

# "status": "healthy",

# "service": "AI Agent Service",

# "version": "1.0.0",

# "timestamp": "2026-02-01T..."

# }

#

# --- IF YOU SEE THIS INSTEAD: -------------------------------

# "Could not connect" or timeout

# -> AI Agent is not running. Run: cd Ai_Agent && npm start

#

# "getHealth is not a function"

# -> You have not replaced agent.controller.js with the fixed version yet.

# ============================================================

# ============================================================

# TEST 2 - Backend health check (confirms it can reach AI Agent)

# VERIFIES: ai.controller.js checkAIHealth() -> ai.service.js -> AI Agent

# This is the Backend pinging the AI Agent FROM ITS SIDE.

# ============================================================

Invoke-RestMethod -Uri "http://localhost:4001/api/v1/ai/health" -Method GET | ConvertTo-Json -Depth 5

# --- WHAT SUCCESS LOOKS LIKE: ------------------------------

# {

# "success": true,

# "data": {

# "service": "AI Recommendation System",

# "status": "operational",

# "components": {

# "ai_agent_service": {

# "status": "healthy", <-- this is the key field

# "url": "http://localhost:3002"

# },

# "active_agents": <number>,

# "recommendations_last_24h": <number>

# }

# }

# }

#

# --- IF YOU SEE THIS INSTEAD: -------------------------------

# "ai_agent_service": { "status": "unhealthy", "error": "..." }

# -> Backend is running but can not reach port 3002.

# Check AI_AGENT_URL env var in your Backend .env file.

# It should be: AI_AGENT_URL=http://localhost:3002

#

# Connection refused on port 4001

# -> Backend is not running. Run: cd Backend && npm start

# ============================================================

# ============================================================

# TEST 3 - Fetch bookable events from DB

# VERIFIES: \_fetchCandidateEvents() filter is correct

# (status, deadline, isPublic, capacity)

# WHY THIS MATTERS: If this returns 0 events, the AI Agent

# will always return empty even if scoring logic is perfect.

# ============================================================

Invoke-RestMethod `  -Uri "http://localhost:4001/api/v1/events"`
-Method GET `
-Headers @{ Authorization = "Bearer <YOUR_TOKEN>" } | ConvertTo-Json -Depth 5

# --- WHAT SUCCESS LOOKS LIKE: ------------------------------

# Response contains a "data" array with events that have:

# status: "upcoming" or "approved"

# isPublic: true

# registrationDeadline: a future date

#

# --- IF YOU GET ZERO EVENTS: -------------------------------

# Your DB has no events that pass the filter. You need at least

# one event with ALL of these set correctly:

# status: "upcoming" (not "active" -- that is not a valid enum value)

# isPublic: true

# registrationDeadline: a date in the future

# attendees.length < totalSlots

#

# Check your eventSeeder.js to make sure it creates events

# with these exact values.

#

# --- SAVE THESE FOR LATER TESTS: ---------------------------

# Copy one event \_id -- you will use it in Test 5.

# Also note a valid userId (any user who has booked or wishlisted).

# ============================================================

# ============================================================

# TEST 4 - Verify Recommendation Agent record exists

# VERIFIES: getRecommendationAgent() creates the agent with

# role:"assistant" and agent_type:"admin" (the fixed values)

# This runs implicitly inside the recommendation flow, but we

# can confirm the agent record directly.

# ============================================================

Invoke-RestMethod `  -Uri "http://localhost:4001/api/v1/ai/agents?type=admin"`
-Method GET `
-Headers @{ Authorization = "Bearer <YOUR_TOKEN>" } | ConvertTo-Json -Depth 5

# --- WHAT SUCCESS LOOKS LIKE: ------------------------------

# {

# "success": true,

# "data": [

# {

# "name": "Event Recommendation Agent",

# "role": "assistant", <-- must be this, not "recommendation"

# "agent_type": "admin", <-- must be this, not "user"

# "status": "active",

# "capabilities": ["event_recommendation", "user_behavior_analysis"]

# }

# ]

# }

#

# --- IF THE ARRAY IS EMPTY: -------------------------------

# The agent has not been created yet. It auto-creates on the first

# recommendation request (Test 6). That is fine -- skip ahead.

#

# --- IF YOU SEE role: "recommendation": -------------------------

# You have not replaced ai.service.js with the fixed version yet.

# That value will fail Mongoose validation and crash silently.

# ============================================================

# ============================================================

# TEST 5 - Direct call to AI Agent with a realistic payload

# VERIFIES: The core scoring pipeline end-to-end:

# agent.controller.js -> index.js -> ranker.js

# This is the most important test. We send a full payload

# with userContext + candidateEvents and check that the response

# has the correct shape with real scores and real reasons.

#

# BEFORE RUNNING: Replace these placeholder values with real ones

# from your DB (grabbed in Test 3):

# <REAL_USER_ID> -> a real user ObjectId

# <REAL_EVENT_ID_X> -> real event ObjectIds

# ============================================================

Invoke-RestMethod `  -Uri "http://localhost:3002/api/recommendations"`
-Method POST `  -ContentType "application/json"`
-Body '{
"userId": "<REAL_USER_ID>",
"limit": 3,
"userContext": {
"wishlistEvents": [
{
"\_id": "<REAL_EVENT_ID_1>",
"event_name": "Tech Conference",
"category": { "\_id": "cat001", "category_Name": "Technology" },
"tags": ["tech", "networking", "keynote"],
"price": 2500,
"location": "Kathmandu",
"event_date": "2026-03-10"
}
],
"bookedEvents": [
{
"\_id": "<REAL_EVENT_ID_2>",
"event_name": "Music Night",
"category": { "\_id": "cat002", "category_Name": "Music" },
"tags": ["live", "music", "networking"],
"price": 1500,
"location": "Pokhara",
"event_date": "2026-02-15"
}
],
"reviewedEvents": []
},
"candidateEvents": [
{
"\_id": "<REAL_EVENT_ID_3>",
"event_name": "Jazz Evening",
"description": "Live jazz performance downtown",
"category": { "\_id": "cat002", "category_Name": "Music" },
"tags": ["live", "jazz", "music"],
"price": 2000,
"location": "Kathmandu",
"event_date": "2026-03-20",
"time": "7:00 PM",
"attendees": ["id1", "id2", "id3"],
"totalSlots": 100
},
{
"\_id": "<REAL_EVENT_ID_4>",
"event_name": "AI Workshop",
"description": "Hands-on AI and ML workshop",
"category": { "\_id": "cat001", "category_Name": "Technology" },
"tags": ["tech", "ai", "workshop"],
"price": 3000,
"location": "Kathmandu",
"event_date": "2026-04-05",
"time": "10:00 AM",
"attendees": ["id1", "id2", "id3", "id4", "id5"],
"totalSlots": 50
},
{
"\_id": "<REAL_EVENT_ID_5>",
"event_name": "Dance Show",
"description": "Contemporary dance performance",
"category": { "\_id": "cat003", "category_Name": "Dance" },
"tags": ["dance", "performance", "art"],
"price": 800,
"location": "Lalitpur",
"event_date": "2026-03-01",
"time": "6:00 PM",
"attendees": [],
"totalSlots": 200
}
]
}' | ConvertTo-Json -Depth 5

# --- WHAT SUCCESS LOOKS LIKE: ------------------------------

# {

# "success": true,

# "count": 3,

# "recommendations": [

# {

# "event_id": "<REAL_EVENT_ID>",

# "confidence_score": 0.82,

# "recommendation_reason": "Recommended based on your interests in live, music, category Music, fits your typical budget, in a location you enjoy"

# },

# { ... },

# { ... }

# ],

# "generated_at": "2026-02-01T..."

# }

#

# --- KEY THINGS TO VERIFY IN THE RESPONSE: -----------------

# 1. confidence_score is DIFFERENT for each event (not all 0.5)

# -> proves the ranker is actually scoring, not defaulting

# 2. Results are SORTED by confidence_score descending

# -> proves the sort is working

# 3. recommendation_reason mentions specific signals like

# "interests in live" or "category Music"

# -> proves the reason is built from what actually matched,

# not randomly picked

# 4. Jazz Evening should score HIGHEST because it shares the most

# signals with user history (tags: live, music + category: Music

# + location: Kathmandu). Dance Show should score LOWEST because

# it shares nothing.

#

# --- IF YOU SEE THIS INSTEAD: -------------------------------

# Empty recommendations array []

# -> candidateEvents did not arrive. Confirm agent.controller.js

# destructures all 4 fields from req.body.

#

# All confidence_scores are 0.5

# -> ranker.js is not running the scoring logic. Confirm you

# replaced ranker.js with the fixed version.

#

# recommendation_reason is "undefined"

# -> ranker.js is not setting recommendation_reason.

# Confirm the fixed ranker.js is in place.

#

# TypeError crash in AI Agent server logs

# -> Check which field it is trying to read. Likely a field name

# mismatch. Compare your candidateEvents shape against what

# the test payload above uses.

# ============================================================

# ============================================================

# TEST 6 - Full end-to-end via Backend (the real integration test)

# VERIFIES: The complete chain:

# auth -> controller -> service -> AI Agent -> store -> respond

# This needs a VALID auth token. Run Step 6a first to get one.

# ============================================================

# --- STEP 6a: Get a token (run this block first) -----------

$loginResponse = Invoke-RestMethod `  -Uri "http://localhost:4001/api/v1/auth/login"`
-Method POST `  -ContentType "application/json"`
-Body '{
"email": "<YOUR_TEST_USER_EMAIL>",
"password": "<YOUR_TEST_USER_PASSWORD>"
}'

$token = $loginResponse.token
Write-Host "Token captured: $token"

# --- STEP 6b: Call the recommendation endpoint with that token

# Use refresh=true to skip cache and force a live AI Agent call.

# ============================================================

Invoke-RestMethod `  -Uri "http://localhost:4001/api/v1/ai/recommendations?limit=5&refresh=true"`
-Method GET `
-Headers @{ Authorization = "Bearer $token" } | ConvertTo-Json -Depth 5

# --- WHAT SUCCESS LOOKS LIKE: ------------------------------

# {

# "success": true,

# "count": 5,

# "source": "ai_agent", <-- THIS is the key field

# "message": "AI-generated recommendations",

# "data": [

# {

# "event_id": "<real ObjectId>",

# "confidence_score": 0.78,

# "recommendation_reason": "Recommended based on your ..."

# },

# ...

# ],

# "timestamp": "2026-02-01T..."

# }

#

# --- WHAT THE "source" FIELD TELLS YOU: ---------------------

# "ai_agent" -> FULL SUCCESS. AI Agent scored and returned.

# "cache" -> AI Agent was not called. Add &refresh=true

# "fallback" -> AI Agent returned empty. Run Test 5 to isolate.

# "emergency_fallback" -> Something crashed. Check Backend server logs.

#

# --- STEP 6c: Confirm results were stored in DB ------------

# If source was "ai_agent", recommendations were persisted.

# Run this to verify they exist in the AI_Recommendation collection:

Invoke-RestMethod `  -Uri "http://localhost:4001/api/v1/ai/recommendations/me"`
-Method GET `
-Headers @{ Authorization = "Bearer $token" } | ConvertTo-Json -Depth 5

# If you see the same events with scores and reasons here,

# the full pipeline is working: score -> return -> store -> read.

# ============================================================
