
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality, GenerateContentResponse } from '@google/genai';

// --- Global Type Declarations ---
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

// --- Constants & Types ---
type ScriptBeatType = 'HOOK' | 'BODY' | 'PAYOFF' | 'CTA';
type TemplateType = 'hyper' | 'product' | 'story' | 'cinematic' | 'fashion' | 'cartoon';
type AnimationType = 'none' | 'wiggle' | 'pulse';

interface Template {
  id: TemplateType;
  label: string;
  description: string;
  previewColor: string;
  systemPrompt: string;
}

const TEMPLATES: Template[] = [
  { id: 'cartoon', label: 'Cartoon Game', description: 'Phong cách hoạt hình 3D, màu sắc rực rỡ, chuyển động vui nhộn.', previewColor: '#f472b6', systemPrompt: "Focus on 3D kids animation style, vibrant high-saturation colors, bouncy character physics, simple rounded shapes, clay-like textures, and cheerful arcade-game aesthetics." },
  { id: 'hyper', label: 'Siêu Thực', description: 'CGI siêu thực, độ phân giải cao, ánh sáng điện ảnh.', previewColor: '#6366f1', systemPrompt: "Focus on hyper-realistic CGI, 8k resolution, cinematic lighting, photorealistic textures, and fluid physics." },
  { id: 'product', label: 'Quảng Cáo SP', description: 'Góc quay macro, tập trung vào chi tiết và chuyển động mượt mà.', previewColor: '#f59e0b', systemPrompt: "Focus on commercial product cinematography, macro shots, clean backgrounds, glossy surfaces, and professional studio lighting." },
  { id: 'fashion', label: 'Thời Trang', description: 'Ánh sáng nghệ thuật, chuyển động sang trọng.', previewColor: '#8b5cf6', systemPrompt: "Focus on high-fashion accessory advertising: soft diffused lighting, elegant slow-motion, and sophisticated luxury brand grading." },
  { id: 'story', label: 'Viral Story', description: 'Tông màu ấm, góc quay POV cảm xúc.', previewColor: '#ec4899', systemPrompt: "Focus on storytelling, emotional transitions, human-centric angles, and warm color grading." },
  { id: 'cinematic', label: 'Điện Ảnh', description: 'Góc quay rộng, kịch tính Hollywood.', previewColor: '#10b981', systemPrompt: "Focus on epic scale, anamorphic flares, high contrast, and dramatic camera pans." }
];

const AI_VOICES = [
  { id: 'Puck', name: 'Puck', label: 'Nam (Trầm, Tin cậy)' },
  { id: 'Kore', name: 'Kore', label: 'Nữ (Ngọt ngào, Truyền cảm)' },
  { id: 'Zephyr', name: 'Zephyr', label: 'Nam (Trẻ trung, Năng động)' },
  { id: 'Charon', name: 'Charon', label: 'Nam (Trang trọng, Kể chuyện)' },
  { id: 'Fenrir', name: 'Fenrir', label: 'Nam (Mạnh mẽ, Uy lực)' },
  { id: 'Aoife', name: 'Aoife', label: 'Nữ (Vui vẻ, Nhiệt huyết)' },
];

interface ScriptBeat {
  id: string;
  start: number;
  end: number;
  type: ScriptBeatType;
  text: string;
  description: string;
}

interface ViralMetadata {
  description: string;
  hashtags: string[];
  scriptBeats: ScriptBeat[];
  visualPrompt: string;
}

interface SourceAsset { id: string; data: string; prompt: string; styleRef?: string; }
interface BatchVideoResult {
  id: string;
  sourceImage: string;
  videoUrl: string;
  rawVideoUri: string; // Original Gemini URI
  ttsUrl: string | null;
  ttsBase64: string | null; // For sending to server
  metadata: ViralMetadata;
}

// --- Helper Functions ---
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 4, initialDelay = 3000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try { return await fn(); } catch (err: any) {
      lastError = err;
      if ((err.message?.includes('429')) && i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, initialDelay * Math.pow(2, i)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

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
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

const ViralVibeApp: React.FC = () => {
  const [sourceAssets, setSourceAssets] = useState<SourceAsset[]>([]);
  const [batchResults, setBatchResults] = useState<BatchVideoResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [activeTemplate, setActiveTemplate] = useState<Template>(TEMPLATES[0]);
  const [selectedVoice, setSelectedVoice] = useState(AI_VOICES[0]);
  const [currentTime, setCurrentTime] = useState(0);
  const [animType, setAnimType] = useState<AnimationType>('pulse');
  const [animIntensity, setAnimIntensity] = useState(5);
  const [animSpeed, setAnimSpeed] = useState(1);
  const [customAudioUrl, setCustomAudioUrl] = useState<string | null>(null);
  const [customAudioBase64, setCustomAudioBase64] = useState<string | null>(null);
  const [audioSource, setAudioSource] = useState<'ai' | 'custom'>('ai');

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const customAudioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('viral_vibe_project');
    if (saved) {
      const parsed = JSON.parse(saved);
      setSourceAssets(parsed.assets || []);
      setBatchResults(parsed.results || []);
    }
    window.aistudio?.hasSelectedApiKey().then(setHasApiKey);
  }, []);

  const saveProject = () => {
    localStorage.setItem('viral_vibe_project', JSON.stringify({ assets: sourceAssets, results: batchResults }));
    setStatus('Đã lưu dự án!');
    setTimeout(() => setStatus(''), 2000);
  };

  const clearProject = () => {
    if (confirm('Xóa dự án hiện tại?')) {
      localStorage.removeItem('viral_vibe_project');
      setSourceAssets([]);
      setBatchResults([]);
      setCustomAudioUrl(null);
      setCustomAudioBase64(null);
      setStatus('Đã xóa.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAssets = await Promise.all(files.map(file => new Promise<SourceAsset>((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve({ id: Math.random().toString(36).substr(2, 9), data: ev.target?.result as string, prompt: '' });
      reader.readAsDataURL(file);
    })));
    setSourceAssets(prev => [...prev, ...newAssets]);
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = (ev.target?.result as string).split(',')[1];
        setCustomAudioBase64(base64);
      };
      reader.readAsDataURL(file);

      const url = URL.createObjectURL(file);
      setCustomAudioUrl(url);
      setAudioSource('custom');
      setStatus('Đã tải âm thanh riêng!');
    }
  };

  const handleGenerateBatch = async () => {
    if (sourceAssets.length === 0) return;
    setLoading(true); setBatchResults([]);
    const results: BatchVideoResult[] = [];

    for (let i = 0; i < sourceAssets.length; i++) {
      const asset = sourceAssets[i];
      setStatus(`[${i+1}/${sourceAssets.length}] Đang kịch bản & lồng tiếng...`);
      
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const scriptRes = await withRetry(async () => {
          return await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: `Tạo kịch bản TikTok 20s cho mẫu "${activeTemplate.label}". Mô tả ảnh: "${asset.prompt || 'Chưa có mô tả'}". 
            TRẢ VỀ JSON CHUẨN:
            {
              "description": "Caption thu hút", "hashtags": ["#viral", "#trending"],
              "scriptBeats": [
                {"type": "HOOK", "start": 0, "end": 4, "text": "Lời hook", "description": "Gây ấn tượng đầu"},
                {"type": "BODY", "start": 4, "end": 14, "text": "Lời nội dung chính", "description": "Diễn đạt giá trị"},
                {"type": "PAYOFF", "start": 14, "end": 17, "text": "Kết quả", "description": "Điểm cao trào"},
                {"type": "CTA", "start": 17, "end": 20, "text": "Lời kêu gọi", "description": "Kêu gọi tương tác"}
              ],
              "visualPrompt": "Mô tả cảnh quay chi tiết cho AI tạo video (nhớ nhấn mạnh thời gian 20s)"
            }`,
            config: { systemInstruction: `${activeTemplate.systemPrompt}. Hãy đảm bảo kịch bản 20 giây và đồng bộ hoàn hảo.` }
          });
        });

        const meta: ViralMetadata = JSON.parse(scriptRes.text!.match(/\{[\s\S]*\}/)?.[0] || '{}');
        const fullText = meta.scriptBeats.map(b => b.text).join('. ');
        
        const ttsRes = await withRetry(async () => {
          return await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: [{ parts: [{ text: fullText }] }],
            config: { 
              responseModalities: [Modality.AUDIO], 
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice.id } } } 
            }
          });
        });
        
        const b64Audio = ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
        let ttsUrlLocal = null;
        if (b64Audio) {
          const audioCtx = new AudioContext({ sampleRate: 24000 });
          const buffer = await decodeAudioData(decode(b64Audio), audioCtx, 24000, 1);
          const wavBlob = await new Promise<Blob>((resolve) => {
            const worker = new Worker(URL.createObjectURL(new Blob([`
              onmessage = (e) => {
                const {buffer, length, sampleRate} = e.data;
                const view = new DataView(new ArrayBuffer(44 + length * 2));
                view.setUint32(0, 0x46464952, true); view.setUint32(4, 36 + length * 2, true); view.setUint32(8, 0x45564157, true);
                view.setUint32(12, 0x20746d66, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
                view.setUint32(24, sampleRate, true); view.setUint32(32, 2, true); view.setUint16(34, 16, true);
                view.setUint32(36, 0x61746164, true); view.setUint32(40, length * 2, true);
                for (let i = 0; i < length; i++) view.setInt16(44 + i * 2, buffer[i] * 0x7FFF, true);
                postMessage(new Blob([view], {type: 'audio/wav'}));
              };
            `], {type: 'application/javascript'})));
            worker.onmessage = (e) => resolve(e.data as Blob);
            worker.postMessage({buffer: buffer.getChannelData(0), length: buffer.length, sampleRate: buffer.sampleRate});
          });
          ttsUrlLocal = URL.createObjectURL(wavBlob);
        }

        setStatus(`[${i+1}/${sourceAssets.length}] Đang tạo video 20s...`);
        let op = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: meta.visualPrompt,
          image: { imageBytes: asset.data.split(',')[1], mimeType: 'image/png' },
          config: { resolution: '720p', aspectRatio: '9:16', numberOfVideos: 1 }
        });

        while (!op.done) {
          await new Promise(r => setTimeout(r, 10000));
          op = await ai.operations.getVideosOperation({ operation: op });
        }

        const rawUri = op.response?.generatedVideos?.[0]?.video?.uri || "";
        const videoResp = await fetch(`${rawUri}&key=${process.env.API_KEY}`);
        const videoUrlLocal = URL.createObjectURL(await videoResp.blob());

        results.push({ 
          id: `vid-${Date.now()}-${i}`, 
          sourceImage: asset.data, 
          videoUrl: videoUrlLocal, 
          rawVideoUri: rawUri,
          ttsUrl: ttsUrlLocal, 
          ttsBase64: b64Audio,
          metadata: meta 
        });
        setBatchResults([...results]);
        if (i === 0) setCurrentIndex(0);

      } catch (err: any) { setStatus(`Lỗi video ${i+1}: ${err.message}`); }
    }
    setLoading(false); setStatus('Sẵn sàng! 🔥');
  };

  const handleFullExport = async () => {
    const res = batchResults[currentIndex];
    if (!res) return;
    setExporting(true); setStatus('Đang tối ưu & ghép video (Siêu Tốc)...');

    const srt = res.metadata.scriptBeats.map((s, i) => {
      const formatTime = (seconds: number) => {
        const d = new Date(0); d.setSeconds(seconds);
        return d.toISOString().substr(11, 8) + ',' + (Math.floor((seconds % 1) * 1000)).toString().padStart(3, '0');
      };
      return `${i+1}\n${formatTime(s.start)} --> ${formatTime(s.end)}\n${s.text}\n`;
    }).join('\n');

    try {
      // We send the raw video URI and the audio as base64 for maximum server performance
      const response = await fetch('/api/export-full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          rawVideoUri: res.rawVideoUri, 
          audioBase64: audioSource === 'ai' ? res.ttsBase64 : customAudioBase64,
          srt, 
          filename: `ViralVibe_TikTok_Full_${Date.now()}.mp4` 
        })
      });

      if (!response.ok) throw new Error('Xuất video thất bại.');
      const blob = await response.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `ViralVibe_TikTok_${currentIndex}.mp4`; a.click();
      setStatus('Tải video thành công! ✨');
    } catch (e: any) { setStatus(`Lỗi Export: ${e.message}`); } 
    finally { setExporting(false); }
  };

  const syncPlayback = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    setCurrentTime(v.currentTime);
    const audio = audioSource === 'ai' ? audioRef.current : customAudioRef.current;
    if (audio && Math.abs(audio.currentTime - v.currentTime) > 0.1) audio.currentTime = v.currentTime;
  }, [audioSource]);

  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    v.addEventListener('timeupdate', syncPlayback);
    v.addEventListener('play', () => (audioSource === 'ai' ? audioRef : customAudioRef).current?.play());
    v.addEventListener('pause', () => (audioSource === 'ai' ? audioRef : customAudioRef).current?.pause());
    return () => v.removeEventListener('timeupdate', syncPlayback);
  }, [currentIndex, batchResults, audioSource, syncPlayback]);

  const cur = batchResults[currentIndex];
  const activeBeat = cur?.metadata.scriptBeats.find(b => currentTime >= b.start && currentTime <= b.end);

  return (
    <div className="min-h-screen bg-[#020202] text-white font-['Be_Vietnam_Pro'] flex flex-col selection:bg-[#FE2C55]/30">
      <style>{`
        @keyframes wiggle { 0% { transform: rotate(-1deg); } 100% { transform: rotate(1deg); } }
        @keyframes pulse { 0% { transform: scale(0.99); } 100% { transform: scale(1.01); } }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .timeline-track { position: relative; height: 10px; background: rgba(255,255,255,0.05); border-radius: 5px; overflow: hidden; }
        .timeline-beat { position: absolute; height: 100%; top: 0; opacity: 0.2; }
        .timeline-beat.active { opacity: 1; filter: brightness(1.3); }
      `}</style>

      <nav className="p-4 border-b border-white/5 bg-black/50 backdrop-blur-3xl sticky top-0 z-[200] flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-black uppercase tracking-tighter">ViralVibe <span className="text-[#FE2C55]">V3.5</span></h1>
          <div className="flex gap-2">
            <button onClick={saveProject} className="text-[9px] font-bold bg-white/5 px-2 py-1 rounded hover:bg-white/10">LƯU</button>
            <button onClick={clearProject} className="text-[9px] font-bold bg-white/5 px-2 py-1 rounded text-red-400">XÓA</button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <select value={selectedVoice.id} onChange={(e) => setSelectedVoice(AI_VOICES.find(v=>v.id===e.target.value)!)} className="bg-transparent text-[10px] font-bold outline-none border border-white/10 rounded px-2 py-1">
            {AI_VOICES.map(v => <option key={v.id} value={v.id} className="bg-zinc-900">{v.label}</option>)}
          </select>
          {!hasApiKey && <button onClick={() => window.aistudio?.openSelectKey()} className="bg-[#FE2C55] px-3 py-1 rounded-full text-[10px] font-black">API KEY</button>}
        </div>
      </nav>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 max-w-[1700px] mx-auto w-full overflow-hidden">
        <div className="lg:col-span-3 space-y-6 overflow-y-auto pr-2 scrollbar-hide">
          <section className="bg-zinc-900/30 p-4 rounded-2xl border border-white/5 space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Mẫu AI</h3>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => setActiveTemplate(t)} className={`p-2 rounded-xl border text-[9px] font-bold uppercase ${activeTemplate.id === t.id ? 'bg-white/10 border-white/20' : 'bg-white/5 border-transparent opacity-50'}`}>
                  <div className="w-full h-1 rounded-full mb-1" style={{ background: t.previewColor }} />
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <section className="bg-zinc-900/30 p-4 rounded-2xl border border-white/5 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Nguồn Ảnh</h3>
            <div className="space-y-3">
              {sourceAssets.map(a => (
                <div key={a.id} className="p-2 bg-white/5 rounded-xl border border-white/5 flex gap-3 relative group">
                  <img src={a.data} className="w-12 h-16 object-cover rounded shadow-lg" />
                  <textarea value={a.prompt} onChange={(e) => setSourceAssets(p => p.map(x=>x.id===a.id?{...x,prompt:e.target.value}:x))} className="flex-1 bg-transparent text-[10px] resize-none outline-none" placeholder="Mô tả cho AI..." />
                  <button onClick={()=>setSourceAssets(p=>p.filter(x=>x.id!==a.id))} className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 text-[8px]">✕</button>
                </div>
              ))}
              <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileChange} />
              <button onClick={() => fileInputRef.current?.click()} className="w-full py-6 border-2 border-dashed border-white/5 rounded-2xl text-[9px] font-black uppercase opacity-30 hover:opacity-100 bg-white/5">+ THÊM ẢNH</button>
            </div>
          </section>

          <section className="bg-zinc-900/30 p-4 rounded-2xl border border-white/5 space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Âm Thanh</h3>
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/5">
              <button onClick={()=>setAudioSource('ai')} className={`flex-1 py-2 rounded-lg text-[9px] font-bold uppercase ${audioSource==='ai'?'bg-white text-black':'opacity-40'}`}>AI TTS</button>
              <button onClick={()=>setAudioSource('custom')} className={`flex-1 py-2 rounded-lg text-[9px] font-bold uppercase ${audioSource==='custom'?'bg-white text-black':'opacity-40'}`}>AUDIO RIÊNG</button>
            </div>
            {audioSource === 'custom' && (
              <div className="space-y-2">
                <input type="file" className="hidden" ref={audioInputRef} onChange={handleAudioUpload} accept="audio/*" />
                <button onClick={() => audioInputRef.current?.click()} className="w-full py-2 bg-white/5 rounded-lg text-[8px] font-black uppercase opacity-60">
                  {customAudioUrl ? 'ĐÃ CÓ FILE' : 'TẢI FILE'}
                </button>
              </div>
            )}
          </section>

          <button onClick={handleGenerateBatch} disabled={loading || sourceAssets.length === 0} className="w-full py-4 bg-gradient-to-r from-[#FE2C55] to-[#FF4D72] text-white rounded-2xl font-black uppercase shadow-xl hover:scale-[1.02] active:scale-95 disabled:opacity-20 transition-all">
            BẮT ĐẦU TẠO VIDEO 🚀
          </button>
        </div>

        <div className="lg:col-span-5 flex flex-col items-center justify-center">
          <div className="relative w-full max-w-[340px] aspect-[9/16] bg-zinc-950 rounded-[2.5rem] border-[8px] border-zinc-900 shadow-2xl overflow-hidden">
            {cur ? (
              <>
                <video ref={videoRef} key={cur.videoUrl} src={cur.videoUrl} loop playsInline className="w-full h-full object-cover" />
                {activeBeat && (
                  <div className="absolute bottom-[20%] w-full px-6 text-center pointer-events-none">
                    <span className="text-white font-[900] text-2xl uppercase italic tracking-tighter block" style={{ animation: `${animType} ${animSpeed}s infinite alternate`, WebkitTextStroke: '4px black', paintOrder: 'stroke fill', filter: `drop-shadow(0 0 ${animIntensity}px #FE2C55)` }}>
                      {activeBeat.text}
                    </span>
                  </div>
                )}
              </>
            ) : <div className="w-full h-full flex flex-col items-center justify-center opacity-10 text-[9px] font-black uppercase tracking-widest">Đang Chờ Kịch Bản</div>}
            
            {loading && (
              <div className="absolute inset-0 bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center space-y-6">
                <div className="w-12 h-12 border-4 border-[#FE2C55]/20 border-t-[#FE2C55] rounded-full animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-widest text-[#FE2C55]">{status}</p>
              </div>
            )}
          </div>

          {cur && (
            <div className="w-full max-w-[340px] mt-6 space-y-4">
              <div className="timeline-track">
                {cur.metadata.scriptBeats.map(b => (
                  <div key={b.id} className={`timeline-beat ${activeBeat?.id === b.id ? 'active' : ''}`} style={{ left: `${(b.start/20)*100}%`, width: `${((b.end-b.start)/20)*100}%`, background: b.type==='HOOK'?'#FE2C55':'#4B0082' }} />
                ))}
                <div className="absolute top-0 bottom-0 w-px bg-white z-10" style={{ left: `${(currentTime/20)*100}%` }} />
              </div>
              <button onClick={handleFullExport} disabled={exporting} className="w-full py-4 bg-white text-black rounded-xl font-black uppercase text-[10px] shadow-lg flex items-center justify-center gap-2">
                {exporting ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : 'TẢI VIDEO ĐẦY ĐỦ 📥'}
              </button>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6 overflow-y-auto scrollbar-hide">
          <section className="bg-zinc-900/30 p-6 rounded-[2rem] border border-white/5 h-full space-y-6">
            <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Hiệu Ứng Subtitle</h3>
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/5">
              {(['none', 'wiggle', 'pulse'] as AnimationType[]).map(t => (
                <button key={t} onClick={()=>setAnimType(t)} className={`flex-1 py-2 rounded-lg text-[9px] font-bold uppercase ${animType===t?'bg-white text-black':'opacity-40'}`}>{t}</button>
              ))}
            </div>
            {cur && (
              <div className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Kịch Bản Phân Khúc</h3>
                {cur.metadata.scriptBeats.map(b => (
                  <div key={b.id} className={`p-4 rounded-xl border transition-all ${activeBeat?.id === b.id ? 'bg-[#FE2C55]/10 border-[#FE2C55]' : 'bg-white/5 border-transparent opacity-30'}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[8px] font-black uppercase">{b.type}</span>
                      <span className="text-[8px] opacity-40">{b.start}s - {b.end}s</span>
                    </div>
                    <p className="text-xs font-bold leading-tight">{b.text}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {status && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-2 bg-black/90 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-widest z-[300] shadow-2xl flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-[#FE2C55] animate-ping" />
          {status}
        </div>
      )}

      <audio ref={audioRef} src={cur?.ttsUrl || ''} className="hidden" crossOrigin="anonymous" />
      <audio ref={customAudioRef} src={customAudioUrl || ''} className="hidden" crossOrigin="anonymous" />
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<ViralVibeApp />);
