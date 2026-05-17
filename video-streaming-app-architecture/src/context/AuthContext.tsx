import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User } from "../types";
import { DEMO_ADMIN, DEMO_USER } from "../data/demoData";
import { auth, db, isFirebaseAvailable } from "../firebase/config";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

interface AuthContextType {
  currentUser: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateUserPlan: (plan: "free" | "pro") => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let didResolve = false;

    // SAFETY: Always finish loading within 3 seconds
    const safetyTimer = setTimeout(() => {
      if (!didResolve) {
        didResolve = true;
        // Check localStorage
        const savedUser = localStorage.getItem("streamvault_user");
        if (savedUser) {
          try {
            setCurrentUser(JSON.parse(savedUser));
          } catch {
            // ignore
          }
        }
        setIsLoading(false);
        console.warn("Auth safety timer: finished loading (Firebase was too slow or unavailable)");
      }
    }, 3000);

    if (!isFirebaseAvailable || !auth) {
      // No Firebase — use localStorage only
      const savedUser = localStorage.getItem("streamvault_user");
      if (savedUser) {
        try {
          setCurrentUser(JSON.parse(savedUser));
        } catch {
          localStorage.removeItem("streamvault_user");
        }
      }
      didResolve = true;
      clearTimeout(safetyTimer);
      setIsLoading(false);
      return () => clearTimeout(safetyTimer);
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (didResolve && !firebaseUser) return; // Safety already resolved, don't reset

      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as User;
            setCurrentUser(userData);
            localStorage.setItem("streamvault_user", JSON.stringify(userData));
          } else {
            const isAdm = firebaseUser.email === "admin@streamvault.com";
            const defaultUser: User = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || "",
              displayName: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "User",
              role: isAdm ? "admin" : "user",
              plan: isAdm ? "pro" : "free",
              watchHistory: [],
              createdAt: Date.now(),
            };
            try {
              await setDoc(doc(db, "users", firebaseUser.uid), defaultUser);
            } catch {
              // ignore write error
            }
            setCurrentUser(defaultUser);
            localStorage.setItem("streamvault_user", JSON.stringify(defaultUser));
          }
        } catch {
          const isAdm = firebaseUser.email === "admin@streamvault.com";
          const fallbackUser: User = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || "",
            displayName: firebaseUser.email?.split("@")[0] || "User",
            role: isAdm ? "admin" : "user",
            plan: isAdm ? "pro" : "free",
            watchHistory: [],
            createdAt: Date.now(),
          };
          setCurrentUser(fallbackUser);
          localStorage.setItem("streamvault_user", JSON.stringify(fallbackUser));
        }
      } else {
        // Not signed in via Firebase — check localStorage
        if (!didResolve) {
          const savedUser = localStorage.getItem("streamvault_user");
          if (savedUser) {
            try {
              setCurrentUser(JSON.parse(savedUser));
            } catch {
              setCurrentUser(null);
            }
          } else {
            setCurrentUser(null);
          }
        }
      }

      if (!didResolve) {
        didResolve = true;
        clearTimeout(safetyTimer);
        setIsLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);

    // Try Firebase auth first
    if (isFirebaseAvailable && auth) {
      try {
        await signInWithEmailAndPassword(auth, email, password);
        setIsLoading(false);
        return { success: true };
      } catch {
        // Firebase login failed — try auto-create for demo accounts
        if (
          (email === "admin@streamvault.com" && password === "admin123") ||
          (email === "user@streamvault.com" && password === "user123")
        ) {
          try {
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            const isAdm = email === "admin@streamvault.com";
            const newUser: User = {
              uid: userCred.user.uid,
              email,
              displayName: isAdm ? "Admin User" : "Demo User",
              role: isAdm ? "admin" : "user",
              plan: isAdm ? "pro" : "free",
              watchHistory: [],
              createdAt: Date.now(),
            };
            try {
              await setDoc(doc(db, "users", userCred.user.uid), newUser);
            } catch {
              // ignore
            }
            setCurrentUser(newUser);
            localStorage.setItem("streamvault_user", JSON.stringify(newUser));
            setIsLoading(false);
            return { success: true };
          } catch {
            // auto-create also failed, use local fallback below
          }
        }
      }
    }

    // Local demo fallback
    await new Promise((r) => setTimeout(r, 500));

    if (email === "admin@streamvault.com" && password === "admin123") {
      setCurrentUser(DEMO_ADMIN);
      localStorage.setItem("streamvault_user", JSON.stringify(DEMO_ADMIN));
      setIsLoading(false);
      return { success: true };
    } else if (email === "user@streamvault.com" && password === "user123") {
      setCurrentUser(DEMO_USER);
      localStorage.setItem("streamvault_user", JSON.stringify(DEMO_USER));
      setIsLoading(false);
      return { success: true };
    } else if (email && password.length >= 6) {
      const newUser: User = {
        uid: `user_${Date.now()}`,
        email,
        displayName: email.split("@")[0],
        role: "user",
        plan: "free",
        watchHistory: [],
        createdAt: Date.now(),
      };
      setCurrentUser(newUser);
      localStorage.setItem("streamvault_user", JSON.stringify(newUser));
      setIsLoading(false);
      return { success: true };
    }

    setIsLoading(false);
    return { success: false, error: "ইমেইল বা পাসওয়ার্ড ভুল হয়েছে" };
  };

  const register = async (email: string, password: string, name: string) => {
    setIsLoading(true);

    if (!email || !password || !name) {
      setIsLoading(false);
      return { success: false, error: "সব তথ্য পূরণ করুন" };
    }
    if (password.length < 6) {
      setIsLoading(false);
      return { success: false, error: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে" };
    }

    // Try Firebase registration
    if (isFirebaseAvailable && auth) {
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const newUser: User = {
          uid: userCredential.user.uid,
          email,
          displayName: name,
          role: "user",
          plan: "free",
          watchHistory: [],
          createdAt: Date.now(),
        };
        try {
          await setDoc(doc(db, "users", userCredential.user.uid), newUser);
        } catch {
          // ignore
        }
        setCurrentUser(newUser);
        localStorage.setItem("streamvault_user", JSON.stringify(newUser));
        setIsLoading(false);
        return { success: true };
      } catch (error: any) {
        setIsLoading(false);
        const msg = error?.code === "auth/email-already-in-use"
          ? "এই ইমেইলটি আগে থেকেই ব্যবহৃত হয়েছে"
          : error?.message || "রেজিস্ট্রেশন ব্যর্থ হয়েছে";
        return { success: false, error: msg };
      }
    }

    // Local fallback
    await new Promise((r) => setTimeout(r, 500));
    const newUser: User = {
      uid: `user_${Date.now()}`,
      email,
      displayName: name,
      role: "user",
      plan: "free",
      watchHistory: [],
      createdAt: Date.now(),
    };
    setCurrentUser(newUser);
    localStorage.setItem("streamvault_user", JSON.stringify(newUser));
    setIsLoading(false);
    return { success: true };
  };

  const logout = async () => {
    if (isFirebaseAvailable && auth) {
      try {
        await firebaseSignOut(auth);
      } catch {
        // ignore
      }
    }
    setCurrentUser(null);
    localStorage.removeItem("streamvault_user");
  };

  const updateUserPlan = async (plan: "free" | "pro") => {
    if (!currentUser) return;
    const updated = { ...currentUser, plan };
    setCurrentUser(updated);
    localStorage.setItem("streamvault_user", JSON.stringify(updated));

    if (isFirebaseAvailable && db && !currentUser.uid.startsWith("user_")) {
      try {
        await setDoc(doc(db, "users", currentUser.uid), updated, { merge: true });
      } catch {
        // ignore
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isLoading,
        isAdmin: currentUser?.role === "admin",
        login,
        register,
        logout,
        updateUserPlan,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
