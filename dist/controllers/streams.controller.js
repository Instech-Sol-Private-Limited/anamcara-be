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
exports.getTrendingStreams = exports.getActiveStreams = void 0;
const app_1 = require("../app");
const getActiveStreams = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data, error } = yield app_1.supabase
            .from('active_streams')
            .select(`
        stream_id,
        email,
        stream_title,
        creator_socket,
        created_at,
        viewer_count,
        thumbnail_url,
        stream_category_id (
          name
        )
      `)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        res.json({
            success: true,
            count: data.length,
            streams: data.map(stream => {
                var _a;
                return ({
                    id: stream.stream_id,
                    email: stream.email,
                    title: stream.stream_title,
                    creator_socket: stream.creator_socket,
                    createdAt: stream.created_at,
                    viewerCount: stream.viewer_count,
                    thumbnailUrl: stream.thumbnail_url,
                    // @ts-ignore
                    category: ((_a = stream.stream_category_id) === null || _a === void 0 ? void 0 : _a.name) || 'Uncategorized'
                });
            }),
        });
    }
    catch (error) {
        console.error('❌ Error fetching active streams:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});
exports.getActiveStreams = getActiveStreams;
const getTrendingStreams = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data, error } = yield app_1.supabase
            .from('active_streams')
            .select(`
        stream_id,
        email,
        stream_title,
        creator_socket,
        created_at,
        viewer_count,
        thumbnail_url,
        stream_category_id (
          name
        )
      `)
            .order('viewer_count', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(10);
        if (error)
            throw error;
        res.json({
            success: true,
            count: data.length,
            streams: data.map(stream => {
                var _a;
                return ({
                    id: stream.stream_id,
                    email: stream.email,
                    title: stream.stream_title,
                    creator_socket: stream.creator_socket,
                    createdAt: stream.created_at,
                    viewerCount: stream.viewer_count,
                    thumbnailUrl: stream.thumbnail_url,
                    // @ts-ignore
                    category: ((_a = stream.stream_category_id) === null || _a === void 0 ? void 0 : _a.name) || 'Uncategorized'
                });
            }),
        });
    }
    catch (error) {
        console.error('❌ Error fetching trending streams:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});
exports.getTrendingStreams = getTrendingStreams;
