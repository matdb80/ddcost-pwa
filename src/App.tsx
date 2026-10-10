import { Routes, Route, Navigate } from 'react-router'
import { useAuth } from "@/hooks/useAuth"
import Home from './pages/Home'
import Login from "./pages/Login"
import NotFound from "./pages/NotFound"
import CicliPage from "./pages/CicliPage"
import BandelleTPage from "./pages/BandelleTPage"
import BandelleVenetaPage from "./pages/BandelleVenetaPage"
import PreventiviPage from "./pages/PreventiviPage"
import OffertePage from "./pages/OffertePage"

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth({ redirectOnUnauthenticated: false });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!user) {
    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
    return <Navigate to={`/login?redirect_to=${returnUrl}`} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/login" element={<Login />} />
      <Route path="/cicli" element={<ProtectedRoute><CicliPage /></ProtectedRoute>} />
      <Route path="/bandelle-t" element={<ProtectedRoute><BandelleTPage /></ProtectedRoute>} />
      <Route path="/bandelle-veneta" element={<ProtectedRoute><BandelleVenetaPage /></ProtectedRoute>} />
      <Route path="/preventivi" element={<ProtectedRoute><PreventiviPage /></ProtectedRoute>} />
      <Route path="/offerte" element={<ProtectedRoute><OffertePage /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
