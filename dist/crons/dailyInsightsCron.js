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
const app_1 = require("../app");
function getTopTrendingThreads() {
    return __awaiter(this, void 0, void 0, function* () {
        const { data, error } = yield app_1.supabase
            .from('threads')
            .select(`
      id,
      total_likes,
      total_insightfuls,
      total_hearts,
      total_hugs,
      total_souls
    `)
            .neq('imgs', '{}')
            .eq('is_active', true)
            .eq('is_deleted', false);
        if (error)
            throw error;
        return data
            .map(thread => (Object.assign(Object.assign({}, thread), { total_reactions: (thread.total_likes || 0) +
                (thread.total_insightfuls || 0) +
                (thread.total_hearts || 0) +
                (thread.total_hugs || 0) +
                (thread.total_souls || 0) })))
            .sort((a, b) => b.total_reactions - a.total_reactions)
            .slice(0, 7);
    });
}
const updateDailyInsights = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const topThreads = yield getTopTrendingThreads();
        const today = new Date().toISOString().split('T')[0];
        yield app_1.supabase
            .from('daily_insights')
            .delete()
            .neq('id', 0);
        const inserts = topThreads.map((thread, index) => ({
            thread_id: thread.id,
            ranking: index + 1,
            date: today,
            total_reactions: thread.total_reactions
        }));
        const { error } = yield app_1.supabase
            .from('daily_insights')
            .insert(inserts);
        if (error)
            throw error;
        console.log(`Updated daily insights for ${today}`);
    }
    catch (error) {
        console.error('Error updating daily insights:', error);
    }
});
exports.default = updateDailyInsights;
