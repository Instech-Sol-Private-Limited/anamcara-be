"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCampaignDescription = exports.generateAIDescription = exports.generateAIResponse = void 0;
const app_1 = require("../app");
const PROFICIENCY_LEVELS = [
    { value: 'native', label: 'Native' },
    { value: 'fluent', label: 'Fluent' },
    { value: 'intermediate', label: 'Intermediate' },
    { value: 'basic', label: 'Basic' }
];
const generateAIResponse = (messages, systemPrompt) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const defaultSystemPrompt = 'You are a helpful, friendly AI assistant. Provide accurate and concise responses.';
        const apiMessages = [
            {
                role: 'system',
                content: systemPrompt || defaultSystemPrompt
            },
            ...messages.map(m => ({
                role: m.role,
                content: m.content,
                name: m.role === 'user' ? 'user' : undefined
            }))
        ];
        const filteredMessages = [
            apiMessages[0],
            ...apiMessages.slice(1).filter(m => m.role !== 'system')
        ];
        const completion = yield app_1.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: filteredMessages,
            max_tokens: 1000,
            temperature: 0.7,
        });
        return completion.choices[0].message.content || 'Sorry, I couldn\'t generate a response.';
    }
    catch (error) {
        console.error('Error generating AI response:', error);
        return 'Sorry, there was an error generating a response. Please try again later.';
    }
});
exports.generateAIResponse = generateAIResponse;
const generateAIDescription = (data) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const languageList = data.languages.map(lang => { var _a; return `${lang.language} (${(_a = PROFICIENCY_LEVELS.find(level => level.value === lang.proficiency)) === null || _a === void 0 ? void 0 : _a.label})`; }).join(', ');
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
        const completion = yield app_1.openai.chat.completions.create({
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
        return ((_c = (_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim()) || getFallbackDescription(data, languageList);
    }
    catch (error) {
        console.error('OpenAI API Error:', error);
        return getFallbackDescription(data, data.languages.map(lang => { var _a; return `${lang.language} (${(_a = PROFICIENCY_LEVELS.find(level => level.value === lang.proficiency)) === null || _a === void 0 ? void 0 : _a.label})`; }).join(', '));
    }
});
exports.generateAIDescription = generateAIDescription;
const getFallbackDescription = (data, languageList) => {
    return `
        <p>${data.slogan}</p>
        <p>As a specialized ${data.niche} professional, I bring expertise and dedication to every project. With fluency in ${languageList}, I effectively communicate with diverse clients and stakeholders.</p>
        <p>${data.country ? `Based in ${data.city ? data.city + ', ' : ''}${data.country}, ` : ''}I leverage local insights and global perspectives to deliver exceptional results. My approach combines technical proficiency with creative problem-solving to meet unique client needs.</p>
        <p>Committed to continuous learning and professional development, I stay updated with industry trends and best practices to provide cutting-edge solutions.</p>
    `.trim();
};
const generateCampaignDescription = (data) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const prompt = `
Create a compelling campaign description based on the following details:
- Campaign Story/Soul Words: "${data.soulWords}"
- Category: ${data.category.category} - ${data.category.subCategory}
- Campaign Type: ${data.campaignType === 'simple' ? 'Simple Donation Campaign' : 'Auction-style Donation Campaign'}
- ${data.goalType === 'fixed' ? `Funding Goal: ${data.goalAmount} AC` : 'Open-ended fundraising'}
${data.campaignType === 'auction' ? `- Base Amount: ${data.baseAmount} AC (minimum bid)` : ''}

Generate a comprehensive campaign description that includes:
• A compelling introduction that tells the story behind the campaign
• Clear explanation of how donations will be used
• The impact and benefits of supporting this campaign
• Transparency about fund allocation and progress updates
• A call to action encouraging community support

Format with HTML using <p> tags for paragraphs and <ul> with <li> for bullet points where appropriate.
Make it engaging, emotional, and persuasive while maintaining professionalism.
Your response should be comprehensive but concise, approximately 150-200 words.
`;
        const completion = yield app_1.openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "You are a professional content writer specializing in creating compelling campaign descriptions for fundraising and community projects."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: 500,
            temperature: 0.7
        });
        return ((_c = (_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim()) || getFallbackCampaignDescription(data);
    }
    catch (error) {
        console.error('OpenAI API Error:', error);
        return getFallbackCampaignDescription(data);
    }
});
exports.generateCampaignDescription = generateCampaignDescription;
const getFallbackCampaignDescription = (data) => {
    return `
<p>Based on your heartfelt story and campaign vision, we've crafted this description to help you connect with potential supporters:</p>

<p>This ${data.campaignType === 'simple' ? 'simple donation' : 'auction-style'} campaign in the ${data.category.category} - ${data.category.subCategory} category aims to ${data.soulWords.toLowerCase()}. We are reaching out to our compassionate community to help turn this vision into reality through the power of collective support.</p>

<p><strong>Campaign Details:</strong></p>
<ul>
<li><strong>Category:</strong> ${data.category.category} - ${data.category.subCategory}</li>
<li><strong>Type:</strong> ${data.campaignType === 'simple' ? 'Simple Donation Campaign' : 'Auction Donation Campaign'}</li>
${data.goalType === 'fixed' ? `<li><strong>Funding Goal:</strong> ${data.goalAmount} AC</li>` : '<li><strong>Funding Type:</strong> Open-ended (no fixed goal)</li>'}
${data.campaignType === 'auction' ? `<li><strong>Minimum Bid:</strong> ${data.baseAmount} AC</li>` : ''}
</ul>

<p><strong>How Your Support Makes a Difference:</strong></p>
<p>Every contribution, regardless of size, directly impacts our ability to achieve our objectives. Your support not only provides financial assistance but also serves as a powerful vote of confidence in our mission.</p>

<p><strong>Transparency & Updates:</strong></p>
<p>We are committed to maintaining complete transparency throughout this journey. Regular updates will be provided to keep our supporters informed about progress, challenges, and the meaningful impact of their generosity.</p>

<p>Join us in making a tangible difference and be part of a community that believes in turning compassion into action.</p>
  `.trim();
};
