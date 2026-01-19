
import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality } from '@google/genai';

// --- Global Type Declarations ---
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    // Fix: Added optional modifier to match existing global definitions which might have it
    aistudio?: AIStudio;
  }
}

// --- Constants & Types ---
type ExportMode = 'burn' | 'soft';
type ScriptBeatType = 'HOOK' | 'BODY' | 'PAYOFF' | 'CTA';

interface ViralCaption {
  style: string;
  text: string;
}

interface ViralMetadata {
  catchyTitles: string[];
  hashtags: string[];
  description: string;
  viralCaptions: ViralCaption[];
  subtitles: { id: string; text: string; start: number; end: number }[];
  scriptBeats: { id: string; start: number; end: number; type: ScriptBeatType; description: string }[];
  visualPrompt: string; 
}

interface SourceAsset { id: string; data: string; prompt: string; }
interface BatchVideoResult {
  id: string;
  sourceImage: string;
  videoUrl: string;
  ttsUrl: string | null;
  metadata: ViralMetadata;
}

const AI_VOICES = [
  { id: 'Puck', name: 'Puck', label: 'Puck (Nam)' },
  { id: 'Kore', name: 'Kore', label: 'Kore (Nữ)' },
  { id: 'Zephyr', name: 'Zephyr', label: 'Zephyr (Nam)' },
];

// --- Helper Functions ---
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 4, initialDelay = 3000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try { return await fn(); } catch (err: any) {
      lastError = err;
      const errorMsg = err.message || JSON.stringify(err);
      if ((errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) && i < maxRetries - 1) {
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
  const [exportMode, setExportMode] = useState<ExportMode>('burn');
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [globalVibe, setGlobalVibe] = useState<string>('Biến video này thành xu hướng TikTok cực hot');
  const [selectedVoice, setSelectedVoice] = useState(AI_VOICES[0]);
  const [activeTab, setActiveTab] = useState<'create' | 'social'>('create');
  const [currentTime, setCurrentTime] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persistence Logic
  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio) {
        const has = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(has);
      }
    };
    checkApiKey();
  }, []);

  const handleOpenKeySelection = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  // Fix: Implemented missing handleFileChange function
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newAssetsPromises = files.map(async (file, i) => {
      return new Promise<SourceAsset>((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          resolve({
            id: `asset-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
            data: ev.target?.result as string,
            prompt: `Mô tả chuyển động nghệ thuật cho ${file.name}`
          });
        };
        reader.readAsDataURL(file);
      });
    });

    const newAssets = await Promise.all(newAssetsPromises);
    setSourceAssets(prev => [...prev, ...newAssets]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleGenerateBatch = async () => {
    if (sourceAssets.length === 0) return;
    setLoading(true); setBatchResults([]);
    const results: BatchVideoResult[] = [];

    for (let i = 0; i < sourceAssets.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 2000));
      const asset = sourceAssets[i];
      const combinedPrompt = `${globalVibe}. Specific instructions: ${asset.prompt}`;
      setStatus(`[${i+1}/${sourceAssets.length}] Phân tích kịch bản & AI Viral Pack...`);
      
      try {
        const metaRes = await withRetry(async () => {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          return await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: `Tạo kịch bản TikTok trend 20s. Ý tưởng: "${combinedPrompt}". 
            TRẢ VỀ JSON:
            {
              "catchyTitles": ["Tiêu đề siêu cháy"],
              "hashtags": ["#viral", "#trending"],
              "description": "Caption chính cho TikTok bài đăng.",
              "viralCaptions": [
                {"style": "Tò mò", "text": "Hầu hết mọi người đều sai lầm ở bước này..."},
                {"style": "Hành động", "text": "Thử ngay hôm nay nếu bạn muốn kết quả khác biệt!"},
                {"style": "Giá trị", "text": "3 bí kíp giúp bạn làm chủ nội dung này."}
              ],
              "visualPrompt": "Detailed CGI motion description.",
              "subtitles": [{"text": "Chào mừng bạn", "start": 0, "end": 2}],
              "scriptBeats": [{"id": "b1", "start": 0, "end": 2.5, "type": "HOOK", "description": "Hook"}]
            }`,
            config: { systemInstruction: "Bạn là chuyên gia Viral TikTok. Trả về JSON tiếng Việt chuẩn." }
          });
        });

        const meta: ViralMetadata = JSON.parse(metaRes.text!.match(/\{[\s\S]*\}/)?.[0] || '{}');
        setStatus(`[${i+1}/${sourceAssets.length}] Chuyển văn bản thành giọng nói...`);
        
        const ttsRes = await withRetry(async () => {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          return await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: [{ parts: [{ text: meta.subtitles?.map(s => s.text).join('... ') || '' }] }],
            config: { 
              responseModalities: [Modality.AUDIO], 
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice.name } } } 
            }
          });
        });
        
        const b64Audio = ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
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

        setStatus(`[${i+1}/${sourceAssets.length}] Render video...`);
        let op = await withRetry(async () => {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          return await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: meta.visualPrompt,
            image: { imageBytes: asset.data.split(',')[1], mimeType: 'image/png' },
            config: { resolution: '720p', aspectRatio: '9:16', numberOfVideos: 1 }
          });
        });

        while (!op.done) {
          await new Promise(r => setTimeout(r, 12000));
          op = await withRetry(async () => {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            return await ai.operations.getVideosOperation({ operation: op });
          });
        }

        const videoResp = await fetch(`${op.response?.generatedVideos?.[0]?.video?.uri}&key=${process.env.API_KEY}`);
        const videoUrlLocal = URL.createObjectURL(await videoResp.blob() as Blob);

        results.push({ id: `vid-${Date.now()}-${i}`, sourceImage: asset.data, videoUrl: videoUrlLocal, ttsUrl: ttsUrlLocal, metadata: meta });
        setBatchResults([...results]);
        if (i === 0) setCurrentIndex(0);

      } catch (err: any) { setStatus(`Lỗi video ${i+1}: ${err.message}`); }
    }
    setLoading(false); setStatus('Hoàn tất! 🔥');
  };

  const handleProfessionalExport = async () => {
    const res = batchResults[currentIndex];
    if (!res) return;
    setExporting(true); setStatus('Đang đóng gói video & phụ đề...');

    const srt = res.metadata.subtitles.map((s, i) => {
      const formatTime = (seconds: number) => {
        const date = new Date(0);
        date.setSeconds(seconds);
        return date.toISOString().substr(11, 8) + ',' + (Math.floor((seconds % 1) * 1000)).toString().padStart(3, '0');
      };
      return `${i + 1}\n${formatTime(s.start)} --> ${formatTime(s.end)}\n${s.text}\n`;
    }).join('\n');

    try {
      const response = await fetch('/api/export-subbed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: res.videoUrl, srt, mode: exportMode, filename: `ViralVibe_TikTok_${currentIndex}.mp4` })
      });

      if (!response.ok) throw new Error('Render server thất bại');
      const blob = await response.blob() as Blob;
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `ViralVibe_Pro_${currentIndex}.mp4`; a.click();
      setStatus('Tải video thành công! Sẵn sàng đăng TikTok. 🔥');
    } catch (e: any) { setStatus(`Lỗi Export: ${e.message}`); } 
    finally { setExporting(false); }
  };

  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const update = () => setCurrentTime(v.currentTime); v.addEventListener('timeupdate', update);
    return () => v.removeEventListener('timeupdate', update);
  }, [currentIndex, batchResults]);

  const cur = batchResults[currentIndex];

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans flex flex-col selection:bg-[#FE2C55]">
      {!hasApiKey && (
        <div className="fixed inset-0 z-[1000] bg-black/95 flex flex-col items-center justify-center p-6 text-center">
          <button onClick={handleOpenKeySelection} className="py-5 px-10 bg-white text-black rounded-full font-black uppercase shadow-2xl">Chọn API Key để bắt đầu</button>
          <p className="mt-4 text-white/40 text-xs">Bạn chỉ cần chọn một lần, chúng tôi sẽ lưu lại cho phiên sau.</p>
        </div>
      )}

      <nav className="p-5 border-b border-white/5 flex justify-between items-center bg-black/40 backdrop-blur-3xl sticky top-0 z-[100]">
        <h1 className="text-xl font-black italic uppercase">ViralVibe <span className="text-[#FE2C55]">PRO</span></h1>
        <div className="flex bg-white/5 rounded-full p-1 border border-white/10">
          <button onClick={() => setActiveTab('create')} className={`px-6 py-2 rounded-full font-bold text-[10px] ${activeTab==='create'?'bg-white text-black':'opacity-40'}`}>EDITOR</button>
          <button onClick={() => setActiveTab('social')} className={`px-6 py-2 rounded-full font-bold text-[10px] ${activeTab==='social'?'bg-white text-black':'opacity-40'}`}>SOCIAL PREP</button>
        </div>
      </nav>

      <main className="flex-1 p-4 lg:p-10 max-w-[1750px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-zinc-900/40 p-6 rounded-[2.5rem] border border-white/5 space-y-8 overflow-y-auto max-h-[85vh] scrollbar-hide">
            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase opacity-40">Hàng Đợi ({sourceAssets.length})</label>
              <div className="space-y-3">
                {sourceAssets.map(a => (
                  <div key={a.id} className="p-3 bg-white/5 rounded-2xl flex gap-3 border border-white/10 relative group">
                    <img src={a.data} className="w-16 h-16 object-cover rounded-xl" />
                    <textarea value={a.prompt} onChange={e => setSourceAssets(p => p.map(x=>x.id===a.id?{...x,prompt:e.target.value}:x))} className="flex-1 bg-transparent text-xs resize-none outline-none pt-1" placeholder="Ý tưởng cho cảnh này..." />
                    <button onClick={() => setSourceAssets(p => p.filter(x=>x.id!==a.id))} className="absolute -top-2 -right-2 bg-black w-6 h-6 rounded-full text-[10px] opacity-0 group-hover:opacity-100 border border-white/10 transition-opacity">✕</button>
                  </div>
                ))}
                <button onClick={() => fileInputRef.current?.click()} className="w-full py-6 border-2 border-dashed border-white/10 rounded-2xl text-[10px] font-black uppercase opacity-40 hover:opacity-100 hover:border-[#FE2C55] transition-all bg-white/5">+ THÊM ẢNH HÀLOẠT</button>
                <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileChange} accept="image/*" />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-white/5">
              <label className="text-[10px] font-black uppercase opacity-40">Global Vibe</label>
              <textarea value={globalVibe} onChange={e => setGlobalVibe(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-[#FE2C55] h-24" placeholder="Chủ đề áp dụng cho cả hàng đợi..." />
              <button onClick={handleGenerateBatch} disabled={loading || sourceAssets.length===0} className="w-full py-6 bg-gradient-to-r from-[#FE2C55] to-[#ff4d72] text-white rounded-[2rem] font-black uppercase shadow-2xl hover:scale-[1.02] transition-transform">SẢN XUẤT HÀNG LOẠT 🚀</button>
            </div>
          </section>
        </div>

        <div className="lg:col-span-4 flex flex-col items-center">
          <div className="relative w-full max-w-[380px] aspect-[9/16] bg-zinc-950 rounded-[3.5rem] border-[10px] border-zinc-900 shadow-2xl overflow-hidden ring-1 ring-white/10">
            {cur ? (
              <>
                <video ref={videoRef} key={cur.videoUrl} src={cur.videoUrl} loop muted playsInline className="w-full h-full object-cover" />
                {cur.metadata.subtitles?.find(s => currentTime >= s.start && currentTime <= s.end) && (
                  <div className="absolute bottom-[20%] w-full text-center px-6 pointer-events-none">
                    <span className="text-white font-[900] text-2xl uppercase italic tracking-tighter drop-shadow-[0_0_15px_rgba(0,0,0,0.8)]" style={{ fontFamily: 'Anton', WebkitTextStroke: '6px black', paintOrder: 'stroke fill' }}>
                      {cur.metadata.subtitles.find(s => currentTime >= s.start && currentTime <= s.end)?.text}
                    </span>
                  </div>
                )}
              </>
            ) : <div className="w-full h-full flex flex-col items-center justify-center opacity-10 text-[10px] font-black uppercase tracking-[0.4em]">Đang Chờ Video</div>}
            
            {loading && <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-12 text-center space-y-6">
              <div className="w-12 h-12 border-4 border-[#FE2C55] border-t-transparent rounded-full animate-spin" />
              <p className="text-[10px] font-black uppercase tracking-widest text-[#FE2C55] animate-pulse">{status}</p>
            </div>}
          </div>

          {cur && (
            <div className="w-full max-w-[380px] mt-8 space-y-5">
              <div className="flex bg-white/5 rounded-2xl p-1 border border-white/10">
                <button onClick={()=>setExportMode('burn')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${exportMode==='burn'?'bg-white text-black':'opacity-40'}`}>HARD SUBS (TikTok Style)</button>
                <button onClick={()=>setExportMode('soft')} className={`flex-1 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${exportMode==='soft'?'bg-white text-black':'opacity-40'}`}>SOFT SUBS (Embedded)</button>
              </div>
              <button onClick={handleProfessionalExport} disabled={exporting} className="w-full py-6 bg-white text-black rounded-full font-black text-sm uppercase shadow-xl hover:bg-[#FE2C55] hover:text-white transition-all active:scale-95 flex items-center justify-center gap-3">
                {exporting ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : 'XUẤT VIDEO CHUYÊN NGHIỆP 📥'}
              </button>
            </div>
          )}
        </div>

        <div className="lg:col-span-4">
          <section className="bg-zinc-900/40 p-8 rounded-[3rem] border border-white/5 h-full overflow-y-auto max-h-[85vh] scrollbar-hide">
            {activeTab === 'create' ? (
              <div className="space-y-6">
                <h3 className="text-[10px] font-black uppercase opacity-40 tracking-widest">Script Timeline</h3>
                {cur?.metadata.scriptBeats?.map(b => (
                  <div key={b.id} className={`p-5 rounded-2xl border transition-all duration-500 ${currentTime >= b.start && currentTime <= b.end ? 'bg-[#FE2C55]/10 border-[#FE2C55] translate-x-2' : 'bg-white/5 border-white/5 opacity-30'}`}>
                    <span className="text-[8px] font-black bg-white/10 px-2 py-1 rounded mb-2 inline-block uppercase">{b.type}</span>
                    <p className="text-xs font-bold leading-relaxed">{b.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-10">
                <div className="space-y-4">
                   <h3 className="text-[10px] font-black uppercase opacity-40 tracking-widest">AI Viral Captions</h3>
                   {cur?.metadata.viralCaptions?.map((c, i) => (
                     <div key={i} className="p-5 bg-white/5 rounded-2xl border border-white/10 group relative hover:border-[#FE2C55] transition-all cursor-pointer" onClick={() => navigator.clipboard.writeText(c.text)}>
                       <span className="text-[8px] font-black uppercase text-[#FE2C55] mb-2 block">{c.style}</span>
                       <p className="text-sm font-bold leading-snug">{c.text}</p>
                       <div className="absolute top-4 right-4 text-[8px] font-black opacity-0 group-hover:opacity-100">CLICK TO COPY</div>
                     </div>
                   ))}
                </div>
                <div className="space-y-4">
                   <h3 className="text-[10px] font-black uppercase opacity-40 tracking-widest">Social Meta</h3>
                   <div className="p-5 bg-black/40 rounded-2xl border border-white/10 space-y-4">
                      <div>
                        <label className="text-[9px] font-black uppercase opacity-30 block mb-2">Description</label>
                        <p className="text-xs leading-relaxed">{cur?.metadata.description}</p>
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase opacity-30 block mb-2">Smart Hashtags</label>
                        <p className="text-xs font-mono text-[#FE2C55]">{cur?.metadata.hashtags?.join(' ')}</p>
                      </div>
                   </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {status && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 px-8 py-4 bg-black/90 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest z-[200] shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#FE2C55] animate-ping" />
          {status}
        </div>
      )}

      {cur?.ttsUrl && <audio ref={audioRef} key={cur.ttsUrl} src={cur.ttsUrl} className="hidden" crossOrigin="anonymous" />}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<ViralVibeApp />);
