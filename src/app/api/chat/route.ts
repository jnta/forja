import { z } from "zod";

import { softwareTeamWorkflow } from "@/container";

const ChatRequestSchema = z.object({
  task: z.string(),
});

export async function POST(request: Request) {
  const { task } = ChatRequestSchema.parse(await request.json());
  const result = await softwareTeamWorkflow.invoke({ task, messages: [] });

  return Response.json({ messages: result.messages });
}
