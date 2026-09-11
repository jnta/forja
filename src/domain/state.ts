export type AgentRole = "orchestrator" | "backend" | "frontend" | "qa";

export type SpecialistRole = Exclude<AgentRole, "orchestrator">;

export type AgentRoute = SpecialistRole | "done";

export interface AgentMessage {
  role: AgentRole;
  content: string;
}

export interface ProjectState {
  task: string;
  messages: AgentMessage[];
  next: AgentRoute;
  iterations: number;
}
