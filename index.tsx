
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, Modality, GenerateContentResponse, LiveServerMessage, VideoGenerationReferenceType } from '@google/genai';

// --- Global Type Declarations ---
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}

// --- Constants & Types ---
type VideoDuration = 10 | 20 | 30 | 60;
type AnimationType = 'None' | 'Wiggle' | 'Pulse';
type ScriptBeatType = 'HOOK' | 'BODY' | 'PAYOFF' | 'CTA';

type AIVoice = { 
  id: string; 
  name: string; 
  label: string; 
  gender: 'Male' | 'Female'; 
  desc: string; 
  accent: string; 
  style: 'Năng động' | 'Trang trọng' | 'Kể chuyện' | 'Cảm xúc' 
};

const AI_VOICES: AIVoice[] = [
  { id: 'Puck', name: 'Puck', label: 'Puck (Nam)', gender: 'Male', desc: 'Giọng trẻ trung, sôi nổi, cực hợp trend TikTok.', accent: 'Năng động', style: 'Năng động' },
  { id: 'Kore', name: 'Kore', label: 'Kore (Nữ)', gender: 'Female', desc: 'Ngọt ngào, truyền cảm, phù hợp review lifestyle.', accent: 'Trẻ trung', style: 'Cảm xúc' },
  { id: 'Zephyr', name: 'Zephyr', label: 'Zephyr (Nam)', gender: 'Male', desc: 'Mạnh mẽ, tự tin, chuyên cho tin tức & tech.', accent: 'Tiêu chuẩn', style: 'Trang trọng' },
  { id: 'Charon', name: 'Charon', label: 'Charon (Nam)', gender: 'Male', desc: 'Trầm ấm, sâu lắng, phù hợp podcast & kể chuyện.', accent: 'Miền Nam', style: 'Kể chuyện' },
  { id: 'Aoide', name: 'Aoide', label: 'Aoide (Nữ)', gender: 'Female', desc: 'Huyền bí, lôi cuốn, giọng kể chuyện AI.', accent: 'Truyền cảm', style: 'Kể chuyện' },
  { id: 'Hestia', name: 'Hestia', label: 'Hestia (Nữ)', gender: 'Female', desc: 'Ấm áp, tin cậy, như một người bạn tâm tình.', accent: 'Thân thiện', style: 'Cảm xúc' },
  { id: 'Fenrir', name: 'Fenrir', label: 'Fenrir (Nam)', gender: 'Male', desc: 'Kịch tính, bí ẩn, chuẩn trailer phim.', accent: 'Kịch tính', style: 'Trang trọng' },
  { id: 'Belus', name: 'Belus', label: 'Belus (Nam)', gender: 'Male', desc: 'Chuyên nghiệp, chuẩn mực, giọng đọc radio.', accent: 'Trang trọng', style: 'Trang trọng' },
];

interface StylePreset {
  id: string;
  name: string;
  desc: string;
  preview: string;
  promptAdd: string;
}

const STYLE_PRESETS: StylePreset[] = [
  { id: 'siêu-thực', name: 'Siêu Thực CGI', desc: 'Đỉnh cao CGI, ánh sáng chân thực, chi tiết 8K.', preview: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&h=600&fit=crop', promptAdd: 'Unreal Engine 5 render, Octane render, ray tracing, photorealistic textures, volumetric lighting, masterpiece, 8k.' },
  { id: 'cinematic', name: 'Cinematic Dark', desc: 'Phong cách điện ảnh, tương phản cao, kịch tính.', preview: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&h=600&fit=crop', promptAdd: 'Deep cinematic shadows, anamorphic lens flares, moody lighting, teal and orange color grade, professional cinematography.' },
  { id: 'cyberpunk', name: 'Cyber Neon', desc: 'Tương lai, ánh sáng neon rực rỡ, hiện đại.', preview: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&h=600&fit=crop', promptAdd: 'Cyberpunk neon aesthetics, glowing signs, rainy streets reflection, futuristic vibe, high contrast neon colors.' },
  { id: 'minimal', name: 'Minimalist Clean', desc: 'Tối giản, hiện đại, tông màu sáng sủa.', preview: 'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?w=400&h=600&fit=crop', promptAdd: 'Minimalist clean aesthetic, soft natural lighting, high-key render, airy feel, bright and crisp visuals.' },
  { id: 'vibrant', name: 'Vibrant Pop', desc: 'Màu sắc rực rỡ, năng động, cực kỳ bắt mắt.', preview: 'https://images.unsplash.com/photo-1525904097878-94fb15835963?w=400&h=600&fit=crop', promptAdd: 'Vibrant pop colors, high saturation, playful lighting, catchy visuals, energetic atmosphere.' },
];

interface SubtitleSegment {
  id: string;
  text: string;
  start: number;
  end: number;
}

interface ScriptBeat {
  id: string;
  start: number;
  end: number;
  type: ScriptBeatType;
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
}

interface VideoTemplate {
  id: string;
  label: string;
  prompt: string;
  icon: string;
}

const VIDEO_TEMPLATES: VideoTemplate[] = [
  { id: 'hyper-motion-ultra', label: 'Siêu Thực Motion ✨', prompt: 'Advanced CGI rendering, high-end motion graphics, photorealistic textures, dynamic fluid simulation, cinematic 8k lighting, smooth high-FPS movement.', icon: '✨' },
  { id: 'tiktok-viral-high', label: 'Trend TikTok 🔥', prompt: 'Cinematic 9:16, high-energy movement, vibrant colors, trending TikTok aesthetic, fast cuts.', icon: '🔥' },
  { id: 'product-ad-ai', label: 'Quảng Cáo 🛍️', prompt: 'Commercial product cinematography, luxury studio lighting, product reveal, clean minimalist look.', icon: '🛍️' },
  { id: 'hyper-motion', label: 'Hyper-Motion ⚡', prompt: 'Fast-paced cinematic motion, dynamic camera transitions, photorealistic motion blur.', icon: '⚡' },
  { id: 'anime-vibe', label: 'Hoạt Hình 🎨', prompt: 'Modern anime style, vibrant cel-shaded, studio ghibli lighting, artistic flair.', icon: '🎨' },
];

const DURATION_OPTIONS: VideoDuration[] = [10, 20, 30, 60];

// --- Audio Helpers ---
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
  const [selectedStyle, setSelectedStyle] = useState<StylePreset>(STYLE_PRESETS[0]);
  const [selectedVoice, setSelectedVoice] = useState<AIVoice>(AI_VOICES[0]);
  const [duration, setDuration] = useState<VideoDuration>(20);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'create' | 'chat'>('create');
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);

  const [animType, setAnimType] = useState<AnimationType>('None');
  const [animSpeed, setAnimSpeed] = useState<number>(100);
  const [animIntensity, setAnimIntensity] = useState<number>(60);

  const [chatMessages, setChatMessages] = useState<{role: 'user'|'bot', text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const vSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const aSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio) {
        const has = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(has);
      }
    };
    checkApiKey();
    loadProject();
  }, []);

  const saveProject = () => {
    const config = {
      prompt,
      selectedTemplateId: selectedTemplate.id,
      selectedStyleId: selectedStyle.id,
      selectedVoiceId: selectedVoice.id,
      duration,
      animType,
      animSpeed,
      animIntensity,
    };
    localStorage.setItem('viralvibe_project_config', JSON.stringify(config));
    setStatus("Đã lưu cấu hình dự án! ✅");
  };

  const loadProject = () => {
    const saved = localStorage.getItem('viralvibe_project_config');
    if (saved) {
      try {
        const config = JSON.parse(saved);
        setPrompt(config.prompt || '');
        const t = VIDEO_TEMPLATES.find(x => x.id === config.selectedTemplateId);
        if (t) setSelectedTemplate(t);
        const s = STYLE_PRESETS.find(x => x.id === config.selectedStyleId);
        if (s) setSelectedStyle(s);
        const v = AI_VOICES.find(x => x.id === config.selectedVoiceId);
        if (v) setSelectedVoice(v);
        setDuration(config.duration || 20);
        setAnimType(config.animType || 'None');
        setAnimSpeed(config.animSpeed || 100);
        setAnimIntensity(config.animIntensity || 60);
      } catch (e) {
        console.error("Lỗi load dự án:", e);
      }
    }
  };

  const handleOpenKeySelection = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const handleUpscale = async () => {
    if (!sourceImage) return;
    setUpscaling(true);
    setStatus("Nâng cấp Ultra HD 4K...");
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: {
          parts: [
            { inlineData: { data: sourceImage.split(',')[1], mimeType: 'image/png' } },
            { text: "Enhance this image to ultra-high resolution. Sharpen details and maintain quality. Output 4K result." }
          ]
        },
        config: { imageConfig: { imageSize: '4K' } }
      });
      const imgPart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
      if (imgPart?.inlineData) {
        setSourceImage(`data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`);
        setStatus("Nâng cấp hoàn tất! ✨");
      }
    } catch (e: any) { setStatus("Lỗi Upscale: " + e.message); }
    finally { setUpscaling(false); }
  };

  const handleGenerate = async () => {
    if (!sourceImage) return;
    setLoading(true); setStatus(`Phân tích kịch bản viral ${duration}s...`);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const metaRes = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Tạo kịch bản TikTok cực trend ${duration}s: "${prompt}". 
        Yêu cầu cấu trúc: HOOK (mạnh mẽ), BODY (nội dung), PAYOFF (kết quả), CTA (kêu gọi).
        TRẢ VỀ JSON:
        {
          "catchyTitles": ["Tiêu đề 1", "Tiêu đề 2"],
          "hashtags": ["#viral", "#ai"],
          "visualPrompt": "Detailed CGI motion description with style: ${selectedStyle.name}. Prompt: ${selectedStyle.promptAdd}",
          "subtitles": [{"text": "Dòng chữ 1", "start": 0, "end": 2}],
          "scriptBeats": [
            {"id": "b1", "start": 0, "end": 2.5, "type": "HOOK", "description": "Hook thu hút ngay"},
            {"id": "b2", "start": 2.5, "end": 15, "type": "BODY", "description": "Nội dung chính"},
            {"id": "b3", "start": 15, "end": 18, "type": "PAYOFF", "description": "Khoảnh khắc đắt giá"},
            {"id": "b4", "start": 18, "end": 20, "type": "CTA", "description": "Kêu gọi hành động"}
          ]
        }`,
        config: {
          systemInstruction: "Bạn là Producer TikTok hàng đầu. Trả về JSON hợp lệ.",
          thinkingConfig: { thinkingBudget: 4000 }
        }
      });

      let responseText = metaRes.text || "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Lỗi xử lý AI.");
      const meta: ViralMetadata = JSON.parse(jsonMatch[0]);

      setStatus(`Lồng tiếng AI (${selectedVoice.label})...`);
      const ttsRes = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: meta.subtitles.map(s => s.text).join('... ') }] }],
        config: { 
          responseModalities: [Modality.AUDIO], 
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice.name } } } 
        }
      });
      
      const b64Audio = ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (b64Audio) {
        const audioCtx = new AudioContext({ sampleRate: 24000 });
        const buffer = await decodeAudioData(decode(b64Audio), audioCtx, 24000, 1);
        const scaleFactor = buffer.duration / duration;
        meta.subtitles = meta.subtitles.map(s => ({ ...s, start: s.start * scaleFactor, end: s.end * scaleFactor }));
        meta.scriptBeats = meta.scriptBeats.map(b => ({ ...b, start: b.start * scaleFactor, end: b.end * scaleFactor }));
        setMetadata({...meta});

        const wavBlob = await new Promise<Blob>((res) => {
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
          worker.onmessage = (e) => res(e.data);
          worker.postMessage({buffer: buffer.getChannelData(0), length: buffer.length, sampleRate: buffer.sampleRate});
        });
        setTtsUrl(URL.createObjectURL(wavBlob));
      }

      setStatus(`Render video ${selectedTemplate.label}...`);
      const finalVideoPrompt = `${selectedTemplate.prompt}. Style: ${selectedStyle.name}. Detail: ${selectedStyle.promptAdd}. Scene description: ${meta.visualPrompt}`;
      
      let op;
      if (styleImage) {
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
          image: { imageBytes: sourceImage.split(',')[1], mimeType: 'image/png' },
          config: { resolution: '720p', aspectRatio: '9:16', numberOfVideos: 1 }
        });
      }

      while (!op.done) {
        await new Promise(r => setTimeout(r, 10000));
        op = await ai.operations.getVideosOperation({ operation: op });
      }

      const videoResp = await fetch(`${op.response?.generatedVideos?.[0]?.video?.uri}&key=${process.env.API_KEY}`);
      if (!videoResp.ok) throw new Error(`Lỗi tải video từ server: ${videoResp.statusText}`);
      const videoBlob = await videoResp.blob();
      if (videoBlob.size < 1000) throw new Error("Video tải về không hợp lệ hoặc quá nhỏ.");
      
      setVideoUrl(URL.createObjectURL(videoBlob));
      setStatus("Sẵn sàng tỏa sáng! 🔥");
    } catch (e: any) { 
      if (e.message?.includes("Requested entity was not found.")) setHasApiKey(false);
      setStatus("Lỗi: " + e.message); 
    } finally { setLoading(false); }
  };

  const initAudioNodes = (video: HTMLVideoElement, audio: HTMLAudioElement) => {
    if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioDestRef.current = audioCtxRef.current.createMediaStreamDestination();
    }
    const ctx = audioCtxRef.current;
    const dest = audioDestRef.current!;
    if (!vSourceRef.current) {
        vSourceRef.current = ctx.createMediaElementSource(video);
        vSourceRef.current.connect(dest);
        vSourceRef.current.connect(ctx.destination);
    }
    if (!aSourceRef.current) {
        aSourceRef.current = ctx.createMediaElementSource(audio);
        aSourceRef.current.connect(dest);
        aSourceRef.current.connect(ctx.destination);
    }
    return dest.stream;
  };

  const handleExport = async () => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!videoUrl || !video || !metadata || !audio || !ttsUrl) {
      setStatus("Lỗi: Không tìm thấy dữ liệu video hoặc âm thanh.");
      return;
    }
    
    setExporting(true); setStatus('Đang hòa âm kịch bản viral...');
    setExportProgress(0);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const w = 720; const h = 1280; 
    canvas.width = w; canvas.height = h;
    const canvasStream = canvas.captureStream(30); 
    
    try {
        const combinedAudioStream = initAudioNodes(video, audio);
        if (audioCtxRef.current?.state === 'suspended') {
            await audioCtxRef.current.resume();
        }

        const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...combinedAudioStream.getAudioTracks()]);
        const recorder = new MediaRecorder(combinedStream, { 
          mimeType: 'video/webm;codecs=vp9', 
          videoBitsPerSecond: 12000000 
        });
        
        const chunks: Blob[] = [];
        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/mp4' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `ViralVibe_Pro_${Date.now()}.mp4`;
          a.click();
          setExporting(false);
          setStatus("Hoàn tất xuất video! ✅");
        };
        
        const startCapture = async () => {
            if (recorder.state === 'inactive') {
                try {
                    recorder.start();
                    video.muted = false;
                    await video.play();
                    await audio.play();
                    drawFrame();
                } catch (e: any) { 
                    setStatus("Lỗi xuất: " + e.message); 
                    setExporting(false); 
                    // Fix: Use type assertion to bypass narrowing as recorder.state changes after recorder.start()
                    if ((recorder.state as string) === 'recording') recorder.stop();
                }
            }
        };

        video.onseeked = startCapture;
        video.currentTime = 0; 
        audio.currentTime = 0;

        const drawFrame = () => {
          if (video.paused || video.ended) {
              if (recorder.state === 'recording') recorder.stop();
              return;
          }
          setExportProgress((video.currentTime / (video.duration || 1)) * 100);
          
          ctx.drawImage(video, 0, 0, w, h);
          
          const sub = metadata.subtitles.find(s => video.currentTime >= s.start && video.currentTime <= s.end);
          if (sub) {
            ctx.save();
            let offsetX = 0; let offsetY = 0; let scale = 1.1;
            const time = video.currentTime;
            const speedMult = animSpeed / 100;
            if (animType === 'Wiggle') {
              offsetX = Math.sin(time * 15 * speedMult) * (animIntensity / 10);
              offsetY = Math.cos(time * 12 * speedMult) * (animIntensity / 10);
            } else if (animType === 'Pulse') {
              scale = 1.1 + Math.sin(time * 12 * speedMult) * (animIntensity / 500);
            }
            ctx.translate(w / 2 + offsetX, h * 0.72 + offsetY);
            ctx.scale(scale, scale);
            ctx.shadowColor = 'black'; ctx.shadowBlur = 20;
            ctx.font = '900 75px "Anton", sans-serif'; ctx.textAlign = 'center';
            ctx.strokeStyle = 'black'; ctx.lineWidth = 12; ctx.strokeText(sub.text.toUpperCase(), 0, 0);
            ctx.fillStyle = 'white'; ctx.fillText(sub.text.toUpperCase(), 0, 0);
            ctx.restore();
          }
          requestAnimationFrame(drawFrame);
        };
    } catch (e: any) {
        setStatus("Lỗi khởi tạo recorder: " + e.message);
        setExporting(false);
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    setChatMessages(prev => [...prev, { role: 'user', text: chatInput }]);
    const input = chatInput; setChatInput(''); setIsThinking(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({ model: 'gemini-3-pro-preview', contents: input });
      setChatMessages(prev => [...prev, { role: 'bot', text: response.text || "..." }]);
    } catch (e: any) { setChatMessages(prev => [...prev, { role: 'bot', text: "Lỗi AI: " + e.message }]); }
    finally { setIsThinking(false); }
  };

  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const update = () => setCurrentTime(v.currentTime); v.addEventListener('timeupdate', update);
    return () => v.removeEventListener('timeupdate', update);
  }, [videoUrl]);

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans flex flex-col selection:bg-[#FE2C55]">
      {!hasApiKey && (
        <div className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-8 animate-slide-up">
            <div className="w-20 h-20 bg-[#FE2C55] rounded-3xl flex items-center justify-center text-4xl shadow-2xl mx-auto rotate-12">🔑</div>
            <h2 className="text-3xl font-black uppercase italic">Cần API Key</h2>
            <p className="opacity-60 text-sm leading-relaxed">Kết nối API Key để kích hoạt tính năng tạo video Siêu Thực (Hyper-Realistic) bằng Veo 3.1.
              <br/><span className="text-[10px] opacity-40">Lưu ý: Cần API Key từ dự án GCP đã thanh toán. <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline hover:text-[#FE2C55]">Xem hướng dẫn thanh toán</a>.</span>
            </p>
            <button onClick={handleOpenKeySelection} className="w-full py-5 bg-white text-black rounded-full font-black text-sm uppercase shadow-2xl">Chọn API Key</button>
          </div>
        </div>
      )}

      <nav className="p-5 border-b border-white/5 flex justify-between items-center bg-black/40 backdrop-blur-3xl sticky top-0 z-[100]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#FE2C55] to-[#25F4EE] rounded-xl flex items-center justify-center font-black italic shadow-lg -rotate-6">V3</div>
          <h1 className="text-xl font-black italic uppercase tracking-tighter">ViralVibe <span className="text-[#25F4EE]">PRO</span></h1>
        </div>
        <div className="flex bg-white/5 rounded-full p-1 border border-white/10 gap-2 px-2">
          <button onClick={() => setActiveTab('create')} className={`px-6 py-2 rounded-full font-black text-[10px] uppercase transition-all ${activeTab==='create'?'bg-white text-black shadow-lg':'opacity-40 hover:opacity-100'}`}>Sáng Tạo</button>
          <button onClick={() => setActiveTab('chat')} className={`px-6 py-2 rounded-full font-black text-[10px] uppercase transition-all ${activeTab==='chat'?'bg-white text-black shadow-lg':'opacity-40 hover:opacity-100'}`}>Tư Vấn AI</button>
          <div className="w-px h-6 bg-white/10 mx-1"></div>
          <button onClick={saveProject} className="p-2 opacity-40 hover:opacity-100 hover:text-[#25F4EE] transition-all" title="Lưu cấu hình dự án">💾</button>
        </div>
      </nav>

      <main className="flex-1 p-4 lg:p-8 max-w-[1750px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
        {activeTab === 'create' && (
          <>
            {/* Left Controls */}
            <div className="lg:col-span-4 space-y-6">
              <section className="bg-zinc-900/40 p-6 sm:p-8 rounded-[2.5rem] border border-white/5 space-y-8 shadow-2xl overflow-y-auto max-h-[85vh] scrollbar-hide backdrop-blur-xl">
                
                {/* Style Presets */}
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase opacity-40 tracking-[0.3em]">Phong Cách Mẫu AI</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {STYLE_PRESETS.map(s => (
                      <button key={s.id} onClick={() => setSelectedStyle(s)} className={`group relative aspect-[2/3] rounded-2xl overflow-hidden border-2 transition-all ${selectedStyle.id===s.id?'border-[#25F4EE] scale-105 shadow-[0_0_20px_rgba(37,244,238,0.3)]':'border-transparent opacity-60 hover:opacity-100'}`}>
                        <img src={s.preview} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-3">
                          <div className="text-[9px] font-black uppercase tracking-tighter">{s.name}</div>
                          <div className="text-[7px] opacity-60 leading-tight hidden group-hover:block">{s.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* AI Voices */}
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase opacity-40 tracking-[0.3em]">Lồng Tiếng AI (Đa Dạng)</label>
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 custom-scroll">
                    {AI_VOICES.map(v => (
                      <button key={v.id} onClick={() => setSelectedVoice(v)} className={`flex items-center gap-4 p-3 rounded-2xl border transition-all text-left ${selectedVoice.id===v.id?'bg-white text-black border-transparent shadow-xl':'bg-white/5 border-white/10 opacity-60 hover:opacity-100'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] ${v.gender==='Male'?'bg-blue-500/20 text-blue-400':'bg-pink-500/20 text-pink-400'}`}>{v.gender==='Male'?'♂':'♀'}</div>
                        <div className="flex-1">
                          <div className="font-black text-[10px] uppercase flex items-center gap-2">{v.label} <span className="text-[8px] opacity-40 bg-zinc-800 text-white px-1.5 py-0.5 rounded">{v.accent}</span></div>
                          <div className="text-[8px] opacity-60 line-clamp-1">{v.desc}</div>
                        </div>
                        <div className="text-[8px] font-bold px-2 py-1 rounded bg-zinc-100/10 uppercase tracking-tighter">{v.style}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase opacity-40 tracking-[0.3em]">Thời lượng</label>
                    <select value={duration} onChange={e => setDuration(parseInt(e.target.value) as VideoDuration)} className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-xs font-black outline-none focus:ring-1 ring-[#25F4EE]">
                      {DURATION_OPTIONS.map(d => <option key={d} value={d} className="bg-zinc-900">{d} Giây</option>)}
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase opacity-40 tracking-[0.3em]">Video Template</label>
                    <select value={selectedTemplate.id} onChange={e => setSelectedTemplate(VIDEO_TEMPLATES.find(t=>t.id===e.target.value)!)} className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-xs font-black outline-none focus:ring-1 ring-[#25F4EE]">
                      {VIDEO_TEMPLATES.map(t => <option key={t.id} value={t.id} className="bg-zinc-900">{t.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Animation Advanced Editing */}
                <div className="space-y-4 p-5 bg-white/5 rounded-3xl border border-white/10">
                   <label className="text-[10px] font-black uppercase opacity-40 tracking-[0.3em]">Edit Hiệu Ứng Chữ</label>
                   <div className="space-y-4">
                      <div className="flex items-center justify-between">
                         <span className="text-[10px] opacity-60">Kiểu:</span>
                         <div className="flex gap-2">
                           {['None', 'Wiggle', 'Pulse'].map(at => (
                             <button key={at} onClick={() => setAnimType(at as AnimationType)} className={`px-3 py-1 rounded-full text-[9px] font-black uppercase transition-all ${animType === at ? 'bg-[#FE2C55] text-white shadow-lg' : 'bg-white/5 opacity-50'}`}>{at}</button>
                           ))}
                         </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] opacity-40 uppercase font-black"><span>Tốc độ</span><span>{animSpeed}%</span></div>
                        <input type="range" min="10" max="250" value={animSpeed} onChange={e => setAnimSpeed(parseInt(e.target.value))} className="w-full accent-[#FE2C55]" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] opacity-40 uppercase font-black"><span>Cường độ</span><span>{animIntensity}</span></div>
                        <input type="range" min="10" max="200" value={animIntensity} onChange={e => setAnimIntensity(parseInt(e.target.value))} className="w-full accent-[#FE2C55]" />
                      </div>
                   </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase opacity-40 tracking-[0.3em]">Ý Tưởng & Assets</label>
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-2xl p-4 text-sm outline-none focus:border-[#FE2C55] h-32 transition-all" />
                  <div className="grid grid-cols-2 gap-3">
                    <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-white/10 rounded-2xl p-4 text-center cursor-pointer hover:border-[#FE2C55] transition-all bg-white/5 h-24 flex flex-col items-center justify-center relative overflow-hidden group">
                      {sourceImage ? <img src={sourceImage} className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:scale-110 transition-transform" /> : <div className="text-2xl opacity-20">🖼️</div>}
                      <span className="text-[8px] font-black uppercase mt-1 opacity-40 z-10">Ảnh Gốc</span>
                      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => {
                        const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onloadend = () => setSourceImage(r.result as string); r.readAsDataURL(f); }
                      }} />
                    </div>
                    <div onClick={() => styleInputRef.current?.click()} className="border-2 border-dashed border-white/10 rounded-2xl p-4 text-center cursor-pointer hover:border-[#25F4EE] transition-all bg-white/5 h-24 flex flex-col items-center justify-center relative overflow-hidden group">
                      {styleImage ? <img src={styleImage} className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:scale-110 transition-transform" /> : <div className="text-2xl opacity-20">🎨</div>}
                      <span className="text-[8px] font-black uppercase mt-1 opacity-40 z-10">Ảnh Style</span>
                      <input type="file" ref={styleInputRef} className="hidden" accept="image/*" onChange={e => {
                        const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onloadend = () => setStyleImage(r.result as string); r.readAsDataURL(f); }
                      }} />
                    </div>
                  </div>
                </div>

                <button onClick={handleGenerate} disabled={loading || !sourceImage} className="w-full py-6 bg-gradient-to-r from-[#FE2C55] to-[#ff4d72] text-white rounded-3xl font-black text-lg uppercase shadow-2xl active:scale-95 disabled:opacity-20 flex items-center justify-center gap-4 group">
                  {loading ? <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin" /> : <>TẠO VIDEO VIRAL <span className="group-hover:translate-x-2 transition-transform">🚀</span></>}
                </button>
              </section>
            </div>

            {/* Central Video Preview */}
            <div className="lg:col-span-4 flex flex-col items-center justify-center">
              <div className="relative w-full max-w-[380px] aspect-[9/16] bg-zinc-950 rounded-[4rem] border-[12px] border-zinc-900 shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden ring-1 ring-white/10">
                {videoUrl ? (
                  <>
                    <video ref={videoRef} src={videoUrl} loop muted playsInline className="w-full h-full object-cover" />
                    {metadata?.subtitles.find(s => currentTime >= s.start && currentTime <= s.end) && (
                      <div className="absolute bottom-[24%] left-0 w-full text-center px-10 pointer-events-none z-50">
                        <span className="text-white font-[900] text-xl uppercase italic tracking-tighter block drop-shadow-2xl"
                          style={{
                            fontFamily: '"Anton", sans-serif',
                            WebkitTextStroke: '6px black',
                            paintOrder: 'stroke fill',
                            animation: animType === 'Wiggle' ? `wiggleAnim ${0.4 * (100 / animSpeed)}s infinite` : animType === 'Pulse' ? `pulseAnim ${0.4 * (100 / animSpeed)}s infinite` : 'none',
                          }}
                        >{metadata.subtitles.find(s => currentTime >= s.start && currentTime <= s.end)?.text}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center opacity-10 text-center space-y-6">
                    <div className="text-6xl animate-pulse">📽️</div>
                    <p className="font-black text-[10px] uppercase tracking-[0.5em]">Studio Ready</p>
                  </div>
                )}
                
                {loading && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center p-12 text-center space-y-10 z-[60]">
                    <div className="text-5xl animate-bounce">✨</div>
                    <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden max-w-[200px]">
                      <div className="h-full bg-[#FE2C55] animate-pulse w-full shadow-[0_0_10px_#FE2C55]" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-tighter animate-pulse text-[#25F4EE]">{status}</p>
                  </div>
                )}
              </div>
              
              {videoUrl && (
                <div className="w-full max-w-[380px] mt-8 flex flex-col gap-4">
                  <button onClick={handleExport} disabled={exporting} className="w-full py-5 bg-white text-black rounded-3xl font-black text-sm uppercase shadow-2xl group relative overflow-hidden transition-all active:scale-95">
                    <div className="relative z-10 flex items-center justify-center gap-3">
                      {exporting ? `XUẤT VIDEO: ${Math.round(exportProgress)}%` : 'XUẤT VIDEO TIKTOK 📥'}
                    </div>
                    {exporting && <div className="absolute inset-0 bg-[#25F4EE]/40 transition-all" style={{ width: `${exportProgress}%` }}></div>}
                  </button>
                  <button onClick={handleUpscale} disabled={upscaling} className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl font-black text-[10px] uppercase hover:bg-white hover:text-black transition-all">
                    {upscaling ? 'ĐANG NÂNG CẤP...' : '✨ NÂNG CẤP CHẤT LƯỢNG 4K ✨'}
                  </button>
                </div>
              )}
            </div>

            {/* Right Beats Visualizer */}
            <div className="lg:col-span-4 space-y-6">
              <section className="bg-zinc-900/40 p-8 rounded-[3rem] border border-white/5 h-full overflow-y-auto max-h-[85vh] scrollbar-hide backdrop-blur-xl">
                <h2 className="text-[12px] font-black uppercase text-[#25F4EE] tracking-[0.4em] mb-12 opacity-50 flex items-center gap-3">
                  <div className="w-3 h-3 bg-[#25F4EE] rounded-full animate-ping" /> Kịch Bản Viral AI
                </h2>
                {metadata ? (
                  <div className="space-y-8">
                    {metadata.scriptBeats.map((beat) => {
                      const isActive = currentTime >= beat.start && currentTime <= beat.end;
                      return (
                        <div key={beat.id} className={`relative pl-10 pb-10 border-l-2 transition-all duration-700 ${isActive ? 'border-[#FE2C55] opacity-100 translate-x-3 scale-105' : 'border-white/5 opacity-20 grayscale'}`}>
                          <div className={`absolute -left-[11px] top-0 w-5 h-5 rounded-full border-4 border-[#050505] shadow-2xl transition-all ${isActive ? 'bg-[#FE2C55] scale-125 shadow-[0_0_15px_#FE2C55]' : 'bg-zinc-800'}`}></div>
                          <div className={`p-6 rounded-[2rem] border transition-all ${isActive ? 'bg-[#FE2C55]/10 border-[#FE2C55]/30 shadow-xl' : 'bg-white/5 border-white/10'}`}>
                            <div className="flex justify-between items-center mb-2">
                              <span className={`text-[11px] font-black uppercase tracking-widest ${beat.type === 'HOOK' ? 'text-[#FE2C55]' : beat.type === 'CTA' ? 'text-[#25F4EE]' : isActive ? 'text-white' : 'opacity-60'}`}>{beat.type}</span>
                              <span className="text-[10px] font-bold opacity-30">{beat.start.toFixed(1)}s - {beat.end.toFixed(1)}s</span>
                            </div>
                            <p className="text-sm font-bold leading-relaxed">{beat.description}</p>
                            {isActive && (
                               <div className="mt-4 h-1 bg-[#FE2C55]/20 rounded-full overflow-hidden">
                                  <div className="h-full bg-[#FE2C55] transition-all duration-100" style={{ width: `${((currentTime - beat.start) / (beat.end - beat.start)) * 100}%` }}></div>
                               </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div className="p-8 bg-gradient-to-br from-[#FE2C55]/10 to-[#25F4EE]/10 rounded-[2.5rem] border border-white/5 text-center mt-6">
                      <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-2">Chỉ số Viral Dự kiến</p>
                      <div className="text-6xl font-black italic tracking-tighter text-white drop-shadow-lg animate-pulse">99.9<span className="text-xl opacity-50 not-italic ml-1">%</span></div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-40 opacity-20">
                    <p className="text-7xl mb-8">⚡</p>
                    <p className="text-[11px] font-black uppercase tracking-[0.4em]">Đang đợi ý tưởng...</p>
                  </div>
                )}
              </section>
            </div>
          </>
        )}

        {activeTab === 'chat' && (
          <div className="lg:col-span-12 max-w-6xl mx-auto w-full h-[75vh] flex flex-col bg-zinc-900/40 rounded-[4rem] border border-white/5 overflow-hidden shadow-2xl backdrop-blur-2xl">
            <div className="flex-1 p-10 overflow-y-auto space-y-10 scrollbar-hide">
              {chatMessages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-10 space-y-8">
                  <div className="text-9xl">💡</div>
                  <p className="text-2xl font-black italic uppercase tracking-[0.3em]">Hỏi chuyên gia Viral AI</p>
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role==='user'?'justify-end':'justify-start'} animate-in fade-in slide-in-from-bottom-4`}>
                  <div className={`max-w-[75%] p-8 rounded-[3rem] text-sm leading-relaxed ${m.role==='user'?'bg-white text-black font-black shadow-2xl':'bg-white/5 border border-white/10 shadow-lg text-white'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isThinking && <div className="text-[11px] font-black uppercase tracking-widest opacity-40 animate-pulse ml-4 flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-[#FE2C55] animate-ping" /> AI đang tư duy...</div>}
            </div>
            <div className="p-10 bg-black/40 border-t border-white/5 flex gap-5 backdrop-blur-3xl">
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key==='Enter'&&handleChat()} className="flex-1 bg-white/5 border border-white/10 rounded-full px-10 outline-none focus:border-[#FE2C55] text-sm py-6 transition-all" placeholder="Đặt câu hỏi về kịch bản viral..." />
              <button onClick={handleChat} className="px-14 py-6 bg-white text-black rounded-full font-black text-[12px] uppercase hover:bg-[#FE2C55] hover:text-white transition-all shadow-xl active:scale-95">Gửi AI</button>
            </div>
          </div>
        )}
      </main>

      {status && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 px-10 py-5 bg-black/95 border border-white/10 rounded-full text-[12px] font-black uppercase tracking-[0.1em] z-[200] shadow-2xl flex items-center gap-6 animate-slide-up backdrop-blur-3xl ring-1 ring-[#FE2C55]/30">
          <div className="w-3 h-3 rounded-full bg-[#FE2C55] animate-ping" />
          <span className="text-white">{status}</span>
        </div>
      )}

      <audio ref={audioRef} className="hidden" crossOrigin="anonymous" />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton&display=swap');
        @keyframes slideUp { from { opacity: 0; transform: translate(-50%, 50px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes wiggleAnim { 0%, 100% { transform: rotate(0deg) scale(1.1); } 25% { transform: rotate(3deg) scale(1.15); } 75% { transform: rotate(-3deg) scale(1.15); } }
        @keyframes pulseAnim { 0%, 100% { transform: scale(1.1); } 50% { transform: scale(1.2); } }
        .animate-slide-up { animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        body { background: #050505; color: white; -webkit-font-smoothing: antialiased; }
        input[type="range"] { -webkit-appearance: none; background: rgba(255,255,255,0.05); height: 4px; border-radius: 5px; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; background: #FE2C55; border-radius: 50%; cursor: pointer; border: 2px solid white; }
      `}</style>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<ViralVibeApp />);
