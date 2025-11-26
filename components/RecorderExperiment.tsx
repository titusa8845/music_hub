import React, { useState, useRef, useEffect } from 'react';
import { getAudioContext, getNoteInfo } from '../utils/audio';

const RecorderExperiment: React.FC = () => {
    const [holes, setHoles] = useState<boolean[]>(Array(8).fill(false));
    const [isBlowing, setIsBlowing] = useState(false);
    const [pitch, setPitch] = useState({ hz: 0, note: '--', solfege: '--' });
    
    const oscRef = useRef<OscillatorNode | null>(null);
    const gainRef = useRef<GainNode | null>(null);

    const toggleHole = (index: number) => {
        const newHoles = [...holes];
        newHoles[index] = !newHoles[index];
        setHoles(newHoles);
    };

    const calculatePitch = () => {
        let firstOpen = 8;
        for (let i = 0; i < 8; i++) {
            if (!holes[i]) {
                firstOpen = i;
                break;
            }
        }
        // Frequencies roughly mapping to a C-Recorder scale logic
        // Hole 0 is back hole (thumb). 
        // Logic simplified: more holes closed = lower pitch
        // Map open index to frequency
        const freqs = [1174, 1046, 987, 880, 783, 698, 659, 587, 523];
        // If everything is closed (firstOpen == 8), it's the lowest note
        return freqs[firstOpen] || 523;
    };

    const updateAudio = () => {
        if (!isBlowing) return;
        const freq = calculatePitch();
        const info = getNoteInfo(freq);
        setPitch({ hz: freq, note: info.note, solfege: info.solfege });
        
        if (oscRef.current) {
            oscRef.current.frequency.setTargetAtTime(freq, getAudioContext().currentTime, 0.05);
        }
    };

    useEffect(() => {
        updateAudio();
    }, [holes, isBlowing]);

    const toggleBlow = () => {
        const ctx = getAudioContext();
        if (isBlowing) {
            // Stop
            if (gainRef.current) {
                gainRef.current.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
            }
            if (oscRef.current) {
                oscRef.current.stop(ctx.currentTime + 0.1);
            }
            setTimeout(() => {
                oscRef.current = null;
                gainRef.current = null;
            }, 100);
            setIsBlowing(false);
            setPitch({ hz: 0, note: '--', solfege: '--' });
        } else {
            // Start
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();

            osc.type = 'triangle';
            filter.type = 'lowpass';
            filter.frequency.value = 2000;

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.1);

            oscRef.current = osc;
            gainRef.current = gain;
            setIsBlowing(true);
            
            // Force initial pitch calc
            const freq = calculatePitch();
            const info = getNoteInfo(freq);
            setPitch({ hz: freq, note: info.note, solfege: info.solfege });
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
        }
    };
    
    useEffect(() => {
        return () => {
             if (oscRef.current) oscRef.current.stop();
        };
    }, []);

    // Helper to calculate Air Column height
    const getAirColumnHeight = () => {
         let firstOpen = 8;
         for (let i = 0; i < 8; i++) {
             if (!holes[i]) {
                 firstOpen = i;
                 break;
             }
         }
         return 10 + (firstOpen / 8) * 90;
    };

    return (
        <div className="h-full flex flex-col p-4">
             <div className="flex justify-between mb-4 items-center">
                <h2 className="text-2xl font-bold">管樂實驗</h2>
                <div className="flex items-center gap-6 bg-slate-800 px-6 py-2 rounded-xl border border-slate-700">
                    <div className="text-right">
                        <div className="text-5xl font-bold text-amber-100 font-mono drop-shadow-md">
                            {isBlowing ? `${pitch.hz} Hz` : '--'}
                        </div>
                    </div>
                    <div className="text-right border-l border-slate-600 pl-6">
                        <div className="text-4xl font-black text-white">{isBlowing ? pitch.note : '--'}</div>
                        <div className="text-2xl font-bold text-amber-400">{isBlowing ? pitch.solfege : '--'}</div>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex justify-center gap-16 overflow-y-auto pt-4">
                {/* Recorder Visual */}
                <div className="relative w-20 flex flex-col items-center pt-8 gap-6 pb-8 shadow-2xl rounded-full border border-[#d1c496] scale-100 origin-top" 
                     style={{ background: 'linear-gradient(90deg, #fdfbf7 0%, #f3e5ab 50%, #e6dba0 100%)', boxShadow: '2px 0 15px rgba(0,0,0,0.4)' }}>
                    
                    {/* Mouthpiece */}
                    <div className="w-16 h-24 bg-[#fdfbf7] border-b border-amber-200 rounded-t-2xl relative flex justify-center -mt-4">
                        <div className="w-10 h-5 bg-black/80 rounded-b-lg absolute bottom-4 shadow-inner"></div>
                        <button 
                            onClick={toggleBlow}
                            className={`absolute -top-6 w-20 h-16 rounded-t-xl text-xs flex items-center justify-center shadow-lg transition cursor-pointer border-t border-amber-700 font-bold z-50 opacity-90 ${isBlowing ? 'animate-breath border-blue-500 shadow-[0_0_15px_#3b82f6]' : 'bg-amber-900 text-white hover:bg-amber-800'}`}
                        >
                            {isBlowing ? '吹氣中...' : '點擊吹氣'}
                        </button>
                    </div>

                    {/* Holes */}
                    <div className="flex flex-col gap-5 w-full items-center pt-4">
                        {/* Back Hole (0) */}
                        <div 
                            onClick={() => toggleHole(0)}
                            className={`w-5 h-5 rounded-full border border-[#d1c496] cursor-pointer relative transition-all ${holes[0] ? 'bg-black' : 'bg-[#3d342b]'}`}
                            style={{ boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.9)', border: '2px dashed #a16207' }}
                        >
                             {holes[0] && <div className="absolute inset-[-4px] rounded-full opacity-90 border border-red-500 shadow-[0_2px_4px_rgba(0,0,0,0.3)]" style={{ background: 'radial-gradient(circle, #fecaca 30%, #f87171 100%)' }}></div>}
                        </div>
                        
                        <div className="h-4"></div>

                        {/* Front Holes 1-7 */}
                        {[1, 2, 3, 4, 5, 6, 7].map(i => (
                            <React.Fragment key={i}>
                                {i === 4 && <div className="h-2"></div>}
                                {i >= 6 ? (
                                    // Double holes logic simplified for UI
                                    <div className="flex gap-0.5 transform -rotate-12 cursor-pointer justify-center" onClick={() => toggleHole(i)}>
                                         <div className={`w-3.5 h-3.5 rounded-full border border-[#d1c496] relative ${holes[i] ? 'bg-black' : 'bg-[#3d342b]'}`} style={{boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.9)'}}>
                                            {holes[i] && <div className="absolute inset-[-3px] rounded-full opacity-90 border border-red-500" style={{ background: 'radial-gradient(circle, #fecaca 30%, #f87171 100%)' }}></div>}
                                         </div>
                                         <div className={`w-2.5 h-2.5 rounded-full border border-[#d1c496] relative ${holes[i] ? 'bg-black' : 'bg-[#3d342b]'}`} style={{boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.9)'}}>
                                             {holes[i] && <div className="absolute inset-[-3px] rounded-full opacity-90 border border-red-500" style={{ background: 'radial-gradient(circle, #fecaca 30%, #f87171 100%)' }}></div>}
                                         </div>
                                    </div>
                                ) : (
                                    <div 
                                        onClick={() => toggleHole(i)}
                                        className={`w-5 h-5 rounded-full border border-[#d1c496] cursor-pointer relative transition-all ${holes[i] ? 'bg-black' : 'bg-[#3d342b]'}`}
                                        style={{ boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.9)' }}
                                    >
                                        {holes[i] && <div className="absolute inset-[-4px] rounded-full opacity-90 border border-red-500 shadow-[0_2px_4px_rgba(0,0,0,0.3)]" style={{ background: 'radial-gradient(circle, #fecaca 30%, #f87171 100%)' }}></div>}
                                    </div>
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                     <div className="w-24 h-8 rounded-b-xl border-t border-amber-200 flex justify-center items-end pb-1" style={{ background: 'linear-gradient(90deg, #fdfbf7 0%, #f3e5ab 50%, #e6dba0 100%)' }}>
                        <div className="w-20 h-2 bg-[#e6dba0] rounded-full opacity-50"></div>
                     </div>
                </div>

                {/* Air Column Visual */}
                <div className="w-64 flex flex-col gap-4 pt-10">
                    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 relative h-[500px] flex flex-col">
                        <div className="text-center text-sm text-slate-400 mb-4 font-bold uppercase tracking-widest">Air Column (空氣柱)</div>
                        <div className="flex-1 bg-slate-900 rounded border border-slate-600 overflow-hidden relative">
                             <div 
                                className="absolute top-0 left-0 right-0 bg-blue-500/40 border-b-4 border-blue-400 flex justify-center items-end pb-2 shadow-[0_0_20px_rgba(59,130,246,0.6)] transition-all duration-300 ease-out"
                                style={{ height: `${getAirColumnHeight()}%` }}
                             >
                                 <div className="text-white text-xs font-bold bg-blue-600 px-2 py-1 rounded shadow animate-bounce">Node (波節)</div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RecorderExperiment;