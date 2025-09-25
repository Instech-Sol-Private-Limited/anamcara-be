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
exports.getDailyInsights = void 0;
const app_1 = require("../app");
const getDailyInsights = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data, error } = yield app_1.supabase
            .from('daily_insights')
            .select(`
        ranking,
        total_reactions,
        date,
        threads:thread_id (
          id,
          title,
          description,
          imgs,
          category_name,
          author_name,
          author_id,
          publish_date,
          total_likes,
          total_insightfuls,
          total_hearts,
          total_hugs,
          total_souls,
          is_active,
          is_deleted
        )
      `)
            .order('ranking', { ascending: true });
        if (error) {
            throw new Error(`Supabase error: ${error.message}`);
        }
        if (!data || data.length === 0) {
            res.status(404).json({
                success: false,
                message: "No insights found for today",
            });
            return;
        }
        const insights = data.map(insight => {
            if (!insight.threads) {
                throw new Error(`Missing thread data for insight with ranking ${insight.ranking}`);
            }
            return Object.assign({ ranking: insight.ranking, date: insight.date, total_reactions: insight.total_reactions }, insight.threads);
        });
        res.status(200).json({
            success: true,
            data: insights
        });
    }
    catch (error) {
        console.error('Error in getDailyInsights:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        res.status(500).json({
            success: false,
            error: 'Failed to fetch daily insights',
            message: errorMessage,
        });
    }
});
exports.getDailyInsights = getDailyInsights;
