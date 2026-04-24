"use client";

import { useState, useEffect, useRef } from "react";
import { getFirestore, collection, addDoc, query, where, onSnapshot, serverTimestamp } from "firebase/firestore";
import { app } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { Send, Paperclip, MoreVertical, Phone, Video, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

export default function ChatWindow({ selectedChat, socket, onStartCall, onBack }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef(null);
  const db = getFirestore(app);

  // Join room + listen for typing
  useEffect(() => {
    if (!socket || !selectedChat || !user) return;
    const roomId = [user.uid, selectedChat.uid].sort().join("_");
    socket.emit("join-chat", roomId);
    const handleTyping = () => setIsTyping(true);
    const handleStopTyping = () => setIsTyping(false);
    socket.on("typing", handleTyping);
    socket.on("stop-typing", handleStopTyping);
    return () => {
      socket.off("typing", handleTyping);
      socket.off("stop-typing", handleStopTyping);
    };
  }, [socket, selectedChat, user]);

  // Load messages
  useEffect(() => {
    if (!selectedChat || !user) return;
    const roomId = [user.uid, selectedChat.uid].sort().join("_");
    const q = query(collection(db, "messages"), where("roomId", "==", roomId));
    const unsub = onSnapshot(q, (snap) => {
      const msgs = [];
      snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
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
    socket?.emit("stop-typing", roomId);
    await addDoc(collection(db, "messages"), { roomId, senderId: user.uid, text, createdAt: serverTimestamp() });
    socket?.emit("new-message", { roomId, senderId: user.uid });
  };

  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    const roomId = [user.uid, selectedChat.uid].sort().join("_");
    socket?.emit(e.target.value ? "typing" : "stop-typing", roomId);
  };

  return (
    <div className="flex h-full flex-col bg-[#0c0c0e] relative">
      <header className="flex items-center justify-between border-b border-white/5 bg-[#09090b] px-4 md:px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="md:hidden text-zinc-400 hover:text-white">
              <ArrowLeft size={20} />
            </button>
          )}
          <img src={selectedChat.photoURL} alt="" className="h-9 w-9 rounded-full" />
          <div>
            <h3 className="font-bold text-sm md:text-base">{selectedChat.name}</h3>
            <p className="text-xs text-green-500">{isTyping ? "typing..." : "Online"}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-zinc-400">
          <button onClick={() => onStartCall?.("audio")} title="Voice Call" className="hover:text-white transition-colors"><Phone size={20} /></button>
          <button onClick={() => onStartCall?.("video")} title="Video Call" className="hover:text-white transition-colors"><Video size={20} /></button>
          <button className="hover:text-white transition-colors"><MoreVertical size={20} /></button>
        </div>
      </header>

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

      <footer className="bg-[#09090b] p-3 md:p-6 flex-shrink-0">
        <form onSubmit={sendMessage} className="flex items-center gap-2 rounded-2xl bg-white/5 p-2 pr-3 focus-within:ring-1 focus-within:ring-purple-500/50">
          <button type="button" className="p-2 text-zinc-500 hover:text-white transition-colors hidden md:block"><Paperclip size={20} /></button>
          <input type="text" placeholder="Type a message..." value={newMessage} onChange={handleTyping} className="flex-1 bg-transparent py-2 px-2 text-sm outline-none placeholder:text-zinc-600" />
          <button type="submit" disabled={!newMessage.trim()} className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 text-white transition-all hover:bg-purple-700 disabled:opacity-50">
            <Send size={18} />
          </button>
        </form>
      </footer>
    </div>
  );
}
