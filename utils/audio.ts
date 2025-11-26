import { NoteInfo } from '../types';

let audioCtx: AudioContext | null = null;

export const getAudioContext = (): AudioContext => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

export const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const solfegeNames = ['Do', 'Di', 'Re', 'Ri', 'Mi', 'Fa', 'Fi', 'Sol', 'Si', 'La', 'Li', 'Ti'];

export const getNoteInfo = (freq: number): NoteInfo => {
  if (!freq || freq < 20) return { note: '--', solfege: '--', cents: 0 };
  const n = 12 * Math.log2(freq / 440) + 69;
  const midi = Math.round(n);
  const diff = n - midi;
  const idx = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return {
    note: noteNames[idx] + octave,
    solfege: solfegeNames[idx],
    cents: diff * 100
  };
};

export const autoCorrelate = (buf: Uint8Array, sampleRate: number, gate: number = 30): number => {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) {
    const val = (buf[i] - 128) / 128;
    rms += val * val;
  }
  const db = 20 * Math.log10(Math.sqrt(rms / buf.length)) + 100;
  
  if (db < gate) return -1;

  let r1 = 0, r2 = buf.length - 1;
  // Trim edges
  for (let i = 0; i < buf.length / 2; i++) if (Math.abs((buf[i] - 128) / 128) < 0.2) { r1 = i; break; }
  for (let i = 1; i < buf.length / 2; i++) if (Math.abs((buf[buf.length - i] - 128) / 128) < 0.2) { r2 = buf.length - i; break; }

  const b2 = buf.slice(r1, r2);
  const sz = b2.length;
  let c = new Array(sz).fill(0);
  
  for (let i = 0; i < sz; i++) {
    for (let j = 0; j < sz - i; j++) {
      c[i] += ((b2[j] - 128) / 128 * (b2[j + i] - 128) / 128);
    }
  }
  
  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let mx = -1, mp = -1;
  for (let i = d; i < sz; i++) {
    if (c[i] > mx) {
      mx = c[i];
      mp = i;
    }
  }
  
  return sampleRate / mp;
};
