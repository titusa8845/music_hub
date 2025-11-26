import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, VolumeX, Volume2, Mic, Activity, AlertTriangle, Radio, Music2, Settings2, Waves } from 'lucide-react';
import { getAudioContext, autoCorrelate, getNoteInfo } from '../utils/audio';
import { WaveType } from '../types';

type ExperimentMode = 'playback' | 'recording';

const WaveExperiment: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // App State
  const [mode, setMode] = useState<ExperimentMode>('playback');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false); // For Playback freeze
  const [isMicActive, setIsMicActive] = useState(false);
  const [micMonitor, setMicMonitor] = useState(false);
  
  // Parameters
  const [frequency, setFrequency] = useState(440);
  const [volume, setVolume] = useState(0.5);
  const [waveType, setWaveType] = useState<WaveType>('sine');
  const [noiseGate, setNoiseGate] = useState(30);
  
  // Analysis Data
  const [detectedPitch, setDetectedPitch] = useState({ hz: 0, note: '--', solfege: '--' });

  // Refs for Loop Access
  const modeRef = useRef(mode);
  const isPlayingRef = useRef(isPlaying);
  const isPausedRef = useRef(isPaused);
  const isMicActiveRef = useRef(isMicActive);
  const noiseGateRef = useRef(noiseGate);
  const frequencyRef = useRef(frequency); // For display in playback mode if needed inside loop

  // Sync Refs
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { isMicActiveRef.current = isMicActive; }, [isMicActive]);
  useEffect(() => { noiseGateRef.current = noiseGate; }, [noiseGate]);
  useEffect(() => { frequencyRef.current = frequency; }, [frequency]);

  // Audio Nodes
  const oscNodeRef = useRef<OscillatorNode | null>(null);
  const oscGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const animRef = useRef<number | null>(null);

  // Initialize shared analyser
  const initAudioNodes = () => {
    const ctx = getAudioContext();
    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.8;
    }
    return ctx;
  };

  // Switch Mode Logic
  const handleModeChange = (newMode: ExperimentMode) => {
    // 1. Clean up everything from previous mode
    stopOscillator();
    stopMic();
    
    // 2. Set new mode
    setMode(newMode);
    
    // 3. Clear Canvas
    const canvas = canvasRef.current;
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    // 4. Reset detections
    setDetectedPitch({ hz: 0, note: '--', solfege: '--' });
  };

  const draw = useCallback(() => {
    // Check if we should stop drawing loop
    if (modeRef.current === 'playback' && !isPlayingRef.current) return;
    if (modeRef.current === 'recording' && !isMicActiveRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas || !analyserRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle Resize
    if (canvas.width !== canvas.parentElement?.clientWidth) {
      canvas.width = canvas.parentElement?.clientWidth || 0;
      canvas.height = canvas.parentElement?.clientHeight || 0;
    }

    // Get Data
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteTimeDomainData(dataArray);

    // Render Background
    // We use clearRect to let the CSS grid (on parent) show through
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Optional: Draw a subtle semi-transparent bg if grid is too strong
    // ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    // ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#38bdf8'; // Cyan color
    ctx.beginPath();

    // Trigger Logic (Stabilization)
    let trigger = 0;
    // Find zero-crossing rising edge
    for (let i = 0; i < dataArray.length - 1; i++) {
      if (dataArray[i] < 128 && dataArray[i + 1] >= 128) {
        trigger = i;
        break;
      }
    }

    const sliceWidth = canvas.width / (dataArray.length / 2); // Zoom in
    let x = 0;

    for (let i = trigger; i < dataArray.length; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * canvas.height) / 2;

      if (i === trigger) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);

      x += sliceWidth;
      if (x > canvas.width) break;
    }
    ctx.stroke();

    // Pitch Detection Logic (Only in Recording Mode)
    if (modeRef.current === 'recording' && isMicActiveRef.current) {
        const freq = autoCorrelate(dataArray, getAudioContext().sampleRate, noiseGateRef.current);
        if (freq > 50 && freq < 5000) {
            const info = getNoteInfo(freq);
            setDetectedPitch({ hz: Math.round(freq), note: info.note, solfege: info.solfege });
        } else {
             // Optional: Reset if silence for too long? Keeping last value is often better for UI stability.
             // setDetectedPitch(prev => ({ ...prev, hz: 0 })); 
        }
    }

    if (!isPausedRef.current) {
        animRef.current = requestAnimationFrame(draw);
    }
  }, []);

  // Loop Management
  useEffect(() => {
    const shouldAnimate = (mode === 'playback' && isPlaying) || (mode === 'recording' && isMicActive);
    
    if (shouldAnimate && !isPaused) {
        if (animRef.current === null) {
            draw();
        }
    } else {
        if (animRef.current !== null) {
            cancelAnimationFrame(animRef.current);
            animRef.current = null;
        }
    }
    return () => {
        if (animRef.current !== null) {
            cancelAnimationFrame(animRef.current);
            animRef.current = null;
        }
    };
  }, [mode, isPlaying, isMicActive, isPaused, draw]);


  // --- Playback Functions ---
  const toggleOscillator = () => {
    const ctx = initAudioNodes();
    
    if (isPlaying) {
      // Toggle Freeze
      const nextPaused = !isPaused;
      setIsPaused(nextPaused);
      
      if (!nextPaused) {
        // Resume drawing
        draw();
      }

      if (oscGainRef.current) {
        stopOscillator();
      }
    } else {
      // Start
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = waveType;
      osc.frequency.value = frequency;
      gain.gain.value = volume;
      
      osc.connect(gain);
      gain.connect(analyserRef.current!);
      analyserRef.current!.connect(ctx.destination);
      
      osc.start();
      
      oscNodeRef.current = osc;
      oscGainRef.current = gain;
      setIsPlaying(true);
      setIsPaused(false);
    }
  };

  const stopOscillator = () => {
    if (oscNodeRef.current) {
        try {
            oscNodeRef.current.stop();
            oscNodeRef.current.disconnect();
        } catch(e) { /* ignore */ }
        oscNodeRef.current = null;
    }
    if (oscGainRef.current) {
        oscGainRef.current.disconnect();
        oscGainRef.current = null;
    }
    setIsPlaying(false);
    setIsPaused(false);
  };

  // --- Recording Functions ---
  const toggleMic = async () => {
    if (isMicActive) {
      stopMic();
    } else {
      const ctx = initAudioNodes();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
        micStreamRef.current = stream;
        const source = ctx.createMediaStreamSource(stream);
        micGainRef.current = ctx.createGain();
        micGainRef.current.gain.value = micMonitor ? 1 : 0;

        // Path: Source -> Analyser -> MonitorGain -> Destination
        source.connect(analyserRef.current!);
        analyserRef.current!.connect(micGainRef.current);
        micGainRef.current.connect(ctx.destination);

        setIsMicActive(true);
      } catch (e) {
        console.error("Mic error", e);
        alert("無法存取麥克風，請確認權限設定。");
      }
    }
  };

  const stopMic = () => {
    if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
    }
    if (micGainRef.current) {
        micGainRef.current.disconnect();
        micGainRef.current = null;
    }
    setIsMicActive(false);
    setDetectedPitch({ hz: 0, note: '--', solfege: '--' });
  };

  const toggleMonitor = () => {
      const nextMonitor = !micMonitor;
      setMicMonitor(nextMonitor);
      if (micGainRef.current) {
          micGainRef.current.gain.setTargetAtTime(nextMonitor ? 1 : 0, getAudioContext().currentTime, 0.1);
      }
  };

  // --- Live Updates ---
  useEffect(() => {
    if (oscNodeRef.current) oscNodeRef.current.frequency.setTargetAtTime(frequency, getAudioContext().currentTime, 0.05);
  }, [frequency]);

  useEffect(() => {
    if (oscGainRef.current) oscGainRef.current.gain.setTargetAtTime(volume, getAudioContext().currentTime, 0.05);
  }, [volume]);

  useEffect(() => {
    if (oscNodeRef.current) oscNodeRef.current.type = waveType;
  }, [waveType]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopOscillator();
      stopMic();
    };
  }, []);

  const reset = () => {
      if (mode === 'playback') {
          stopOscillator();
          setFrequency(440);
          setVolume(0.5);
      } else {
          stopMic();
      }
      const canvas = canvasRef.current;
      if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx?.clearRect(0,0, canvas.width, canvas.height);
      }
  };

  // Computed Display Values
  const getDisplayValues = () => {
      if (mode === 'playback') {
          const info = getNoteInfo(frequency);
          return { hz: frequency, note: info.note, solfege: info.solfege, active: isPlaying };
      } else {
          return { ...detectedPitch, active: isMicActive && detectedPitch.hz > 0 };
      }
  };
  const display = getDisplayValues();
  const isHighFreq = mode === 'playback' && frequency > 2000;

  return (
    <div className="h-full flex flex-col p-4 bg-slate-900">
      {/* Header / Mode Switcher */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
            <Activity className="text-blue-400" /> 
            波形與頻率實驗
          </h2>
          <button onClick={reset} className="bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded text-xs text-white flex items-center gap-1 border border-slate-600 transition">
            <RotateCcw size={12} /> 重設
          </button>
        </div>
        
        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button 
                onClick={() => handleModeChange('playback')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${mode === 'playback' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
                <Music2 size={16} /> 播放模式
            </button>
            <button 
                onClick={() => handleModeChange('recording')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${mode === 'recording' ? 'bg-red-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
                <Mic size={16} /> 錄音模式
            </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden">
        {/* Left: Oscilloscope */}
        <div className="flex-1 flex flex-col gap-4 min-h-[300px]">
             {/* Scope View */}
            <div className="flex-1 bg-black rounded-xl border-2 border-slate-700 relative overflow-hidden scope-frame shadow-2xl">
                <div className="absolute top-3 left-3 flex gap-2">
                    <div className="text-green-500/80 text-xs font-mono font-bold pointer-events-none tracking-widest border border-green-900/50 px-2 py-1 rounded bg-black/60 backdrop-blur-sm">
                        OSCILLOSCOPE
                    </div>
                    {isHighFreq && (
                         <div className="flex items-center gap-1 text-yellow-400 text-xs font-bold border border-yellow-600/50 px-2 py-1 rounded bg-yellow-900/40 animate-pulse">
                            <AlertTriangle size={12} /> 高頻警告 (>2000Hz)
                         </div>
                    )}
                </div>
                <canvas ref={canvasRef} className="w-full h-full" />
                
                {/* Status Indicator on Scope */}
                <div className="absolute bottom-3 right-3">
                    {mode === 'playback' ? (
                        isPlaying ? (
                            <span className="flex items-center gap-2 text-blue-400 text-xs font-bold bg-black/60 px-2 py-1 rounded border border-blue-900/50">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                </span>
                                Output Active
                            </span>
                        ) : <span className="text-slate-600 text-xs font-bold">Output Muted</span>
                    ) : (
                        isMicActive ? (
                            <span className="flex items-center gap-2 text-red-400 text-xs font-bold bg-black/60 px-2 py-1 rounded border border-red-900/50">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                </span>
                                Input Active
                            </span>
                        ) : <span className="text-slate-600 text-xs font-bold">Input Muted</span>
                    )}
                </div>
            </div>
            
            {/* High Frequency Warning Banner */}
            {isHighFreq && (
                <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-3 flex items-center gap-3 text-yellow-200 text-sm">
                    <AlertTriangle className="text-yellow-500 shrink-0" />
                    <p>注意：頻率超過 2000Hz，長時間聆聽高音量可能導致聽力受損或不適，請降低音量。</p>
                </div>
            )}
        </div>

        {/* Right: Control Panel */}
        <div className="lg:w-96 bg-slate-800 p-6 rounded-xl border border-slate-700 overflow-y-auto flex flex-col gap-6 shadow-xl">
            
            {/* 1. Big Digital Display */}
            <div className="bg-slate-900 rounded-2xl p-6 border border-slate-700 shadow-inner relative overflow-hidden group">
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 opacity-50"></div>
                 
                 <div className="flex justify-between items-start mb-2">
                     <span className="text-xs text-slate-500 font-bold tracking-widest uppercase">
                         {mode === 'playback' ? 'Target Frequency' : 'Detected Frequency'}
                     </span>
                     {display.active && <Activity size={16} className="text-green-500 animate-pulse" />}
                 </div>

                 {/* Hz Display */}
                 <div className="text-center mb-6">
                     <div className="text-6xl font-black text-white font-mono tracking-tighter" style={{ textShadow: '0 0 20px rgba(59, 130, 246, 0.4)' }}>
                         {display.hz} <span className="text-2xl text-slate-500 font-bold">Hz</span>
                     </div>
                 </div>

                 {/* Note Info */}
                 <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-4">
                     <div className="text-center border-r border-slate-800">
                         <div className="text-xs text-slate-500 mb-1">音名 (Note)</div>
                         <div className="text-3xl font-bold text-blue-400">{display.note}</div>
                     </div>
                     <div className="text-center">
                         <div className="text-xs text-slate-500 mb-1">唱名 (Solfege)</div>
                         <div className="text-3xl font-bold text-indigo-400">{display.solfege}</div>
                     </div>
                 </div>
            </div>

            {/* 2. Controls Area based on Mode */}
            <div className="flex-1 flex flex-col gap-6">
                
                {/* PLAYBACK CONTROLS */}
                {mode === 'playback' && (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                onClick={toggleOscillator}
                                className={`col-span-2 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${isPlaying ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                            >
                                {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
                                {isPlaying ? '暫停播放 (Stop)' : '開始播放 (Play)'}
                            </button>
                        </div>

                        {/* Wave Type Selector */}
                        <div>
                            <label className="text-xs text-slate-400 font-bold mb-2 block flex items-center gap-2"><Waves size={14}/> 波形形狀 (Waveform)</label>
                            <div className="grid grid-cols-4 gap-2 bg-slate-900 p-1 rounded-lg">
                                {['sine', 'square', 'sawtooth', 'triangle'].map((t) => (
                                    <button 
                                        key={t}
                                        onClick={() => setWaveType(t as WaveType)} 
                                        className={`p-2 rounded-md flex justify-center transition-all ${waveType === t ? 'bg-slate-700 text-blue-400 shadow-sm ring-1 ring-blue-500/50' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}
                                        title={t}
                                    >
                                        <Activity size={20} />
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Frequency Slider */}
                        <div className="bg-slate-700/30 p-4 rounded-xl border border-slate-700">
                            <label className="flex justify-between text-sm font-bold text-slate-300 mb-2">
                                頻率調節 (Frequency)
                                <input 
                                    type="number" 
                                    value={frequency} 
                                    onChange={(e) => setFrequency(Number(e.target.value))}
                                    className="bg-slate-900 border border-slate-600 rounded px-2 py-0.5 w-20 text-right text-blue-400 focus:outline-none focus:border-blue-500" 
                                />
                            </label>
                            <input 
                                type="range" min="20" max="5000" step="1" value={frequency} 
                                onChange={(e) => setFrequency(Number(e.target.value))}
                                className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500" 
                            />
                            <div className="flex justify-between text-xs text-slate-500 mt-2">
                                <span>20 Hz</span>
                                <span>5000 Hz</span>
                            </div>
                        </div>

                        {/* Volume Slider */}
                        <div className="bg-slate-700/30 p-4 rounded-xl border border-slate-700">
                            <label className="flex justify-between text-sm font-bold text-slate-300 mb-2">
                                音量大小 (Volume)
                                <span className="text-blue-400 font-mono">{Math.round(volume * 100)}%</span>
                            </label>
                            <input 
                                type="range" min="0" max="1" step="0.01" value={volume} 
                                onChange={(e) => setVolume(Number(e.target.value))}
                                className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500" 
                            />
                        </div>
                    </>
                )}

                {/* RECORDING CONTROLS */}
                {mode === 'recording' && (
                    <>
                         <button 
                            onClick={toggleMic}
                            className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${isMicActive ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
                        >
                            <Mic fill="currentColor" />
                            {isMicActive ? '停止錄音 (Stop)' : '啟動麥克風 (Start)'}
                        </button>

                        <div className="bg-slate-700/30 p-4 rounded-xl border border-slate-700 space-y-4">
                             <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-slate-300 flex items-center gap-2"><Settings2 size={16}/> 麥克風設定</span>
                             </div>

                             {/* Noise Gate */}
                             <div>
                                <div className="flex justify-between text-xs text-slate-400 mb-1">
                                    <span>噪音過濾 (Noise Gate)</span>
                                    <span>{noiseGate} dB</span>
                                </div>
                                <input 
                                    type="range" min="0" max="80" value={noiseGate} 
                                    onChange={(e) => setNoiseGate(Number(e.target.value))} 
                                    className="w-full h-2 bg-slate-600 rounded-lg appearance-none accent-red-500" 
                                />
                             </div>

                             {/* Monitor Toggle */}
                             <div className="flex items-center justify-between pt-2 border-t border-slate-600/50">
                                 <span className="text-sm text-slate-400">監聽 (Monitor)</span>
                                 <button 
                                    onClick={toggleMonitor}
                                    className={`p-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-bold ${micMonitor ? 'bg-green-600 text-white' : 'bg-slate-900 text-slate-500'}`}
                                    disabled={!isMicActive}
                                 >
                                     {micMonitor ? <Volume2 size={14}/> : <VolumeX size={14}/>}
                                     {micMonitor ? '已開啟 (需耳機)' : '靜音'}
                                 </button>
                             </div>
                             <p className="text-[10px] text-slate-500">
                                 * 開啟監聽時請務必佩戴耳機，否則會產生回授嘯叫 (Feedback)。
                             </p>
                        </div>
                    </>
                )}

            </div>
        </div>
      </div>
    </div>
  );
};

export default WaveExperiment;