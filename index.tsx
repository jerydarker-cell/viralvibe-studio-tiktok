
import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, Modality } from '@google/genai';

// --- Constants & Types ---
type AIVoice = 'Kore' | 'Puck' | 'Zephyr' | 'Charon';

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

interface SavedProject {
  id: string;
  name: string;
  prompt: string;
  templateId: string;
  voice: AIVoice;
  sourceImage: string | null;
  metadata: ViralMetadata | null;
  timestamp: number;
}

const SAVED_PROJECTS_KEY = 'viralvibe_projects_v1';
const DRAFT_KEY = 'viralvibe_draft';

const VIDEO_TEMPLATES: VideoTemplate[] = [
  { 
    id: 'tiktok-viral-high', 
    label: 'TikTok Trend 🔥', 
    prompt: 'Hyper-realistic vertical 9:16 cinematic video, TikTok trend aesthetic, ultra-sharp 4k details, high-impact visuals, vibrant lighting, fast-paced cinematic cuts, trending transitions.', 
    icon: '🔥', 
    description: 'Phong cách xu hướng mạnh mẽ, sắc nét.' 
  },
  { 
    id: 'mysterious-dark', 
    label: 'Bí Ẩn 🌑', 
    prompt: 'Cinematic dark aesthetic, mysterious atmosphere, low light, deep shadows, 8k resolution, vertical 9:16, professional color grading, intrigue and suspense.', 
    icon: '🌑', 
    description: 'Kịch tính, bí ẩn và thu hút.' 
  },
  { 
    id: 'street-pro-night', 
    label: 'Đêm Thành Phố 🌃', 
    prompt: 'Hyper-realistic night street view, neon light trails, 8k vertical video, wet pavement reflections, urban atmosphere, movie-like camera motion.', 
    icon: '🌃', 
    description: 'Không khí đô thị ban đêm rực rỡ neon.' 
  },
  { 
    id: 'luxury-vibe', 
    label: 'Sang Trọng ✨', 
    prompt: 'Luxury life aesthetic, high-end details, golden hour lighting, clean and sophisticated 9:16 video, premium cinematography, smooth slow motion.', 
    icon: '✨', 
    description: 'Phong cách sang trọng, đẳng cấp.' 
  }
];

const AI_VOICES: { id: AIVoice, label: string }[] = [
  { id: 'Puck', label: 'Puck (Trẻ trung, Viral)' },
  { id: 'Kore', label: 'Kore (Mạnh mẽ, Cuốn hút)' },
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

const parseSafeJson = (text: string | undefined): any => {
  if (!text || !text.trim()) throw new Error("AI không phản hồi.");
  let cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error("Dữ liệu JSON từ AI không hợp lệ.");
  return JSON.parse(cleaned.substring(start, end + 1));
};

const ViralVibeApp: React.FC = () => {
  const [apiKeySelected, setApiKeySelected] = useState<boolean>(false);
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
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [selectedVoice, setSelectedVoice] = useState<AIVoice>('Puck');
  const [quotaCountdown, setQuotaCountdown] = useState<number>(0);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) setApiKeySelected(await window.aistudio.hasSelectedApiKey());
      else setApiKeySelected(!!process.env.API_KEY);
    };
    checkKey();
    
    // Load projects and draft
    const stored = localStorage.getItem(SAVED_PROJECTS_KEY);
    if (stored) try { setSavedProjects(JSON.parse(stored)); } catch (e) {}

    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const d = JSON.parse(draft);
        setPrompt(d.prompt || '');
        setSourceImage(d.sourceImage || null);
        const template = VIDEO_TEMPLATES.find(t => t.id === d.templateId);
        if (template) setSelectedTemplate(template);
      } catch (e) {}
    }
  }, []);

  // Auto-save draft
  useEffect(() => {
    const draft = { prompt, sourceImage, templateId: selectedTemplate.id };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [prompt, sourceImage, selectedTemplate]);

  const saveToStorage = (projects: SavedProject[]) => {
    try {
      localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(projects));
      setSavedProjects(projects);
    } catch (e) {
      alert("Bộ nhớ đầy! Vui lòng xóa bớt dự án cũ.");
    }
  };

  const handleSaveProject = () => {
    const name = window.prompt("Tên dự án:", `Dự án ${new Date().toLocaleTimeString()}`);
    if (!name) return;
    const newProject: SavedProject = {
      id: crypto.randomUUID(), name, prompt, templateId: selectedTemplate.id,
      voice: selectedVoice, sourceImage, metadata, timestamp: Date.now()
    };
    saveToStorage([newProject, ...savedProjects].slice(0, 15));
    setStatus("Đã lưu!"); setTimeout(() => setStatus(""), 2000);
  };

  const handleLoadProject = (project: SavedProject) => {
    if (!window.confirm(`Tải dự án "${project.name}"?`)) return;
    setPrompt(project.prompt);
    setSelectedTemplate(VIDEO_TEMPLATES.find(t => t.id === project.templateId) || VIDEO_TEMPLATES[0]);
    setSelectedVoice(project.voice);
    setSourceImage(project.sourceImage);
    setMetadata(project.metadata);
    setVideoUrl(null); setTtsUrl(null);
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Xóa dự án?")) saveToStorage(savedProjects.filter(p => p.id !== id));
  };

  const updateSubtitle = (id: string, newText: string) => {
    if (!metadata) return;
    const updated = metadata.subtitles.map(s => s.id === id ? { ...s, text: newText } : s);
    setMetadata({ ...metadata, subtitles: updated });
  };

  async function callWithRetry<T>(fn: () => Promise<T>, onRetry: (msg: string) => void, retries = 5): Promise<T> {
    let attempt = 0;
    while (attempt < retries) {
      try { return await fn(); } catch (error: any) {
        attempt++;
        const isQuota = error.message?.toLowerCase().includes('429');
        if (attempt >= retries) throw error;
        if (isQuota) {
          onRetry(`Đợi reset hạn mức (429)...`);
          for (let i = 100; i > 0; i--) { 
            setQuotaCountdown(i); 
            await new Promise(r => {
              const timer = setTimeout(r, 1000);
              // Nút "Thử lại ngay" có thể xóa timer này (logic đơn giản hóa: cứ đợi)
            }); 
          }
          setQuotaCountdown(0);
        } else await new Promise(r => setTimeout(r, 5000));
      }
    }
    throw new Error("Hệ thống bận.");
  }

  const handleGenerate = async () => {
    if (!sourceImage) return;
    setLoading(true); setStatus('Sáng tạo kịch bản xu hướng...'); setMetadata(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl); if (ttsUrl) URL.revokeObjectURL(ttsUrl);
    setVideoUrl(null); setTtsUrl(null);

    try {
      const metaRes = await callWithRetry(async () => {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        return await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Create VIRAL TikTok metadata for: "${prompt}". 
          Focus on curious hooks for Vietnamese audience. 
          Subtitles should be short and punchy.
          JSON ONLY: { 
            "catchyTitles": ["Title 1", "Title 2", "Title 3"], 
            "hashtags": ["xuhuong", "fyp", "trending"], 
            "description": "Viral description",
            "viralScore": 99,
            "cta": "Like for Part 2",
            "subtitles": [{"text": "BẠN CÓ BIẾT...", "start": 0, "end": 2.5}, {"text": "ĐÂY LÀ BÍ MẬT...", "start": 2.5, "end": 5}]
          }`,
          config: { responseMimeType: 'application/json' }
        });
      }, setStatus);

      const meta: ViralMetadata = parseSafeJson(metaRes.text);
      meta.subtitles = meta.subtitles?.map((s, i) => ({ ...s, id: `s-${i}` })) || [];
      setMetadata(meta);

      setStatus('Lồng tiếng AI (High-fidelity)...');
      const speechText = meta.subtitles.map(s => s.text).join('. ');
      const ttsRes = await callWithRetry(async () => {
        const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
        return await currentAi.models.generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: [{ parts: [{ text: speechText }] }],
          config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } } } }
        });
      }, setStatus);

      const b64Audio = ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (b64Audio) {
        const audioCtx = new AudioContext({ sampleRate: 24000 });
        const audioBuffer = await decodeAudioData(decode(b64Audio), audioCtx, 24000, 1);
        setTtsUrl(URL.createObjectURL(bufferToWave(audioBuffer, audioBuffer.length)));
      }

      setStatus('Đang Render Video TikTok (0/3)...');
      let op = await callWithRetry(async () => {
        const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
        return await currentAi.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: `${selectedTemplate.prompt}. ${prompt}. Cinematic.`,
          image: { imageBytes: sourceImage.split(',')[1], mimeType: 'image/jpeg' },
          config: { resolution: '720p', aspectRatio: '9:16' }
        });
      }, setStatus);

      while (!op.done) {
        await new Promise(r => setTimeout(r, 20000));
        op = await callWithRetry(async () => {
          const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
          return await currentAi.operations.getVideosOperation({ operation: op });
        }, setStatus);
      }

      let currentVideo = op.response?.generatedVideos?.[0]?.video;
      if (!currentVideo) throw new Error("Render thất bại.");

      for (let i = 0; i < 2; i++) {
        setStatus(`Mở rộng nội dung (${i + 2}/3)...`);
        await new Promise(r => setTimeout(r, 5000));
        op = await callWithRetry(async () => {
          const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
          return await currentAi.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: `Part ${i + 2} of viral story: ${prompt}. High impact visuals.`,
            video: currentVideo,
            config: { resolution: '720p', aspectRatio: '9:16' }
          });
        }, setStatus);

        while (!op.done) {
          await new Promise(r => setTimeout(r, 20000));
          op = await callWithRetry(async () => {
            const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
            return await currentAi.operations.getVideosOperation({ operation: op });
          }, setStatus);
        }
        if (op.response?.generatedVideos?.[0]?.video) currentVideo = op.response.generatedVideos[0].video;
      }

      const videoResp = await fetch(`${currentVideo?.uri}&key=${process.env.API_KEY}`);
      setVideoUrl(URL.createObjectURL(await videoResp.blob()));
      setStatus('Hoàn thành cực phẩm TikTok! 🔥');
    } catch (e: any) { setStatus(`Lỗi: ${e.message}`); } finally { setLoading(false); setQuotaCountdown(0); }
  };

  const handleExport = async () => {
    if (!videoUrl || !videoRef.current || !metadata) return;
    setExporting(true); setStatus('Đang nén video chất lượng cao...');
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
      mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 18000000 
    });
    const chunks: Blob[] = []; recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ViralVibe_916_${Date.now()}.mp4`; a.click();
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
        ctx.font = 'bold 110px "Anton"'; ctx.textAlign = 'center';
        ctx.strokeStyle = 'black'; ctx.lineWidth = 25; ctx.strokeText(sub.text.toUpperCase(), w / 2, h * 0.72);
        ctx.fillStyle = '#FE2C55'; ctx.fillText(sub.text.toUpperCase(), w / 2, h * 0.72);
        ctx.restore();
      }
      ctx.fillStyle = 'white'; ctx.font = 'bold 45px sans-serif'; ctx.fillText('@ViralVibe_AI_TikTok', 70, h - 380);
      ctx.font = '32px sans-serif'; ctx.fillText(metadata.hashtags.map(h => '#' + h).join(' '), 70, h - 300);
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
      <nav className="p-6 border-b border-white/5 flex justify-between items-center bg-black/90 backdrop-blur-3xl sticky top-0 z-[100]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#FE2C55] rounded-2xl flex items-center justify-center font-black italic shadow-[0_0_40px_rgba(254,44,85,0.4)] text-xl">V</div>
          <h1 className="text-2xl font-black italic tracking-tighter uppercase">ViralVibe <span className="text-[#25F4EE]">TIKTOK PRO</span></h1>
        </div>
        <div className="flex items-center gap-4 md:gap-8">
           <button onClick={handleSaveProject} className="hidden md:block bg-zinc-800 text-[10px] font-black uppercase px-4 py-2 rounded-full hover:bg-white hover:text-black transition-all">Lưu dự án 💾</button>
           <button onClick={() => window.aistudio?.openSelectKey?.()} className="bg-[#FE2C55] text-white px-6 py-2 rounded-full font-black text-[10px] uppercase shadow-lg hover:scale-105 transition-all">Đổi Engine AI ⚡</button>
        </div>
      </nav>

      <main className="flex-1 p-4 md:p-8 max-w-[1800px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 relative">
        {/* Panel 1: Creative Hub */}
        <div className="lg:col-span-4 space-y-8 lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto scrollbar-hide pr-1">
          <section className="bg-zinc-900/50 p-8 lg:p-10 rounded-[3.5rem] border border-white/5 space-y-8 shadow-2xl relative overflow-hidden">
            <h2 className="text-[11px] font-black uppercase text-[#FE2C55] tracking-[0.3em] opacity-50">Cấu hình sáng tạo</h2>
            
            <div className="space-y-4">
              <label className="text-[10px] font-bold opacity-40 uppercase ml-2">CHỌN PHONG CÁCH</label>
              <div className="grid grid-cols-2 gap-3">
                {VIDEO_TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => setSelectedTemplate(t)} className={`p-4 rounded-2xl border text-left transition-all ${selectedTemplate.id === t.id ? 'bg-[#FE2C55] border-[#FE2C55] shadow-xl scale-[1.02]' : 'bg-black/40 border-white/5 opacity-50 hover:opacity-100'}`}>
                    <div className="text-2xl mb-2">{t.icon}</div>
                    <div className="text-[10px] font-black uppercase tracking-tighter">{t.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold opacity-40 uppercase ml-2">Ý TƯỞNG CỐT TRUYỆN</label>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="w-full bg-black/60 border border-white/10 rounded-3xl px-6 py-5 outline-none font-bold text-sm min-h-[100px] focus:border-[#FE2C55]/50 transition-all placeholder:opacity-20" placeholder="Mô tả ngắn gọn ý tưởng của bạn..." />
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-bold opacity-40 uppercase ml-2">ẢNH GỐC (THAM KHẢO 9:16)</label>
              <div onClick={() => fileInputRef.current?.click()} className="group relative border-2 border-dashed border-white/10 rounded-[2.5rem] p-10 text-center cursor-pointer hover:border-[#FE2C55]/50 hover:bg-black/40 transition-all bg-black/20">
                {sourceImage ? <img src={sourceImage} className="max-h-48 mx-auto rounded-2xl shadow-2xl" alt="Preview" /> : <div className="opacity-20 group-hover:opacity-100 transition-opacity"><p className="text-5xl mb-3">🖼️</p><p className="text-[10px] font-black uppercase tracking-widest">Tải ảnh lên</p></div>}
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onloadend = () => setSourceImage(r.result as string); r.readAsDataURL(f); } }} />
              </div>
            </div>

            <button onClick={handleGenerate} disabled={loading || !sourceImage} className="w-full py-7 bg-[#25F4EE] text-black rounded-3xl font-black text-xl uppercase shadow-2xl hover:scale-[1.03] active:scale-95 transition-all disabled:opacity-20 flex items-center justify-center gap-4">
              {loading ? <div className="w-6 h-6 border-4 border-black border-t-transparent rounded-full animate-spin"></div> : 'TẠO SIÊU PHẨM VIRAL 🔥'}
            </button>

            {quotaCountdown > 0 && (
              <div className="absolute inset-0 bg-black/95 backdrop-blur-2xl z-[200] flex flex-col items-center justify-center p-12 text-center animate-fade-in">
                <div className="w-48 h-48 relative mb-8">
                  <svg className="w-full h-full rotate-[-90deg]">
                    <circle cx="96" cy="96" r="86" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-white/5" />
                    <circle cx="96" cy="96" r="86" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-[#FE2C55]" strokeDasharray="540" strokeDashoffset={540 - (quotaCountdown / 100) * 540} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-black text-6xl italic tracking-tighter">{quotaCountdown}</div>
                </div>
                <h3 className="text-2xl font-black text-white mb-2 uppercase italic tracking-tighter">API Đang Nghỉ Ngơi</h3>
                <p className="text-[10px] opacity-40 uppercase tracking-[0.3em] mb-8">Tự động tiếp tục sau giây lát...</p>
                <button onClick={() => setQuotaCountdown(0)} className="bg-white/5 text-white/40 px-6 py-2 rounded-full text-[9px] font-black uppercase hover:bg-white/10 transition-all">Thử lại ngay</button>
              </div>
            )}
          </section>

          {savedProjects.length > 0 && (
            <section className="bg-zinc-900/40 p-10 rounded-[3.5rem] border border-white/5 space-y-6 shadow-2xl">
              <h2 className="text-[11px] font-black uppercase text-[#25F4EE] tracking-[0.3em] opacity-50">Dự án đã lưu</h2>
              <div className="space-y-3">
                {savedProjects.map(p => (
                  <div key={p.id} onClick={() => handleLoadProject(p)} className="group bg-black/40 hover:bg-black/80 border border-white/5 hover:border-[#25F4EE]/30 rounded-3xl p-5 cursor-pointer transition-all flex items-center gap-5">
                    <div className="w-16 h-16 bg-zinc-800 rounded-2xl overflow-hidden flex-shrink-0 shadow-xl ring-1 ring-white/5">
                      {p.sourceImage ? <img src={p.sourceImage} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl">📽️</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm truncate uppercase tracking-tighter">{p.name}</p>
                      <p className="text-[9px] opacity-30 font-bold uppercase tracking-widest">{new Date(p.timestamp).toLocaleDateString()}</p>
                    </div>
                    <button onClick={(e) => handleDeleteProject(p.id, e)} className="p-3 opacity-0 group-hover:opacity-100 hover:text-[#FE2C55] transition-all text-xl">🗑️</button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Panel 2: Smartphone Studio */}
        <div className="lg:col-span-4 flex flex-col items-center">
          <div className="relative w-full max-w-[450px] aspect-[9/16] bg-[#0c0c0c] rounded-[5rem] p-[12px] border-[16px] border-[#1a1a1a] shadow-[0_0_150px_rgba(0,0,0,1)] ring-1 ring-white/10">
            {/* Camera Notch */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[160px] h-[35px] bg-[#1a1a1a] rounded-b-[25px] z-30 flex items-center justify-center gap-3">
               <div className="w-2 h-2 rounded-full bg-[#050505]"></div>
               <div className="w-8 h-1 rounded-full bg-[#050505]"></div>
            </div>
            
            <div className="w-full h-full rounded-[4rem] overflow-hidden bg-zinc-950 relative shadow-inner">
              {videoUrl ? (
                <>
                  <video ref={videoRef} src={videoUrl} loop muted className="w-full h-full object-cover" />
                  {/* Real-time TikTok Subtitles */}
                  {metadata?.subtitles.find(s => currentTime >= s.start && currentTime <= s.end) && (
                    <div className="absolute inset-x-8 bottom-[28%] text-center pointer-events-none z-40">
                      <span className="bg-[#FE2C55] text-white px-8 py-5 rounded-[2rem] font-black text-base uppercase shadow-[0_20px_60px_rgba(254,44,85,0.6)] border-4 border-white animate-bounce-sub">
                        {metadata.subtitles.find(s => currentTime >= s.start && currentTime <= s.end)?.text}
                      </span>
                    </div>
                  )}
                  {/* TikTok Overlay HUD */}
                  <div className="absolute right-6 bottom-[18%] flex flex-col gap-8 text-center pointer-events-none">
                    <div className="flex flex-col items-center"><div className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center text-3xl mb-1 backdrop-blur-xl">❤️</div><span className="text-[10px] font-black">99k</span></div>
                    <div className="flex flex-col items-center"><div className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center text-3xl mb-1 backdrop-blur-xl">💬</div><span className="text-[10px] font-black">1.2k</span></div>
                    <div className="flex flex-col items-center"><div className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center text-3xl mb-1 backdrop-blur-xl">↗️</div><span className="text-[10px] font-black">Share</span></div>
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-8 opacity-10 p-12 text-center">
                  <div className="w-24 h-24 border-8 border-white rounded-full border-t-transparent animate-spin"></div>
                  <p className="font-black text-xs uppercase tracking-[0.5em] italic">Theater Engine Active</p>
                </div>
              )}
            </div>
          </div>
          {videoUrl && (
            <div className="mt-8 w-full max-w-[450px] space-y-4">
               <button onClick={handleExport} disabled={exporting} className="w-full py-7 bg-white text-black rounded-3xl font-black text-xl uppercase shadow-2xl hover:bg-[#FE2C55] hover:text-white hover:scale-[1.03] transition-all">
                {exporting ? `RENDER MP4 ${Math.round(exportProgress)}%` : 'XUẤT VIDEO 9:16 SẴN SÀNG 📥'}
              </button>
            </div>
          )}
        </div>

        {/* Panel 3: Script & Viral Tools */}
        <div className="lg:col-span-4 space-y-8 h-full">
           <section className="bg-zinc-900/50 p-8 lg:p-10 rounded-[3.5rem] border border-white/5 space-y-8 shadow-2xl h-full flex flex-col">
              <h2 className="text-[11px] font-black uppercase text-[#25F4EE] tracking-[0.3em] opacity-50">Kịch bản & Phân tích</h2>
              
              {metadata ? (
                <div className="space-y-10 animate-fade-in flex-1">
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest">HOOK & PHỤ ĐỀ (NHẤP ĐỂ SỬA)</label>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto scrollbar-hide pr-2">
                      {metadata.subtitles.map((s) => (
                        <div key={s.id} className="bg-black/40 border border-white/10 rounded-2xl p-4 flex gap-4 items-center group transition-all focus-within:border-[#FE2C55]">
                           <span className="text-[9px] font-black text-[#FE2C55] opacity-40">{s.start}s</span>
                           <input 
                            value={s.text} 
                            onChange={(e) => updateSubtitle(s.id, e.target.value)} 
                            className="flex-1 bg-transparent border-none outline-none font-bold text-xs uppercase italic tracking-tighter"
                           />
                           <span className="opacity-0 group-hover:opacity-100 transition-opacity">✍️</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest">TIÊU ĐỀ VIRAL GỢI Ý</label>
                    <div className="space-y-3">
                      {metadata.catchyTitles.map((t, i) => (
                        <div key={i} className="flex items-center bg-black/40 border border-white/5 rounded-2xl px-6 py-4 cursor-pointer hover:border-[#25F4EE] transition-all group" onClick={() => { navigator.clipboard.writeText(t); setStatus('Đã copy tiêu đề!'); }}>
                          <span className="flex-1 font-bold text-xs italic group-hover:text-[#25F4EE]">{t}</span>
                          <span className="text-xs opacity-20 group-hover:opacity-100">📋</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-10 bg-[#FE2C55]/5 rounded-[3rem] border border-[#FE2C55]/20 text-center shadow-inner relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#FE2C55]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] opacity-50 relative z-10">Viral Probability</span>
                    <div className="text-8xl font-black italic text-[#FE2C55] mt-4 tracking-tighter relative z-10">{metadata.viralScore}%</div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center opacity-5 py-20 grayscale">
                  <p className="text-9xl mb-8 animate-pulse">📈</p>
                  <p className="font-black text-xs uppercase tracking-[0.6em] text-center max-w-[200px]">Đang chờ phân tích kịch bản...</p>
                </div>
              )}
           </section>
        </div>
      </main>

      {status && !quotaCountdown && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 px-10 py-5 bg-[#050505]/95 border border-[#25F4EE]/30 rounded-full text-[11px] font-black uppercase text-[#25F4EE] z-[400] shadow-[0_20px_80px_rgba(0,0,0,0.8)] flex items-center gap-6 animate-slide-up backdrop-blur-2xl">
          <div className="w-2 h-2 rounded-full bg-[#25F4EE] animate-pulse"></div>
          {status}
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&display=swap');
        @keyframes slideUp { from { opacity: 0; transform: translate(-50%, 40px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bounce-sub { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        .animate-slide-up { animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .animate-bounce-sub { animation: bounce-sub 1.5s ease-in-out infinite; }
        textarea { resize: none; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      {ttsUrl && <audio ref={audioRef} src={ttsUrl} className="hidden" />}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<ViralVibeApp />);
