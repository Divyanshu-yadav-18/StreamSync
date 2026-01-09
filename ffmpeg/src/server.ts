import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = 3000;
const HLS_OUTPUT_DIR = '/hls'; // Mapped to RAM Disk

// 1. The Route that receives the chunks from Person A
app.post('/stream', (req, res) => {
    const roomId = req.query.roomId as string;
    
    console.log(`[Stream] Incoming connection for Room ${roomId}`);

    // 2. Setup Output Directory (RAM)
    const roomDir = path.join(HLS_OUTPUT_DIR, roomId);
    if (!fs.existsSync(roomDir)) fs.mkdirSync(roomDir, { recursive: true });

    // 3. Start FFmpeg (The Engine)
    // It waits for data on 'pipe:0' (Standard Input)
    const ffmpeg = spawn('ffmpeg', [
        '-i', 'pipe:0',              // <--- Input: The HTTP Request Stream
        '-c:v', 'libx264',           // Encode Video
        '-preset', 'ultrafast',      // Fast encoding for Real-Time
        '-tune', 'zerolatency',      // Optimize for streaming
        '-f', 'hls',                 // Output Format: HLS
        '-hls_time', '2',            // 2 Second chunks (Slice size)
        '-hls_list_size', '5',       // Keep playlist small
        '-hls_flags', 'delete_segments', // Don't store old files
        path.join(roomDir, 'index.m3u8')
    ]);

    // 4. THE CONNECTION: Pipe the Incoming Request (Raw Chunks) -> FFmpeg (Processing)
    // As React sends a chunk, 'req' receives it and pushes it into 'ffmpeg'
    req.pipe(ffmpeg.stdin);

    // 5. Error Handling & Cleanup
    ffmpeg.stderr.on('data', d => console.log(`[FFmpeg]: ${d}`)); // Debug logs
    
    req.on('close', () => {
        // If Person A stops uploading, tell FFmpeg to stop
        if (!ffmpeg.killed) ffmpeg.stdin.end();
    });

    ffmpeg.on('close', () => {
        console.log("Stream ended. Cleaning up...");
        // Delete files from RAM after streaming stops
        fs.rmSync(roomDir, { recursive: true, force: true });
    });

    res.status(200).send('Streaming Started');
});

app.listen(PORT, () => console.log(`FFmpeg Service running on ${PORT}`));
