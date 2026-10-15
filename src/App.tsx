import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { useAuth } from "@/hooks/useAuth"
import Home from './pages/Home'
import Login from "./pages/Login"
import NotFound from "./pages/NotFound"
import CicliPage from "./pages/CicliPage"
import CicloEditorPage from "./pages/CicloEditorPage"
import BandelleTPage from "./pages/BandelleTPage"
import BandelleVenetaPage from "./pages/BandelleVenetaPage"
import PreventiviPage from "./pages/PreventiviPage"
import PreventivoEditorPage from "./pages/PreventivoEditorPage"
import OffertePage from "./pages/OffertePage"
import OffertaEditorPage from "./pages/OffertaEditorPage"
import ImportaStorico from "./pages/ImportaStorico"
import FeedbackAdminPage from "./pages/FeedbackAdminPage"

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

// A data router allows robust navigation blocking for unsaved quote drafts,
// including internal links and the browser Back/Forward buttons.
const router = createBrowserRouter([
  {path:"/", element:<ProtectedRoute><Home /></ProtectedRoute>},
  {path:"/login", element:<Login />},
  {path:"/cicli", element:<ProtectedRoute><CicliPage /></ProtectedRoute>},
  {path:"/cicli/new", element:<ProtectedRoute><CicloEditorPage /></ProtectedRoute>},
  {path:"/cicli/:id", element:<ProtectedRoute><CicloEditorPage /></ProtectedRoute>},
  {path:"/bandelle-t", element:<ProtectedRoute><BandelleTPage /></ProtectedRoute>},
  {path:"/bandelle-veneta", element:<ProtectedRoute><BandelleVenetaPage /></ProtectedRoute>},
  {path:"/preventivi", element:<ProtectedRoute><PreventiviPage /></ProtectedRoute>},
  {path:"/preventivi/new", element:<ProtectedRoute><PreventivoEditorPage /></ProtectedRoute>},
  {path:"/preventivi/:id", element:<ProtectedRoute><PreventivoEditorPage /></ProtectedRoute>},
  {path:"/offerte", element:<ProtectedRoute><OffertePage /></ProtectedRoute>},
  {path:"/offerte/new", element:<ProtectedRoute><OffertaEditorPage /></ProtectedRoute>},
  {path:"/offerte/:id", element:<ProtectedRoute><OffertaEditorPage /></ProtectedRoute>},
  {path:"/importa-storico", element:<ProtectedRoute><ImportaStorico /></ProtectedRoute>},
  {path:"/segnalazioni", element:<ProtectedRoute><FeedbackAdminPage /></ProtectedRoute>},
  {path:"*", element:<NotFound />},
]);

export default function App() {
  return <RouterProvider router={router}/>;
}
