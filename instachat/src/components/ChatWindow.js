"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getFirestore, collection, addDoc, query, where, onSnapshot, serverTimestamp } from "firebase/firestore";
import { app } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { io } from "socket.io-client";
import { Send, Smile, Paperclip, MoreVertical, Phone, Video, PhoneOff, MicOff, Mic, VideoOff, MonitorUp, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const SOCKET_SERVER = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:5000";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:openrelay.metered.ca:80" },
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  ],
};

export default function ChatWindow({ selectedChat, onBack }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef(null);
  const db = getFirestore(app);

  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingCandidates = useRef([]);
  const isInitiator = useRef(false);
  const callFromRef = useRef(null);
  const callTypeRef = useRef("video");
  const callStateRef = useRef(null); // fix closure bug

  const [callState, setCallState] = useState(null);
  const [callerName, setCallerName] = useState("");
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Keep ref in sync with state
  useEffect(() => { callStateRef.current = callState; }, [callState]);

  // Socket setup
  useEffect(() => {
    const sock = io(SOCKET_SERVER, { transports: ["websocket", "polling"], reconnectionAttempts: 5 });
    socketRef.current = sock;

    if (user) sock.emit("setup", { uid: user.uid, displayName: user.displayName });

    sock.on("typing", () => setIsTyping(true));
    sock.on("stop-typing", () => setIsTyping(false));

    sock.on("incoming-call", ({ signal, from, name, callType }) => {
      if (callStateRef.current) return;
      callFromRef.current = from;
      callTypeRef.current = callType || "video";
      setCallerName(name);
      setIsAudioOnly(callType === "audio");
      setCallState("incoming");
      if (signal.type === "offer") {
        pendingCandidates.current = [{ isOffer: true, sdp: signal.sdp }];
      }
    });

    sock.on("call-accepted", async ({ signal }) => {
      if (!pcRef.current) return;
      if (signal.type === "answer") {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: signal.sdp }));
          for (const c of pendingCandidates.current) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          pendingCandidates.current = [];
          setCallState("connected");
        } catch (err) { console.error("setRemoteDescription failed:", err); }
      }
    });

    sock.on("ice-candidate", async ({ candidate }) => {
      if (pcRef.current && pcRef.current.remoteDescription) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        pendingCandidates.current.push(candidate);
      }
    });

    sock.on("call-ended", () => cleanupCall());

    return () => sock.disconnect();
  }, [user]); // eslint-disable-line

  useEffect(() => {
    if (socketRef.current && selectedChat && user) {
      const roomId = [user.uid, selectedChat.uid].sort().join("_");
      socketRef.current.emit("join-chat", roomId);
    }
  }, [selectedChat, user]);

  useEffect(() => {
    if (!selectedChat) return;
    const roomId = [user.uid, selectedChat.uid].sort().join("_");
    const q = query(collection(db, "messages"), where("roomId", "==", roomId));
    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = [];
      snapshot.forEach(d => msgs.push({ id: d.id, ...d.data() }));
      msgs.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
      setMessages(msgs);
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
    return () => unsub();
  }, [selectedChat, db, user?.uid]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    const roomId = [user.uid, selectedChat.uid].sort().join("_");
    const text = newMessage;
    setNewMessage("");
    socketRef.current?.emit("stop-typing", roomId);
    await addDoc(collection(db, "messages"), { roomId, senderId: user.uid, text, createdAt: serverTimestamp() });
    socketRef.current?.emit("new-message", { roomId, senderId: user.uid });
  };

  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    const roomId = [user.uid, selectedChat.uid].sort().join("_");
    socketRef.current?.emit(e.target.value ? "typing" : "stop-typing", roomId);
  };

  const sendSystemMessage = async (text) => {
    const roomId = [user.uid, selectedChat.uid].sort().join("_");
    try { await addDoc(collection(db, "messages"), { roomId, senderId: user.uid, text, isSystem: true, createdAt: serverTimestamp() }); }
    catch (err) { console.error(err); }
  };

  const createPeerConnection = useCallback((toUid) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socketRef.current.emit("ice-candidate", { candidate, to: toUid });
    };
    pc.ontrack = (event) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setCallState("connected");
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") cleanupCall();
    };
    return pc;
  }, []); // eslint-disable-line

  const initiateCall = async (video = true) => {
    const type = video ? "video" : "audio";
    callTypeRef.current = type;
    isInitiator.current = true;
    setIsAudioOnly(!video);
    setCallState("calling");
    sendSystemMessage(video ? "🎥 Video Call Started" : "📞 Voice Call Started");
    try {
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video, audio: true }); }
      catch { stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true }); }
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = createPeerConnection(selectedChat.uid);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current.emit("call-user", {
        userToCall: selectedChat.uid,
        from: user.uid,
        name: user.displayName || user.email,
        callType: type,
        signal: { type: "offer", sdp: offer.sdp },
      });
    } catch (err) {
      console.error("Call initiation failed:", err);
      alert("Could not access camera/microphone. Please allow permissions.");
      setCallState(null);
    }
  };

  const acceptCall = async () => {
    setCallState("connected");
    sendSystemMessage(callTypeRef.current === "video" ? "🎥 Video Call Connected" : "📞 Voice Call Connected");
    isInitiator.current = false;
    try {
      const video = callTypeRef.current === "video";
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video, audio: true }); }
      catch { stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true }); }
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = createPeerConnection(callFromRef.current);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      const offerData = pendingCandidates.current.find(c => c.isOffer);
      pendingCandidates.current = pendingCandidates.current.filter(c => !c.isOffer);
      if (!offerData) { cleanupCall(); return; }
      await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: offerData.sdp }));
      for (const c of pendingCandidates.current) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }
      pendingCandidates.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current.emit("answer-call", { to: callFromRef.current, signal: { type: "answer", sdp: answer.sdp } });
    } catch (err) {
      console.error("Accept call failed:", err);
      cleanupCall();
    }
  };

  const cleanupCall = () => {
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    pendingCandidates.current = [];
    isInitiator.current = false;
    callFromRef.current = null;
    setCallState(null); setIsMuted(false); setIsVideoOff(false);
  };

  const endCall = () => {
    const toUid = isInitiator.current ? selectedChat?.uid : callFromRef.current;
    if (toUid) socketRef.current?.emit("call-ended", { to: toUid });
    sendSystemMessage("📵 Call Ended");
    cleanupCall();
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const audio = localStreamRef.current.getAudioTracks()[0];
    if (audio) { audio.enabled = !audio.enabled; setIsMuted(!audio.enabled); }
  };

  const toggleVideo = () => {
    if (!localStreamRef.current) return;
    const vid = localStreamRef.current.getVideoTracks()[0];
    if (vid) { vid.enabled = !vid.enabled; setIsVideoOff(!vid.enabled); }
  };

  const shareScreen = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      if (pcRef.current && localStreamRef.current) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === "video");
        if (sender) {
          sender.replaceTrack(screenTrack);
          screenTrack.onended = () => {
            const camTrack = localStreamRef.current?.getVideoTracks()[0];
            if (camTrack && sender) sender.replaceTrack(camTrack);
          };
        }
      }
    } catch { console.log("Screen share cancelled"); }
  };

  return (
    <div className="flex h-full flex-col bg-[#0c0c0e] relative">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/5 bg-[#09090b] px-4 md:px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="md:hidden text-zinc-400 hover:text-white">
              <ArrowLeft size={20} />
            </button>
          )}
          <img src={selectedChat.photoURL} alt="" className="h-9 w-9 md:h-10 md:w-10 rounded-full" />
          <div>
            <h3 className="font-bold text-sm md:text-base">{selectedChat.name}</h3>
            <p className="text-xs text-green-500">{isTyping ? "typing..." : "Online"}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 md:gap-6 text-zinc-400">
          <button onClick={() => initiateCall(false)} title="Voice Call" className="hover:text-white transition-colors"><Phone size={20} /></button>
          <button onClick={() => initiateCall(true)} title="Video Call" className="hover:text-white transition-colors"><Video size={20} /></button>
          <button className="hover:text-white transition-colors"><MoreVertical size={20} /></button>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar">
        {messages.map((msg, i) => {
          if (msg.isSystem) return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={msg.id || i} className="flex justify-center my-2">
              <div className="bg-white/5 border border-white/10 px-4 py-1.5 rounded-full text-xs text-zinc-400">{msg.text}</div>
            </motion.div>
          );
          const isMe = msg.senderId === user.uid;
          return (
            <motion.div initial={{ opacity: 0, x: isMe ? 20 : -20 }} animate={{ opacity: 1, x: 0 }} key={msg.id || i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] md:max-w-[70%] rounded-2xl px-4 py-3 ${isMe ? "bg-purple-600 text-white rounded-tr-none" : "bg-white/5 text-zinc-200 rounded-tl-none"}`}>
                <p className="text-sm leading-relaxed">{msg.text}</p>
                <p className={`mt-1 text-[10px] ${isMe ? "text-purple-200" : "text-zinc-500"}`}>
                  {msg.createdAt?.toDate ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "just now"}
                </p>
              </div>
            </motion.div>
          );
        })}
        <div ref={scrollRef} />
      </main>

      {/* Input */}
      <footer className="bg-[#09090b] p-3 md:p-6 flex-shrink-0">
        <form onSubmit={sendMessage} className="flex items-center gap-2 md:gap-4 rounded-2xl bg-white/5 p-2 pr-3 md:pr-4 focus-within:ring-1 focus-within:ring-purple-500/50">
          <button type="button" className="p-2 text-zinc-500 hover:text-white transition-colors hidden md:block"><Paperclip size={20} /></button>
          <input type="text" placeholder="Type a message..." value={newMessage} onChange={handleTyping} className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-zinc-600" />
          <button type="button" className="p-2 text-zinc-500 hover:text-white transition-colors hidden md:block"><Smile size={20} /></button>
          <button type="submit" disabled={!newMessage.trim()} className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 text-white transition-all hover:bg-purple-700 disabled:opacity-50">
            <Send size={18} />
          </button>
        </form>
      </footer>

      {/* ===== CALL OVERLAY ===== */}
      <AnimatePresence>
        {callState && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-2 md:p-4"
          >
            <motion.div
              initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              className="relative w-full max-w-4xl h-[90vh] md:h-[85vh] bg-[#0c0c0e] rounded-[1.5rem] md:rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl flex items-center justify-center"
            >
              {/* Remote Video */}
              <video
                ref={remoteVideoRef} autoPlay playsInline
                className={`absolute inset-0 w-full h-full object-cover ${callState !== "connected" || isAudioOnly ? "hidden" : ""}`}
              />

              {/* Placeholder when audio-only or not connected */}
              {(isAudioOnly || callState !== "connected") && (
                <div className="flex flex-col items-center gap-4 z-10 text-center px-4">
                  <div className="w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden border-4 border-white/10">
                    <img src={selectedChat?.photoURL} alt="" className="w-full h-full object-cover" />
                  </div>
                  <h2 className="text-xl md:text-2xl font-bold text-white">
                    {callState === "incoming" ? callerName : selectedChat?.name}
                  </h2>
                  <p className="text-zinc-400 text-sm">
                    {callState === "calling" ? "Ringing..." : callState === "incoming" ? "Incoming Call..." : "Connected"}
                  </p>
                </div>
              )}

              {/* Local Video (floating) */}
              <div className={`absolute top-4 right-4 w-28 md:w-44 aspect-video bg-zinc-900 rounded-xl md:rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl z-20 ${isAudioOnly || isVideoOff ? "hidden" : ""}`}>
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
              </div>

              {/* Controls */}
              <div className="absolute bottom-6 md:bottom-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 md:gap-4 bg-black/60 backdrop-blur-md px-4 md:px-6 py-3 md:py-4 rounded-2xl md:rounded-3xl border border-white/10">
                {callState === "incoming" ? (
                  <>
                    <button onClick={endCall} className="w-12 h-12 md:w-14 md:h-14 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30">
                      <PhoneOff size={22} />
                    </button>
                    <button onClick={acceptCall} className="w-12 h-12 md:w-14 md:h-14 bg-green-500 rounded-full flex items-center justify-center hover:bg-green-600 transition-colors shadow-lg shadow-green-500/30 animate-pulse">
                      <Phone size={22} />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={toggleMute} title={isMuted ? "Unmute" : "Mute"} className={`w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-colors ${isMuted ? "bg-red-500/80 hover:bg-red-500" : "bg-white/15 hover:bg-white/25"}`}>
                      {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>
                    {!isAudioOnly && (
                      <button onClick={toggleVideo} title={isVideoOff ? "Camera On" : "Camera Off"} className={`w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-colors ${isVideoOff ? "bg-red-500/80 hover:bg-red-500" : "bg-white/15 hover:bg-white/25"}`}>
                        {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
                      </button>
                    )}
                    {!isAudioOnly && (
                      <button onClick={shareScreen} title="Share Screen" className="hidden md:flex w-12 h-12 bg-blue-500/80 hover:bg-blue-500 rounded-full items-center justify-center transition-colors">
                        <MonitorUp size={20} />
                      </button>
                    )}
                    <button onClick={endCall} title="End Call" className="w-12 h-12 md:w-14 md:h-14 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30">
                      <PhoneOff size={22} />
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
