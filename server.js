
import express from "express";
import crypto from "crypto";
import os from "os";
import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import { spawn } from "child_process";

const app = express();
app.use(express.json({ limit: "50mb" }));

function safeName(name) {
  return String(name || "").replace(/[^\w.\-]+/g, "_");
}

async function downloadToFile(url, filePath) {
  if (!url) return;
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`Tải dữ liệu thất bại từ ${url}`);
  await pipeline(r.body, fs.createWriteStream(filePath));
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err || `ffmpeg failed (code ${code})`));
    });
  });
}

app.post("/api/export-full", async (req, res) => {
  const { rawVideoUri, audioBase64, srt, filename } = req.body || {};
  if (!rawVideoUri || !srt) return res.status(400).send("Thiếu dữ liệu video hoặc kịch bản");

  const id = crypto.randomBytes(8).toString("hex");
  const dir = path.join(os.tmpdir(), `viral_pro_${id}`);
  fs.mkdirSync(dir, { recursive: true });

  const inPath = path.join(dir, "input.mp4");
  const audioPath = path.join(dir, "audio.wav");
  const srtPath = path.join(dir, "sub.srt");
  const outPath = path.join(dir, "output.mp4");

  try {
    const fullVideoUrl = `${rawVideoUri}&key=${process.env.API_KEY}`;
    const tasks = [
      downloadToFile(fullVideoUrl, inPath),
      fs.promises.writeFile(srtPath, srt, "utf8")
    ];
    if (audioBase64) tasks.push(fs.promises.writeFile(audioPath, Buffer.from(audioBase64, 'base64')));
    await Promise.all(tasks);

    // Filter string: Burn subtitles with stylized fonts
    // Using a vertical margin to match TikTok captions
    const vf = `subtitles=${srtPath}:force_style='Fontname=Arial,Fontsize=26,PrimaryColour=&H00FFFFFF,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=120'`;
    
    const ffmpegArgs = ["-y", "-i", inPath];
    if (audioBase64) ffmpegArgs.push("-i", audioPath);
    
    ffmpegArgs.push("-vf", vf);
    ffmpegArgs.push("-c:v", "libx264", "-crf", "22", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-threads", "0");
    
    if (audioBase64) {
      ffmpegArgs.push("-c:a", "aac", "-b:a", "192k", "-map", "0:v:0", "-map", "1:a:0", "-shortest");
    } else {
      ffmpegArgs.push("-c:a", "copy");
    }
    
    ffmpegArgs.push(outPath);

    await runFfmpeg(ffmpegArgs);

    const outName = safeName(filename) || `ViralVibe_Export_${Date.now()}.mp4`;
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${outName}"`);

    const readStream = fs.createReadStream(outPath);
    readStream.on("close", () => {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    });
    readStream.pipe(res);

  } catch (e) {
    console.error("Export Server Error:", e);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    res.status(500).send(String(e?.message || e));
  }
});

app.listen(process.env.PORT || 8080);
