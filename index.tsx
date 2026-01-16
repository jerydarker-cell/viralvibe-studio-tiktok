
import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, Modality, VideoGenerationReferenceType } from '@google/genai';

// --- Constants & Types ---
type AIVoice = 'Kore' | 'Puck' | 'Zephyr';

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
}

interface VideoTemplate {
  id: string;
  label: string;
  prompt: string;
  icon: string;
  description: string;
  tag: string;
}

const VIDEO_TEMPLATES: VideoTemplate[] = [
  { 
    id: 'tiktok-pro-8k', 
    label: 'Viral Trend 8K', 
    prompt: 'Hyper-realistic cinematic TikTok trend footage, 8k resolution, impeccable character consistency, physically accurate fluid motion, professional studio lighting, vibrant colors, aesthetically perfect, high artistic value.', 
    icon: '🔥', 
    description: 'Video 20s chuẩn xu hướng: Siêu thực, sắc nét và cực kỳ bắt mắt.', 
    tag: 'ULTRA-TREND' 
  },
  { 
    id: 'cinematic-glam', 
    label: 'Luxury Glam', 
    prompt: 'High-end cinematic glamour shot, dramatic golden hour lighting, sharp focus on intricate textures, slow motion movement, consistent aesthetic, luxury lifestyle vibe, beautiful cinematography.', 
    icon: '✨', 
    description: 'Phong cách điện ảnh, hào nhoáng và sang trọng.', 
    tag: 'LUXURY' 
  },
  { 
    id: 'cyber-vision', 
    label: 'Cyber Vision', 
    prompt: 'Cyberpunk futuristic aesthetic, neon lighting, hyper-realistic reflections, consistent futuristic world, high detail, smooth transitions, breathtaking effects.', 
    icon: '🚀', 
    description: 'Thế giới tương lai với ánh sáng neon và chi tiết cực cao.', 
    tag: 'FUTURE' 
  },
];

const AI_VOICES: { id: AIVoice, label: string }[] = [
  { id: 'Kore', label: 'Kore (Mạnh mẽ, Cuốn hút)' },
  { id: 'Puck', label: 'Puck (Năng động, Viral)' },
  { id: 'Zephyr', label: 'Zephyr (Trầm ấm, Sâu sắc)' },
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
  function setUint32(data: number) { view.setUint32(pos, data, true); pos += 4; }
  function setUint16(data: number) { view.setUint16(pos, data, true); pos += 2; }
  setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157);
  setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan);
  setUint32(abuffer.sampleRate); setUint32(abuffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2); setUint16(16); setUint32(0x61746164); setUint32(length - pos - 4);
  const channels = [];
  for (let i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i));
  let offset = 0;
  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF) | 0;
      view.setInt16(pos, sample, true); pos += 2;
    }
    offset++;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Robustly sanitizes and parses JSON response from model.
 * Handles cases where the response might be truncated or contain markdown.
 */
const parseSafeJson = (text: string): any => {
  let cleaned = text.trim();
  // Remove markdown code blocks if present
  cleaned = cleaned.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
  
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  
  if (start === -1) throw new Error("Không tìm thấy cấu trúc dữ liệu JSON trong phản hồi AI.");
  
  // If no end bracket, the JSON is definitely truncated
  if (end === -1 || end < start) {
    // Basic attempt to close the JSON if it's truncated during a list or object
    cleaned = cleaned + "]}"; // This is a common truncation point for our schema
  } else {
    cleaned = cleaned.substring(start, end + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // If it still fails, try to find a balanced subset
    let balance = 0;
    let cutoff = -1;
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === '{') balance++;
      if (cleaned[i] === '}') balance--;
      if (balance === 0) {
        cutoff = i;
        break;
      }
    }
    if (cutoff !== -1) {
      return JSON.parse(cleaned.substring(start, cutoff + 1));
    }
    throw e;
  }
};

// --- Resilience Wrapper ---
async function callWithRetry<T>(
  fn: () => Promise<T>, 
  onRetry: (msg: string) => void,
  retries = 8, 
  initialDelay = 45000 
): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      const errorMsg = error.message?.toLowerCase() || "";
      const isQuotaError = errorMsg.includes('429') || error.status === 429 || errorMsg.includes('resource_exhausted') || errorMsg.includes('quota exceeded');
      
      if (attempt >= retries) throw error;
      
      if (isQuotaError) {
        const delay = (initialDelay * Math.pow(2.2, attempt - 1)) + (Math.random() * 5000);
        onRetry(`Đang chờ hạn mức API (429). Thử lại sau ${Math.round(delay/1000)}s (${attempt}/${retries}). Vui lòng giữ tab này mở.`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        if (attempt >= 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
  throw new Error("Không thể hoàn tất yêu cầu sau nhiều lần thử lại.");
}

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
  const [prompt, setPrompt] = useState<string>('Nàng thơ trong vườn hoa ánh sáng rực rỡ');
  const [selectedTemplate, setSelectedTemplate] = useState<VideoTemplate>(VIDEO_TEMPLATES[0]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [selectedVoice, setSelectedVoice] = useState<AIVoice>('Puck');

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        setApiKeySelected(await window.aistudio.hasSelectedApiKey());
      } else {
        setApiKeySelected(!!process.env.API_KEY);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setApiKeySelected(true);
    }
  };

  const handleGenerate = async () => {
    if (!sourceImage) return;
    setLoading(true);
    setStatus('Đang phác thảo kịch bản TikTok 20s...');
    setMetadata(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (ttsUrl) URL.revokeObjectURL(ttsUrl);
    setVideoUrl(null);
    setTtsUrl(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const metaRes = await callWithRetry(async () => {
        return await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Topic: ${prompt}. Template: ${selectedTemplate.label}. Output JSON: catchyTitles (3), hashtags (5), description, viralScore, subtitles (array of {text, start, end} up to 20s).`,
          config: {
            responseMimeType: 'application/json',
            maxOutputTokens: 1000, 
            thinkingConfig: { thinkingBudget: 100 },
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                catchyTitles: { type: Type.ARRAY, items: { type: Type.STRING } },
                hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
                description: { type: Type.STRING },
                viralScore: { type: Type.NUMBER },
                subtitles: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: { text: { type: Type.STRING }, start: { type: Type.NUMBER }, end: { type: Type.NUMBER } }
                  }
                }
              },
              required: ["catchyTitles", "hashtags", "description", "viralScore", "subtitles"]
            }
          }
        });
      }, (msg) => setStatus(msg));

      const meta: ViralMetadata = parseSafeJson(metaRes.text || '{}');
      if (meta.subtitles) {
        meta.subtitles = meta.subtitles.map((s, idx) => ({
          ...s,
          id: `sub-${idx}`,
          start: Number(s.start || 0),
          end: Number(s.end || 0)
        }));
      }
      setMetadata(meta);

      await new Promise(r => setTimeout(r, 2000));
      setStatus('AI đang lồng tiếng chuyên nghiệp...');
      
      const speechText = meta.subtitles?.map(s => s.text).join('. ') || "";
      const ttsRes = await callWithRetry(async () => {
        return await ai.models.generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: [{ parts: [{ text: `Đọc lôi cuốn: ${speechText}` }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } } }
          }
        });
      }, (msg) => setStatus(msg));

      const b64Audio = ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (b64Audio) {
        const audioCtx = new AudioContext({ sampleRate: 24000 });
        const audioBuffer = await decodeAudioData(decode(b64Audio), audioCtx, 24000, 1);
        setTtsUrl(URL.createObjectURL(bufferToWave(audioBuffer, audioBuffer.length)));
      }

      await new Promise(r => setTimeout(r, 4000));
      setStatus('Khởi tạo Video Giai đoạn 1 (0-6s)...');

      let op = await callWithRetry(async () => {
        const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
        return await currentAi.models.generateVideos({
          model: 'veo-3.1-generate-preview',
          prompt: `${selectedTemplate.prompt}. ${prompt}.`,
          config: { 
            resolution: '720p', 
            aspectRatio: '16:9', 
            referenceImages: [{ 
              image: { imageBytes: sourceImage.split(',')[1], mimeType: 'image/jpeg' }, 
              referenceType: VideoGenerationReferenceType.ASSET 
            }] 
          }
        });
      }, (msg) => setStatus(msg));

      while (!op.done) {
        await new Promise(r => setTimeout(r, 15000));
        const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
        op = await currentAi.operations.getVideosOperation({ operation: op });
      }

      let currentVideo = op.response?.generatedVideos?.[0]?.video;
      if (!currentVideo) throw new Error("Giai đoạn 1 không tìm thấy video. Vui lòng thử lại.");

      // Recursive extensions
      for (let i = 0; i < 2; i++) {
        const stage = i + 2;
        setStatus(`Chờ API sẵn sàng cho Giai đoạn ${stage}/3...`);
        await new Promise(r => setTimeout(r, 15000));
        
        setStatus(`Mở rộng Video (+7s) - Giai đoạn ${stage}...`);
        op = await callWithRetry(async () => {
          const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
          return await currentAi.models.generateVideos({
            model: 'veo-3.1-generate-preview',
            prompt: `Tiếp diễn mượt mà: ${prompt}.`,
            video: currentVideo,
            config: { resolution: '720p', aspectRatio: '16:9' }
          });
        }, (msg) => setStatus(msg));

        while (!op.done) {
          await new Promise(r => setTimeout(r, 15000));
          const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
          op = await currentAi.operations.getVideosOperation({ operation: op });
        }

        if (op.response?.generatedVideos?.[0]?.video) {
          currentVideo = op.response.generatedVideos[0].video;
        } else {
          break;
        }
      }

      const dl = currentVideo?.uri;
      if (!dl) throw new Error("Không thể lấy liên kết tải video cuối cùng.");
      
      setStatus('Đang tải dữ liệu video gốc...');
      const videoResp = await fetch(`${dl}&key=${process.env.API_KEY}`);
      if (!videoResp.ok) throw new Error("Lỗi tải video từ server.");
      const videoBlob = await videoResp.blob();
      setVideoUrl(URL.createObjectURL(videoBlob));
      setStatus('Sẵn sàng! Hãy mở Theater Mode để trải nghiệm.');
    } catch (e: any) {
      console.error(e);
      setStatus(`Lỗi: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!videoUrl || !videoRef.current || !metadata) return;
    setExporting(true); setExportProgress(0); setStatus('Đang nén video chất lượng HD...');
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const w = 1080; const h = 1920; canvas.width = w; canvas.height = h;
    const stream = canvas.captureStream(30);
    const audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    const videoSource = audioCtx.createMediaElementSource(video); videoSource.connect(dest);
    if (ttsUrl && audioRef.current) { const ttsSource = audioCtx.createMediaElementSource(audioRef.current); ttsSource.connect(dest); }
    
    const recorder = new MediaRecorder(new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]), { 
      mimeType: 'video/webm;codecs=vp9', 
      videoBitsPerSecond: 10000000 
    });
    const chunks: Blob[] = []; recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ViralVibe_PRO_${Date.now()}.mp4`; a.click();
      setExporting(false);
    };
    
    video.currentTime = 0; if (audioRef.current) audioRef.current.currentTime = 0;
    try { await video.play(); if (audioRef.current) await audioRef.current.play(); recorder.start(); } catch (e) { recorder.start(); }
    
    const renderLoop = () => {
      if (!exporting || video.paused || video.ended) { if (recorder.state === 'recording') recorder.stop(); return; }
      setExportProgress((video.currentTime / video.duration) * 100);
      ctx.save(); 
      const vRatio = video.videoWidth / video.videoHeight; 
      const targetW = h * vRatio; 
      ctx.drawImage(video, (w - targetW) / 2, 0, targetW, h); 
      ctx.restore();
      const sub = metadata.subtitles?.find(s => video.currentTime >= (s.start || 0) && video.currentTime <= (s.end || 0));
      if (sub) { 
        ctx.save(); 
        ctx.font = `900 85px "Be Vietnam Pro"`; 
        ctx.textAlign = 'center'; 
        ctx.shadowBlur = 15; 
        ctx.fillStyle = '#FE2C55'; 
        ctx.fillText(sub.text.toUpperCase(), w / 2, h * 0.73); 
        ctx.restore(); 
      }
      requestAnimationFrame(renderLoop);
    };
    renderLoop();
  };

  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const update = () => setCurrentTime(v.currentTime); v.addEventListener('timeupdate', update);
    return () => v.removeEventListener('timeupdate', update);
  }, [videoUrl]);

  const activeSubtitle = metadata?.subtitles?.find(s => currentTime >= (s.start || 0) && currentTime <= (s.end || 0));

  return (
    <div className={`min-h-screen bg-[#050505] text-white flex flex-col font-sans transition-all selection:bg-[#FE2C55] ${isFullscreen ? 'overflow-hidden' : ''}`}>
      {isFullscreen && (
        <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center p-0 animate-fade-in">
           <div className="absolute inset-0 overflow-hidden opacity-40 pointer-events-none">
             <video src={videoUrl!} autoPlay loop muted className="w-full h-full object-cover scale-150 blur-[100px]" />
           </div>
           <div className="relative h-full aspect-[9/16] bg-black shadow-[0_0_200px_rgba(254,44,85,0.4)] z-10">
            <video ref={videoRef} src={videoUrl!} autoPlay loop className="w-full h-full object-cover" />
            <div className="absolute inset-0 pointer-events-none p-8 lg:p-12 flex flex-col justify-end bg-gradient-to-t from-black/80 via-transparent to-transparent">
               <div className="flex justify-between items-end mb-16 animate-slide-up">
                 <div className="space-y-4 max-w-[80%]">
                    <p className="font-black text-2xl italic text-[#25F4EE] drop-shadow-lg">@ViralVibe_Studio</p>
                    <p className="text-lg font-medium leading-tight text-zinc-100">{metadata?.description}</p>
                    <div className="flex flex-wrap gap-2">
                       {metadata?.hashtags?.map((tag, i) => (
                         <span key={i} className="text-[#FE2C55] font-black text-lg drop-shadow-md">{tag}</span>
                       ))}
                    </div>
                 </div>
                 <div className="flex flex-col items-center gap-10 mb-6 pointer-events-auto">
                    <div className="flex flex-col items-center cursor-pointer group"><span className="text-5xl drop-shadow-xl">❤️</span><span className="text-xs font-black mt-1">2.8M</span></div>
                    <div className="flex flex-col items-center cursor-pointer group"><span className="text-5xl drop-shadow-xl">💬</span><span className="text-xs font-black mt-1">156K</span></div>
                 </div>
               </div>
               {activeSubtitle && (
                  <div className="absolute inset-x-0 bottom-[24%] text-center px-10">
                    <span className="bg-black/90 text-[#FE2C55] px-8 py-5 rounded-[2.5rem] font-black text-3xl uppercase border border-[#FE2C55]/30 inline-block animate-bounce shadow-2xl backdrop-blur-md">
                        {activeSubtitle.text}
                    </span>
                  </div>
               )}
            </div>
            <button onClick={() => setIsFullscreen(false)} className="absolute top-10 right-10 w-16 h-16 bg-black/60 rounded-full flex items-center justify-center text-3xl border border-white/20 hover:bg-[#FE2C55] transition-all z-20">✕</button>
          </div>
        </div>
      )}

      <nav className="p-6 border-b border-white/5 flex justify-between items-center bg-black/85 backdrop-blur-3xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#FE2C55] rounded-2xl flex items-center justify-center font-black italic rotate-3 shadow-[0_0_40px_rgba(254,44,85,0.4)]">V</div>
          <h1 className="text-2xl font-black italic uppercase tracking-tighter">ViralVibe <span className="text-[#25F4EE]">ULTRA</span></h1>
        </div>
        {!apiKeySelected && (
            <button onClick={handleSelectKey} className="bg-white text-black px-8 py-3 rounded-full font-black text-[10px] tracking-widest uppercase hover:bg-[#FE2C55] hover:text-white transition-all">KÍCH HOẠT ENGINE 🚀</button>
        )}
      </nav>

      <main className="flex-1 p-8 max-w-[1700px] mx-auto w-full grid grid-cols-1 lg:grid-cols-4 gap-12">
        <div className="lg:col-span-1 space-y-8 animate-fade-in-left">
           <section className="bg-zinc-900/30 p-8 rounded-[3rem] border border-white/5 shadow-2xl space-y-6">
             <h2 className="text-[10px] font-black uppercase text-[#FE2C55] tracking-widest">PHONG CÁCH RENDER</h2>
             <div className="grid grid-cols-1 gap-4">
               {VIDEO_TEMPLATES.map(t => (
                 <button key={t.id} onClick={() => setSelectedTemplate(t)} className={`flex flex-col gap-2 p-6 rounded-[2rem] border transition-all text-left ${selectedTemplate.id === t.id ? 'bg-white text-black border-white' : 'bg-black/40 border-white/5 opacity-70'}`}>
                   <span className="text-3xl">{t.icon}</span>
                   <span className="font-black text-xs uppercase mt-3">{t.label}</span>
                   <p className="text-[10px] opacity-60 leading-relaxed">{t.description}</p>
                 </button>
               ))}
             </div>
           </section>
        </div>

        <div className="lg:col-span-2 space-y-8 animate-fade-in">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <section className="bg-zinc-900/30 p-8 rounded-[3.5rem] border border-white/5 shadow-2xl space-y-6">
                 <h2 className="text-[10px] font-black uppercase text-[#25F4EE] tracking-widest">STUDIO TRUNG TÂM</h2>
                 <textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="w-full bg-black/60 border border-white/10 rounded-3xl px-6 py-5 outline-none font-bold text-sm min-h-[160px] focus:border-[#FE2C55]/50 transition-all" />
                 <div onClick={() => fileInputRef.current?.click()} className="relative border-2 border-dashed border-white/10 rounded-[2.5rem] p-10 text-center cursor-pointer hover:border-[#FE2C55]/50 transition-all bg-black/20 group">
                    {sourceImage ? <img src={sourceImage} className="max-h-56 mx-auto rounded-3xl shadow-2xl" alt="Start Frame" /> : <div className="opacity-20"><p className="text-5xl mb-4">🖼️</p><p className="font-black uppercase text-[10px]">TẢI ẢNH GỐC</p></div>}
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onloadend = () => setSourceImage(r.result as string); r.readAsDataURL(f); } }} />
                 </div>
              </section>
              <div className="flex flex-col gap-8">
                 <div className="relative group mx-auto w-full aspect-[9/16] bg-black rounded-[4rem] overflow-hidden border-[14px] border-zinc-900">
                    {videoUrl ? (
                       <>
                        <video ref={videoRef} src={videoUrl} loop muted className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-6">
                            <button onClick={() => setIsFullscreen(true)} className="bg-white text-black px-10 py-4 rounded-full font-black uppercase text-[10px] tracking-widest">THEATER MODE 🎬</button>
                        </div>
                       </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-6 opacity-10">
                        <div className="w-16 h-16 border-4 border-white rounded-full border-t-transparent animate-spin"></div>
                      </div>
                    )}
                 </div>
                 <button onClick={handleGenerate} disabled={loading || !sourceImage || !apiKeySelected} className="w-full py-8 bg-[#25F4EE] text-black rounded-[2.5rem] font-black text-xl uppercase shadow-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30">
                    {loading ? 'ĐANG XỬ LÝ...' : 'TẠO VIDEO 20S 🚀'}
                 </button>
              </div>
           </div>
        </div>

        <div className="lg:col-span-1 space-y-8 animate-fade-in-right">
           <section className="bg-zinc-900/30 p-8 rounded-[3rem] border border-white/5 shadow-2xl space-y-8">
             <h2 className="text-[10px] font-black uppercase text-[#25F4EE] tracking-widest">CẤU HÌNH VIRAL</h2>
             <div className="space-y-6">
                {metadata ? (
                  <div className="p-6 bg-black/40 rounded-3xl border border-white/5 text-center">
                    <span className="text-[9px] font-black uppercase opacity-40">CHỈ SỐ XU HƯỚNG</span>
                    <div className="text-5xl font-black italic text-[#FE2C55] mt-2">{metadata.viralScore}%</div>
                  </div>
                ) : <p className="opacity-10 text-center uppercase font-black text-[10px]">Đang chờ dữ liệu</p>}
                <div className="grid grid-cols-1 gap-2">
                   {AI_VOICES.map(v => (
                     <button key={v.id} onClick={() => setSelectedVoice(v.id)} className={`p-4 rounded-2xl border text-[10px] font-black transition-all ${selectedVoice === v.id ? 'bg-white text-black border-white' : 'bg-black/40 border-white/5 opacity-60'}`}>{v.label}</button>
                   ))}
                </div>
             </div>
             <button onClick={handleExport} disabled={exporting || !videoUrl} className="w-full py-8 bg-[#FE2C55] rounded-[2.5rem] font-black text-lg uppercase shadow-2xl hover:scale-[1.03] transition-all disabled:opacity-20 active:scale-95">
                {exporting ? `RENDER ${Math.round(exportProgress)}%` : 'TẢI MP4 PRO 📥'}
             </button>
           </section>
        </div>
      </main>

      {status && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 px-10 py-6 bg-black border border-[#25F4EE]/40 rounded-full text-[12px] font-black uppercase text-[#25F4EE] z-[300] flex items-center gap-6 animate-slide-up">
          <div className="w-2 h-2 rounded-full bg-[#25F4EE] animate-pulse"></div>
          <span className="max-w-[80vw] truncate">{status}</span>
        </div>
      )}

      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translate(-50%, 40px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeInLeft { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
        .animate-slide-up { animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-in { animation: fadeIn 0.8s ease-out forwards; }
        .animate-fade-in-left { animation: fadeInLeft 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        textarea { resize: none; }
      `}</style>
      {ttsUrl && <audio ref={audioRef} src={ttsUrl} className="hidden" />}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<ViralVibeApp />);
