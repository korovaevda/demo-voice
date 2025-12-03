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
  private session: any = null;
  private closeSession: (() => void) | null = null;
  private isSessionReady = false;

  constructor(
    onStatusChange: (status: string) => void,
    onAudioLevel: (level: number) => void,
    onError: (error: string) => void,
    onTranscript: (text: string, isUser: boolean) => void
  ) {
    const apiKey = process.env.GEMINI_API_KEY;
    console.log('[GeminiLive] Initializing with API key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING');
    this.ai = new GoogleGenAI({ apiKey });
    this.onStatusChange = onStatusChange;
    this.onAudioLevel = onAudioLevel;
    this.onError = onError;
    this.onTranscript = onTranscript;
  }

  async connect(language: Language) {
    try {
      console.log('[GeminiLive] Starting connection process for language:', language);
      this.isSessionReady = false;
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

      console.log('[GeminiLive] Requesting microphone access...');
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[GeminiLive] Microphone access granted');

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

      console.log('[GeminiLive] Connecting to Gemini Live API with config:', {
        model: config.model,
        voice: config.config.speechConfig?.voiceConfig,
        language
      });

      // We use a promise wrapper to ensure we have the session before sending data
      this.sessionPromise = this.ai.live.connect({
        model: config.model,
        config: config.config,
        callbacks: {
          onopen: this.handleOnOpen.bind(this),
          onmessage: this.handleOnMessage.bind(this),
          onclose: (event) => {
            console.log('[GeminiLive] Session closed');
            console.log('[GeminiLive] Close event:', event);
            console.log('[GeminiLive] Close code:', event?.code);
            console.log('[GeminiLive] Close reason:', event?.reason);
            this.isSessionReady = false;
            this.onStatusChange('disconnected');
          },
          onerror: (err) => {
            console.error('[GeminiLive] Session error:', err);
            console.error('[GeminiLive] Error details:', JSON.stringify(err, null, 2));
            const errorMessage = err instanceof Error ? err.message : 'Connection error occurred';
            this.onError(`Connection error: ${errorMessage}`);
            this.onStatusChange('error');
          }
        }
      });

      // Store the session for later use
      this.session = await this.sessionPromise;
      console.log('[GeminiLive] Session promise resolved, session object:', this.session);

      // We need to capture the close method effectively (it's not directly returned by connect in the simplified view, 
      // but the `session` object resolved by the promise has it).
      // However, for the SDK structure, we can usually just rely on standard cleanup. 
      // The SDK's connect returns a promise that resolves to the session.

    } catch (error) {
      console.error('[GeminiLive] Failed to connect:', error);
      console.error('[GeminiLive] Error stack:', error instanceof Error ? error.stack : 'N/A');
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.onError(`Connection failed: ${errorMessage}`);
      this.onStatusChange('error');
    }
  }

  private handleOnOpen() {
    console.log('[GeminiLive] Session opened successfully');
    this.isSessionReady = true;
    this.onStatusChange('connected');

    if (!this.inputAudioContext || !this.stream) {
      console.error('[GeminiLive] Audio context or stream not available');
      return;
    }

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

      // Send to API (only if session is ready)
      if (!this.isSessionReady) {
        return; // Skip sending audio until session is fully open
      }

      const pcmBlob = createPcmBlob(inputData);

      if (this.sessionPromise) {
        this.sessionPromise.then(session => {
          // Check if session is still valid before sending
          if (!session || typeof session.sendRealtimeInput !== 'function') {
            console.error('[GeminiLive] Session is not valid or already closed');
            this.isSessionReady = false;
            return;
          }

          try {
            session.sendRealtimeInput({ media: pcmBlob });
          } catch (err) {
            console.error('[GeminiLive] Exception sending audio:', err);
            this.isSessionReady = false;
            this.onError('Failed to send audio data');
          }
        }).catch(err => {
          console.error('[GeminiLive] Error sending audio:', err);
          this.isSessionReady = false;
          this.onError('Failed to send audio data');
        });
      }
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
    console.log('[GeminiLive] Audio pipeline connected and ready to send data');
  }

  private async handleOnMessage(message: LiveServerMessage) {
    console.log('[GeminiLive] Received message:', message);

    // Check for setup errors or other error messages
    if (message.setupComplete) {
      console.log('[GeminiLive] Setup complete:', message.setupComplete);
    }

    if (message.serverContent?.modelTurn?.parts) {
      const parts = message.serverContent.modelTurn.parts;
      parts.forEach((part: any) => {
        if (part.text) {
          console.log('[GeminiLive] Model text response:', part.text);
        }
        if (part.executableCode) {
          console.log('[GeminiLive] Executable code:', part.executableCode);
        }
      });
    }

    if (!this.outputAudioContext || !this.outputNode) {
      console.warn('[GeminiLive] Audio context not ready');
      return;
    }

    // 1. Handle Transcripts
    const outputTranscript = message.serverContent?.outputTranscription?.text;
    if (outputTranscript) {
      console.log('[GeminiLive] Model transcript:', outputTranscript);
      this.onTranscript(outputTranscript, false);
    }

    const inputTranscript = message.serverContent?.inputTranscription?.text;
    if (message.serverContent?.turnComplete && inputTranscript) {
      // We might receive partials, but let's just log on turn complete or if text is present
    }
    // Note: inputTranscription is often streamed. We can simplify by just logging whatever comes in if it's substantial.
    if (inputTranscript) {
      console.log('[GeminiLive] User transcript:', inputTranscript);
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
      console.log('[GeminiLive] Playback interrupted');
      this.sources.forEach(source => {
        try { source.stop(); } catch (e) { }
      });
      this.sources.clear();
      this.nextStartTime = 0;
    }
  }

  async disconnect() {
    console.log('[GeminiLive] Disconnecting...');
    this.isSessionReady = false;
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
        console.warn('[GeminiLive] Error closing session', e);
      }
    }

    console.log('[GeminiLive] Disconnected successfully');
    this.onStatusChange('disconnected');
    this.sessionPromise = null;
  }
}
