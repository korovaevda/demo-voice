import React, { useState, useEffect, useRef } from 'react';
import { GeminiLiveService } from './services/geminiLive';
import Visualizer from './components/Visualizer';
import { ConnectionState, Language, MessageLog } from './types';
import { RESTAURANT_INFO } from './constants';

// Icons
const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
  </svg>
);

const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
  </svg>
);

const App: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [language, setLanguage] = useState<Language>(Language.ENGLISH);
  const [audioVolume, setAudioVolume] = useState(0);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  // Ref for the service to persist across renders without re-initializing unnecessarily
  const serviceRef = useRef<GeminiLiveService | null>(null);

  useEffect(() => {
    // Check for API Key
    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is missing");
      return;
    }

    try {
      // Initialize service
      serviceRef.current = new GeminiLiveService(
        (status) => setConnectionState(status as ConnectionState),
        (vol) => setAudioVolume(vol),
        (err) => console.error(err),
        (text, isUser) => {
          setLogs(prev => [
              ...prev, 
              { 
                  id: Date.now().toString(), 
                  role: isUser ? 'user' : 'model', 
                  text, 
                  timestamp: new Date() 
              }
          ].slice(-5)); // Keep last 5 messages for display
        }
      );
    } catch (error) {
      console.error("Failed to initialize GeminiLiveService:", error);
    }

    return () => {
      // Cleanup on unmount
      serviceRef.current?.disconnect();
    };
  }, []);

  if (!process.env.GEMINI_API_KEY) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-900 text-slate-50 font-sans">
        <div className="max-w-md text-center space-y-6">
          <h1 className="text-3xl font-serif text-gold-400 font-bold">Setup Required</h1>
          <p className="text-slate-300">
            To use this application, you need to provide a Google Gemini API key.
          </p>
          <div className="bg-slate-800 p-4 rounded-lg text-left text-sm font-mono text-slate-400 overflow-x-auto">
            <p>1. Create a <span className="text-gold-400">.env</span> file in the project root.</p>
            <p className="mt-2">2. Add your API key:</p>
            <p className="mt-1 text-emerald-400">GEMINI_API_KEY=your_api_key_here</p>
          </div>
          <p className="text-xs text-slate-500">
            You can get an API key from Google AI Studio.
          </p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const toggleConnection = async () => {
    if (connectionState === 'connected' || connectionState === 'connecting') {
      await serviceRef.current?.disconnect();
    } else {
      await serviceRef.current?.connect(language);
    }
  };

  const changeLanguage = async (lang: Language) => {
    if (language === lang) return;
    setLanguage(lang);
    
    // If currently connected, we need to reconnect to update the System Instruction
    if (connectionState === 'connected') {
      await serviceRef.current?.disconnect();
      // Short timeout to allow cleanup
      setTimeout(() => {
        serviceRef.current?.connect(lang);
      }, 500);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-6 bg-slate-900 text-slate-50 font-sans relative overflow-hidden">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gold-600 via-slate-900 to-slate-950"></div>

      {/* Header */}
      <header className="z-10 w-full max-w-2xl text-center space-y-2 mt-8">
        <h1 className="text-4xl md:text-5xl font-serif text-gold-400 font-bold tracking-tight">
          {RESTAURANT_INFO.name}
        </h1>
        <p className="text-slate-400 font-light text-sm md:text-base tracking-widest uppercase">
          {RESTAURANT_INFO.cuisine} &bull; Reservations
        </p>
      </header>

      {/* Main Content Area */}
      <main className="z-10 w-full max-w-lg flex flex-col items-center justify-center flex-grow space-y-8">
        
        {/* Connection Status Badge */}
        <div className={`
          px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase border
          ${connectionState === 'connected' 
            ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-400' 
            : connectionState === 'connecting'
            ? 'bg-amber-950/50 border-amber-500/50 text-amber-400 animate-pulse'
            : 'bg-slate-800/50 border-slate-700 text-slate-400'}
        `}>
          {connectionState === 'connected' ? 'Live Agent Active' : connectionState === 'connecting' ? 'Connecting...' : 'Ready to Connect'}
        </div>

        {/* Visualizer */}
        <div className="relative w-full aspect-square max-h-[350px] flex items-center justify-center">
            <Visualizer 
              isActive={connectionState === 'connected'} 
              volume={audioVolume}
              mode="listening" // Simplified for visualizer; in reality we'd track "speaking" vs "listening" more granularly if needed
            />
        </div>

        {/* Action Button */}
        <button
          onClick={toggleConnection}
          className={`
            group relative flex items-center justify-center w-20 h-20 rounded-full transition-all duration-300 shadow-xl
            ${connectionState === 'connected' 
              ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-900/20' 
              : 'bg-gold-500 hover:bg-gold-400 shadow-gold-900/20'}
          `}
        >
          {connectionState === 'connected' ? (
            <span className="text-white"><StopIcon /></span>
          ) : (
            <span className="text-slate-900 group-hover:scale-110 transition-transform"><MicIcon /></span>
          )}
          
          {/* Ring Ping Animation when disconnected */}
          {connectionState === 'disconnected' && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-gold-400 opacity-20 animate-ping"></span>
          )}
        </button>

      </main>

      {/* Footer / Controls */}
      <footer className="z-10 w-full max-w-2xl bg-slate-800/50 backdrop-blur-md rounded-2xl p-4 border border-slate-700/50 flex flex-col gap-4">
        
        {/* Language Toggle */}
        <div className="flex justify-center w-full">
            <div className="bg-slate-900/80 p-1 rounded-lg inline-flex relative">
              <button 
                onClick={() => changeLanguage(Language.ENGLISH)}
                className={`relative z-10 px-6 py-2 rounded-md text-sm font-medium transition-colors ${language === Language.ENGLISH ? 'text-slate-900 bg-gold-400' : 'text-slate-400 hover:text-slate-200'}`}
              >
                English
              </button>
              <button 
                onClick={() => changeLanguage(Language.ARABIC)}
                className={`relative z-10 px-6 py-2 rounded-md text-sm font-medium transition-colors ${language === Language.ARABIC ? 'text-slate-900 bg-gold-400' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Arabic (العربية)
              </button>
            </div>
        </div>

        {/* Recent Transcript (Fading) */}
        <div className="h-24 overflow-y-auto scrollbar-hide text-center space-y-2 px-2 mask-linear-gradient">
           {logs.length === 0 && <p className="text-slate-600 italic text-sm mt-8">Transcripts will appear here...</p>}
           {logs.map((log) => (
             <div key={log.id} className={`text-sm ${log.role === 'user' ? 'text-slate-400' : 'text-gold-200'}`}>
               <span className="opacity-50 text-xs uppercase mr-2">{log.role === 'user' ? 'You' : 'Layla'}:</span>
               {log.text}
             </div>
           ))}
           <div ref={logsEndRef} />
        </div>
      </footer>
    </div>
  );
};

export default App;
