"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp 
} from "firebase/firestore";
import { app } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { io } from "socket.io-client";
import { Send, Smile, Paperclip, MoreVertical, Phone, Video, PhoneOff, MicOff, Mic, VideoOff, MonitorUp, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const SOCKET_SERVER = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:5000";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export default function ChatWindow({ selectedChat }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef(null);
  const db = getFirestore(app);

  // ---- Refs (no re-render needed) ----
  const socketRef = useRef(null);
  const pcRef = useRef(null);        // RTCPeerConnection
  const localStreamRef = useRef(null);
  const pendingCandidates = useRef([]);
  const isInitiator = useRef(false);
  const callFromRef = useRef(null);  // uid of the person who called us
  const callTypeRef = useRef("video"); // "video" | "audio"

  // ---- State (triggers UI re-render) ----
  const [callState, setCallState] = useState(null); // null | "calling" | "incoming" | "connected"
  const [callerName, setCallerName] = useState("");
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  // Video element refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // ----------------------------
  //  Socket setup
  // ----------------------------
  useEffect(() => {
    const sock = io(SOCKET_SERVER, { transports: ["websocket"] });
    socketRef.current = sock;

    if (user) sock.emit("setup", { uid: user.uid, displayName: user.displayName });

    sock.on("typing", () => setIsTyping(true));
    sock.on("stop-typing", () => setIsTyping(false));

    // STEP 2 (callee): receive offer from caller
    sock.on("incoming-call", async ({ signal, from, name, callType }) => {
      if (callState) return; // already in a call
      callFromRef.current = from;
      callTypeRef.current = callType || "video";
      setCallerName(name);
      setIsAudioOnly(callType === "audio");
      setCallState("incoming");

      // If it's an offer, store it — we'll use it when user clicks Accept
      if (signal.type === "offer") {
        pendingCandidates.current = [{ isOffer: true, sdp: signal.sdp }];
      }
    });

    // STEP 4 (caller): receive answer from callee
    sock.on("call-accepted", async ({ signal }) => {
      if (!pcRef.current) return;
      if (signal.type === "answer") {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: signal.sdp }));
        // Flush any buffered ICE candidates
        pendingCandidates.current.forEach(c => pcRef.current.addIceCandidate(new RTCIceCandidate(c)));
        pendingCandidates.current = [];
        setCallState("connected");
      }
    });

    // STEP 3 & 5: ICE candidates exchange
    sock.on("ice-candidate", async ({ candidate }) => {
      if (pcRef.current && pcRef.current.remoteDescription) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        pendingCandidates.current.push(candidate);
      }
    });

    sock.on("call-ended", () => {
      cleanupCall();
    });

    return () => {
      sock.disconnect();
    };
  }, [user]); // eslint-disable-line

  // Join chat room whenever selectedChat changes
  useEffect(() => {
    if (socketRef.current && selectedChat && user) {
      const roomId = [user.uid, selectedChat.uid].sort().join("_");
      socketRef.current.emit("join-chat", roomId);
    }
  }, [selectedChat, user]);

  // Attach local stream to video element when it arrives
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [callState]);

  // ----------------------------
  //  Messages
  // ----------------------------
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
    setNewMessage("");
    socketRef.current?.emit("stop-typing", roomId);
    await addDoc(collection(db, "messages"), {
      roomId, senderId: user.uid, text: newMessage, createdAt: serverTimestamp(),
    });
    socketRef.current?.emit("new-message", { roomId, senderId: user.uid });
  };

  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    const roomId = [user.uid, selectedChat.uid].sort().join("_");
    socketRef.current?.emit(e.target.value ? "typing" : "stop-typing", roomId);
  };

  const sendSystemMessage = async (text) => {
    const roomId = [user.uid, selectedChat.uid].sort().join("_");
    try {
      await addDoc(collection(db, "messages"), {
        roomId, senderId: user.uid, text, isSystem: true, createdAt: serverTimestamp(),
      });
    } catch (err) { console.error(err); }
  };

  // ----------------------------
  //  WebRTC helpers
  // ----------------------------
  const createPeerConnection = useCallback((toUid) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socketRef.current.emit("ice-candidate", { candidate, to: toUid });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setCallState("connected");
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") cleanupCall();
    };

    return pc;
  }, []);

  // STEP 1 (caller): initiate call
  const initiateCall = async (video = true) => {
    const type = video ? "video" : "audio";
    callTypeRef.current = type;
    isInitiator.current = true;
    setIsAudioOnly(!video);
    setCallState("calling");
    sendSystemMessage(video ? "🎥 Video Call Started" : "📞 Voice Call Started");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: true }).catch(async () => {
        return await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      });

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
      alert("Could not access camera/microphone. Please check permissions.");
      setCallState(null);
    }
  };

  // STEP 3 (callee): accept call
  const acceptCall = async () => {
    setCallState("connected");
    sendSystemMessage(callTypeRef.current === "video" ? "🎥 Video Call Connected" : "📞 Voice Call Connected");
    isInitiator.current = false;

    try {
      const video = callTypeRef.current === "video";
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: true }).catch(async () => {
        return await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPeerConnection(callFromRef.current);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Set the offer we stored earlier
      const offerData = pendingCandidates.current.find(c => c.isOffer);
      pendingCandidates.current = pendingCandidates.current.filter(c => !c.isOffer);

      await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: offerData.sdp }));

      // Flush any buffered ICE candidates
      for (const c of pendingCandidates.current) {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingCandidates.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketRef.current.emit("answer-call", {
        to: callFromRef.current,
        signal: { type: "answer", sdp: answer.sdp },
      });
    } catch (err) {
      console.error("Accept call failed:", err);
      setCallState(null);
    }
  };

  const cleanupCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    pendingCandidates.current = [];
    isInitiator.current = false;
    callFromRef.current = null;
    setCallState(null);
    setIsMuted(false);
    setIsVideoOff(false);
  };

  const endCall = () => {
    const toUid = isInitiator.current ? selectedChat.uid : callFromRef.current;
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
    } catch (err) { console.log("Screen share cancelled"); }
  };

  // ----------------------------
  //  Render
  // ----------------------------
  return (
    <div className="flex h-full flex-col bg-[#0c0c0e] relative">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/5 bg-[#09090b] px-6 py-4">
        <div className="flex items-center gap-4">
          <img src={selectedChat.photoURL} alt="" className="h-10 w-10 rounded-full" />
          <div>
            <h3 className="font-bold">{selectedChat.name}</h3>
            <p className="text-xs text-green-500">{isTyping ? "typing..." : "Online"}</p>
          </div>
        </div>
        <div className="flex items-center gap-6 text-zinc-400">
          <button onClick={() => initiateCall(false)} title="Voice Call" className="hover:text-white transition-colors"><Phone size={20} /></button>
          <button onClick={() => initiateCall(true)} title="Video Call" className="hover:text-white transition-colors"><Video size={20} /></button>
          <button className="hover:text-white transition-colors"><MoreVertical size={20} /></button>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
        {messages.map((msg, i) => {
          if (msg.isSystem) return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={msg.id || i} className="flex justify-center my-2">
              <div className="bg-white/5 border border-white/10 px-4 py-1.5 rounded-full text-xs text-zinc-400">{msg.text}</div>
            </motion.div>
          );
          const isMe = msg.senderId === user.uid;
          return (
            <motion.div initial={{ opacity: 0, x: isMe ? 20 : -20 }} animate={{ opacity: 1, x: 0 }} key={msg.id || i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${isMe ? "bg-purple-600 text-white rounded-tr-none" : "bg-white/5 text-zinc-200 rounded-tl-none"}`}>
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
      <footer className="bg-[#09090b] p-6">
        <form onSubmit={sendMessage} className="flex items-center gap-4 rounded-2xl bg-white/5 p-2 pr-4 focus-within:ring-1 focus-within:ring-purple-500/50">
          <button type="button" className="p-2 text-zinc-500 hover:text-white transition-colors"><Paperclip size={20} /></button>
          <input type="text" placeholder="Type a message..." value={newMessage} onChange={handleTyping} className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-zinc-600" />
          <button type="button" className="p-2 text-zinc-500 hover:text-white transition-colors"><Smile size={20} /></button>
          <button type="submit" disabled={!newMessage.trim()} className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 text-white transition-all hover:bg-purple-700 disabled:opacity-50">
            <Send size={18} />
          </button>
        </form>
      </footer>

      {/* ===== CALL OVERLAY ===== */}
      <AnimatePresence>
        {callState && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              className="relative w-full max-w-4xl h-[85vh] bg-[#0c0c0e] rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl flex items-center justify-center">

              {/* Remote Video (full screen, shows other user) */}
              <video ref={remoteVideoRef} autoPlay playsInline
                className={`absolute inset-0 w-full h-full object-cover ${callState !== "connected" || isAudioOnly ? "hidden" : ""}`}
              />

              {/* Audio only placeholder / Calling screen */}
              {(isAudioOnly || callState !== "connected") && (
                <div className="flex flex-col items-center gap-4 z-10">
                  <div className="w-28 h-28 rounded-full bg-white/10 flex items-center justify-center">
                    {callState === "incoming"
                      ? <img src={selectedChat.photoURL} alt="" className="w-full h-full rounded-full object-cover" />
                      : <img src={selectedChat.photoURL} alt="" className="w-full h-full rounded-full object-cover" />
                    }
                  </div>
                  <h2 className="text-2xl font-bold text-white">
                    {callState === "incoming" ? callerName : selectedChat.name}
                  </h2>
                  <p className="text-zinc-400 text-sm">
                    {callState === "calling" ? "Ringing..." : callState === "incoming" ? "Incoming Call..." : isAudioOnly ? "Voice Call Connected" : ""}
                  </p>
                </div>
              )}

              {/* Local Video (floating picture-in-picture, shows YOU) */}
              <div className={`absolute top-5 right-5 w-44 aspect-video bg-zinc-900 rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl z-20 ${isAudioOnly || isVideoOff ? "hidden" : ""}`}>
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover mirror" />
              </div>

              {/* Controls bar */}
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4 bg-black/60 backdrop-blur-md px-6 py-4 rounded-3xl border border-white/10">
                {callState === "incoming" ? (
                  <>
                    <button onClick={endCall} className="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30">
                      <PhoneOff size={24} />
                    </button>
                    <button onClick={acceptCall} className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center hover:bg-green-600 transition-colors shadow-lg shadow-green-500/30 animate-pulse">
                      <Phone size={24} />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={toggleMute} title={isMuted ? "Unmute" : "Mute"}
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isMuted ? "bg-red-500/80 hover:bg-red-500" : "bg-white/15 hover:bg-white/25"}`}>
                      {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>
                    {!isAudioOnly && (
                      <button onClick={toggleVideo} title={isVideoOff ? "Turn on camera" : "Turn off camera"}
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isVideoOff ? "bg-red-500/80 hover:bg-red-500" : "bg-white/15 hover:bg-white/25"}`}>
                        {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
                      </button>
                    )}
                    {!isAudioOnly && (
                      <button onClick={shareScreen} title="Share Screen"
                        className="w-12 h-12 bg-blue-500/80 hover:bg-blue-500 rounded-full flex items-center justify-center transition-colors">
                        <MonitorUp size={20} />
                      </button>
                    )}
                    <button onClick={endCall} title="End Call"
                      className="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30">
                      <PhoneOff size={24} />
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        .mirror { transform: scaleX(-1); }
      `}</style>
    </div>
  );
}
