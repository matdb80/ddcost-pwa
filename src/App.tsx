import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import Login from "./pages/Login"
import NotFound from "./pages/NotFound"
import CicliPage from "./pages/CicliPage"
import BandelleTPage from "./pages/BandelleTPage"
import BandelleVenetaPage from "./pages/BandelleVenetaPage"
import PreventiviPage from "./pages/PreventiviPage"
import OffertePage from "./pages/OffertePage"

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/cicli" element={<CicliPage />} />
      <Route path="/bandelle-t" element={<BandelleTPage />} />
      <Route path="/bandelle-veneta" element={<BandelleVenetaPage />} />
      <Route path="/preventivi" element={<PreventiviPage />} />
      <Route path="/offerte" element={<OffertePage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
