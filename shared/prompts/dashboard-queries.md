# Dashboard Queries — Prompt Reference

# Organizer Dashboard Assistant (agent_type: organizer)

This file documents the prompt templates used by the Organizer Dashboard Assistant.
Templates are defined and cached in:
`agents/organizer-agents/dashboard-assistant/prompt-templates.js`

This file is NOT loaded at runtime. It exists for developer reference only.

---

## Template: `insights`

**Used by:** `getDashboardMetrics()` → `_generateInsights()`
**LangChain method:** `getPromptTemplate("insights")`
**Variables:** `{metrics}`

**Purpose:**
Analyzes aggregated organizer metrics and generates a structured performance summary.
Covers: highlights, concerns, trends, and actionable recommendations.

**Concept doc alignment:**

- Task 2: Calculate metrics — total revenue, booking conversion rate, average Review.rating
- Task 3: Surface AI_FeedbackSentiment analysis (average sentiment_score)
- Task 5: Compare event performance (attendance vs totalSlots)

**Expected output sections:**

- Summary (2-3 sentence overview)
- Highlights (positive metrics)
- Concerns (metrics needing attention)
- Trends (patterns over time)
- Recommendations (actionable next steps)

---

## Template: `query`

**Used by:** `answerQuery(query)`
**LangChain method:** `getPromptTemplate("query")`
**Variables:** `{metrics}`, `{query}`

**Purpose:**
Answers free-form natural language questions from the organizer about their
dashboard data. Grounds responses in live metrics fetched via generateMetricsReport().

**Concept doc alignment:**

- Task 4: Display AI_Analytics insights — peak booking times, popular categories, user demographics
- Boundaries: Does NOT handle user inquiries (those go to user-side agents)

**Example questions:**

- "Why are my bookings down this month?"
- "Which event had the highest revenue?"
- "What is my average rating across all events?"

---

## Template: `recommendations`

**Used by:** `getRecommendations(context)`
**LangChain method:** `getPromptTemplate("recommendations")`
**Variables:** `{metrics}`, `{context}`

**Purpose:**
Generates 5-7 specific, actionable business recommendations for the organizer
based on current performance data and optional context filters.

**Concept doc alignment:**

- Task 2: Booking conversion rate analysis
- Task 3: Sentiment score surfacing
- Task 5: Attendance vs totalSlots gap analysis

**Covers:**

1. Revenue and profitability
2. Booking conversion rates
3. Customer satisfaction (ratings + sentiment)
4. Event attendance rates
5. Overall event success

---

## Threshold Reference (from \_extractHighlights / \_identifyConcerns)

| Metric                       | Highlight Threshold | Concern Threshold | Severity |
| ---------------------------- | ------------------- | ----------------- | -------- |
| revenue.total                | > NPR 10,000        | —                 | —        |
| bookings.conversionRate      | > 70%               | < 30%             | high     |
| ratings.average              | > 4.0 / 5.0         | < 3.0 / 5.0       | high     |
| sentiment.averageScore       | > 0.6               | < 0 (negative)    | high     |
| events.averageAttendanceRate | —                   | < 50%             | medium   |

---

## Agent Boundaries (from Concept doc)

- Does NOT create events → handled by Event Planning Agent
- Does NOT handle user inquiries → handled by user-side agents
- Read scope: AI_FeedbackSentiment, Booking, Review — filtered by org_ID only
- Does NOT modify any data — read and analyze only
