const logger = require('../config/logger');
const MessageBus = require('./message-bus');

class Orchestrator {
  constructor() {
    this.name = 'orchestrator';
    this.messageBus = new MessageBus();
    this.workflows = new Map();
    this.agents = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return true;
    
    logger.agent(this.name, 'Initializing orchestrator');
    
    // Initialize message bus
    await this.messageBus.initialize();
    
    // Register agents
    await this.registerAgents();
    
    // Load workflows
    await this.loadWorkflows();
    
    this.initialized = true;
    logger.success('Orchestrator initialized');
    return true;
  }

  async registerAgents() {
    // Register user agents
    const UserAgents = {
      'event-recommendation': require('../agents/user-agents/event-recommendation'),
      'booking-support-agent': require('../agents/user-agents/booking-support-agent'),
      'event-request-assistant': require('../agents/user-agents/event-request-assistant')
    };
    
    // Register organizer agents
    const OrganizerAgents = {
      'dashboard-assistant': require('../agents/organizer-agents/dashboard-assistant'),
      'negotiation-agent': require('../agents/organizer-agents/negotiation-agent'),
      'planning-agent': require('../agents/organizer-agents/planning-agent')
    };
    
    // Register admin agents
    const AdminAgents = {
      'analytics-agent': require('../agents/admin-agents/analytics-agent'),
      'feedback-sentiment': require('../agents/admin-agents/feedback-sentiment'),
      'fraud-detection': require('../agents/admin-agents/fraud-detection')
    };
    
    // Combine all agents
    const allAgents = {
      ...UserAgents,
      ...OrganizerAgents,
      ...AdminAgents
    };
    
    // Initialize and store agents
    for (const [name, AgentClass] of Object.entries(allAgents)) {
      try {
        const agent = new AgentClass();
        await agent.initialize?.();
        
        this.agents.set(name, {
          instance: agent,
          type: this.getAgentType(name),
          status: 'active'
        });
        
        logger.agent(this.name, `Registered agent: ${name}`);
      } catch (error) {
        logger.error(`Failed to register agent ${name}: ${error.message}`);
      }
    }
    
    logger.success(`Registered ${this.agents.size} agents`);
  }

  getAgentType(agentName) {
    if (agentName.includes('user')) return 'user';
    if (agentName.includes('organizer')) return 'organizer';
    if (agentName.includes('admin')) return 'admin';
    return 'general';
  }

  async loadWorkflows() {
    try {
      // Load workflow files
      const WeddingWorkflow = require('./workflows/wedding.workflow');
      const BirthdayWorkflow = require('./workflows/birthday.workflow');
      
      this.workflows.set('wedding', new WeddingWorkflow(this));
      this.workflows.set('birthday', new BirthdayWorkflow(this));
      
      logger.agent(this.name, `Loaded ${this.workflows.size} workflows`);
    } catch (error) {
      logger.error(`Failed to load workflows: ${error.message}`);
    }
  }

  async executeWorkflow(workflowName, input, context = {}) {
    try {
      await this.initialize();
      
      const workflow = this.workflows.get(workflowName);
      if (!workflow) {
        throw new Error(`Workflow ${workflowName} not found`);
      }
      
      logger.agent(this.name, `Executing workflow: ${workflowName}`);
      
      // Execute workflow
      const result = await workflow.execute(input, context);
      
      logger.success(`Workflow ${workflowName} executed successfully`);
      
      return {
        success: true,
        workflow: workflowName,
        result: result,
        execution_time: result.execution_time,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Workflow execution failed: ${error.message}`);
      return {
        success: false,
        workflow: workflowName,
        error: error.message
      };
    }
  }

  async routeRequest(requestType, data, context = {}) {
    try {
      await this.initialize();
      
      logger.agent(this.name, `Routing request: ${requestType}`);
      
      // Determine which agent(s) should handle this request
      const agentAssignments = this.determineAgentsForRequest(requestType, data);
      
      if (agentAssignments.length === 0) {
        throw new Error(`No agents available for request type: ${requestType}`);
      }
      
      // Execute agents in sequence or parallel
      const results = [];
      
      for (const assignment of agentAssignments) {
        const { agentName, role, priority } = assignment;
        
        try {
          const agent = this.agents.get(agentName);
          if (!agent || agent.status !== 'active') {
            throw new Error(`Agent ${agentName} is not available`);
          }
          
          logger.agent(this.name, `Executing agent: ${agentName} for role: ${role}`);
          
          // Execute agent based on role
          const result = await this.executeAgent(agent.instance, role, data, context);
          
          results.push({
            agent: agentName,
            role: role,
            success: true,
            result: result,
            execution_time: result.execution_time || 0
          });
          
          // Update context with result for next agents
          context[`${agentName}_result`] = result;
          
        } catch (error) {
          logger.error(`Agent ${agentName} failed: ${error.message}`);
          
          results.push({
            agent: agentName,
            role: role,
            success: false,
            error: error.message
          });
          
          // If high priority agent fails, stop the chain
          if (priority === 'high') {
            break;
          }
        }
      }
      
      // Combine results
      const combinedResult = this.combineResults(results, requestType);
      
      // Publish result to message bus
      await this.messageBus.publish('request_completed', {
        requestType,
        results: combinedResult,
        timestamp: new Date().toISOString()
      });
      
      return {
        success: true,
        request_type: requestType,
        agents_executed: results.length,
        results: results,
        combined_result: combinedResult,
        execution_summary: this.generateExecutionSummary(results)
      };
    } catch (error) {
      logger.error(`Request routing failed: ${error.message}`);
      throw error;
    }
  }

  determineAgentsForRequest(requestType, data) {
    const agentMap = {
      'event_recommendation': [
        { agentName: 'event-recommendation', role: 'recommendation', priority: 'high' }
      ],
      'booking_support': [
        { agentName: 'booking-support-agent', role: 'support', priority: 'high' }
      ],
      'event_planning': [
        { agentName: 'planning-agent', role: 'planning', priority: 'high' },
        { agentName: 'budget-optimizer', role: 'budget', priority: 'medium' }
      ],
      'negotiation': [
        { agentName: 'negotiation-agent', role: 'negotiation', priority: 'high' },
        { agentName: 'counter-offer', role: 'counter', priority: 'medium' }
      ],
      'analytics': [
        { agentName: 'analytics-agent', role: 'analytics', priority: 'high' },
        { agentName: 'report-trigger', role: 'reporting', priority: 'medium' }
      ],
      'fraud_check': [
        { agentName: 'fraud-detection', role: 'detection', priority: 'high' },
        { agentName: 'ml-client', role: 'ml_analysis', priority: 'medium' }
      ],
      'complex_event_request': [
        { agentName: 'event-request-assistant', role: 'analysis', priority: 'high' },
        { agentName: 'event-recommendation', role: 'recommendation', priority: 'medium' },
        { agentName: 'planning-agent', role: 'planning', priority: 'low' }
      ]
    };
    
    return agentMap[requestType] || [];
  }

  async executeAgent(agent, role, data, context) {
    const startTime = Date.now();
    
    let result;
    switch (role) {
      case 'recommendation':
        result = await agent.getRecommendations(data.userId, data.limit);
        break;
      case 'support':
        result = await agent.getFAQAnswer(data.question, data.language);
        break;
      case 'planning':
        result = await agent.createEventPlan(
          data.eventType,
          data.budget,
          data.attendees,
          data.location,
          data.date
        );
        break;
      case 'negotiation':
        result = await agent.initiateNegotiation(
          data.bookingId,
          data.userId,
          data.initialOffer,
          data.negotiationType
        );
        break;
      case 'analytics':
        result = await agent.getPlatformAnalytics(data.timeframe, data.filters);
        break;
      case 'detection':
        result = await agent.analyzeBooking(
          data.bookingData,
          data.userData,
          data.eventData
        );
        break;
      case 'analysis':
        result = await agent.processRequest(
          data.requestText,
          data.userId,
          data.language
        );
        break;
      default:
        throw new Error(`Unknown agent role: ${role}`);
    }
    
    const executionTime = Date.now() - startTime;
    
    return {
      ...result,
      execution_time: executionTime,
      role: role,
      timestamp: new Date().toISOString()
    };
  }

  combineResults(results, requestType) {
    const successfulResults = results.filter(r => r.success);
    
    if (successfulResults.length === 0) {
      return {
        success: false,
        message: 'All agents failed to execute',
        results: results
      };
    }
    
    // Combine based on request type
    switch (requestType) {
      case 'complex_event_request':
        return this.combineEventRequestResults(successfulResults);
      case 'event_planning':
        return this.combinePlanningResults(successfulResults);
      case 'analytics':
        return this.combineAnalyticsResults(successfulResults);
      default:
        return successfulResults[0].result; // Return first successful result
    }
  }

  combineEventRequestResults(results) {
    const analysis = results.find(r => r.role === 'analysis');
    const recommendation = results.find(r => r.role === 'recommendation');
    const planning = results.find(r => r.role === 'planning');
    
    return {
      analysis: analysis?.result,
      recommendations: recommendation?.result,
      planning_suggestions: planning?.result,
      combined_confidence: this.calculateCombinedConfidence(results),
      next_steps: this.generateNextSteps(results)
    };
  }

  combinePlanningResults(results) {
    const planning = results.find(r => r.role === 'planning');
    const budget = results.find(r => r.role === 'budget');
    
    return {
      event_plan: planning?.result,
      budget_optimization: budget?.result,
      comprehensive_plan: {
        ...planning?.result?.plan,
        optimized_budget: budget?.result?.optimized
      }
    };
  }

  combineAnalyticsResults(results) {
    const analytics = results.find(r => r.role === 'analytics');
    const reporting = results.find(r => r.role === 'reporting');
    
    return {
      analytics: analytics?.result,
      report: reporting?.result,
      insights: this.extractInsights(analytics?.result),
      recommendations: this.extractRecommendations(analytics?.result)
    };
  }

  calculateCombinedConfidence(results) {
    const confidences = results
      .map(r => r.result?.confidence || r.result?.confidence_score || 0.5)
      .filter(c => c > 0);
    
    if (confidences.length === 0) return 0.5;
    
    return confidences.reduce((a, b) => a + b, 0) / confidences.length;
  }

  generateNextSteps(results) {
    const steps = [];
    
    results.forEach(result => {
      if (result.result?.next_steps) {
        steps.push(...result.result.next_steps);
      }
      if (result.result?.recommendations) {
        steps.push(...result.result.recommendations.map(r => r.action));
      }
    });
    
    return [...new Set(steps)].slice(0, 5);
  }

  extractInsights(analyticsResult) {
    if (!analyticsResult || !analyticsResult.insights) return [];
    return analyticsResult.insights.slice(0, 3);
  }

  extractRecommendations(analyticsResult) {
    if (!analyticsResult || !analyticsResult.recommendations) return [];
    return analyticsResult.recommendations.slice(0, 3);
  }

  generateExecutionSummary(results) {
    const total = results.length;
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    const totalTime = results.reduce((sum, r) => sum + (r.execution_time || 0), 0);
    const avgTime = successful > 0 ? totalTime / successful : 0;
    
    return {
      total_agents: total,
      successful_agents: successful,
      failed_agents: failed,
      success_rate: (successful / total) * 100,
      total_execution_time: totalTime,
      average_agent_time: avgTime,
      slowest_agent: results.reduce((max, r) => 
        Math.max(max, r.execution_time || 0), 0
      )
    };
  }

  async getAgentStatus(agentName = null) {
    await this.initialize();
    
    if (agentName) {
      const agent = this.agents.get(agentName);
      if (!agent) {
        return {
          success: false,
          error: `Agent ${agentName} not found`
        };
      }
      
      return {
        success: true,
        agent: agentName,
        type: agent.type,
        status: agent.status,
        last_active: agent.last_active || 'unknown'
      };
    }
    
    // Return all agents status
    const agentsStatus = Array.from(this.agents.entries()).map(([name, data]) => ({
      name,
      type: data.type,
      status: data.status,
      last_active: data.last_active || 'unknown'
    }));
    
    return {
      success: true,
      total_agents: agentsStatus.length,
      by_type: {
        user: agentsStatus.filter(a => a.type === 'user').length,
        organizer: agentsStatus.filter(a => a.type === 'organizer').length,
        admin: agentsStatus.filter(a => a.type === 'admin').length
      },
      agents: agentsStatus
    };
  }

  async getWorkflowStatus(workflowName = null) {
    await this.initialize();
    
    if (workflowName) {
      const workflow = this.workflows.get(workflowName);
      if (!workflow) {
        return {
          success: false,
          error: `Workflow ${workflowName} not found`
        };
      }
      
      return {
        success: true,
        workflow: workflowName,
        status: 'loaded',
        agents_required: workflow.requiredAgents || [],
        description: workflow.description || 'No description'
      };
    }
    
    // Return all workflows status
    const workflowsStatus = Array.from(this.workflows.entries()).map(([name, workflow]) => ({
      name,
      status: 'loaded',
      description: workflow.description || 'No description',
      agents_required: workflow.requiredAgents || []
    }));
    
    return {
      success: true,
      total_workflows: workflowsStatus.length,
      workflows: workflowsStatus
    };
  }

  async restartAgent(agentName) {
    try {
      logger.agent(this.name, `Restarting agent: ${agentName}`);
      
      // Remove agent from map
      this.agents.delete(agentName);
      
      // Re-register agent
      await this.registerAgents();
      
      // Verify agent is back
      const agent = this.agents.get(agentName);
      if (!agent) {
        throw new Error(`Failed to restart agent ${agentName}`);
      }
      
      logger.success(`Agent ${agentName} restarted successfully`);
      
      return {
        success: true,
        agent: agentName,
        status: 'restarted',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to restart agent ${agentName}: ${error.message}`);
      throw error;
    }
  }

  async getSystemHealth() {
    await this.initialize();
    
    const agentsStatus = await this.getAgentStatus();
    const workflowsStatus = await this.getWorkflowStatus();
    const messageBusStatus = await this.messageBus.getStatus();
    
    // Calculate overall health score
    const activeAgents = agentsStatus.agents.filter(a => a.status === 'active').length;
    const totalAgents = agentsStatus.total_agents;
    const agentHealth = totalAgents > 0 ? (activeAgents / totalAgents) * 100 : 100;
    
    const workflowHealth = workflowsStatus.total_workflows > 0 ? 100 : 0;
    const messageBusHealth = messageBusStatus.connected ? 100 : 0;
    
    const overallHealth = (agentHealth + workflowHealth + messageBusHealth) / 3;
    
    return {
      success: true,
      system: 'ai-agent-orchestrator',
      status: overallHealth > 80 ? 'healthy' : overallHealth > 50 ? 'degraded' : 'unhealthy',
      health_score: overallHealth,
      components: {
        agents: {
          score: agentHealth,
          status: agentHealth > 80 ? 'healthy' : 'degraded',
          active: activeAgents,
          total: totalAgents
        },
        workflows: {
          score: workflowHealth,
          status: 'healthy',
          loaded: workflowsStatus.total_workflows
        },
        message_bus: {
          score: messageBusHealth,
          status: messageBusStatus.connected ? 'healthy' : 'unhealthy',
          connected: messageBusStatus.connected
        }
      },
      timestamp: new Date().toISOString()
    };
  }

  async shutdown() {
    logger.agent(this.name, 'Shutting down orchestrator');
    
    // Shutdown message bus
    await this.messageBus.shutdown();
    
    // Clear agents
    this.agents.clear();
    this.workflows.clear();
    this.initialized = false;
    
    logger.success('Orchestrator shutdown complete');
    
    return {
      success: true,
      message: 'Orchestrator shutdown successfully',
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = Orchestrator;