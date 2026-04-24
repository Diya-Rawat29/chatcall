"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import { getFirestore, doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { app } from "@/lib/firebase";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const createUserProfile = async (user) => {
    // We use setDoc with merge: true to avoid "document not found" errors
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      name: user.displayName || "New User",
      email: user.email,
      photoURL: user.photoURL || `https://ui-avatars.com/api/?name=${user.email}&background=random`,
      lastSeen: serverTimestamp(),
      status: "online"
    }, { merge: true });
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      await createUserProfile(result.user);
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  };

  const registerWithEmail = async (email, password, name) => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName: name });
      await createUserProfile(result.user);
    } catch (error) {
      console.error("Registration failed:", error);
      throw error;
    }
  };

  const loginWithEmail = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  };

  const logout = () => signOut(auth);

  useEffect(() => {
    let unsubscribeFirestore = () => {};
    
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUser(user);
      unsubscribeFirestore(); // Clean up previous listener
      
      if (user) {
        unsubscribeFirestore = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
          if (docSnap.exists()) {
            setProfileData(docSnap.data());
          }
          setLoading(false);
        });
      } else {
        setProfileData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeFirestore();
    };
  }, [auth, db]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      profileData, 
      loading, 
      loginWithGoogle, 
      registerWithEmail, 
      loginWithEmail, 
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
