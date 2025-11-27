export enum Language {
  ENGLISH = 'ENGLISH',
  ARABIC = 'ARABIC'
}

export interface MessageLog {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface AudioVisualizerProps {
  isPlaying: boolean;
  isListening: boolean;
  volume: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
