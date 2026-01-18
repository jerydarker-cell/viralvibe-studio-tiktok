
import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, Modality } from '@google/genai';

// --- Constants & Types ---
type AIVoice = 'Kore' | 'Puck' | 'Zephyr' | 'Charon' | 'Fenrir';
type VideoDuration = 10 | 20 | 30 | 60;

interface SubtitleSegment {
  id: string;
  text: string;
  start: number;
  end: number;
}

interface ViralMetadata {
  catchyTitles: string[];
  hashtags: string[];
  description: string;
  subtitles: SubtitleSegment[];
  visualPrompt: string; 
  viralScore: number;
  cta: string;
}

interface VideoTemplate {
  id: string;
  label: string;
  prompt: string;
  icon: string;
  description: string;
}

interface ViralFramework {
  id: string;
  label: string;
  description: string;
}

const VIDEO_TEMPLATES: VideoTemplate[] = [
  { 
    id: 'tiktok-viral-high', 
    label: 'Trend TikTok 🔥', 
    prompt: 'Cinematic 9:16, high-energy movement, vibrant colors, trending TikTok aesthetic.', 
    icon: '🔥', 
    description: 'Phong cách xu hướng mạnh mẽ.' 
  },
  { 
    id: 'hyper-real-8k', 
    label: 'Siêu Thực 📸', 
    prompt: 'Hyper-realistic 8k, photorealistic details, cinematic lighting, sharp focus, masterwork.', 
    icon: '📸', 
    description: 'Độ chi tiết cực cao như đời thực.' 
  },
  { 
    id: 'anime-vibe', 
    label: 'Hoạt Hình 🎨', 
    prompt: 'Modern anime style, vibrant cel-shaded, studio ghibli lighting, expressive movement.', 
    icon: '🎨', 
    description: 'Phong cách hoạt hình Nhật Bản.' 
  },
  { 
    id: 'mysterious-story', 
    label: 'Kể Chuyện 🌑', 
    prompt: 'Moody atmospheric, slow cinematic motion, deep shadows, mysterious lighting.', 
    icon: '🌑', 
    description: 'Kịch tính và bí ẩn.' 
  },
  { 
    id: 'luxury-aesthetic', 
    label: 'Luxury ✨', 
    prompt: 'Minimalist luxury, golden hour, smooth elegant motion, expensive look.', 
    icon: '✨', 
    description: 'Sang trọng và đẳng cấp.' 
  },
  { 
    id: 'cyberpunk-neon', 
    label: 'Cyberpunk 🌃', 
    prompt: 'Neon cyberpunk aesthetic, wet reflections, high contrast, futuristic city movement.', 
    icon: '🌃', 
    description: 'Tương lai rực rỡ sắc màu.' 
  }
];

const VIRAL_FRAMEWORKS: ViralFramework[] = [
  { id: 'twist', label: 'Cú Twist Bất Ngờ 🎭', description: 'Mở đầu bình thường, kết thúc gây sốc.' },
  { id: 'problem-solution', label: 'Vấn Đề - Giải Pháp 💡', description: 'Đánh vào nỗi đau và đưa ra lối thoát.' },
  { id: 'storytelling', label: 'Kể Chuyện (Story) 📖', description: 'Dẫn dắt cảm xúc qua một câu chuyện ngắn.' },
  { id: 'how-to', label: 'Hướng Dẫn (Tips) 🛠️', description: 'Chia sẻ kiến thức nhanh, giá trị cao.' },
  { id: 'behind-scenes', label: 'Hậu Trường (BTS) 🎥', description: 'Sự thật đằng sau những thứ hào nhoáng.' }
];

const VOICE_OPTIONS = [
  { id: 'Zephyr', label: 'Zephyr (Nam - TikTok Standard)', theme: 'Dễ nghe, đa năng' },
  { id: 'Puck', label: 'Puck (Nam - Energetic/Funny)', theme: 'Hài hước, hoạt hình' },
  { id: 'Kore', label: 'Kore (Nữ - Inspiring)', theme: 'Truyền cảm hứng, nhẹ nhàng' },
  { id: 'Charon', label: 'Charon (Nam - Deep/Calm)', theme: 'Trầm ấm, siêu thực' },
  { id: 'Fenrir', label: 'Fenrir (Nam - Authority)', theme: 'Mạnh mẽ, phóng sự' }
];

// --- Helper Functions ---
const decode = (base64: string) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
};

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function bufferToWave(abuffer: AudioBuffer, len: number) {
  const numOfChan = abuffer.numberOfChannels;
  const length = len * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  let pos = 0;
  const setUint32 = (data: number) => { view.setUint32(pos, data, true); pos += 4; };
  const setUint16 = (data: number) => { view.setUint16(pos, data, true); pos += 2; };
  setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157);
  setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
  setUint32(abuffer.sampleRate); setUint32(abuffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164); setUint32(length - pos - 4);
  const channels = [];
  for (let i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));
  let offset = 0;
  while (offset < len) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

const ViralVibeApp: React.FC = () => {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [ttsUrl, setTtsUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ViralMetadata | null>(null);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [prompt, setPrompt] = useState<string>('Biến video này thành xu hướng TikTok cực hot');
  const [selectedTemplate, setSelectedTemplate] = useState<VideoTemplate>(VIDEO_TEMPLATES[0]);
  const [selectedFramework, setSelectedFramework] = useState<ViralFramework>(VIRAL_FRAMEWORKS[0]);
  const [duration, setDuration] = useState<VideoDuration>(20);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [selectedVoice, setSelectedVoice] = useState<AIVoice>('Zephyr');
  const [quotaCountdown, setQuotaCountdown] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function callWithRetry<T>(fn: () => Promise<T>, onRetry: (msg: string) => void, retries = 5): Promise<T> {
    let attempt = 0;
    while (attempt < retries) {
      try { return await fn(); } catch (error: any) {
        attempt++;
        const errMsg = error.message?.toLowerCase() || "";
        if (attempt >= retries) throw error;
        if (errMsg.includes('429') || errMsg.includes('quota')) {
          onRetry(`Tài khoản đang chờ reset...`);
          for (let i = 120; i > 0; i--) { 
            setQuotaCountdown(i); 
            await new Promise(r => setTimeout(r, 1000)); 
          }
          setQuotaCountdown(0);
        } else if (errMsg.includes('500') || errMsg.includes('internal')) {
          onRetry(`Server bận, đang thử lại sau 10s...`);
          await new Promise(r => setTimeout(r, 10000));
        } else {
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }
    throw new Error("Không thể kết nối API.");
  }

  const handleGenerate = async () => {
    if (!sourceImage) return;

    if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) await window.aistudio.openSelectKey();
    }

    setLoading(true); setStatus(`Đang thiết kế kịch bản ${selectedFramework.label}...`); setMetadata(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl); if (ttsUrl) URL.revokeObjectURL(ttsUrl);
    setVideoUrl(null); setTtsUrl(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const metaRes = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Kịch bản TikTok Viral ${duration}s. Ý tưởng: "${prompt}". Khung kịch bản: ${selectedFramework.label}.`,
        config: {
          systemInstruction: `Bạn là chuyên gia sáng tạo nội dung TikTok.
          Nhiệm vụ:
          1. Phụ đề: 3-6 câu ngắn, sử dụng từ ngữ "Gen Z", kịch tính.
          2. visualPrompt: Mô tả chuyển động bằng tiếng Anh (Dưới 12 từ).
          3. Tiêu đề: 3 tiêu đề clickbait sạch cực mạnh.
          4. Hashtags: 5 hashtag dẫn đầu xu hướng 2025.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              catchyTitles: { type: Type.ARRAY, items: { type: Type.STRING } },
              hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
              description: { type: Type.STRING },
              visualPrompt: { type: Type.STRING },
              viralScore: { type: Type.NUMBER },
              cta: { type: Type.STRING },
              subtitles: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    start: { type: Type.NUMBER },
                    end: { type: Type.NUMBER }
                  },
                  required: ['text', 'start', 'end']
                }
              }
            },
            required: ['catchyTitles', 'hashtags', 'description', 'visualPrompt', 'viralScore', 'cta', 'subtitles']
          }
        }
      });

      const meta: ViralMetadata = JSON.parse(metaRes.text);
      meta.subtitles = meta.subtitles?.map((s, i) => ({ ...s, id: `s-${i}` })) || [];
      setMetadata(meta);

      setStatus(`Đang lồng tiếng AI chủ đề ${selectedVoice}...`);
      const speechText = meta.subtitles.map(s => s.text).join('. ');
      const ttsRes = await callWithRetry(async () => {
        const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
        return await currentAi.models.generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: [{ parts: [{ text: speechText }] }],
          config: { 
            responseModalities: [Modality.AUDIO], 
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } } } 
          }
        });
      }, setStatus);

      const b64Audio = ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (b64Audio) {
        const audioCtx = new AudioContext({ sampleRate: 24000 });
        const audioBuffer = await decodeAudioData(decode(b64Audio), audioCtx, 24000, 1);
        setTtsUrl(URL.createObjectURL(bufferToWave(audioBuffer, audioBuffer.length)));
      }

      const pollOperation = async (operation: any, stageLabel: string) => {
        let currentOp = operation;
        let pollCount = 0;
        await new Promise(r => setTimeout(r, 15000));
        while (!currentOp.done) {
          pollCount++;
          setStatus(`[${stageLabel}] Xử lý AI Style: ${selectedTemplate.label}... (${pollCount * 12}s)`);
          await new Promise(r => setTimeout(r, 12000));
          currentOp = await callWithRetry(async () => {
            const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
            return await currentAi.operations.getVideosOperation({ operation: currentOp });
          }, setStatus);
        }
        if (currentOp.error) throw new Error(currentOp.error.message);
        return currentOp;
      };

      const imageMimeType = sourceImage.split(';')[0].split(':')[1] || 'image/jpeg';
      const imageBase64 = sourceImage.split(',')[1];
      const numExtensions = Math.ceil((duration - 7) / 7);
      const totalStages = numExtensions + 1;

      const generateVideoAttempt = async (vPrompt: string) => {
        return await callWithRetry(async () => {
          const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
          return await currentAi.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: `${selectedTemplate.prompt} ${vPrompt}`,
            image: { imageBytes: imageBase64, mimeType: imageMimeType },
            config: { resolution: '720p', aspectRatio: '9:16', numberOfVideos: 1 }
          });
        }, setStatus);
      };

      setStatus(`Bắt đầu Render lớp ${selectedTemplate.label} (1/${totalStages})...`);
      let op;
      try {
        op = await generateVideoAttempt(meta.visualPrompt);
        op = await pollOperation(op, `Giai đoạn 1/${totalStages}`);
      } catch (e: any) {
        setStatus("Server bận, đang kích hoạt Safe-Mode Render...");
        await new Promise(r => setTimeout(r, 5000));
        op = await generateVideoAttempt("Cinematic natural movement.");
        op = await pollOperation(op, `Giai đoạn 1/${totalStages} (Safe)`);
      }

      let currentVideo = op.response?.generatedVideos?.[0]?.video;
      if (!currentVideo) throw new Error("Server AI bận. Thử lại sau 5 phút.");

      for (let i = 0; i < numExtensions; i++) {
        const stage = i + 2;
        setStatus(`Mở rộng phong cách (Stage ${stage}/${totalStages})...`);
        await new Promise(r => setTimeout(r, 8000));
        let extOp = await callWithRetry(async () => {
          const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
          return await currentAi.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: `Continue style and motion naturally.`,
            video: currentVideo,
            config: { resolution: '720p', aspectRatio: '9:16', numberOfVideos: 1 }
          });
        }, setStatus);
        extOp = await pollOperation(extOp, `Giai đoạn ${stage}/${totalStages}`);
        if (extOp.response?.generatedVideos?.[0]?.video) {
          currentVideo = extOp.response.generatedVideos[0].video;
        }
      }

      const videoResp = await fetch(`${currentVideo?.uri}&key=${process.env.API_KEY}`);
      setVideoUrl(URL.createObjectURL(await videoResp.blob()));
      setStatus('Siêu phẩm Viral đã sẵn sàng! 🔥');
    } catch (e: any) { 
      setStatus(`Lỗi: ${e.message}`); 
    } finally { 
      setLoading(false); 
      setQuotaCountdown(0); 
    }
  };

  const handleExport = async () => {
    if (!videoUrl || !videoRef.current || !metadata) return;
    setExporting(true); setStatus('Đang hoàn thiện video TikTok...');
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const w = 1080; const h = 1920; canvas.width = w; canvas.height = h;
    const stream = canvas.captureStream(30);
    const audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    const videoSource = audioCtx.createMediaElementSource(video); videoSource.connect(dest);
    if (ttsUrl && audioRef.current) { 
        const ttsSource = audioCtx.createMediaElementSource(audioRef.current); ttsSource.connect(dest); 
    }
    const recorder = new MediaRecorder(new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]), { 
      mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 25000000 
    });
    const chunks: Blob[] = []; recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ViralVibe_V3_${Date.now()}.mp4`; a.click();
      setExporting(false);
    };
    video.currentTime = 0; if (audioRef.current) audioRef.current.currentTime = 0;
    try { await video.play(); if (audioRef.current) await audioRef.current.play(); recorder.start(); } catch (e) { recorder.start(); }
    
    const renderLoop = () => {
      if (!exporting || video.paused || video.ended) { if (recorder.state === 'recording') recorder.stop(); return; }
      setExportProgress((video.currentTime / video.duration) * 100);
      ctx.drawImage(video, 0, 0, w, h);
      const sub = metadata.subtitles.find(s => video.currentTime >= s.start && video.currentTime <= s.end);
      if (sub) {
        ctx.save();
        ctx.font = '900 115px "Be Vietnam Pro"'; ctx.textAlign = 'center';
        ctx.strokeStyle = 'black'; ctx.lineWidth = 30; ctx.strokeText(sub.text.toUpperCase(), w / 2, h * 0.75);
        ctx.fillStyle = '#FE2C55'; ctx.fillText(sub.text.toUpperCase(), w / 2, h * 0.75);
        ctx.restore();
      }
      ctx.fillStyle = 'white'; ctx.font = '900 45px "Be Vietnam Pro"'; ctx.fillText('@ViralVibe_V3', 80, h - 420);
      requestAnimationFrame(renderLoop);
    };
    renderLoop();
  };

  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const update = () => setCurrentTime(v.currentTime); v.addEventListener('timeupdate', update);
    return () => v.removeEventListener('timeupdate', update);
  }, [videoUrl]);

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-[#FE2C55] overflow-x-hidden">
      <nav className="p-6 border-b border-white/5 flex justify-between items-center bg-black/95 backdrop-blur-3xl sticky top-0 z-[100]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#FE2C55] rounded-2xl flex items-center justify-center font-black italic shadow-[0_0_40px_rgba(254,44,85,0.4)] text-xl">V3</div>
          <h1 className="text-2xl font-black italic tracking-tighter uppercase">ViralVibe <span className="text-[#25F4EE]">ULTRA</span></h1>
        </div>
        <button onClick={() => window.aistudio?.openSelectKey?.()} className="bg-[#FE2C55] text-white px-8 py-2 rounded-full font-black text-[11px] uppercase shadow-lg hover:scale-105 transition-all">Tài Khoản AI ⚡</button>
      </nav>

      <main className="flex-1 p-4 md:p-8 max-w-[1850px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6 lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto scrollbar-hide">
          <section className="bg-zinc-900/50 p-8 rounded-[3rem] border border-white/5 space-y-8 shadow-2xl">
            <h2 className="text-[12px] font-black uppercase text-[#FE2C55] tracking-[0.4em] opacity-40 text-center">Studio Configuration</h2>
            
            <div className="space-y-4">
              <label className="text-[11px] font-bold opacity-30 uppercase tracking-widest">Khung kịch bản (Framework)</label>
              <div className="grid grid-cols-1 gap-2">
                {VIRAL_FRAMEWORKS.map(f => (
                  <button key={f.id} onClick={() => setSelectedFramework(f)} className={`p-4 rounded-2xl border text-left transition-all ${selectedFramework.id === f.id ? 'bg-[#FE2C55] border-[#FE2C55]' : 'bg-black/40 border-white/5 opacity-40'}`}>
                    <div className="font-black text-sm">{f.label}</div>
                    <div className="text-[10px] opacity-60">{f.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[11px] font-bold opacity-30 uppercase tracking-widest">Phong cách AI (Visual Style)</label>
              <div className="grid grid-cols-3 gap-2">
                {VIDEO_TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => setSelectedTemplate(t)} className={`p-3 rounded-2xl border text-center transition-all ${selectedTemplate.id === t.id ? 'bg-[#25F4EE] border-[#25F4EE] text-black' : 'bg-black/40 border-white/5 opacity-40'}`}>
                    <div className="text-xl mb-1">{t.icon}</div>
                    <div className="text-[9px] font-black uppercase">{t.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[11px] font-bold opacity-30 uppercase tracking-widest">Giọng đọc & Chủ đề</label>
              <div className="grid grid-cols-1 gap-2">
                {VOICE_OPTIONS.map(v => (
                  <button key={v.id} onClick={() => setSelectedVoice(v.id as AIVoice)} className={`p-4 rounded-2xl border text-left transition-all ${selectedVoice === v.id ? 'bg-white text-black' : 'bg-black/40 border-white/5 opacity-40'}`}>
                    <div className="font-black text-sm">{v.label}</div>
                    <div className="text-[10px] opacity-60 italic">{v.theme}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[11px] font-bold opacity-30 uppercase tracking-widest ml-1">Chủ đề video</label>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="w-full bg-black/60 border border-white/10 rounded-3xl px-6 py-5 outline-none font-bold text-sm min-h-[100px] focus:border-[#FE2C55]/50 transition-all" placeholder="Ví dụ: Cách làm giàu nhanh chóng..." />
            </div>

            <div className="space-y-4">
              <label className="text-[11px] font-bold opacity-30 uppercase tracking-widest ml-1">Ảnh Gốc (9:16)</label>
              <div onClick={() => fileInputRef.current?.click()} className="group border-2 border-dashed border-white/10 rounded-[2rem] p-8 text-center cursor-pointer hover:border-[#FE2C55]/50 transition-all">
                {sourceImage ? <img src={sourceImage} className="max-h-40 mx-auto rounded-2xl shadow-xl" /> : <div><p className="text-4xl mb-2">📸</p><p className="text-[10px] font-black uppercase">Click để chọn ảnh</p></div>}
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onloadend = () => setSourceImage(r.result as string); r.readAsDataURL(f); } }} />
              </div>
            </div>

            <button onClick={handleGenerate} disabled={loading || !sourceImage} className="w-full py-6 bg-[#FE2C55] text-white rounded-[2rem] font-black text-lg uppercase shadow-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 flex items-center justify-center gap-4">
              {loading ? <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div> : 'TẠO VIDEO VIRAL 🚀'}
            </button>
          </section>
        </div>

        <div className="lg:col-span-4 flex flex-col items-center">
          <div className="relative w-full max-w-[400px] aspect-[9/16] bg-[#0c0c0c] rounded-[4.5rem] p-[10px] border-[12px] border-[#181818] shadow-2xl ring-1 ring-white/10">
            <div className="w-full h-full rounded-[3.8rem] overflow-hidden bg-zinc-950 relative shadow-inner">
              {videoUrl ? (
                <>
                  <video ref={videoRef} src={videoUrl} loop muted className="w-full h-full object-cover" />
                  {metadata?.subtitles.find(s => currentTime >= s.start && currentTime <= s.end) && (
                    <div className="absolute inset-x-8 bottom-[25%] text-center pointer-events-none z-40">
                      <span className="bg-[#FE2C55] text-white px-6 py-3 rounded-2xl font-black text-md uppercase shadow-2xl border-[3px] border-white animate-bounce-sub inline-block leading-none">
                        {metadata.subtitles.find(s => currentTime >= s.start && currentTime <= s.end)?.text}
                      </span>
                    </div>
                  )}
                  <div className="absolute right-4 bottom-[15%] flex flex-col gap-6 text-center drop-shadow-lg">
                    <div className="flex flex-col items-center"><div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-2xl mb-1 backdrop-blur-xl border border-white/10">❤️</div><span className="text-[9px] font-black">2.4M</span></div>
                    <div className="flex flex-col items-center"><div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-2xl mb-1 backdrop-blur-xl border border-white/10">💬</div><span className="text-[9px] font-black">12k</span></div>
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-6 opacity-10 p-12 text-center">
                  <div className="w-16 h-16 border-[6px] border-white rounded-full border-t-transparent animate-spin"></div>
                  <p className="font-black text-[10px] uppercase tracking-[0.4em]">Viral Engine V3 Ready</p>
                </div>
              )}
            </div>
          </div>
          {videoUrl && (
            <div className="mt-8 w-full max-w-[400px] space-y-4 px-4">
               <button onClick={handleExport} disabled={exporting} className="w-full py-6 bg-white text-black rounded-[1.5rem] font-black text-md uppercase shadow-2xl hover:bg-[#FE2C55] hover:text-white transition-all">
                {exporting ? `XUẤT VIDEO ${Math.round(exportProgress)}%` : `TẢI XUỐNG MP4 🎥`}
              </button>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
           <section className="bg-zinc-900/50 p-8 rounded-[3rem] border border-white/5 space-y-8 shadow-2xl h-full">
              <h2 className="text-[12px] font-black uppercase text-[#25F4EE] tracking-[0.4em] opacity-40 text-center">Viral Strategy</h2>
              
              {metadata ? (
                <div className="space-y-8 animate-fade-in">
                  <div className="space-y-4">
                    <label className="text-[11px] font-bold opacity-30 uppercase tracking-widest">Tiêu đề TikTok</label>
                    <div className="space-y-2">
                      {metadata.catchyTitles.map((t, i) => (
                        <div key={i} className="flex items-center bg-black/40 border border-white/5 rounded-xl px-5 py-3 cursor-pointer hover:border-[#25F4EE] transition-all group" onClick={() => { navigator.clipboard.writeText(t); setStatus('Đã copy!'); }}>
                          <span className="flex-1 font-bold text-[11px] italic group-hover:text-[#25F4EE]">{t}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[11px] font-bold opacity-30 uppercase tracking-widest">Hashtags 2025</label>
                    <div className="flex flex-wrap gap-1.5">
                      {metadata.hashtags.map((h, i) => (
                        <span key={i} className="bg-[#25F4EE]/10 text-[#25F4EE] px-3 py-1.5 rounded-lg font-black text-[9px] uppercase border border-[#25F4EE]/20">#{h}</span>
                      ))}
                    </div>
                  </div>

                  <div className="p-8 bg-[#FE2C55]/5 rounded-[2.5rem] border border-[#FE2C55]/20 text-center">
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Chỉ số Viral</span>
                    <div className="text-7xl font-black italic text-[#FE2C55] mt-3 tracking-tighter">{metadata.viralScore}%</div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center opacity-10 py-24 grayscale">
                  <p className="text-7xl mb-8">📽️</p>
                  <p className="font-black text-[10px] uppercase tracking-[0.6em] text-center">Đang phân tích kịch bản...</p>
                </div>
              )}
           </section>
        </div>
      </main>

      {status && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 px-8 py-4 bg-black/95 border border-[#25F4EE]/30 rounded-full text-[10px] font-black uppercase text-[#25F4EE] z-[400] shadow-2xl flex items-center gap-5 animate-slide-up backdrop-blur-3xl">
          <div className="w-2 h-2 rounded-full bg-[#25F4EE] animate-pulse"></div>
          {status}
        </div>
      )}

      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translate(-50%, 40px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bounce-sub { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .animate-slide-up { animation: slideUp 0.5s ease-out forwards; }
        .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
        .animate-bounce-sub { animation: bounce-sub 1.2s ease-in-out infinite; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      {ttsUrl && <audio ref={audioRef} src={ttsUrl} className="hidden" />}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<ViralVibeApp />);
