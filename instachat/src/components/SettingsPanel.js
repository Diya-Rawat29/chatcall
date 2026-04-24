"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getFirestore, doc, updateDoc } from "firebase/firestore";
import { getAuth, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { app } from "@/lib/firebase";
import { motion } from "framer-motion";
import { User, Lock, Mail, Phone, Calendar, Save, CheckCircle2, AlertCircle } from "lucide-react";

export default function SettingsPanel() {
  const { user, profileData } = useAuth();
  const [activeTab, setActiveTab] = useState("profile"); // profile or security
  const db = getFirestore(app);
  const auth = getAuth(app);

  // Profile Form State
  const [formData, setFormData] = useState({
    name: profileData?.name || "",
    username: profileData?.username || "",
    bio: profileData?.bio || "",
    phone: profileData?.phone || "",
    dob: profileData?.dob || ""
  });
  
  // Security Form State
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  
  // Status
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      await updateDoc(doc(db, "users", user.uid), {
        name: formData.name,
        username: formData.username,
        bio: formData.bio,
        phone: formData.phone,
        dob: formData.dob
      });
      setSuccess("Profile updated successfully!");
    } catch (err) {
      setError("Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setError("New passwords do not match.");
      return;
    }
    
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const credential = EmailAuthProvider.credential(user.email, passwords.current);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, passwords.new);
      setSuccess("Password updated successfully!");
      setPasswords({ current: "", new: "", confirm: "" });
    } catch (err) {
      console.error(err);
      setError("Failed to change password. Please check your current password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center py-12 px-6 overflow-y-auto">
      <div className="w-full max-w-2xl">
        <h2 className="text-3xl font-bold mb-8">Settings</h2>
        
        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-white/10 pb-4">
          <button 
            onClick={() => { setActiveTab("profile"); setError(""); setSuccess(""); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${activeTab === 'profile' ? 'bg-purple-600/20 text-purple-400' : 'text-zinc-500 hover:text-white'}`}
          >
            <User size={18} /> Profile Details
          </button>
          <button 
            onClick={() => { setActiveTab("security"); setError(""); setSuccess(""); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${activeTab === 'security' ? 'bg-purple-600/20 text-purple-400' : 'text-zinc-500 hover:text-white'}`}
          >
            <Lock size={18} /> Security & Password
          </button>
        </div>

        {/* Alerts */}
        {error && <div className="mb-6 flex items-center gap-2 p-4 bg-red-500/10 text-red-500 rounded-xl border border-red-500/20"><AlertCircle size={18} /> {error}</div>}
        {success && <div className="mb-6 flex items-center gap-2 p-4 bg-green-500/10 text-green-500 rounded-xl border border-green-500/20"><CheckCircle2 size={18} /> {success}</div>}

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <motion.form 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} 
            onSubmit={handleProfileUpdate} 
            className="space-y-6 bg-white/5 p-8 rounded-3xl border border-white/10"
          >
            <div className="flex items-center gap-6 mb-4">
              <img src={user.photoURL} alt="Profile" className="w-24 h-24 rounded-full border-4 border-[#09090b]" />
              <div>
                <p className="text-sm text-zinc-500">Profile photos can be updated via your Google account.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Full Name</label>
                <input 
                  type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-purple-500" required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Username</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">@</span>
                  <input 
                    type="text" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})}
                    className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 outline-none focus:border-purple-500" required
                  />
                </div>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Bio</label>
                <textarea 
                  value={formData.bio} onChange={e => setFormData({...formData, bio: e.target.value})} rows="3"
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-purple-500 resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Contact Info (Phone)</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input 
                    type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
                    className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 outline-none focus:border-purple-500"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Date of Birth</label>
                <div className="relative">
                  <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input 
                    type="date" value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})}
                    className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 flex justify-end">
              <button 
                type="submit" disabled={loading}
                className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Save size={18} /> Save Profile
              </button>
            </div>
          </motion.form>
        )}

        {/* Security Tab */}
        {activeTab === "security" && (
          <motion.form 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} 
            onSubmit={handlePasswordUpdate} 
            className="space-y-6 bg-white/5 p-8 rounded-3xl border border-white/10"
          >
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Current Password</label>
              <input 
                type="password" value={passwords.current} onChange={e => setPasswords({...passwords, current: e.target.value})}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-purple-500" required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">New Password</label>
              <input 
                type="password" value={passwords.new} onChange={e => setPasswords({...passwords, new: e.target.value})}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-purple-500" required minLength="6"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Confirm New Password</label>
              <input 
                type="password" value={passwords.confirm} onChange={e => setPasswords({...passwords, confirm: e.target.value})}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-purple-500" required minLength="6"
              />
            </div>
            
            <div className="pt-4 border-t border-white/10 flex justify-end">
              <button 
                type="submit" disabled={loading}
                className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Lock size={18} /> Update Password
              </button>
            </div>
          </motion.form>
        )}

      </div>
    </div>
  );
}
