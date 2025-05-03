// src/services/openai.service.ts
import { openai } from '../app'; 


type ChatCompletionMessageParam = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
};

interface Message {
  role: string;
  content: string;
}

/**
 * Generates an AI response using the OpenAI API
 * @param messages The conversation history
 * @param systemPrompt Custom system prompt (optional)
 * @returns The AI-generated response text
 */
export const generateAIResponse = async (
  messages: Message[],
  systemPrompt?: string
): Promise<string> => {
  try {
  
    const defaultSystemPrompt = 'You are a helpful, friendly AI assistant. Provide accurate and concise responses.';
    
   
    const apiMessages = [
      { 
        role: 'system', 
        content: systemPrompt || defaultSystemPrompt 
      },
      ...messages.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
        name: m.role === 'user' ? 'user' : undefined 
      }))
    ];

    
    const filteredMessages = [
      apiMessages[0],
      ...apiMessages.slice(1).filter(m => m.role !== 'system')
    ];

    
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', 
      messages: filteredMessages as ChatCompletionMessageParam[],
      max_tokens: 1000,
      temperature: 0.7,
    });

    return completion.choices[0].message.content || 'Sorry, I couldn\'t generate a response.';
  } catch (error) {
    console.error('Error generating AI response:', error);
    return 'Sorry, there was an error generating a response. Please try again later.';
  }
};

export default {
  generateAIResponse
};