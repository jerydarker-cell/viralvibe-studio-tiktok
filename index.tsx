
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, Modality, GenerateContentResponse, LiveServerMessage, VideoGenerationReferenceType } from '@google/genai';

// --- Constants & Types ---
type VideoDuration = 10 | 20 | 30 | 60;
type AnimationType = 'None' | 'Wiggle' | 'Pulse';

interface SubtitleSegment {
  id: string;
  text: string;
  start: number;
  end: number;
}

interface ScriptBeat {
  time: string;
  type: 'HOOK' | 'BODY' | 'PAYOFF' | 'CTA';
  description: string;
}

interface ViralMetadata {
  catchyTitles: string[];
  hashtags: string[];
  description: string;
  subtitles: SubtitleSegment[];
  scriptBeats: ScriptBeat[];
  visualPrompt: string; 
  viralScore: number;
  cta: string;
  groundingLinks?: { title: string, uri: string }[];
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
  { id: 'tiktok-viral-high', label: 'Trend TikTok 🔥', prompt: 'Cinematic 9:16, high-energy movement, vibrant colors, trending TikTok aesthetic.', icon: '🔥', description: 'Phong cách xu hướng mạnh mẽ.' },
  { id: 'product-ad-ai', label: 'Quảng Cáo AI 🛍️', prompt: 'Commercial product cinematography, luxury studio lighting, product reveal, 4k clean look.', icon: '🛍️', description: 'Giới thiệu sản phẩm chuyên nghiệp.' },
  { id: 'kids-game-3d', label: 'Trò Chơi 3D 🧸', prompt: 'Playful 3D animated game style, toy-like textures, vibrant candy colors, kids friendly.', icon: '🧸', description: 'Hoạt hình 3D vui nhộn cho trẻ em.' },
  { id: 'hyper-real-8k', label: 'Siêu Thực 📸', prompt: 'Hyper-realistic 8k, photorealistic details, cinematic lighting, sharp focus.', icon: '📸', description: 'Độ chi tiết cực cao.' },
  { id: 'anime-vibe', label: 'Hoạt Hình 🎨', prompt: 'Modern anime style, vibrant cel-shaded, studio ghibli lighting, expressive movement.', icon: '🎨', description: 'Phong cách Nhật Bản.' },
];

const VIRAL_FRAMEWORKS: ViralFramework[] = [
  { id: 'twist', label: 'Cú Twist Bất Ngờ 🎭', description: 'Mở đầu bình thường, kết thúc gây sốc.' },
  { id: 'problem-solution', label: 'Vấn Đề - Giải Pháp 💡', description: 'Đánh vào nỗi đau và đưa ra lối thoát.' },
  { id: 'storytelling', label: 'Kể Chuyện (Story) 📖', description: 'Dẫn dắt cảm xúc qua một câu chuyện ngắn.' },
  { id: 'how-to', label: 'Hướng Dẫn (Tips) 🛠️', description: 'Chia sẻ kiến thức nhanh, giá trị cao.' },
];

const DURATION_OPTIONS: VideoDuration[] = [10, 20, 30, 60];

// --- Audio Helpers ---
const encode = (bytes: Uint8Array) => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
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
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const ViralVibeApp: React.FC = () => {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [styleImage, setStyleImage] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [ttsUrl, setTtsUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ViralMetadata | null>(null);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [upscaling, setUpscaling] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [prompt, setPrompt] = useState<string>('Biến video này thành xu hướng TikTok cực hot');
  const [selectedTemplate, setSelectedTemplate] = useState<VideoTemplate>(VIDEO_TEMPLATES[0]);
  const [selectedFramework, setSelectedFramework] = useState<ViralFramework>(VIRAL_FRAMEWORKS[0]);
  const [duration, setDuration] = useState<VideoDuration>(20);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'create' | 'chat' | 'live'>('create');
  
  // Animation States
  const [animType, setAnimType] = useState<AnimationType>('None');
  const [animSpeed, setAnimSpeed] = useState<number>(50);
  const [animIntensity, setAnimIntensity] = useState<number>(50);

  const [chatMessages, setChatMessages] = useState<{role: 'user'|'bot', text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  const [isLiveActive, setIsLiveActive] = useState(false);
  const liveSessionRef = useRef<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);

  const handleUpscale = async () => {
    if (!sourceImage) return;
    setUpscaling(true);
    setStatus("Đang Upscale ảnh bằng AI...");
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { inlineData: { data: sourceImage.split(',')[1], mimeType: 'image/png' } },
            { text: "Upscale and enhance this image to 4K resolution quality. Improve clarity, sharpness, and textures while maintaining 100% of the original features, colors, and subjects. Do not change anything, just make it look high-end and professional." }
          ]
        }
      });
      const imgPart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
      if (imgPart?.inlineData) {
        setSourceImage(`data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`);
        setStatus("Ảnh đã được nâng cấp siêu nét! ✨");
      }
    } catch (e: any) { setStatus("Lỗi Upscale: " + e.message); }
    finally { setUpscaling(false); }
  };

  const startLiveConversation = async () => {
    try {
      if (isLiveActive) {
        setIsLiveActive(false);
        liveSessionRef.current?.close();
        return;
      }
      setStatus("Đang kết nối Trợ lý Giọng nói...");
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      let nextStartTime = 0;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              sessionPromise.then(s => s.sendRealtimeInput({ media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } }));
            };
            source.connect(processor);
            processor.connect(inputCtx.destination);
            setIsLiveActive(true);
            setStatus("Trợ lý sẵn sàng. Hãy nói đi!");
          },
          onmessage: async (msg: LiveServerMessage) => {
            const b64 = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (b64) {
              nextStartTime = Math.max(nextStartTime, outputCtx.currentTime);
              const buffer = await decodeAudioData(decode(b64), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputCtx.destination);
              source.start(nextStartTime);
              nextStartTime += buffer.duration;
            }
          },
          onclose: () => setIsLiveActive(false),
          onerror: (e) => setStatus("Lỗi Live API: " + e.message),
        },
        config: { responseModalities: [Modality.AUDIO] }
      });
      liveSessionRef.current = await sessionPromise;
    } catch (e: any) { setStatus("Lỗi: " + e.message); }
  };

  const handleGenerate = async () => {
    if (!sourceImage) return;
    setLoading(true); setStatus(`Đang thiết kế kịch bản lồng tiếng & phụ đề...`);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      let location = { latitude: 10.7626, longitude: 106.6602 };
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
        location = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch {}

      const metaRes = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Tạo kịch bản TikTok viral ${duration}s. Ý tưởng: "${prompt}". Phong cách: ${selectedTemplate.label}. Khung kịch bản: ${selectedFramework.label}.
        
        TRẢ VỀ DUY NHẤT 1 ĐỐI TƯỢNG JSON VỚI CẤU TRÚC:
        {
          "catchyTitles": ["Title 1", "Title 2", "Title 3"],
          "hashtags": ["tag1", "tag2"],
          "visualPrompt": "Detailed English description for video generation",
          "viralScore": 95,
          "subtitles": [{"text": "...", "start": 0, "end": 2}],
          "scriptBeats": [{"time": "0s-2s", "type": "HOOK", "description": "..."}]
        }`,
        config: {
          tools: [{ googleSearch: {} }, { googleMaps: {} }],
          toolConfig: { retrievalConfig: { latLng: location } },
          systemInstruction: `Bạn là chuyên gia TikTok. Phản hồi của bạn PHẢI là một chuỗi JSON hợp lệ. Thời lượng kịch bản phải chính xác là ${duration} giây. Tự động tạo phụ đề đồng bộ với lời dẫn lồng tiếng.`,
        }
      });

      let responseText = metaRes.text || "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Mô hình không trả về định dạng kịch bản hợp lệ.");
      
      const meta: ViralMetadata = JSON.parse(jsonMatch[0]);
      meta.groundingLinks = metaRes.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((c: any) => ({
        title: c.web?.title || c.maps?.title || "Nguồn tin",
        uri: c.web?.uri || c.maps?.uri || "#"
      }));
      setMetadata(meta);

      setStatus("Đang tạo AI Voiceover & Captions...");
      const ttsRes = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: meta.subtitles.map(s => s.text).join('. ') }] }],
        config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } } }
      });
      const b64Audio = ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (b64Audio) {
        const audioCtx = new AudioContext({ sampleRate: 24000 });
        const buffer = await decodeAudioData(decode(b64Audio), audioCtx, 24000, 1);
        const wavBlob = await new Promise<Blob>((res) => {
          const worker = new Worker(URL.createObjectURL(new Blob([`
            onmessage = (e) => {
              const {buffer, length, sampleRate} = e.data;
              const view = new DataView(new ArrayBuffer(44 + length * 2));
              view.setUint32(0, 0x46464952, true); view.setUint32(4, 36 + length * 2, true); view.setUint32(8, 0x45564157, true);
              view.setUint32(12, 0x20746d66, true); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
              view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
              view.setUint32(36, 0x61746164, true); view.setUint32(40, length * 2, true);
              for (let i = 0; i < length; i++) view.setInt16(44 + i * 2, buffer[i] * 0x7FFF, true);
              postMessage(new Blob([view], {type: 'audio/wav'}));
            };
          `], {type: 'application/javascript'})));
          worker.onmessage = (e) => res(e.data);
          worker.postMessage({buffer: buffer.getChannelData(0), length: buffer.length, sampleRate: buffer.sampleRate});
        });
        setTtsUrl(URL.createObjectURL(wavBlob));
      }

      setStatus(`Đang áp dụng AI Style Transfer & Render...`);
      const finalVideoPrompt = `EXACT REPLICA OF THE STARTING IMAGE. Duration ${duration}s. Style: ${selectedTemplate.prompt}. ${styleImage ? 'Apply the visual style from the reference image perfectly.' : ''} ${meta.visualPrompt}`;
      
      let op;
      if (styleImage) {
        // High quality multi-ref mode for Style Transfer
        const refImages = [
          { image: { imageBytes: sourceImage.split(',')[1], mimeType: 'image/png' }, referenceType: VideoGenerationReferenceType.ASSET },
          { image: { imageBytes: styleImage.split(',')[1], mimeType: 'image/png' }, referenceType: VideoGenerationReferenceType.ASSET }
        ];
        op = await ai.models.generateVideos({
          model: 'veo-3.1-generate-preview',
          prompt: finalVideoPrompt,
          config: { resolution: '720p', aspectRatio: '16:9', referenceImages: refImages, numberOfVideos: 1 }
        });
      } else {
        op = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          prompt: finalVideoPrompt,
          image: { imageBytes: sourceImage.split(',')[1], mimeType: sourceImage.split(';')[0].split(':')[1] },
          config: { resolution: '720p', aspectRatio: '9:16', numberOfVideos: 1 }
        });
      }

      while (!op.done) {
        await new Promise(r => setTimeout(r, 10000));
        op = await ai.operations.getVideosOperation({ operation: op });
      }

      const videoResp = await fetch(`${op.response?.generatedVideos?.[0]?.video?.uri}&key=${process.env.API_KEY}`);
      setVideoUrl(URL.createObjectURL(await videoResp.blob()));
      setStatus("Hoàn tất siêu phẩm! 🔥");
    } catch (e: any) { setStatus("Lỗi: " + e.message); } finally { setLoading(false); }
  };

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    setChatMessages(prev => [...prev, { role: 'user', text: chatInput }]);
    const input = chatInput; setChatInput(''); setIsThinking(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: input,
        config: { thinkingConfig: { thinkingBudget: 32768 } }
      });
      setChatMessages(prev => [...prev, { role: 'bot', text: response.text || "..." }]);
    } catch (e: any) { setChatMessages(prev => [...prev, { role: 'bot', text: "Lỗi: " + e.message }]); }
    finally { setIsThinking(false); }
  };

  const handleExport = async () => {
    if (!videoUrl || !videoRef.current || !metadata) return;
    setExporting(true); setStatus('Đang hòa âm lồng tiếng và nhúng phụ đề AI...');
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const w = 1080; const h = 1920; canvas.width = w; canvas.height = h;
    const stream = canvas.captureStream(30);
    const audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    
    // Mix Video Audio + TTS Voiceover
    const vSource = audioCtx.createMediaElementSource(video); vSource.connect(dest);
    if (audioRef.current) { 
      const aSource = audioCtx.createMediaElementSource(audioRef.current); aSource.connect(dest); 
    }
    
    const recorder = new MediaRecorder(new MediaStream([...stream.getTracks(), ...dest.stream.getAudioTracks()]), { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 15000000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' })); a.download = `ViralVibe_AI_${Date.now()}.mp4`; a.click();
      setExporting(false);
    };
    
    video.currentTime = 0; 
    if (audioRef.current) audioRef.current.currentTime = 0;
    
    await video.play(); 
    if (audioRef.current) audioRef.current.play(); 
    recorder.start();

    const draw = () => {
      if (video.paused || video.ended) { if(recorder.state==='recording') recorder.stop(); return; }
      setExportProgress((video.currentTime / video.duration) * 100);
      ctx.drawImage(video, 0, 0, w, h);
      
      const sub = metadata.subtitles.find(s => video.currentTime >= s.start && video.currentTime <= s.end);
      if (sub) {
        ctx.save();
        let offsetX = 0;
        let offsetY = 0;
        let scale = 1;
        const time = video.currentTime;

        if (animType === 'Wiggle') {
          const speed = (animSpeed / 100) * 10;
          const intensity = (animIntensity / 100) * 20;
          offsetX = Math.sin(time * speed) * intensity;
          offsetY = Math.cos(time * speed * 0.8) * intensity;
        } else if (animType === 'Pulse') {
          const speed = (animSpeed / 100) * 8;
          const intensity = (animIntensity / 100) * 0.2;
          scale = 1 + Math.sin(time * speed) * intensity;
        }

        ctx.translate(w / 2 + offsetX, h * 0.75 + offsetY);
        ctx.scale(scale, scale);
        
        ctx.shadowColor = 'black'; ctx.shadowBlur = 10;
        ctx.font = 'bold 110px "Be Vietnam Pro"'; ctx.textAlign = 'center';
        ctx.strokeStyle = 'black'; ctx.lineWidth = 15; ctx.strokeText(sub.text.toUpperCase(), 0, 0);
        ctx.fillStyle = '#FE2C55'; ctx.fillText(sub.text.toUpperCase(), 0, 0);
        ctx.restore();
      }

      if (selectedTemplate.id === 'product-ad-ai') {
        ctx.save();
        ctx.fillStyle = '#FE2C55'; ctx.beginPath(); ctx.roundRect(100, h - 250, 400, 120, 30); ctx.fill();
        ctx.fillStyle = 'white'; ctx.font = '900 45px "Be Vietnam Pro"'; ctx.textAlign = 'center';
        ctx.fillText('MUA NGAY 🛒', 300, h - 175);
        ctx.restore();
      }
      requestAnimationFrame(draw);
    };
    draw();
  };

  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const update = () => setCurrentTime(v.currentTime); v.addEventListener('timeupdate', update);
    return () => v.removeEventListener('timeupdate', update);
  }, [videoUrl]);

  return (
    <div className="min-h-screen bg-black text-white font-sans flex flex-col overflow-x-hidden">
      <nav className="p-6 border-b border-white/10 flex justify-between items-center bg-black/80 backdrop-blur-xl sticky top-0 z-[100]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#FE2C55] rounded-xl flex items-center justify-center font-black italic shadow-lg">V3</div>
          <h1 className="text-xl font-black italic uppercase tracking-tighter">ViralVibe <span className="text-[#25F4EE]">ULTRA</span></h1>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setActiveTab('create')} className={`px-4 py-2 rounded-full font-bold text-[10px] uppercase ${activeTab==='create'?'bg-white text-black':'opacity-50'}`}>Tạo Video</button>
          <button onClick={() => setActiveTab('chat')} className={`px-4 py-2 rounded-full font-bold text-[10px] uppercase ${activeTab==='chat'?'bg-white text-black':'opacity-50'}`}>AI Chat</button>
          <button onClick={() => setActiveTab('live')} className={`px-4 py-2 rounded-full font-bold text-[10px] uppercase ${activeTab==='live'?'bg-[#FE2C55] animate-pulse':'opacity-50'}`}>Live Trợ Lý</button>
        </div>
      </nav>

      <main className="flex-1 p-4 lg:p-8 max-w-[1700px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        {activeTab === 'create' && (
          <>
            <div className="lg:col-span-4 space-y-6">
              <section className="bg-zinc-900/30 p-8 rounded-[3rem] border border-white/5 space-y-8 shadow-2xl overflow-y-auto max-h-[85vh] scrollbar-hide">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase opacity-30 tracking-[0.3em]">Cài đặt Studio</label>
                  <div className="grid grid-cols-2 gap-2">
                    {VIDEO_TEMPLATES.map(t => (
                      <button key={t.id} onClick={() => setSelectedTemplate(t)} className={`p-4 rounded-2xl border transition-all text-center ${selectedTemplate.id===t.id?'bg-[#25F4EE] border-transparent text-black shadow-lg shadow-[#25F4EE]/20':'bg-black/50 border-white/10 opacity-60'}`}>
                        <div className="text-3xl mb-1">{t.icon}</div>
                        <div className="text-[9px] font-black uppercase leading-tight">{t.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase opacity-30 tracking-[0.3em]">Thời lượng video</label>
                  <div className="grid grid-cols-4 gap-2">
                    {DURATION_OPTIONS.map(d => (
                      <button key={d} onClick={() => setDuration(d)} className={`py-3 rounded-xl text-xs font-black uppercase border transition-all ${duration === d ? 'bg-[#25F4EE] border-transparent text-black' : 'bg-black/30 border-white/10 opacity-50 hover:opacity-100'}`}>
                        {d}s
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase opacity-30 tracking-[0.3em]">Hiệu ứng & Typography (AI Captions)</label>
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-6 space-y-6">
                    <div className="grid grid-cols-3 gap-2">
                      {['None', 'Wiggle', 'Pulse'].map(a => (
                        <button key={a} onClick={() => setAnimType(a as AnimationType)} className={`py-2 rounded-xl text-[9px] font-black uppercase border transition-all ${animType === a ? 'bg-white text-black' : 'border-white/10 opacity-40'}`}>{a}</button>
                      ))}
                    </div>
                    {animType !== 'None' && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex justify-between text-[9px] font-black opacity-40"><span>Tốc độ AI</span><span>{animSpeed}</span></div>
                          <input type="range" min="1" max="100" value={animSpeed} onChange={e => setAnimSpeed(parseInt(e.target.value))} className="w-full accent-[#FE2C55]" />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-[9px] font-black opacity-40"><span>Cường độ AI</span><span>{animIntensity}</span></div>
                          <input type="range" min="1" max="100" value={animIntensity} onChange={e => setAnimIntensity(parseInt(e.target.value))} className="w-full accent-[#25F4EE]" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase opacity-30 tracking-[0.3em]">Chủ đề & Framework</label>
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-2xl p-5 text-sm outline-none focus:border-[#FE2C55] h-32" />
                  <div className="grid grid-cols-1 gap-2">
                    {VIRAL_FRAMEWORKS.map(f => (
                      <button key={f.id} onClick={() => setSelectedFramework(f)} className={`p-4 rounded-xl border text-left transition-all ${selectedFramework.id===f.id?'bg-[#FE2C55] border-transparent':'bg-black/30 border-white/5 opacity-50'}`}>
                        <div className="font-black text-xs">{f.label}</div>
                        <div className="text-[9px] opacity-60">{f.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase opacity-30 tracking-[0.3em]">AI Assets (Image & Style)</label>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <p className="text-[9px] font-bold opacity-30 uppercase tracking-widest">Ảnh Nhân Vật/Cảnh Gốc</p>
                      <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-white/10 rounded-3xl p-6 text-center cursor-pointer hover:border-[#FE2C55] transition-all bg-black/20 group">
                        {sourceImage ? <img src={sourceImage} className="max-h-24 mx-auto rounded-xl shadow-xl" /> : <div className="text-2xl opacity-30">📸</div>}
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => {
                          const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onloadend = () => setSourceImage(r.result as string); r.readAsDataURL(f); }
                        }} />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-[9px] font-bold opacity-30 uppercase tracking-widest">Ảnh Style Reference (AI Transfer)</p>
                      <div onClick={() => styleInputRef.current?.click()} className="border-2 border-dashed border-white/10 rounded-3xl p-6 text-center cursor-pointer hover:border-[#25F4EE] transition-all bg-black/20 group">
                        {styleImage ? <img src={styleImage} className="max-h-24 mx-auto rounded-xl shadow-xl border border-[#25F4EE]" /> : <div className="text-2xl opacity-30">🎨</div>}
                        <input type="file" ref={styleInputRef} className="hidden" accept="image/*" onChange={e => {
                          const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onloadend = () => setStyleImage(r.result as string); r.readAsDataURL(f); }
                        }} />
                      </div>
                    </div>
                  </div>
                </div>

                <button onClick={handleGenerate} disabled={loading || !sourceImage} className="w-full py-6 bg-[#FE2C55] text-white rounded-2xl font-black text-lg uppercase shadow-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 flex items-center justify-center gap-4">
                  {loading ? <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" /> : 'BẮT ĐẦU TẠO SIÊU PHẨM 🚀'}
                </button>
              </section>
            </div>

            <div className="lg:col-span-4 flex flex-col items-center">
              <div className="relative w-full max-w-[380px] aspect-[9/16] bg-zinc-950 rounded-[4rem] border-[12px] border-zinc-900 shadow-2xl overflow-hidden ring-1 ring-white/10">
                {videoUrl ? (
                  <>
                    <video ref={videoRef} src={videoUrl} loop muted className="w-full h-full object-cover" />
                    {metadata?.subtitles.find(s => currentTime >= s.start && currentTime <= s.end) && (
                      <div className="absolute bottom-[22%] left-0 w-full text-center px-10 pointer-events-none z-50">
                        <span 
                          className="bg-[#FE2C55] text-white px-6 py-3 rounded-xl font-black text-sm uppercase shadow-2xl border-2 border-white inline-block"
                          style={{
                            animation: animType === 'Wiggle' ? `wiggleAnim ${1.1 - animSpeed/100}s ease-in-out infinite` : 
                                      animType === 'Pulse' ? `pulseAnim ${1.1 - animSpeed/100}s ease-in-out infinite` : 'none',
                            transform: `scale(${1 + (animType === 'Pulse' ? (animIntensity/500) : 0)})`
                          }}
                        >
                          {metadata.subtitles.find(s => currentTime >= s.start && currentTime <= s.end)?.text}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center opacity-10 py-20 text-center">
                    <div className="w-20 h-20 border-8 border-white border-t-transparent rounded-full animate-spin mb-8" />
                    <p className="font-black text-xs uppercase tracking-[0.5em]">Viral Engine V3 Ready</p>
                  </div>
                )}
              </div>
              {videoUrl && (
                <button onClick={handleExport} disabled={exporting} className="mt-8 w-full max-w-[380px] py-5 bg-white text-black rounded-2xl font-black text-sm uppercase hover:bg-[#FE2C55] hover:text-white transition-all shadow-2xl">
                  {exporting ? `ĐANG XUẤT VIDEO AI ${Math.round(exportProgress)}%` : 'TẢI VIDEO AI (LỒNG TIẾNG + PHỤ ĐỀ) 🎥'}
                </button>
              )}
            </div>

            <div className="lg:col-span-4 space-y-6">
              <section className="bg-zinc-900/30 p-8 rounded-[3rem] border border-white/5 h-full overflow-y-auto max-h-[800px] scrollbar-hide">
                <h2 className="text-[11px] font-black uppercase text-[#25F4EE] tracking-[0.4em] mb-8 opacity-40">Viral Strategy & AI Insights</h2>
                {metadata ? (
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <p className="text-[10px] font-bold opacity-30 uppercase tracking-widest">AI Subtitles (Synchronized)</p>
                      <div className="space-y-2">
                        {metadata.subtitles.map((s, i) => (
                          <div key={i} className={`p-3 rounded-xl border text-[10px] font-bold transition-all ${currentTime >= s.start && currentTime <= s.end ? 'bg-[#FE2C55] border-transparent text-white' : 'bg-black/30 border-white/5 opacity-50'}`}>
                            {s.text}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <p className="text-[10px] font-bold opacity-30 uppercase tracking-widest">Tiêu đề TikTok</p>
                      <div className="space-y-2">
                        {metadata.catchyTitles.map((t, i) => (
                          <div key={i} className="p-3 bg-black/40 border border-white/5 rounded-xl text-[10px] font-bold italic cursor-pointer hover:border-[#25F4EE] transition-all" onClick={() => { navigator.clipboard.writeText(t); setStatus('Đã copy!'); }}>{t}</div>
                        ))}
                      </div>
                    </div>

                    {metadata.groundingLinks && metadata.groundingLinks.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold opacity-30 uppercase tracking-widest">Nguồn Grounding</p>
                        <div className="flex flex-wrap gap-2">
                          {metadata.groundingLinks.map((l, i) => (
                            <a key={i} href={l.uri} target="_blank" className="text-[9px] bg-white/5 border border-white/10 px-3 py-2 rounded-lg hover:bg-[#25F4EE] hover:text-black transition-all font-black">{l.title}</a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-40 grayscale opacity-20">
                    <p className="text-6xl mb-6">🎞️</p>
                    <p className="text-[10px] font-black uppercase tracking-[0.4em]">Chưa có dữ liệu kịch bản</p>
                  </div>
                )}
              </section>
            </div>
          </>
        )}

        {activeTab === 'chat' && (
          <div className="lg:col-span-12 max-w-4xl mx-auto w-full h-[70vh] flex flex-col bg-zinc-900/40 rounded-[3rem] border border-white/10 overflow-hidden shadow-2xl">
            <div className="flex-1 p-8 overflow-y-auto space-y-6 scrollbar-hide">
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role==='user'?'justify-end':'justify-start'}`}>
                  <div className={`max-w-[85%] p-5 rounded-[2rem] text-sm leading-relaxed ${m.role==='user'?'bg-[#FE2C55] text-white shadow-xl':'bg-black/50 border border-white/10 shadow-lg'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isThinking && <div className="text-xs opacity-30 animate-pulse italic flex items-center gap-3"><div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"></div> Gemini Pro đang tư duy...</div>}
            </div>
            <div className="p-8 bg-black/40 border-t border-white/5 flex gap-4 backdrop-blur-3xl">
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key==='Enter'&&handleChat()} className="flex-1 bg-transparent border border-white/10 rounded-2xl px-6 outline-none focus:border-[#FE2C55] text-sm" placeholder="Hỏi Gemini Pro để tinh chỉnh ý tưởng..." />
              <button onClick={handleChat} className="px-10 py-4 bg-white text-black rounded-2xl font-black text-[10px] uppercase hover:bg-[#FE2C55] hover:text-white transition-all shadow-xl">Gửi AI</button>
            </div>
          </div>
        )}

        {activeTab === 'live' && (
          <div className="lg:col-span-12 flex flex-col items-center justify-center py-20 text-center space-y-12">
            <div className={`w-48 h-48 rounded-full flex items-center justify-center text-7xl shadow-[0_0_80px_rgba(254,44,85,0.3)] transition-all duration-700 ${isLiveActive?'bg-[#FE2C55] scale-110 animate-pulse':'bg-zinc-800 opacity-50 grayscale'}`}>🎙️</div>
            <div className="space-y-4 max-w-xl">
              <h3 className="text-4xl font-black italic uppercase tracking-tighter">Live Voice Assistant</h3>
              <p className="opacity-40 text-sm leading-relaxed font-medium">Trò chuyện trực tiếp với Gemini 2.5 Native Audio để thảo luận kịch bản, cảm hứng và xu hướng TikTok 2025.</p>
            </div>
            <button onClick={startLiveConversation} className={`px-16 py-6 rounded-full font-black text-sm uppercase transition-all shadow-2xl ${isLiveActive?'bg-white text-black':'bg-[#FE2C55] text-white hover:scale-105 active:scale-95'}`}>
              {isLiveActive ? 'KẾT THÚC PHIÊN' : 'BẮT ĐẦU THẢO LUẬN'}
            </button>
          </div>
        )}
      </main>

      {status && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 px-8 py-4 bg-black border border-[#25F4EE]/30 rounded-full text-[10px] font-black uppercase text-[#25F4EE] z-[200] shadow-2xl flex items-center gap-5 animate-slide-up backdrop-blur-3xl ring-1 ring-[#25F4EE]/10">
          <div className="w-2.5 h-2.5 rounded-full bg-[#25F4EE] animate-pulse" />
          {status}
        </div>
      )}

      {ttsUrl && <audio ref={audioRef} src={ttsUrl} className="hidden" />}

      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translate(-50%, 40px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes wiggleAnim { 0% { transform: rotate(0deg); } 25% { transform: rotate(5deg); } 50% { transform: rotate(0deg); } 75% { transform: rotate(-5deg); } 100% { transform: rotate(0deg); } }
        @keyframes pulseAnim { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
        .animate-slide-up { animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        body { background: radial-gradient(circle at 50% 50%, #111 0%, #000 100%); }
      `}</style>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<ViralVibeApp />);
