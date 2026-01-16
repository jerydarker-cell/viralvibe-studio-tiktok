
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

const VIDEO_TEMPLATES: VideoTemplate[] = [
  { 
    id: 'tiktok-viral-high', 
    label: 'TikTok Trend 🔥', 
    prompt: 'Hyper-realistic vertical 9:16 cinematic video, TikTok trend aesthetic, ultra-sharp 4k details, smooth motion, high-impact visuals, vibrant lighting.', 
    icon: '🔥', 
    description: 'Phong cách xu hướng mạnh mẽ, sắc nét.' 
  },
  { 
    id: 'ultra-real-portrait', 
    label: 'Siêu Thực 📸', 
    prompt: 'Hyper-realistic 8k vertical portrait, cinematic lighting, visible skin pores, realistic hair movement, shallow depth of field, high-end DSLR aesthetic, soft natural light, masterpiece.', 
    icon: '📸', 
    description: 'Chi tiết chân thực đến từng lỗ chân lông.' 
  },
  { 
    id: 'premium-product', 
    label: 'Sản Phẩm 💎', 
    prompt: 'Premium commercial vertical video, high-end product cinematography, macro details, luxury lighting, cinematic slow motion, reflections on sleek surfaces.', 
    icon: '💎', 
    description: 'Quảng cáo sản phẩm cao cấp, sang trọng.' 
  },
  { 
    id: 'street-cinematic', 
    label: 'Street Pro 🏙️', 
    prompt: 'Hyper-realistic street photography aesthetic, vertical video, 35mm lens look, natural city lighting, cinematic grain, candid realistic motion, 8k resolution.', 
    icon: '🏙️', 
    description: 'Nhiếp ảnh đường phố nghệ thuật, chân thực.' 
  },
  { 
    id: 'cyber-neon', 
    label: 'Cyber Neon 🚀', 
    prompt: 'Futuristic vertical cyberpunk video, neon light trails, hyper-realistic reflections on wet surfaces, futuristic tech elements, smooth robotic motion.', 
    icon: '🚀', 
    description: 'Tương lai, ánh sáng neon và công nghệ.' 
  },
  { 
    id: 'street-food-pov', 
    label: 'Street Food POV 🍜', 
    prompt: 'Hyper-realistic POV street food cooking video, close-up steam rising, sizzling sounds visual, vibrant colors of fresh ingredients, 9:16 vertical, food porn aesthetic.', 
    icon: '🍜', 
    description: 'Ẩm thực đường phố, chân thực từng hơi khói.' 
  },
  { 
    id: 'epic-drone', 
    label: 'Drone View 🚁', 
    prompt: 'Cinematic drone vertical 9:16 shot, sweeping landscapes, hyper-realistic terrain, smooth aerial motion, breathtaking scale, perfect exposure, golden hour.', 
    icon: '🚁', 
    description: 'Góc nhìn từ trên cao, hùng vĩ và mượt mà.' 
  },
  { 
    id: 'anime-realism', 
    label: 'Anime Dream 🌸', 
    prompt: 'Makoto Shinkai inspired hyper-realistic anime aesthetic, beautiful sky, cherry blossoms falling, nostalgic lighting, vertical 9:16 cinematic animation.', 
    icon: '🌸', 
    description: 'Hoạt hình nghệ thuật, thơ mộng.' 
  },
];

const AI_VOICES: { id: AIVoice, label: string }[] = [
  { id: 'Puck', label: 'Puck (Trẻ trung, Viral)' },
  { id: 'Kore', label: 'Kore (Mạnh mẽ, Cuốn hút)' },
  { id: 'Zephyr', label: 'Zephyr (Trầm ấm, Sâu sắc)' },
  { id: 'Charon', label: 'Charon (Nhẹ nhàng, Kể chuyện)' },
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

/**
 * Enhanced JSON repair specifically targeting Unicode escape issues and malformed backslashes.
 */
const parseSafeJson = (text: string): any => {
  let cleaned = text.trim();
  
  // Extract content between first { or [ and last } or ]
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let start = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) start = firstBrace;
  else if (firstBracket !== -1) start = firstBracket;

  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  let end = -1;
  if (lastBrace !== -1 && (lastBracket === -1 || lastBrace > lastBracket)) end = lastBrace;
  else if (lastBracket !== -1) end = lastBracket;

  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.substring(start, end + 1);
  }

  // Pre-cleaning: Fix common bad escape patterns
  // 1. Remove lone backslashes that are not escaping a valid character
  // 2. Fix malformed Unicode escapes (like \u followed by non-hex)
  const sanitize = (str: string) => {
    return str
      .replace(/\\u([0-9a-fA-F]{0,3})(?![0-9a-fA-F])/g, (match, p1) => p1) // Remove incomplete \u
      .replace(/\\([^"\\\/bfnrtu])/g, '$1') // Remove invalid single escapes
      .replace(/\\$/g, ''); // Remove trailing backslash
  };

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Try sanitized version
    try {
      return JSON.parse(sanitize(cleaned));
    } catch (e2) {
      // Last-ditch manual repair: balance brackets/braces
      let repaired = sanitize(cleaned);
      let stack: string[] = [];
      let inString = false;
      let escaped = false;
      let fixedText = "";
      for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        if (inString) {
          if (char === '\\' && !escaped) escaped = true;
          else if (char === '"' && !escaped) inString = false;
          else escaped = false;
          fixedText += char;
        } else {
          if (char === '"') {
            inString = true;
            fixedText += char;
          } else if (char === '{') {
            stack.push('}');
            fixedText += char;
          } else if (char === '[') {
            stack.push(']');
            fixedText += char;
          } else if (char === '}' || char === ']') {
            if (stack.length > 0 && stack[stack.length - 1] === char) {
              stack.pop();
              fixedText += char;
            }
          } else {
            fixedText += char;
          }
        }
      }
      if (inString) fixedText += '"';
      while (stack.length > 0) fixedText += stack.pop()!;
      
      try {
        return JSON.parse(fixedText);
      } catch (e3) {
        console.error("JSON Repair Failed:", e3);
        throw new Error("Dữ liệu AI trả về không hợp lệ.");
      }
    }
  }
};

async function callWithRetry<T>(fn: () => Promise<T>, onRetry: (msg: string) => void, retries = 5): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      const errorMsg = error.message?.toLowerCase() || "";
      const isQuota = errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('resource_exhausted') || errorMsg.includes('limit');
      
      if (attempt >= retries) throw error;

      let delay = isQuota ? 65000 * Math.pow(1.2, attempt - 1) : 5000;
      
      for (let i = Math.round(delay/1000); i > 0; i--) {
        onRetry(isQuota ? `⚠️ Đang chờ hạn mức AI reset: ${i}s...` : `🔄 Thử lại sau: ${i}s...`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  throw new Error("Không thể hoàn thành yêu cầu sau nhiều lần thử.");
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
  const [prompt, setPrompt] = useState<string>('Bối cảnh đêm Sài Gòn rực rỡ, ánh đèn neon phản chiếu trên phố');
  const [selectedTemplate, setSelectedTemplate] = useState<VideoTemplate>(VIDEO_TEMPLATES[0]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [selectedVoice, setSelectedVoice] = useState<AIVoice>('Puck');

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) setApiKeySelected(await window.aistudio.hasSelectedApiKey());
      else setApiKeySelected(!!process.env.API_KEY);
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
    setStatus('Khởi tạo kịch bản kịch tính...');
    setMetadata(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (ttsUrl) URL.revokeObjectURL(ttsUrl);
    setVideoUrl(null);
    setTtsUrl(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const metaRes = await callWithRetry(async () => {
        const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
        return await currentAi.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Create highly engaging TikTok viral metadata for: "${prompt}". 
          JSON Output ONLY: { 
            "catchyTitles": ["title1", "title2", "title3"], 
            "hashtags": ["tag1", "tag2"], 
            "description": "Engaging Vietnamese description", 
            "viralScore": 95, 
            "cta": "Like and follow!",
            "subtitles": [{"text": "Câu chuyện bắt đầu...", "start": 0, "end": 4}] 
          }. Important: Do not use invalid unicode or escape sequences. Output standard JSON.`,
          config: {
            responseMimeType: 'application/json',
            maxOutputTokens: 2048,
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                catchyTitles: { type: Type.ARRAY, items: { type: Type.STRING } },
                hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
                description: { type: Type.STRING },
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
                    } 
                  } 
                }
              },
              required: ["catchyTitles", "hashtags", "description", "viralScore", "cta", "subtitles"]
            }
          }
        });
      }, setStatus);

      const meta: ViralMetadata = parseSafeJson(metaRes.text || '{}');
      meta.subtitles = meta.subtitles?.map((s, i) => ({ ...s, id: `s-${i}` })) || [];
      setMetadata(meta);

      setStatus('Đang lồng tiếng với giọng đọc Viral...');
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

      setStatus('Đang render khung hình siêu thực (Phần 1/3)...');
      let op = await callWithRetry(async () => {
        const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
        return await currentAi.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: `${selectedTemplate.prompt}. ${prompt}. High fidelity portrait 9:16.`,
          image: { imageBytes: sourceImage.split(',')[1], mimeType: 'image/jpeg' },
          config: { resolution: '720p', aspectRatio: '9:16' }
        });
      }, setStatus);

      while (!op.done) {
        await new Promise(r => setTimeout(r, 12000));
        const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
        op = await currentAi.operations.getVideosOperation({ operation: op });
      }

      let currentVideo = op.response?.generatedVideos?.[0]?.video;
      if (!currentVideo) throw new Error("Render Video bị gián đoạn.");

      for (let i = 0; i < 2; i++) {
        setStatus(`Mở rộng nội dung siêu thực (${i + 2}/3)...`);
        await new Promise(r => setTimeout(r, 5000));
        op = await callWithRetry(async () => {
          const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
          return await currentAi.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: `Phần tiếp theo cực kỳ chân thực và cuốn hút: ${prompt}. Cinematic quality.`,
            video: currentVideo,
            config: { resolution: '720p', aspectRatio: '9:16' }
          });
        }, setStatus);

        while (!op.done) {
          await new Promise(r => setTimeout(r, 12000));
          const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
          op = await currentAi.operations.getVideosOperation({ operation: op });
        }
        if (op.response?.generatedVideos?.[0]?.video) currentVideo = op.response.generatedVideos[0].video;
      }

      const dl = currentVideo?.uri;
      setStatus('Đang tải siêu phẩm hoàn thiện...');
      const videoResp = await fetch(`${dl}&key=${process.env.API_KEY}`);
      const videoBlob = await videoResp.blob();
      setVideoUrl(URL.createObjectURL(videoBlob));
      setStatus('Sẵn sàng lan truyền! 🚀');
    } catch (e: any) {
      console.error(e);
      setStatus(`Lỗi: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setStatus('Đã sao chép!');
    setTimeout(() => setStatus(''), 2000);
  };

  const handleExport = async () => {
    if (!videoUrl || !videoRef.current || !metadata) return;
    setExporting(true); setExportProgress(0); setStatus('Đang đóng gói MP4 kèm lồng tiếng AI...');
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const w = 1080; const h = 1920; canvas.width = w; canvas.height = h;
    const stream = canvas.captureStream(30);
    
    const audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    const videoSource = audioCtx.createMediaElementSource(video); videoSource.connect(dest);
    if (ttsUrl && audioRef.current) { 
        const ttsSource = audioCtx.createMediaElementSource(audioRef.current); 
        ttsSource.connect(dest); 
    }
    
    const recorder = new MediaRecorder(new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]), { 
      mimeType: 'video/webm;codecs=vp9', 
      videoBitsPerSecond: 15000000 
    });
    
    const chunks: Blob[] = []; recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ViralVibe_AI_TikTok_${Date.now()}.mp4`; a.click();
      setExporting(false);
    };
    
    video.currentTime = 0; if (audioRef.current) audioRef.current.currentTime = 0;
    try { 
      await video.play(); 
      if (audioRef.current) await audioRef.current.play(); 
      recorder.start(); 
    } catch (e) { recorder.start(); }
    
    const renderLoop = () => {
      if (!exporting || video.paused || video.ended) { 
        if (recorder.state === 'recording') recorder.stop(); 
        return; 
      }
      setExportProgress((video.currentTime / video.duration) * 100);
      ctx.drawImage(video, 0, 0, w, h);
      
      const iconX = w - 130;
      const startY = h * 0.45;
      ctx.fillStyle = 'white'; ctx.font = '65px Arial'; ctx.textAlign = 'center';
      ctx.fillText('❤️', iconX, startY); ctx.font = '28px sans-serif'; ctx.fillText('Viral', iconX, startY + 50);
      ctx.font = '65px Arial'; ctx.fillText('💬', iconX, startY + 150); ctx.font = '28px sans-serif'; ctx.fillText('12.5K', iconX, startY + 200);
      ctx.font = '65px Arial'; ctx.fillText('↗️', iconX, startY + 300); ctx.font = '28px sans-serif'; ctx.fillText('Share', iconX, startY + 350);
      
      ctx.save();
      ctx.translate(iconX, h - 220);
      ctx.rotate((video.currentTime * 2) % (Math.PI * 2));
      ctx.beginPath(); ctx.arc(0, 0, 50, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fillStyle = 'white'; ctx.fill();
      ctx.restore();

      const sub = metadata.subtitles.find(s => video.currentTime >= s.start && video.currentTime <= s.end);
      if (sub) {
        ctx.save();
        ctx.font = 'bold 85px "Be Vietnam Pro"';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'black'; ctx.lineWidth = 18; ctx.strokeText(sub.text.toUpperCase(), w / 2, h * 0.76);
        ctx.fillStyle = '#FE2C55'; ctx.fillText(sub.text.toUpperCase(), w / 2, h * 0.76);
        ctx.restore();
      }

      ctx.textAlign = 'left'; ctx.fillStyle = 'white'; ctx.font = 'bold 50px "Be Vietnam Pro"';
      ctx.fillText('@ViralVibe_Studio_AI', 60, h - 330);
      ctx.font = '38px "Be Vietnam Pro"'; ctx.fillText(metadata.description.substring(0, 50) + '...', 60, h - 265);
      ctx.fillStyle = '#25F4EE'; ctx.fillText(metadata.hashtags.slice(0, 4).join(' '), 60, h - 200);
      
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
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans">
      <nav className="p-6 border-b border-white/5 flex justify-between items-center bg-black/80 backdrop-blur-2xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#FE2C55] rounded-2xl flex items-center justify-center font-black italic shadow-[0_0_35px_rgba(254,44,85,0.4)] text-xl">V</div>
          <h1 className="text-2xl font-black italic tracking-tighter uppercase">ViralVibe <span className="text-[#25F4EE]">ULTRA</span></h1>
        </div>
        {!apiKeySelected ? (
          <button onClick={handleSelectKey} className="bg-white text-black px-8 py-3 rounded-full font-black text-[10px] tracking-widest uppercase hover:bg-[#FE2C55] hover:text-white transition-all">KẾT NỐI AI 🔑</button>
        ) : (
          <button onClick={handleSelectKey} className="bg-zinc-800 text-white px-5 py-2 rounded-full font-bold text-[9px] uppercase hover:bg-[#FE2C55] transition-all">ĐỔI ENGINE ⚡</button>
        )}
      </nav>

      <main className="flex-1 p-8 max-w-[1750px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-4 space-y-8">
          <section className="bg-zinc-900/40 p-10 rounded-[4rem] border border-white/5 space-y-10 shadow-2xl overflow-hidden">
            <h2 className="text-[12px] font-black uppercase text-[#FE2C55] tracking-widest opacity-60">XÂY DỰNG TREND</h2>
            
            <div className="space-y-4">
              <label className="text-[11px] font-bold opacity-40 uppercase ml-2">CHỌN MẪU SIÊU THỰC</label>
              <div className="grid grid-cols-2 gap-3 max-h-[250px] overflow-y-auto p-2 scrollbar-hide">
                {VIDEO_TEMPLATES.map((t) => (
                  <button 
                    key={t.id} 
                    onClick={() => setSelectedTemplate(t)}
                    className={`p-4 rounded-3xl border text-left transition-all ${selectedTemplate.id === t.id ? 'bg-[#FE2C55] border-[#FE2C55] shadow-[0_0_20px_rgba(254,44,85,0.3)]' : 'bg-black/40 border-white/5 hover:border-white/20'}`}
                  >
                    <div className="text-2xl mb-2">{t.icon}</div>
                    <div className="text-[11px] font-black uppercase tracking-tight">{t.label}</div>
                    <div className="text-[9px] opacity-60 mt-1 leading-tight line-clamp-2">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[11px] font-bold opacity-40 uppercase ml-2">MÔ TẢ TREND</label>
              <textarea 
                value={prompt} 
                onChange={e => setPrompt(e.target.value)} 
                className="w-full bg-black/60 border border-white/10 rounded-3xl px-8 py-7 outline-none font-bold text-md min-h-[100px] focus:border-[#FE2C55]/50 transition-all placeholder-zinc-800" 
                placeholder="Ví dụ: Hoàng hôn rực rỡ trên bãi biển..." 
              />
            </div>

            <div className="space-y-4">
              <label className="text-[11px] font-bold opacity-40 uppercase ml-2">KHUNG HÌNH GỐC (AI REF)</label>
              <div onClick={() => fileInputRef.current?.click()} className="relative border-2 border-dashed border-white/10 rounded-[3rem] p-10 text-center cursor-pointer hover:border-[#FE2C55]/50 transition-all bg-black/20 group">
                {sourceImage ? <img src={sourceImage} className="max-h-40 mx-auto rounded-2xl shadow-2xl" alt="Preview" /> : <div className="opacity-20 group-hover:opacity-40 transition-all"><p className="text-5xl mb-4">📸</p><p className="font-black uppercase text-[10px]">Tải ảnh lên</p></div>}
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onloadend = () => setSourceImage(r.result as string); r.readAsDataURL(f); } }} />
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[11px] font-bold opacity-40 uppercase ml-2">GIỌNG ĐỌC AI</label>
              <div className="grid grid-cols-2 gap-4">
                {AI_VOICES.map(v => <button key={v.id} onClick={() => setSelectedVoice(v.id)} className={`p-4 rounded-3xl border text-[11px] font-black transition-all ${selectedVoice === v.id ? 'bg-white text-black border-white shadow-xl' : 'bg-black/40 border-white/5 opacity-50 hover:opacity-100'}`}>{v.label}</button>)}
              </div>
            </div>

            <button onClick={handleGenerate} disabled={loading || !sourceImage || !apiKeySelected} className="w-full py-9 bg-[#25F4EE] text-black rounded-[3rem] font-black text-xl uppercase shadow-[0_20px_60px_rgba(37,244,238,0.3)] hover:scale-[1.03] active:scale-95 transition-all disabled:opacity-20">
              {loading ? 'HỆ THỐNG ĐANG RENDER...' : 'BẮT ĐẦU TẠO TREND 🚀'}
            </button>
          </section>
        </div>

        <div className="lg:col-span-4 flex flex-col items-center">
          <div className="relative group w-full max-w-[420px] aspect-[9/16] bg-black rounded-[5rem] overflow-hidden border-[15px] border-zinc-900 shadow-[0_0_120px_rgba(0,0,0,0.8)]">
             {videoUrl ? (
                <>
                 <video ref={videoRef} src={videoUrl} loop muted className="w-full h-full object-cover" />
                 {metadata?.subtitles.find(s => currentTime >= s.start && currentTime <= s.end) && (
                    <div className="absolute inset-x-8 bottom-[28%] text-center pointer-events-none animate-bounce">
                      <span className="bg-[#FE2C55] text-white px-8 py-4 rounded-2xl font-black text-sm uppercase shadow-2xl border border-white/10">
                        {metadata.subtitles.find(s => currentTime >= s.start && currentTime <= s.end)?.text}
                      </span>
                    </div>
                 )}
                </>
             ) : (
               <div className="w-full h-full flex flex-col items-center justify-center gap-10 opacity-5">
                 <div className="w-20 h-20 border-4 border-white rounded-full border-t-transparent animate-spin"></div>
                 <p className="font-black text-[13px] tracking-[0.3em] uppercase">ĐANG ĐỢI NỘI DUNG</p>
               </div>
             )}
          </div>
          {videoUrl && <button onClick={handleExport} disabled={exporting} className="mt-10 w-full max-w-[420px] py-9 bg-[#FE2C55] rounded-[3rem] font-black text-xl uppercase shadow-[0_20px_60px_rgba(254,44,85,0.3)] hover:bg-white hover:text-black hover:scale-[1.03] transition-all active:scale-95 disabled:opacity-20">{exporting ? `RENDER MP4 ${Math.round(exportProgress)}%` : 'XUẤT VIDEO LỒNG TIẾNG AI 📥'}</button>}
        </div>

        <div className="lg:col-span-4 space-y-8">
           <section className="bg-zinc-900/40 p-10 rounded-[4rem] border border-white/5 space-y-10 shadow-2xl h-full">
              <h2 className="text-[12px] font-black uppercase text-[#25F4EE] tracking-widest opacity-60">DỮ LIỆU VIRAL</h2>
              {metadata ? (
                <div className="space-y-10 animate-fade-in">
                  <div className="space-y-4">
                    <label className="text-[11px] font-bold opacity-40 uppercase">TIÊU ĐỀ XU HƯỚNG (CLICK ĐỂ COPY)</label>
                    {metadata.catchyTitles.map((title, i) => (
                      <div key={i} className="group relative flex items-center">
                        <div className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-5 py-4 font-bold text-sm truncate">{title}</div>
                        <button onClick={() => copyToClipboard(title)} className="absolute right-3 bg-white/10 p-3 rounded-xl hover:bg-[#25F4EE] hover:text-black transition-all">📋</button>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-4">
                    <label className="text-[11px] font-bold opacity-40 uppercase ml-2">HASHTAGS LAN TRUYỀN</label>
                    <div className="bg-black/40 border border-white/10 rounded-3xl p-6 flex flex-wrap gap-3">
                       {metadata.hashtags.map((tag, i) => <span key={i} className="text-[#25F4EE] font-black text-xs hover:text-white cursor-pointer" onClick={() => copyToClipboard(`#${tag}`)}>#{tag}</span>)}
                    </div>
                  </div>
                  <div className="p-8 bg-black/60 rounded-[3rem] border border-white/5 text-center">
                    <span className="text-[11px] font-black uppercase opacity-40">CHỈ SỐ VIRAL AI</span>
                    <div className="text-6xl font-black italic text-[#FE2C55] mt-4">{metadata.viralScore}%</div>
                  </div>
                </div>
              ) : <div className="h-[400px] flex flex-col items-center justify-center opacity-10 gap-6"><p className="text-8xl">📊</p><p className="font-black text-sm uppercase tracking-widest text-center">Đang phân tích xu hướng...</p></div>}
           </section>
        </div>
      </main>

      {status && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 px-10 py-5 bg-black/90 border border-[#25F4EE]/30 rounded-full text-[12px] font-black uppercase text-[#25F4EE] z-[300] flex items-center gap-5 shadow-2xl backdrop-blur-3xl animate-slide-up">
          <div className="w-2.5 h-2.5 rounded-full bg-[#25F4EE] animate-pulse"></div>
          <span className="max-w-[70vw] truncate tracking-wide">{status}</span>
        </div>
      )}

      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translate(-50%, 30px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-slide-up { animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-in { animation: fadeIn 0.8s ease-out forwards; }
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
