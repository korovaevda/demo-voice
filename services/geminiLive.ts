import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createPcmBlob, decodeAudioData, decodeBase64 } from '../utils/audio';
import { MODEL_NAME, SYSTEM_INSTRUCTIONS } from '../constants';
import { Language } from '../types';

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private outputNode: GainNode | null = null;

  // Audio playback queue management
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();

  // State callbacks
  private onStatusChange: (status: string) => void;
  private onAudioLevel: (level: number) => void;
  private onError: (error: string) => void;
  private onTranscript: (text: string, isUser: boolean) => void;

  private sessionPromise: Promise<any> | null = null;
  private closeSession: (() => void) | null = null;

  constructor(
    onStatusChange: (status: string) => void,
    onAudioLevel: (level: number) => void,
    onError: (error: string) => void,
    onTranscript: (text: string, isUser: boolean) => void
  ) {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    this.onStatusChange = onStatusChange;
    this.onAudioLevel = onAudioLevel;
    this.onError = onError;
    this.onTranscript = onTranscript;
  }

  async connect(language: Language) {
    try {
      this.onStatusChange('connecting');

      // 1. Setup Audio Contexts
      // Input: 16kHz for Gemini
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      // Output: 24kHz from Gemini
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      this.outputNode = this.outputAudioContext.createGain();
      this.outputNode.connect(this.outputAudioContext.destination);

      // 2. Get Microphone Stream
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone access is not supported. This often happens on insecure (HTTP) connections. Please use HTTPS or localhost.");
      }

      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 3. Initialize Gemini Session
      const config = {
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: SYSTEM_INSTRUCTIONS[language],
          inputAudioTranscription: {}, // Request user transcription
          outputAudioTranscription: {}, // Request model transcription
        },
      };

      // We use a promise wrapper to ensure we have the session before sending data
      this.sessionPromise = this.ai.live.connect({
        model: config.model,
        config: config.config,
        callbacks: {
          onopen: this.handleOnOpen.bind(this),
          onmessage: this.handleOnMessage.bind(this),
          onclose: () => {
            this.onStatusChange('disconnected');
            console.log("Session closed");
          },
          onerror: (err) => {
            console.error("Session error:", err);
            this.onError("Connection error occurred.");
            this.onStatusChange('error');
          }
        }
      });

      // We need to capture the close method effectively (it's not directly returned by connect in the simplified view, 
      // but the `session` object resolved by the promise has it).
      // However, for the SDK structure, we can usually just rely on standard cleanup. 
      // The SDK's connect returns a promise that resolves to the session.

    } catch (error) {
      console.error('Failed to connect:', error);
      this.onError(error instanceof Error ? error.message : 'Unknown error');
      this.onStatusChange('error');
    }
  }

  private handleOnOpen() {
    this.onStatusChange('connected');

    if (!this.inputAudioContext || !this.stream) return;

    // Setup input pipeline
    this.inputSource = this.inputAudioContext.createMediaStreamSource(this.stream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);

      // Calculate volume for visualizer
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      this.onAudioLevel(rms);

      // Send to API
      const pcmBlob = createPcmBlob(inputData);

      if (this.sessionPromise) {
        this.sessionPromise.then(session => {
          session.sendRealtimeInput({ media: pcmBlob });
        }).catch(err => console.error("Error sending audio:", err));
      }
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private async handleOnMessage(message: LiveServerMessage) {
    if (!this.outputAudioContext || !this.outputNode) return;

    // 1. Handle Transcripts
    const outputTranscript = message.serverContent?.outputTranscription?.text;
    if (outputTranscript) {
      this.onTranscript(outputTranscript, false);
    }

    const inputTranscript = message.serverContent?.inputTranscription?.text;
    if (message.serverContent?.turnComplete && inputTranscript) {
      // We might receive partials, but let's just log on turn complete or if text is present
    }
    // Note: inputTranscription is often streamed. We can simplify by just logging whatever comes in if it's substantial.
    if (inputTranscript) {
      this.onTranscript(inputTranscript, true);
    }


    // 2. Handle Audio Output
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;

    if (audioData) {
      this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);

      const audioBuffer = await decodeAudioData(
        decodeBase64(audioData),
        this.outputAudioContext,
        24000,
        1
      );

      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputNode);

      source.addEventListener('ended', () => {
        this.sources.delete(source);
      });

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      this.sources.add(source);
    }

    // 3. Handle Interruption
    if (message.serverContent?.interrupted) {
      this.sources.forEach(source => {
        try { source.stop(); } catch (e) { }
      });
      this.sources.clear();
      this.nextStartTime = 0;
    }
  }

  async disconnect() {
    // Clean up Web Audio
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
    }
    if (this.inputSource) this.inputSource.disconnect();
    if (this.stream) this.stream.getTracks().forEach(track => track.stop());
    if (this.inputAudioContext) await this.inputAudioContext.close();
    if (this.outputAudioContext) await this.outputAudioContext.close();

    // Clean up Gemini Session
    // Since the SDK doesn't expose a direct 'disconnect' on the generic type easily without the session object,
    // we use the promise result.
    if (this.sessionPromise) {
      // There isn't a direct "disconnect" method exposed on the global ai client, 
      // it's usually `session.close()`.
      try {
        const session = await this.sessionPromise;
        // Check if close exists (it should per SDK spec)
        if (typeof session.close === 'function') {
          session.close();
        }
      } catch (e) {
        console.warn("Error closing session", e);
      }
    }

    this.onStatusChange('disconnected');
    this.sessionPromise = null;
  }
}
