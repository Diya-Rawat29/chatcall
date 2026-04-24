"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  MessageSquare, 
  Phone, 
  Users, 
  Settings, 
  Search, 
  MoreVertical,
  LogOut,
  Plus,
  Bell
} from "lucide-react";
import SearchModal from "@/components/SearchModal";
import ChatWindow from "@/components/ChatWindow";
import CompleteProfileModal from "@/components/CompleteProfileModal";
import SettingsPanel from "@/components/SettingsPanel";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  query, 
  where, 
  updateDoc, 
  doc, 
  getDocs,
  arrayUnion,
  serverTimestamp 
} from "firebase/firestore";
import { app } from "@/lib/firebase";

export default function Dashboard() {
  const { user, profileData, loading, logout } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("chats");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const db = getFirestore(app);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
      return;
    }

    if (user) {
      // Listen for Requests
      const qReq = query(
        collection(db, "requests"), 
        where("receiverId", "==", user.uid),
        where("status", "==", "pending")
      );
      const unsubReq = onSnapshot(qReq, (snapshot) => {
        const reqs = [];
        snapshot.forEach((doc) => reqs.push({ id: doc.id, ...doc.data() }));
        setIncomingRequests(reqs);
      });

      // Listen for My User Profile to get connections array
      let unsubCons = () => {};
      const unsubUser = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
        const userData = docSnap.data();
        unsubCons(); // Unsubscribe previous listener if any
        if (userData?.connections?.length > 0) {
            const qCon = query(collection(db, "users"), where("uid", "in", userData.connections));
            unsubCons = onSnapshot(qCon, (conSnap) => {
                const cons = [];
                conSnap.forEach(d => cons.push({ ...d.data(), uid: d.id }));
                setConnections(cons);
            });
        } else {
            setConnections([]);
        }
      });

      return () => {
        unsubReq();
        unsubUser();
        unsubCons();
      };
    }
  }, [user, loading, router, db]);

  const acceptRequest = async (request) => {
    try {
      const requestRef = doc(db, "requests", request.id);
      await updateDoc(requestRef, { status: "accepted" });

      // Add to each other's connections
      await updateDoc(doc(db, "users", user.uid), {
        connections: arrayUnion(request.senderId)
      });
      await updateDoc(doc(db, "users", request.senderId), {
        connections: arrayUnion(user.uid)
      });

      // Create a private chat room between them if needed
      // (Simplified: just being connections is enough for now)
    } catch (error) {
      console.error("Accept failed:", error);
    }
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
      
      {/* 1. Slim Navigation Sidebar */}
      <nav className="flex w-20 flex-col items-center justify-between border-r border-white/5 bg-black py-8">
        <div className="flex flex-col gap-8">
          <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-blue-500">
            <MessageSquare size={20} />
          </div>
          <div className="flex flex-col gap-6">
            <NavIcon icon={<MessageSquare />} active={activeTab === "chats"} onClick={() => setActiveTab("chats")} />
            <NavIcon icon={<Phone />} active={activeTab === "calls"} onClick={() => setActiveTab("calls")} />
            <NavIcon icon={<Users />} active={activeTab === "connections"} onClick={() => setActiveTab("connections")} />
          </div>
        </div>
        <div className="flex flex-col gap-6">
          <NavIcon icon={<Settings />} active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
          <button onClick={logout} className="text-zinc-500 transition-colors hover:text-red-500">
            <LogOut size={24} />
          </button>
          <img src={user.photoURL} alt="Profile" className="h-10 w-10 rounded-full border border-white/10" />
        </div>
      </nav>

      {/* 2. Content Sidebar (Chat List / Connections List) */}
      <aside className="flex w-full max-w-[380px] flex-col border-r border-white/5 bg-[#09090b]">
        <header className="flex flex-col p-6 gap-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold capitalize">{activeTab}</h1>
            <button 
              onClick={() => setIsSearchOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 transition-hover hover:bg-purple-700"
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
            <input 
              type="text" 
              placeholder="Search..." 
              className="w-full rounded-xl bg-white/5 py-3 pl-10 pr-4 text-sm outline-none transition-focus focus:ring-1 focus:ring-purple-500"
            />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 custom-scrollbar">
          {incomingRequests.length > 0 && (
             <div className="mb-6 px-2">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-3 flex items-center gap-2">
                  <Bell size={12} /> Pending Requests
                </p>
                <div className="space-y-2">
                   {incomingRequests.map(req => (
                     <div key={req.id} className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5">
                        <div className="flex items-center gap-2">
                           <img src={req.senderPhoto} className="h-8 w-8 rounded-full" alt="" />
                           <p className="text-xs font-medium">{req.senderName.split(' ')[0]}</p>
                        </div>
                        <div className="flex gap-2">
                           <button onClick={() => acceptRequest(req)} className="bg-purple-600 text-[10px] px-3 py-1 rounded-md font-bold hover:bg-purple-700">Accept</button>
                        </div>
                     </div>
                   ))}
                </div>
             </div>
          )}
          
          {activeTab === "chats" && (
            <div className="flex flex-col gap-2">
              {connections.length > 0 ? connections.map(con => (
                <ChatPreview 
                  key={con.uid}
                  name={con.name} 
                  photo={con.photoURL}
                  msg="Click to start chatting" 
                  time="" 
                  online={con.status === "online"} 
                  onClick={() => setSelectedChat(con)}
                  active={selectedChat?.uid === con.uid}
                />
              )) : (
                <div className="text-center py-10 opacity-20">
                  <MessageSquare className="mx-auto mb-2" />
                  <p className="text-xs">No active chats</p>
                </div>
              )}
            </div>
          )}
          {activeTab === "connections" && (
            <div className="flex flex-col gap-2">
               {connections.map(con => (
                  <div key={con.uid} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                     <div className="flex items-center gap-3">
                        <img src={con.photoURL} className="h-10 w-10 rounded-full" alt="" />
                        <p className="text-sm font-medium">{con.name}</p>
                     </div>
                     <button onClick={() => setSelectedChat(con)} className="text-purple-400 hover:text-purple-300">
                        <MessageSquare size={18} />
                     </button>
                  </div>
               ))}
               {connections.length === 0 && (
                <div className="flex flex-col gap-2 text-center text-zinc-500 py-20">
                  <Users size={48} className="mx-auto mb-4 opacity-20" />
                  <p>No connections yet.</p>
                  <button onClick={() => setIsSearchOpen(true)} className="mt-4 text-purple-400 hover:underline">Find People</button>
                </div>
              )}
            </div>
          )}
        </main>
      </aside>

      {/* 3. Main Chat View / Placeholder */}
      <section className="flex flex-1 flex-col bg-[#0c0c0e]">
        {activeTab === "settings" ? (
          <SettingsPanel />
        ) : selectedChat ? (
          <ChatWindow selectedChat={selectedChat} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md space-y-6"
            >
              <div className="flex justify-center">
                <div className="h-24 w-24 flex items-center justify-center rounded-3xl bg-white/5 text-purple-500">
                    <MessageSquare size={48} />
                </div>
              </div>
              <h2 className="text-3xl font-bold">InstaChat Desktop</h2>
              <p className="text-zinc-500">
                Send and receive messages without keeping your phone online. Use InstaChat on up to 4 linked devices and 1 phone at the same time.
              </p>
            </motion.div>
          </div>
        )}
      </section>

      <AnimatePresence>
        {isSearchOpen && (
          <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function NavIcon({ icon, active, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`group relative flex h-12 w-12 items-center justify-center rounded-xl transition-all ${
        active ? "bg-purple-600/10 text-purple-500" : "text-zinc-500 hover:bg-white/5"
      }`}
    >
      {active && <motion.div layoutId="nav-active" className="absolute left-0 h-8 w-1 rounded-r-full bg-purple-500" />}
      {icon}
    </button>
  );
}

function ChatPreview({ name, msg, time, unread, online, photo, onClick, active }) {
  return (
    <button 
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-2xl p-4 transition-colors ${
        active ? "bg-purple-600/20 ring-1 ring-purple-600/50" : "hover:bg-white/5"
      }`}
    >
      <div className="relative">
        {photo ? (
          <img src={photo} className="h-12 w-12 rounded-2xl object-cover" alt="" />
        ) : (
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-zinc-700 to-zinc-900" />
        )}
        {online && <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-4 border-[#09090b] bg-green-500" />}
      </div>
      <div className="flex-1 text-left">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">{name}</h4>
          <span className="text-[10px] text-zinc-500">{time}</span>
        </div>
        <p className="line-clamp-1 text-xs text-zinc-400">{msg}</p>
      </div>
      {unread > 0 && (
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-[10px] font-bold">
          {unread}
        </div>
      )}
    </button>
  );
}
