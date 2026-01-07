import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './components/HomePage';
import { PoolPage } from './components/PoolPage';
import { V4PoolPage } from './components/V4PoolPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/v4/:name" element={<V4PoolPage />} />
          <Route path="/:address" element={<PoolPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
