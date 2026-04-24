"use client";

import { useState } from "react";
import { 
  getFirestore, 
  doc, 
  setDoc, // Changed from updateDoc to setDoc
  query, 
  collection, 
  where, 
  getDocs 
} from "firebase/firestore";
import { app } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";
import { User, Check, Loader2, AlertCircle, Info, Phone, AlignLeft } from "lucide-react";

export default function CompleteProfileModal() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    username: "",
    name: user?.displayName || "",
    bio: "",
    phone: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const db = getFirestore(app);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanUsername = formData.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");

    if (cleanUsername.length < 3) {
      setError("Username must be at least 3 characters.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Check if username is unique (excluding self)
      const q = query(collection(db, "users"), where("username", "==", cleanUsername));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty && querySnapshot.docs[0].id !== user.uid) {
        setError("This username is already taken.");
        setLoading(false);
        return;
      }

      // Update user profile using setDoc with merge to ensure doc exists
      await setDoc(doc(db, "users", user.uid), {
        username: cleanUsername,
        name: formData.name,
        bio: formData.bio,
        phone: formData.phone,
        isProfileComplete: true
      }, { merge: true });

    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg rounded-[2.5rem] border border-white/10 bg-[#0c0c0e] p-8 md:p-12 shadow-2xl my-8"
      >
        <div className="mb-8 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-gradient-to-tr from-purple-600 to-blue-500 shadow-2xl shadow-purple-500/30">
                <User size={36} className="text-white" />
            </div>
            <h2 className="text-3xl font-black tracking-tight text-white mb-2">Build Your Identity</h2>
            <p className="text-zinc-500 text-sm">Tell the world who you are on InstaChat.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Username */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-zinc-500 ml-2 tracking-widest">Unique Handle</label>
            <div className="relative group">
                <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black transition-colors ${formData.username ? 'text-purple-500' : 'text-zinc-700'}`}>@</span>
                <input 
                type="text" 
                placeholder="username" 
                value={formData.username}
                onChange={(e) => setFormData({...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")})}
                className="w-full rounded-2xl bg-white/[0.03] border border-white/5 py-4 pl-12 pr-4 text-base font-medium outline-none transition-all focus:ring-2 focus:ring-purple-500/50 focus:bg-white/[0.05]"
                required
                />
            </div>
          </div>

          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-zinc-500 ml-2 tracking-widest">Display Name</label>
            <div className="relative">
                <Info size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700" />
                <input 
                type="text" 
                placeholder="Your Name" 
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full rounded-2xl bg-white/[0.03] border border-white/5 py-4 pl-12 pr-4 text-base font-medium outline-none transition-all focus:ring-2 focus:ring-purple-500/50 focus:bg-white/[0.05]"
                required
                />
            </div>
          </div>

          {/* Bio */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-zinc-500 ml-2 tracking-widest">Short Bio</label>
            <div className="relative">
                <AlignLeft size={18} className="absolute left-4 top-5 text-zinc-700" />
                <textarea 
                placeholder="Tell us something cool..." 
                value={formData.bio}
                onChange={(e) => setFormData({...formData, bio: e.target.value})}
                className="w-full h-28 rounded-2xl bg-white/[0.03] border border-white/5 py-4 pl-12 pr-4 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-purple-500/50 focus:bg-white/[0.05] resize-none"
                />
            </div>
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-zinc-500 ml-2 tracking-widest">Phone Number (Optional)</label>
            <div className="relative">
                <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700" />
                <input 
                type="tel" 
                placeholder="+1 234 567 890" 
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                className="w-full rounded-2xl bg-white/[0.03] border border-white/5 py-4 pl-12 pr-4 text-base font-medium outline-none transition-all focus:ring-2 focus:ring-purple-500/50 focus:bg-white/[0.05]"
                />
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 rounded-2xl bg-red-500/10 p-4 text-xs text-red-500 border border-red-500/20"
            >
              <AlertCircle size={14} />
              {error}
            </motion.div>
          )}

          <button 
            type="submit"
            disabled={loading || !formData.username || !formData.name}
            className="group relative h-16 w-full overflow-hidden rounded-2xl bg-purple-600 font-black text-white shadow-xl shadow-purple-500/20 transition-all hover:bg-purple-500 hover:shadow-purple-500/30 active:scale-95 disabled:opacity-50"
          >
            {loading ? (
                <Loader2 className="mx-auto animate-spin" />
            ) : (
                <span className="flex items-center justify-center gap-2">
                    Let's Go <Check size={20} />
                </span>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
