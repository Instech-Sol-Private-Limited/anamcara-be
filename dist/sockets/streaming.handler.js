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
exports.getActiveStreams = exports.registerStreamingHandlers = void 0;
const app_1 = require("../app");
const activeStreams = new Map();
const messageCounts = new Map();
const registerStreamingHandlers = (io) => {
    io.on('connection', (socket) => {
        console.log('✅ New streaming client connected:', socket.id);
        console.log('📡 Client IP:', socket.handshake.address);
        console.log('🌐 Client headers:', socket.handshake.headers);
        sendActiveStreamsToClient(socket);
        socket.on('create_stream', (_a) => __awaiter(void 0, [_a], void 0, function* ({ streamId, email, title, category, thumbnailUrl }) {
            console.log('🎥 CREATE_STREAM event received:', { streamId, email, title, category, thumbnailUrl });
            if (activeStreams.has(streamId)) {
                console.log('❌ Stream already exists:', streamId);
                socket.emit('streamError', { message: 'Stream already exists.' });
                return;
            }
            try {
                console.log('🔍 Looking for category:', category);
                let categoryId;
                const { data: existingCategory, error: categoryError } = yield app_1.supabase
                    .from('stream_categories')
                    .select('id')
                    .eq('name', category)
                    .single();
                if (categoryError || !existingCategory) {
                    console.log('📌 Creating new category:', category);
                    const { data: newCategory, error: createError } = yield app_1.supabase
                        .from('stream_categories')
                        .insert([{ name: category }])
                        .select('id')
                        .single();
                    if (createError || !newCategory) {
                        throw createError || new Error('Failed to create category');
                    }
                    categoryId = newCategory.id;
                    console.log(`📌 Created new category: ${category} (ID: ${categoryId})`);
                }
                else {
                    categoryId = existingCategory.id;
                    console.log(`🔍 Found existing category: ${category} (ID: ${categoryId})`);
                }
                const newStream = {
                    id: streamId,
                    email,
                    title,
                    category: categoryId,
                    participants: new Set([socket.id]),
                    creator: socket.id,
                    createdAt: new Date().toISOString(),
                    thumbnailUrl: thumbnailUrl || null
                };
                activeStreams.set(streamId, newStream);
                messageCounts.set(streamId, 0);
                socket.join(streamId);
                console.log('💾 Inserting stream into database...');
                const { data, error } = yield app_1.supabase
                    .from('active_streams')
                    .insert([{
                        stream_id: streamId,
                        email: email,
                        stream_title: title,
                        stream_category_id: categoryId,
                        creator_socket: socket.id,
                        created_at: new Date().toISOString(),
                        viewer_count: 1,
                        thumbnail_url: thumbnailUrl || null
                    }])
                    .select();
                if (error) {
                    console.error('❌ Database insert error:', error);
                    throw error;
                }
                console.log(`🎥 Stream created successfully in Supabase:`, data);
                broadcastStreamsUpdate(io);
            }
            catch (error) {
                console.error('❌ Error in stream creation:', error);
                activeStreams.delete(streamId);
                messageCounts.delete(streamId);
                socket.leave(streamId);
                socket.emit('streamError', {
                    message: error instanceof Error ? error.message : 'Failed to create stream'
                });
            }
        }));
        socket.on('join_stream', (_a) => __awaiter(void 0, [_a], void 0, function* ({ streamId, email }) {
            console.log('👥 JOIN_STREAM event received:', { streamId, email });
            const stream = activeStreams.get(streamId);
            if (!stream) {
                socket.emit('streamError', { message: 'Stream does not exist.' });
                return;
            }
            stream.participants.add(socket.id);
            socket.join(streamId);
            yield app_1.supabase.from('active_streams')
                .update({ viewer_count: stream.participants.size })
                .eq('stream_id', streamId);
            io.to(stream.creator).emit('viewer-joined', { viewerSocketId: socket.id });
            io.to(streamId).emit('newParticipant', {
                email,
                viewerCount: stream.participants.size,
            });
            broadcastStreamsUpdate(io);
        }));
        socket.on('stop_stream', (_a) => __awaiter(void 0, [_a], void 0, function* ({ streamId }) {
            const stream = activeStreams.get(streamId);
            if (!stream || stream.creator !== socket.id) {
                socket.emit('streamError', { message: 'Unauthorized or stream does not exist.' });
                return;
            }
            const totalMessages = messageCounts.get(streamId) || 0;
            const { data: response } = yield app_1.supabase.from('streams_history').insert({
                stream_id: stream.id,
                email: stream.email,
                creator_socket: stream.creator,
                started_at: stream.createdAt,
                ended_at: new Date().toISOString(),
                total_views: stream.participants.size,
                total_messages: totalMessages,
                date: new Date().toISOString().slice(0, 10),
            });
            console.log(response);
            activeStreams.delete(streamId);
            messageCounts.delete(streamId);
            // Delete using stream_id
            yield app_1.supabase.from('active_streams').delete().eq('stream_id', streamId);
            io.to(streamId).emit('stream_ended', { streamId });
            console.log(`🛑 Stream ${streamId} ended by creator`);
            broadcastStreamsUpdate(io);
        }));
        socket.on('signal', ({ to, data }) => {
            io.to(to).emit('signal', { from: socket.id, data });
        });
        socket.on('stream_message', ({ streamId, message }) => {
            const stream = activeStreams.get(streamId);
            if (!stream || !stream.participants.has(socket.id)) {
                socket.emit('streamError', { message: 'Not authorized to send messages to this stream.' });
                return;
            }
            const count = messageCounts.get(streamId) || 0;
            messageCounts.set(streamId, count + 1);
            io.to(streamId).emit('stream_message', {
                from: socket.id,
                message,
                timestamp: new Date().toISOString(),
            });
        });
        socket.on('chatMessage', ({ streamId, id, user, text, isSystem, timestamp }) => {
            const stream = activeStreams.get(streamId);
            if (!stream || !stream.participants.has(socket.id)) {
                socket.emit('streamError', { message: 'Not authorized to send messages to this stream.' });
                return;
            }
            const count = messageCounts.get(streamId) || 0;
            messageCounts.set(streamId, count + 1);
            io.to(streamId).emit('chatMessage', {
                id,
                user,
                text,
                isSystem,
                timestamp,
                streamId,
            });
        });
        socket.on('leave_stream', (_a) => __awaiter(void 0, [_a], void 0, function* ({ streamId }) {
            const stream = activeStreams.get(streamId);
            if (!stream || !stream.participants.has(socket.id)) {
                return;
            }
            console.log(streamId);
            stream.participants.delete(socket.id);
            socket.leave(streamId);
            // Update using stream_id
            yield app_1.supabase.from('active_streams')
                .update({ viewer_count: stream.participants.size })
                .eq('stream_id', streamId);
            io.to(stream.creator).emit('viewer-left', { viewerSocketId: socket.id });
            io.to(streamId).emit('viewer_count_update', {
                viewerCount: stream.participants.size,
            });
            broadcastStreamsUpdate(io);
        }));
        socket.on('disconnect', () => __awaiter(void 0, void 0, void 0, function* () {
            console.log('❌ Streaming client disconnected:', socket.id);
            for (const [streamId, stream] of activeStreams.entries()) {
                if (stream.participants.has(socket.id)) {
                    stream.participants.delete(socket.id);
                    const isCreatorLeaving = stream.creator === socket.id;
                    const isLastViewer = stream.participants.size === 0;
                    if (isCreatorLeaving || isLastViewer) {
                        activeStreams.delete(streamId);
                        messageCounts.delete(streamId);
                        const totalMessages = messageCounts.get(streamId) || 0;
                        yield app_1.supabase.from('streams_history').insert({
                            stream_id: stream.id,
                            email: stream.email,
                            creator_socket: stream.creator,
                            started_at: stream.createdAt,
                            ended_at: new Date().toISOString(),
                            total_views: stream.participants.size + 1,
                            total_messages: totalMessages,
                            date: new Date().toISOString().slice(0, 10),
                        });
                        // Delete using stream_id
                        yield app_1.supabase.from('active_streams').delete().eq('stream_id', streamId);
                        io.to(streamId).emit('stream_ended', { streamId });
                        console.log(`🛑 Stream ${streamId} ended due to disconnect`);
                    }
                    else {
                        // Update using stream_id
                        yield app_1.supabase.from('active_streams')
                            .update({ viewer_count: stream.participants.size })
                            .eq('stream_id', streamId);
                        io.to(stream.creator).emit('viewer-left', { viewerSocketId: socket.id });
                        io.to(streamId).emit('viewer_count_update', {
                            viewerCount: stream.participants.size,
                        });
                    }
                    broadcastStreamsUpdate(io);
                    break;
                }
            }
        }));
    });
};
exports.registerStreamingHandlers = registerStreamingHandlers;
function sendActiveStreamsToClient(socket) {
    socket.emit('streams_updated', getStreamsWithViewerCount());
}
function broadcastStreamsUpdate(io) {
    io.emit('streams_updated', getStreamsWithViewerCount());
}
function getStreamsWithViewerCount() {
    return Array.from(activeStreams.values()).map((stream) => ({
        id: stream.id,
        email: stream.email,
        title: stream.title,
        category: stream.category,
        createdAt: stream.createdAt,
        viewerCount: stream.participants.size,
        thumbnailUrl: stream.thumbnailUrl,
    }));
}
const getActiveStreams = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('🔍 Fetching active streams from database...');
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
        console.log('📊 Database response:', { data, error });
        if (error) {
            console.error('❌ Database error:', error);
            throw error;
        }
        console.log(`✅ Found ${(data === null || data === void 0 ? void 0 : data.length) || 0} streams in database`);
        res.json({
            success: true,
            count: (data === null || data === void 0 ? void 0 : data.length) || 0,
            streams: (data === null || data === void 0 ? void 0 : data.map(stream => {
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
            })) || [],
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
