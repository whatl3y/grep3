import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LandingPage } from "./LandingPage";
import { LoadingPage } from "./LoadingPage";
import { PortfolioPage } from "./PortfolioPage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/loading/:sessionId" element={<LoadingPage />} />
        <Route path="/portfolio/:sessionId" element={<PortfolioPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
