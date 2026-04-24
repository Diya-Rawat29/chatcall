"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Phone, Users, Settings, Search, LogOut, Plus, Bell, Mic, MicOff, Video, VideoOff, PhoneOff, MonitorUp } from "lucide-react";
import SearchModal from "@/components/SearchModal";
import ChatWindow from "@/components/ChatWindow";
import CompleteProfileModal from "@/components/CompleteProfileModal";
import SettingsPanel from "@/components/SettingsPanel";
import { getFirestore, collection, onSnapshot, query, where, updateDoc, doc, getDocs, addDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { app } from "@/lib/firebase";
import { io } from "socket.io-client";

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

export default function Dashboard() {
  const { user, profileData, loading, logout } = useAuth();
  const router = useRouter();
  const db = getFirestore(app);

  // UI state
  const [activeTab, setActiveTab] = useState("chats");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);

  // Socket
  const socketRef = useRef(null);

  // Call state
  const [callState, setCallState] = useState(null); // null | "calling" | "incoming" | "connected"
  const [callerName, setCallerName] = useState("");
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callTarget, setCallTarget] = useState(null); // who we're calling / who called us

  // WebRTC refs
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingCandidates = useRef([]);
  const isInitiator = useRef(false);
  const callFromRef = useRef(null);
  const callTypeRef = useRef("video");
  const callStateRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => { callStateRef.current = callState; }, [callState]);

  // ── Redirect if logged out ──
  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  // ── Socket setup (at Dashboard level — works everywhere) ──
  useEffect(() => {
    if (!user) return;
    const sock = io(SOCKET_SERVER, { transports: ["websocket", "polling"], reconnectionAttempts: 10 });
    socketRef.current = sock;
    sock.emit("setup", { uid: user.uid, displayName: user.displayName });

    sock.on("incoming-call", ({ signal, from, name, callType }) => {
      if (callStateRef.current) return;
      callFromRef.current = from;
      callTypeRef.current = callType || "video";
      setCallerName(name);
      setIsAudioOnly(callType === "audio");
      setCallTarget({ uid: from, name });
      setCallState("incoming");
      if (signal.type === "offer") {
        pendingCandidates.current = [{ isOffer: true, sdp: signal.sdp }];
      }
    });

    sock.on("call-accepted", async ({ signal }) => {
      if (!pcRef.current || signal.type !== "answer") return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: signal.sdp }));
        for (const c of pendingCandidates.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
        pendingCandidates.current = [];
        setCallState("connected");
      } catch (err) { console.error("setRemoteDescription failed:", err); }
    });

    sock.on("ice-candidate", async ({ candidate }) => {
      if (pcRef.current?.remoteDescription) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        pendingCandidates.current.push(candidate);
      }
    });

    sock.on("call-ended", () => cleanupCall());

    return () => sock.disconnect();
  }, [user]); // eslint-disable-line

  // ── Firestore listeners ──
  useEffect(() => {
    if (!user) return;
    const qReq = query(collection(db, "requests"), where("receiverId", "==", user.uid), where("status", "==", "pending"));
    const unsubReq = onSnapshot(qReq, (snap) => {
      const reqs = [];
      snap.forEach(d => reqs.push({ id: d.id, ...d.data() }));
      setIncomingRequests(reqs);
    });
    let unsubCons = () => {};
    const unsubUser = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      const userData = docSnap.data();
      unsubCons();
      if (userData?.connections?.length > 0) {
        const qCon = query(collection(db, "users"), where("uid", "in", userData.connections));
        unsubCons = onSnapshot(qCon, (conSnap) => {
          const cons = [];
          conSnap.forEach(d => cons.push({ ...d.data(), uid: d.id }));
          setConnections(cons);
        });
      } else setConnections([]);
    });
    return () => { unsubReq(); unsubUser(); unsubCons(); };
  }, [user, db]);

  const acceptRequest = async (request) => {
    try {
      await updateDoc(doc(db, "requests", request.id), { status: "accepted" });
      await updateDoc(doc(db, "users", user.uid), { connections: arrayUnion(request.senderId) });
      await updateDoc(doc(db, "users", request.senderId), { connections: arrayUnion(user.uid) });
    } catch (error) { console.error("Accept failed:", error); }
  };

  // ── WebRTC helpers ──
  const createPeerConnection = useCallback((toUid) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socketRef.current?.emit("ice-candidate", { candidate, to: toUid });
    };
    pc.ontrack = (event) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setCallState("connected");
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") cleanupCall();
    };
    return pc;
  }, []);

  const sendSystemMsg = async (targetChat, text) => {
    const chat = targetChat || selectedChat;
    if (!chat) return;
    const roomId = [user.uid, chat.uid].sort().join("_");
    try { await addDoc(collection(db, "messages"), { roomId, senderId: user.uid, text, isSystem: true, createdAt: serverTimestamp() }); }
    catch (e) { console.error(e); }
  };

  // Called from ChatWindow via onStartCall prop
  const initiateCall = async (type, targetChat) => {
    const chat = targetChat || selectedChat;
    if (!chat) return;
    const isVideo = type === "video";
    callTypeRef.current = type;
    isInitiator.current = true;
    setIsAudioOnly(!isVideo);
    setCallTarget(chat);
    setCallState("calling");
    sendSystemMsg(chat, isVideo ? "🎥 Video Call Started" : "📞 Voice Call Started");

    try {
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true }); }
      catch { stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true }); }

      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPeerConnection(chat.uid);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketRef.current?.emit("call-user", {
        userToCall: chat.uid,
        from: user.uid,
        name: user.displayName || user.email,
        callType: type,
        signal: { type: "offer", sdp: offer.sdp },
      });
    } catch (err) {
      console.error("Call failed:", err);
      alert("Could not access camera/microphone. Please allow permissions.");
      setCallState(null);
    }
  };

  const acceptCall = async () => {
    setCallState("connected");
    sendSystemMsg(null, callTypeRef.current === "video" ? "🎥 Video Call Connected" : "📞 Voice Call Connected");
    isInitiator.current = false;

    try {
      const isVideo = callTypeRef.current === "video";
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true }); }
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

      socketRef.current?.emit("answer-call", {
        to: callFromRef.current,
        signal: { type: "answer", sdp: answer.sdp },
      });
    } catch (err) {
      console.error("Accept call failed:", err);
      cleanupCall();
    }
  };

  const cleanupCall = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    pendingCandidates.current = [];
    isInitiator.current = false;
    callFromRef.current = null;
    setCallState(null); setIsMuted(false); setIsVideoOff(false); setCallTarget(null);
  };

  const endCall = () => {
    const toUid = isInitiator.current ? callTarget?.uid : callFromRef.current;
    if (toUid) socketRef.current?.emit("call-ended", { to: toUid });
    sendSystemMsg(null, "📵 Call Ended");
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
      const sender = pcRef.current?.getSenders().find(s => s.track?.kind === "video");
      if (sender) {
        sender.replaceTrack(screenTrack);
        screenTrack.onended = () => {
          const camTrack = localStreamRef.current?.getVideoTracks()[0];
          if (camTrack) sender.replaceTrack(camTrack);
        };
      }
    } catch { console.log("Screen share cancelled"); }
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b]">
        <div className="h-12 w-12 animate-spin rounded-full border-t-2 border-purple-500" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#09090b] text-white overflow-hidden">
      {!profileData?.username && <CompleteProfileModal />}

      {/* Nav Sidebar */}
      <nav className={`flex-shrink-0 flex w-14 md:w-20 flex-col items-center justify-between border-r border-white/5 bg-black py-6 ${selectedChat ? "hidden md:flex" : "flex"}`}>
        <div className="flex flex-col gap-6 items-center">
          <div className="h-8 w-8 md:h-10 md:w-10 flex items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-blue-500">
            <MessageSquare size={18} />
          </div>
          <div className="flex flex-col gap-5 items-center mt-2">
            <NavIcon icon={<MessageSquare size={20} />} active={activeTab === "chats"} onClick={() => setActiveTab("chats")} />
            <NavIcon icon={<Users size={20} />} active={activeTab === "connections"} onClick={() => setActiveTab("connections")} />
          </div>
        </div>
        <div className="flex flex-col gap-5 items-center">
          <NavIcon icon={<Settings size={20} />} active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
          <button onClick={logout} className="text-zinc-500 hover:text-red-500 transition-colors"><LogOut size={20} /></button>
          <img src={user.photoURL} alt="" className="h-8 w-8 md:h-9 md:w-9 rounded-full border border-white/10" />
        </div>
      </nav>

      {/* Chat List Sidebar */}
      <aside className={`flex-shrink-0 flex-col border-r border-white/5 bg-[#09090b] w-full md:w-72 lg:w-80 ${selectedChat ? "hidden md:flex" : "flex"}`}>
        <header className="flex flex-col p-4 gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold capitalize">{activeTab}</h1>
            <button onClick={() => setIsSearchOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 hover:bg-purple-700">
              <Plus size={18} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={15} />
            <input type="text" placeholder="Search..." className="w-full rounded-xl bg-white/5 py-2.5 pl-9 pr-4 text-sm outline-none focus:ring-1 focus:ring-purple-500" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-3 custom-scrollbar">
          {incomingRequests.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-2 flex items-center gap-1 px-1"><Bell size={11} /> Requests</p>
              {incomingRequests.map(req => (
                <div key={req.id} className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5 mb-2">
                  <div className="flex items-center gap-2">
                    <img src={req.senderPhoto} className="h-8 w-8 rounded-full" alt="" />
                    <p className="text-xs font-medium">{req.senderName?.split(' ')[0]}</p>
                  </div>
                  <button onClick={() => acceptRequest(req)} className="bg-purple-600 text-[10px] px-3 py-1 rounded-md font-bold hover:bg-purple-700">Accept</button>
                </div>
              ))}
            </div>
          )}

          {activeTab === "chats" && connections.map(con => (
            <ChatPreview key={con.uid} name={con.name} photo={con.photoURL} online={con.status === "online"}
              onClick={() => setSelectedChat(con)} active={selectedChat?.uid === con.uid} />
          ))}
          {activeTab === "chats" && connections.length === 0 && (
            <div className="text-center py-16 opacity-20">
              <MessageSquare className="mx-auto mb-2" size={32} />
              <p className="text-xs">No chats yet</p>
            </div>
          )}
          {activeTab === "connections" && connections.map(con => (
            <div key={con.uid} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 mb-2">
              <div className="flex items-center gap-3">
                <img src={con.photoURL} className="h-10 w-10 rounded-full" alt="" />
                <p className="text-sm font-medium">{con.name}</p>
              </div>
              <button onClick={() => setSelectedChat(con)} className="text-purple-400 hover:text-purple-300">
                <MessageSquare size={18} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Area */}
      <section className={`flex-1 flex flex-col bg-[#0c0c0e] min-w-0 overflow-hidden ${selectedChat ? "flex" : "hidden md:flex"}`}>
        {activeTab === "settings" ? (
          <SettingsPanel />
        ) : selectedChat ? (
          <ChatWindow
            selectedChat={selectedChat}
            socket={socketRef.current}
            onStartCall={(type) => initiateCall(type, selectedChat)}
            onBack={() => setSelectedChat(null)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center p-6">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-sm space-y-4">
              <div className="h-20 w-20 mx-auto flex items-center justify-center rounded-3xl bg-white/5 text-purple-500">
                <MessageSquare size={40} />
              </div>
              <h2 className="text-2xl font-bold">InstaChat</h2>
              <p className="text-zinc-500 text-sm">Select a chat to start messaging or make a call.</p>
            </motion.div>
          </div>
        )}
      </section>

      {/* ─── GLOBAL CALL OVERLAY ─── */}
      <AnimatePresence>
        {callState && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-xl flex items-center justify-center p-2 md:p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              className="relative w-full max-w-4xl h-[90vh] md:h-[85vh] bg-[#0c0c0e] rounded-2xl md:rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl flex items-center justify-center">

              {/* Remote video */}
              <video ref={remoteVideoRef} autoPlay playsInline
                className={`absolute inset-0 w-full h-full object-cover ${callState !== "connected" || isAudioOnly ? "hidden" : ""}`} />

              {/* Center placeholder */}
              {(isAudioOnly || callState !== "connected") && (
                <div className="flex flex-col items-center gap-4 z-10 text-center px-6">
                  <div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden border-4 border-white/10 ring-4 ring-purple-500/30">
                    <img src={callTarget?.photoURL || `https://ui-avatars.com/api/?name=${callTarget?.name}&background=random`} alt="" className="w-full h-full object-cover" />
                  </div>
                  <h2 className="text-xl md:text-2xl font-bold text-white">{callTarget?.name || callerName}</h2>
                  <div className="flex items-center gap-2 text-zinc-400 text-sm">
                    {callState === "calling" && <><span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" /> Ringing...</>}
                    {callState === "incoming" && <><span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" /> Incoming {isAudioOnly ? "Voice" : "Video"} Call</>}
                    {callState === "connected" && isAudioOnly && <><span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" /> Call Connected</>}
                  </div>
                </div>
              )}

              {/* Local video (PiP) */}
              <div className={`absolute top-4 right-4 w-28 md:w-40 aspect-video bg-zinc-900 rounded-xl border-2 border-white/20 shadow-xl z-20 overflow-hidden ${isAudioOnly || isVideoOff ? "hidden" : ""}`}>
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
              </div>

              {/* Controls */}
              <div className="absolute bottom-6 md:bottom-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 md:gap-4 bg-black/70 backdrop-blur-md px-5 py-3 md:py-4 rounded-2xl border border-white/10">
                {callState === "incoming" ? (
                  <>
                    <button onClick={endCall} className="w-12 h-12 md:w-14 md:h-14 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors shadow-lg shadow-red-500/30">
                      <PhoneOff size={22} />
                    </button>
                    <button onClick={acceptCall} className="w-12 h-12 md:w-14 md:h-14 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center transition-colors shadow-lg shadow-green-500/30 animate-pulse">
                      <Phone size={22} />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={toggleMute} className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${isMuted ? "bg-red-500/80" : "bg-white/15 hover:bg-white/25"}`}>
                      {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>
                    {!isAudioOnly && (
                      <button onClick={toggleVideo} className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${isVideoOff ? "bg-red-500/80" : "bg-white/15 hover:bg-white/25"}`}>
                        {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
                      </button>
                    )}
                    {!isAudioOnly && (
                      <button onClick={shareScreen} className="hidden md:flex w-11 h-11 bg-blue-500/80 hover:bg-blue-500 rounded-full items-center justify-center transition-colors">
                        <MonitorUp size={20} />
                      </button>
                    )}
                    <button onClick={endCall} className="w-12 h-12 md:w-14 md:h-14 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors shadow-lg shadow-red-500/30">
                      <PhoneOff size={22} />
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSearchOpen && <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}

function NavIcon({ icon, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`relative flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl transition-all ${active ? "bg-purple-600/15 text-purple-500" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"}`}>
      {active && <motion.div layoutId="nav-active" className="absolute left-0 h-6 w-0.5 rounded-r-full bg-purple-500" />}
      {icon}
    </button>
  );
}

function ChatPreview({ name, photo, online, onClick, active }) {
  return (
    <button onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl p-3 transition-colors ${active ? "bg-purple-600/20 ring-1 ring-purple-600/50" : "hover:bg-white/5"}`}>
      <div className="relative flex-shrink-0">
        <img src={photo} className="h-11 w-11 rounded-full object-cover" alt="" />
        {online && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#09090b] bg-green-500" />}
      </div>
      <div className="flex-1 text-left min-w-0">
        <h4 className="font-semibold text-sm truncate">{name}</h4>
        <p className="text-xs text-zinc-500 truncate">{online ? "Online" : "Offline"}</p>
      </div>
    </button>
  );
}
