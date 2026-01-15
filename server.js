import express from "express";
import crypto from "crypto";
import os from "os";
import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import { spawn } from "child_process";

const app = express();
app.use(express.json({ limit: "2mb" }));

function safeName(name) {
  return String(name || "").replace(/[^\w.\-]+/g, "_");
}

async function downloadToFile(url, filePath) {
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error("Không tải được video nguồn (videoUrl).");
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

app.post("/api/export-subbed", async (req, res) => {
  const { videoUrl, srt, mode, filename } = req.body || {};

  if (!videoUrl || typeof videoUrl !== "string") return res.status(400).send("Thiếu videoUrl");
  if (!srt || typeof srt !== "string") return res.status(400).send("Thiếu srt");
  if (!["burn", "soft"].includes(mode)) return res.status(400).send("mode phải là 'burn' hoặc 'soft'");

  const id = crypto.randomBytes(8).toString("hex");
  const dir = path.join(os.tmpdir(), `export_${id}`);
  fs.mkdirSync(dir, { recursive: true });

  const inPath = path.join(dir, "input.mp4");
  const srtPath = path.join(dir, "sub.srt");
  const outPath = path.join(dir, "output.mp4");

  try {
    await downloadToFile(videoUrl, inPath);
    fs.writeFileSync(srtPath, srt, "utf8");

    if (mode === "soft") {
      // Nhúng phụ đề dạng bật/tắt trong MP4 (mov_text)
      await runFfmpeg([
        "-y",
        "-i", inPath,
        "-i", srtPath,
        "-map", "0",
        "-map", "1",
        "-c", "copy",
        "-c:s", "mov_text",
        "-metadata:s:s:0", "language=vie",
        outPath,
      ]);
    } else {
      // Burn-in (đốt cứng) phụ đề vào video: đẹp kiểu TikTok
      // Lưu ý: cần ffmpeg có libass + font hỗ trợ tiếng Việt trên container
      const vf = `subtitles=${srtPath}:force_style='FontName=Noto Sans,Fontsize=28,Outline=2,Shadow=0,MarginV=40'`;

      await runFfmpeg([
        "-y",
        "-i", inPath,
        "-vf", vf,
        "-c:v", "libx264",
        "-crf", "18",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        outPath,
      ]);
    }

    const outName = safeName(filename) || `veo3_sub_${Date.now()}.mp4`;
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${outName}"`);

    fs.createReadStream(outPath)
      .on("close", () => {
        fs.rmSync(dir, { recursive: true, force: true });
      })
      .pipe(res);

  } catch (e) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    res.status(500).send(String(e?.message || e));
  }
});

app.listen(process.env.PORT || 8080);
