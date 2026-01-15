
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, Modality, VideoGenerationReferenceType } from '@google/genai';

// --- Constants & Types ---
type AspectRatio = '1:1' | '9:16' | '16:9';
type TextAlignment = 'left' | 'center' | 'right';
type TextAnimation = 'none' | 'fade' | 'bounce' | 'typewriter' | 'slide' | 'glitch';
type TransitionEffect = 'smooth' | 'wipe' | 'fade-to-black' | 'slide-in' | 'zoom';
type VideoResolution = '720p' | '1080p' | '4K-AI';
type FPSOption = 24 | 30 | 60;
type FilterOption = 'none' | 'vintage' | 'noir' | 'vibrant';
type ExportPreset = 'standard' | 'ultra-pro';
type AIVoice = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';

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
}

interface VisualTheme {
  id: string;
  label: string;
  prompt: string;
  color: string;
}

interface AdvancedConfig {
  fontSize: number;
  alignment: TextAlignment;
  animation: TextAnimation;
  transition: TransitionEffect;
  resolution: VideoResolution;
  hdrBoost: boolean;
  fps: FPSOption;
  filter: FilterOption;
  themeId: string;
  exportPreset: ExportPreset;
  includeSubtitles: boolean;
  includeVoiceover: boolean;
  selectedVoice: AIVoice;
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
  { id: 'ai-product-ad', label: 'AI Product Ad', prompt: 'Dynamic product reveal, hyper-realistic 8k macro textures, vibrant studio lighting, fast paced transitions, depth of field shifts, luxury aesthetic.', icon: '🛍️', description: 'Quảng cáo sản phẩm thế hệ mới, tập trung vào chi tiết và sự bùng nổ thị giác.', tag: 'CONVERSION-BOOST' },
  { id: 'jewelry-bracelet', label: 'Phụ kiện Vòng tay', prompt: 'Luxury jewelry commercial, macro close-up shots of an elegant bracelet, shimmering diamonds and gold reflections, soft silk background, professional lighting, cinematic slow motion, ultra-detailed textures.', icon: '📿', description: 'Khoe vẻ đẹp tinh tế của vòng tay thời trang, phụ kiện cao cấp với ánh sáng lấp lánh.', tag: 'GLAMOUR' },
  { id: 'premium-ads', label: 'Premium Ads', prompt: 'Luxury product commercial, ultra-high-definition macro shots, elegant golden lighting, smooth camera glides, high contrast.', icon: '💎', description: 'Quảng cáo sản phẩm sang trọng, ánh sáng vàng kim, cực kỳ sắc nét.', tag: 'HIGH-CLASS' },
  { id: 'vlog', label: 'Daily Vlog', prompt: 'Cinematic daily vlog style, warm lighting, natural transitions.', icon: '📹', description: 'Ghi lại khoảnh khắc thường nhật với màu sắc ấm áp.', tag: 'TRENDING' },
  { id: 'lofi', label: 'Lofi Study', prompt: 'Anime lofi aesthetic, grainy texture, cozy indoor lighting, retro vibes.', icon: '📖', description: 'Hoài cổ, nhẹ nhàng cho các video chill, học tập.', tag: 'AESTHETIC' },
  { id: 'cyberpunk', label: 'Cyberpunk', prompt: 'Neon city cyberpunk aesthetic, glitchy textures, high contrast lighting.', icon: '🌃', description: 'Tương lai, ánh sáng neon mạnh mẽ và hiệu ứng glitch.', tag: 'FUTURISTIC' },
  { id: 'cinematic', label: 'Điện ảnh', prompt: 'Epic cinematic drone shots, anamorphic flares, movie color grade, slow motion.', icon: '🎬', description: 'Hùng vĩ, chuyên nghiệp như phim điện ảnh Hollywood.', tag: 'PRO-GRADE' },
];

const VISUAL_THEMES: VisualTheme[] = [
  { id: 'none', label: 'Mặc định', prompt: 'balanced colors, natural lighting', color: '#555555' },
  { id: 'golden', label: 'Golden Hour', prompt: 'warm cinematic golden hour lighting, soft shadows, ethereal glow, orange and teal color grade', color: '#FFD700' },
  { id: 'neon', label: 'Midnight Neon', prompt: 'vibrant neon colors, cyberpunk lighting, deep blues and pinks, reflective surfaces, atmospheric fog', color: '#FF00FF' },
  { id: 'minimal', label: 'Clean Minimal', prompt: 'minimalist aesthetic, soft diffuse lighting, neutral tones, high clarity, bright backgrounds, extremely sharp', color: '#FFFFFF' },
  { id: 'vintage', label: 'Retro 90s', prompt: 'retro vintage aesthetic, film grain, nostalgic color palette, cinematic film stock feel', color: '#FFA500' },
];

const AI_VOICES: { id: AIVoice, label: string }[] = [
  { id: 'Kore', label: 'Kore (Mạnh mẽ)' },
  { id: 'Puck', label: 'Puck (Năng động)' },
  { id: 'Zephyr', label: 'Zephyr (Trầm ấm)' },
  { id: 'Charon', label: 'Charon (Chuyên nghiệp)' },
  { id: 'Fenrir', label: 'Fenrir (Sâu lắng)' }
];

const FILTERS: { id: FilterOption, label: string, css: string }[] = [
  { id: 'none', label: 'Gốc', css: '' },
  { id: 'vintage', label: 'Vintage', css: 'sepia(0.6) contrast(1.1) brightness(0.9) saturate(0.85)' },
  { id: 'noir', label: 'Noir', css: 'grayscale(1) contrast(1.4) brightness(0.9)' },
  { id: 'vibrant', label: 'Vibrant', css: 'saturate(1.7) contrast(1.15) brightness(1.05)' }
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
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
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

const drawTikTokUIOnCanvas = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const s = w / 1080;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 15 * s;
  ctx.fillStyle = 'white';
  const rx = w - 110 * s;
  const by = h * 0.52;
  const items = [{ icon: '❤️', label: '842K' }, { icon: '💬', label: '12K' }, { icon: '↗️', label: '45K' }, { icon: '⭐', label: '32K' }];
  items.forEach((item, i) => {
    ctx.textAlign = 'center';
    ctx.font = `${64 * s}px "Segoe UI Symbol", sans-serif`;
    ctx.fillText(item.icon, rx, by + i * 145 * s);
    ctx.font = `bold ${28 * s}px sans-serif`;
    ctx.fillText(item.label, rx, by + i * 145 * s + 55 * s);
  });
  ctx.restore();
};

const ViralVibeApp: React.FC = () => {
  const [apiKeySelected, setApiKeySelected] = useState<boolean>(false);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [ttsUrl, setTtsUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ViralMetadata | null>(null);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isUpscaling, setIsUpscaling] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [prompt, setPrompt] = useState<string>('Quảng cáo đồng hồ sang trọng');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [selectedTemplate, setSelectedTemplate] = useState<VideoTemplate>(VIDEO_TEMPLATES[0]);
  const [includeTikTokUI, setIncludeTikTokUI] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  
  const [advancedConfig, setAdvancedConfig] = useState<AdvancedConfig>({
    fontSize: 80,
    alignment: 'center',
    animation: 'bounce',
    transition: 'smooth',
    resolution: '1080p',
    hdrBoost: true,
    fps: 30,
    filter: 'none',
    themeId: 'none',
    exportPreset: 'standard',
    includeSubtitles: true,
    includeVoiceover: true,
    selectedVoice: 'Kore'
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);

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

  useEffect(() => {
    if (videoRef.current && videoUrl) {
      videoRef.current.load();
    }
  }, [videoUrl]);

  useEffect(() => {
    if (audioRef.current && ttsUrl) {
      audioRef.current.load();
    }
  }, [ttsUrl]);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setApiKeySelected(true);
    }
  };

  const handleUpscaleImage = async () => {
    if (!sourceImage) return;
    setIsUpscaling(true);
    setStatus('Đang dùng AI nâng cấp chất lượng ảnh nguồn...');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { inlineData: { data: sourceImage.split(',')[1], mimeType: 'image/jpeg' } },
            { text: 'Upscale and enhance this image. Boost resolution and clarity. Output only the enhanced image data.' }
          ]
        }
      });
      
      const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
      if (part?.inlineData) {
        setSourceImage(`data:image/png;base64,${part.inlineData.data}`);
        setStatus('Nâng cấp ảnh hoàn tất.');
      }
    } catch (e: any) {
      console.error(e);
      setStatus(`Lỗi nâng cấp: ${e.message}`);
    } finally {
      setIsUpscaling(false);
    }
  };

  const handleGenerate = async () => {
    if (!sourceImage) return;
    setLoading(true);
    setStatus('Đang thiết kế kịch bản Viral 20s...');
    setMetadata(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (ttsUrl) URL.revokeObjectURL(ttsUrl);
    setVideoUrl(null);
    setTtsUrl(null);
    setIsPlaying(false);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const metaRes = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Chủ đề: ${prompt}. Mẫu: ${selectedTemplate.label}. Hãy tạo kịch bản viral TikTok 20 giây với JSON gồm tiêu đề, hashtags, và phụ đề timestamps kéo dài từ 0s đến 20s. Phụ đề phải cực kỳ kịch tính.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              catchyTitles: { type: Type.ARRAY, items: { type: Type.STRING } },
              hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
              description: { type: Type.STRING },
              subtitles: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: { text: { type: Type.STRING }, start: { type: Type.NUMBER }, end: { type: Type.NUMBER } }
                }
              }
            }
          }
        }
      });

      // Fix: metaRes.text might be inferred as unknown in some environments, cast to string
      const metaData = JSON.parse((metaRes.text as string) || '{}');
      const meta: ViralMetadata = {
        ...metaData,
        subtitles: (metaData.subtitles || []).map((s: any, idx: number) => ({ ...s, id: `sub-${idx}` }))
      };
      setMetadata(meta);

      if (advancedConfig.includeVoiceover) {
        setStatus('Đang lồng tiếng AI kịch tính...');
        const speechText = meta.subtitles.map(s => s.text).join('. ');
        const ttsRes = await ai.models.generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: [{ parts: [{ text: `Đọc lôi cuốn: ${speechText}` }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: advancedConfig.selectedVoice } } }
          }
        });

        const b64Audio = ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (b64Audio) {
          const audioCtx = new AudioContext({ sampleRate: 24000 });
          const audioBuffer = await decodeAudioData(decode(b64Audio), audioCtx, 24000, 1);
          setTtsUrl(URL.createObjectURL(bufferToWave(audioBuffer, audioBuffer.length)));
        }
      }

      const themePrompt = VISUAL_THEMES.find(t => t.id === advancedConfig.themeId)?.prompt || '';
      const transitionStr = advancedConfig.transition === 'smooth' ? '' : `. Hiệu ứng ${advancedConfig.transition}.`;
      
      // Step 1: Initial Generation (5-6s)
      setStatus('Render Clip 1 (Veo 3.1)...');
      let op = await ai.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: `${selectedTemplate.prompt}. ${prompt}. ${themePrompt}${transitionStr}`,
        config: { 
          resolution: '720p', 
          aspectRatio: '16:9',
          referenceImages: [{
            image: { imageBytes: sourceImage.split(',')[1], mimeType: 'image/jpeg' },
            referenceType: VideoGenerationReferenceType.ASSET
          }]
        }
      });

      while (!op.done) {
        await new Promise(r => setTimeout(r, 8000));
        op = await ai.operations.getVideosOperation({ operation: op });
        if (op.error) throw new Error(op.error.message);
      }

      let currentVideo = op.response?.generatedVideos?.[0]?.video;
      if (!currentVideo) throw new Error("Clip 1 failed.");

      // Step 2: Extend (adds 7s, total ~12s)
      setStatus('Đang mở rộng Clip 2 (+7s)...');
      op = await ai.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: `Tiếp tục kịch bản: ${prompt}. Sự kiện bất ngờ xảy ra. ${themePrompt}`,
        video: currentVideo,
        config: { resolution: '720p', aspectRatio: '16:9' }
      });

      while (!op.done) {
        await new Promise(r => setTimeout(r, 8000));
        op = await ai.operations.getVideosOperation({ operation: op });
        if (op.error) break; // If extension fails, we might still have the previous clip
      }
      
      if (op.response?.generatedVideos?.[0]?.video) {
        currentVideo = op.response.generatedVideos[0].video;
      }

      // Step 3: Second Extension (adds 7s, total ~19s)
      setStatus('Đang hoàn thiện Clip 3 (Tổng ~20s)...');
      op = await ai.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: `Kết thúc kịch bản bùng nổ: ${prompt}. ${themePrompt}`,
        video: currentVideo,
        config: { resolution: '720p', aspectRatio: '16:9' }
      });

      while (!op.done) {
        await new Promise(r => setTimeout(r, 8000));
        op = await ai.operations.getVideosOperation({ operation: op });
        if (op.error) break;
      }

      if (op.response?.generatedVideos?.[0]?.video) {
        currentVideo = op.response.generatedVideos[0].video;
      }

      // Fix: Cast currentVideo.uri to string | undefined to handle potentially unknown types in template literals or assignment
      const downloadLink = currentVideo?.uri as string | undefined;
      if (!downloadLink) throw new Error("Không thể lấy liên kết tải video.");
      
      const videoResp = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
      if (!videoResp.ok) throw new Error(`Lỗi tải video: ${videoResp.statusText}`);
      const videoBlob = await videoResp.blob();
      setVideoUrl(URL.createObjectURL(videoBlob));
      
      setStatus('Viral Video 20s đã sẵn sàng!');
    } catch (e: any) {
      console.error(e);
      setStatus(`Lỗi sáng tạo: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!videoUrl || !videoRef.current || !metadata) return;
    setExporting(true);
    setExportProgress(0);
    setStatus('Đang kết xuất video TikTok hoàn chỉnh...');

    const video = videoRef.current;
    if (video.readyState < 4) {
      await new Promise(resolve => { video.oncanplaythrough = resolve; });
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false })!;
    
    const qualityMultiplier = advancedConfig.exportPreset === 'ultra-pro' ? 1.5 : 1;
    const w = 1080 * qualityMultiplier;
    const h = 1920 * qualityMultiplier;
    canvas.width = w; canvas.height = h;

    if (!ctx.roundRect) {
      ctx.roundRect = function (x: number, y: number, w: number, h: number, r: number) {
        this.beginPath();
        this.moveTo(x + r, y);
        this.arcTo(x + w, y, x + w, y + h, r);
        this.arcTo(x + w, y + h, x, y + h, r);
        this.arcTo(x, y + h, x, y, r);
        this.arcTo(x, y, x + w, y, r);
        this.closePath();
        return this;
      };
    }

    const stream = canvas.captureStream(advancedConfig.fps);
    const audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    
    const videoSource = audioCtx.createMediaElementSource(video);
    videoSource.connect(dest);
    
    if (advancedConfig.includeVoiceover && audioRef.current && ttsUrl) {
      const ttsSource = audioCtx.createMediaElementSource(audioRef.current);
      ttsSource.connect(dest);
    }

    const recorder = new MediaRecorder(new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]), {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: advancedConfig.exportPreset === 'ultra-pro' ? 80000000 : 40000000
    });
    recorderRef.current = recorder;

    const chunks: Blob[] = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ViralVibe_TikTok_20s_${Date.now()}.mp4`;
      a.click();
      setExporting(false);
      recorderRef.current = null;
    };

    video.currentTime = 0;
    if (audioRef.current) audioRef.current.currentTime = 0;
    
    try {
      await video.play();
      if (audioRef.current) await audioRef.current.play();
      recorder.start();
    } catch (e) {
      recorder.start();
    }

    const renderLoop = () => {
      if (!exporting || video.paused || video.ended) {
        if (recorder.state === 'recording') recorder.stop();
        return;
      }
      
      setExportProgress((video.currentTime / video.duration) * 100);
      
      ctx.save();
      let activeFilter = FILTERS.find(f => f.id === advancedConfig.filter)?.css || '';
      if (advancedConfig.hdrBoost) activeFilter += ' contrast(1.2) saturate(1.2)';
      ctx.filter = activeFilter;
      
      // Drawing landscape video into portrait frame
      const vRatio = video.videoWidth / video.videoHeight;
      const targetW = h * vRatio;
      ctx.drawImage(video, (w - targetW) / 2, 0, targetW, h);
      ctx.restore();
      
      if (advancedConfig.includeSubtitles) {
        const sub = metadata.subtitles.find(s => video.currentTime >= s.start && video.currentTime <= s.end);
        if (sub) {
          ctx.save();
          const sFac = w / 1080;
          const fSize = sFac * advancedConfig.fontSize;
          ctx.font = `900 ${fSize}px "Be Vietnam Pro", sans-serif`;
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'center';
          
          let text = sub.text.toUpperCase();
          const metrics = ctx.measureText(text);
          const bw = metrics.width + (80 * sFac);
          const bh = fSize + (40 * sFac);
          
          ctx.fillStyle = 'black';
          ctx.roundRect((w - bw) / 2, h * 0.7 - bh / 2, bw, bh, 20 * sFac);
          ctx.fill();

          ctx.fillStyle = '#FE2C55';
          ctx.fillText(text, w / 2, h * 0.7);
          ctx.restore();
        }
      }

      if (includeTikTokUI) drawTikTokUIOnCanvas(ctx, w, h);
      requestAnimationFrame(renderLoop);
    };
    renderLoop();
  };

  const togglePlayback = async () => {
    if (videoRef.current && videoUrl) {
      if (isPlaying) {
        videoRef.current.pause();
        if (audioRef.current) audioRef.current.pause();
        setIsPlaying(false);
      } else {
        try {
          const vPlay = videoRef.current.play();
          playPromiseRef.current = vPlay;
          if (audioRef.current) audioRef.current.play();
          await vPlay;
          setIsPlaying(true);
        } catch (e) {}
      }
    }
  };

  const stopPreview = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setIsPlaying(false);
    }
  };

  const updateSubtitle = (id: string, text: string) => {
    if (metadata) {
      const newSubs = metadata.subtitles.map(s => s.id === id ? { ...s, text } : s);
      setMetadata({ ...metadata, subtitles: newSubs });
    }
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const update = () => setCurrentTime(v.currentTime);
    v.addEventListener('timeupdate', update);
    return () => v.removeEventListener('timeupdate', update);
  }, [videoUrl]);

  const activeSubtitle = metadata?.subtitles.find(s => currentTime >= s.start && currentTime <= s.end);

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans">
      {/* Header */}
      <nav className="p-6 border-b border-white/5 flex justify-between items-center backdrop-blur-3xl sticky top-0 z-50 bg-black/80">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#FE2C55] rounded-2xl flex items-center justify-center font-black italic shadow-[0_0_50px_rgba(254,44,85,0.4)]">V</div>
          <h1 className="text-2xl font-black italic uppercase tracking-tighter">ViralVibe <span className="text-[#FE2C55]">STUDIO</span></h1>
        </div>
        <div className="flex items-center gap-6">
          {!apiKeySelected && (
            <button onClick={handleSelectKey} className="bg-white text-black px-8 py-3 rounded-full font-black text-xs tracking-widest uppercase hover:bg-[#FE2C55] hover:text-white transition-all">
              ACTIVATE API
            </button>
          )}
        </div>
      </nav>

      <main className="flex-1 p-8 max-w-[1750px] mx-auto w-full grid grid-cols-1 lg:grid-cols-4 gap-10">
        {/* Left Panel */}
        <div className="lg:col-span-1 space-y-8">
          <section className="bg-zinc-900/40 p-6 rounded-[3rem] border border-white/5 space-y-6 shadow-2xl overflow-y-auto max-h-[80vh] custom-scrollbar">
            <h2 className="text-[10px] font-black uppercase text-[#FE2C55] tracking-widest">1. CHỌN MẪU VIDEO</h2>
            <div className="grid grid-cols-1 gap-3">
              {VIDEO_TEMPLATES.map(t => (
                <button key={t.id} onClick={() => setSelectedTemplate(t)} className={`flex flex-col gap-2 p-5 rounded-3xl border transition-all text-left ${selectedTemplate.id === t.id ? 'bg-white text-black border-white shadow-xl' : 'bg-black/40 border-white/5 opacity-70 hover:opacity-100'}`}>
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{t.icon}</span>
                    <span className="font-black text-[12px] uppercase tracking-wider">{t.label}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="pt-6 border-t border-white/5">
              <h2 className="text-[10px] font-black uppercase text-[#25F4EE] tracking-widest">2. CHỦ ĐỀ HÌNH ẢNH</h2>
              <div className="grid grid-cols-1 gap-2 mt-4">
                {VISUAL_THEMES.map(theme => (
                  <button key={theme.id} onClick={() => setAdvancedConfig({...advancedConfig, themeId: theme.id})} className={`p-4 rounded-2xl border text-left flex items-center gap-4 ${advancedConfig.themeId === theme.id ? 'bg-white text-black' : 'bg-black/40 border-white/5'}`}>
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.color }}></div>
                    <span className="font-black text-[11px] uppercase">{theme.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Center Panel */}
        <div className="lg:col-span-2 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section className="bg-zinc-900/40 p-8 rounded-[3.5rem] border border-white/5 space-y-6">
               <h2 className="text-[10px] font-black uppercase text-[#FE2C55]">Ý TƯỞNG CỦA BẠN</h2>
               <textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="w-full bg-black/60 border border-white/10 rounded-3xl px-6 py-5 outline-none font-bold text-sm min-h-[120px]" placeholder="Mô tả nội dung video viral..." />
               <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-white/10 rounded-[2.5rem] p-8 text-center cursor-pointer hover:border-[#FE2C55]/50 transition-all bg-black/20">
                  {sourceImage ? (
                    <img src={sourceImage} className="max-h-48 mx-auto rounded-3xl" alt="Source" />
                  ) : (
                    <div className="opacity-30">
                      <p className="text-4xl mb-4">📸</p>
                      <p className="font-black uppercase text-[10px]">CHỌN ẢNH GỐC</p>
                    </div>
                  )}
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => {
                    const f = e.target.files?.[0];
                    if(f) { const r = new FileReader(); r.onloadend = () => setSourceImage(r.result as string); r.readAsDataURL(f); }
                  }} />
                </div>
            </section>

            <div className="flex flex-col gap-6">
              <div className={`relative mx-auto w-full aspect-[9/16] bg-black rounded-[4rem] overflow-hidden border-[16px] border-zinc-900 shadow-2xl group`}>
                {videoUrl ? (
                  <>
                    <video ref={videoRef} src={videoUrl} loop muted={!isPlaying} className="w-full h-full object-cover" />
                    {advancedConfig.includeSubtitles && activeSubtitle && (
                      <div className="absolute inset-x-6 bottom-[25%] z-50 text-center">
                        <span className="bg-black/95 text-[#FE2C55] px-5 py-3 rounded-2xl font-black text-[12px] uppercase border border-white/10 shadow-2xl inline-block">{activeSubtitle.text}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-50 gap-5">
                        <button onClick={togglePlayback} className="bg-white text-black w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-2xl hover:scale-110 transition-all">{isPlaying ? '⏸' : '▶️'}</button>
                        <button onClick={stopPreview} className="bg-white text-black w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-2xl hover:scale-110 transition-all">⏹</button>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900/10 gap-6 opacity-20">
                    <div className="text-8xl italic font-black text-white/10 animate-pulse">VEO</div>
                  </div>
                )}
                {ttsUrl && <audio ref={audioRef} src={ttsUrl} loop hidden />}
              </div>
              <button onClick={handleGenerate} disabled={loading || !sourceImage || !apiKeySelected} className="w-full py-8 bg-white text-black rounded-[2.5rem] font-black text-xl uppercase shadow-2xl hover:scale-[1.02] transition-all disabled:opacity-20 flex items-center justify-center gap-5">
                {loading ? <span className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin"></span> : <>GENERATE VIRAL MAGIC (20s) ⚡</>}
              </button>
            </div>
          </div>

          {metadata && (
            <section className="bg-zinc-900/40 p-8 rounded-[3.5rem] border border-white/5 space-y-6 shadow-2xl animate-slide-up">
               <h2 className="text-[11px] font-black uppercase text-[#FE2C55]">BIÊN TẬP PHỤ ĐỀ XU HƯỚNG</h2>
               <div className="grid grid-cols-1 gap-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-3">
                 {metadata.subtitles.map((sub) => (
                   <div key={sub.id} className={`flex items-center gap-6 p-6 rounded-[2rem] border transition-all cursor-pointer ${currentTime >= sub.start && currentTime <= sub.end ? 'bg-[#FE2C55]/15 border-[#FE2C55]/60' : 'bg-black/30 border-white/5'}`} onClick={() => { if(videoRef.current) videoRef.current.currentTime = sub.start; }}>
                     <div className="w-24 text-[10px] font-black opacity-30 border-r border-white/10 pr-4 text-center">
                       <span>{sub.start.toFixed(1)}s</span>
                     </div>
                     <input type="text" value={sub.text} onClick={(e) => e.stopPropagation()} onChange={(e) => updateSubtitle(sub.id, e.target.value)} className="flex-1 bg-transparent border-none outline-none font-black text-lg text-white" />
                   </div>
                 ))}
               </div>
            </section>
          )}
        </div>

        {/* Right Panel */}
        <div className="lg:col-span-1 space-y-8">
           <section className="bg-zinc-900/40 p-8 rounded-[3rem] border border-white/5 space-y-8 shadow-2xl">
             <h2 className="text-[10px] font-black uppercase text-[#FE2C55]">DUBBING & SUBTITLES</h2>
             <div className="space-y-5">
                <div className="flex items-center justify-between p-5 bg-black/40 rounded-3xl">
                  <span className="text-[10px] font-black uppercase">LỒNG TIẾNG AI</span>
                  <button onClick={() => setAdvancedConfig({...advancedConfig, includeVoiceover: !advancedConfig.includeVoiceover})} className={`w-14 h-8 rounded-full flex items-center px-1.5 transition-all ${advancedConfig.includeVoiceover ? 'bg-[#FE2C55]' : 'bg-white/10'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full transform transition-all ${advancedConfig.includeVoiceover ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
                <div className="space-y-4">
                  <label className="text-[9px] font-black opacity-40">GIỌNG ĐỌC</label>
                  <div className="grid grid-cols-1 gap-2">
                    {AI_VOICES.map(v => (
                      <button key={v.id} onClick={() => setAdvancedConfig({...advancedConfig, selectedVoice: v.id})} className={`p-4 rounded-2xl border text-[10px] font-black transition-all text-left ${advancedConfig.selectedVoice === v.id ? 'bg-[#25F4EE] text-black border-[#25F4EE]' : 'bg-black/40 border-white/5 opacity-60'}`}>{v.label}</button>
                    ))}
                  </div>
                </div>
             </div>
             <div className="pt-6">
                <button onClick={handleExport} disabled={exporting || !videoUrl} className="w-full py-7 bg-[#FE2C55] rounded-full font-black text-base uppercase tracking-widest shadow-2xl hover:scale-105 transition-all">
                  {exporting ? `RENDER ${Math.round(exportProgress)}%` : 'TẢI VIDEO TIKTOK 📥'}
                </button>
             </div>
           </section>
        </div>
      </main>

      {status && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 px-12 py-6 bg-black/95 backdrop-blur-3xl border border-[#FE2C55]/50 rounded-full text-[12px] font-black uppercase tracking-[0.3em] text-[#FE2C55] z-[150] shadow-3xl animate-slide-up flex items-center gap-5">
          <div className="w-3 h-3 rounded-full bg-[#FE2C55] animate-ping"></div>{status}
        </div>
      )}

      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translate(-50%, 60px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .animate-slide-up { animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 30px; }
      `}</style>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<ViralVibeApp />);
