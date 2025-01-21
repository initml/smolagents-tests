import { MessageRole, ChatMessage } from "./models";

/**
 * Represents the structure of facts in the agent's knowledge base
 */
export interface Facts {
  givenInTask: string[];
  learned: string[];
  toLookUp: string[];
  toDerive: string[];
}

/**
 * System prompt for updating facts based on conversation history
 */
export const SYSTEM_PROMPT_FACTS_UPDATE = `
You are a world expert at gathering known and unknown facts based on a conversation.
Below you will find a task, and a history of attempts made to solve the task. You will have to produce a list of these:
### 1. Facts given in the task
### 2. Facts that we have learned
### 3. Facts still to look up
### 4. Facts still to derive
Find the task and history below.`;

/**
 * User prompt for requesting fact updates based on previous steps
 */
export const USER_PROMPT_FACTS_UPDATE = `Earlier we've built a list of facts.
But since in your previous steps you may have learned useful new facts or invalidated some false ones.
Please update your list of facts based on the previous history, and provide these headings:
### 1. Facts given in the task
### 2. Facts that we have learned
### 3. Facts still to look up
### 4. Facts still to derive

Now write your new list of facts below.`;

/**
 * Class responsible for managing facts during the agent's planning process
 */
export class FactsManager {
  private facts: Facts;

  constructor() {
    this.facts = {
      givenInTask: [],
      learned: [],
      toLookUp: [],
      toDerive: [],
    };
  }

  /**
   * Parse facts from LLM output into structured format
   */
  private parseFactsFromOutput(output: string): Facts {
    const sections = output.split("###").filter(s => s.trim());
    const facts: Facts = {
      givenInTask: [],
      learned: [],
      toLookUp: [],
      toDerive: [],
    };

    for (const section of sections) {
      const [title, ...items] = section.split("\n").filter(s => s.trim());
      const factsArray = items.map(item => item.trim()).filter(item => item && !item.startsWith("#"));

      if (title.includes("Facts given in the task")) {
        facts.givenInTask = factsArray;
      } else if (title.includes("Facts that we have learned") || title.includes("Facts we have learned")) {
        facts.learned = factsArray;
      } else if (title.includes("Facts still to look up") || title.includes("Facts to look up")) {
        facts.toLookUp = factsArray;
      } else if (title.includes("Facts still to derive") || title.includes("Facts to derive")) {
        facts.toDerive = factsArray;
      }
    }

    return facts;
  }

  /**
   * Format facts into a string representation
   */
  public formatFacts(): string {
    return `### 1. Facts given in the task
${this.facts.givenInTask.join("\n")}

### 2. Facts that we have learned
${this.facts.learned.join("\n")}

### 3. Facts still to look up
${this.facts.toLookUp.join("\n")}

### 4. Facts still to derive
${this.facts.toDerive.join("\n")}`;
  }

  /**
   * Update facts based on model output
   */
  public updateFacts(modelOutput: string) {
    this.facts = this.parseFactsFromOutput(modelOutput);
  }

  /**
   * Get messages for facts update
   */
  public getFactsUpdateMessages(agentMemory: ChatMessage[]): ChatMessage[] {
    return [
      {
        role: MessageRole.SYSTEM,
        content: SYSTEM_PROMPT_FACTS_UPDATE,
      },
      ...agentMemory,
      {
        role: MessageRole.USER,
        content: USER_PROMPT_FACTS_UPDATE,
      },
    ];
  }

  /**
   * Get the current facts
   */
  public getFacts(): Facts {
    return { ...this.facts };
  }
}
