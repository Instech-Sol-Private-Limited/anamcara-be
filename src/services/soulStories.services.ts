import { supabase } from '../app';
import { searchAllContent } from '../controllers/soulstories.controller';
import 'dotenv/config';
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';


// Gemini AI Service Class
class GeminiService {
  private keys: string[];
  private currentKeyIndex: number;

  constructor() {
    const keysString = process.env.GEMINI_KEYS;
    if (!keysString) {
      throw new Error('GEMINI_KEYS environment variable is required');
    }

    // Remove semicolon and split by comma, then trim each key
    this.keys = keysString.replace(/;$/, '').split(",").map(key => key.trim());
    this.currentKeyIndex = 0;

    if (this.keys.length === 0) {
      throw new Error('At least one Gemini API key is required');
    }
  }

  // Get model with round-robin rotation
  private getModel() {
    const apiKey = this.keys[this.currentKeyIndex];
    const genAI = new GoogleGenerativeAI(apiKey);

    // Move to the next key for the next request
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;

    return genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
  }

  async generateThumbnailSuggestions(content: string): Promise<{
    title: string;
    description: string;
    rawResponse: string;
  }> {
    let lastError: Error | null = null;

    // Try all keys in case of failures
    for (let i = 0; i < this.keys.length; i++) {
      try {
        const model = this.getModel();

        // Create the prompt with the actual content parameter
        const prompt = `You are a creative AI assistant specializing in generating compelling story titles and descriptions for video and PDF content and also tags. Based on the provided content, create EXCELLENT and CAPTIVATING content that will grab viewers' attention.

Generate:

1. **An EXCELLENT, catchy title** (maximum 50 characters)
   - Make it mysterious, intriguing, or emotionally compelling
   - Use powerful words that evoke curiosity or emotion
   - Consider using: "Secret", "Hidden", "Lost", "Forbidden", "Ultimate", "Beyond", etc.
   - Perfect for video titles or PDF story titles

2. **An EXCELLENT, compelling description** (4 words, maximum 200 characters)
   - Hook the reader/viewer with intrigue, conflict, or mystery
   - Explain what makes this story unique and worth watching/reading
   - End with something that makes them want to continue
   - Focus on the most exciting or emotional aspect of the story
   - Suitable for video descriptions or PDF summaries
2. **An EXCELLENT, tags for video and pdf** (2 to4 words sentences, maximum 200 characters)
   - Hook the reader/viewer with intrigue, conflict, or mystery
   - Explain what makes this story unique and worth watching/reading
   - End with something that makes them want to continue
   - Focus on the most exciting or emotional aspect of the story
   - Suitable for video descriptions or PDF summaries
**GUIDELINES:**
- Use powerful, emotional language
- Create curiosity and mystery
- Make every word count
- Think viral content quality
- Avoid boring or generic phrases
- Focus on story content, not visual elements

Format your response exactly as:
**Title:** [Your excellent title here]
**Description:** [Your excellent description here]

Content to analyze:
${content}`;

        const result = await model.generateContent(prompt);
        const rawResponse = result.response.text();

        // Parse the response
        const parsed = this.parseGeminiResponse(rawResponse);

        return {
          ...parsed,
          rawResponse
        };
      } catch (err) {
        console.error(`Gemini API Key ${this.currentKeyIndex} failed:`, (err as Error).message);
        lastError = err as Error;
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
      }
    }

    throw new Error(`All Gemini API keys failed. Last error: ${lastError?.message}`);
  }

  private parseGeminiResponse(response: string): {
    title: string;
    description: string;
  } {
    const titleMatch = response.match(/\*\*Title:\*\*\s*(.+?)(?=\n|\*\*|$)/i);
    const descriptionMatch = response.match(/\*\*Description:\*\*\s*([\s\S]+?)(?=\n\*\*|$)/i);

    return {
      title: titleMatch?.[1]?.trim() || 'Untitled Story',
      description: descriptionMatch?.[1]?.trim() || 'An engaging story'
    };
  }

  async generateMultipleSuggestions(content: string, count: number = 3): Promise<Array<{
    title: string;
    description: string;
  }>> {
    const suggestions = [];

    for (let i = 0; i < count; i++) {
      try {
        const suggestion = await this.generateThumbnailSuggestions(content);
        suggestions.push({
          title: suggestion.title,
          description: suggestion.description
        });

        // Small delay between requests to avoid rate limiting
        if (i < count - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Failed to generate suggestion ${i + 1}:`, error);
        // Continue with other suggestions even if one fails
      }
    }

    return suggestions;
  }
}

const geminiService = new GeminiService();

const getReactionCounts = async (targetId: string, targetType: 'story' | 'comment') => {
  try {
    const { data: reactions, error } = await supabase
      .from('soul_story_reactions')
      .select('type')
      .eq('target_id', targetId)
      .eq('target_type', targetType);

    if (error) {
      return {
        total_likes: 0,
        total_dislikes: 0,
        total_insightfuls: 0,
        total_hearts: 0,
        total_hugs: 0,
        total_souls: 0
      };
    }

    const counts = {
      total_likes: 0,
      total_dislikes: 0,
      total_insightfuls: 0,
      total_hearts: 0,
      total_hugs: 0,
      total_souls: 0
    };

    reactions?.forEach(reaction => {
      switch (reaction.type) {
        case 'like': counts.total_likes++; break;
        case 'dislike': counts.total_dislikes++; break;
        case 'insightful': counts.total_insightfuls++; break;
        case 'heart': counts.total_hearts++; break;
        case 'hug': counts.total_hugs++; break;
        case 'soul': counts.total_souls++; break;
      }
    });

    return counts;
  } catch (error) {
    console.error('Error in getReactionCounts:', error);
    return {
      total_likes: 0,
      total_dislikes: 0,
      total_insightfuls: 0,
      total_hearts: 0,
      total_hugs: 0,
      total_souls: 0
    };
  }
};

class GrammarCorrector {
  private language: string;

  constructor(language: string = 'en-US') {
    this.language = language;
  }

  async processParagraph(paragraph: string, maxChunkSize: number = 500): Promise<any> {
    if (!paragraph.trim()) {
      return {
        originalText: paragraph,
        correctedText: paragraph,
        wasSplit: false,
        chunksProcessed: 0,
        totalCorrections: 0,
        corrections: []
      };
    }

    const cleanParagraph = paragraph.trim();

    try {
      // Direct API call to LanguageTool
      const response = await fetch('https://api.languagetool.org/v2/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          text: cleanParagraph,
          language: this.language,
        }),
      });

      if (!response.ok) {
        return {
          originalText: cleanParagraph,
          correctedText: cleanParagraph,
          wasSplit: false,
          chunksProcessed: 1,
          totalCorrections: 0,
          corrections: []
        };
      }

      const data = await response.json();
      const matches = data.matches || [];

      if (matches.length === 0) {
        return {
          originalText: cleanParagraph,
          correctedText: cleanParagraph,
          wasSplit: false,
          chunksProcessed: 1,
          totalCorrections: 0,
          corrections: []
        };
      }

      // Filter and sort matches
      const filteredMatches = this.filterCorrections(matches);

      // Sort by offset in descending order (right to left)
      const sortedMatches = filteredMatches.sort((a: any, b: any) => b.offset - a.offset);

      let correctedText = cleanParagraph;
      const corrections: any[] = [];

      // Apply corrections from RIGHT TO LEFT to avoid offset issues
      for (const match of sortedMatches) {
        console.log(`Processing match:`, {
          offset: match.offset,
          errorLength: match.errorLength || match.length,
          original: cleanParagraph.substring(match.offset, match.offset + (match.errorLength || match.length)),
          replacements: match.replacements
        });

        // Use match.length if errorLength is undefined
        const errorLength = match.errorLength || match.length || 0;

        if (match.replacements && match.replacements.length > 0) {
          const replacement = match.replacements[0];
          const suggestionText = typeof replacement === 'object' ? replacement.value : replacement;

          console.log(`Applying correction: "${cleanParagraph.substring(match.offset, match.offset + errorLength)}" -> "${suggestionText}"`);

          // Apply the correction
          correctedText = correctedText.substring(0, match.offset) +
            suggestionText +
            correctedText.substring(match.offset + errorLength);

          corrections.push({
            original: cleanParagraph.substring(match.offset, match.offset + errorLength),
            suggestion: suggestionText,
            message: match.message,
            ruleId: match.rule?.id || match.ruleId,
            offset: match.offset,
            pass: 1
          });

          console.log(`Text after correction: "${correctedText}"`);
        } else {
          // Handle cases where no replacements are provided
          console.log(`No replacements provided for: "${cleanParagraph.substring(match.offset, match.offset + errorLength)}"`);

          // Try to generate a basic correction based on the rule type
          if (match.rule?.issueType === 'misspelling') {
            // For spelling mistakes, try to suggest a corrected version
            const originalWord = cleanParagraph.substring(match.offset, match.offset + errorLength);
            const correctedWord = this.suggestSpellingCorrection(originalWord);

            if (correctedWord !== originalWord) {
              console.log(`Generated suggestion: "${originalWord}" -> "${correctedWord}"`);

              // Apply the correction
              correctedText = correctedText.substring(0, match.offset) +
                correctedWord +
                correctedText.substring(match.offset + errorLength);

              corrections.push({
                original: originalWord,
                suggestion: correctedWord,
                message: match.message || "Spelling correction",
                ruleId: match.rule?.id || "SPELLING_RULE",
                offset: match.offset,
                pass: 1
              });
            }
          }
        }
      }

      console.log(`Applied ${corrections.length} corrections`);
      console.log(`Original: "${cleanParagraph}"`);
      console.log(`Corrected: "${correctedText}"`);

      return {
        originalText: cleanParagraph,
        correctedText: correctedText,
        wasSplit: false,
        chunksProcessed: 1,
        totalCorrections: corrections.length,
        corrections: corrections
      };

    } catch (error) {
      console.error('Error in processParagraph:', error);
      return {
        originalText: cleanParagraph,
        correctedText: cleanParagraph,
        wasSplit: false,
        chunksProcessed: 1,
        totalCorrections: 0,
        corrections: []
      };
    }
  }

  // Add this helper method for basic spelling suggestions
  private suggestSpellingCorrection(word: string): string {
    // Basic spelling corrections for common mistakes
    const commonCorrections: Record<string, string> = {
      'continu': 'continue',
      'surprized': 'surprised',
      'spraed': 'spread',
      'ok': 'okay',
      'not': 'not'
    };

    return commonCorrections[word.toLowerCase()] || word;
  }

  private filterCorrections(matches: any[]): any[] {
    if (!matches.length) return [];

    // Sort by offset to process from left to right
    const sortedMatches = matches.sort((a: any, b: any) => a.offset - b.offset);

    // Remove overlapping matches, keeping the first (leftmost) one
    const filteredMatches: any[] = [];
    let lastEnd = -1;

    for (const match of sortedMatches) {
      if (match.offset >= lastEnd) {
        // Skip matches that are likely false positives or low confidence
        if (this.isReliableCorrection(match)) {
          filteredMatches.push(match);
          lastEnd = match.offset + match.errorLength;
        }
      }
    }

    return filteredMatches;
  }

  private isReliableCorrection(match: any): boolean {
    // Skip corrections that are often incorrect
    const unreliableRules = [
      'CONFUSION_RULE',  // Sometimes makes wrong suggestions
      'EN_QUOTES',       // Quote style preferences
    ];

    // Prioritize certain types of corrections
    const highPriorityRules = [
      'MORFOLOGIK_RULE_EN_US',  // Spelling errors
      'UPPERCASE_SENTENCE_START',  // Capitalization
      'ENGLISH_WORD_REPEAT_RULE',  // Word repetition
    ];

    // Skip if it's in unreliable rules
    if (unreliableRules.some(rule => match.ruleId && match.ruleId.includes(rule))) {
      return false;
    }

    // Always include high priority corrections
    if (highPriorityRules.some(rule => match.ruleId && match.ruleId.includes(rule))) {
      return true;
    }

    // Include if it has good suggestions
    if (match.replacements && match.replacements.length > 0) {
      return true;
    }

    return true; // Default to including the correction
  }
}

export const soulStoriesServices = {
  createStory: async (storyData: any, episodes: any[] = [], userId: string) => {
    try {
      const { co_authors, ...baseStoryData } = storyData;

      const finalStoryData = { ...baseStoryData, ...(co_authors && Array.isArray(co_authors) && co_authors.length > 0 && { co_authors }) };

      const { data, error } = await supabase
        .from('soul_stories')
        .insert([finalStoryData])
        .select()
        .single();

      if (error) throw error;

      if (episodes.length > 0) {
        const episodesData = episodes.map((ep, index) => ({
          story_id: data.id,
          episode_number: index + 1,
          title: ep.title || "",
          description: ep.description || "",
          video_url: ep.video_url,
          thumbnail_url: ep.thumbnail_url || ""
        }));

        await supabase.from('soul_story_episodes').insert(episodesData);
      }

      return {
        success: true,
        message: 'Story created successfully',
        story: data
      };

    } catch (error) {
      console.error('Error creating story:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to create story');
    }
  },

  getAnalytics: async (userId: string) => {
    try {
      // EXISTING: Get stories where user is main author (unchanged)
      const { data: analyticsData, error: analyticsError } = await supabase
        .from('soul_stories')
        .select('*')
        .eq('author_id', userId);

      // NEW: Additionally get stories where user is co-author (only if co_authors column exists)
      let coAuthorStories: any[] = [];
      try {
        const { data: coAuthorData, error: coAuthorError } = await supabase
          .from('soul_stories')
          .select('*')
          .contains('co_authors', [userId]);

        if (!coAuthorError && coAuthorData) {
          coAuthorStories = coAuthorData;
        }
      } catch (coAuthorQueryError) {
        // If co_authors column doesn't exist yet, silently continue with existing logic
        console.log('Co-authors column not available yet, using existing logic');
      }

      if (analyticsError) {
        console.log('Table not available or error:', analyticsError.message);
        return {
          analytics: {
            total_stories: 0,
            published_stories: 0,
            total_revenue: 0,
            category_breakdown: {
              books: 0,
              videos: 0,
              comics: 0,
              manga: 0,
              webtoons: 0
            },
            total_free_pages: 0,
            total_free_episodes: 0
          },
          stories: []
        };
      }

      // EXISTING: Main author stories
      const mainAuthorStories: any[] = analyticsData || [];

      // NEW: Combine with co-authored stories (avoiding duplicates)
      const existingStoryIds = new Set(mainAuthorStories.map(story => story.id));
      const uniqueCoAuthorStories = coAuthorStories.filter(story => !existingStoryIds.has(story.id));

      // Combined stories (main author + unique co-authored)
      const allStories = [...mainAuthorStories, ...uniqueCoAuthorStories];

      // EXISTING: Use original logic with combined stories
      if (!allStories || allStories.length === 0) {
        return {
          analytics: {
            total_stories: 0,
            total_revenue: 0,
            category_breakdown: {
              books: 0,
              videos: 0,
              comics: 0,
              manga: 0,
              webtoons: 0
            },
            total_free_pages: 0,
            total_free_episodes: 0
          },
          stories: []
        };
      }

      // EXISTING: Analytics calculation (unchanged)
      const analytics = {
        total_stories: allStories.length,
        published_stories: allStories.filter(story => story.status === 'published').length,
        total_free_pages: allStories.reduce((sum, story) => sum + (story.free_pages || 0), 0),
        total_free_episodes: allStories.reduce((sum, story) => sum + (story.free_episodes || 0), 0)
      };

      // EXISTING: Stories table format (updated to include thumbnail_url)
      const storiesTable = allStories
        .map(story => ({
          id: story.id,
          title: story.title,
          category: story.category,
          story_type: story.story_type,
          status: story.status,
          created_at: story.created_at,
          price: story.price,
          free_pages: story.free_pages,
          free_episodes: story.free_episodes,
          monetization_type: story.monetization_type,
          is_boosted: story.is_boosted || false,
          boost_type: story.boost_type || null,
          boost_end_date: story.boost_end_date || null,
          thumbnail_url: story.thumbnail_url || null
        }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return {
        analytics,
        stories: storiesTable
      };

    } catch (error) {
      console.error('Error in getAnalytics service:', error);
      // Return 0 analytics on any error
      return {
        analytics: {
          total_stories: 0,
          total_revenue: 0,
          category_breakdown: {
            books: 0,
            videos: 0,
            comics: 0,
            manga: 0,
            webtoons: 0
          },
          total_free_pages: 0,
          total_free_episodes: 0
        },
        stories: []
      };
    }
  },

  getStories: async (userId: string, type: string, options: {
    page: number;
    limit: number;
    sort: string;
  }) => {
    try {
      let query = supabase
        .from('soul_stories')
        .select(`
        *,
        soul_story_episodes(
          id,
          episode_number,
          title,
          description,
          video_url,
          thumbnail_url
        )
      `, { count: 'exact' });

      if (type !== 'all') {
        query = query.eq('category', type);
      }

      query = query.eq('active_status', true);
      query = query.order('created_at', { ascending: false });

      // Use the actual limit from options instead of hardcoded 5
      const limit = options.limit;
      const offset = (options.page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data: stories, error, count } = await query;

      if (error) {
        console.log('Table not available or error:', error.message);
        return {
          stories: [],
          pagination: {
            page: options.page,
            limit: limit,
            total: 0,
            totalPages: 0,
            hasMore: false,
            currentPage: options.page,
            nextPage: null,
            prevPage: null
          }
        };
      }

      const transformedStories = (stories || []).map(story => {
        if (story.content_type === 'episodes' && story.soul_story_episodes) {
          return {
            ...story,
            main_url: story.asset_url,
            episode_urls: story.soul_story_episodes.map((ep: any) => ({
              episode_number: ep.episode_number,
              title: ep.title,
              description: ep.description,
              video_url: ep.video_url,
              thumbnail_url: ep.thumbnail_url
            }))
          };
        } else {
          return {
            ...story,
            main_url: story.asset_url,
            episode_urls: null
          };
        }
      });

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      // Get reaction counts for all stories in ONE query
      const storyIds = transformedStories.map(story => story.id);
      let reactionCounts: Record<string, any> = {};
      let userReactions: Record<string, string> = {};
      let commentCounts: Record<string, number> = {};

      if (storyIds.length > 0) {
        // Get all reaction counts
        const { data: reactions } = await supabase
          .from('soul_story_reactions')
          .select('target_id, type')
          .eq('target_type', 'story')
          .in('target_id', storyIds);

        // Get current user's reactions for all stories
        if (userId) {
          const { data: userReactionData } = await supabase
            .from('soul_story_reactions')
            .select('target_id, type')
            .eq('user_id', userId)
            .eq('target_type', 'story')
            .in('target_id', storyIds);

          // Create a map of story_id -> user_reaction_type
          userReactionData?.forEach(reaction => {
            userReactions[reaction.target_id] = reaction.type;
          });
        }

        // Get comment counts for all stories
        const { data: comments } = await supabase
          .from('soul_story_comments')
          .select('soul_story_id')
          .in('soul_story_id', storyIds)
          .eq('is_deleted', false);

        // Calculate comment counts for each story
        storyIds.forEach(storyId => {
          commentCounts[storyId] = comments?.filter(c => c.soul_story_id === storyId).length || 0;
        });

        // Calculate reaction counts for each story
        storyIds.forEach(storyId => {
          const storyReactions = reactions?.filter(r => r.target_id === storyId) || [];
          reactionCounts[storyId] = {
            total_likes: storyReactions.filter(r => r.type === 'like').length,
            total_dislikes: storyReactions.filter(r => r.type === 'dislike').length,
            total_hearts: storyReactions.filter(r => r.type === 'heart').length,
            total_souls: storyReactions.filter(r => r.type === 'soul').length,
            total_insightfuls: storyReactions.filter(r => r.type === 'insightful').length,
            total_hugs: storyReactions.filter(r => r.type === 'hug').length
          };
        });
      }

      // Add reaction counts, user reaction, and comment count to each story
      const storiesWithReactions = transformedStories.map(story => ({
        ...story,
        total_likes: reactionCounts[story.id]?.total_likes || 0,
        total_dislikes: reactionCounts[story.id]?.total_dislikes || 0,
        total_hearts: reactionCounts[story.id]?.total_hearts || 0,
        total_souls: reactionCounts[story.id]?.total_souls || 0,
        total_insightfuls: reactionCounts[story.id]?.total_insightfuls || 0,
        total_hugs: reactionCounts[story.id]?.total_hugs || 0,
        user_reaction: userReactions[story.id] || null,
        total_comments: commentCounts[story.id] || 0,
        total_shares: story.total_shares || 0,
        total_views: story.total_views || 0  // ← This is already available from the story data
      }));

      // Sort stories: boosted first, then by engagement (no limit on boosted stories)
      const sortedStories = storiesWithReactions.sort((a, b) => {
        // Boosted stories first (no limit - all boosted stories can appear)
        if (a.is_boosted && !b.is_boosted) return -1;
        if (!a.is_boosted && b.is_boosted) return 1;

        // If both boosted or both not boosted, sort by engagement
        const aEngagement = (a.total_likes + a.total_hearts + a.total_insightfuls + a.total_hugs + a.total_souls) + a.total_comments;
        const bEngagement = (b.total_likes + b.total_hearts + b.total_insightfuls + b.total_hugs + b.total_souls) + b.total_comments;

        return bEngagement - aEngagement;
      });

      // Limit boosted stories to top 3-4 positions
      const boostedStories = sortedStories.filter(story => story.is_boosted).slice(0, 4);
      const regularStories = sortedStories.filter(story => !story.is_boosted);

      const finalStories = [...boostedStories, ...regularStories];

      return {
        stories: finalStories,
        pagination: {
          page: options.page,
          limit: limit, // Use actual limit
          total,
          totalPages,
          hasMore: (options.page * limit) < total,
          currentPage: options.page,
          nextPage: options.page < totalPages ? options.page + 1 : null,
          prevPage: options.page > 1 ? options.page - 1 : null
        }
      };

    } catch (error) {
      console.error('Error in getStories service:', error);
      // Return empty data on any error
      return {
        stories: [],
        pagination: {
          page: options.page,
          limit: options.limit,
          total: 0,
          totalPages: 0,
          hasMore: false,
          currentPage: options.page,
          nextPage: null,
          prevPage: null
        }
      };
    }
  },
  async deleteStory(userId: string, story_id: string) {
    try {
      // Check if story exists and user owns it
      const { data: story, error: checkError } = await supabase
        .from('soul_stories')
        .select('id, author_id')
        .eq('id', story_id)
        .single();

      if (checkError || !story) {
        throw new Error('Story not found');
      }

      if (story.author_id !== userId) {
        throw new Error('Unauthorized to delete this story');
      }

      // Delete episodes first (due to foreign key constraint)
      const { error: episodesError } = await supabase
        .from('soul_story_episodes')
        .delete()
        .eq('story_id', story_id);

      if (episodesError) {
        console.error('Error deleting episodes:', episodesError);
        throw new Error('Failed to delete episodes');
      }

      // Delete the main story
      const { error: storyError } = await supabase
        .from('soul_stories')
        .delete()
        .eq('id', story_id);

      if (storyError) {
        console.error('Error deleting story:', storyError);
        throw new Error('Failed to delete story');
      }

      return {
        success: true,
        message: 'Story and episodes deleted successfully'
      };

    } catch (error) {
      console.error('Error in deleteStory service:', error);
      throw error; // Re-throw to be handled by controller
    }
  },
  purchaseContent: async (userId: string, storyId: string, contentData: Array<{ type: 'page' | 'episode', identifier: string | number, coins: number }>) => {
    try {
      // Check user level from profiles table
      const { data: userProfile, error: profileError } = await supabase
        .from('profiles')
        .select('user_level')
        .eq('id', userId)
        .single();

      if (profileError || !userProfile) {
        throw new Error('User profile not found');
      }

      if (!userProfile.user_level || userProfile.user_level < 1) {
        return 'Not allowed';
      }

      // Get existing access for this user and story
      const { data: existingAccess, error: accessError } = await supabase
        .from('user_content_purchases')
        .select('*')
        .eq('user_id', userId)
        .eq('story_id', storyId)
        .single();

      let currentHighestPage = existingAccess?.highest_page_access || 0;
      let currentEpisodes = existingAccess?.accessible_episode_urls || [];
      let totalSpent = existingAccess?.total_coins_spent || 0;
      let totalRevenue = existingAccess?.author_revenue || 0;

      // Process each content item
      contentData.forEach(item => {
        if (item.type === 'page') {
          // For pages, increment the highest page access by 1 for each page purchased
          currentHighestPage += 1;
        } else if (item.type === 'episode') {
          if (!currentEpisodes.includes(item.identifier)) {
            currentEpisodes.push(item.identifier);
          }
        }
        totalSpent += item.coins;
        totalRevenue += item.coins;
      });

      // Determine content_type
      let contentType = 'page';
      if (contentData.some(item => item.type === 'episode')) {
        contentType = 'episode';
      }

      // Update or insert the access record
      const { data: upsertData, error: accessUpdateError } = await supabase
        .from('user_content_purchases')
        .upsert({
          user_id: userId,
          story_id: storyId,
          content_type: contentType,
          content_identifier: 'access',
          coins_paid: contentData.reduce((sum, item) => sum + item.coins, 0),
          author_revenue: totalRevenue,
          highest_page_access: currentHighestPage,
          accessible_episode_urls: currentEpisodes,
          total_coins_spent: totalSpent,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,story_id'
        });

      if (accessUpdateError) {
        console.log('❌ Upsert error details:', {
          error: accessUpdateError,
          data: {
            user_id: userId,
            story_id: storyId,
            content_type: contentType,
            content_identifier: 'access',
            coins_paid: contentData.reduce((sum, item) => sum + item.coins, 0),
            author_revenue: totalRevenue,
            highest_page_access: currentHighestPage,
            accessible_episode_urls: currentEpisodes,
            total_coins_spent: totalSpent
          }
        });
        throw new Error(`Failed to update story access: ${accessUpdateError.message}`);
      }

      // Handle coin transfers
      const totalCoins = contentData.reduce((sum, item) => sum + item.coins, 0);

      // Get user's current coins
      const { data: userCoins, error: userError } = await supabase
        .from('anamcoins')
        .select('available_coins, spent_coins, total_coins')
        .eq('user_id', userId)
        .single();

      if (userError || !userCoins) {
        throw new Error('User coins account not found');
      }

      if (userCoins.available_coins < totalCoins) {
        throw new Error(`Insufficient coins. Need ${totalCoins}, have ${userCoins.available_coins}`);
      }

      // Update user coins (deduct)
      const { error: userUpdateError } = await supabase
        .from('anamcoins')
        .update({
          available_coins: userCoins.available_coins - totalCoins,
          spent_coins: (userCoins.spent_coins || 0) + totalCoins,
          total_coins: userCoins.total_coins
        })
        .eq('user_id', userId);

      if (userUpdateError) {
        throw new Error('Failed to update user coins');
      }

      // Get story with co-authors
      const { data: story, error: storyError } = await supabase
        .from('soul_stories')
        .select('author_id, co_authors')
        .eq('id', storyId)
        .single();

      if (storyError || !story) {
        throw new Error('Story not found');
      }

      // Check if co-authors exist and are valid
      const hasCoAuthors = story.co_authors &&
        Array.isArray(story.co_authors) &&
        story.co_authors.length > 0;

      if (hasCoAuthors) {
        // NEW: Revenue sharing logic for stories with co-authors
        const allAuthors = [story.author_id, ...story.co_authors];
        const revenuePerAuthor = Math.floor(totalCoins / allAuthors.length);
        const remainder = totalCoins % allAuthors.length;

        // Distribute coins among all authors
        for (let i = 0; i < allAuthors.length; i++) {
          const authorId = allAuthors[i];
          const coinAmount = revenuePerAuthor + (i === 0 ? remainder : 0);

          const { data: authorCoins, error: authorError } = await supabase
            .from('anamcoins')
            .select('available_coins, total_coins')
            .eq('user_id', authorId)
            .single();

          if (authorError || !authorCoins) {
            console.error(`Author ${authorId} coins account not found`);
            continue;
          }

          const { error: authorUpdateError } = await supabase
            .from('anamcoins')
            .update({
              available_coins: authorCoins.available_coins + coinAmount,
              total_coins: authorCoins.total_coins + coinAmount
            })
            .eq('user_id', authorId);

          if (authorUpdateError) {
            console.error(`Failed to update coins for author ${authorId}`);
          }
        }
      } else {
        // EXISTING: Original logic for stories without co-authors
        const { data: authorCoins, error: authorError } = await supabase
          .from('anamcoins')
          .select('available_coins, total_coins')
          .eq('user_id', story.author_id)
          .single();

        if (authorError || !authorCoins) {
          throw new Error('Author coins account not found');
        }

        const { error: authorUpdateError } = await supabase
          .from('anamcoins')
          .update({
            available_coins: authorCoins.available_coins + totalCoins,
            total_coins: authorCoins.total_coins + totalCoins
          })
          .eq('user_id', story.author_id);

        if (authorUpdateError) {
          throw new Error('Failed to update author coins');
        }
      }

      return {
        success: true,
        highest_page_access: currentHighestPage,
        accessible_episodes: currentEpisodes,
        total_coins_spent: totalSpent,
        author_revenue: totalRevenue,
        message: 'Content purchased successfully'
      };

    } catch (error) {
      console.error('Error purchasing content:', error);
      throw error;
    }
  },

  getStoryAccess: async (userId: string, storyId: string) => {
    try {
      // Get story details
      const { data: story, error: storyError } = await supabase
        .from('soul_stories')
        .select('*')
        .eq('id', storyId)
        .single();

      if (storyError || !story) {
        return { success: false, message: 'Story not found' };
      }

      // Increment view count for the story
      await supabase
        .from('soul_stories')
        .update({ total_views: (story.total_views || 0) + 1 })
        .eq('id', storyId);

      // Award 15 soul points for accessing a story
      try {
        // Award 15 soul points for accessing a story
        const { error: soulPointsError } = await supabase.rpc('increment_soulpoints', {
          p_user_id: userId,
          p_points: 15
        });

        if (soulPointsError) {
          console.error('❌ Error awarding soul points:', soulPointsError);
        } else {
          console.log(`✅ Successfully awarded 15 soul points to user ${userId} for story ${storyId}`);
        }
      } catch (error) {
        console.error('❌ Exception in soul points award:', error);
      }

      // Get user's access for this story from existing table
      const { data: userAccess } = await supabase
        .from('user_content_purchases')  // Use existing table
        .select('*')
        .eq('user_id', userId)
        .eq('story_id', storyId)
        .single();

      if (story.asset_type === 'document') {
        // PDF Story - Return total accessible pages
        const totalAccessiblePages = story.free_pages + (userAccess?.highest_page_access || 0);

        return {
          story_id: storyId,
          story_title: story.title,
          story_category: story.category,
          story_type: 'PDF',
          free_pages: story.free_pages,
          purchased_pages: userAccess?.highest_page_access || 0,
          total_accessible_pages: totalAccessiblePages,
          total_coins_spent: userAccess?.total_coins_spent || 0,
          author_revenue: userAccess?.author_revenue || 0
        };

      } else if (story.asset_type === 'video') {
        // Video Story - Return accessible episode URLs
        const accessibleEpisodes = userAccess?.accessible_episode_urls || [];
        const totalAccessibleEpisodes = story.free_episodes + accessibleEpisodes.length;

        return {
          story_id: storyId,
          story_title: story.title,
          story_category: story.category,
          story_type: 'Video',
          free_episodes: story.free_episodes,
          accessible_episode_urls: accessibleEpisodes,
          total_accessible_episodes: totalAccessibleEpisodes,
          total_coins_spent: userAccess?.total_coins_spent || 0,
          author_revenue: userAccess?.author_revenue || 0
        };
      }

      throw new Error('Invalid story type');

    } catch (error) {
      console.error('Error getting story access:', error);
      return { success: false, message: 'Internal server error' };
    }
  },

  getUserRevenue: async (userId: string) => {
    try {
      const { data: userStories, error: storiesError } = await supabase
        .from('soul_stories')
        .select('id, title, category, story_type, asset_type')
        .eq('author_id', userId);

      if (storiesError) {
        throw new Error('Failed to fetch user stories');
      }

      if (!userStories || userStories.length === 0) {
        return {
          user_id: userId,
          total_revenue: 0,
          total_stories: 0,
          story_revenue: []
        };
      }

      const storyIds = userStories.map(story => story.id);
      const { data: purchases, error: purchasesError } = await supabase
        .from('user_content_purchases')
        .select('story_id, author_revenue, total_coins_spent, highest_page_access, accessible_episode_urls')
        .in('story_id', storyIds);

      if (purchasesError) {
        throw new Error('Failed to fetch story purchases');
      }

      const storyRevenue = userStories.map(story => {
        const storyPurchases = purchases?.filter(p => p.story_id === story.id) || [];
        const totalRevenue = storyPurchases.reduce((sum, p) => sum + (p.author_revenue || 0), 0);
        const pagesSold = storyPurchases.reduce((max, p) => Math.max(max, p.highest_page_access || 0), 0);
        const episodesSold = storyPurchases.reduce((sum, p) => sum + (p.accessible_episode_urls?.length || 0), 0);

        return {
          story_id: story.id,
          story_title: story.title,
          story_category: story.category,
          story_type: story.story_type,
          asset_type: story.asset_type,
          total_revenue: totalRevenue,
          pages_sold: pagesSold,
          episodes_sold: episodesSold,
          total_coins_earned: totalRevenue
        };
      });

      const totalRevenue = storyRevenue.reduce((sum, story) => sum + story.total_revenue, 0);

      return {
        user_id: userId,
        total_revenue: totalRevenue,
        total_stories: userStories.length,
        story_revenue: storyRevenue
      };

    } catch (error) {
      console.error('Error fetching user revenue:', error);
      throw error;
    }
  },

  searchAllContent: async (query: string, category: string, userId: string, storyId?: string) => {
    try {
      let supabaseQuery = supabase
        .from('soul_stories')
        .select(`
          *,
          soul_story_episodes(
            id,
            episode_number,
            title,
            description,
            video_url,
            thumbnail_url
          )
        `, { count: 'exact' });

      if (storyId) {
        supabaseQuery = supabaseQuery.eq('id', storyId);
      } else {
        if (category && category !== 'all') {
          supabaseQuery = supabaseQuery.eq('category', category);
        }

        if (query && query.toLowerCase() !== 'all') {
          supabaseQuery = supabaseQuery.or(
            `title.ilike.%${query}%,description.ilike.%${query}%,tags.cs.{${query}}`
          );
        }
      }

      supabaseQuery = supabaseQuery.order('created_at', { ascending: false });

      const { data: stories, error, count } = await supabaseQuery;

      if (error) {
        return {
          success: false,
          data: {
            analytics: {
              total_stories: 0,
              published_stories: 0,
              total_free_pages: 0,
              total_free_episodes: 0
            },
            stories: []
          }
        };
      }

      const transformedStories = (stories || []).map(story => {
        if (story.content_type === 'episodes' && story.soul_story_episodes) {
          return {
            ...story,
            main_url: story.asset_url,
            episode_urls: story.soul_story_episodes.map((ep: any) => ({
              episode_number: ep.episode_number,
              title: ep.title,
              description: ep.description,
              video_url: ep.video_url,
              thumbnail_url: ep.thumbnail_url
            }))
          };
        } else {
          return {
            ...story,
            main_url: story.asset_url,
            episode_urls: null
          };
        }
      });

      const analytics = {
        total_stories: transformedStories.length,
        published_stories: transformedStories.filter(story => story.status === 'published').length,
        total_free_pages: transformedStories.reduce((sum, story) => sum + (story.free_pages || 0), 0),
        total_free_episodes: transformedStories.reduce((sum, story) => sum + (story.free_episodes || 0), 0)
      };

      const top20Results = transformedStories.slice(0, 20);

      return {
        success: true,
        data: {
          analytics,
          stories: top20Results
        }
      };

    } catch (error) {
      console.error('Error in searchAllContent:', error);
      return {
        success: false,
        data: {
          analytics: {
            total_stories: 0,
            published_stories: 0,
            total_free_pages: 0,
            total_free_episodes: 0
          },
          stories: []
        }
      };
    }
  },

  createComment: async (userId: string, soulStoryId: string, content: string, imgs: string[] = []) => {
    try {
      console.log('Searching for soul story with ID:', soulStoryId);

      // First, let's check if the story exists at all
      const { data: storyData, error: storyError } = await supabase
        .from('soul_stories')
        .select('id, author_id, title')
        .eq('id', soulStoryId)
        .single();

      if (storyError) {
        console.log('Story error details:', storyError);
        if (storyError.code === 'PGRST116') {
          return { success: false, message: 'Soul story not found!' };
        }
        return { success: false, message: `Database error: ${storyError.message}` };
      }

      if (!storyData) {
        return { success: false, message: 'Soul story not found!' };
      }

      // Check if story is deleted (only if the field exists)
      try {
        const { data: deletedCheck } = await supabase
          .from('soul_stories')
          .select('is_deleted')
          .eq('id', soulStoryId)
          .single();

        if (deletedCheck?.is_deleted === true) {
          return { success: false, message: 'Soul story has been deleted!' };
        }
      } catch (fieldError) {
        // Field doesn't exist, continue without deletion check
        console.log('is_deleted field not found, skipping deletion check');
      }

      const { data: userProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', userId)
        .single();

      if (!userProfile) {
        return { success: false, message: 'User profile not found!' };
      }

      const user_name = `${userProfile.first_name}${userProfile.last_name ? ` ${userProfile.last_name}` : ''}`;

      const { data, error } = await supabase
        .from('soul_story_comments')
        .insert([{
          soul_story_id: soulStoryId,
          content,
          imgs,
          user_name,
          user_id: userId
        }])
        .select();

      if (error) {
        console.log('Comment insert error:', error);
        return { success: false, message: error.message };
      }

      if (!data || data.length === 0) {
        return { success: false, message: 'Comment creation failed' };
      }

      return {
        success: true,
        message: 'Comment created successfully!',
        data: data[0]
      };

    } catch (error) {
      console.error('Error in createComment service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },

  createReply: async (userId: string, commentId: string, content: string, imgs: string[] = []) => {
    try {
      const { data: commentData, error: commentError } = await supabase
        .from('soul_story_comments')
        .select('id, soul_story_id')
        .eq('id', commentId)
        .eq('is_deleted', false)
        .single();

      if (commentError || !commentData) {
        return { success: false, message: 'Parent comment not found!' };
      }

      const { data: userProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', userId)
        .single();

      if (!userProfile) {
        return { success: false, message: 'User profile not found!' };
      }

      const user_name = `${userProfile.first_name}${userProfile.last_name ? ` ${userProfile.last_name}` : ''}`;

      const { data, error } = await supabase
        .from('soul_story_comments')
        .insert([{
          soul_story_id: commentData.soul_story_id,
          content,
          imgs,
          user_name,
          user_id: userId,
          reply_to_id: commentId,
          is_reply: true
        }])
        .select();

      if (error) {
        return { success: false, message: error.message };
      }

      if (!data || data.length === 0) {
        return { success: false, message: 'Reply creation failed' };
      }

      return {
        success: true,
        message: 'Reply created successfully!',
        data: data[0]
      };

    } catch (error) {
      console.error('Error in createReply service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },

  getComments: async (soulStoryId: string, page: number = 1, limit: number = 10, userId?: string) => {
    try {
      const offset = (page - 1) * limit;

      const { data: comments, error, count } = await supabase
        .from('soul_story_comments')
        .select('*', { count: 'exact' })
        .eq('soul_story_id', soulStoryId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return { success: false, message: error.message };
      }

      if (userId && comments) {
        const commentsWithReactions = await Promise.all(comments.map(async (comment) => {
          const { data: reactionData } = await supabase
            .from('soul_story_reactions')
            .select('type')
            .eq('user_id', userId)
            .eq('target_id', comment.id)
            .eq('target_type', 'comment')
            .maybeSingle();

          return {
            ...comment,
            user_reaction: reactionData?.type || null
          };
        }));

        return {
          success: true,
          data: {
            comments: commentsWithReactions,
            total: count,
            page,
            limit
          }
        };
      }

      return {
        success: true,
        data: {
          comments: comments || [],
          total: count,
          page,
          limit
        }
      };

    } catch (error) {
      console.error('Error in getComments service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },

  getCommentsWithReplies: async (soulStoryId: string, page: number = 1, limit: number = 10, userId?: string) => {
    try {
      const offset = (page - 1) * limit;

      const { data: comments, error, count } = await supabase
        .from('soul_story_comments')
        .select('*', { count: 'exact' })
        .eq('soul_story_id', soulStoryId)
        .eq('is_deleted', false)
        .eq('is_reply', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return { success: false, message: error.message };
      }

      if (userId && comments) {
        const commentsWithReplies = await Promise.all(comments.map(async (comment) => {
          // Get replies for this comment
          const { data: replies } = await supabase
            .from('soul_story_comments')
            .select('*')
            .eq('reply_to_id', comment.id)
            .eq('is_deleted', false)
            .eq('is_reply', true)
            .order('created_at', { ascending: true });

          // Get user reaction for comment
          const { data: commentReaction } = await supabase
            .from('soul_story_reactions')
            .select('type')
            .eq('user_id', userId)
            .eq('target_id', comment.id)
            .eq('target_type', 'comment')
            .maybeSingle();

          // Get user reactions for replies
          const repliesWithReactions = await Promise.all((replies || []).map(async (reply) => {
            const { data: replyReaction } = await supabase
              .from('soul_story_reactions')
              .select('type')
              .eq('user_id', userId)
              .eq('target_id', reply.id)
              .eq('target_type', 'comment')
              .maybeSingle();

            return {
              ...reply,
              user_reaction: replyReaction?.type || null
            };
          }));

          return {
            ...comment,
            user_reaction: commentReaction?.type || null,
            replies: repliesWithReactions
          };
        }));

        return {
          success: true,
          data: {
            comments: commentsWithReplies,
            total: count,
            page,
            limit
          }
        };
      }

      return {
        success: true,
        data: {
          comments: comments || [],
          total: count,
          page,
          limit
        }
      };

    } catch (error) {
      console.error('Error in getCommentsWithReplies service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },

  updateComment: async (userId: string, commentId: string, content: string, imgs: string[] = []) => {
    try {
      const { data: commentData, error: fetchError } = await supabase
        .from('soul_story_comments')
        .select('user_id')
        .eq('id', commentId)
        .eq('is_deleted', false)
        .single();

      if (fetchError || !commentData) {
        return { success: false, message: 'Comment not found!' };
      }

      if (commentData.user_id !== userId) {
        return { success: false, message: 'You can only edit your own comments!' };
      }

      const { error: updateError } = await supabase
        .from('soul_story_comments')
        .update({
          content,
          imgs: imgs || [],
          updated_at: new Date().toISOString()
        })
        .eq('id', commentId);

      if (updateError) {
        return { success: false, message: updateError.message };
      }

      return { success: true, message: 'Comment updated successfully!' };

    } catch (error) {
      console.error('Error in updateComment service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },

  deleteComment: async (userId: string, commentId: string) => {
    try {
      const { data: commentData, error: fetchError } = await supabase
        .from('soul_story_comments')
        .select('user_id')
        .eq('id', commentId)
        .eq('is_deleted', false)
        .single();

      if (fetchError || !commentData) {
        return { success: false, message: 'Comment not found!' };
      }

      if (commentData.user_id !== userId) {
        return { success: false, message: 'You can only delete your own comments!' };
      }

      const { error: deleteError } = await supabase
        .from('soul_story_comments')
        .update({ is_deleted: true })
        .eq('id', commentId);

      if (deleteError) {
        return { success: false, message: deleteError.message };
      }

      return { success: true, message: 'Comment deleted successfully!' };

    } catch (error) {
      console.error('Error in deleteComment service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },

  updateCommentReaction: async (userId: string, commentId: string, type: string) => {
    try {
      console.log('updateCommentReaction service called with:', { userId, commentId, type });

      const { data: existing, error: fetchError } = await supabase
        .from('soul_story_reactions')
        .select('*')
        .eq('user_id', userId)
        .eq('target_id', commentId)
        .eq('target_type', 'comment')
        .single();

      console.log('Existing reaction check:', { existing, fetchError });

      const { data: commentData, error: commentError } = await supabase
        .from('soul_story_comments')
        .select('user_id, content, total_likes, total_dislikes, total_insightfuls, total_hearts, total_hugs, total_souls')
        .eq('id', commentId)
        .eq('is_deleted', false)
        .single();

      console.log('Comment data check:', { commentData, commentError });

      if (commentError || !commentData) {
        console.log('Comment not found or error:', commentError);
        return { success: false, message: 'Comment not found!' };
      }

      const fieldMap: Record<string, string> = {
        'like': 'total_likes',
        'dislike': 'total_dislikes',
        'insightful': 'total_insightfuls',
        'heart': 'total_hearts',
        'hug': 'total_hugs',
        'soul': 'total_souls'
      };

      const currentField = fieldMap[type];
      const updates: Record<string, number> = {};

      if (existing) {
        if (existing.type === type) {
          updates[currentField] = Math.max(0, (commentData as any)[currentField] - 1);

          const { error: deleteError } = await supabase
            .from('soul_story_reactions')
            .delete()
            .eq('id', existing.id);

          if (deleteError) {
            console.log('Delete reaction error:', deleteError);
            return { success: false, message: deleteError.message };
          }

          const { error: updateCommentError } = await supabase
            .from('soul_story_comments')
            .update(updates)
            .eq('id', commentId);

          if (updateCommentError) {
            console.log('Update comment error:', updateCommentError);
            return { success: false, message: updateCommentError.message };
          }

          return { success: true, message: `${type} removed!` };
        }

        const prevField = fieldMap[existing.type];
        updates[prevField] = Math.max(0, (commentData as any)[prevField] - 1);
        updates[currentField] = (commentData as any)[currentField] + 1;

        const { error: updateReactionError } = await supabase
          .from('soul_story_reactions')
          .update({ type, updated_by: userId })
          .eq('id', existing.id);

        if (updateReactionError) {
          console.log('Update reaction error:', updateReactionError);
          return { success: false, message: updateReactionError.message };
        }

        const { error: updateCommentError } = await supabase
          .from('soul_story_comments')
          .update(updates)
          .eq('id', commentId);

        if (updateCommentError) {
          console.log('Update comment error:', updateCommentError);
          return { success: false, message: updateCommentError.message };
        }

        return { success: true, message: `Reaction updated to ${type}!` };
      }

      updates[currentField] = (commentData as any)[currentField] + 1;

      const { error: insertError } = await supabase
        .from('soul_story_reactions')
        .insert([{ user_id: userId, target_id: commentId, target_type: 'comment', type }]);

      if (insertError) {
        console.log('Insert reaction error:', insertError);
        return { success: false, message: insertError.message };
      }

      const { error: updateCommentError } = await supabase
        .from('soul_story_comments')
        .update(updates)
        .eq('id', commentId);

      if (updateCommentError) {
        console.log('Update comment error:', updateCommentError);
        return { success: false, message: updateCommentError.message };
      }

      return { success: true, message: `${type} added!` };

    } catch (error) {
      console.error('Error in updateCommentReaction service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },

  updateStoryReaction: async (userId: string, storyId: string, type: string) => {
    try {
      console.log('updateStoryReaction service called with:', { userId, storyId, type });

      const { data: existing, error: fetchError } = await supabase
        .from('soul_story_reactions')
        .select('*')
        .eq('user_id', userId)
        .eq('target_id', storyId)
        .eq('target_type', 'story')
        .single();

      console.log('Existing reaction check:', { existing, fetchError });

      // Just check if story exists (without is_deleted filter)
      const { data: storyData, error: storyError } = await supabase
        .from('soul_stories')
        .select('id, author_id, title')
        .eq('id', storyId)
        .single();

      console.log('Story data check:', { storyData, storyError });

      if (storyError || !storyData) {
        console.log('Story not found or error:', storyError);
        return { success: false, message: 'Story not found!' };
      }

      if (existing) {
        if (existing.type === type) {
          // Remove reaction - just delete from reactions table
          const { error: deleteError } = await supabase
            .from('soul_story_reactions')
            .delete()
            .eq('id', existing.id);

          if (deleteError) {
            console.log('Delete reaction error:', deleteError);
            return { success: false, message: deleteError.message };
          }

          // Get updated counts from reactions table
          const reactionCounts = await getReactionCounts(storyId, 'story');

          return {
            success: true,
            message: `${type} removed!`,
            data: {
              reaction_counts: reactionCounts,
              user_reaction: null,
              total_reactions: Object.values(reactionCounts).reduce((sum, count) => sum + count, 0)
            }
          };
        }

        // Change reaction type - just update the reaction
        const { error: updateReactionError } = await supabase
          .from('soul_story_reactions')
          .update({ type, updated_by: userId })
          .eq('id', existing.id);

        if (updateReactionError) {
          console.log('Update reaction error:', updateReactionError);
          return { success: false, message: updateReactionError.message };
        }

        // Get updated counts from reactions table
        const reactionCounts = await getReactionCounts(storyId, 'story');

        return {
          success: true,
          message: `Reaction updated to ${type}!`,
          data: {
            reaction_counts: reactionCounts,
            user_reaction: type,
            total_reactions: Object.values(reactionCounts).reduce((sum, count) => sum + count, 0)
          }
        };
      }

      // Add new reaction - just insert into reactions table
      const { error: insertError } = await supabase
        .from('soul_story_reactions')
        .insert([{ user_id: userId, target_id: storyId, target_type: 'story', type }]);

      if (insertError) {
        console.log('Insert reaction error:', insertError);
        return { success: false, message: insertError.message };
      }

      // Get updated counts from reactions table
      const reactionCounts = await getReactionCounts(storyId, 'story');

      return {
        success: true,
        message: `${type} added!`,
        data: {
          reaction_counts: reactionCounts,
          user_reaction: type,
          total_reactions: Object.values(reactionCounts).reduce((sum, count) => sum + count, 0)
        }
      };

    } catch (error) {
      console.error('Error in updateStoryReaction service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },

  getStoryWithReactions: async (storyId: string, userId?: string) => {
    try {
      const { data: story, error: storyError } = await supabase
        .from('soul_stories')
        .select('*')
        .eq('id', storyId)
        .single();

      console.log('Story data:', story);
      console.log('Story error:', storyError);

      if (storyError || !story) {
        return { success: false, message: 'Story not found!' };
      }

      let userReaction = null;

      if (userId) {
        const { data: reactionData } = await supabase
          .from('soul_story_reactions')
          .select('type')
          .eq('user_id', userId)
          .eq('target_id', storyId)
          .eq('target_type', 'story')
          .maybeSingle();

        userReaction = reactionData?.type || null;
      }

      // Get reaction counts from reactions table instead of story table
      const reaction_counts = await getReactionCounts(storyId, 'story');

      console.log('Returning story with reactions:', {
        storyId,
        reaction_counts,
        userReaction
      });

      return {
        success: true,
        data: {
          ...story,
          reaction_counts,
          user_reaction: userReaction,
          // Add total_reactions field
          total_reactions: Object.values(reaction_counts).reduce((sum, count) => sum + count, 0)
        }
      };

    } catch (error) {
      console.error('Error in getStoryWithReactions service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },

  getCommentReactions: async (commentId: string, userId?: string) => {
    try {
      const { data: reactions, error: reactionsError } = await supabase
        .from('soul_story_reactions')
        .select('*')
        .eq('target_id', commentId)
        .eq('target_type', 'comment');

      if (reactionsError) {
        console.log('Error getting comment reactions:', reactionsError);
        return { success: false, message: reactionsError.message };
      }

      // Get current user's reaction if logged in
      let userReaction = null;
      if (userId) {
        const userReactionData = reactions?.find(r => r.user_id === userId);
        userReaction = userReactionData?.type || null;
      }

      // Calculate reaction counts
      const reaction_counts = {
        total_likes: reactions?.filter(r => r.type === 'like').length || 0,
        total_dislikes: reactions?.filter(r => r.type === 'dislike').length || 0,
        total_insightfuls: reactions?.filter(r => r.type === 'insightful').length || 0,
        total_hearts: reactions?.filter(r => r.type === 'heart').length || 0,
        total_hugs: reactions?.filter(r => r.type === 'hug').length || 0,
        total_souls: reactions?.filter(r => r.type === 'soul').length || 0,
      };

      // Get users who reacted (with profile data)
      const userIds = reactions?.map(r => r.user_id) || [];
      let usersWithReactions: any[] = [];

      if (userIds.length > 0) {
        const { data: userProfiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .in('id', userIds);

        // Map reactions to user profiles
        usersWithReactions = reactions?.map(reaction => {
          const userProfile = userProfiles?.find(p => p.id === reaction.user_id);
          return {
            reaction_id: reaction.id,
            reaction_type: reaction.type,
            reacted_at: reaction.created_at,
            user: userProfile ? {
              id: userProfile.id,
              name: `${userProfile.first_name} ${userProfile.last_name || ''}`.trim(),
              avatar: userProfile.avatar_url
            } : null
          };
        }) || [];
      }

      return {
        success: true,
        data: {
          comment_id: commentId,
          reaction_counts,
          user_reaction: userReaction,
          total_reactions: Object.values(reaction_counts).reduce((sum, count) => sum + count, 0),
          users_who_reacted: usersWithReactions
        }
      };

    } catch (error) {
      console.error('Error in getCommentReactions service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  
  // getTrendingStories: async (userId?: string, page: number = 1, limit: number = 200) => {
  //   try {
  //     const offset = (page - 1) * limit;

  //     // Get all stories first with active_status filter
  //     const { data: stories, error, count } = await supabase
  //       .from('soul_stories')
  //       .select(`
  //         *,
  //         soul_story_episodes(
  //           id, episode_number, title, description, video_url, thumbnail_url
  //         )
  //       `, { count: 'exact' })
  //       .eq('active_status', true) // Add active_status filter
  //       .order('created_at', { ascending: false })
  //       .range(offset, offset + limit - 1);

  //     if (error) {
  //       console.log('Error getting trending stories:', error);
  //       return { success: false, message: error.message };
  //     }

  //     // Transform stories to EXACTLY match getStories structure
  //     const transformedStories = (stories || []).map(story => {
  //       if (story.content_type === 'episodes' && story.soul_story_episodes) {
  //         // For episode-based stories, return main URL + episode URLs (EXACTLY like getStories)
  //         return {
  //           ...story,
  //           main_url: story.asset_url, // Main story URL (can be series trailer/cover)
  //           episode_urls: story.soul_story_episodes.map((ep: any) => ({
  //             episode_number: ep.episode_number,
  //             title: ep.title,
  //             description: ep.description,
  //             video_url: ep.video_url, // Individual episode video URL
  //             thumbnail_url: ep.thumbnail_url
  //           }))
  //         };
  //       } else {
  //         // For single asset stories, return main URL (EXACTLY like getStories)
  //         return {
  //           ...story,
  //           main_url: story.asset_url, // Main story URL
  //           episode_urls: null // No episodes
  //         };
  //       }
  //     });

  //     // Get reaction counts for all stories in ONE query (EXACTLY like getStories)
  //     const storyIds = transformedStories.map(story => story.id);
  //     let reactionCounts: Record<string, any> = {};
  //     let userReactions: Record<string, string> = {};
  //     let commentCounts: Record<string, number> = {};

  //     if (storyIds.length > 0) {
  //       // Get all reaction counts
  //       const { data: reactions } = await supabase
  //         .from('soul_story_reactions')
  //         .select('target_id, type')
  //         .eq('target_type', 'story')
  //         .in('target_id', storyIds);

  //       // Get current user's reactions for all stories
  //       if (userId) {
  //         const { data: userReactionData } = await supabase
  //           .from('soul_story_reactions')
  //           .select('target_id, type')
  //           .eq('target_type', 'story')
  //           .eq('user_id', userId)
  //           .in('target_id', storyIds);

  //         userReactionData?.forEach(reaction => {
  //           userReactions[reaction.target_id] = reaction.type;
  //         });
  //       }

  //       // Get comment counts for all stories
  //       const { data: commentData } = await supabase
  //         .from('soul_story_comments')
  //         .select('soul_story_id')
  //         .eq('is_deleted', false)
  //         .in('soul_story_id', storyIds);

  //       // Calculate reaction counts and comment counts (EXACTLY like getStories)
  //       storyIds.forEach(storyId => {
  //         const storyReactions = reactions?.filter(r => r.target_id === storyId) || [];
  //         const storyComments = commentData?.filter(c => c.soul_story_id === storyId) || [];

  //         reactionCounts[storyId] = {
  //           total_likes: storyReactions.filter(r => r.type === 'like').length,
  //           total_dislikes: storyReactions.filter(r => r.type === 'dislike').length,
  //           total_hearts: storyReactions.filter(r => r.type === 'heart').length,
  //           total_souls: storyReactions.filter(r => r.type === 'soul').length,
  //           total_insightfuls: storyReactions.filter(r => r.type === 'insightful').length,
  //           total_hugs: storyReactions.filter(r => r.type === 'hug').length
  //         };

  //         commentCounts[storyId] = storyComments.length;
  //       });
  //     }

  //     // Add reaction counts, user reaction, and comment count to each story (EXACTLY like getStories)
  //     const storiesWithReactions = transformedStories.map(story => ({
  //       ...story,
  //       total_likes: reactionCounts[story.id]?.total_likes || 0,
  //       total_dislikes: reactionCounts[story.id]?.total_dislikes || 0,
  //       total_hearts: reactionCounts[story.id]?.total_hearts || 0,
  //       total_souls: reactionCounts[story.id]?.total_souls || 0,
  //       total_insightfuls: reactionCounts[story.id]?.total_insightfuls || 0,
  //       total_hugs: reactionCounts[story.id]?.total_hugs || 0,
  //       user_reaction: userReactions[story.id] || null,
  //       total_comments: commentCounts[story.id] || 0,
  //       total_views: story.total_views || 0
  //     }));

  //     // TRENDING LOGIC INTACT: Sort by total engagement (reactions + comments + views) - HIGHEST FIRST
  //     const sortedStories = storiesWithReactions.sort((a, b) => {
  //       // Calculate engagement score (same as trending logic)
  //       const aEngagement = (a.total_likes + a.total_hearts + a.total_insightfuls + a.total_hugs + a.total_souls) + a.total_comments + a.total_views;
  //       const bEngagement = (b.total_likes + b.total_hearts + b.total_insightfuls + b.total_hugs + b.total_souls) + b.total_comments + b.total_views;

  //       return bEngagement - aEngagement;
  //     });

  //     const total = count || 0;
  //     const totalPages = Math.ceil(total / limit);

  //     // Return EXACTLY the same structure as getStories
  //     return {
  //       stories: sortedStories,
  //       pagination: {
  //         page: page,
  //         limit: limit,
  //         total,
  //         totalPages,
  //         hasMore: (page * limit) < total,
  //         currentPage: page,
  //         nextPage: page < totalPages ? page + 1 : null,
  //         prevPage: page > 1 ? page - 1 : null
  //       }
  //     };

  //   } catch (error) {
  //     console.log('Error in getTrendingStories:', error);
  //     // Return empty data on any error (EXACTLY like getStories)
  //     return {
  //       stories: [],
  //       pagination: {
  //         page: page,
  //         limit: limit,
  //         total: 0,
  //         totalPages: 0,
  //         hasMore: false,
  //         currentPage: page,
  //         nextPage: null,
  //         prevPage: null
  //       }
  //     };
  //   }
  // },
  getTrendingStories: async (userId?: string, page: number = 1, limit: number = 200) => {
    try {
      const offset = (page - 1) * limit;

      // Get all stories first with active_status filter
      const { data: stories, error, count } = await supabase
        .from('soul_stories')
        .select(`
          *,
          soul_story_episodes(
            id, episode_number, title, description, video_url, thumbnail_url
          )
        `, { count: 'exact' })
        .eq('active_status', true) // Add active_status filter
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.log('Error getting trending stories:', error);
        return { success: false, message: error.message };
      }

      // Transform stories to match getStories structure
      const transformedStories = stories?.map(story => {
        if (story.content_type === 'episodes' && story.soul_story_episodes) {
          // For episode-based stories, return main URL + episode URLs (EXACTLY like getStories)
          return {
            ...story,
            main_url: story.asset_url, // Main story URL (can be series trailer/cover)
            episode_urls: story.soul_story_episodes.map((ep: any) => ({
              episode_number: ep.episode_number,
              title: ep.title,
              description: ep.description,
              video_url: ep.video_url, // Individual episode video URL
              thumbnail_url: ep.thumbnail_url
            }))
          };
        } else {
          // For single asset stories, return main URL (EXACTLY like getStories)
          return {
            ...story,
            main_url: story.asset_url, // Main story URL
            episode_urls: null // No episodes
          };
        }
      }) || [];

      // Get reaction counts for all stories in ONE query
      const storyIds = transformedStories.map(story => story.id);
      let reactionCounts: Record<string, any> = {};
      let userReactions: Record<string, string> = {};
      let commentCounts: Record<string, number> = {};

      if (storyIds.length > 0) {
        // Get all reaction counts
        const { data: reactions } = await supabase
          .from('soul_story_reactions')
          .select('target_id, type')
          .eq('target_type', 'story')
          .in('target_id', storyIds);

        // Get current user's reactions for all stories
        if (userId) {
          const { data: userReactionData } = await supabase
            .from('soul_story_reactions')
            .select('target_id, type')
            .eq('target_type', 'story')
            .eq('user_id', userId)
            .in('target_id', storyIds);

          userReactionData?.forEach(reaction => {
            userReactions[reaction.target_id] = reaction.type;
          });
        }

        // Get comment counts for all stories
        const { data: commentData } = await supabase
          .from('soul_story_comments')
          .select('soul_story_id')
          .eq('is_deleted', false)
          .in('soul_story_id', storyIds);

        // Calculate reaction counts and comment counts
        storyIds.forEach(storyId => {
          const storyReactions = reactions?.filter(r => r.target_id === storyId) || [];
          const storyComments = commentData?.filter(c => c.soul_story_id === storyId) || [];

          reactionCounts[storyId] = {
            total_likes: storyReactions.filter(r => r.type === 'like').length,
            total_dislikes: storyReactions.filter(r => r.type === 'dislike').length,
            total_insightfuls: storyReactions.filter(r => r.type === 'insightful').length,
            total_hearts: storyReactions.filter(r => r.type === 'heart').length,
            total_hugs: storyReactions.filter(r => r.type === 'hug').length,
            total_souls: storyReactions.filter(r => r.type === 'soul').length
          };

          commentCounts[storyId] = storyComments.length;
        });
      }

      // Add reaction counts and comment counts to stories
      const storiesWithEngagement = transformedStories.map(story => {
        const reactions = reactionCounts[story.id] || {};
        const commentCount = commentCounts[story.id] || 0;

        // Calculate total engagement score
        const totalReactions = (reactions.total_likes || 0) +
          (reactions.total_hearts || 0) +
          (reactions.total_insightfuls || 0) +
          (reactions.total_hugs || 0) +
          (reactions.total_souls || 0);

        // Include views in engagement score
        const totalEngagement = totalReactions + commentCount + (story.total_views || 0);

        return {
          ...story,
          total_likes: reactions.total_likes || 0,
          total_dislikes: reactions.total_dislikes || 0,
          total_insightfuls: reactions.total_insightfuls || 0,
          total_hearts: reactions.total_hearts || 0,
          total_hugs: reactions.total_hugs || 0,
          total_souls: reactions.total_souls || 0,
          user_reaction: userReactions[story.id] || null,
          total_comments: commentCount,
          total_views: story.total_views || 0,
          total_shares: story.total_shares || 0,
          total_engagement: totalEngagement,
          total_reactions: totalReactions
        };
      });

      // Sort by total engagement (reactions + comments) - HIGHEST FIRST
      const sortedStories = storiesWithEngagement.sort((a, b) => {
        return b.total_engagement - a.total_engagement;
      });

      const total = count || 0;

      return {
        success: true,
        data: {
          stories: sortedStories,
          total,
          page,
          limit
        }
      };
    } catch (error) {
      console.log('Error in getTrendingStories:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  getEpisodeAccess: async (userId: string, storyId: string, episodeId: string) => {
    try {
      // Get episode details
      const { data: episode, error: episodeError } = await supabase
        .from('soul_story_episodes')
        .select('*')
        .eq('id', episodeId)
        .eq('soul_story_id', storyId)
        .single();

      if (episodeError || !episode) {
        return { success: false, message: 'Episode not found' };
      }

      // Increment view count for the episode
      await supabase
        .from('soul_story_episodes')
        .update({ total_views: (episode.total_views || 0) + 1 })
        .eq('id', episodeId);

      // Also increment story view count
      await supabase
        .from('soul_stories')
        .update({ total_views: (episode.total_views || 0) + 1 })
        .eq('id', storyId);

      return { success: true, data: episode };
    } catch (error) {
      console.log('Error in getEpisodeAccess:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  boostSoulStory: async (userId: string, storyId: string, boostType: 'weekly' | 'monthly') => {
    try {
      // Boost costs and durations
      const boostConfig = {
        weekly: { cost: 100, duration: 7 * 24 * 60 * 60 * 1000 }, // 7 days
        monthly: { cost: 300, duration: 30 * 24 * 60 * 60 * 1000 } // 30 days
      };

      const config = boostConfig[boostType];
      if (!config) {
        return { success: false, message: 'Invalid boost type. Use weekly or monthly' };
      }

      // Check if user has enough coins
      const { data: userCoins, error: coinsError } = await supabase
        .from('anamcoins')  // ← Use anamcoins (where you have 139 coins)
        .select('available_coins, spent_coins, total_coins')  // ← Use available_coins field
        .eq('user_id', userId)
        .single();

      if (coinsError || !userCoins || userCoins.available_coins < config.cost) {
        return { success: false, message: 'Insufficient coins' };
      }

      // Check if story exists and belongs to user
      const { data: story, error: storyError } = await supabase
        .from('soul_stories')
        .select('*')
        .eq('id', storyId)
        .eq('author_id', userId)
        .single();

      if (storyError || !story) {
        return { success: false, message: 'Story not found or not authorized' };
      }

      // Calculate boost end date
      const boostEnd = new Date(Date.now() + config.duration);

      // Create boost record
      const { error: boostError } = await supabase
        .from('soul_story_boosts')
        .insert([{
          story_id: storyId,
          user_id: userId,
          boost_type: boostType,
          boost_cost: config.cost,
          boost_end: boostEnd.toISOString()
        }]);

      if (boostError) {
        return { success: false, message: boostError.message };
      }

      // Update story with boost status
      const { error: storyUpdateError } = await supabase
        .from('soul_stories')
        .update({
          is_boosted: true,
          boost_end_date: boostEnd.toISOString(),
          boost_type: boostType
        })
        .eq('id', storyId);

      if (storyUpdateError) {
        return { success: false, message: storyUpdateError.message };
      }

      // Deduct coins from user
      const { error: deductError } = await supabase
        .from('anamcoins')
        .update({
          available_coins: userCoins.available_coins - config.cost,
          spent_coins: (userCoins.spent_coins || 0) + config.cost  // Add to spent_coins
        })
        .eq('user_id', userId);

      if (deductError) {
        console.log('Coin deduction error:', deductError);
        return { success: false, message: 'Failed to deduct coins' };
      }

      return {
        success: true,
        message: `Story boosted for ${boostType} successfully`,
        data: {
          boost_type: boostType,
          boost_cost: config.cost,
          boost_end: boostEnd,
          remaining_coins: userCoins.available_coins - config.cost  // ← Use available_coins
        }
      };
    } catch (error) {
      console.log('Error in boostSoulStory:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  getUserSoulStoryBoosts: async (userId: string) => {
    try {
      const { data: boosts, error } = await supabase
        .from('soul_story_boosts')
        .select(`
          *,
          story:soul_stories(
            id,
            title,
            thumbnail_url
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        return { success: false, message: error.message };
      }

      return { success: true, data: boosts || [] };
    } catch (error) {
      console.log('Error in getUserSoulStoryBoosts:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  getProductDetails: async (storyId: string) => {
    try {
      const { data: story, error: storyError } = await supabase
        .from('soul_stories')
        .select(`
          *,
          author:profiles!soul_stories_author_id_fkey(
            id,
            first_name,
            last_name,
            avatar_url
          )
        `)
        .eq('id', storyId)
        .single();

      if (storyError || !story) {
        return { success: false, message: 'Story not found' };
      }

      // Get earned coins for this story
      const { data: earnedCoins, error: coinsError } = await supabase
        .from('user_content_purchases')
        .select('coins_paid')
        .eq('story_id', storyId);

      const totalEarnedCoins = earnedCoins?.reduce((sum, purchase) => sum + (purchase.coins_paid || 0), 0) || 0;

      // Get boost status
      const { data: boostData, error: boostError } = await supabase
        .from('soul_story_boosts')
        .select('*')
        .eq('story_id', storyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const isBoosted = boostData && new Date(boostData.boost_end) > new Date();
      const boostType = isBoosted ? boostData.boost_type : null;
      const boostEndDate = isBoosted ? boostData.boost_end : null;

      // Determine file type
      let fileType = 'unknown';
      if (story.asset_type === 'video') {
        fileType = 'video';
      } else if (story.asset_type === 'document') {
        fileType = 'pdf';
      } else if (story.story_type === 'episodes') {
        fileType = 'video';
      }

      const productDetails = {
        id: story.id,
        title: story.title,
        description: story.description,
        creator_name: `${story.author?.first_name || ''} ${story.author?.last_name || ''}`.trim(),
        creator_avatar: story.author?.avatar_url,
        price: story.price || 0,
        free_pages: story.free_pages || 0,
        free_episodes: story.free_episodes || 0,
        remix_status: story.remix || false,
        earned_coins: totalEarnedCoins,
        file_type: fileType,
        boost_status: {
          is_boosted: isBoosted,
          boost_type: boostType,
          boost_end_date: boostEndDate
        },
        category: story.category,
        story_type: story.story_type,
        monetization_type: story.monetization_type,
        thumbnail_url: story.thumbnail_url,
        created_at: story.created_at,
        updated_at: story.updated_at
      };

      return {
        success: true,
        data: productDetails
      };

    } catch (error) {
      console.error('Error in getProductDetails service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  getAllUsersStoriesData: async () => {
    try {
      // Get all users
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          avatar_url,
          email,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (usersError) {
        return { success: false, message: 'Failed to fetch users' };
      }

      const usersData = [];

      for (const user of users || []) {
        // Get user's stories
        const { data: stories, error: storiesError } = await supabase
          .from('soul_stories')
          .select('*')
          .eq('author_id', user.id);

        if (storiesError) continue;

        const userStories = stories || [];

        // Calculate statistics for this user
        const totalStories = userStories.length;
        const publishedStories = userStories.filter(story => story.status === 'published').length;
        const remixCount = userStories.filter(story => story.remix === true).length;
        const freeEpisodesCount = userStories.reduce((sum, story) => sum + (story.free_episodes || 0), 0);
        const freePagesCount = userStories.reduce((sum, story) => sum + (story.free_pages || 0), 0);

        // Count video and PDF stories
        const videoStories = userStories.filter(story =>
          story.asset_type === 'video' || story.story_type === 'episodes'
        ).length;
        const pdfStories = userStories.filter(story =>
          story.asset_type === 'document'
        ).length;

        // Get boost count for this user
        const { data: boosts, error: boostsError } = await supabase
          .from('soul_story_boosts')
          .select('*')
          .eq('user_id', user.id);

        const boostCount = boosts?.length || 0;
        const activeBoosts = boosts?.filter(boost =>
          new Date(boost.boost_end) > new Date()
        ).length || 0;

        // Calculate total revenue from all stories
        const { data: purchases, error: purchasesError } = await supabase
          .from('user_content_purchases')
          .select('coins_paid')
          .in('story_id', userStories.map(story => story.id));

        const totalRevenue = purchases?.reduce((sum, purchase) =>
          sum + (purchase.coins_paid || 0), 0
        ) || 0;

        usersData.push({
          user_id: user.id,
          user_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Anonymous',
          user_email: user.email,
          user_avatar: user.avatar_url,
          user_created_at: user.created_at,
          totals: {
            total_stories: totalStories,
            published_stories: publishedStories,
            draft_stories: totalStories - publishedStories,
            remix_count: remixCount,
            original_stories: totalStories - remixCount,
            boost_count: boostCount,
            active_boosts: activeBoosts,
            free_episodes_count: freeEpisodesCount,
            free_pages_count: freePagesCount,
            video_stories: videoStories,
            pdf_stories: pdfStories,
            total_revenue: totalRevenue
          }
        });
      }

      return {
        success: true,
        data: {
          users: usersData
        }
      };

    } catch (error) {
      console.error('Error in getAllUsersStoriesData service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },
  createStoryReport: async (userId: string, storyId: string, reportContent: string, reportReason: string) => {
    try {
      // Check if story exists
      const { data: story, error: storyError } = await supabase
        .from('soul_stories')
        .select('id, title')
        .eq('id', storyId)
        .single();

      if (storyError || !story) {
        return { success: false, message: 'Story not found' };
      }

      // Check if user already reported this story
      const { data: existingReport, error: checkError } = await supabase
        .from('soul_story_reports')
        .select('id')
        .eq('story_id', storyId)
        .eq('reporter_id', userId)
        .single();

      if (existingReport) {
        return {
          success: false,
          message: 'Already reported',
          already_reported: true
        };
      }

      // Create the report
      const { data: report, error: reportError } = await supabase
        .from('soul_story_reports')
        .insert([{
          story_id: storyId,
          reporter_id: userId,
          report_content: reportContent,
          report_reason: reportReason,
          report_status: 'pending'
        }])
        .select()
        .single();

      if (reportError) {
        return { success: false, message: reportError.message };
      }

      return {
        success: true,
        message: 'Report submitted successfully',
        data: report
      };

    } catch (error) {
      console.error('Error in createStoryReport service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },

  getStoryReports: async (storyId: string) => {
    try {
      const { data: reports, error: reportsError } = await supabase
        .from('soul_story_reports')
        .select(`
          *,
          reporter:profiles!soul_story_reports_reporter_id_fkey(
            id,
            first_name,
            last_name,
            email
          )
        `)
        .eq('story_id', storyId)
        .order('created_at', { ascending: false });

      if (reportsError) {
        return { success: false, message: reportsError.message };
      }

      // Group reports by reason and count
      const reportCounts = reports?.reduce((acc, report) => {
        const reason = report.report_reason;
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      return {
        success: true,
        data: {
          reports: reports || [],
          report_summary: {
            total_reports: reports?.length || 0,
            report_counts: reportCounts,
            story_id: storyId
          }
        }
      };

    } catch (error) {
      console.error('Error in getStoryReports service:', error);
      return { success: false, message: 'Internal server error' };
    }
  },

  getUserFriends: async (userId: string) => {
    try {
      // Get user's friendships (like in chat messages)
      const { data: friendships, error } = await supabase
        .from('friendships')
        .select('id, sender_id, receiver_id, status')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .eq('status', 'accepted');

      if (error) throw error;

      const friendIds = friendships.map((entry: any) =>
        entry.sender_id === userId ? entry.receiver_id : entry.sender_id
      );

      if (friendIds.length === 0) {
        return { success: true, data: [] };
      }

      const friendsWithChats: { friendId: string; chatId: string; }[] = [];

      for (const friendId of friendIds) {
        const { data: existingChat, error: chatCheckError } = await supabase
          .from('chats')
          .select('id')
          .or(`and(user_1.eq.${userId},user_2.eq.${friendId}),and(user_1.eq.${friendId},user_2.eq.${userId})`)
          .maybeSingle();

        let chatId = existingChat?.id;

        if (!existingChat && !chatCheckError) {
          const { data: newChat, error: insertError } = await supabase
            .from('chats')
            .insert([{ user_1: userId, user_2: friendId }])
            .select('id')
            .single();

          if (insertError) continue;
          chatId = newChat.id;
        }

        if (chatId) {
          friendsWithChats.push({ friendId, chatId });
        }
      }

      const { data: friendsData, error: profileError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url, email')
        .in('id', friendIds);

      if (profileError) throw profileError;

      const formatted = friendsData
        .filter((profile: any) => profile.id !== userId) // EXCLUDE current user
        .map((profile: any) => {
          const chatInfo = friendsWithChats.find(f => f.friendId === profile.id);
          return {
            id: profile.id,
            user_name: `${profile.first_name} ${profile.last_name}`,
            avatar_img: profile.avatar_url,
            email: profile.email,
            chat_id: chatInfo?.chatId || null
          };
        });

      return { success: true, data: formatted };
    } catch (error) {
      console.error('Error in getUserFriends service:', error);
      return { success: false, error: 'Something went wrong.' };
    }
  },

  generateThumbnailSuggestions: async (content: string) => {
    try {
      return await geminiService.generateThumbnailSuggestions(content);
    } catch (error) {
      console.error('Error in generateThumbnailSuggestions service:', error);
      throw error;
    }
  },

  generateMultipleSuggestions: async (content: string, count: number = 3) => {
    try {
      return await geminiService.generateMultipleSuggestions(content, count);
    } catch (error) {
      console.error('Error in generateMultipleSuggestions service:', error);
      throw error;
    }
  },

  updateStory: async (storyId: string, updateData: any, episodes: any[] = [], userId: string) => {
    try {
      // First, check if story exists and user has permission to update
      const { data: existingStory, error: checkError } = await supabase
        .from('soul_stories')
        .select('author_id, co_authors')
        .eq('id', storyId)
        .single();

      if (checkError || !existingStory) {
        throw new Error('Story not found');
      }

      // Check if user is author or co-author
      const isAuthor = existingStory.author_id === userId;
      const isCoAuthor = existingStory.co_authors &&
        Array.isArray(existingStory.co_authors) &&
        existingStory.co_authors.includes(userId);

      if (!isAuthor && !isCoAuthor) {
        throw new Error('Unauthorized to update this story');
      }

      // PROTECTION: Never allow updating story_type
      if (updateData.story_type !== undefined) {
        delete updateData.story_type;
        console.log('⚠️ story_type update blocked - story type cannot be changed');
      }

      // Create a clean copy without co_authors first (for backward compatibility)
      const { co_authors, ...baseUpdateData } = updateData;

      let finalUpdateData = {
        ...baseUpdateData,
        ...(co_authors && Array.isArray(co_authors) && co_authors.length > 0 && { co_authors }),
        updated_at: new Date().toISOString()
      };

      // Handle episodes update - preserve existing episodes and update only provided ones
      if (episodes && episodes.length > 0) {
        // Get existing episodes first
        const { data: existingEpisodes, error: existingEpisodesError } = await supabase
          .from('soul_story_episodes')
          .select('id, episode_number')
          .eq('story_id', storyId)
          .order('episode_number', { ascending: true });

        if (existingEpisodesError) {
          console.error('Error fetching existing episodes:', existingEpisodesError);
          throw new Error('Failed to fetch existing episodes');
        }

        // Create a map of existing episodes by episode_number for easy lookup
        const existingEpisodesMap = new Map(
          existingEpisodes.map(ep => [ep.episode_number, ep.id])
        );

        // Process each episode in the update request
        for (const episode of episodes) {
          if (episode.id && existingEpisodesMap.has(episode.episode_number)) {
            // Update existing episode by ID
            const { error: updateError } = await supabase
              .from('soul_story_episodes')
              .update({
                title: episode.title || "",
                description: episode.description || "",
                video_url: episode.video_url,
                thumbnail_url: episode.thumbnail_url || ""
              })
              .eq('id', episode.id);

            if (updateError) {
              console.error(`Error updating episode ${episode.id}:`, updateError);
              throw new Error(`Failed to update episode ${episode.id}`);
            }

            console.log(`✅ Updated episode ${episode.id}`);
          } else if (!episode.id && episode.episode_number) {
            // Insert new episode if no ID provided but episode_number exists
            const { error: insertError } = await supabase
              .from('soul_story_episodes')
              .insert({
                story_id: storyId,
                title: episode.title || "",
                description: episode.description || "",
                video_url: episode.video_url,
                thumbnail_url: episode.thumbnail_url || "",
                episode_number: episode.episode_number
              });

            if (insertError) {
              console.error('Error inserting new episode:', insertError);
              throw new Error('Failed to insert new episode');
            }

            console.log('✅ Inserted new episode');
          } else {
            console.warn('Skipping episode update - missing ID or episode_number:', episode);
          }
        }

        // IMPORTANT: Do NOT delete episodes that weren't in the update request
        // This preserves existing episodes that weren't modified
        console.log(`✅ Preserved ${existingEpisodes.length} existing episodes, updated ${episodes.length} episodes`);
      }

      // ✅ Handle asset_url update separately (if provided)
      if (updateData.asset_url) {
        // asset_url will be updated in the main story update
        // asset_type should also be set to 'video' if not already set
        if (!updateData.asset_type) {
          finalUpdateData.asset_type = 'video';
        }
        console.log('✅ Will update main asset_url in soul_stories table');
      }

      // Update the main story
      const { data: updatedStory, error: updateError } = await supabase
        .from('soul_stories')
        .update(finalUpdateData)
        .eq('id', storyId)
        .select()
        .single();

      if (updateError) throw updateError;

      return {
        success: true,
        message: 'Story updated successfully',
        story: updatedStory
      };

    } catch (error) {
      console.error('Error updating story:', error);
      throw error;
    }
  },
  correctGrammar: async (text: string, maxChunkSize: number = 500) => {
    try {
      const cleanText = text.trim();
      const words = cleanText.split(/\s+/).filter(word => word.length > 0);

      if (words.length === 1) {
        const result = await soulStoriesServices.checkSingleWordSpelling(cleanText);
        return {
          success: true,
          data: {
            originalText: cleanText,
            correctedText: result.correctedText,
            wasSplit: false,
            chunksProcessed: 1,
            totalCorrections: result.corrections.length,
            corrections: result.corrections
          }
        };
      }

      try {
        const prompt = `You are a professional English language editor. Correct the following text for grammar, spelling, and punctuation errors.

IMPORTANT: Return ONLY the corrected text, nothing else. Do not add explanations, comments, or any other text.

Text to correct:
"${cleanText}"

Corrected text:`;

        // Use the public method from GeminiService
        const result = await geminiService.generateThumbnailSuggestions(cleanText);
        const correctedText = result.rawResponse.trim();

        console.log(`Original: "${cleanText}"`);
        console.log(`Corrected: "${correctedText}"`);

        // Generate corrections array based on differences
        const corrections = soulStoriesServices.generateCorrections(cleanText, correctedText);

        return {
          success: true,
          data: {
            originalText: cleanText,
            correctedText: correctedText,
            wasSplit: false,
            chunksProcessed: 1,
            totalCorrections: corrections.length,
            corrections: corrections
          }
        };
      } catch (geminiError) {
        console.error('Gemini AI error, falling back to LanguageTool:', geminiError);

        // Fallback to LanguageTool if Gemini fails
        const corrector = new GrammarCorrector();
        const result = await corrector.processParagraph(cleanText, maxChunkSize);

        return {
          success: true,
          data: {
            originalText: result.originalText,
            correctedText: result.correctedText,
            wasSplit: result.wasSplit,
            chunksProcessed: result.chunksProcessed,
            totalCorrections: result.totalCorrections,
            corrections: result.corrections
          }
        };
      }
    } catch (error) {
      console.error('Error in correctGrammar service:', error);
      return {
        success: false,
        message: 'Failed to correct grammar'
      };
    }
  },
  checkSingleWordSpelling: async (
    word: string
  ): Promise<{
    originalText: string;
    correctedText: string;
    title: string;
    description: string;
    tags: string[];
    corrections: any[];
  }> => {
    try {
      const response = await fetch("https://api.languagetool.org/v2/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          text: word,
          language: "en-US",
        }),
      });

      if (!response.ok) {
        return {
          originalText: word,
          correctedText: word,
          title: "Spelling Check",
          description: "Word validated without changes",
          tags: ["spelling"],
          corrections: []
        };
      }

      const data = await response.json();
      const matches = data.matches || [];

      if (matches.length === 0) {
        return {
          originalText: word,
          correctedText: word,
          title: "Spelling Check",
          description: "Word is correct",
          tags: ["spelling"],
          corrections: []
        };
      }

      const corrections: any[] = [];
      let correctedWord = word;

      matches.forEach((match: any) => {
        const replacement = match.replacements?.[0]?.value;
        if (replacement && replacement !== correctedWord) {
          correctedWord = replacement;
          corrections.push({
            original: word,
            suggestion: replacement,
            message: match.message || "Correction",
            ruleId: match.rule?.id || "UNKNOWN_RULE",
            offset: match.offset || 0,
            length: match.length || 0,
          });
        }
      });

      return {
        originalText: word,
        correctedText: correctedWord,
        title: "Spelling Correction",
        description: `Corrected word: "${correctedWord}"`,
        tags: ["spelling", correctedWord],
        corrections,
      };

    } catch (error) {
      console.error("Spelling check error:", error);
      return {
        originalText: word,
        correctedText: word,
        title: "Spelling Check Error",
        description: "Fallback returned",
        tags: ["spelling", "error"],
        corrections: []
      };
    }
  },
  generateCorrections: (original: string, corrected: string): any[] => {
    const corrections: any[] = [];

    if (original === corrected) {
      return corrections;
    }

    const originalWords = original.split(/\s+/);
    const correctedWords = corrected.split(/\s+/);

    let offset = 0;
    for (let i = 0; i < Math.max(originalWords.length, correctedWords.length); i++) {
      const originalWord = originalWords[i] || '';
      const correctedWord = correctedWords[i] || '';

      if (originalWord !== correctedWord && correctedWord) {
        corrections.push({
          original: originalWord,
          suggestion: correctedWord,
          message: "Grammar or spelling correction",
          ruleId: "GEMINI_AI_CORRECTION",
          offset: offset,
          pass: 1
        });
      }

      offset += originalWord.length + 1;
    }

    return corrections;
  },
  checkPdfQualityFromBucket: async (pdfUrl: string) => {
    try {
      console.log(`Checking PDF quality: ${pdfUrl}`);

      if (pdfUrl.startsWith('/uploads/pdfs/')) {
        try {
          const fullPath = path.join(__dirname, '../../', pdfUrl);

          if (!fs.existsSync(fullPath)) {
            return {
              success: false,
              message: 'Local PDF file not found',
              data: {
                url: pdfUrl,
                storageType: 'local',
                isValid: false,
                fileType: 'pdf'
              }
            };
          }

          const pdfBuffer = fs.readFileSync(fullPath);
          const pdfData = await pdf(pdfBuffer);
          const pdfText = pdfData.text;

          if (!pdfText || pdfText.trim().length === 0) {
            return {
              success: false,
              message: 'PDF contains no readable text',
              data: {
                url: pdfUrl,
                storageType: 'local',
                isValid: false,
                fileType: 'pdf'
              }
            };
          }

          const readabilityAnalysis = soulStoriesServices.analyzeReadability(pdfText);
          const qualityScore = soulStoriesServices.calculateQualityScore(readabilityAnalysis);
          const isHighQuality = qualityScore >= 70;

          console.log('PDF Analysis Results:', {
            wordCount: readabilityAnalysis.wordCount,
            sentenceCount: readabilityAnalysis.sentenceCount,
            avgSentenceLength: readabilityAnalysis.avgSentenceLength,
            avgWordLength: readabilityAnalysis.avgWordLength,
            complexWords: readabilityAnalysis.complexWords,
            readabilityScore: readabilityAnalysis.readabilityScore,
            qualityIssues: readabilityAnalysis.qualityIssues,
            finalScore: qualityScore
          });

          return {
            success: true,
            message: isHighQuality ? 'PDF quality check passed' : 'PDF quality check failed - readability issues detected',
            data: {
              url: pdfUrl,
              storageType: 'local',
              isValid: isHighQuality,
              fileType: 'pdf',
              contentAnalysis: readabilityAnalysis,
              qualityScore: qualityScore,
              isHighQuality: isHighQuality,
              recommendations: readabilityAnalysis.suggestions
            }
          };

        } catch (fileError) {
          console.error('Local file analysis error:', fileError);
          return {
            success: false,
            message: 'Failed to analyze local PDF content',
            data: {
              url: pdfUrl,
              storageType: 'local',
              isValid: false,
              fileType: 'pdf'
            }
          };
        }
      }

      // Check if it's a valid HTTP URL (existing code)
      if (pdfUrl.includes('http')) {
        if (!pdfUrl.toLowerCase().endsWith('.pdf')) {
          return { success: false, message: 'URL must point to a PDF file' };
        }

        try {
          // Download and analyze PDF content
          const response = await fetch(pdfUrl);
          if (!response.ok) {
            return { success: false, message: 'Failed to download PDF from URL' };
          }

          const pdfBuffer = await response.arrayBuffer();
          const pdfText = new TextDecoder().decode(pdfBuffer);

          // Basic PDF validation
          if (!pdfText.includes('/Page') && !pdfText.includes('PDF')) {
            return { success: false, message: 'Invalid PDF content - file may be corrupted' };
          }

          // Perform readability analysis
          const readabilityAnalysis = soulStoriesServices.analyzeReadability(pdfText);

          // Quality assessment based on readability
          const qualityScore = soulStoriesServices.calculateQualityScore(readabilityAnalysis);
          const isHighQuality = qualityScore >= 70;

          return {
            success: true,
            message: isHighQuality ? 'PDF quality check passed' : 'PDF quality check failed - readability issues detected',
            data: {
              url: pdfUrl,
              storageType: 'external',
              isValid: true,
              fileType: 'pdf',
              contentAnalysis: readabilityAnalysis,
              qualityScore: qualityScore,
              isHighQuality: isHighQuality,
              recommendations: readabilityAnalysis.suggestions
            }
          };

        } catch (downloadError) {
          console.error('PDF download error:', downloadError);
          return { success: false, message: 'Failed to analyze PDF content' };
        }
      }

      return { success: false, message: 'Invalid file path or URL format' };

    } catch (error) {
      console.error('PDF quality check error:', error);
      return { success: false, message: 'Quality check failed' };
    }
  },
  shareStory: async (userId: string, storyId: string, shareType: string = 'general') => {
    try {
      // Check if story exists
      const { data: story, error: storyError } = await supabase
        .from('soul_stories')
        .select('id, title, total_shares')
        .eq('id', storyId)
        .single();

      if (storyError || !story) {
        return {
          success: false,
          message: 'Story not found'
        };
      }

      // Increment share count
      const newShareCount = (story.total_shares || 0) + 1;

      const { error: updateError } = await supabase
        .from('soul_stories')
        .update({ total_shares: newShareCount })
        .eq('id', storyId);

      if (updateError) {
        return {
          success: false,
          message: 'Failed to update share count'
        };
      }

      return {
        success: true,
        message: 'Story shared successfully',
        data: {
          storyId: storyId,
          storyTitle: story.title,
          totalShares: newShareCount,
          shareType: shareType,
          sharedBy: userId
        }
      };

    } catch (error) {
      console.error('Error sharing story:', error);
      return {
        success: false,
        message: 'Internal server error'
      };
    }
  },
  // Add readability analysis methods
  analyzeReadability: (text: string) => {
    try {
      // Clean and prepare text
      const cleanText = text.replace(/\s+/g, ' ').trim();

      if (!cleanText || cleanText.length < 50) {
        return {
          wordCount: 0,
          sentenceCount: 0,
          avgSentenceLength: 0,
          avgWordLength: 0,
          complexWords: 0,
          readabilityScore: 0,
          suggestions: ['Text too short for meaningful analysis'],
          qualityIssues: ['Insufficient content for analysis']
        };
      }

      // Basic text analysis
      const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const words = cleanText.split(/\s+/).filter(w => w.length > 0);

      const wordCount = words.length;
      const sentenceCount = sentences.length;
      const avgSentenceLength = wordCount / sentenceCount;
      const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / wordCount;

      // Count complex words (3+ syllables approximation)
      const complexWords = words.filter(word => {
        const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
        if (cleanWord.length <= 3) return false;

        // Simple syllable counting heuristic
        const vowels = cleanWord.match(/[aeiouy]+/g);
        if (!vowels) return false;

        let syllableCount = vowels.length;

        // Adjust for silent 'e' at end
        if (cleanWord.endsWith('e') && syllableCount > 1) syllableCount--;

        // Adjust for common suffixes
        if (cleanWord.endsWith('tion') || cleanWord.endsWith('sion')) syllableCount++;

        return syllableCount >= 3;
      }).length;

      // Calculate readability score (Flesch Reading Ease approximation)
      const readabilityScore = Math.max(0, Math.min(100,
        206.835 - (1.015 * avgSentenceLength) - (84.6 * (complexWords / wordCount * 100))
      ));

      // Generate suggestions
      const suggestions = [];
      if (avgSentenceLength > 20) {
        suggestions.push('Consider breaking long sentences into shorter ones for better readability');
      }
      if (complexWords / wordCount > 0.15) {
        suggestions.push('Reduce complex words to improve accessibility');
      }
      if (readabilityScore < 50) {
        suggestions.push('Text may be difficult to read - consider simplifying vocabulary and sentence structure');
      }
      if (suggestions.length === 0) {
        suggestions.push('Good readability overall!');
      }

      // Detect quality issues
      const qualityIssues = [];
      if (cleanText.length < 200) {
        qualityIssues.push('Content may be too brief for comprehensive analysis');
      }
      if (sentenceCount < 3) {
        qualityIssues.push('Very few sentences detected - may indicate incomplete content');
      }
      if (avgWordLength > 6) {
        qualityIssues.push('Average word length is high - may affect readability');
      }

      return {
        wordCount,
        sentenceCount,
        avgSentenceLength: Math.round(avgSentenceLength * 100) / 100,
        avgWordLength: Math.round(avgWordLength * 100) / 100,
        complexWords,
        readabilityScore: Math.round(readabilityScore * 100) / 100,
        suggestions,
        qualityIssues
      };

    } catch (error) {
      console.error('Readability analysis error:', error);
      return {
        wordCount: 0,
        sentenceCount: 0,
        avgSentenceLength: 0,
        avgWordLength: 0,
        complexWords: 0,
        readabilityScore: 0,
        suggestions: ['Analysis failed'],
        qualityIssues: ['Unable to analyze content']
      };
    }
  },
  calculateQualityScore: (analysis: any) => {
    try {
      let score = 100;

      // Deduct points for readability issues
      if (analysis.readabilityScore < 30) score -= 15;
      else if (analysis.readabilityScore < 50) score -= 10;
      else if (analysis.readabilityScore < 70) score -= 5;

      // Deduct points for sentence length issues
      if (analysis.avgSentenceLength > 25) score -= 10;
      else if (analysis.avgSentenceLength > 20) score -= 5;

      // Deduct points for complex word usage
      const complexWordPercentage = (analysis.complexWords / analysis.wordCount) * 100;
      if (complexWordPercentage > 20) score -= 10;
      else if (analysis.complexWords / analysis.wordCount > 0.15) score -= 5;

      // Deduct points for content length issues (more lenient)
      if (analysis.wordCount < 50) score -= 15;
      else if (analysis.wordCount < 100) score -= 10;
      else if (analysis.wordCount < 200) score -= 5;

      // Deduct points for quality issues (reduced penalty)
      score -= analysis.qualityIssues.length * 3;

      return Math.max(0, Math.min(100, score));

    } catch (error) {
      console.error('Quality score calculation error:', error);
      return 50;
    }
  },
  purchaseAIToolAccess: async (userId: string, toolType: string, coinsRequired: number) => {
    try {
      const { data: userCoins, error: userError } = await supabase
        .from('anamcoins')
        .select('available_coins, spent_coins, total_coins')
        .eq('user_id', userId)
        .single();

      if (userError || !userCoins) {
        return { success: false, message: 'User coins account not found' };
      }

      if (userCoins.available_coins < coinsRequired) {
        return {
          success: false,
          message: `Insufficient coins. Need ${coinsRequired}, have ${userCoins.available_coins}`
        };
      }

      const paidUntil = new Date();
      paidUntil.setDate(paidUntil.getDate() + 7);

      const { error: upsertError } = await supabase
        .from('ai_tools_usage')
        .upsert({
          user_id: userId,
          tool_type: toolType,
          is_paid: true,
          paid_until: paidUntil.toISOString(),
          is_trial_active: false,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,tool_type'
        });

      if (upsertError) {
        return { success: false, message: 'Failed to update tool access' };
      }

      const { error: coinUpdateError } = await supabase
        .from('anamcoins')
        .update({
          available_coins: userCoins.available_coins - coinsRequired,
          spent_coins: (userCoins.spent_coins || 0) + coinsRequired,
          total_coins: userCoins.total_coins
        })
        .eq('user_id', userId);

      if (coinUpdateError) {
        return { success: false, message: 'Failed to update user coins' };
      }

      return {
        success: true,
        message: `Successfully purchased 7 days of access for ${toolType} for ${coinsRequired} coins`
      };
    } catch (error) {
      console.error('Error purchasing AI tool access:', error);
      return { success: false, message: 'Error purchasing access' };
    }
  },

  checkAIToolAccess: async (userId: string, toolType: string) => {
    try {
      const { data: usageData, error } = await supabase
        .from('ai_tools_usage')
        .select('*')
        .eq('user_id', userId)
        .eq('tool_type', toolType)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (!usageData) {
        return {
          canUse: false,
          message: 'Paid access required - no free trial available',
          needsPurchase: true
        };
      }

      const now = new Date();
      const paidUntil = usageData.paid_until ? new Date(usageData.paid_until) : null;

      if (usageData.is_paid && paidUntil && paidUntil > now) {
        return {
          canUse: true,
          message: 'Paid access active',
          paidUntil: usageData.paid_until,
          usageCount: usageData.usage_count
        };
      }

      return {
        canUse: false,
        message: 'Paid access required - no free trial available',
        needsPurchase: true,
        usageCount: usageData.usage_count
      };
    } catch (error) {
      console.error('Error checking tool access:', error);
      return { canUse: false, message: 'Error checking access' };
    }
  },

  recordAIToolUsage: async (userId: string, toolType: string) => {
    try {
      // First get current usage count
      const { data: currentUsage, error: fetchError } = await supabase
        .from('ai_tools_usage')
        .select('usage_count')
        .eq('user_id', userId)
        .eq('tool_type', toolType)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      const newUsageCount = (currentUsage?.usage_count || 0) + 1;

      const { error } = await supabase
        .from('ai_tools_usage')
        .update({
          usage_count: newUsageCount,
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('tool_type', toolType);

      if (error) {
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Error recording tool usage:', error);
      return false;
    }
  },
};

