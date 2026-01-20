
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality, GenerateContentResponse, Type, VideoGenerationReferenceType } from '@google/genai';

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
type TemplateType = 'hyper' | 'product' | 'story' | 'cinematic' | 'fashion' | 'cartoon' | 'cyberpunk' | 'custom';
type AnimationType = 'none' | 'wiggle' | 'pulse' | 'glitch';
type RenderMode = '2D' | '3D';
type ImageSize = '1K' | '2K' | '4K';
type AspectRatio = '1:1' | '9:16' | '16:9' | '3:4' | '4:3' | '21:9';

interface Template {
  id: TemplateType;
  label: string;
  description: string;
  previewColor: string;
  systemPrompt: string;
}

const TEMPLATES: Template[] = [
  { id: 'cyberpunk', label: 'Cyberpunk Glitch', description: 'Tương lai, hiệu ứng glitch, ánh sáng neon rực rỡ.', previewColor: '#00f2ff', systemPrompt: "Aesthetics: high contrast neon, glitch artifacts, digital rain, futuristic urban settings." },
  { id: 'hyper', label: 'Siêu Thực', description: 'CGI siêu thực, độ phân giải cao, ánh sáng điện ảnh.', previewColor: '#6366f1', systemPrompt: "Hyper-realistic CGI, 8k, cinematic lighting, photorealistic textures." },
  { id: 'product', label: 'Quảng Cáo SP', description: 'Góc quay macro, tập trung vào chi tiết sản phẩm.', previewColor: '#f59e0b', systemPrompt: "Studio lighting, macro shots, clean aesthetic for high-end products." },
  { id: 'fashion', label: 'Thời Trang', description: 'Ánh sáng nghệ thuật, chuyển động sang trọng.', previewColor: '#8b5cf6', systemPrompt: "Luxury aesthetic, soft diffused lighting, high-end fashion cinematography." },
  { id: 'custom', label: 'Tự Tạo Mẫu', description: 'Sử dụng mô tả riêng của bạn để định hình AI.', previewColor: '#ffffff', systemPrompt: "" }
];

const AI_VOICES = [
  { id: 'Fenrir', label: 'Cyber-Robotic (Máy móc)' },
  { id: 'Charon', label: 'Void-Modulated (Sci-Fi Deep)' },
  { id: 'Kore', label: 'Synth-Glitch (Nữ ảo giác)' },
  { id: 'Zephyr', label: 'Digital-Young (Hiện đại)' },
  { id: 'Puck', label: 'Standard-Deep (Nam truyền thống)' },
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

interface SourceAsset { id: string; data: string; prompt: string; }
interface BatchVideoResult {
  id: string;
  sourceImage: string;
  videoUrl: string;
  rawVideoUri: string;
  ttsUrl: string | null;
  ttsBase64: string | null;
  metadata: ViralMetadata;
}

const ViralVibeApp: React.FC = () => {
  const [sourceAssets, setSourceAssets] = useState<SourceAsset[]>([]);
  const [batchResults, setBatchResults] = useState<BatchVideoResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [activeTemplate, setActiveTemplate] = useState<Template>(TEMPLATES[0]);
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(AI_VOICES[0]);
  const [duration, setDuration] = useState<number>(20);
  
  // Advanced FX Controls
  const [animType, setAnimType] = useState<AnimationType>('glitch');
  const [chromaticAberration, setChromaticAberration] = useState(8);
  const [glitchIntensity, setGlitchIntensity] = useState(12);
  const [neonBloom, setNeonBloom] = useState(20);
  const [pixelSorting, setPixelSorting] = useState(0);
  const [renderMode, setRenderMode] = useState<RenderMode>('3D');

  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('viral_vibe_v5_pro');
    if (saved) {
      const parsed = JSON.parse(saved);
      setSourceAssets(parsed.assets || []);
      setBatchResults(parsed.results || []);
    }
  }, []);

  const saveProject = () => {
    localStorage.setItem('viral_vibe_v5_pro', JSON.stringify({ assets: sourceAssets, results: batchResults }));
    setStatus('Dự án đã lưu!');
    setTimeout(() => setStatus(''), 2000);
  };

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

  // Helper to format seconds into SRT time string
  const formatSRTTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  // Implement handleFullExport to send data to the local ffmpeg server
  const handleFullExport = async () => {
    const curResult = batchResults[currentIndex];
    if (!curResult) return;
    setExporting(true);
    setStatus('Đang chuẩn bị video full với hiệu ứng & phụ đề...');
    try {
      const srt = curResult.metadata.scriptBeats.map((beat, i) => {
        const start = formatSRTTime(beat.start);
        const end = formatSRTTime(beat.end);
        return `${i + 1}\n${start} --> ${end}\n${beat.text}\n`;
      }).join('\n');

      const response = await fetch('/api/export-full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawVideoUri: curResult.rawVideoUri,
          audioBase64: curResult.ttsBase64,
          srt,
          filename: `ViralVibe_Export_${Date.now()}.mp4`
        }),
      });

      if (!response.ok) throw new Error('Xuất video thất bại từ phía server.');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ViralVibe_Full_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus('Xuất video thành công! 🔥');
    } catch (e: any) {
      setStatus(`Lỗi: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleGenerateImage = async (prompt: string, size: ImageSize = '1K') => {
    // Pro image generation requires API key selection
    if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
      await window.aistudio.openSelectKey();
    }
    
    setLoading(true); setStatus('AI Pro đang vẽ hình ảnh...');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { imageSize: size, aspectRatio: '9:16' } }
      });
      const part = response.candidates[0].content.parts.find(p => p.inlineData);
      if (part?.inlineData) {
        const dataUrl = `data:image/png;base64,${part.inlineData.data}`;
        setSourceAssets(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), data: dataUrl, prompt }]);
        setStatus('Đã thêm ảnh vào hàng chờ!');
      }
    } catch (e: any) { setStatus(`Lỗi: ${e.message}`); }
    finally { setLoading(false); }
  };

  const handleGenerateScriptAndVideo = async () => {
    if (sourceAssets.length === 0) return;
    
    // Video generation with Veo requires API key selection
    if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
      await window.aistudio.openSelectKey();
    }

    setLoading(true); setBatchResults([]);
    const results: BatchVideoResult[] = [];

    for (let i = 0; i < sourceAssets.length; i++) {
      const asset = sourceAssets[i];
      setStatus(`[${i+1}/${sourceAssets.length}] Đang thiết kế kịch bản Glitch...`);
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const finalStyle = activeTemplate.id === 'custom' ? customPrompt : activeTemplate.systemPrompt;
        
        const scriptResponse = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: `Viết kịch bản TikTok ${duration}s. Chủ đề: "${asset.prompt}". Phong cách: ${finalStyle}. 
          TRẢ VỀ JSON:
          {
            "description": "Caption viral", "hashtags": ["#viral", "#cyberpunk"],
            "scriptBeats": [
              {"type": "HOOK", "start": 0, "end": 4, "text": "..."},
              {"type": "BODY", "start": 4, "end": 15, "text": "..."},
              {"type": "PAYOFF", "start": 15, "end": 18, "text": "..."},
              {"type": "CTA", "start": 18, "end": 20, "text": "..."}
            ],
            "visualPrompt": "Mô tả cảnh quay Glitch siêu thực"
          }`,
          config: { thinkingConfig: { thinkingBudget: 32768 } }
        });

        const meta: ViralMetadata = JSON.parse(scriptResponse.text!.match(/\{[\s\S]*\}/)?.[0] || '{}');
        const fullText = meta.scriptBeats.map(b => b.text).join('. ');

        setStatus(`[${i+1}/${sourceAssets.length}] Lồng tiếng AI (${selectedVoice.label})...`);
        const ttsResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: [{ parts: [{ text: fullText }] }],
          config: { 
            responseModalities: [Modality.AUDIO], 
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice.id } } } 
          }
        });

        const b64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
        let ttsUrl = null;
        if (b64Audio) {
          const audioCtx = new AudioContext({ sampleRate: 24000 });
          const buffer = await decodeAudioData(decode(b64Audio), audioCtx, 24000, 1);
          const wavBlob = await new Promise<Blob>(resolve => {
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
          ttsUrl = URL.createObjectURL(wavBlob);
        }

        setStatus(`[${i+1}/${sourceAssets.length}] Render Video Veo 3.1...`);
        let op = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: `${meta.visualPrompt}, ${renderMode} style, glitch artifacts enabled`,
          image: { imageBytes: asset.data.split(',')[1], mimeType: 'image/png' },
          config: { resolution: '720p', aspectRatio: '9:16', numberOfVideos: 1 }
        });

        while (!op.done) {
          await new Promise(r => setTimeout(r, 8000));
          op = await ai.operations.getVideosOperation({ operation: op });
        }

        const rawUri = op.response?.generatedVideos?.[0]?.video?.uri || "";
        const videoUrl = URL.createObjectURL(await (await fetch(`${rawUri}&key=${process.env.API_KEY}`)).blob());

        results.push({ id: `v-${Date.now()}-${i}`, sourceImage: asset.data, videoUrl, rawVideoUri: rawUri, ttsUrl, ttsBase64: b64Audio, metadata: meta });
        setBatchResults([...results]);
        if (i === 0) setCurrentIndex(0);
      } catch (e: any) { setStatus(`Lỗi: ${e.message}`); }
    }
    setLoading(false); setStatus('Xong! 🔥');
  };

  const cur = batchResults[currentIndex];
  const activeBeat = cur?.metadata.scriptBeats.find(b => currentTime >= b.start && currentTime <= b.end);

  const getAnimationStyles = () => {
    if (animType === 'glitch') {
      return {
        animation: `glitch-base 0.2s infinite linear alternate-reverse`,
        textShadow: `${chromaticAberration}px 0 #00f2ff, -${chromaticAberration}px 0 #ff00ea`,
        filter: `drop-shadow(0 0 ${neonBloom}px #00f2ff)`,
      };
    }
    return {
      animation: animType !== 'none' ? `${animType} 0.5s infinite alternate` : 'none',
      filter: `drop-shadow(0 0 ${neonBloom}px #FE2C55)`
    };
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-['Be_Vietnam_Pro'] flex flex-col selection:bg-[#FE2C55]/30 overflow-hidden">
      <style>{`
        @keyframes wiggle { 0% { transform: rotate(-3deg); } 100% { transform: rotate(3deg); } }
        @keyframes pulse { 0% { transform: scale(0.98); opacity: 0.8; } 100% { transform: scale(1.02); opacity: 1; } }
        @keyframes glitch-base {
          0% { clip-path: inset(10% 0 10% 0); transform: translate(0); }
          20% { clip-path: inset(45% 0 15% 0); transform: translate(-5px, 2px); }
          40% { clip-path: inset(5% 0 60% 0); transform: translate(5px, -2px); }
          60% { clip-path: inset(80% 0 5% 0); transform: translate(-2px, 5px); }
          80% { clip-path: inset(20% 0 40% 0); transform: translate(2px, -5px); }
          100% { clip-path: inset(10% 0 10% 0); transform: translate(0); }
        }
        @keyframes drift { 0% { transform: translateX(-5%); } 100% { transform: translateX(5%); } }
        .cyber-bg { background: linear-gradient(180deg, rgba(254,44,85,0.05) 0%, rgba(0,242,255,0.05) 100%); }
        .glass { background: rgba(255,255,255,0.02); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); }
      `}</style>

      {/* Nav */}
      <nav className="p-4 border-b border-white/5 bg-black/60 backdrop-blur-3xl sticky top-0 z-[200] flex justify-between items-center">
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-black uppercase tracking-tighter bg-gradient-to-r from-[#FE2C55] to-[#00f2ff] bg-clip-text text-transparent">ViralVibe PRO V5</h1>
          <div className="flex gap-2">
            <button onClick={saveProject} className="text-[10px] font-black bg-white/5 px-3 py-1 rounded hover:bg-white/10 transition-all">LƯU DỰ ÁN</button>
            <button onClick={async () => { if(window.aistudio) await window.aistudio.openSelectKey(); }} className="text-[10px] font-black bg-[#FE2C55]/10 border border-[#FE2C55]/20 px-3 py-1 rounded hover:bg-[#FE2C55]/20 transition-all text-[#FE2C55]">CÀI ĐẶT API KEY</button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <select value={selectedVoice.id} onChange={(e) => setSelectedVoice(AI_VOICES.find(v=>v.id===e.target.value)!)} className="bg-transparent text-[11px] font-black outline-none border border-white/10 rounded-lg px-2 py-1 glass">
            {AI_VOICES.map(v => <option key={v.id} value={v.id} className="bg-zinc-900">{v.label}</option>)}
          </select>
        </div>
      </nav>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 max-w-[1900px] mx-auto w-full overflow-hidden">
        {/* Left Sidebar */}
        <div className="lg:col-span-3 space-y-6 overflow-y-auto pr-2 scrollbar-hide pb-20">
          <section className="bg-zinc-900/40 p-5 rounded-3xl border border-white/5 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Mẫu Visual AI</h3>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => setActiveTemplate(t)} className={`p-3 rounded-2xl border text-[10px] font-bold uppercase transition-all ${activeTemplate.id === t.id ? 'bg-white/10 border-white/20' : 'bg-white/5 border-transparent opacity-40 hover:opacity-100'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            {activeTemplate.id === 'custom' && (
              <textarea value={customPrompt} onChange={e=>setCustomPrompt(e.target.value)} placeholder="Nhập mô tả phong cách riêng của bạn..." className="w-full h-24 bg-black/40 border border-white/10 rounded-xl p-3 text-xs outline-none focus:border-[#00f2ff] transition-all resize-none" />
            )}
          </section>

          <section className="bg-zinc-900/40 p-5 rounded-3xl border border-white/5 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Tài Nguyên Đầu Vào</h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                 <input type="text" id="ai-img-p" placeholder="Vẽ ảnh AI mới..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] outline-none" />
                 <button onClick={() => handleGenerateImage((document.getElementById('ai-img-p') as HTMLInputElement).value)} className="bg-white text-black font-black text-[10px] px-3 rounded-xl">GEN</button>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {sourceAssets.map(a => (
                  <div key={a.id} className="relative group aspect-square rounded-xl overflow-hidden border border-white/10">
                    <img src={a.data} className="w-full h-full object-cover" />
                    <button onClick={()=>setSourceAssets(p=>p.filter(x=>x.id!==a.id))} className="absolute top-1 right-1 bg-black/60 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-[8px]">✕</button>
                  </div>
                ))}
              </div>
              <input type="file" multiple className="hidden" ref={fileInputRef} onChange={async (e)=>{
                const files = Array.from(e.target.files||[]);
                const news = await Promise.all(files.map(f => new Promise<SourceAsset>(r => {
                  const rd = new FileReader(); rd.onload = ev => r({id:Math.random().toString(36).substr(2,9), data:ev.target?.result as string, prompt:''}); rd.readAsDataURL(f);
                })));
                setSourceAssets(p => [...p, ...news]);
              }} />
              <button onClick={()=>fileInputRef.current?.click()} className="w-full py-4 border-2 border-dashed border-white/10 rounded-2xl text-[10px] font-black uppercase opacity-30 hover:opacity-100 transition-all">+ TẢI ẢNH LÊN</button>
            </div>
          </section>

          <button onClick={handleGenerateScriptAndVideo} disabled={loading || sourceAssets.length === 0} className="w-full py-5 bg-gradient-to-r from-[#FE2C55] to-[#FF4D72] text-white rounded-3xl font-black uppercase shadow-xl hover:scale-[1.03] active:scale-95 disabled:opacity-20 transition-all">
            RENDER VIRAL VIDEO 🚀
          </button>
        </div>

        {/* Center Player */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center pb-20">
          <div className="relative w-full max-w-[340px] aspect-[9/16] bg-black rounded-[3rem] border-[10px] border-zinc-900 shadow-2xl overflow-hidden ring-1 ring-white/10">
            {cur ? (
              <div className="relative w-full h-full">
                <video ref={videoRef} key={cur.videoUrl} src={cur.videoUrl} loop playsInline className="w-full h-full object-cover" onTimeUpdate={e=>setCurrentTime(e.currentTarget.currentTime)} />
                
                {/* Advanced FX Layers */}
                <div className="absolute inset-0 pointer-events-none mix-blend-screen opacity-40" style={{ boxShadow: `inset 0 0 ${neonBloom*2}px #00f2ff` }} />
                
                {pixelSorting > 0 && (
                   <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
                      {Array.from({length: 12}).map((_, i) => (
                        <div key={i} className="absolute bg-[#00f2ff] h-px w-full" style={{ top: `${Math.random()*100}%`, animation: `drift ${1+Math.random()}s infinite alternate` }} />
                      ))}
                   </div>
                )}

                {activeBeat && (
                  <div className="absolute bottom-[20%] w-full px-8 text-center pointer-events-none z-50">
                    <div className="relative inline-block">
                       <span className="text-white font-[950] text-3xl uppercase italic tracking-tighter block leading-[1]" style={{ ...getAnimationStyles(), WebkitTextStroke: '6px black', paintOrder: 'stroke fill' }}>
                        {activeBeat.text}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center opacity-10 text-[9px] font-black uppercase tracking-widest p-12 text-center">Chọn tài nguyên & Mẫu AI để bắt đầu</div>
            )}

            {loading && (
              <div className="absolute inset-0 bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-10 text-center z-[100]">
                <div className="w-16 h-16 border-4 border-[#FE2C55]/20 border-t-[#FE2C55] rounded-full animate-spin mb-6" />
                <p className="text-sm font-black uppercase tracking-widest text-[#FE2C55] drop-shadow-[0_0_10px_#FE2C55]">AI Đang Xử Lý...</p>
                <p className="text-[10px] opacity-60 uppercase mt-2">{status}</p>
              </div>
            )}
          </div>

          {cur && (
            <div className="w-full max-w-[340px] mt-8 space-y-4">
               <div className="timeline-track cursor-pointer h-2" onClick={(e)=>{ if(!videoRef.current) return; const r = e.currentTarget.getBoundingClientRect(); videoRef.current.currentTime = ((e.clientX-r.left)/r.width)*duration; }}>
                 {cur.metadata.scriptBeats.map(b => (
                    <div key={b.id} className={`timeline-beat ${activeBeat?.id === b.id ? 'active' : ''}`} style={{ left: `${(b.start/duration)*100}%`, width: `${((b.end-b.start)/duration)*100}%`, background: b.type==='HOOK'?'#00f2ff':'#FE2C55' }} />
                 ))}
                 <div className="absolute top-0 bottom-0 w-1 bg-white z-20 shadow-[0_0_10px_white]" style={{ left: `${(currentTime/duration)*100}%` }} />
               </div>
               <div className="flex gap-2">
                 <button onClick={handleFullExport} disabled={exporting} className="flex-1 py-4 bg-white text-black rounded-2xl font-black uppercase text-[11px] shadow-lg hover:bg-zinc-200 transition-all flex items-center justify-center gap-2">
                   {exporting ? 'ĐANG XUẤT...' : 'TẢI VIDEO FULL 📥'}
                 </button>
                 <a href={cur.videoUrl} download="raw_video.mp4" className="p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all">📹</a>
               </div>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="lg:col-span-4 space-y-6 overflow-y-auto scrollbar-hide pb-20">
          <section className="bg-zinc-900/40 p-6 rounded-[2.5rem] border border-white/5 space-y-8 h-full">
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Hiệu Ứng Glitch PRO</h3>
              <div className="grid grid-cols-4 gap-2 bg-white/5 rounded-2xl p-1 border border-white/5">
                {(['none', 'wiggle', 'pulse', 'glitch'] as AnimationType[]).map(t => (
                  <button key={t} onClick={()=>setAnimType(t)} className={`py-2 rounded-xl text-[9px] font-black uppercase transition-all ${animType===t?'bg-white text-black':'opacity-40 hover:opacity-100'}`}>{t}</button>
                ))}
              </div>
            </div>

            <div className="space-y-6 animate-in slide-in-from-right-10 duration-500">
              <div className="space-y-3">
                 <div className="flex justify-between text-[9px] font-black uppercase opacity-40"><span>Chromatic Offset</span><span>{chromaticAberration}px</span></div>
                 <input type="range" min="0" max="25" value={chromaticAberration} onChange={e=>setChromaticAberration(parseInt(e.target.value))} className="w-full accent-[#00f2ff] h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer" />
              </div>
              <div className="space-y-3">
                 <div className="flex justify-between text-[9px] font-black uppercase opacity-40"><span>Glitch Intensity</span><span>{glitchIntensity}</span></div>
                 <input type="range" min="0" max="40" value={glitchIntensity} onChange={e=>setGlitchIntensity(parseInt(e.target.value))} className="w-full accent-[#ff00ea] h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer" />
              </div>
              <div className="space-y-3">
                 <div className="flex justify-between text-[9px] font-black uppercase opacity-40"><span>Neon Bloom</span><span>{neonBloom}%</span></div>
                 <input type="range" min="0" max="100" value={neonBloom} onChange={e=>setNeonBloom(parseInt(e.target.value))} className="w-full accent-white h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer" />
              </div>
              <div className="space-y-3">
                 <div className="flex justify-between text-[9px] font-black uppercase opacity-40"><span>Pixel Sorting</span><span>{pixelSorting}</span></div>
                 <input type="range" min="0" max="100" value={pixelSorting} onChange={e=>setPixelSorting(parseInt(e.target.value))} className="w-full accent-cyan-400 h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer" />
              </div>
              <div className="flex bg-white/5 rounded-2xl p-1 border border-white/5">
                 {(['2D', '3D'] as RenderMode[]).map(m => (
                    <button key={m} onClick={()=>setRenderMode(m)} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-xl transition-all ${renderMode===m?'bg-[#00f2ff] text-black':'opacity-40 hover:opacity-100'}`}>{m} RENDER</button>
                 ))}
              </div>
            </div>

            {cur && (
              <div className="pt-6 border-t border-white/10 space-y-4">
                 <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40">Timeline Phân Cảnh</h3>
                 <div className="space-y-2">
                    {cur.metadata.scriptBeats.map(b => (
                      <div key={b.id} className={`p-3 rounded-xl border transition-all ${activeBeat?.id === b.id ? 'bg-[#FE2C55]/10 border-[#FE2C55]' : 'bg-white/5 border-transparent opacity-30'}`}>
                         <div className="flex justify-between text-[8px] font-black opacity-40 mb-1"><span>{b.type}</span><span>{b.start}s - {b.end}s</span></div>
                         <p className="text-[11px] font-bold leading-tight">{b.text}</p>
                      </div>
                    ))}
                 </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {status && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 px-8 py-3 bg-black/80 backdrop-blur-3xl border border-white/10 rounded-full text-[10px] font-black uppercase tracking-[0.2em] z-[500] shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-10">
           <div className="w-2 h-2 rounded-full bg-[#FE2C55] animate-ping" />
           {status}
        </div>
      )}

      <audio ref={audioRef} src={cur?.ttsUrl || ''} className="hidden" crossOrigin="anonymous" />
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<ViralVibeApp />);
