import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getAudioContext, getNoteInfo } from '../utils/audio';
import { ViolinString } from '../types';

const stdViolin: ViolinString[] = [
  { name: 'G3', base: 196, tension: 50, xOff: 0.2, thick: 4 },
  { name: 'D4', base: 293.7, tension: 50, xOff: 0.4, thick: 3 },
  { name: 'A4', base: 440, tension: 50, xOff: 0.6, thick: 2 },
  { name: 'E5', base: 659.3, tension: 50, xOff: 0.8, thick: 1 }
];

const ViolinExperiment: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strings, setStrings] = useState<ViolinString[]>(JSON.parse(JSON.stringify(stdViolin)));
  const [activeStringIdx, setActiveStringIdx] = useState<number>(-1);
  const [fingerY, setFingerY] = useState<number>(-1);
  const [pitch, setPitch] = useState({ hz: 0, note: '--', solfege: '--' });
  const [isTuning, setIsTuning] = useState<number>(-1);

  // Audio Refs
  const vOsc1Ref = useRef<OscillatorNode | null>(null);
  const vOsc2Ref = useRef<OscillatorNode | null>(null);
  const vGainRef = useRef<GainNode | null>(null);
  const startYRef = useRef<number>(0);

  const getViolinFreq = useCallback((idx: number, yPos: number, currentStrings: ViolinString[]) => {
    const s = currentStrings[idx];
    const tf = 1 + (s.tension - 50) * 0.01;
    let lf = 1;
    
    if (yPos !== -1 && canvasRef.current) {
        // Simple linear interpolation simulating string shortening
        // Real physics is L' = L - y, f' = f * (L/L')
        const height = canvasRef.current.height;
        // Using the formula from the original code: (h*1.5) / (h*1.5 - y)
        lf = (height * 1.5) / (height * 1.5 - yPos);
    }
    return s.base * tf * lf;
  }, []);

  const updateFrequency = useCallback(() => {
    if (activeStringIdx === -1) return;
    const ctx = getAudioContext();
    const f = getViolinFreq(activeStringIdx, fingerY, strings);
    const i = getNoteInfo(f);
    setPitch({ hz: Math.round(f), note: i.note, solfege: i.solfege });

    if (vOsc1Ref.current && vOsc2Ref.current) {
        vOsc1Ref.current.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
        vOsc2Ref.current.frequency.setTargetAtTime(f + 2, ctx.currentTime, 0.05); // Chorus effect
    }
  }, [activeStringIdx, fingerY, strings, getViolinFreq]);

  useEffect(() => {
    updateFrequency();
  }, [updateFrequency]);

  const playNote = (idx: number, y: number) => {
    const ctx = getAudioContext();
    if (vOsc1Ref.current) return; // Already playing

    const gain = ctx.createGain();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const bandpass = ctx.createBiquadFilter();
    const highshelf = ctx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 500;
    bandpass.Q.value = 0.5;
    highshelf.type = 'highshelf';
    highshelf.frequency.value = 2000;
    highshelf.gain.value = -10;

    osc1.connect(bandpass);
    osc2.connect(bandpass);
    bandpass.connect(highshelf);
    highshelf.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    osc1.start(now);
    osc2.start(now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.1);

    vOsc1Ref.current = osc1;
    vOsc2Ref.current = osc2;
    vGainRef.current = gain;
    
    // Initial freq set will happen via effect
  };

  const stopNote = () => {
    if (vOsc1Ref.current && vGainRef.current) {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        vGainRef.current.gain.cancelScheduledValues(now);
        vGainRef.current.gain.linearRampToValueAtTime(0, now + 0.1);
        vOsc1Ref.current.stop(now + 0.1);
        if (vOsc2Ref.current) vOsc2Ref.current.stop(now + 0.1);
        
        setTimeout(() => {
            vOsc1Ref.current = null;
            vOsc2Ref.current = null;
            vGainRef.current = null;
        }, 100);
    }
    setActiveStringIdx(-1);
    setFingerY(-1);
  };

  // Canvas Interaction
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Determine closest string
    let minDist = 999;
    let closestIdx = -1;
    const width = canvasRef.current.width;
    
    strings.forEach((s, i) => {
        const sx = width * s.xOff;
        const dist = Math.abs(x - sx);
        if (dist < minDist) {
            minDist = dist;
            closestIdx = i;
        }
    });

    if (closestIdx !== -1) {
        setActiveStringIdx(closestIdx);
        setFingerY(y);
        playNote(closestIdx, y);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeStringIdx !== -1 && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setFingerY(e.clientY - rect.top);
    }
  };

  // Draw Loop
  useEffect(() => {
    let animId: number;
    const render = () => {
        const cvs = canvasRef.current;
        if (!cvs) return;
        const ctx = cvs.getContext('2d');
        if (!ctx) return;

        // Resize
        if (cvs.width !== cvs.parentElement?.clientWidth) {
            cvs.width = cvs.parentElement?.clientWidth || 0;
            cvs.height = cvs.parentElement?.clientHeight || 0;
        }

        ctx.clearRect(0, 0, cvs.width, cvs.height);

        strings.forEach((s, i) => {
            const x = cvs.width * s.xOff;
            let off = 0;
            // Vibrate if active
            if (activeStringIdx === i && fingerY !== -1) {
                off = (Math.random() - 0.5) * 2;
            }
            ctx.fillStyle = '#999';
            ctx.fillRect(x + off, 0, s.thick, cvs.height);
        });
        
        animId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animId);
  }, [activeStringIdx, fingerY, strings]);

  // Cleanup audio
  useEffect(() => {
      return () => stopNote();
  }, []);

  const handleTuneStart = (idx: number, e: React.MouseEvent) => {
      setIsTuning(idx);
      startYRef.current = e.clientY;
      document.body.style.cursor = 'ns-resize';
  };

  useEffect(() => {
      const handleTuneMove = (e: MouseEvent) => {
          if (isTuning !== -1) {
              const dy = startYRef.current - e.clientY;
              // Fix: Immutable update of array objects
              setStrings(prevStrings => {
                  const newStrings = [...prevStrings];
                  newStrings[isTuning] = { 
                      ...newStrings[isTuning], 
                      tension: newStrings[isTuning].tension + dy * 0.5 
                  };
                  return newStrings;
              });
              startYRef.current = e.clientY;
          }
      };
      const handleTuneUp = () => {
          setIsTuning(-1);
          document.body.style.cursor = 'default';
      };

      if (isTuning !== -1) {
          window.addEventListener('mousemove', handleTuneMove);
          window.addEventListener('mouseup', handleTuneUp);
      }
      return () => {
          window.removeEventListener('mousemove', handleTuneMove);
          window.removeEventListener('mouseup', handleTuneUp);
      };
  }, [isTuning]);

  return (
    <div className="h-full flex flex-col p-4">
       <div className="flex justify-between mb-4">
            <h2 className="text-2xl font-bold">弦樂實驗 (Violin)</h2>
            <button 
                onClick={() => setStrings(JSON.parse(JSON.stringify(stdViolin)))} 
                className="bg-amber-700 hover:bg-amber-600 px-3 py-1 rounded text-sm transition"
            >
                一鍵調音
            </button>
       </div>
       
       <div className="flex-1 flex flex-col lg:flex-row gap-4">
           {/* Violin Body */}
           <div className="flex-1 bg-[#1a1510] rounded relative shadow-2xl flex flex-col pt-8">
               {/* Pegs */}
               <div className="flex justify-around px-8 relative z-10">
                   {strings.map((s, i) => (
                       <div 
                        key={i}
                        onMouseDown={(e) => handleTuneStart(i, e)}
                        className="w-16 h-16 bg-[#4e342e] rounded-full border-4 border-[#3e2723] cursor-ns-resize flex items-center justify-center transition active:scale-95"
                       >
                           <div 
                            className="w-2 h-10 bg-[#271c19] rounded transition-transform"
                            style={{ transform: `rotate(${i % 2 === 0 ? 45 + (s.tension-50) : -45 + (s.tension-50)}deg)` }}
                           ></div>
                       </div>
                   ))}
               </div>

               {/* Fingerboard */}
               <div className="relative w-24 h-[500px] bg-[#0f0e0d] border-x-4 border-[#2c241b] mx-auto mt-4 cursor-pointer">
                   <canvas 
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={stopNote}
                    onMouseLeave={stopNote}
                    className="w-full h-full absolute inset-0"
                   />
                   {fingerY !== -1 && (
                       <div 
                        className="absolute w-full h-4 bg-white/20 rounded border-y border-white/30 pointer-events-none"
                        style={{ top: fingerY }}
                       ></div>
                   )}
               </div>
           </div>

           {/* Info Panel */}
           <div className="lg:w-80 bg-slate-800 p-6 rounded-xl border border-slate-700 flex flex-col justify-center text-center">
                <div className="text-slate-400 text-sm mb-2 uppercase tracking-widest">Current Pitch</div>
                <div className="text-7xl font-black text-amber-400 mb-4 drop-shadow-xl font-mono">
                    {activeStringIdx !== -1 ? `${pitch.hz} Hz` : '--'}
                </div>
                <div className="bg-black/40 rounded-xl p-6 border border-slate-600">
                    <div className="flex justify-center items-baseline gap-4">
                        <div className="text-6xl font-black text-white">{activeStringIdx !== -1 ? pitch.note : '--'}</div>
                        <div className="text-4xl font-bold text-amber-500">{activeStringIdx !== -1 ? pitch.solfege : '--'}</div>
                    </div>
                </div>
                <p className="mt-8 text-slate-400 text-sm">
                    按住琴軸上下拖曳可調音。<br/>
                    在指板上按壓改變音高。
                </p>
           </div>
       </div>
    </div>
  );
};

export default ViolinExperiment;