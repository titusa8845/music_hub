import React, { useState, useEffect, useRef } from 'react';
import { Play, Square } from 'lucide-react';
import { getAudioContext } from '../utils/audio';

const MetronomeExperiment: React.FC = () => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [bpm, setBpm] = useState(120);
    const [beatsPerBar, setBeatsPerBar] = useState(4);
    const [currentBeat, setCurrentBeat] = useState(0);
    
    // Refs for timer loop
    const nextNoteTimeRef = useRef(0);
    const timerIDRef = useRef<number | null>(null);
    const beatRef = useRef(0);
    
    // Visual flash ref
    const flashRef = useRef<HTMLDivElement>(null);

    const scheduleNote = (beatNumber: number, time: number) => {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        if (beatNumber === 0) osc.frequency.value = 1000; // High pitch for downbeat
        else osc.frequency.value = 800;
        
        osc.start(time);
        osc.stop(time + 0.05);
        
        gain.gain.setValueAtTime(1, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

        // Schedule visual update
        const drawTime = (time - ctx.currentTime) * 1000;
        setTimeout(() => {
            setCurrentBeat(beatNumber);
            if (flashRef.current) {
                flashRef.current.classList.remove('animate-metro-flash');
                void flashRef.current.offsetWidth; // Trigger reflow
                flashRef.current.classList.add('animate-metro-flash');
                flashRef.current.style.backgroundColor = beatNumber === 0 ? '#ef4444' : '#fbbf24';
            }
        }, Math.max(0, drawTime));
    };

    const nextNote = () => {
        const secondsPerBeat = 60.0 / bpm;
        nextNoteTimeRef.current += secondsPerBeat;
        beatRef.current = (beatRef.current + 1) % beatsPerBar;
    };

    const scheduler = () => {
        const ctx = getAudioContext();
        // Lookahead 0.1s
        while (nextNoteTimeRef.current < ctx.currentTime + 0.1) {
            scheduleNote(beatRef.current, nextNoteTimeRef.current);
            nextNote();
        }
    };

    const togglePlay = () => {
        if (isPlaying) {
            if (timerIDRef.current !== null) {
                window.clearInterval(timerIDRef.current);
                timerIDRef.current = null;
            }
            setIsPlaying(false);
        } else {
            const ctx = getAudioContext();
            nextNoteTimeRef.current = ctx.currentTime;
            beatRef.current = 0;
            // Explicitly use window.setInterval to ensure it returns a number (not NodeJS.Timeout)
            timerIDRef.current = window.setInterval(scheduler, 25);
            setIsPlaying(true);
        }
    };

    useEffect(() => {
        return () => {
            if (timerIDRef.current !== null) {
                window.clearInterval(timerIDRef.current);
            }
        };
    }, []);

    return (
        <div className="h-full flex flex-col p-4 items-center justify-center">
             <div className="w-48 h-48 rounded-full bg-slate-800 border-8 border-slate-700 flex items-center justify-center shadow-2xl relative overflow-hidden mb-8">
                <div 
                    ref={flashRef}
                    className="w-32 h-32 rounded-full bg-slate-700 transition-colors duration-75"
                ></div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-5xl font-black text-white font-mono">{bpm}</span>
                </div>
            </div>

            <div className="w-full max-w-md bg-slate-800 p-6 rounded-xl border border-slate-700 flex flex-col gap-6">
                <div>
                    <div className="flex justify-between text-sm text-slate-400 mb-2">
                        <span>速度 (BPM)</span>
                        <span className="text-xs text-blue-400 font-bold">{bpm}</span>
                    </div>
                    <input 
                        type="range" min="40" max="208" value={bpm} 
                        onChange={(e) => setBpm(Number(e.target.value))}
                        className="w-full h-3 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                     <div className="flex justify-between text-xs text-slate-500 mt-1"><span>40 (Largo)</span><span>208 (Prestissimo)</span></div>
                </div>

                <div>
                    <label className="block text-sm text-slate-400 mb-2">拍號</label>
                    <div className="grid grid-cols-4 gap-2">
                        {[4, 3, 2, 1].map(n => (
                            <button 
                                key={n}
                                onClick={() => { setBeatsPerBar(n); beatRef.current = 0; }}
                                className={`py-2 rounded font-bold text-sm border transition-colors ${beatsPerBar === n ? 'bg-pink-600 text-white border-pink-700' : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'}`}
                            >
                                {n}/4
                            </button>
                        ))}
                    </div>
                </div>

                <button 
                    onClick={togglePlay} 
                    className={`w-full py-4 rounded-lg font-black text-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 ${isPlaying ? 'bg-pink-600 text-white' : 'bg-slate-200 text-slate-900 hover:bg-white'}`}
                >
                    {isPlaying ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                    {isPlaying ? '停止 (STOP)' : '開始 (START)'}
                </button>
            </div>
        </div>
    );
};

export default MetronomeExperiment;