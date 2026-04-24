"use client";

import { useState } from "react";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  serverTimestamp 
} from "firebase/firestore";
import { app } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, UserPlus, Check, Loader2 } from "lucide-react";

export default function SearchModal({ isOpen, onClose }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [requestSent, setRequestSent] = useState({}); // {uid: true}
  const { user, profileData } = useAuth(); // Added profileData
  const db = getFirestore(app);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    try {
      // Check for email OR username
      const qEmail = query(collection(db, "users"), where("email", "==", searchTerm.trim()));
      const qUser = query(collection(db, "users"), where("username", "==", searchTerm.trim().toLowerCase()));
      
      const [emailSnap, userSnap] = await Promise.all([getDocs(qEmail), getDocs(qUser)]);
      
      const users = [];
      const seenUids = new Set();

      [...emailSnap.docs, ...userSnap.docs].forEach((doc) => {
        if (doc.id !== user?.uid && !seenUids.has(doc.id)) {
            users.push({ ...doc.data(), uid: doc.id }); // Ensure uid is always set from doc.id
            seenUids.add(doc.id);
        }
      });
      setResults(users);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  };

  const sendRequest = async (receiver) => {
    if (!receiver.uid) return console.error("Receiver UID is missing");

    try {
      await addDoc(collection(db, "requests"), {
        senderId: user.uid,
        senderName: profileData?.name || user.displayName,
        senderPhoto: user.photoURL,
        senderUsername: profileData?.username || "",
        receiverId: receiver.uid,
        status: "pending",
        createdAt: serverTimestamp()
      });
      setRequestSent(prev => ({ ...prev, [receiver.uid]: true }));
    } catch (error) {
      console.error("Request failed:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#121214] p-8 shadow-2xl"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold">Find Friends</h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSearch} className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input 
            autoFocus
            type="text" 
            placeholder="Search by email or @username..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-2xl bg-white/5 py-4 pl-12 pr-4 outline-none ring-1 ring-white/10 transition-focus focus:ring-purple-500"
          />
          {loading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-purple-500" size={18} />}
        </form>

        <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar">
          {results.length > 0 ? (
            results.map((res) => (
              <div key={res.uid} className="flex items-center justify-between rounded-2xl bg-white/5 p-4 border border-transparent hover:border-white/5 transition-all">
                <div className="flex items-center gap-3">
                  <img src={res.photoURL} className="h-10 w-10 rounded-full" alt="" />
                  <div>
                    <div className="flex items-center gap-2">
                       <p className="font-semibold text-sm">{res.name}</p>
                       {res.username && <span className="text-[10px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full font-bold">@{res.username}</span>}
                    </div>
                    <p className="text-xs text-zinc-500">{res.email}</p>
                  </div>
                </div>
                {requestSent[res.uid] ? (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                    <Check size={20} />
                  </div>
                ) : (
                  <button 
                    onClick={() => sendRequest(res)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-600 text-white hover:bg-purple-700 transition-all shadow-lg shadow-purple-500/20"
                  >
                    <UserPlus size={20} />
                  </button>
                )}
              </div>
            ))
          ) : searchTerm && !loading && (
            <p className="text-center text-zinc-500 py-4">No users found with this email.</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
