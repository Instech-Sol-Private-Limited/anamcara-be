// backend/config/openai.config.ts
import { OpenAI } from 'openai';


if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not defined in environment variables.");
  
  process.exit(1);
}


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export default openai;
