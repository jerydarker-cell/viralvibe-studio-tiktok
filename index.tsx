
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
    prompt: 'Hyper-realistic vertical 9:16 cinematic video, TikTok trend aesthetic, ultra-sharp 4k details, high-impact visuals, vibrant lighting, fast-paced cinematic cuts.', 
    icon: '🔥', 
    description: 'Phong cách xu hướng mạnh mẽ, sắc nét.' 
  },
  { 
    id: 'ultra-real-portrait', 
    label: 'Siêu Thực 📸', 
    prompt: 'Hyper-realistic 8k vertical portrait photography, high-end fashion cinematography, visible skin texture, realistic hair, shallow depth of field, natural lighting.', 
    icon: '📸', 
    description: 'Chân thực đến từng lỗ chân lông.' 
  },
  { 
    id: 'street-pro-night', 
    label: 'Đêm Thành Phố 🌃', 
    prompt: 'Hyper-realistic night street view, neon light trails, 8k vertical video, wet pavement reflections, urban atmosphere, movie-like camera motion.', 
    icon: '🌃', 
    description: 'Không khí đô thị ban đêm rực rỡ neon.' 
  },
  { 
    id: 'premium-automotive', 
    label: 'Siêu Xe 🏎️', 
    prompt: 'Premium automotive cinematography, vertical 9:16, close-up luxury car details, sleek reflections, high-speed motion blur, cinematic masterpiece.', 
    icon: '🏎️', 
    description: 'Đẳng cấp và tốc độ.' 
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

/**
 * Cải thiện hàm parse JSON để tránh lỗi Unexpected end of input
 */
const parseSafeJson = (text: string | undefined): any => {
  if (!text || !text.trim()) {
    throw new Error("AI không trả về dữ liệu. Có thể do nội dung bị chặn bởi bộ lọc an toàn.");
  }

  let cleaned = text.trim();
  
  // Xử lý trường hợp AI trả về markdown block ```json ... ```
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/g, '');

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    // Thử parse trực tiếp nếu không tìm thấy cặp ngoặc (trường hợp API trả về JSON nguyên bản)
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      throw new Error("Không thể trích xuất JSON hợp lệ từ phản hồi AI.");
    }
  }

  const jsonContent = cleaned.substring(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(jsonContent);
  } catch (e) {
    console.error("Dữ liệu lỗi:", jsonContent);
    throw new Error("Dữ liệu AI trả về bị lỗi cấu trúc JSON.");
  }
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

  async function callWithRetry<T>(fn: () => Promise<T>, onRetry: (msg: string) => void, retries = 5): Promise<T> {
    let attempt = 0;
    while (attempt < retries) {
      try {
        return await fn();
      } catch (error: any) {
        attempt++;
        const errorMsg = error.message?.toLowerCase() || "";
        const isQuota = errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('limit');
        
        if (attempt >= retries) throw error;

        let delay = isQuota ? 100000 : 5000;
        
        if (isQuota) {
          onRetry(`Đã chạm ngưỡng hạn mức AI (429). Đang đợi reset...`);
          for (let i = Math.round(delay/1000); i > 0; i--) {
            setQuotaCountdown(i);
            await new Promise(r => setTimeout(r, 1000));
          }
          setQuotaCountdown(0);
        } else {
          onRetry(`Lỗi kết nối. Thử lại sau 5s...`);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }
    throw new Error("Hệ thống bận, vui lòng thử lại sau.");
  }

  const handleGenerate = async () => {
    if (!sourceImage) return;
    setLoading(true);
    setStatus('Đang phân tích kịch bản Viral TikTok...');
    setMetadata(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (ttsUrl) URL.revokeObjectURL(ttsUrl);
    setVideoUrl(null);
    setTtsUrl(null);

    try {
      const metaRes = await callWithRetry(async () => {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        return await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Create hyper-engaging TikTok viral content for: "${prompt}". 
          Include 3 catchy, curiosity-driven titles and a set of 5 trending hashtags.
          JSON Output ONLY: { 
            "catchyTitles": ["Title 1", "Title 2", "Title 3"], 
            "hashtags": ["tag1", "tag2"], 
            "description": "Short viral description",
            "viralScore": 98,
            "cta": "Like & Follow for more!",
            "subtitles": [{"text": "Bí mật đằng sau...", "start": 0, "end": 4}]
          }`,
          config: {
            responseMimeType: 'application/json',
            maxOutputTokens: 2048, // Đảm bảo không bị cắt cụt JSON
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

      // Sử dụng phản hồi văn bản một cách an toàn
      const metaText = metaRes.text;
      const meta: ViralMetadata = parseSafeJson(metaText);
      meta.subtitles = meta.subtitles?.map((s, i) => ({ ...s, id: `s-${i}` })) || [];
      setMetadata(meta);

      setStatus('Đang lồng tiếng AI theo xu hướng...');
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

      setStatus('Render Video Viral (Giai đoạn 1)...');
      let op = await callWithRetry(async () => {
        const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
        return await currentAi.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: `${selectedTemplate.prompt}. ${prompt}. Portrait 9:16 high quality.`,
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
        setStatus(`Mở rộng video thêm hấp dẫn (${i + 2}/3)...`);
        await new Promise(r => setTimeout(r, 5000));
        op = await callWithRetry(async () => {
          const currentAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
          return await currentAi.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: `Tiếp nối mạch truyện kịch tính cho video TikTok: ${prompt}.`,
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

      const dl = currentVideo?.uri;
      setStatus('Đang tải siêu phẩm TikTok...');
      const videoResp = await fetch(`${dl}&key=${process.env.API_KEY}`);
      const videoBlob = await videoResp.blob();
      setVideoUrl(URL.createObjectURL(videoBlob));
      setStatus('Sẵn sàng để Viral TikTok! 🔥');
    } catch (e: any) {
      console.error(e);
      setStatus(`Lỗi: ${e.message}`);
    } finally {
      setLoading(false);
      setQuotaCountdown(0);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setStatus('Đã sao chép nội dung!');
    setTimeout(() => setStatus(''), 2000);
  };

  const handleExport = async () => {
    if (!videoUrl || !videoRef.current || !metadata) return;
    setExporting(true); setExportProgress(0); setStatus('Đang tổng hợp video TikTok...');
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
      videoBitsPerSecond: 12000000 
    });
    const chunks: Blob[] = []; recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `TikTok_ViralVibe_${Date.now()}.mp4`; a.click();
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
        ctx.font = 'bold 90px "Anton"';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'black'; ctx.lineWidth = 15; ctx.strokeText(sub.text.toUpperCase(), w / 2, h * 0.76);
        ctx.fillStyle = '#FE2C55'; ctx.fillText(sub.text.toUpperCase(), w / 2, h * 0.76);
        ctx.restore();
      }
      ctx.textAlign = 'left'; ctx.fillStyle = 'white'; ctx.font = 'bold 50px "Be Vietnam Pro"';
      ctx.fillText('@ViralVibe_TikTok_AI', 60, h - 330);
      ctx.font = '38px "Be Vietnam Pro"'; ctx.fillText(metadata.hashtags.map(h => '#' + h).join(' '), 60, h - 240);
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
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-[#FE2C55]">
      <nav className="p-6 border-b border-white/5 flex justify-between items-center bg-black/80 backdrop-blur-2xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#FE2C55] rounded-2xl flex items-center justify-center font-black italic shadow-[0_0_35px_rgba(254,44,85,0.4)] text-xl">V</div>
          <h1 className="text-2xl font-black italic tracking-tighter uppercase">ViralVibe <span className="text-[#25F4EE]">TIKTOK</span></h1>
        </div>
        <div className="flex items-center gap-6">
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener" className="hidden md:block text-[10px] opacity-40 hover:opacity-100 underline uppercase tracking-widest">Nâng cấp quota 💳</a>
          <button onClick={() => window.aistudio?.openSelectKey?.()} className="bg-zinc-800 text-white px-5 py-2 rounded-full font-bold text-[9px] uppercase hover:bg-[#FE2C55] transition-all">ĐỔI ENGINE ⚡</button>
        </div>
      </nav>

      <main className="flex-1 p-8 max-w-[1750px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 relative">
        <div className="lg:col-span-4 space-y-8">
          <section className="bg-zinc-900/40 p-10 rounded-[3rem] border border-white/5 space-y-8 shadow-2xl relative overflow-hidden">
            <h2 className="text-[12px] font-black uppercase text-[#FE2C55] tracking-widest opacity-60">CẤU HÌNH TREND</h2>
            
            <div className="space-y-4">
              <label className="text-[11px] font-bold opacity-40 uppercase ml-2">CHỌN MẪU TIKTOK</label>
              <div className="grid grid-cols-2 gap-3">
                {VIDEO_TEMPLATES.map((t) => (
                  <button 
                    key={t.id} 
                    onClick={() => setSelectedTemplate(t)}
                    className={`p-4 rounded-2xl border text-left transition-all ${selectedTemplate.id === t.id ? 'bg-[#FE2C55] border-[#FE2C55] shadow-xl' : 'bg-black/40 border-white/5 hover:border-white/20'}`}
                  >
                    <div className="text-2xl mb-2">{t.icon}</div>
                    <div className="text-[10px] font-black uppercase">{t.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[11px] font-bold opacity-40 uppercase ml-2">MÔ TẢ NỘI DUNG</label>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-5 outline-none font-bold text-sm min-h-[80px] focus:border-[#FE2C55]/50 transition-all" placeholder="Ví dụ: Hoàng hôn Sài Gòn..." />
            </div>

            <div className="space-y-4">
              <label className="text-[11px] font-bold opacity-40 uppercase ml-2">ẢNH GỐC (REFERENCE)</label>
              <div onClick={() => fileInputRef.current?.click()} className="relative border-2 border-dashed border-white/10 rounded-2xl p-8 text-center cursor-pointer hover:border-[#FE2C55]/50 transition-all bg-black/20">
                {sourceImage ? <img src={sourceImage} className="max-h-32 mx-auto rounded-xl shadow-xl" alt="Preview" /> : <div className="opacity-20"><p className="text-4xl mb-2">📸</p><p className="font-black uppercase text-[9px]">Tải ảnh tham khảo</p></div>}
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onloadend = () => setSourceImage(r.result as string); r.readAsDataURL(f); } }} />
              </div>
            </div>

            <button onClick={handleGenerate} disabled={loading || !sourceImage} className="w-full py-7 bg-[#25F4EE] text-black rounded-2xl font-black text-lg uppercase shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20">
              {loading ? 'ĐANG XỬ LÝ...' : 'TẠO SIÊU PHẨM TIKTOK 🚀'}
            </button>

            {quotaCountdown > 0 && (
              <div className="absolute inset-0 bg-black/95 backdrop-blur-xl z-[100] flex flex-col items-center justify-center p-12 text-center animate-fade-in">
                <div className="w-40 h-40 relative mb-10">
                    <svg className="w-full h-full rotate-[-90deg]">
                        <circle cx="80" cy="80" r="72" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-white/5" />
                        <circle cx="80" cy="80" r="72" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-[#FE2C55]" strokeDasharray="452" strokeDashoffset={452 - (quotaCountdown / 100) * 452} />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center font-black text-5xl italic">{quotaCountdown}</div>
                </div>
                <h3 className="text-2xl font-black text-[#FE2C55] mb-4 uppercase italic">Chờ reset hạn mức</h3>
                <p className="text-[11px] opacity-40 mb-10 max-w-xs uppercase tracking-widest leading-loose">Hệ thống đang nghỉ ngơi để phục vụ bạn tốt hơn. Quá trình sẽ tự động tiếp tục.</p>
                <div className="px-8 py-3 bg-white/5 rounded-full text-[10px] font-black uppercase tracking-widest text-[#25F4EE] animate-pulse">Đang đợi API Gemini...</div>
              </div>
            )}
          </section>
        </div>

        <div className="lg:col-span-4 flex flex-col items-center">
          <div className="relative w-full max-w-[420px] aspect-[9/16] bg-black rounded-[4rem] overflow-hidden border-[12px] border-zinc-900 shadow-[0_0_100px_rgba(0,0,0,0.8)]">
             {videoUrl ? (
                <>
                 <video ref={videoRef} src={videoUrl} loop muted className="w-full h-full object-cover" />
                 {metadata?.subtitles.find(s => currentTime >= s.start && currentTime <= s.end) && (
                    <div className="absolute inset-x-8 bottom-[28%] text-center pointer-events-none">
                      <span className="bg-[#FE2C55] text-white px-6 py-3 rounded-xl font-black text-xs uppercase shadow-2xl border border-white/10 animate-bounce">
                        {metadata.subtitles.find(s => currentTime >= s.start && currentTime <= s.end)?.text}
                      </span>
                    </div>
                 )}
                </>
             ) : (
               <div className="w-full h-full flex flex-col items-center justify-center gap-6 opacity-5">
                 <div className="w-16 h-16 border-2 border-white rounded-full border-t-transparent animate-spin"></div>
                 <p className="font-black text-[11px] tracking-widest uppercase">ĐANG ĐỢI VIDEO</p>
               </div>
             )}
          </div>
          {videoUrl && <button onClick={handleExport} disabled={exporting} className="mt-8 w-full max-w-[420px] py-7 bg-[#FE2C55] rounded-2xl font-black text-lg uppercase shadow-lg hover:bg-white hover:text-black hover:scale-[1.02] transition-all disabled:opacity-20">{exporting ? `RENDER MP4 ${Math.round(exportProgress)}%` : 'XUẤT VIDEO LỒNG TIẾNG 📥'}</button>}
        </div>

        <div className="lg:col-span-4 space-y-8">
           <section className="bg-zinc-900/40 p-10 rounded-[3rem] border border-white/5 space-y-8 shadow-2xl h-full">
              <h2 className="text-[12px] font-black uppercase text-[#25F4EE] tracking-widest opacity-60">NỘI DUNG VIRAL</h2>
              {metadata ? (
                <div className="space-y-8 animate-fade-in">
                  <div className="space-y-4">
                    <label className="text-[11px] font-bold opacity-40 uppercase">TIÊU ĐỀ THU HÚT (CLICK COPY)</label>
                    {metadata.catchyTitles.map((title, i) => (
                      <div key={i} className="group relative flex items-center">
                        <div className="flex-1 bg-black/40 border border-white/10 rounded-xl px-5 py-4 font-bold text-xs truncate italic">{title}</div>
                        <button onClick={() => copyToClipboard(title)} className="absolute right-2 bg-white/5 p-2.5 rounded-lg hover:bg-[#25F4EE] hover:text-black transition-all">📋</button>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-4">
                    <label className="text-[11px] font-bold opacity-40 uppercase ml-2">BỘ HASHTAG TRENDING</label>
                    <div className="bg-black/40 border border-white/10 rounded-2xl p-6 flex flex-wrap gap-3">
                       {metadata.hashtags.map((tag, i) => <span key={i} className="text-[#25F4EE] font-black text-[11px] hover:text-white cursor-pointer" onClick={() => copyToClipboard(`#${tag}`)}>#{tag}</span>)}
                       <button onClick={() => copyToClipboard(metadata.hashtags.map(t => '#' + t).join(' '))} className="ml-auto text-[9px] opacity-40 underline uppercase">Copy tất cả</button>
                    </div>
                  </div>
                  <div className="p-8 bg-black/60 rounded-[2rem] border border-white/5 text-center shadow-inner">
                    <span className="text-[10px] font-black uppercase opacity-40 tracking-[0.3em]">Viral AI Score</span>
                    <div className="text-6xl font-black italic text-[#FE2C55] mt-4 shadow-sm">{metadata.viralScore}%</div>
                  </div>
                </div>
              ) : <div className="h-[400px] flex flex-col items-center justify-center opacity-10 gap-6"><p className="text-7xl">📈</p><p className="font-black text-xs uppercase tracking-[0.4em] text-center">Chờ phân tích xu hướng...</p></div>}
           </section>
        </div>
      </main>

      {status && !quotaCountdown && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 px-10 py-5 bg-black/90 border border-[#25F4EE]/30 rounded-full text-[10px] font-black uppercase text-[#25F4EE] z-[300] flex items-center gap-5 shadow-2xl backdrop-blur-3xl animate-slide-up">
          <div className="w-1.5 h-1.5 rounded-full bg-[#25F4EE] animate-pulse"></div>
          <span className="max-w-[70vw] truncate tracking-[0.2em]">{status}</span>
        </div>
      )}

      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translate(-50%, 30px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-slide-up { animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
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
