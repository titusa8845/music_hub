export type WaveType = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface NoteInfo {
  note: string;
  solfege: string;
  cents: number;
}

export type TabId = 
  | 'wave-gen' 
  | 'loudness' 
  | 'medium' 
  | 'doppler' 
  | 'metronome' 
  | 'violin' 
  | 'wind' 
  | 'beats' 
  | 'life' 
  | 'pitch-expert' 
  | 'pitch-coach';

export interface ViolinString {
  name: string;
  base: number;
  tension: number;
  xOff: number;
  thick: number;
}
