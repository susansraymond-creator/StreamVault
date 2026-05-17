import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Video } from "../types";
import { DEMO_VIDEOS } from "../data/demoData";
import { db, isFirebaseAvailable } from "../firebase/config";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";

interface VideoContextType {
  videos: Video[];
  isLoading: boolean;
  addVideo: (video: Omit<Video, "id" | "views" | "createdAt">) => void;
  updateVideo: (id: string, updates: Partial<Video>) => void;
  deleteVideo: (id: string) => void;
  incrementViews: (id: string) => void;
  getVideoById: (id: string) => Video | undefined;
  getVideosByCategory: (category: string) => Video[];
  getTrendingVideos: () => Video[];
  getFeaturedVideo: () => Video | undefined;
  searchVideos: (query: string) => Video[];
}

const VideoContext = createContext<VideoContextType>({} as VideoContextType);

export const useVideos = () => useContext(VideoContext);

const STORAGE_KEY = "streamvault_videos";

// Helper: load from localStorage or demo data
function loadLocalVideos(): Video[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // ignore
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEMO_VIDEOS));
  return DEMO_VIDEOS;
}

export function VideoProvider({ children }: { children: ReactNode }) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let didLoad = false;

    // SAFETY: Always load local data within 2 seconds max
    const safetyTimer = setTimeout(() => {
      if (!didLoad) {
        didLoad = true;
        const localVids = loadLocalVideos();
        setVideos(localVids);
        setIsLoading(false);
        console.warn("Safety timer: loaded local/demo videos (Firebase was too slow or unavailable)");
      }
    }, 2000);

    async function fetchVideos() {
      // Try Firebase first
      if (isFirebaseAvailable && db) {
        try {
          const querySnapshot = await getDocs(collection(db, "videos"));
          if (didLoad) return; // Safety timer already fired

          if (!querySnapshot.empty) {
            const fetchedVideos: Video[] = [];
            querySnapshot.forEach((docSnap) => {
              fetchedVideos.push(docSnap.data() as Video);
            });
            fetchedVideos.sort((a, b) => b.createdAt - a.createdAt);
            didLoad = true;
            clearTimeout(safetyTimer);
            setVideos(fetchedVideos);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(fetchedVideos));
            setIsLoading(false);
            return;
          } else {
            // Firestore empty — try populating with demo data (non-blocking)
            console.warn("Firestore videos collection empty, using demo data...");
            didLoad = true;
            clearTimeout(safetyTimer);
            setVideos(DEMO_VIDEOS);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(DEMO_VIDEOS));
            setIsLoading(false);

            // Background populate Firestore (won't block UI)
            try {
              for (const v of DEMO_VIDEOS) {
                await setDoc(doc(db, "videos", v.id), v);
              }
              console.log("Demo videos saved to Firestore in background");
            } catch (bgErr) {
              console.warn("Background Firestore populate failed (not critical)", bgErr);
            }
            return;
          }
        } catch (err) {
          console.warn("Firestore fetch error, falling back to local data", err);
        }
      }

      // Local fallback
      if (!didLoad) {
        didLoad = true;
        clearTimeout(safetyTimer);
        const localVids = loadLocalVideos();
        setVideos(localVids);
        setIsLoading(false);
      }
    }

    fetchVideos();

    return () => clearTimeout(safetyTimer);
  }, []);

  const saveLocal = (updated: Video[]) => {
    setVideos(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const addVideo = async (video: Omit<Video, "id" | "views" | "createdAt">) => {
    const newVideo: Video = {
      ...video,
      id: `v${Date.now()}`,
      views: 0,
      createdAt: Date.now(),
    };
    const updated = [newVideo, ...videos];
    saveLocal(updated);

    if (isFirebaseAvailable && db) {
      try {
        await setDoc(doc(db, "videos", newVideo.id), newVideo);
      } catch (err) {
        console.warn("Firestore add video error", err);
      }
    }
  };

  const updateVideo = async (id: string, updates: Partial<Video>) => {
    const updatedList = videos.map((v) => (v.id === id ? { ...v, ...updates } : v));
    saveLocal(updatedList);

    if (isFirebaseAvailable && db) {
      try {
        await setDoc(doc(db, "videos", id), updates, { merge: true });
      } catch (err) {
        console.warn("Firestore update video error", err);
      }
    }
  };

  const deleteVideo = async (id: string) => {
    const updatedList = videos.filter((v) => v.id !== id);
    saveLocal(updatedList);

    if (isFirebaseAvailable && db) {
      try {
        await deleteDoc(doc(db, "videos", id));
      } catch (err) {
        console.warn("Firestore delete video error", err);
      }
    }
  };

  const incrementViews = async (id: string) => {
    const target = videos.find((v) => v.id === id);
    if (!target) return;

    const newViews = target.views + 1;
    const updatedList = videos.map((v) => (v.id === id ? { ...v, views: newViews } : v));
    saveLocal(updatedList);

    if (isFirebaseAvailable && db) {
      try {
        await setDoc(doc(db, "videos", id), { views: newViews }, { merge: true });
      } catch (err) {
        console.warn("Firestore increment views error", err);
      }
    }
  };

  const getVideoById = (id: string) => videos.find((v) => v.id === id);

  const getVideosByCategory = (category: string) => {
    if (category === "all" || category === "All") return videos;
    return videos.filter(
      (v) =>
        v.category.toLowerCase() === category.toLowerCase() ||
        v.genre.some((g) => g.toLowerCase() === category.toLowerCase())
    );
  };

  const getTrendingVideos = () =>
    videos.filter((v) => v.isTrending).sort((a, b) => b.views - a.views);

  const getFeaturedVideo = () =>
    videos.find((v) => v.isFeatured) || videos[0];

  const searchVideos = (query: string) => {
    const q = query.toLowerCase();
    return videos.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q) ||
        v.genre.some((g) => g.toLowerCase().includes(q))
    );
  };

  return (
    <VideoContext.Provider
      value={{
        videos,
        isLoading,
        addVideo,
        updateVideo,
        deleteVideo,
        incrementViews,
        getVideoById,
        getVideosByCategory,
        getTrendingVideos,
        getFeaturedVideo,
        searchVideos,
      }}
    >
      {children}
    </VideoContext.Provider>
  );
}
