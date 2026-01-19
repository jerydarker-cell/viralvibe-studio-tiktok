
import express from "express";
import crypto from "crypto";
import os from "os";
import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import { spawn } from "child_process";

const app = express();
app.use(express.json({ limit: "5mb" }));

function safeName(name) {
  return String(name || "").replace(/[^\w.\-]+/g, "_");
}

async function downloadToFile(url, filePath) {
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error("Không tải được video nguồn.");
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
  if (!videoUrl || !srt) return res.status(400).send("Thiếu dữ liệu videoUrl hoặc srt");

  const id = crypto.randomBytes(8).toString("hex");
  const dir = path.join(os.tmpdir(), `vibe_pro_${id}`);
  fs.mkdirSync(dir, { recursive: true });

  const inPath = path.join(dir, "input.mp4");
  const srtPath = path.join(dir, "sub.srt");
  const outPath = path.join(dir, "output.mp4");

  try {
    await downloadToFile(videoUrl, inPath);
    fs.writeFileSync(srtPath, srt, "utf8");

    if (mode === "soft") {
      // Soft-subs: Embedded mov_text track (Toggleable)
      await runFfmpeg([
        "-y", "-i", inPath, "-i", srtPath,
        "-map", "0", "-map", "1",
        "-c", "copy", "-c:s", "mov_text",
        "-metadata:s:s:0", "language=vie",
        "-metadata:s:s:0", "title=ViralVibe Subs",
        outPath
      ]);
    } else {
      // Hard-subs: High-Contrast Burn-in for TikTok
      // Styles for Vietnamese clarity: Shadow + Border + High Vertical Margin
      const vf = `subtitles=${srtPath}:force_style='Fontname=Arial,Fontsize=26,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=2,Alignment=2,MarginV=60'`;

      await runFfmpeg([
        "-y", "-i", inPath,
        "-vf", vf,
        "-c:v", "libx264",
        "-crf", "18",      // High quality Constant Rate Factor
        "-preset", "slow", // Best compression efficiency
        "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        outPath
      ]);
    }

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
