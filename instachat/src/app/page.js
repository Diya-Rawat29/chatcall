"use client";

import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Video, Shield, UserPlus, Mail, Lock, User, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Home() {
  const { user, loginWithGoogle, registerWithEmail, loginWithEmail } = useAuth();
  const router = useRouter();
  const [authMode, setAuthMode] = useState("login"); // "login" or "signup"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: ""
  });

  useEffect(() => {
    if (user) {
      router.push("/dashboard");
    }
  }, [user, router]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (authMode === "signup") {
        await registerWithEmail(formData.email, formData.password, formData.name);
      } else {
        await loginWithEmail(formData.email, formData.password);
      }
    } catch (err) {
      setError(err.message.includes("auth/user-not-found") ? "Account not found." : "Invalid credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#09090b] text-white flex flex-col items-center justify-center p-6">
      {/* Background Decorative Blobs */}
      <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-purple-600/10 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-[120px]" />

      <main className="relative z-10 w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        
        {/* Left Side: Branding & Features */}
        <div className="hidden lg:flex flex-col space-y-12">
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-4"
            >
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-tr from-purple-600 to-blue-500 shadow-2xl shadow-purple-500/20">
                    <MessageCircle size={36} className="text-white" />
                </div>
                <h1 className="text-6xl font-black tracking-tighter">
                    Insta<span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Chat</span>
                </h1>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-6"
            >
                <h2 className="text-4xl font-bold leading-tight text-white">Connect, Call, and Share <br/> like never before.</h2>
                <div className="grid grid-cols-2 gap-6 pt-4">
                    <FeatureBox icon={<Video className="text-purple-400" />} title="HD Video" desc="Crystal clear calls." />
                    <FeatureBox icon={<Shield className="text-blue-400" />} title="Secure" desc="Encrypted chats." />
                </div>
            </motion.div>
        </div>

        {/* Right Side: Auth Form */}
        <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md mx-auto"
        >
            <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 md:p-10 shadow-2xl">
                
                {/* Mode Switcher */}
                <div className="flex bg-black/40 p-1.5 rounded-2xl mb-8 relative">
                    <motion.div 
                        className="absolute h-[calc(100%-12px)] w-[calc(50%-6px)] bg-white/10 rounded-xl"
                        animate={{ x: authMode === "login" ? 0 : "100%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                    <button 
                        onClick={() => setAuthMode("login")}
                        className={`flex-1 py-2 text-sm font-bold transition-all z-10 ${authMode === 'login' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        Login
                    </button>
                    <button 
                        onClick={() => setAuthMode("signup")}
                        className={`flex-1 py-2 text-sm font-bold transition-all z-10 ${authMode === 'signup' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        Signup
                    </button>
                </div>

                <div className="mb-8">
                    <h3 className="text-2xl font-black mb-1">{authMode === 'login' ? 'Welcome Back' : 'Get Started'}</h3>
                    <p className="text-zinc-500 text-sm">{authMode === 'login' ? 'Login to continue your conversations.' : 'Create an account to start chatting.'}</p>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                    <AnimatePresence mode="wait">
                        {authMode === "signup" && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="space-y-1.5"
                            >
                                <div className="relative">
                                    <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                                    <input 
                                        type="text" 
                                        placeholder="Full Name" 
                                        className="w-full rounded-2xl bg-white/[0.03] border border-white/5 py-4 pl-12 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-purple-500/50"
                                        value={formData.name}
                                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                                        required={authMode === "signup"}
                                    />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="space-y-1.5">
                        <div className="relative">
                            <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                            <input 
                                type="email" 
                                placeholder="Email Address" 
                                className="w-full rounded-2xl bg-white/[0.03] border border-white/5 py-4 pl-12 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-purple-500/50"
                                value={formData.email}
                                onChange={(e) => setFormData({...formData, email: e.target.value})}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="relative">
                            <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                            <input 
                                type="password" 
                                placeholder="Password" 
                                className="w-full rounded-2xl bg-white/[0.03] border border-white/5 py-4 pl-12 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-purple-500/50"
                                value={formData.password}
                                onChange={(e) => setFormData({...formData, password: e.target.value})}
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 p-4 rounded-xl border border-red-400/20">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}

                    <button 
                        type="submit"
                        disabled={loading}
                        className="w-full h-14 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl font-black text-sm transition-all shadow-xl shadow-purple-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : (
                            <> {authMode === 'login' ? 'Login' : 'Create Account'} <ArrowRight size={18} /> </>
                        )}
                    </button>
                </form>

                <div className="relative my-8">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/5"></span></div>
                    <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest text-zinc-500"><span className="bg-[#121214] px-4 backdrop-blur-xl">Or Continue With</span></div>
                </div>

                <button 
                    onClick={loginWithGoogle}
                    className="w-full h-14 bg-white text-black hover:bg-zinc-200 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-3 active:scale-95"
                >
                    <Image src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" width={20} height={20} />
                    Google Account
                </button>
            </div>
        </motion.div>
      </main>

      <footer className="mt-20 text-zinc-600 text-xs uppercase tracking-widest font-medium">
          © 2026 InstaChat. Built for the next generation.
      </footer>
    </div>
  );
}

function FeatureBox({ icon, title, desc }) {
    return (
        <div className="bg-white/[0.02] border border-white/5 p-5 rounded-3xl space-y-2">
            <div className="bg-white/5 w-10 h-10 rounded-xl flex items-center justify-center">{icon}</div>
            <h4 className="font-bold text-sm">{title}</h4>
            <p className="text-[10px] text-zinc-500">{desc}</p>
        </div>
    );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="flex flex-col items-center space-y-4 rounded-3xl border border-white/5 bg-white/[0.03] p-8 text-center backdrop-blur-md"
    >
      <div className="rounded-2xl bg-white/5 p-4">
        {icon}
      </div>
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="text-sm leading-relaxed text-zinc-500">
        {desc}
      </p>
    </motion.div>
  );
}
