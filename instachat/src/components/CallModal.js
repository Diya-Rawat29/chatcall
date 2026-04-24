"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, User, MonitorUp } from "lucide-react";
import { io } from "socket.io-client";
import { useAuth } from "@/context/AuthContext";

const SOCKET_SERVER = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:5000";

export default function CallModal({ 
  isIncoming, 
  callerName, 
  callerId, 
  onAccept, 
  onReject, 
  onEnd,
  isAudioOnly = false,
  localStream,
  remoteStream,
  isMuted,
  isVideoOff,
  toggleMute,
  toggleVideo,
  shareScreen
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-xl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-3xl h-[80vh] bg-[#0c0c0e] rounded-[3rem] border border-white/10 shadow-2xl flex flex-col overflow-hidden relative"
      >
        {/* Remote Video (Full Screen) */}
        {remoteStream && !isAudioOnly ? (
            <VideoPlayer stream={remoteStream} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="w-32 h-32 rounded-full bg-white/5 flex items-center justify-center mb-6 animate-pulse">
                    <User size={48} className="text-zinc-600" />
                </div>
                <h2 className="text-2xl font-bold">{callerName}</h2>
                <p className="text-zinc-500 mt-2">{isIncoming ? "Incoming Call..." : "Connected"}</p>
                {remoteStream && isAudioOnly && <VideoPlayer stream={remoteStream} className="hidden" />}
            </div>
        )}

        {/* Local Video (Floating) */}
        {localStream && !isAudioOnly && !isVideoOff && (
            <div className="absolute top-6 right-6 w-48 h-72 bg-black rounded-2xl overflow-hidden border border-white/10 shadow-xl z-10">
                <VideoPlayer stream={localStream} muted className="w-full h-full object-cover" />
            </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-6 p-4 bg-black/50 backdrop-blur-md rounded-3xl border border-white/10 z-10">
            {isIncoming ? (
                <>
                    <button onClick={onReject} className="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20">
                        <PhoneOff size={24} />
                    </button>
                    <button onClick={onAccept} className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center text-white hover:bg-green-600 transition-colors shadow-lg shadow-green-500/20 animate-bounce">
                        <Phone size={24} />
                    </button>
                </>
            ) : (
                <>
                    <button onClick={toggleMute} className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-colors ${isMuted ? 'bg-red-500/80 hover:bg-red-600' : 'bg-white/10 hover:bg-white/20'}`}>
                        {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                    </button>
                    
                    {!isAudioOnly && (
                        <button onClick={toggleVideo} className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-colors ${isVideoOff ? 'bg-red-500/80 hover:bg-red-600' : 'bg-white/10 hover:bg-white/20'}`}>
                            {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
                        </button>
                    )}

                    {!isAudioOnly && (
                        <button onClick={shareScreen} className="w-14 h-14 bg-blue-500/80 rounded-full flex items-center justify-center text-white hover:bg-blue-600 transition-colors">
                            <MonitorUp size={24} />
                        </button>
                    )}

                    <button onClick={onEnd} className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20">
                        <PhoneOff size={28} />
                    </button>
                </>
            )}
        </div>
      </motion.div>
    </div>
  );
}

function VideoPlayer({ stream, muted, className }) {
    const videoRef = useRef(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return <video ref={videoRef} autoPlay playsInline muted={muted} className={className} />;
}
