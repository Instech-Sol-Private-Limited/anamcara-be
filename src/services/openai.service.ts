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

const PROFICIENCY_LEVELS = [
  { value: 'native', label: 'Native' },
  { value: 'fluent', label: 'Fluent' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'basic', label: 'Basic' }
];

const generateAIResponse = async (
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

const generateAIDescription = async (data: {
  niche: string;
  slogan: string;
  languages: Array<{ language?: string; proficiency: string }>;
  country?: string;
  city?: string;
}): Promise<string> => {
  try {
    const languageList = data.languages.map(lang =>
      `${lang.language} (${PROFICIENCY_LEVELS.find(level => level.value === lang.proficiency)?.label})`
    ).join(', ');
    const prompt = `
Create a professional description for a ${data.niche} professional with the following details:
- Niche/Specialization: ${data.niche}
- Slogan/Motto: "${data.slogan}"
- Languages: ${languageList}
- Location: ${data.city ? data.city + ', ' : ''}${data.country || 'Not specified'}
Generate a comprehensive professional description with bullet points that highlights:
• Professional expertise in ${data.niche}
• Language capabilities and cross-cultural communication
• Geographic advantages (if location provided)
• Commitment to quality and client satisfaction
• Technical and creative problem-solving abilities
Format with HTML using <p> tags and <ul> with <li> for bullet points.
Make it engaging and professional.
Your response should be in 4 to 5 lines and strictly follow all the above instructions carefully.
`;
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a professional content writer specializing in creating compelling professional descriptions and summaries."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.2
    });
    return completion.choices[0]?.message?.content?.trim() || getFallbackDescription(data, languageList);
  } catch (error) {
    console.error('OpenAI API Error:', error);
    return getFallbackDescription(data, data.languages.map(lang =>
      `${lang.language} (${PROFICIENCY_LEVELS.find(level => level.value === lang.proficiency)?.label})`
    ).join(', '));
  }
};

const getFallbackDescription = (data: any, languageList: string): string => {
  return `
        <p>${data.slogan}</p>
        <p>As a specialized ${data.niche} professional, I bring expertise and dedication to every project. With fluency in ${languageList}, I effectively communicate with diverse clients and stakeholders.</p>
        <p>${data.country ? `Based in ${data.city ? data.city + ', ' : ''}${data.country}, ` : ''}I leverage local insights and global perspectives to deliver exceptional results. My approach combines technical proficiency with creative problem-solving to meet unique client needs.</p>
        <p>Committed to continuous learning and professional development, I stay updated with industry trends and best practices to provide cutting-edge solutions.</p>
    `.trim();
};

export {
  generateAIResponse,
  generateAIDescription
};